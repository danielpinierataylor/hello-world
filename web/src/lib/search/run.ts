import type postgres from "postgres";
import { sql } from "../db";
import { compile } from "./compile";

export type MtgResult = {
  oracle_id: string; id: string; name: string; set_code: string; set_name: string; collector_number: string;
  mana_cost: string | null; type_line: string | null; rarity: string | null; image_normal: string | null;
  usd: string | null; usd_foil: string | null; qty: number; printings_in_stock: number;
};

export type SearchResponse<T> = { results: T[]; total: number; warnings: string[]; inStockOnly: boolean };

const PAGE = 60;

const ORDERS: Record<string, string> = {
  name: "c.name ASC",
  cmc: "c.cmc ASC, c.name ASC",
  usd: "coalesce(c.usd, c.usd_foil) DESC NULLS LAST",
  released: "c.released_at DESC",
  edhrec: "c.edhrec_rank ASC NULLS LAST",
  stock: "agg.qty DESC NULLS LAST, c.name ASC",
};

/** Magic search, one row per card (oracle id), choosing the in-stock (else newest) printing to display. */
export async function searchMtg(q: string, opts: { page?: number; inStockOnly?: boolean; order?: string } = {}): Promise<SearchResponse<MtgResult>> {
  const { where, params, warnings, flags } = compile(q, "mtg");
  // Default: only cards we have in stock. Pass inStockOnly:false to search every card (e.g. for the buylist).
  const stockOnly = opts.inStockOnly !== false || !!flags.inStock;
  const order = ORDERS[(q.match(/\border:(\w+)/)?.[1] ?? opts.order ?? "name").toLowerCase()] ?? ORDERS.name;
  const offset = ((opts.page ?? 1) - 1) * PAGE;
  const text = `
    WITH stock AS (
      SELECT scryfall_id, sum(available)::int AS qty FROM listings WHERE available > 0 AND scryfall_id IS NOT NULL GROUP BY 1
    ), m AS (
      SELECT c.id, c.oracle_id, c.released_at, s.qty FROM mtg_cards c LEFT JOIN stock s ON s.scryfall_id = c.id
      WHERE ${where}
    ), agg AS (
      SELECT oracle_id,
        (array_agg(id ORDER BY (qty > 0) DESC NULLS LAST, released_at DESC))[1] AS id,
        coalesce(sum(qty), 0)::int AS qty,
        count(*) FILTER (WHERE qty > 0)::int AS printings_in_stock
      FROM m GROUP BY oracle_id
      ${stockOnly ? "HAVING sum(qty) > 0" : ""}
    )
    SELECT c.oracle_id, c.id, c.name, c.set_code, c.set_name, c.collector_number, c.mana_cost, c.type_line, c.rarity,
      c.image_normal, c.usd, c.usd_foil, agg.qty, agg.printings_in_stock, count(*) OVER () AS total
    FROM agg JOIN mtg_cards c ON c.id = agg.id
    ORDER BY ${order}
    LIMIT ${PAGE} OFFSET ${offset}`;
  const rows = await sql.unsafe(text, params as postgres.ParameterOrJSON<never>[]);
  return { results: rows as unknown as MtgResult[], total: Number(rows[0]?.total ?? 0), warnings, inStockOnly: stockOnly };
}

export type TcgResult = {
  product_id: number; name: string; number: string | null; rarity: string | null; set_name: string;
  image_url: string | null; game: string; qty: number; market_usd: string | null;
};

/** Pokémon / One Piece / Riftbound / Pokémon JP search over the TCGplayer catalogue + our listings. */
export async function searchTcg(game: string, q: string, opts: { page?: number; inStockOnly?: boolean } = {}): Promise<SearchResponse<TcgResult>> {
  const { where, params, warnings, flags } = compile(q, "tcg");
  const stockOnly = opts.inStockOnly !== false || !!flags.inStock;
  params.push(game);
  const gp = `$${params.length}`;
  const offset = ((opts.page ?? 1) - 1) * PAGE;
  const text = `
    WITH stock AS (
      SELECT tcg_product_id, sum(available)::int AS qty FROM listings WHERE available > 0 AND tcg_product_id IS NOT NULL GROUP BY 1
    )
    SELECT p.product_id, p.name, p.number, p.rarity, g.name AS set_name, p.image_url, p.game,
      coalesce(s.qty, 0) AS qty,
      (SELECT max(market_usd) FROM tcg_prices pr WHERE pr.product_id = p.product_id) AS market_usd,
      count(*) OVER () AS total
    FROM tcg_products p JOIN tcg_groups g ON g.group_id = p.group_id
    LEFT JOIN stock s ON s.tcg_product_id = p.product_id
    WHERE p.game = ${gp} AND p.number IS NOT NULL AND ${where} ${stockOnly ? "AND s.qty > 0" : ""}
    ORDER BY g.published_on DESC NULLS LAST, p.number ASC
    LIMIT ${PAGE} OFFSET ${offset}`;
  const rows = await sql.unsafe(text, params as postgres.ParameterOrJSON<never>[]);
  return { results: rows as unknown as TcgResult[], total: Number(rows[0]?.total ?? 0), warnings, inStockOnly: stockOnly };
}
