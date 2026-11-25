// Compile a parsed Scryfall-style query into a parameterised SQL WHERE clause.
// Magic compiles against mtg_cards (alias c); other games against tcg_products (alias p) + tcg_groups (alias g).
import { parse, type Node, type Op } from "./parse";

export type Compiled = { where: string; params: unknown[]; warnings: string[]; flags: { inStock?: boolean } };

class Ctx {
  params: unknown[] = [];
  warnings: string[] = [];
  flags: { inStock?: boolean } = {};
  p(v: unknown) { this.params.push(v); return `$${this.params.length}`; }
}

const SQL_OP: Record<Op, string> = { ":": "=", "=": "=", "!=": "<>", "<": "<", "<=": "<=", ">": ">", ">=": ">=" };
const like = (s: string) => `%${s.replace(/[\\%_]/g, (m) => "\\" + m)}%`;

// ---------- colours ----------
const COLOR_NAMES: Record<string, string> = {
  white: "W", blue: "U", black: "B", red: "R", green: "G",
  azorius: "WU", dimir: "UB", rakdos: "BR", gruul: "RG", selesnya: "GW",
  orzhov: "WB", izzet: "UR", golgari: "BG", boros: "RW", simic: "GU",
  bant: "GWU", esper: "WUB", grixis: "UBR", jund: "BRG", naya: "RGW",
  abzan: "WBG", jeskai: "URW", sultai: "BGU", mardu: "RWB", temur: "GUR",
  wubrg: "WUBRG", rainbow: "WUBRG", fivecolor: "WUBRG",
};

function colorCond(col: string, op: Op, raw: string, isIdentity: boolean, ctx: Ctx): string {
  const v = raw.toLowerCase();
  if (/^\d+$/.test(v)) return `cardinality(${col}) ${SQL_OP[op]} ${ctx.p(Number(v))}`;
  if (v === "c" || v === "colorless") return op === "!=" ? `cardinality(${col}) > 0` : `cardinality(${col}) = 0`;
  if (v === "m" || v === "multicolor") return `cardinality(${col}) >= 2`;
  const letters = [...new Set((COLOR_NAMES[v] ?? v.toUpperCase()).split("").filter((ch) => "WUBRG".includes(ch)))];
  if (!letters.length) { ctx.warnings.push(`Unknown colour "${raw}"`); return "TRUE"; }
  const arr = ctx.p(letters);
  // Scryfall: c:X means "at least X" (superset); id:X means "within X" (subset, i.e. playable in X deck)
  const effective: Op = op === ":" ? (isIdentity ? "<=" : ">=") : op;
  switch (effective) {
    case "=": return `(${col} @> ${arr}::text[] AND ${col} <@ ${arr}::text[])`;
    case "!=": return `NOT (${col} @> ${arr}::text[] AND ${col} <@ ${arr}::text[])`;
    case ">=": return `${col} @> ${arr}::text[]`;
    case "<=": return `${col} <@ ${arr}::text[]`;
    case ">": return `(${col} @> ${arr}::text[] AND cardinality(${col}) > ${letters.length})`;
    case "<": return `(${col} <@ ${arr}::text[] AND cardinality(${col}) < ${letters.length})`;
    default: return "TRUE";
  }
}

// ---------- helpers ----------
const RARITY = ["common", "uncommon", "rare", "mythic", "special", "bonus"];
const RARITY_ABBR: Record<string, string> = { c: "common", u: "uncommon", r: "rare", m: "mythic", s: "special", b: "bonus" };
const numText = (col: string) => `(CASE WHEN ${col} ~ '^[0-9]+(\\.[0-9]+)?$' THEN ${col}::numeric END)`;
const NUM_FIELDS: Record<string, string> = {
  cmc: "c.cmc", mv: "c.cmc", manavalue: "c.cmc",
  pow: numText("c.power"), power: numText("c.power"),
  tou: numText("c.toughness"), toughness: numText("c.toughness"),
  loy: numText("c.loyalty"), loyalty: numText("c.loyalty"),
};
const FORMATS = ["standard", "pioneer", "modern", "legacy", "vintage", "commander", "pauper", "historic", "brawl", "standardbrawl", "alchemy", "explorer", "timeless", "oathbreaker", "penny", "paupercommander", "duel", "oldschool", "premodern", "predh", "future", "gladiator"];

function textMatch(col: string, op: Op, v: string, regex: boolean | undefined, ctx: Ctx): string {
  if (regex) return `${col} ~* ${ctx.p(v)}`;
  if (op === "=") return `lower(${col}) = lower(${ctx.p(v)})`;
  if (op === "!=") return `coalesce(${col}, '') NOT ILIKE ${ctx.p(like(v))}`;
  return `${col} ILIKE ${ctx.p(like(v))}`;
}

function manaToSymbols(v: string): string {
  if (v.includes("{")) return v.toUpperCase();
  // "2gg" -> "{2}{G}{G}", "wu" -> "{W}{U}"; hybrid needs braces
  return (v.toUpperCase().match(/\d+|[WUBRGCXSP]/g) ?? []).map((s) => `{${s}}`).join("");
}

// ---------- Magic ----------
function mtgTerm(n: Extract<Node, { kind: "term" }>, ctx: Ctx): string {
  const { op, value: v, regex } = n;
  const key = n.key ?? "name";
  switch (key) {
    case "name": case "n":
      if (n.exact) return `(lower(c.name) = lower(${ctx.p(v)}) OR lower(split_part(c.name, ' // ', 1)) = lower(${ctx.p(v)}))`;
      return textMatch("c.name", op, v, regex, ctx);
    case "t": case "type": return textMatch("c.type_line", op, v, regex, ctx);
    case "o": case "oracle": case "fo": case "fulloracle": {
      const col = v.includes("~") ? "replace(c.oracle_text, c.name, '~')" : "c.oracle_text";
      return textMatch(col, op, v, regex, ctx);
    }
    case "ft": case "flavor": return textMatch("c.flavor_text", op, v, regex, ctx);
    case "a": case "artist": return textMatch("c.artist", op, v, regex, ctx);
    case "kw": case "keyword": return `EXISTS (SELECT 1 FROM unnest(c.keywords) k WHERE k ILIKE ${ctx.p(like(v))})`;
    case "c": case "color": case "colors": return colorCond("c.colors", op, v, false, ctx);
    case "id": case "identity": case "ci": case "commander": return colorCond("c.color_identity", op, v, true, ctx);
    case "m": case "mana": {
      const sym = manaToSymbols(v);
      return op === "=" ? `c.mana_cost = ${ctx.p(sym)}` : `c.mana_cost ILIKE ${ctx.p(like(sym))}`;
    }
    case "r": case "rarity": {
      const r = RARITY_ABBR[v.toLowerCase()] ?? v.toLowerCase();
      const idx = RARITY.indexOf(r);
      if (idx < 0) { ctx.warnings.push(`Unknown rarity "${v}"`); return "TRUE"; }
      if (op === ":" || op === "=") return `c.rarity = ${ctx.p(r)}`;
      if (op === "!=") return `c.rarity <> ${ctx.p(r)}`;
      return `array_position(${ctx.p(RARITY)}::text[], c.rarity) ${SQL_OP[op]} ${idx + 1}`;
    }
    case "s": case "e": case "set": case "edition":
      return `(c.set_code = lower(${ctx.p(v)}) OR c.set_name ILIKE ${ctx.p(like(v))})`;
    case "cn": case "number": return `c.collector_number ${SQL_OP[op]} ${ctx.p(v)}`;
    case "f": case "format": case "legal": case "banned": case "restricted": {
      const fmt = v.toLowerCase();
      if (!FORMATS.includes(fmt)) ctx.warnings.push(`Unknown format "${v}"`);
      const status = key === "banned" ? `= 'banned'` : key === "restricted" ? `= 'restricted'` : `IN ('legal', 'restricted')`;
      return `(c.legalities ->> ${ctx.p(fmt)}) ${status}`;
    }
    case "year": return `extract(year FROM c.released_at) ${SQL_OP[op]} ${ctx.p(Number(v))}`;
    case "date": return `c.released_at ${SQL_OP[op]} ${ctx.p(v)}::date`;
    case "usd": case "price": {
      const col = "coalesce(c.usd, c.usd_foil, c.usd_etched)";
      return `${col} ${SQL_OP[op]} ${ctx.p(Number(v))}`;
    }
    case "is": case "has": case "not": {
      const cond = isCond(v.toLowerCase(), ctx);
      return key === "not" ? `NOT (${cond})` : cond;
    }
    case "in": case "stock":
      if (key === "stock" || v.toLowerCase() === "stock") { ctx.flags.inStock = true; return "TRUE"; }
      ctx.warnings.push(`Unsupported "in:${v}"`); return "TRUE";
    case "game": case "unique": case "order": case "dir": case "prefer": case "include":
      return "TRUE"; // display options, handled elsewhere
  }
  if (NUM_FIELDS[key]) {
    const rhsField = NUM_FIELDS[v.toLowerCase()];
    const rhs = rhsField ?? ctx.p(Number(v));
    if (!rhsField && Number.isNaN(Number(v))) { ctx.warnings.push(`"${key}" needs a number`); return "TRUE"; }
    return `${NUM_FIELDS[key]} ${SQL_OP[op]} ${rhs}`;
  }
  ctx.warnings.push(`Unknown keyword "${key}"`);
  return "TRUE";
}

function isCond(v: string, ctx: Ctx): string {
  switch (v) {
    case "foil": return `'foil' = ANY(c.finishes)`;
    case "nonfoil": return `'nonfoil' = ANY(c.finishes)`;
    case "etched": return `'etched' = ANY(c.finishes)`;
    case "fullart": case "full": return `c.full_art`;
    case "promo": return `c.promo`;
    case "reserved": return `c.reserved`;
    case "gamechanger": case "gc": return `c.game_changer`;
    case "borderless": return `c.border_color = 'borderless'`;
    case "extendedart": case "extended": return `'extendedart' = ANY(c.frame_effects)`;
    case "showcase": return `'showcase' = ANY(c.frame_effects)`;
    case "retro": case "oldframe": return `c.frame IN ('1993', '1997')`;
    case "dfc": case "mdfc": case "transform": return `c.image_back IS NOT NULL`;
    case "commander":
      return `((c.type_line ILIKE '%legendary%creature%' OR c.oracle_text ILIKE '%can be your commander%') AND (c.legalities ->> 'commander') IN ('legal','restricted'))`;
    case "permanent": return `c.type_line !~* '\\m(instant|sorcery)\\M'`;
    case "spell": return `c.type_line !~* '\\mland\\M'`;
    case "instock": case "stock": ctx.flags.inStock = true; return "TRUE";
  }
  ctx.warnings.push(`Unknown "is:${v}"`);
  return "TRUE";
}

// ---------- other games (TCGplayer catalogue) ----------
function tcgTerm(n: Extract<Node, { kind: "term" }>, ctx: Ctx): string {
  const { op, value: v, regex } = n;
  const key = n.key ?? "name";
  switch (key) {
    case "name": case "n":
      if (n.exact) return `lower(p.name) = lower(${ctx.p(v)})`;
      return textMatch("p.name", op, v, regex, ctx);
    case "s": case "e": case "set": return `(g.name ILIKE ${ctx.p(like(v))} OR g.abbreviation ILIKE ${ctx.p(v)})`;
    case "cn": case "number": return textMatch("p.number", op, v, regex, ctx);
    case "r": case "rarity": return textMatch("p.rarity", op, v, regex, ctx);
    case "t": case "type": return `(p.extended ->> 'CardType' ILIKE ${ctx.p(like(v))} OR p.extended ->> 'Card Type' ILIKE ${ctx.p(like(v))} OR p.extended ->> 'Stage' ILIKE ${ctx.p(like(v))})`;
    case "o": case "oracle": case "text": return `(p.extended ->> 'Description') ILIKE ${ctx.p(like(v))}`;
    case "c": case "color": return `(p.extended ->> 'Color') ILIKE ${ctx.p(like(v))}`;
    case "is": case "in": case "stock":
      if (["instock", "stock"].includes(v.toLowerCase()) || key === "stock") { ctx.flags.inStock = true; return "TRUE"; }
      ctx.warnings.push(`Unknown "${key}:${v}"`); return "TRUE";
    case "game": case "unique": case "order": return "TRUE";
  }
  ctx.warnings.push(`"${key}:" isn't supported for this game yet`);
  return "TRUE";
}

function compileNode(n: Node, ctx: Ctx, term: (t: Extract<Node, { kind: "term" }>, ctx: Ctx) => string): string {
  switch (n.kind) {
    case "and": return n.children.length ? "(" + n.children.map((c) => compileNode(c, ctx, term)).join(" AND ") + ")" : "TRUE";
    case "or": return "(" + n.children.map((c) => compileNode(c, ctx, term)).join(" OR ") + ")";
    case "not": return `NOT coalesce(${compileNode(n.child, ctx, term)}, FALSE)`;
    case "term": return term(n, ctx);
  }
}

export function compile(query: string, game: "mtg" | "tcg" = "mtg"): Compiled {
  const ctx = new Ctx();
  const q = query.trim();
  const where = q ? compileNode(parse(q), ctx, game === "mtg" ? mtgTerm : tcgTerm) : "TRUE";
  return { where, params: ctx.params, warnings: ctx.warnings, flags: ctx.flags };
}
