import { describe, expect, it } from "vitest";
import { check } from "./checker.js";
import { errors } from "./test-helpers.js";

/** Expects exactly one error containing `text`. */
function rejects(body: string, text: string): void {
  const found = errors(body);
  expect(found, `errors for:\n${body}`).toHaveLength(1);
  expect(found[0]).toContain(text);
}

describe("checker: names and variables", () => {
  it("accepts a correct creature", () => {
    expect(errors("let a = 1\na += 2\nforward a")).toEqual([]);
  });

  it("finds unknown names and variables used before their let", () => {
    rejects("forward a", "nothing called `a`");
    rejects("forward a\nlet a = 1", "nothing called `a`");
    rejects("a = 1", "no variable called `a`");
  });

  it("refuses built-in names and duplicates", () => {
    rejects("let length = 1", "built in");
    rejects("let a = 1\nlet a = 2", "already a variable");
    rejects("gene g = 1 in 0..2\nlet g = 1", "already a gene");
    rejects("part p {\n  lay\n}\nlet p = 1", "already a part");
    rejects("part ring {\n  lay\n}", "built in");
  });

  it("lets inner blocks hide outer variables", () => {
    expect(errors("let a = 1\nbranch {\n  let a = 2\n}")).toEqual([]);
  });

  it("protects genes, loop variables and built-ins from assignment", () => {
    rejects("gene g = 1 in 0..2\ng = 1", "genes can't be changed");
    rejects("repeat 3 as i {\n  i = 2\n}", "can't be changed");
    rejects("pi = 3", "built in");
  });

  it("only knows `side` inside symmetric", () => {
    rejects("forward side", "only exists inside a `symmetric`");
    expect(errors("symmetric x {\n  yaw 10 * side\n}")).toEqual([]);
  });

  it("lets parts use globals in any order", () => {
    expect(errors("leg\nlet reach = 2\npart leg {\n  forward reach\n}")).toEqual([]);
  });
});

describe("checker: parts and functions", () => {
  it("checks calls", () => {
    rejects("leg(1)\npart leg {\n  lay\n}", "takes 0 arguments, not 1");
    rejects("lay\nwobble", "no part called `wobble`");
    rejects("let a = f()\nf()\nfunction f() {\n  return 1\n}", "is a function");
    rejects("let a = leg()\npart leg {\n  lay\n}", "which draws");
    rejects("let a = sin(1, 2)", "takes 1 argument");
  });

  it("keeps functions to calculating", () => {
    rejects("function f() {\n  forward 1\n  return 1\n}", "can't change the turtle");
    rejects(
      "function f() {\n  return 1\n}\npart leg {\n  lay\n}\nfunction g() {\n  leg\n  return 1\n}",
      "can't call parts",
    );
    rejects("let n = 0\nfunction f() {\n  n = 1\n  return 1\n}", "can't change the global");
    rejects("function f() {\n  let a = 1\n}", "never returns a value");
    rejects("function f() {\n  return\n}", "must return a value");
  });

  it("checks return", () => {
    rejects("return", "only be used in a part or a function");
    rejects("part p {\n  return 1\n}", "doesn't return a value");
  });

  it("only defines things at the top level", () => {
    rejects("branch {\n  part p {\n    lay\n  }\n}", "top level");
  });
});

describe("checker: genes", () => {
  const genes = (body: string) => check(`creature Test\n${body}\n`).genes;

  it("collects genes with full names and descriptions", () => {
    const g = genes(
      "gene a = 1 in 0..2  // how big\npart p {\n  gene b = true\n  lay\n}\nbackground {\n  gene c = 3 in 0..4\n  fill red\n}",
    );
    expect(g.map((x) => x.fullName)).toEqual(["a", "p.b", "background.c"]);
    expect(g[0]!.description).toBe("how big");
    expect(g[1]!.kind).toBe("bool");
  });

  it("checks ranges", () => {
    rejects("gene a = 5 in 1..3", "between 1 and 3");
    rejects("gene a = 1 in 3..1", "less than the highest");
    rejects("gene a = 1 in 0..2 step 0", "above zero");
    rejects("gene a = 1 in 0..2 log", "above zero");
    rejects("gene a = (1, 2, 3) in (0, 0, 0)..(2, 2, 2) step 1", "Only number genes");
    rejects("gene a = 1", "needs a range");
    rejects("gene a = true in 0..1", "no range");
    rejects("gene a = red in 0..1", "must be a colour");
  });

  it("warns about values off the step", () => {
    const r = check("creature T\ngene a = 1.5 in 0..3 step 1\n");
    expect(r.ok).toBe(true);
    expect(r.diagnostics[0]!.message).toContain("whole number of steps");
  });

  it("allows fixed axes in vector ranges", () => {
    expect(errors("gene s = (1, 1, 0.2) in (1, 1, 0.1)..(1, 1, 3)")).toEqual([]);
  });

  it("treats hue as a circle", () => {
    expect(errors("gene c = hsv(10, 1, 1) in hsv(300, 0.5, 0.5)..hsv(40, 1, 1)")).toEqual([]);
    rejects("gene c = hsv(120, 1, 1) in hsv(300, 0.5, 0.5)..hsv(40, 1, 1)", "hue is outside");
    const g = genes("gene c = hsv(200, 1, 1) in hsv(0, 0, 0)..hsv(360, 1, 1)")[0]!;
    expect(g.hue?.whole).toBe(true);
  });

  it("wants a number for wear", () => {
    expect(errors("wear 0.5")).toEqual([]);
    expect(errors("wear red").length).toBe(1);
  });

  it("checks choices", () => {
    expect(errors("gene s = cone from [ball, cone, tube]")).toEqual([]);
    rejects("gene s = cube from [ball, cone]", "one of its options");
    rejects("gene s = ball from [ball, 1]", "must be a shape");
    rejects("gene s = ball", "needs its options");
    expect(errors("gene k = dusk from [jewel, dusk, electric]")).toEqual([]);
    expect(errors("gene f = pearl from [matte, pearl]")).toEqual([]);
    expect(errors("gene w = warp from [warp, blend, mask, carve]")).toEqual([]);
    rejects("gene w = warp from [warp, dusk]", "must be a way of mixing");
    rejects("gene k = dusk in jewel..electric", "needs options");
  });

  it("checks part genes", () => {
    const parts = "part leg(a) {\n  lay\n}\npart fin(a) {\n  lay\n}\npart tail {\n  lay\n}";
    expect(errors(`gene limb = leg from [leg, fin]\nlimb(1)\n${parts}`)).toEqual([]);
    rejects(`gene limb = leg from [leg, tail]\n${parts}`, "same number of parameters");
    rejects(`gene limb = leg from [leg, fin]\nlimb\n${parts}`, "takes 1 argument");
  });

  it("only allows constants in genes", () => {
    rejects("let n = 3\ngene a = n in 0..5", "constant");
    rejects("gene a = random(0, 1) in 0..1", "only built-in maths");
    expect(errors("gene a = 360 / 7 in 0..pi * 100")).toEqual([]);
  });

  it("only allows genes at the top of a body", () => {
    rejects("repeat 2 {\n  gene a = 1 in 0..2\n}", "top level");
  });

  it("adds a seed gene for random, and keeps the name for it", () => {
    expect(genes("let r = random(0, 1)").map((g) => g.fullName)).toEqual(["seed"]);
    rejects("gene seed = 1 in 0..2\nlet r = random(0, 1)", "kept for `random`");
  });
});

describe("checker: breed", () => {
  it("is breedable unless it says `breed off`", () => {
    expect(check("creature T\nlay\n").breedable).toBe(true);
    expect(check("creature T\nbreed off\nlay\n").breedable).toBe(false);
    expect(check("creature T\nbreed on\nlay\n").breedable).toBe(true);
  });

  it("allows `breed` once, at the top level", () => {
    expect(errors("breed off\nbreed on")).toEqual([
      "The creature already says whether it can be bred.",
    ]);
    expect(errors("part p {\n  breed off\n}\np")).toEqual([
      "`breed` can only be at the top level of a creature.",
    ]);
    expect(errors("breed maybe")).toEqual(["Expected `on` or `off` after `breed`."]);
  });
});

describe("checker: statements and types", () => {
  it("checks where statements go", () => {
    rejects("reshape {\n  lay\n}", "Inside `reshape` and `lay` blocks");
    rejects("fill red", "only be used in a background");
    rejects("background {\n  forward 1\n  fill red\n}", "can only hold");
    rejects("background {\n  let a = 1\n}", "needs a `fill`");
    rejects("background {\n  fill red\n  let a = 1\n}", "must be the last");
    rejects("dance {\n  lay\n}", "dance block can only hold");
    rejects("function f() {\n  focuspoint\n  return 1\n}", "can't set the focus point");
    rejects("lay { focuspoint }", "Inside `reshape` and `lay` blocks");
    rejects("lay {\n  stroke {\n    forward 1\n  }\n}", "Inside `reshape` and `lay` blocks");
    rejects("function f() {\n  stroke {\n    lay\n  }\n  return 1\n}", "can't change the turtle");
    rejects("background {\n  focuspoint\n  fill red\n}", "can only hold");
  });

  it("checks dance effect lines", () => {
    rejects("dance {\n  morph on music.mid\n}", "starts with `follows`");
    rejects("dance {\n  morph follows music.mid by 1\n}", "has no setting `by`");
    rejects("dance {\n  zoom follows music.level settle 1 settle 2\n}", "set twice");
    rejects("dance {\n  spin follows music.bass drops\n}", "for effects that trigger");
    rejects("dance {\n  turn on music.mid drops rises\n}", "only one of");
    rejects("dance {\n  turn on music.mid upright\n}", "is for `spin` lines");
    rejects("dance {\n  spin follows music.mid upright upright\n}", "said twice");
    rejects("dance {\n  reverse on music.bass on 4\n}", "need both counts");
    rejects("dance {\n  morph follows red\n}", "must be a number");
    rejects(
      "dance {\n  morph follows music.mid\n  morph follows music.bass\n}",
      "only one `morph`",
    );
    rejects("dance {\n  morph follows music.mid speed\n}", "Expected a value after `speed`");
    expect(
      errors(
        "dance {\n  gene drive = 1 in 0..3\n  morph follows music.mid speed drive settle 2\n}",
      ),
    ).toEqual([]);
  });

  it("keeps backgrounds self-contained", () => {
    rejects("gene hue = 10 in 0..360\nbackground {\n  fill hsv(hue, 1, 1)\n}", "self-contained");
    rejects("background {\n  fill turtle.colour\n}", "can't read the turtle");
  });

  it("checks types it can see", () => {
    rejects("forward (1, 2, 3)", "needs a number, not a vector");
    rejects("move 1", "needs a vector");
    rejects("if 1 {\n  lay\n}", "must be a bool");
    rejects("let a = red + 1", "can't be used on a colour and a number");
    rejects("let a = 1 == red", "same type");
    rejects("let a = (1, 2, 3).hue", "no part called `hue`");
    rejects("let a = 3(1)", "can't be called");
    rejects('let a = "hi"', "only be used in `print`");
    rejects("colour gradient(red, blue)", "pick a point on it");
    rejects("let a = turtle.wings", "no `wings`");
    rejects("let a = music.drums", "no `drums`");
  });

  it("marks creatures that read time or music as live", () => {
    expect(check("creature T\nlay\n").live).toBe(false);
    expect(check("creature T\nyaw time\n").live).toBe(true);
    const withBackground = check("creature T\nbackground {\n  fill hsv(music.bass, 1, 1)\n}\n");
    expect(withBackground.live).toBe(false);
    expect(withBackground.backgroundLive).toBe(true);
  });
});

/** Warning messages from checking a creature body. */
function warnings(body: string): string[] {
  return check(`creature Test\n${body}\n`)
    .diagnostics.filter((d) => d.severity === "warning")
    .map((d) => d.message);
}

describe("checker: warnings", () => {
  it("warns about a shape that nothing is laid with", () => {
    expect(warnings("branch {\n  lay\n  shape cone\n}")).toEqual([
      expect.stringContaining("`shape` is never used"),
    ]);
    expect(warnings("shape cone\nshape cube\nlay")).toHaveLength(1);
    expect(warnings("lay\nshape cone")).toHaveLength(1);
  });

  it("lets a shape carry on into a loop, an if, a part call or the caller", () => {
    expect(warnings("shape cone\nlay")).toEqual([]);
    expect(warnings("repeat 3 {\n  lay\n  shape cone\n}")).toEqual([]);
    expect(warnings("shape cone\nif true {\n  lay\n}")).toEqual([]);
    expect(warnings("shape cone\nleg\npart leg {\n  lay\n}")).toEqual([]);
    expect(warnings("leg\nlay\npart leg {\n  shape cone\n}")).toEqual([]);
  });

  it("warns about a top-level part call that moves everything after it", () => {
    const tail = "part tail {\n  yaw 180\n  forward 1\n  lay\n}";
    expect(warnings(`tail\nlay\n${tail}`)).toEqual([
      expect.stringContaining("put the call in a `branch"),
    ]);
    // Through another part, and inside a loop or an if in the part.
    expect(
      warnings(`tail2\nlay\npart tail2 {\n  if true {\n    tail\n  }\n}\n${tail}`),
    ).toHaveLength(1);
  });

  it("doesn't warn about part calls that are branched, last, or put the turtle back", () => {
    const tail = "part tail {\n  yaw 180\n  forward 1\n  lay\n}";
    expect(warnings(`branch {\n  tail\n}\nlay\n${tail}`)).toEqual([]);
    expect(warnings(`lay\ntail\n${tail}`)).toEqual([]);
    expect(warnings(`tail\nlet a = 1\n${tail}`)).toEqual([]);
    expect(warnings("leg\nlay\npart leg {\n  branch {\n    forward 1\n    lay\n  }\n}")).toEqual(
      [],
    );
    expect(warnings("leg\nlay\npart leg {\n  colour red\n  lay\n}")).toEqual([]);
    expect(
      warnings("repeat 3 {\n  segment\n}\nlay\npart segment {\n  forward 1\n  lay\n}"),
    ).toEqual([]);
    expect(warnings("loop\nlay\npart loop {\n  loop\n}")).toEqual([]);
  });
});
