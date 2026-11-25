// Quick CLI to try the buylist search: npx tsx scripts/try-sell.ts <game> '<query>'
import "./lib/db";
import { searchSellable, lookupKeys } from "../src/lib/buylist/search";
import { sql } from "../src/lib/db";

async function main() {
  const [game, q] = [process.argv[2], process.argv[3]];
  const t = Date.now();
  const r = await searchSellable(game, q);
  console.log(r.rows.length, "rows", Date.now() - t, "ms", r.warnings);
  for (const x of r.rows.slice(0, 6)) {
    console.log(" ", [x.name, `${x.set_name} #${x.number}`, x.finish, `$${x.market_usd}`, `stock ${x.in_stock}`, x.key].join(" | "));
  }
  const m = await lookupKeys(r.rows.slice(0, 2).map((x) => x.key));
  console.log("lookup", [...m.values()].map((x) => [x.name, x.finish, x.market_usd].join(" ")));
  await sql.end();
}
main();
