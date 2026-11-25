"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SellPanel } from "@/components/sell/SellPanel";
import { money, useSellList } from "@/components/sell/SellList";
import { submitSellList } from "../actions";

export default function CheckoutPage() {
  const { items, payout, total, clear } = useSellList();
  const router = useRouter();
  const [delivery, setDelivery] = useState<"dropoff" | "post">("dropoff");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setError(null);
    const res = await submitSellList({
      items: items.map(({ key, condition, qty }) => ({ key, condition, qty })),
      payout, delivery,
      name: String(f.get("name") ?? ""), email: String(f.get("email") ?? ""),
      phone: String(f.get("phone") ?? ""), notes: String(f.get("notes") ?? ""),
    }).catch(() => ({ ok: false as const, error: "Something went wrong — please try again." }));
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    clear();
    router.push(`/sell/thanks?ref=${res.ref}&total=${res.total}&payout=${payout}&delivery=${delivery}&dropped=${res.dropped}`);
  }

  if (items.length === 0) {
    return <p className="py-16 text-center text-muted">Your sell list is empty. <Link href="/sell" className="text-brand">Find cards to sell →</Link></p>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <form onSubmit={onSubmit} className="space-y-5 max-w-xl">
        <h1 className="text-2xl font-bold">Send us your cards</h1>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm"><span>Name</span>
            <input name="name" required autoComplete="name" className="w-full rounded-lg border border-line bg-panel px-3 py-2" /></label>
          <label className="space-y-1 text-sm"><span>Email</span>
            <input name="email" type="email" required autoComplete="email" className="w-full rounded-lg border border-line bg-panel px-3 py-2" /></label>
          <label className="space-y-1 text-sm"><span>Phone (optional)</span>
            <input name="phone" autoComplete="tel" className="w-full rounded-lg border border-line bg-panel px-3 py-2" /></label>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">How will you get them to us?</legend>
          {([["dropoff", "Drop off in store", "1/154 Russell St, Morley WA 6062"], ["post", "Post them", "We'll email the address and packing tips"]] as const).map(([v, t, d]) => (
            <label key={v} className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${delivery === v ? "border-brand" : "border-line"}`}>
              <input type="radio" name="delivery" checked={delivery === v} onChange={() => setDelivery(v)} />
              <span><span className="font-medium">{t}</span><span className="block text-xs text-muted">{d}</span></span>
            </label>
          ))}
        </fieldset>
        <label className="block space-y-1 text-sm"><span>Notes (optional)</span>
          <textarea name="notes" rows={3} className="w-full rounded-lg border border-line bg-panel px-3 py-2" /></label>

        <div className="rounded-lg bg-panel p-4 text-sm text-muted">
          Estimated payout: <b className="text-fg">{money(total)}</b> in {payout === "credit" ? "store credit" : "cash"}.
          We check every card when it arrives; if a card&apos;s condition differs from what you selected we&apos;ll adjust and let you know before paying.
        </div>
        {error && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{error}</p>}
        <button disabled={busy} className="rounded-lg bg-brand px-6 py-3 font-semibold text-white disabled:opacity-50">
          {busy ? "Submitting…" : "Submit sell list"}
        </button>
      </form>
      <div className="lg:sticky lg:top-20 lg:self-start"><SellPanel checkout={false} /></div>
    </div>
  );
}
