import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { check } from "./checker.js";
import { valuesOf } from "./genetics.js";
import { build, buildPattern } from "./interpreter.js";
import { Canvas } from "./picture.js";
import { applyEdits, rename, symbolAt } from "./symbols.js";
import type { Pattern } from "./values.js";

const FLOWER = [
  "creature Flower",
  "gene rings = 3 in 1..6 step 1",
  "let size = 1",
  "repeat rings as i {",
  "  whorl(size)",
  "  size *= 0.7",
  "}",
  "part whorl(scale) {",
  "  gene petals = 7 in 3..16 step 1",
  "  repeat petals as i {",
  "    grow scale * size",
  "    lay",
  "  }",
  "}",
  "part leaf(scale) {",
  "  lay",
  "}",
  "gene limb = whorl from [whorl, leaf]",
  "limb(1)",
  "function half(x) {",
  "  return x / 2",
  "}",
  "forward half(rings)",
  "variant Big {",
  "  rings = 6",
  "  whorl.petals = 9",
  "}",
  "",
].join("\n");

const program = check(FLOWER);
/** The text at each span, with its line (1-based). */
const where = (spans: { start: number; end: number }[]) =>
  spans.map((s) => `${program.lines.line(s.start) + 1}:${FLOWER.slice(s.start, s.end)}`);
/** The offset of the `nth` (0-based) `word` in the text. */
function at(word: string, nth = 0): number {
  let i = -1;
  for (let k = 0; k <= nth; k++) i = FLOWER.indexOf(word, i + 1);
  return i + 1;
}

describe("symbolAt", () => {
  it("checks the example cleanly", () => {
    expect(program.diagnostics).toEqual([]);
  });

  it("finds a gene's declaration and every use, variants included", () => {
    const uses = symbolAt(program, at("rings", 2))!;
    expect(uses.name).toBe("rings");
    expect(where([uses.declaration])).toEqual(["2:rings"]);
    expect(where(uses.spans)).toEqual(["2:rings", "4:rings", "23:rings", "25:rings"]);
  });

  it("ties a part to its calls, its part genes and the names of its genes in variants", () => {
    const uses = symbolAt(program, at("whorl"))!;
    expect(where(uses.spans)).toEqual(["5:whorl", "8:whorl", "18:whorl", "18:whorl", "26:whorl"]);
    expect(where(symbolAt(program, at("petals", 2))!.spans)).toEqual([
      "9:petals",
      "10:petals",
      "26:petals",
    ]);
    expect(where(symbolAt(program, at("limb"))!.spans)).toEqual(["18:limb", "19:limb"]);
  });

  it("keeps variables apart by scope", () => {
    expect(where(symbolAt(program, at("i {"))!.spans)).toEqual(["4:i"]);
    expect(where(symbolAt(program, at("scale", 1))!.spans)).toEqual(["8:scale", "11:scale"]);
    // The global `size`, seen from the top level and from inside a part.
    expect(where(symbolAt(program, at("size"))!.spans)).toEqual([
      "3:size",
      "5:size",
      "6:size",
      "11:size",
    ]);
    expect(where(symbolAt(program, at("half"))!.spans)).toEqual(["20:half", "23:half"]);
  });

  it("has nothing for built-ins and keywords", () => {
    expect(symbolAt(program, at("lay"))).toBeUndefined();
    expect(symbolAt(program, at("grow"))).toBeUndefined();
  });
});

describe("rename", () => {
  const renamed = (offset: number, name: string) => {
    const r = rename(program, offset, name);
    if ("error" in r) throw new Error(r.error);
    return { text: applyEdits(FLOWER, r.edits), warning: r.warning };
  };

  it("renames a variable everywhere, and the result still checks", () => {
    const { text, warning } = renamed(at("size"), "scale_now");
    expect(text.match(/scale_now/g)).toHaveLength(4);
    expect(text).not.toMatch(/\bsize\b/);
    expect(warning).toBeUndefined();
    expect(check(text).diagnostics).toEqual([]);
  });

  it("warns that a gene or a part with genes no longer matches other creatures", () => {
    const gene = renamed(at("petals"), "count");
    expect(gene.text).toContain("whorl.count = 9");
    expect(gene.warning).toContain("`whorl.petals`");
    const part = renamed(at("whorl"), "crown");
    expect(part.text).toContain("crown.petals = 9");
    expect(part.text).toContain("gene limb = crown from [crown, leaf]");
    expect(part.warning).toContain("`whorl.petals`");
    expect(check(part.text).diagnostics).toEqual([]);
  });

  it("refuses names that aren't free", () => {
    const error = (offset: number, name: string) => {
      const r = rename(program, offset, name);
      return "error" in r ? r.error : undefined;
    };
    expect(error(at("size"), "2x")).toMatch(/isn't a name/);
    expect(error(at("size"), "repeat")).toMatch(/keyword/);
    expect(error(at("size"), "red")).toMatch(/built in/);
    expect(error(at("size"), "rings")).toMatch(/Can't rename/);
    // The top-level `i` renamed to `size` makes `size *= 0.7` change the loop's counter: an error.
    expect(error(at("i {"), "size")).toMatch(/can't be changed/);
    // The part's `i` renamed to `size` checks fine, but would hide the global `size` it uses.
    expect(error(at("i {", 1), "size")).toMatch(/change meaning/);
    expect(error(at("lay"), "x")).toMatch(/Only genes/);
  });
});

describe("renaming in the starter creatures", () => {
  const dir = new URL("../../../creatures/", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith(".genie"));

  // Every name is renamed and the creature built again, so a big creature takes a few seconds.
  it.each(files)(
    "%s draws the same with any of its names renamed",
    (file) => {
      const text = readFileSync(new URL(file, dir), "utf8");
      const before = check(text);
      // A pattern written in the file carries its code, which has the names in it: what it draws is
      // compared instead.
      const drawnPatterns = (_key: string, v: unknown) => {
        if (typeof v !== "object" || v === null || !("source" in v) || !v.source) return v;
        const { kind, seed, source, ...rest } = v as Pattern;
        const picture = buildPattern(check(source!.text), kind!, seed, new Canvas(16), {
          genes: new Map(source!.genes),
        }).picture;
        return { ...rest, seed, picture: picture && Array.from(picture.v) };
      };
      const shapes = (p: ReturnType<typeof check>) =>
        JSON.stringify(build(p, { genes: valuesOf(p.genes) }).shapes, drawnPatterns);
      const drawn = shapes(before);
      const declarations = new Map(before.references.map((r) => [r.declaration.start, r]));
      expect(declarations.size).toBeGreaterThan(0);
      for (const [start] of declarations) {
        const result = rename(before, start, "renamed_name");
        const name = text.slice(
          start,
          before.references.find((r) => r.span.start === start)!.span.end,
        );
        if ("error" in result) throw new Error(`${name}: ${result.error}`);
        const after = check(applyEdits(text, result.edits));
        expect(
          after.diagnostics.map((d) => d.message),
          name,
        ).toEqual([]);
        expect(shapes(after) === drawn, name).toBe(true);
      }
    },
    30_000,
  );
});
