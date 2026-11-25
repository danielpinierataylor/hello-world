import { getSettings } from "../settings";
import type { BuylistRules } from "./pricing";

export const BUY_GAMES = ["mtg", "pokemon", "onepiece", "riftbound", "pokemon-jp"] as const;

/** Buylist rules for every game, from staff settings. Safe to send to the browser. */
export async function getBuylistRules(): Promise<Record<string, BuylistRules> & { _maxPerCard: number }> {
  const { fx, buylist } = await getSettings();
  const out: Record<string, BuylistRules> = {};
  for (const g of BUY_GAMES) {
    out[g] = {
      fx,
      pct: buylist.games[g] ?? buylist.default,
      conditions: buylist.conditions,
      minOfferAud: Number((buylist as { minOfferAud?: number }).minOfferAud ?? 0.05),
    };
  }
  return Object.assign(out, { _maxPerCard: Number((buylist as { maxPerCard?: number }).maxPerCard ?? 20) });
}
