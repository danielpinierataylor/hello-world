// Download Scryfall "default_cards" bulk data and upsert into mtg_cards.
// Usage: npx tsx scripts/ingest-scryfall.ts [path/to/default_cards.jsonl.gz]
import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { sql, fetchJson, UA } from "./lib/db";

const num = (v: any) => (v == null || v === "" ? null : Number(v));

function toRow(c: any) {
  const faces: any[] = c.card_faces ?? [];
  const pick = (k: string) => c[k] ?? (faces.length ? faces.map((f) => f[k]).filter(Boolean).join(" // ") || null : null);
  const img = c.image_uris ?? faces[0]?.image_uris ?? {};
  return {
    id: c.id,
    oracle_id: c.oracle_id ?? faces[0]?.oracle_id ?? null,
    name: c.name,
    lang: c.lang,
    set_code: c.set,
    set_name: c.set_name,
    set_type: c.set_type,
    collector_number: c.collector_number,
    rarity: c.rarity,
    mana_cost: pick("mana_cost"),
    cmc: num(c.cmc),
    type_line: pick("type_line"),
    oracle_text: pick("oracle_text"),
    flavor_text: pick("flavor_text"),
    colors: c.colors ?? [...new Set(faces.flatMap((f) => f.colors ?? []))],
    color_identity: c.color_identity ?? [],
    keywords: c.keywords ?? [],
    power: pick("power"),
    toughness: pick("toughness"),
    loyalty: pick("loyalty"),
    legalities: c.legalities ?? {},
    finishes: c.finishes ?? [],
    frame_effects: c.frame_effects ?? [],
    promo_types: c.promo_types ?? [],
    border_color: c.border_color,
    frame: c.frame,
    full_art: !!c.full_art,
    promo: !!c.promo,
    reserved: !!c.reserved,
    game_changer: !!c.game_changer,
    released_at: c.released_at ?? null,
    artist: c.artist ?? faces[0]?.artist ?? null,
    image_normal: img.normal ?? null,
    image_small: img.small ?? null,
    image_back: faces[1]?.image_uris?.normal ?? null,
    usd: num(c.prices?.usd),
    usd_foil: num(c.prices?.usd_foil),
    usd_etched: num(c.prices?.usd_etched),
    tcgplayer_id: c.tcgplayer_id ?? null,
    tcgplayer_etched_id: c.tcgplayer_etched_id ?? null,
    edhrec_rank: c.edhrec_rank ?? null,
  };
}

async function openStream(path?: string): Promise<NodeJS.ReadableStream> {
  if (path) return createReadStream(path).pipe(createGunzip());
  const meta = await fetchJson<any>("https://api.scryfall.com/bulk-data/default-cards");
  const url = meta.jsonl_download_uri ?? meta.download_uri;
  console.log("downloading", url);
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  const body = Readable.fromWeb(r.body as any);
  return url.endsWith(".gz") ? body.pipe(createGunzip()) : body;
}

async function main() {
  const stream = await openStream(process.argv[2]);
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let batch: any[] = [];
  let n = 0;
  const flush = async () => {
    if (!batch.length) return;
    const cols = Object.keys(batch[0]);
    const set = cols.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`).join(", ");
    const q: any = sql;
    await q`INSERT INTO mtg_cards ${q(batch, cols)} ON CONFLICT (id) DO UPDATE SET ${sql.unsafe(set)}`;
    n += batch.length;
    batch = [];
    if (n % 20000 < 1000) console.log(n);
  };
  for await (const line of rl) {
    const t = line.trim().replace(/,$/, "");
    if (!t.startsWith("{")) continue;
    const c = JSON.parse(t);
    if (c.digital || c.layout === "art_series") continue;
    batch.push(toRow(c));
    if (batch.length >= 1000) await flush();
  }
  await flush();
  console.log("done", n);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
