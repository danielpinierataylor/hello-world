"use client";

import Link from "next/link";
import { CONDITIONS } from "@/lib/buylist/pricing";
import { money, useSellList } from "./SellList";

/** Sidebar: the customer's sell list with live totals and the credit/cash toggle. */
export function SellPanel({ checkout = true }: { checkout?: boolean }) {
  const { items, payout, setPayout, update, remove, unit, total, count, clear } = useSellList();
  return (
    <aside className="space-y-3 rounded-xl border border-line bg-panel p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Your sell list</h2>
        {items.length > 0 && <button onClick={clear} className="text-xs text-muted hover:text-fg">Clear</button>}
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-lg bg-bg p-1 text-sm">
        {(["credit", "cash"] as const).map((p) => (
          <button key={p} onClick={() => setPayout(p)}
            className={`rounded-md py-1.5 font-semibold ${payout === p ? "bg-brand text-white" : "text-muted"}`}>
            {p === "credit" ? "Store credit" : "Cash"}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted">Search for cards and hit “Add”, or upload a CSV of your collection.</p>
      ) : (
        <ul className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
          {items.map((it, i) => {
            const each = unit(it);
            return (
              <li key={`${it.key}-${it.condition}`} className="rounded-lg border border-line p-2 text-sm">
                <div className="flex justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{it.name}</div>
                    <div className="truncate text-xs text-muted">{it.set_name} · {it.finish}</div>
                  </div>
                  <button onClick={() => remove(i)} className="text-muted hover:text-red-400" aria-label="Remove">✕</button>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <select value={it.condition} onChange={(e) => update(i, { condition: e.target.value })} className="rounded border border-line bg-bg px-1 py-0.5 text-xs" aria-label="Condition">
                    {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <input type="number" min={1} value={it.qty} onChange={(e) => update(i, { qty: Number(e.target.value) })} aria-label="Quantity"
                    className="w-12 rounded border border-line bg-bg px-1 py-0.5 text-xs" />
                  <span className="ml-auto text-xs">{each == null ? <span className="text-red-400">Not buying</span> : `${it.qty} × ${money(each)}`}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-baseline justify-between border-t border-line pt-3">
        <span className="text-sm text-muted">{count} card{count === 1 ? "" : "s"}</span>
        <span className="text-xl font-bold">{money(total)}</span>
      </div>
      <p className="text-xs text-muted">{payout === "credit" ? "Store credit" : "Cash"} estimate. Final amount is confirmed when we check your cards.</p>
      {checkout && items.length > 0 && (
        <Link href="/sell/checkout" className="block rounded-lg bg-brand py-2.5 text-center font-semibold text-white">Continue →</Link>
      )}
    </aside>
  );
}
