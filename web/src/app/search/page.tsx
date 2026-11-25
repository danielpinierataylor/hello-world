import Link from "next/link";
import { SearchBar, GAMES } from "@/components/SearchBar";
import { searchMtg, searchTcg } from "@/lib/search/run";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const aud = (usd: string | number | null | undefined, fx: number) =>
  usd == null || usd === "" ? null : `A$${(Number(usd) * fx).toFixed(2)}`;

type SP = Promise<Record<string, string | undefined>>;

export default async function SearchPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = sp.q ?? "";
  const game = GAMES.some((g) => g.id === sp.game) ? sp.game! : "mtg";
  const all = sp.all === "1";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const { fx } = await getSettings();

  const res = game === "mtg"
    ? await searchMtg(q, { page, inStockOnly: !all })
    : await searchTcg(game, q, { page, inStockOnly: !all });

  const pageHref = (p: number) => `/search?${new URLSearchParams({ q, game, ...(all ? { all: "1" } : {}), page: String(p) })}`;

  return (
    <div className="space-y-5">
      <SearchBar q={q} game={game} all={all} />
      <div className="flex items-center justify-between text-sm text-muted">
        <span>
          {res.total.toLocaleString()} {res.total === 1 ? "card" : "cards"} {res.inStockOnly ? "in stock" : "found"}
        </span>
        {res.warnings.length > 0 && <span className="text-amber-400">{res.warnings.join(" · ")}</span>}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {game === "mtg"
          ? (res.results as Awaited<ReturnType<typeof searchMtg>>["results"]).map((c) => (
              <Link key={c.oracle_id} href={`/card/${c.id}`} className="group space-y-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.image_normal ?? ""} alt={c.name} loading="lazy"
                  className="aspect-[488/680] w-full rounded-[4.5%] bg-panel object-cover transition group-hover:scale-[1.02]" />
                <div className="text-sm font-medium leading-tight">{c.name}</div>
                <div className="text-xs text-muted">{c.set_name}</div>
                <div className="flex items-center justify-between text-xs">
                  {c.qty > 0
                    ? <span className="rounded bg-accent/15 px-1.5 py-0.5 text-accent">{c.qty} in stock{c.printings_in_stock > 1 ? ` · ${c.printings_in_stock} printings` : ""}</span>
                    : <span className="text-muted">Out of stock</span>}
                  <span className="text-muted">{aud(c.usd ?? c.usd_foil, fx)}</span>
                </div>
              </Link>
            ))
          : (res.results as Awaited<ReturnType<typeof searchTcg>>["results"]).map((c) => (
              <div key={c.product_id} className="space-y-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.image_url ?? ""} alt={c.name} loading="lazy" className="aspect-[488/680] w-full rounded-[4.5%] bg-panel object-cover" />
                <div className="text-sm font-medium leading-tight">{c.name}</div>
                <div className="text-xs text-muted">{c.set_name} · {c.number}</div>
                <div className="flex items-center justify-between text-xs">
                  {c.qty > 0 ? <span className="rounded bg-accent/15 px-1.5 py-0.5 text-accent">{c.qty} in stock</span> : <span className="text-muted">Out of stock</span>}
                  <span className="text-muted">{aud(c.market_usd, fx)}</span>
                </div>
              </div>
            ))}
      </div>

      {res.total === 0 && <p className="py-10 text-center text-muted">No cards match. Try ticking “Include cards not in stock”.</p>}

      <div className="flex justify-center gap-3 text-sm">
        {page > 1 && <Link href={pageHref(page - 1)} className="rounded border border-line px-3 py-1">← Prev</Link>}
        {page * 60 < res.total && <Link href={pageHref(page + 1)} className="rounded border border-line px-3 py-1">Next →</Link>}
      </div>
      <p className="text-xs text-muted">Prices shown are TCGplayer market converted at A${fx.toFixed(2)}/US$ until live Shopify prices are connected.</p>
    </div>
  );
}
