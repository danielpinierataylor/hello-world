"use client";

// The customer's sell list lives in the browser (localStorage) until they submit it.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { offer, type BuylistRules, type Payout } from "@/lib/buylist/pricing";
import type { SellRow } from "@/lib/buylist/search";

export type SellItem = Pick<SellRow, "key" | "game" | "name" | "set_name" | "number" | "finish" | "image" | "market_usd" | "hot"> & {
  condition: string;
  qty: number;
};

type Rules = Record<string, BuylistRules> & { _maxPerCard: number };

type Ctx = {
  items: SellItem[];
  payout: Payout;
  setPayout: (p: Payout) => void;
  add: (row: SellRow, condition: string, qty: number) => void;
  update: (i: number, patch: Partial<SellItem>) => void;
  remove: (i: number) => void;
  clear: () => void;
  addMany: (items: SellItem[]) => void;
  rules: Rules;
  unit: (it: Pick<SellItem, "game" | "market_usd" | "hot" | "condition">, payout?: Payout) => number | null;
  total: number;
  count: number;
};

const SellCtx = createContext<Ctx | null>(null);
const KEY = "ggm-sell-list-v1";

export function SellListProvider({ rules, children }: { rules: Rules; children: ReactNode }) {
  const [items, setItems] = useState<SellItem[]>([]);
  const [payout, setPayout] = useState<Payout>("credit");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const v = JSON.parse(raw);
        if (Array.isArray(v.items)) setItems(v.items);
        if (v.payout === "cash" || v.payout === "credit") setPayout(v.payout);
      }
    } catch { /* private mode etc. — list just won't persist */ }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(KEY, JSON.stringify({ items, payout })); } catch { /* ignore */ }
  }, [items, payout, loaded]);

  const value = useMemo<Ctx>(() => {
    const unit: Ctx["unit"] = (it, p = payout) => {
      const r = rules[it.game];
      return r ? offer(it.market_usd, p, it.condition, r, it.hot) : null;
    };
    const clampQty = (q: number) => Math.max(1, Math.min(rules._maxPerCard, Math.floor(q) || 1));
    const merge = (list: SellItem[], add: SellItem) => {
      const i = list.findIndex((x) => x.key === add.key && x.condition === add.condition);
      if (i < 0) return [...list, { ...add, qty: clampQty(add.qty) }];
      const next = [...list];
      next[i] = { ...next[i], qty: clampQty(next[i].qty + add.qty) };
      return next;
    };
    return {
      items, payout, setPayout, rules, unit,
      add: (row, condition, qty) => setItems((l) => merge(l, {
        key: row.key, game: row.game, name: row.name, set_name: row.set_name, number: row.number, finish: row.finish,
        image: row.image, market_usd: row.market_usd, hot: row.hot, condition, qty,
      })),
      addMany: (adds) => setItems((l) => adds.reduce(merge, l)),
      update: (i, patch) => setItems((l) => l.map((x, j) => (j === i ? { ...x, ...patch, qty: clampQty(patch.qty ?? x.qty) } : x))),
      remove: (i) => setItems((l) => l.filter((_, j) => j !== i)),
      clear: () => setItems([]),
      total: items.reduce((s, it) => s + (unit(it) ?? 0) * it.qty, 0),
      count: items.reduce((s, it) => s + it.qty, 0),
    };
  }, [items, payout, rules]);

  return <SellCtx.Provider value={value}>{children}</SellCtx.Provider>;
}

export function useSellList() {
  const c = useContext(SellCtx);
  if (!c) throw new Error("useSellList outside SellListProvider");
  return c;
}

export const money = (n: number | null | undefined) => (n == null ? "—" : `A$${n.toFixed(2)}`);
