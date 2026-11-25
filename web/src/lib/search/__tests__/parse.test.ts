import { describe, it, expect } from "vitest";
import { parse } from "../parse";
import { compile } from "../compile";

describe("parse", () => {
  it("bare words AND together", () => {
    expect(parse("lightning bolt")).toEqual({ kind: "and", children: [
      { kind: "term", key: null, op: ":", value: "lightning", regex: false },
      { kind: "term", key: null, op: ":", value: "bolt", regex: false },
    ] });
  });
  it("keys, operators, quotes, negation, or, parens", () => {
    const n = parse('t:dragon (c:r or c:g) -o:"flying" cmc>=5');
    expect(n.kind).toBe("and");
    const kids = (n as { children: unknown[] }).children;
    expect(kids[0]).toMatchObject({ key: "t", value: "dragon" });
    expect(kids[1]).toMatchObject({ kind: "or" });
    expect(kids[2]).toMatchObject({ kind: "not", child: { key: "o", value: "flying" } });
    expect(kids[3]).toMatchObject({ key: "cmc", op: ">=", value: "5" });
  });
  it("exact name", () => {
    expect(parse('!"Force of Will"')).toMatchObject({ key: "name", exact: true, value: "Force of Will" });
  });
  it("regex values", () => {
    expect(parse("o:/draw (a|two) cards?/")).toMatchObject({ key: "o", regex: true, value: "draw (a|two) cards?" });
  });
  it("tolerates junk", () => {
    expect(() => parse("((( or ) -")).not.toThrow();
    expect(compile(") (").where).toBeTruthy();
  });
});

describe("compile", () => {
  it("parameterises values (no injection)", () => {
    const c = compile(`o:"'; drop table x; --"`);
    expect(c.where).not.toContain("drop table");
    expect(c.params).toContain("%'; drop table x; --%");
  });
  it("warns on unknown keys", () => {
    expect(compile("zzz:1").warnings[0]).toMatch(/Unknown keyword/);
  });
  it("identity is subset, colour is superset", () => {
    expect(compile("id:rg").where).toContain("<@");
    expect(compile("c:rg").where).toContain("@>");
  });
  it("in-stock flag", () => {
    expect(compile("is:instock bolt").flags.inStock).toBe(true);
  });
});
