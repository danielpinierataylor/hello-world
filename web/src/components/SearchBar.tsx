import Link from "next/link";

export const GAMES = [
  { id: "mtg", label: "Magic" },
  { id: "pokemon", label: "Pokémon" },
  { id: "onepiece", label: "One Piece" },
  { id: "riftbound", label: "Riftbound" },
  { id: "pokemon-jp", label: "Pokémon JP" },
] as const;

export function SearchBar({ q = "", game = "mtg", all = false, big = false }: { q?: string; game?: string; all?: boolean; big?: boolean }) {
  return (
    <form action="/search" className="space-y-3">
      <div className="flex gap-2">
        <input
          name="q" defaultValue={q} autoFocus={big}
          placeholder={game === "mtg" ? 't:dragon c:r cmc>=5   ·   o:"draw a card" id:u   ·   !"Force of Will"' : "Search by name, set:, number:"}
          className={`w-full rounded-lg border border-line bg-panel px-4 ${big ? "py-4 text-lg" : "py-2.5"} outline-none focus:border-brand`}
        />
        <button className="rounded-lg bg-brand px-5 font-semibold text-white">Search</button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {GAMES.map((g) => (
          <label key={g.id} className="cursor-pointer">
            <input type="radio" name="game" value={g.id} defaultChecked={g.id === game} className="peer sr-only" />
            <span className="rounded-full border border-line px-3 py-1 text-muted peer-checked:border-brand peer-checked:text-fg">{g.label}</span>
          </label>
        ))}
        <label className="ml-auto flex items-center gap-2 text-muted">
          <input type="checkbox" name="all" value="1" defaultChecked={all} /> Include cards not in stock
        </label>
        <Link href="/syntax" className="text-brand hover:underline">Syntax guide</Link>
      </div>
    </form>
  );
}
