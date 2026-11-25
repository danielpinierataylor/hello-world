import Link from "next/link";

const ROWS: [string, string, string][] = [
  ["Name", "bolt  ·  !\"Lightning Bolt\"", "Words match card names; ! means exact name"],
  ["Type", "t:dragon  ·  t:legendary t:creature", "Type line contains"],
  ["Rules text", "o:\"draw a card\"  ·  o:/destroy target (creature|artifact)/", "Oracle text; /…/ is a regular expression; ~ means the card's own name"],
  ["Colour", "c:rg  ·  c=u  ·  c:m  ·  c:c", "c: = at least these colours; = exactly; m multicolour; c colourless; guild names work (c:izzet)"],
  ["Identity", "id:bg  ·  id:esper", "Fits in a deck of that colour identity (Commander)"],
  ["Mana", "m:2gg  ·  m:{W}{U}", "Mana cost contains"],
  ["Mana value", "cmc>=5  ·  mv=3", "Also pow, tou, loy — and pow>tou"],
  ["Rarity", "r:m  ·  r>=rare", "common, uncommon, rare, mythic"],
  ["Set", "s:mh3  ·  set:\"Modern Horizons\"", "Set code or set name"],
  ["Format", "f:modern  ·  banned:legacy", "Legal / banned / restricted in a format"],
  ["Keyword", "kw:flying", "Keyword abilities"],
  ["Artist", "a:\"rebecca guay\"", ""],
  ["Price", "usd>20  ·  usd<1", "TCGplayer market price (US$)"],
  ["Flags", "is:commander  ·  is:foil  ·  is:borderless  ·  is:showcase  ·  is:reserved  ·  is:gamechanger", ""],
  ["Logic", "t:goblin (c:r or c:b) -o:haste", "Space = AND, or, parentheses, - to exclude"],
  ["Sort", "order:usd  ·  order:cmc  ·  order:edhrec  ·  order:released", ""],
];

export default function Syntax() {
  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-2xl font-bold">Search syntax</h1>
      <p className="text-muted">Magic search works like Scryfall. Pokémon, One Piece and Riftbound support name, set:, number: and rarity:.</p>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <tbody>
            {ROWS.map(([k, ex, d]) => (
              <tr key={k} className="border-b border-line last:border-0 align-top">
                <td className="p-3 font-semibold whitespace-nowrap">{k}</td>
                <td className="p-3 font-mono text-xs">
                  {ex.split("  ·  ").map((e) => (
                    <Link key={e} href={`/search?q=${encodeURIComponent(e)}`} className="mr-3 inline-block text-brand hover:underline">{e}</Link>
                  ))}
                </td>
                <td className="p-3 text-muted">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
