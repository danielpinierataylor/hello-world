import { sql } from "./db";

export type BuylistSettings = {
  default: { credit: number; cash: number };
  games: Record<string, { credit: number; cash: number }>;
  conditions: Record<string, number>;
};

/** Staff-editable settings stored in the `settings` table. */
export async function getSettings(): Promise<{ fx: number; buylist: BuylistSettings }> {
  const rows = await sql`SELECT key, value FROM settings WHERE key IN ('fx_usd_aud', 'buylist')`;
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { fx: Number(m.fx_usd_aud ?? 1.5), buylist: m.buylist as BuylistSettings };
}
