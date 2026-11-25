// CLI wrapper: npx tsx scripts/import-gl.ts gl-export.csv [shopify-export.csv ...]
// (Staff normally upload the GL export at /staff/import instead.)
import { readFileSync } from "node:fs";
import { sql } from "./lib/db";
import { importGl, parseGlCsv, readShopifyExports } from "../src/lib/import/gl";

async function main() {
  const [glFile, ...shopifyFiles] = process.argv.slice(2);
  if (!glFile) throw new Error("usage: import-gl.ts gl-export.csv [shopify-export.csv ...]");
  const rows = parseGlCsv(readFileSync(glFile));
  const shopify = shopifyFiles.length ? readShopifyExports(shopifyFiles.map((f) => readFileSync(f))) : undefined;
  const t = Date.now();
  const stats = await importGl(sql, rows, shopify);
  console.log(stats, `${((Date.now() - t) / 1000).toFixed(1)}s`);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
