// Every starter creature in creatures/ checks, builds in each of its variants and keeps its colours
// steady while morphing; every dance style in dances/ checks and works out. How they're spaced is up
// to whoever wrote them.

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { check } from "./checker.js";
import { valuesOf } from "./genetics.js";
import { build, buildDance } from "./interpreter.js";
import { colourJumps } from "./jumps.js";

const dir = new URL("../../../creatures/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".genie"));

describe.each(files)("%s", (file) => {
  const text = readFileSync(new URL(file, dir), "utf8");
  const program = check(text);

  it("checks without problems", () => {
    expect(program.diagnostics.map((d) => d.message)).toEqual([]);
  });

  it("builds, in every variant", () => {
    for (const v of [undefined, ...program.variants]) {
      const built = build(program, { genes: valuesOf(program.genes, v?.values) });
      expect(
        built.diagnostics.map((d) => d.message),
        v?.name,
      ).toEqual([]);
      expect(built.shapes.length, v?.name).toBeGreaterThan(0);
    }
  });

  // Building a creature hundreds of times takes several seconds on a slow machine.
  it("keeps its colours from jumping while morphing through its family", () => {
    expect(colourJumps(program)).toEqual([]);
  }, 60_000);
});

const danceDir = new URL("../../../dances/", import.meta.url);
const dances = readdirSync(danceDir).filter((f) => f.endsWith(".genie"));

describe.each(dances)("dance style %s", (file) => {
  const text = readFileSync(new URL(file, danceDir), "utf8");
  const program = check(text);

  it("checks without problems and works out", () => {
    expect(program.diagnostics.map((d) => d.message)).toEqual([]);
    const r = buildDance(program, { inputs: { music: { bass: 1, mid: 1, high: 1, level: 1 } } });
    expect(r.diagnostics.map((d) => d.message)).toEqual([]);
    expect(r.style?.morph).toBeDefined();
  });
});
