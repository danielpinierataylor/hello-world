// Quick CLI to try queries: npx tsx scripts/try-search.ts 'q' [all]
import "./lib/db";
import { searchMtg } from "../src/lib/search/run";
import { sql } from "../src/lib/db";
async function main() {
  const t = Date.now();
  const r = await searchMtg(process.argv[2] ?? "", { inStockOnly: process.argv[3] !== "all" });
  console.log(`${r.total} cards (${Date.now() - t}ms)`, r.warnings.length ? r.warnings : "");
  for (const x of r.results.slice(0, 6)) console.log(` ${x.name} [${x.set_code} ${x.collector_number}] qty=${x.qty} ${x.type_line}`);
  await sql.end();
}
main();
