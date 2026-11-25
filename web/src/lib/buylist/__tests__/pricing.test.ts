import { describe, it, expect } from "vitest";
import { offer, nmOffer, type BuylistRules } from "../pricing";

const rules: BuylistRules = { fx: 1.5, pct: { credit: 0.7, cash: 0.6 }, conditions: { NM: 1, LP: 0.8, MP: 0.75 }, minOfferAud: 0.05 };

describe("buylist pricing", () => {
  it("70% credit / 60% cash of market at the FX rate", () => {
    expect(nmOffer(10, "credit", rules)).toBe(10.5);
    expect(nmOffer(10, "cash", rules)).toBe(9);
  });
  it("condition multipliers", () => {
    expect(offer(10, "credit", "LP", rules)).toBe(8.4);
    expect(offer(10, "credit", "XX", rules)).toBeNull();
  });
  it("below minimum -> not buying", () => {
    expect(offer(0.03, "cash", "NM", rules)).toBeNull();
  });
  it("hotlist fixed price beats market, boost multiplies", () => {
    expect(nmOffer(10, "credit", rules, { credit_aud: 20, cash_aud: null, boost: null })).toBe(20);
    expect(nmOffer(10, "cash", rules, { credit_aud: 20, cash_aud: null, boost: 1.2 })).toBe(10.8);
    expect(offer(null, "credit", "MP", rules, { credit_aud: 20, cash_aud: 17, boost: null })).toBe(15);
  });
});
