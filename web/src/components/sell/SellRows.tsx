"use client";

import { useState } from "react";
import { CONDITIONS } from "@/lib/buylist/pricing";
import type { SellRow } from "@/lib/buylist/search";
import { money, useSellList } from "./SellList";

function Row({ row }: { row: SellRow }) {
  const { add, unit, payout } = useSellList();
  const [condition, setCondition] = useState("NM");
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const each = unit({ game: row.game, market_usd: row.market_usd, hot: row.hot, condition }, payout);
  return (
    <tr className="border-b border-line last:border-0 align-middle">
      <td className="p-2 w-12">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {row.image && <img src={row.image} alt="" loading="lazy" className="h-14 w-10 rounded object-cover" />}
      </td>
      <td className="p-2">
        <div className="font-medium leading-tight">
          {row.name}
          {row.hot && <span className="ml-2 rounded bg-orange-500/20 px-1.5 py-0.5 text-[11px] font-bold text-orange-400">🔥 HOTLIST</span>}
        </div>
        <div className="text-xs text-muted">{row.set_name}{row.number ? ` · #${row.number}` : ""} · {row.finish}</div>
        {row.hot?.note && <div className="text-xs text-orange-300">{row.hot.note}</div>}
      </td>
      <td className="p-2">
        <select value={condition} onChange={(e) => setCondition(e.target.value)} className="rounded border border-line bg-bg px-1.5 py-1 text-sm" aria-label="Condition">
          {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
        </select>
      </td>
      <td className="p-2">
        <input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} aria-label="Quantity"
          className="w-14 rounded border border-line bg-bg px-1.5 py-1 text-sm" />
      </td>
      <td className="p-2 text-right font-semibold whitespace-nowrap">{each == null ? <span className="font-normal text-muted">Not buying</span> : money(each)}</td>
      <td className="p-2 text-right">
        <button
          disabled={each == null}
          onClick={() => { add(row, condition, qty); setAdded(true); setTimeout(() => setAdded(false), 1200); }}
          className="rounded bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-30">
          {added ? "Added ✓" : "Add"}
        </button>
      </td>
    </tr>
  );
}

export function SellRows({ rows }: { rows: SellRow[] }) {
  const { payout } = useSellList();
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted">
          <tr className="border-b border-line">
            <th className="p-2" /><th className="p-2">Card</th><th className="p-2">Cond.</th><th className="p-2">Qty</th>
            <th className="p-2 text-right">We pay ({payout === "credit" ? "credit" : "cash"})</th><th className="p-2" />
          </tr>
        </thead>
        <tbody>{rows.map((r) => <Row key={r.key} row={r} />)}</tbody>
      </table>
    </div>
  );
}
