// Buylist search: one row per sellable printing + finish (what a customer actually holds).
import type postgres from "postgres";
import { sql } from "../db";
import { compile } from "../search/compile";

export type SellRow = {
  key: string;                // `${tcg_product_id}:${sub_type}` — what the sell list stores
  game: string;
  tcg_product_id: number;
  sub_type: string;
  scryfall_id: string | null;
  name: string;
  set_name: string;
  set_code: string | null;
  number: string | null;
  finish: string;             // human label: Regular / Foil / Etched Foil / Holofoil ...
  image: string | null;
  market_usd: number | null;
  in_stock: number;           // how many we already hold (any condition)
  hot: { credit_aud: number | null; cash_aud: number | null; boost: number | null; note: string | null } | null;
};

const LIMIT = 60;
const P = (params: unknown[]) => params as postgres.ParameterOrJSON<never>[];

export async function searchSellable(game: string, q: string, opts: { hotOnly?: boolean; page?: number } = {}): Promise<{ rows: SellRow[]; warnings: string[]; more: boolean }> {
  const offset = ((opts.page ?? 1) - 1) * LIMIT;
  if (!q.trim() && !opts.hotOnly) return { rows: [], warnings: [], more: false };

  if (game === "mtg") {
    const { where, params, warnings } = compile(q, "mtg");
    const text = `
      WITH printings AS (
        SELECT c.*, f.finish FROM mtg_cards c CROSS JOIN LATERAL unnest(c.finishes) AS f(finish)
        WHERE ${where} AND c.tcgplayer_id IS NOT NULL
      ), priced AS (
        SELECT p.*,
          CASE WHEN p.finish = 'etched' THEN coalesce(p.tcgplayer_etched_id, p.tcgplayer_id) ELSE p.tcgplayer_id END AS product_id,
          CASE WHEN p.finish = 'nonfoil' THEN 'Normal' ELSE 'Foil' END AS sub_type
        FROM printings p
      )
      SELECT x.id AS scryfall_id, x.name, x.set_name, x.set_code, x.collector_number AS number, x.image_small AS image,
        x.product_id, x.sub_type,
        CASE x.finish WHEN 'nonfoil' THEN 'Regular' WHEN 'foil' THEN 'Foil' ELSE 'Etched Foil' END AS finish,
        pr.market_usd,
        coalesce((SELECT sum(available) FROM listings l WHERE l.tcg_product_id = x.product_id AND l.sub_type = x.sub_type), 0)::int AS in_stock,
        CASE WHEN h.id IS NULL THEN NULL ELSE json_build_object('credit_aud', h.credit_aud, 'cash_aud', h.cash_aud, 'boost', h.boost, 'note', h.note) END AS hot
      FROM priced x
      LEFT JOIN tcg_prices pr ON pr.product_id = x.product_id AND pr.sub_type = x.sub_type
      LEFT JOIN hotlist h ON h.active AND h.tcg_product_id = x.product_id AND h.sub_type = x.sub_type
      WHERE ${opts.hotOnly ? "h.id IS NOT NULL" : "TRUE"}
      ORDER BY (h.id IS NOT NULL) DESC, x.name, x.released_at DESC, x.finish DESC
      LIMIT ${LIMIT + 1} OFFSET ${offset}`;
    const rows = await sql.unsafe(text, P(params));
    return { rows: rows.slice(0, LIMIT).map((r) => toRow("mtg", r)), warnings, more: rows.length > LIMIT };
  }

  const { where, params, warnings } = compile(q, "tcg");
  params.push(game);
  const text = `
    SELECT NULL AS scryfall_id, p.name, g.name AS set_name, g.abbreviation AS set_code, p.number, p.image_url AS image,
      p.product_id, pr.sub_type, pr.sub_type AS finish, pr.market_usd,
      coalesce((SELECT sum(available) FROM listings l WHERE l.tcg_product_id = p.product_id AND l.sub_type = pr.sub_type), 0)::int AS in_stock,
      CASE WHEN h.id IS NULL THEN NULL ELSE json_build_object('credit_aud', h.credit_aud, 'cash_aud', h.cash_aud, 'boost', h.boost, 'note', h.note) END AS hot
    FROM tcg_products p
    JOIN tcg_groups g ON g.group_id = p.group_id
    JOIN tcg_prices pr ON pr.product_id = p.product_id
    LEFT JOIN hotlist h ON h.active AND h.tcg_product_id = p.product_id AND h.sub_type = pr.sub_type
    WHERE p.game = $${params.length} AND p.number IS NOT NULL AND ${where} ${opts.hotOnly ? "AND h.id IS NOT NULL" : ""}
    ORDER BY (h.id IS NOT NULL) DESC, g.published_on DESC NULLS LAST, p.number
    LIMIT ${LIMIT + 1} OFFSET ${offset}`;
  const rows = await sql.unsafe(text, P(params));
  return { rows: rows.slice(0, LIMIT).map((r) => toRow(game, r)), warnings, more: rows.length > LIMIT };
}

function toRow(game: string, r: Record<string, unknown>): SellRow {
  return {
    key: `${r.product_id}:${r.sub_type}`,
    game,
    tcg_product_id: Number(r.product_id),
    sub_type: String(r.sub_type),
    scryfall_id: (r.scryfall_id as string) ?? null,
    name: String(r.name),
    set_name: String(r.set_name ?? ""),
    set_code: (r.set_code as string) ?? null,
    number: (r.number as string) ?? null,
    finish: String(r.finish),
    image: (r.image as string) ?? null,
    market_usd: r.market_usd == null ? null : Number(r.market_usd),
    in_stock: Number(r.in_stock ?? 0),
    hot: (r.hot as SellRow["hot"]) ?? null,
  };
}

/** Authoritative lookup for a sell list: re-price every key on the server (never trust browser prices). */
export async function lookupKeys(keys: string[]): Promise<Map<string, SellRow>> {
  const pairs = keys.map((k) => k.split(":")).filter(([id, st]) => /^\d+$/.test(id) && st);
  if (!pairs.length) return new Map();
  const ids = pairs.map(([id]) => Number(id));
  const subs = pairs.map(([, st]) => st);
  const rows = await sql`
    WITH k AS (SELECT * FROM unnest(${ids}::int[], ${subs}::text[]) AS k(product_id, sub_type))
    SELECT k.product_id, k.sub_type, p.game, p.name, p.number, g.name AS set_name, g.abbreviation AS set_code, p.image_url AS image,
      pr.market_usd,
      (SELECT c.id FROM mtg_cards c WHERE c.tcgplayer_id = k.product_id OR c.tcgplayer_etched_id = k.product_id LIMIT 1) AS scryfall_id,
      0 AS in_stock,
      CASE WHEN h.id IS NULL THEN NULL ELSE json_build_object('credit_aud', h.credit_aud, 'cash_aud', h.cash_aud, 'boost', h.boost, 'note', h.note) END AS hot,
      k.sub_type AS finish
    FROM k
    JOIN tcg_products p ON p.product_id = k.product_id
    JOIN tcg_groups g ON g.group_id = p.group_id
    LEFT JOIN tcg_prices pr ON pr.product_id = k.product_id AND pr.sub_type = k.sub_type
    LEFT JOIN hotlist h ON h.active AND h.tcg_product_id = k.product_id AND h.sub_type = k.sub_type`;
  return new Map(rows.map((r) => { const row = toRow(r.game, r); return [row.key, row]; }));
}
