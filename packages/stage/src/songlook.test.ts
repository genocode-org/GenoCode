import { readFileSync } from "node:fs";
import { check, valuesEqual } from "@genocode/core";
import { describe, expect, it } from "vitest";
import { familyOf, fromProgram } from "./creature.js";
import { songLook } from "./songlook.js";

const family = (name: string) =>
  familyOf(
    fromProgram(
      check(readFileSync(new URL(`../../../creatures/${name}.genie`, import.meta.url), "utf8")),
    ),
  );

const differs = (a: ReturnType<typeof family>, b: ReturnType<typeof family>) =>
  [...a[0]!.values].filter(([name, v]) => !valuesEqual(v, b[0]!.values.get(name)!)).map(([n]) => n);

describe("a look for each song", () => {
  const tentacles = family("Tentacles");

  it("is the same every time for the same song", () => {
    const a = songLook(tentacles, "Billie Jean.mp3", new Set());
    const b = songLook(tentacles, "Billie Jean.mp3", new Set());
    expect(differs(a, b)).toEqual([]);
  });

  it("is different for another song, with a new seed", () => {
    const a = songLook(tentacles, "Billie Jean.mp3", new Set());
    const b = songLook(tentacles, "Thriller.mp3", new Set());
    expect(differs(a, b)).toContain("seed");
    expect(differs(a, tentacles)).toContain("seed");
  });

  it("keeps the genes that change through the family's loop", () => {
    const look = songLook(tentacles, "Billie Jean.mp3", new Set());
    look.forEach((m, i) =>
      expect(valuesEqual(m.values.get("age")!, tentacles[i]!.values.get("age")!)).toBe(true),
    );
    // Every member gets the same new values for the rest.
    for (const m of look) expect(m.values.get("seed")).toEqual(look[0]!.values.get("seed"));
  });

  it("leaves locked genes alone", () => {
    const locked = new Set(tentacles[0]!.program.genes.map((g) => g.fullName));
    expect(differs(songLook(tentacles, "Thriller.mp3", locked), tentacles)).toEqual([]);
  });

  it("leaves a creature that says breed off as it is", () => {
    const geno = family("Geno");
    expect(differs(songLook(geno, "Thriller.mp3", new Set()), geno)).toEqual([]);
  });
});
