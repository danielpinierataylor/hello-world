// Import a Game Locker inventory export (CSV) into `listings` and match each row to TCGplayer / Scryfall.
// Usage: npx tsx scripts/import-gl.ts inventory-export.csv [shopify-inventory-export.csv ...]
// GL is the source of truth for condition, sell price and stock. Optional Shopify inventory exports only
// mark which listings are also on Shopify (GL only pushes Near Mint to Shopify).
import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { sql } from "./lib/db";
import { scoreCandidate, pickSubType, setSimilarity, type Candidate, type ParsedTitle } from "./lib/match";

const GAMES: Record<string, string> = {
  "Magic: The Gathering": "mtg",
  Pokemon: "pokemon",
  "Pokemon Japan": "pokemon-jp",
  "One Piece": "onepiece",
  "Riftbound League of Legends": "riftbound",
};

const CONDITIONS: Record<string, string> = {
  "Near Mint": "NM", "Lightly Played": "LP", "Moderately Played": "MP", "Heavily Played": "HP", Damaged: "DMG",
};
const conditionCode = (c: string) => CONDITIONS[c] ?? (/^(PSA|CGC|BGS)\b/.test(c) ? "GRADED" : c === "Factory Sealed (unopened)" ? "SEALED" : "OTHER");

const num = (v: string | undefined) => (v == null || v.trim() === "" ? null : Number(v));

type Row = Record<string, string>;

async function main() {
  const [glFile, ...shopifyFiles] = process.argv.slice(2);
  if (!glFile) throw new Error("usage: import-gl.ts gl-export.csv [shopify-export.csv ...]");
  const rows: Row[] = parse(readFileSync(glFile), { columns: true, skip_empty_lines: true });

  // Shopify files: inventory exports (column "SKU") or product exports (columns "Variant SKU", "Handle", "Image Src").
  // GL pushes Near Mint to Shopify with SKU "<GL card id>_<location id>".
  const onShopify = new Set<string>();
  const handles = new Map<string, string>();
  const images = new Map<string, string>();
  for (const f of shopifyFiles) {
    const imageByHandle = new Map<string, string>();
    for (const r of parse(readFileSync(f), { columns: true, skip_empty_lines: true, relax_quotes: true }) as Row[]) {
      if (r.Handle && r["Image Src"] && !imageByHandle.has(r.Handle)) imageByHandle.set(r.Handle, r["Image Src"]);
      const sku = r.SKU ?? r["Variant SKU"];
      if (!sku) continue;
      const id = sku.split("_")[0];
      onShopify.add(id);
      if (r.Handle) handles.set(id, r.Handle);
      const img = imageByHandle.get(r.Handle);
      if (img && r["Variant SKU"]) images.set(id, img);
    }
  }

  const groups = await sql`SELECT group_id, game, name FROM tcg_groups`;
  const exact = new Map<string, number[]>();
  for (const g of groups) {
    const k = `${g.game}|${g.name.toLowerCase()}`;
    exact.set(k, [...(exact.get(k) ?? []), g.group_id]);
  }
  const fuzzy = new Map<string, number[]>();
  function resolveGroups(game: string, set: string): number[] {
    const hit = exact.get(`${game}|${set.toLowerCase()}`);
    if (hit) return hit;
    const k = `${game}|${set}`;
    if (!fuzzy.has(k)) {
      const scored = groups.filter((g) => g.game === game).map((g) => ({ id: g.group_id as number, s: setSimilarity(set, g.name) })).filter((x) => x.s >= 0.6);
      const top = Math.max(0, ...scored.map((x) => x.s));
      fuzzy.set(k, scored.filter((x) => x.s === top).map((x) => x.id));
    }
    return fuzzy.get(k)!;
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

  const stats: Record<string, number> = {};
  const bump = (k: string) => (stats[k] = (stats[k] ?? 0) + 1);
  const out: Record<string, unknown>[] = [];
  for (const r of rows) {
    const game = GAMES[r.Game] ?? null;
    const variant = r.Variant && r.Variant !== "Normal" ? r.Variant : null;
    const p: ParsedTitle = { name: r["Card Name"], number: r["Card Number"] || null, set: r["Set Name"], finish: variant };
    let best: { c: Candidate; s: number } | null = null;
    if (game) {
      for (const gid of resolveGroups(game, p.set)) {
        for (const c of await candidates(gid)) {
          const s = scoreCandidate(p, c);
          if (!best || s > best.s) best = { c, s };
        }
      }
    }
    const matched = best && best.s >= 60 ? best : null;
    bump(matched ? `matched:${game}` : `unmatched:${game ?? r.Game}`);
    const title = `${p.name}${p.number ? " " + p.number : ""} (${p.set})${variant ? " - " + variant : ""}`;
    out.push({
      sku: r["Card Id"],
      gl_card_id: r["Card Id"],
      gl_catalogue_id: r["Catalogue Id"] || null,
      handle: handles.get(r["Card Id"]) ?? r["Card Id"],
      shopify_image: images.get(r["Card Id"]) ?? null,
      title,
      game,
      card_name: p.name,
      number: p.number,
      group_name: p.set,
      finish: r.Variant || "Normal",
      rarity: r.Rarity || null,
      condition: conditionCode(r.Condition),
      condition_label: r.Condition,
      available: Math.max(0, Math.trunc(num(r.Available) ?? 0)),
      price_aud: num(r["Sell Price"]),
      gl_buy_cash_aud: num(r["Buy Cash Price"]),
      gl_buy_credit_aud: num(r["Buy Credit Price"]),
      tcg_product_id: matched?.c.product_id ?? null,
      sub_type: matched ? pickSubType(r.Variant === "Normal" ? null : r.Variant, matched.c.subTypes) : null,
      match_method: matched ? "gl:set+number" : null,
      on_shopify: onShopify.has(r["Card Id"]),
    });
  }

  await sql.begin(async (tx) => {
    await tx`TRUNCATE listings`;
    for (let i = 0; i < out.length; i += 2000) await tx`INSERT INTO listings ${tx(out.slice(i, i + 2000))}`;
    await tx`UPDATE listings l SET scryfall_id = c.id FROM mtg_cards c
      WHERE l.game = 'mtg' AND l.tcg_product_id IS NOT NULL
        AND (c.tcgplayer_id = l.tcg_product_id OR c.tcgplayer_etched_id = l.tcg_product_id)`;
    await tx`UPDATE listings l SET scryfall_id = c.id FROM tcg_products p, tcg_products sib, mtg_cards c
      WHERE l.game = 'mtg' AND l.scryfall_id IS NULL AND p.product_id = l.tcg_product_id
        AND sib.group_id = p.group_id AND sib.number = p.number AND sib.product_id <> p.product_id
        AND c.tcgplayer_id = sib.product_id`;
  });

  console.log(stats);
  const [s] = await sql`SELECT
      count(*) FILTER (WHERE available > 0) AS instock_rows,
      sum(available) AS units,
      count(*) FILTER (WHERE available > 0 AND tcg_product_id IS NULL) AS instock_unmatched,
      count(*) FILTER (WHERE available > 0 AND game = 'mtg' AND scryfall_id IS NULL) AS instock_mtg_unlinked
    FROM listings`;
  console.log(s);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
