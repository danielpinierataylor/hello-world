// Mirror TCGplayer catalogue + market prices from TCGCSV (https://tcgcsv.com) for our games.
// Usage: npx tsx scripts/ingest-tcgcsv.ts [game ...]   (default: all games)
import { sql, fetchJson } from "./lib/db";

export const CATEGORIES: Record<string, number> = {
  mtg: 1,
  pokemon: 3,
  onepiece: 68,
  "pokemon-jp": 85,
  riftbound: 89,
};

const BASE = "https://tcgcsv.com/tcgplayer";

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
}

async function ingestGame(game: string) {
  const cat = CATEGORIES[game];
  const groups = (await fetchJson(`${BASE}/${cat}/groups`)).results as any[];
  await sql`INSERT INTO tcg_groups ${sql(groups.map((g) => ({
    group_id: g.groupId, category_id: cat, game, name: g.name,
    abbreviation: g.abbreviation ?? null, published_on: g.publishedOn?.slice(0, 10) ?? null,
  })))} ON CONFLICT (group_id) DO UPDATE SET name = excluded.name, abbreviation = excluded.abbreviation, published_on = excluded.published_on`;

  let done = 0, products = 0, prices = 0;
  await pool(groups, 6, async (g) => {
    const [prod, pr] = await Promise.all([
      fetchJson(`${BASE}/${cat}/${g.groupId}/products`),
      fetchJson(`${BASE}/${cat}/${g.groupId}/prices`),
    ]);
    const rows = (prod.results as any[]).map((p) => {
      const ext = Object.fromEntries((p.extendedData ?? []).map((e: any) => [e.name, e.value]));
      return {
        product_id: p.productId, group_id: g.groupId, game, name: p.name, clean_name: p.cleanName ?? null,
        number: ext.Number ?? null, rarity: ext.Rarity ?? null,
        image_url: p.imageUrl ? p.imageUrl.replace("_200w", "_in_1000x1000") : null, extended: ext,
      };
    });
    if (rows.length) await sql`INSERT INTO tcg_products ${sql(rows)} ON CONFLICT (product_id) DO UPDATE SET
      name = excluded.name, clean_name = excluded.clean_name, number = excluded.number, rarity = excluded.rarity,
      image_url = excluded.image_url, extended = excluded.extended, group_id = excluded.group_id`;
    const prow = (pr.results as any[]).map((p) => ({
      product_id: p.productId, sub_type: p.subTypeName,
      market_usd: p.marketPrice, low_usd: p.lowPrice, mid_usd: p.midPrice,
    }));
    if (prow.length) await sql`INSERT INTO tcg_prices ${sql(prow)} ON CONFLICT (product_id, sub_type) DO UPDATE SET
      market_usd = excluded.market_usd, low_usd = excluded.low_usd, mid_usd = excluded.mid_usd, updated_at = now()`;
    products += rows.length; prices += prow.length;
    if (++done % 50 === 0) console.log(game, done, "/", groups.length);
  });
  console.log(game, "groups", groups.length, "products", products, "prices", prices);
}

async function main() {
  const games = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CATEGORIES);
  for (const g of games) await ingestGame(g);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
