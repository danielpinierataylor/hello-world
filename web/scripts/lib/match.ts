// Parse Game Locker listing titles and match them to TCGplayer products.
// Game Locker titles follow TCGplayer naming:  "<Name>[ <Descriptor>] <Number> (<Set>)[  - <Finish>]"
//   e.g. "Choked Estuary  268★/617 (Universes Beyond: Warhammer 40,000)  - Surge Foil"

export type ParsedTitle = { name: string; number: string | null; set: string; finish: string | null };

export function parseTitle(title: string): ParsedTitle | null {
  const t = title.replace(/\s+/g, " ").trim();
  // set = last balanced (...) group before optional " - finish"
  const m = t.match(/^(.*?)\s*\(((?:[^()]|\([^()]*\))+)\)\s*(?:-\s*([^()]+))?$/);
  if (!m) return null;
  let head = m[1].trim();
  const set = m[2].trim();
  const finish = m[3]?.trim() || null;
  let number: string | null = null;
  const nm = head.match(/^(.*\S)\s+(\S*\d\S*)$/);
  if (nm) { head = nm[1]; number = nm[2]; }
  return { name: head, number, set, finish };
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

/** Normalise a collector number for comparison: "049/249" -> "49", "268★" -> "268", "OP01-001" stays. */
export function normNumber(n: string | null | undefined): string {
  if (!n) return "";
  let s = n.trim().split("/")[0].replace(/[★☆†]/g, "");
  s = s.replace(/^0+(?=\d)/, "");
  return s.toLowerCase();
}

/** Looser comparison: "RAV-49" (The List) -> "49", "194s" (prerelease) -> "194". */
export function looseNumber(n: string): string {
  const last = n.includes("-") && !/^[a-z]{2,4}\d{2}-\d+/.test(n) ? n.split("-").pop()! : n;
  return last.replace(/(?<=\d)[a-z]+$/, "").replace(/^0+(?=\d)/, "");
}

/** Normalised set name for fuzzy group lookup when Game Locker and TCGplayer spell a set differently. */
export function setKey(s: string): string[] {
  return norm(s)
    .replace(/\bst ?\d+\b/g, " ").replace(/\bstarter deck( ex)? \d+\b/g, "starter deck$1")
    .split(" ").filter((w) => w && !["the", "of", "and", "a"].includes(w))
    .map((w) => w.replace(/s$/, ""));
}

export function setSimilarity(a: string, b: string): number {
  const A = new Set(setKey(a)), B = new Set(setKey(b));
  const inter = [...A].filter((x) => B.has(x)).length;
  return inter / Math.max(1, new Set([...A, ...B]).size);
}

export type Candidate = { product_id: number; name: string; number: string | null; subTypes: string[] };

const SUBTYPES = ["1st Edition Holofoil", "Unlimited Holofoil", "Reverse Holofoil", "1st Edition", "Unlimited", "Holofoil", "Foil", "Normal"];

/** Map a Game Locker finish ("Extended Art Foil", "Poke Ball Holofoil", "Unlimited Normal") to a TCGplayer sub type. */
export function pickSubType(finish: string | null, available: string[]): string | null {
  if (!available.length) return null;
  const f = (finish ?? "").toLowerCase();
  const wanted =
    SUBTYPES.find((s) => f.endsWith(s.toLowerCase())) ??
    (/reverse/.test(f) ? "Reverse Holofoil" : /\bfoil\b/.test(f) ? "Foil" : /holo/.test(f) ? "Holofoil" : "Normal");
  if (available.includes(wanted)) return wanted;
  // GL writes "Unlimited Normal" -> TCG "Unlimited"; "1st Edition Normal" -> "1st Edition"
  const stripped = wanted.replace(/ Normal$/, "");
  if (available.includes(stripped)) return stripped;
  if (wanted === "Foil" && available.includes("Holofoil")) return "Holofoil";
  if (wanted === "Holofoil" && available.includes("Foil")) return "Foil";
  if (available.length === 1) return available[0];
  return available.includes("Normal") ? "Normal" : available[0];
}

/** Score candidates in the right group; higher is better. */
export function scoreCandidate(p: ParsedTitle, c: Candidate): number {
  let score = 0;
  const pn = normNumber(p.number), cn = normNumber(c.number);
  if (pn && cn && pn === cn) score += 100;
  else if (pn && cn && looseNumber(pn) === looseNumber(cn)) score += 80;
  else if (pn && cn) score -= 50;
  const cname = norm(c.name);
  const base = norm(c.name.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+-\s+.*$/, ""));
  let full = norm(`${p.name} ${p.finish ?? ""}`);
  if (full.includes("alternate art")) full += " parallel"; // One Piece: TCGplayer calls alt arts "Parallel"
  const pname = norm(p.name);
  if (pname === cname) score += cn ? 30 : 70; // old sets have no collector numbers on TCGplayer
  else if (pname.startsWith(base) || full.startsWith(base)) score += 25;
  else if (cname.includes(pname) || pname.includes(base)) score += 10;
  // descriptors in TCG name, e.g. "(Extended Art)" / "(Surge Foil)" should appear in GL name/finish
  for (const d of c.name.match(/\(([^)]+)\)/g) ?? []) {
    const dn = norm(d);
    if (!dn || /^\d+$/.test(dn)) continue;
    const words = new Set(full.split(" "));
    score += dn.split(" ").every((w) => words.has(w)) ? 20 : -20; // word-order agnostic: "Etched Foil" ~ "Foil Etched"
  }
  return score;
}
