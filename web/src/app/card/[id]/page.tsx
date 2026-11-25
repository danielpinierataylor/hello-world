import { notFound } from "next/navigation";
import Link from "next/link";
import { sql } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [card] = await sql`SELECT * FROM mtg_cards WHERE id = ${id}`;
  if (!card) notFound();
  const { fx, buylist } = await getSettings();
  const pct = buylist.games.mtg ?? buylist.default;

  // Every printing of this card we have listed, with stock + TCGplayer market for that exact finish
  const listings = await sql`
    SELECT l.title, l.finish, l.sub_type, l.available, l.condition, l.condition_label, l.price_aud, l.on_shopify,
           c.id AS card_id, c.set_name, c.set_code, c.collector_number, c.image_small, pr.market_usd
    FROM mtg_cards c
    JOIN listings l ON l.scryfall_id = c.id
    LEFT JOIN tcg_prices pr ON pr.product_id = l.tcg_product_id AND pr.sub_type = l.sub_type
    WHERE c.oracle_id = ${card.oracle_id} AND (l.available > 0 OR l.condition = 'NM')
    ORDER BY (l.available > 0) DESC, pr.market_usd DESC NULLS LAST, l.condition`;

  const money = (n: number) => `A$${n.toFixed(2)}`;

  return (
    <div className="grid gap-8 md:grid-cols-[320px_1fr]">
      <div className="space-y-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={card.image_normal} alt={card.name} className="w-full rounded-[4.5%]" />
        {card.image_back && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.image_back} alt={`${card.name} (back)`} className="w-full rounded-[4.5%]" />
        )}
      </div>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">{card.name} <span className="text-lg text-muted font-normal">{card.mana_cost}</span></h1>
          <p className="text-muted">{card.type_line}</p>
          <p className="mt-3 whitespace-pre-line leading-relaxed">{card.oracle_text}</p>
          {card.power && <p className="mt-2 font-semibold">{card.power}/{card.toughness}</p>}
        </div>

        <section className="space-y-2">
          <h2 className="font-semibold">Our stock</h2>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr className="border-b border-line">
                  <th className="p-2">Printing</th><th className="p-2">Finish</th><th className="p-2">Cond.</th><th className="p-2">Qty</th>
                  <th className="p-2">Our price</th><th className="p-2">We pay (credit / cash)</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((l, i) => {
                  const m = l.market_usd == null ? null : Number(l.market_usd) * fx;
                  const mult = buylist.conditions[l.condition] ?? null;
                  return (
                    <tr key={i} className={`border-b border-line last:border-0 ${l.available > 0 ? "" : "text-muted"}`}>
                      <td className="p-2"><Link href={`/card/${l.card_id}`} className="hover:underline">{l.set_name} #{l.collector_number}</Link></td>
                      <td className="p-2">{l.finish === "Normal" ? "Regular" : l.finish}</td>
                      <td className="p-2" title={l.condition_label}>{l.condition}{l.available > 0 && !l.on_shopify && <span className="ml-1 text-amber-400" title="Not on Shopify — Game Locker only">●</span>}</td>
                      <td className="p-2">{l.available > 0 ? l.available : "—"}</td>
                      <td className="p-2 font-semibold">{l.price_aud == null ? "—" : money(Number(l.price_aud))}</td>
                      <td className="p-2">{m == null || mult == null ? "—" : `${money(m * pct.credit * mult)} / ${money(m * pct.cash * mult)}`}</td>
                    </tr>
                  );
                })}
                {listings.length === 0 && <tr><td className="p-3 text-muted" colSpan={6}>Not in stock right now.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">
            Buy prices: {Math.round(pct.credit * 100)}% store credit / {Math.round(pct.cash * 100)}% cash of TCGplayer market at A${fx.toFixed(2)}/US$,
            adjusted by condition ({Object.entries(buylist.conditions).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(", ")}).
            <span className="text-amber-400"> ●</span> = Game Locker only (not on Shopify).
          </p>
        </section>
      </div>
    </div>
  );
}
