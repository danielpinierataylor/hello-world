// Buylist offer maths. Pure functions so the browser (live totals) and the server (authoritative quote) agree.
export type Payout = "credit" | "cash";
export type Condition = "NM" | "LP" | "MP" | "HP" | "DMG";
export const CONDITIONS: Condition[] = ["NM", "LP", "MP", "HP", "DMG"];
export const CONDITION_LABEL: Record<Condition, string> = {
  NM: "Near Mint", LP: "Lightly Played", MP: "Moderately Played", HP: "Heavily Played", DMG: "Damaged",
};

export type BuylistRules = {
  fx: number;                                     // A$ per US$
  pct: { credit: number; cash: number };          // for this game
  conditions: Record<string, number>;             // multipliers vs NM
  minOfferAud: number;                            // below this we don't buy
};

export type Hot = { credit_aud: number | null; cash_aud: number | null; boost: number | null } | null;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** NM offer for one card, before condition. Returns null if we don't buy it. */
export function nmOffer(marketUsd: number | null, payout: Payout, rules: BuylistRules, hot: Hot = null): number | null {
  if (hot) {
    const fixed = payout === "credit" ? hot.credit_aud : hot.cash_aud;
    if (fixed != null) return round2(Number(fixed));
  }
  if (marketUsd == null || !(marketUsd > 0)) return null;
  const base = marketUsd * rules.fx * rules.pct[payout] * (hot?.boost ? Number(hot.boost) : 1);
  return round2(base);
}

export function offer(marketUsd: number | null, payout: Payout, condition: string, rules: BuylistRules, hot: Hot = null): number | null {
  const nm = nmOffer(marketUsd, payout, rules, hot);
  const mult = rules.conditions[condition];
  if (nm == null || mult == null) return null;
  const v = round2(nm * mult);
  return v >= rules.minOfferAud ? v : null;
}
