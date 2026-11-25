// Game Locker inventory export -> `listings`.
// GL is the source of truth for condition, sell price and stock. Matching each row to a TCGplayer product
// (and, for Magic, a Scryfall printing) is slow the first time, so matches are reused by GL catalogue id.
import { parse } from "csv-parse/sync";
import type { Sql } from "postgres";
import { scoreCandidate, pickSubType, setSimilarity, type Candidate, type ParsedTitle } from "./match";

export const GL_GAMES: Record<string, string> = {
  "Magic: The Gathering": "mtg",
  Pokemon: "pokemon",
  "Pokemon Japan": "pokemon-jp",
  "One Piece": "onepiece",
  "Riftbound League of Legends": "riftbound",
};

const CONDITIONS: Record<string, string> = {
  "Near Mint": "NM", "Lightly Played": "LP", "Moderately Played": "MP", "Heavily Played": "HP", Damaged: "DMG",
};
export const conditionCode = (c: string) =>
  CONDITIONS[c] ?? (/^(PSA|CGC|BGS)\b/.test(c) ? "GRADED" : c === "Factory Sealed (unopened)" ? "SEALED" : "OTHER");

const REQUIRED = ["Card Id", "Catalogue Id", "Game", "Set Name", "Card Name", "Card Number", "Variant", "Condition", "Sell Price", "Available"];

type Row = Record<string, string>;
const num = (v: string | undefined) => (v == null || v.trim() === "" ? null : Number(v));

export type ImportStats = {
  rows: number; inStockRows: number; units: number; matched: number; reusedMatches: number; newlyMatched: number;
  unmatched: number; unmatchedInStock: number; stockValueAud: number; byGame: Record<string, number>;
};

/** Parse + validate a GL export. Throws a readable error if it isn't one. */
export function parseGlCsv(csv: string | Buffer): Row[] {
  const rows: Row[] = parse(csv, { columns: true, skip_empty_lines: true, bom: true });
  if (!rows.length) throw new Error("The file is empty.");
  const missing = REQUIRED.filter((c) => !(c in rows[0]));
  if (missing.length) throw new Error(`This doesn't look like a Game Locker inventory export (missing: ${missing.join(", ")}).`);
  return rows;
}

export async function importGl(sql: Sql, rows: Row[], shopify?: { onShopify: Set<string>; handles: Map<string, string>; images: Map<string, string> }): Promise<ImportStats> {
  // Reuse previous matches (keyed by GL catalogue id) and Shopify info (keyed by GL card id).
  const prevMatch = new Map<string, { tcg_product_id: number; game: string }>();
  const prevShop = new Map<string, { handle: string; on_shopify: boolean; shopify_image: string | null }>();
  for (const r of await sql`SELECT DISTINCT ON (gl_catalogue_id) gl_catalogue_id, tcg_product_id, game FROM listings
      WHERE gl_catalogue_id IS NOT NULL AND tcg_product_id IS NOT NULL`) prevMatch.set(r.gl_catalogue_id, r as never);
  for (const r of await sql`SELECT gl_card_id, handle, on_shopify, shopify_image FROM listings WHERE on_shopify`) prevShop.set(r.gl_card_id, r as never);

  const groups = await sql`SELECT group_id, game, name FROM tcg_groups`;
  const exact = new Map<string, number[]>();
  for (const g of groups) {
    const k = `${g.game}|${g.name.toLowerCase()}`;
    exact.set(k, [...(exact.get(k) ?? []), g.group_id]);
  }
  const fuzzy = new Map<string, number[]>();
  const resolveGroups = (game: string, set: string): number[] => {
    const hit = exact.get(`${game}|${set.toLowerCase()}`);
    if (hit) return hit;
    const k = `${game}|${set}`;
    if (!fuzzy.has(k)) {
      const scored = groups.filter((g) => g.game === game).map((g) => ({ id: g.group_id as number, s: setSimilarity(set, g.name) })).filter((x) => x.s >= 0.6);
      const top = Math.max(0, ...scored.map((x) => x.s));
      fuzzy.set(k, scored.filter((x) => x.s === top).map((x) => x.id));
    }
    return fuzzy.get(k)!;
  };
  const cache = new Map<number, Candidate[]>();
  const candidates = async (groupId: number): Promise<Candidate[]> => {
    if (!cache.has(groupId)) {
      const ps = await sql`SELECT p.product_id, p.name, p.number,
          coalesce(array_agg(pr.sub_type) FILTER (WHERE pr.sub_type IS NOT NULL), '{}') AS sub_types
        FROM tcg_products p LEFT JOIN tcg_prices pr USING (product_id)
        WHERE p.group_id = ${groupId} GROUP BY p.product_id`;
      cache.set(groupId, ps.map((p) => ({ product_id: p.product_id, name: p.name, number: p.number, subTypes: p.sub_types })));
    }
    return cache.get(groupId)!;
  };
  const subTypesOf = new Map<number, string[]>();
  for (const r of await sql`SELECT product_id, array_agg(sub_type) AS s FROM tcg_prices GROUP BY 1`) subTypesOf.set(r.product_id, r.s);

  const stats: ImportStats = { rows: rows.length, inStockRows: 0, units: 0, matched: 0, reusedMatches: 0, newlyMatched: 0, unmatched: 0, unmatchedInStock: 0, stockValueAud: 0, byGame: {} };
  const out: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  for (const r of rows) {
    const id = r["Card Id"];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const game = GL_GAMES[r.Game] ?? null;
    const variant = r.Variant && r.Variant !== "Normal" ? r.Variant : null;
    const p: ParsedTitle = { name: r["Card Name"], number: r["Card Number"] || null, set: r["Set Name"], finish: variant };
    const available = Math.max(0, Math.trunc(num(r.Available) ?? 0));
    const price = num(r["Sell Price"]);

    let productId: number | null = null;
    const prev = r["Catalogue Id"] ? prevMatch.get(r["Catalogue Id"]) : undefined;
    if (prev) { productId = prev.tcg_product_id; stats.reusedMatches++; }
    else if (game) {
      let best: { c: Candidate; s: number } | null = null;
      for (const gid of resolveGroups(game, p.set)) {
        for (const c of await candidates(gid)) {
          const s = scoreCandidate(p, c);
          if (!best || s > best.s) best = { c, s };
        }
      }
      if (best && best.s >= 60) { productId = best.c.product_id; stats.newlyMatched++; }
    }
    if (productId) stats.matched++; else { stats.unmatched++; if (available > 0) stats.unmatchedInStock++; }
    if (available > 0) {
      stats.inStockRows++; stats.units += available; stats.stockValueAud += available * (price ?? 0);
      stats.byGame[game ?? r.Game] = (stats.byGame[game ?? r.Game] ?? 0) + available;
    }

    const shop = shopify?.onShopify.has(id)
      ? { handle: shopify.handles.get(id) ?? id, on_shopify: true, shopify_image: shopify.images.get(id) ?? null }
      : prevShop.get(id) ?? { handle: id, on_shopify: false, shopify_image: null };

    out.push({
      sku: id, gl_card_id: id, gl_catalogue_id: r["Catalogue Id"] || null,
      handle: shop.handle, on_shopify: shop.on_shopify, shopify_image: shop.shopify_image,
      title: `${p.name}${p.number ? " " + p.number : ""} (${p.set})${variant ? " - " + variant : ""}`,
      game, card_name: p.name, number: p.number, group_name: p.set, finish: r.Variant || "Normal", rarity: r.Rarity || null,
      condition: conditionCode(r.Condition), condition_label: r.Condition, available, price_aud: price,
      gl_buy_cash_aud: num(r["Buy Cash Price"]), gl_buy_credit_aud: num(r["Buy Credit Price"]),
      tcg_product_id: productId,
      sub_type: productId ? pickSubType(variant, subTypesOf.get(productId) ?? []) : null,
      match_method: prev ? "reused" : productId ? "gl:set+number" : null,
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
  stats.stockValueAud = Math.round(stats.stockValueAud);
  return stats;
}

/** Read Shopify inventory/product exports to learn which GL cards are on Shopify, their handles and images. */
export function readShopifyExports(files: (string | Buffer)[]) {
  const onShopify = new Set<string>(), handles = new Map<string, string>(), images = new Map<string, string>();
  for (const f of files) {
    const imageByHandle = new Map<string, string>();
    for (const r of parse(f, { columns: true, skip_empty_lines: true, relax_quotes: true, bom: true }) as Row[]) {
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
  return { onShopify, handles, images };
}
