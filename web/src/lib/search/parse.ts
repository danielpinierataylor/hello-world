// Scryfall-style query parser.
// Grammar (loosely): query := orExpr ; orExpr := andExpr ("or" andExpr)* ; andExpr := unary+ ;
// unary := "-" unary | "(" orExpr ")" | term ; term := key op value | "!"name | word | "quoted words"

export type Op = ":" | "=" | "!=" | "<" | "<=" | ">" | ">=";

export type Node =
  | { kind: "and"; children: Node[] }
  | { kind: "or"; children: Node[] }
  | { kind: "not"; child: Node }
  | { kind: "term"; key: string | null; op: Op; value: string; exact?: boolean; regex?: boolean };

type Tok =
  | { t: "lparen" }
  | { t: "rparen" }
  | { t: "or" }
  | { t: "neg" }
  | { t: "term"; node: Node & { kind: "term" } };

const KEY_RE = /^([a-zA-Z]+)(:|!=|<=|>=|=|<|>)/;

function readValue(src: string, i: number): [string, number, boolean] {
  // returns [value, nextIndex, isRegex]
  if (src[i] === '"') {
    let j = i + 1, out = "";
    while (j < src.length && src[j] !== '"') {
      if (src[j] === "\\" && j + 1 < src.length) { out += src[j + 1]; j += 2; continue; }
      out += src[j++];
    }
    return [out, j + 1, false];
  }
  if (src[i] === "/") {
    let j = i + 1, out = "";
    while (j < src.length && src[j] !== "/") {
      if (src[j] === "\\" && j + 1 < src.length) { out += src[j] + src[j + 1]; j += 2; continue; }
      out += src[j++];
    }
    return [out, j + 1, true];
  }
  let j = i;
  while (j < src.length && !/[\s()]/.test(src[j])) j++;
  return [src.slice(i, j), j, false];
}

export function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === "(") { toks.push({ t: "lparen" }); i++; continue; }
    if (ch === ")") { toks.push({ t: "rparen" }); i++; continue; }
    if (ch === "-" && i + 1 < src.length && !/\s/.test(src[i + 1])) { toks.push({ t: "neg" }); i++; continue; }
    if (ch === "!") {
      const [v, j] = readValue(src, i + 1);
      toks.push({ t: "term", node: { kind: "term", key: "name", op: "=", value: v, exact: true } });
      i = j; continue;
    }
    const rest = src.slice(i);
    const km = rest.match(KEY_RE);
    if (km) {
      const [v, j, rx] = readValue(src, i + km[0].length);
      toks.push({ t: "term", node: { kind: "term", key: km[1].toLowerCase(), op: km[2] as Op, value: v, regex: rx } });
      i = j; continue;
    }
    const [v, j, rx] = readValue(src, i);
    if (!rx && v.toLowerCase() === "or" && ch !== '"') toks.push({ t: "or" });
    else if (!rx && v.toLowerCase() === "and" && ch !== '"') { /* implicit anyway */ }
    else if (v.length) toks.push({ t: "term", node: { kind: "term", key: null, op: ":", value: v, regex: rx } });
    i = Math.max(j, i + 1);
  }
  return toks;
}

export function parse(src: string): Node {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];

  function orExpr(): Node {
    const parts = [andExpr()];
    while (peek()?.t === "or") { p++; parts.push(andExpr()); }
    return parts.length === 1 ? parts[0] : { kind: "or", children: parts };
  }
  function andExpr(): Node {
    const parts: Node[] = [];
    while (p < toks.length && peek().t !== "or" && peek().t !== "rparen") {
      const u = unary();
      if (u) parts.push(u);
    }
    return parts.length === 1 ? parts[0] : { kind: "and", children: parts };
  }
  function unary(): Node | null {
    const tk = toks[p++];
    if (!tk) return null;
    if (tk.t === "neg") { const c = unary(); return c ? { kind: "not", child: c } : null; }
    if (tk.t === "lparen") {
      const e = orExpr();
      if (peek()?.t === "rparen") p++;
      return e;
    }
    if (tk.t === "term") return tk.node;
    return null; // stray ")" or "or"
  }

  const out: Node[] = [];
  while (p < toks.length) {
    out.push(orExpr());
    if (peek()?.t === "rparen") p++; // tolerate unbalanced ")"
  }
  const flat = out.filter((n) => !(n.kind === "and" && n.children.length === 0));
  return flat.length === 1 ? flat[0] : { kind: "and", children: flat };
}
