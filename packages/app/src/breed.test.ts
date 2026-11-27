import { check, mutate, type Value } from "@genocode/core";
import { afterEach, describe, expect, it } from "vitest";
import { pinned } from "./breed.js";
import { familyOf, fromProgram } from "@genocode/stage";
import { locked } from "./panel.js";

const shape = (name: "cube" | "ring" | "cone"): Value => ({ type: "shape", name });

const program = check(`creature Corners

gene gem  = cube from [cube, ball, donut, ring]
gene size = 1    in 0.2..3

shape gem scale size

variant Crystal {
  gem  = ring
  size = 2
}
`);

describe("locked genes in the breeding grid", () => {
  afterEach(() => locked.clear());

  it("give a variant that sets one the locked value", () => {
    locked.set("gem", shape("cube"));
    const [, crystal] = familyOf(fromProgram(program)).map(pinned);
    expect(crystal!.values.get("gem")).toEqual(shape("cube"));
    // Its other genes stay its own.
    expect(crystal!.values.get("size")).toBe(2);
  });

  it("keep the locked value in mutations of a variant", () => {
    locked.set("gem", shape("cube"));
    const [, crystal] = familyOf(fromProgram(program));
    for (let i = 0; i < 20; i++) {
      const values = mutate(program.genes, crystal!.values, {
        strength: 1,
        random: Math.random,
        locked: new Set(locked.keys()),
      });
      expect(pinned({ program, values }).values.get("gem")).toEqual(shape("cube"));
    }
  });

  it("leave a value the gene can no longer take alone", () => {
    locked.set("gem", shape("cone"));
    const [, crystal] = familyOf(fromProgram(program)).map(pinned);
    expect(crystal!.values.get("gem")).toEqual(shape("ring"));
  });
});
