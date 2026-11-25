// Import store inventory from Shopify inventory export CSV(s) and match each listing to TCGplayer / Scryfall.
// Usage: npx tsx scripts/import-inventory.ts export1.csv [export2.csv ...]
// (Later this is replaced by a live Shopify Admin API sync; the matching logic stays the same.)
import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { sql } from "./lib/db";
import { parseTitle, scoreCandidate, pickSubType, setSimilarity, type Candidate } from "../src/lib/import/match";

const GL_SUFFIX = /^[0-9a-f]{32}_[0-9a-f-]{36}$/;

async function main() {
  const files = process.argv.slice(2);
  const rows: any[] = files.flatMap((f) => parse(readFileSync(f), { columns: true, skip_empty_lines: true }));
  const gl = rows.filter((r) => GL_SUFFIX.test(r.SKU));
  console.log("rows", rows.length, "game locker listings", gl.length, "(legacy/other ignored:", rows.length - gl.length, ")");

  // Load groups -> candidates lazily
  const groups = await sql`SELECT group_id, game, name FROM tcg_groups`;
  const byName = new Map<string, { group_id: number; game: string }[]>();
  for (const g of groups) {
    const k = g.name.toLowerCase();
    byName.set(k, [...(byName.get(k) ?? []), { group_id: g.group_id, game: g.game }]);
  }
  const fuzzy = new Map<string, { group_id: number; game: string }[]>();
  function resolveGroups(set: string) {
    const exact = byName.get(set.toLowerCase());
    if (exact) return exact;
    if (!fuzzy.has(set)) {
      const scored = groups.map((g) => ({ g, s: setSimilarity(set, g.name) })).filter((x) => x.s >= 0.6);
      const top = Math.max(0, ...scored.map((x) => x.s));
      fuzzy.set(set, scored.filter((x) => x.s === top).map((x) => ({ group_id: x.g.group_id, game: x.g.game })));
    }
    return fuzzy.get(set)!;
  }
  const cache = new Map<number, Candidate[]>();
  async function candidates(groupId: number): Promise<Candidate[]> {
    if (!cache.has(groupId)) {
      const ps = await sql`SELECT p.product_id, p.name, p.number,
          coalesce(array_agg(pr.sub_type) FILTER (WHERE pr.sub_type IS NOT NULL), '{}') AS sub_types
        FROM tcg_products p LEFT JOIN tcg_prices pr USING (product_id)
        WHERE p.group_id = ${groupId} GROUP BY p.product_id`;
      cache.set(groupId, ps.map((p) => ({ product_id: p.product_id, name: p.name, number: p.number, subTypes: p.sub_types })));
    }
    return cache.get(groupId)!;
  }

  const out: any[] = [];
  const stats: Record<string, number> = {};
  const bump = (k: string) => (stats[k] = (stats[k] ?? 0) + 1);
  for (const r of gl) {
    const p = parseTitle(r.Title);
    const base = {
      sku: r.SKU, handle: r.Handle, title: r.Title,
      condition: (r["Option1 Name"] === "Condition" && r["Option1 Value"]) || "NM",
      available: Math.max(0, parseInt(r["Available (not editable)"] || "0", 10) || 0),
      card_name: p?.name ?? null, number: p?.number ?? null, group_name: p?.set ?? null, finish: p?.finish ?? null,
      game: null as string | null, sub_type: null as string | null, tcg_product_id: null as number | null, match_method: null as string | null,
    };
    const gs = p ? resolveGroups(p.set) : [];
    let best: { c: Candidate; s: number; game: string } | null = null;
    for (const g of gs) {
      for (const c of await candidates(g.group_id)) {
        const s = scoreCandidate(p!, c);
        if (!best || s > best.s) best = { c, s, game: g.game };
      }
    }
    if (best && best.s >= 60) {
      base.game = best.game;
      base.tcg_product_id = best.c.product_id;
      base.sub_type = pickSubType(p!.finish, best.c.subTypes);
      base.match_method = "tcg:set+number";
      bump("matched:" + best.game);
    } else if (gs.length) {
      base.game = gs[0].game; base.match_method = "set-only"; bump("set-only");
    } else bump("unmatched");
    out.push(base);
  }

  // dedupe by sku (exports can overlap)
  const dedup = [...new Map(out.map((o) => [o.sku, o])).values()];
  await sql`TRUNCATE listings`;
  for (let i = 0; i < dedup.length; i += 2000) await sql`INSERT INTO listings ${sql(dedup.slice(i, i + 2000))}`;

  // Link Magic listings to Scryfall printings via TCGplayer id (etched foils use tcgplayer_etched_id)
  await sql`UPDATE listings l SET scryfall_id = c.id FROM mtg_cards c
    WHERE l.game = 'mtg' AND l.tcg_product_id IS NOT NULL
      AND (c.tcgplayer_id = l.tcg_product_id OR c.tcgplayer_etched_id = l.tcg_product_id)`;
  // Fallback: special-foil products (Surge/Ripple/Rainbow...) are separate TCGplayer products but the same
  // Scryfall printing (foil finish) -> link via the sibling product with the same group + collector number.
  await sql`UPDATE listings l SET scryfall_id = c.id FROM tcg_products p, tcg_products sib, mtg_cards c
    WHERE l.game = 'mtg' AND l.scryfall_id IS NULL AND p.product_id = l.tcg_product_id
      AND sib.group_id = p.group_id AND sib.number = p.number AND sib.product_id <> p.product_id
      AND c.tcgplayer_id = sib.product_id`;
  console.log(stats);
  const [s] = await sql`SELECT count(*) FILTER (WHERE game='mtg') mtg, count(scryfall_id) linked,
     count(*) FILTER (WHERE available>0 AND tcg_product_id IS NULL) instock_unmatched,
     count(*) FILTER (WHERE available>0) instock FROM listings`;
  console.log(s);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
