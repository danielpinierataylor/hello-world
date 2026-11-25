import Link from "next/link";
import { GAMES } from "@/components/SearchBar";
import { SellRows } from "@/components/sell/SellRows";
import { SellPanel } from "@/components/sell/SellPanel";
import { searchSellable } from "@/lib/buylist/search";
import { getBuylistRules } from "@/lib/buylist/rules";

type SP = Promise<Record<string, string | undefined>>;

export default async function SellPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = sp.q ?? "";
  const game = GAMES.some((g) => g.id === sp.game) ? sp.game! : "mtg";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const rules = (await getBuylistRules())[game];

  const res = q.trim() ? await searchSellable(game, q, { page }) : await searchSellable(game, "", { hotOnly: true });
  const pageHref = (p: number) => `/sell?${new URLSearchParams({ q, game, page: String(p) })}`;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-black tracking-tight">Sell your cards to us</h1>
        <p className="text-muted">
          We pay <b className="text-fg">{Math.round(rules.pct.credit * 100)}% in store credit</b> or{" "}
          <b className="text-fg">{Math.round(rules.pct.cash * 100)}% in cash</b> of TCGplayer market value. Hotlist cards get more.
          {" "}<Link href="/sell/import" className="text-brand hover:underline">Got a big collection? Upload a CSV →</Link>
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4 min-w-0">
          <form action="/sell" className="space-y-3">
            <div className="flex gap-2">
              <input name="q" defaultValue={q} placeholder="Card name — or Scryfall-style search, e.g. s:mh3 r:m" autoFocus
                className="w-full rounded-lg border border-line bg-panel px-4 py-2.5 outline-none focus:border-brand" />
              <button className="rounded-lg bg-brand px-5 font-semibold text-white">Search</button>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              {GAMES.map((g) => (
                <label key={g.id} className="cursor-pointer">
                  <input type="radio" name="game" value={g.id} defaultChecked={g.id === game} className="peer sr-only" />
                  <span className="rounded-full border border-line px-3 py-1 text-muted peer-checked:border-brand peer-checked:text-fg">{g.label}</span>
                </label>
              ))}
            </div>
          </form>

          {!q.trim() && (
            <h2 className="flex items-center gap-2 font-semibold">🔥 Hotlist <span className="text-sm font-normal text-muted">— cards we want right now, at better rates</span></h2>
          )}
          {res.warnings.length > 0 && <p className="text-sm text-amber-400">{res.warnings.join(" · ")}</p>}
          <SellRows rows={res.rows} />
          {res.rows.length === 0 && (
            <p className="py-8 text-center text-muted">{q.trim() ? "No cards found. Check the spelling or pick another game." : "Nothing on the hotlist for this game right now. Search above to sell anything."}</p>
          )}
          <div className="flex justify-center gap-3 text-sm">
            {page > 1 && <Link href={pageHref(page - 1)} className="rounded border border-line px-3 py-1">← Prev</Link>}
            {res.more && <Link href={pageHref(page + 1)} className="rounded border border-line px-3 py-1">Next →</Link>}
          </div>
        </div>
        <div className="lg:sticky lg:top-20 lg:self-start"><SellPanel /></div>
      </div>
    </div>
  );
}
