"use server";

import { randomInt } from "node:crypto";
import { sql } from "@/lib/db";
import { lookupKeys } from "@/lib/buylist/search";
import { getBuylistRules } from "@/lib/buylist/rules";
import { offer, CONDITIONS, type Payout } from "@/lib/buylist/pricing";

export type SubmitInput = {
  items: { key: string; condition: string; qty: number }[];
  payout: Payout;
  delivery: "dropoff" | "post";
  name: string;
  email: string;
  phone?: string;
  notes?: string;
};

export type SubmitResult = { ok: true; ref: string; total: number; dropped: number } | { ok: false; error: string };

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const newRef = () => "GGM-" + Array.from({ length: 5 }, () => REF_ALPHABET[randomInt(REF_ALPHABET.length)]).join("");

export async function submitSellList(input: SubmitInput): Promise<SubmitResult> {
  const name = input.name?.trim();
  const email = input.email?.trim();
  if (!name || name.length > 120) return { ok: false, error: "Please enter your name." };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return { ok: false, error: "Please enter a valid email address." };
  if (input.payout !== "credit" && input.payout !== "cash") return { ok: false, error: "Choose store credit or cash." };
  if (input.delivery !== "dropoff" && input.delivery !== "post") return { ok: false, error: "Choose drop-off or post." };
  if (!Array.isArray(input.items) || input.items.length === 0) return { ok: false, error: "Your sell list is empty." };
  if (input.items.length > 2000) return { ok: false, error: "That list is too big for one submission — please split it." };

  const rules = await getBuylistRules();
  const priced = await lookupKeys(input.items.map((i) => i.key));
  const lines: Record<string, unknown>[] = [];
  let total = 0, dropped = 0;
  for (const it of input.items) {
    const row = priced.get(it.key);
    const qty = Math.max(1, Math.min(rules._maxPerCard, Math.floor(Number(it.qty)) || 0));
    if (!row || !CONDITIONS.includes(it.condition as never) || !rules[row.game]) { dropped++; continue; }
    const unit = offer(row.market_usd, input.payout, it.condition, rules[row.game], row.hot);
    if (unit == null) { dropped++; continue; }
    total += unit * qty;
    lines.push({
      game: row.game, tcg_product_id: row.tcg_product_id, sub_type: row.sub_type, scryfall_id: row.scryfall_id,
      name: row.name, set_name: row.set_name, number: row.number, condition: it.condition, qty, unit_quote: unit, hot: !!row.hot,
    });
  }
  if (!lines.length) return { ok: false, error: "We're not currently buying any of the cards on your list." };

  const ref = newRef();
  await sql.begin(async (tx) => {
    const [sub] = await tx`INSERT INTO buylist_submissions
        (ref, name, email, phone, payout, delivery, notes, quoted_total, fx_usd_aud)
      VALUES (${ref}, ${name}, ${email}, ${input.phone?.trim() || null}, ${input.payout}, ${input.delivery},
        ${input.notes?.trim().slice(0, 2000) || null}, ${Math.round(total * 100) / 100}, ${rules.mtg.fx})
      RETURNING id`;
    await tx`INSERT INTO buylist_items ${tx(lines.map((l) => ({ ...l, submission_id: sub.id })))}`;
  });
  // TODO: email the customer their reference + packing instructions once email sending is set up.
  return { ok: true, ref, total: Math.round(total * 100) / 100, dropped };
}
