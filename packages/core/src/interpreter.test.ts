import { describe, expect, it } from "vitest";
import { check } from "./checker.js";
import { build, buildBackground, buildDance } from "./interpreter.js";
import { mulberry32 } from "./noise.js";
import { centre, checked, errors, near, run } from "./test-helpers.js";
import { formatValue } from "./values.js";

const positions = (body: string) => run(body).shapes.map((s) => near(centre(s)));

/** What `print` writes for an expression. */
const value = (expr: string) => run(`print(${expr})`).printed[0];

describe("turtle", () => {
  it("starts at the origin facing +z, and moves along its heading", () => {
    expect(positions("lay\nforward 2\nlay\nback 3\nlay")).toEqual([
      [0, 0, 0],
      [0, 0, 2],
      [0, 0, -1],
    ]);
    expect(positions("move (1, 2, 3)\nlay")).toEqual([[1, 2, 3]]);
  });

  it("turns by the right-hand rule", () => {
    expect(positions("pitch 90\nforward 1\nlay")).toEqual([[0, -1, 0]]); // nose down
    expect(positions("yaw 90\nforward 1\nlay")).toEqual([[1, 0, 0]]); // towards the side axis
    expect(positions("roll 90\nmove (1, 0, 0)\nlay")).toEqual([[0, 1, 0]]); // side turns up
    expect(positions("rotate 90 around (1, 0, 0)\nforward 1\nlay")).toEqual([[0, -1, 0]]);
  });

  it("keeps each size with its axis and scales moves", () => {
    expect(positions("grow 2\nforward 1\nlay")).toEqual([[0, 0, 2]]);
    expect(positions("grow (1, 1, 3)\nyaw 90\nforward 1\nlay")).toEqual([[3, 0, 0]]);
  });

  it("draws mirror images when mirrored", () => {
    const body = "symmetric x {\n  yaw 30\n  pitch 20\n  forward 1\n  lay\n}";
    const [a, b] = positions(body);
    expect(b).toEqual(near([-a![0]!, a![1]!, a![2]!]));
    const [p, q] = positions("symmetric x {\n  rotate 40 around (1, 1, 0)\n  forward 1\n  lay\n}");
    expect(q).toEqual(near([-p![0]!, p![1]!, p![2]!]));
    const shapes = run(body).shapes;
    expect(shapes.map((s) => s.mirrored)).toEqual([false, true]);
  });

  it("puts everything back after a branch", () => {
    const r = run("branch {\n  forward 5\n  colour red\n  grow 3\n}\nforward 1\nlay");
    expect(near(centre(r.shapes[0]!))).toEqual([0, 0, 1]);
    expect(formatValue(r.shapes[0]!.colour)).toBe("hsv(0, 0, 1, 1)");
    expect(r.shapes[0]!.matrix[0]).toBe(1);
  });

  it("shapes one shape with lay { } and later shapes with reshape", () => {
    const r = run(
      "lay { grow 2 }\nlay\nbranch {\n  reshape { move (1, 0, 0) }\n  lay\n  lay\n}\nlay",
    );
    expect(r.shapes.map((s) => s.matrix[0])).toEqual([2, 1, 1, 1, 1]);
    expect(r.shapes.map((s) => near(centre(s)))).toEqual([
      [0, 0, 0],
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 0],
      [0, 0, 0],
    ]);
  });

  it("chooses shapes by name or number", () => {
    const r = run("shape cone\nlay\nshape 9\nlay\nshape -1\nlay\nshape 2.5\nlay");
    expect(r.shapes.map((s) => s.shape)).toEqual(["cone", "ball", "cube", "ball"]);
  });

  it("clamps material settings and records them per shape", () => {
    const r = run(
      "shine 3\nsharpness -1\ntexture pattern(marble, 200, 7.4)\nlay\ntexture none\nlay",
    );
    expect(r.shapes[0]).toMatchObject({
      shine: 1,
      sharpness: 0,
      texture: { kind: "marble", hue: 200, seed: 7 },
    });
    expect(r.shapes[1]!.texture).toBeNull();
  });

  it("records how much of its texture each shape wears", () => {
    const r = run("lay\nwear 0.25\nlay\nwear 3\nlay\nwear -1\nprint(turtle.wear)\nlay");
    expect(r.shapes.map((s) => s.wear)).toEqual([1, 0.25, 1, 0]);
    expect(r.printed).toEqual(["0"]);
  });

  it("makes patterns with a scheme, a finish and a second pattern mixed in", () => {
    expect(value("pattern(marble, 200, 7)")).toBe("pattern(marble, 200, 7)");
    expect(value("pattern(marble, 200, 7, dusk)")).toBe("pattern(marble, 200, 7, dusk)");
    expect(value("pattern(marble, 200, 7, jewel, pearl)")).toBe(
      "pattern(marble, 200, 7, jewel, pearl)",
    );
    expect(value("mixed(pattern(cells, 40, 3, electric), warp, vortex, 1.5)")).toBe(
      "mixed(pattern(cells, 40, 3, electric), warp, vortex, 1)",
    );
    // Mixing again replaces the second pattern; nothing mixed is still nothing.
    expect(value("mixed(mixed(pattern(cells, 40, 3), warp, vortex, 0.5), carve, bloom, 0.2)")).toBe(
      "mixed(pattern(cells, 40, 3), carve, bloom, 0.2)",
    );
    expect(value("mixed(none, blend, cells, 0.5)")).toBe("none");
    const r = run("texture mixed(pattern(aurora, 120, 4, pastel, satin), mask, cells, 0.25)\nlay");
    expect(r.shapes[0]!.texture).toEqual({
      type: "pattern",
      kind: "aurora",
      hue: 120,
      seed: 4,
      scheme: "pastel",
      finish: "satin",
      mix: { way: "mask", kind: "cells", amount: 0.25 },
    });
  });

  it("says what a pattern's words should be", () => {
    expect(run("print(pattern(marble, 200, 7, pearl))").diagnostics[0]!.message).toContain(
      "a colour scheme for argument 4",
    );
    expect(
      run("print(mixed(pattern(marble, 200, 7), cells, warp, 1))").diagnostics[0]!.message,
    ).toContain("a way of mixing for argument 2");
  });

  it("reads the turtle back", () => {
    expect(value("turtle.heading")).toBe("(0, 0, 1)");
    expect(run("yaw 90\nforward 2\nprint(turtle.position)").printed[0]).toBe("(2, 0, 1.22465e-16)");
    expect(run("mirror y\nprint(turtle.mirrored, turtle.up)").printed[0]).toBe("true (0, -1, 0)");
  });

  it("marks the focus point where the turtle is, the last one counting", () => {
    expect(run("lay").focus).toBeUndefined();
    expect(run("forward 2\nfocuspoint\nforward 1\nlay").focus).toEqual([0, 0, 2]);
    const head = "part head {\n  forward 3\n  focuspoint\n}\nbranch {\n  head\n}";
    expect(run(head).focus).toEqual([0, 0, 3]);
    expect(near(run(`${head}\nyaw 90\nforward 1\nfocuspoint`).focus!)).toEqual([1, 0, 0]);
    expect(run("forward 1 / 0\nfocuspoint").focus).toBeUndefined();
  });
});

describe("turtle path", () => {
  const steps = (body: string) =>
    run(body, { trace: true }).path!.map((p) => [p.kind, near(p.from), near(p.to)]);

  it("is only recorded when asked for", () => {
    expect(run("forward 1").path).toBeUndefined();
  });

  it("records forward, back and move, but not turns or standing still", () => {
    expect(steps("forward 2\nyaw 90\nforward 0\nback 1\nmove (0, 3, 0)")).toEqual([
      ["move", [0, 0, 0], [0, 0, 2]],
      ["move", [0, 0, 2], [-1, 0, 2]],
      ["move", [-1, 0, 2], [-1, 3, 2]],
    ]);
  });

  it("jumps back when a branch or a symmetric side ends somewhere else", () => {
    expect(steps("branch {\n  forward 1\n}\nbranch {\n  yaw 30\n}")).toEqual([
      ["move", [0, 0, 0], [0, 0, 1]],
      ["return", [0, 0, 1], [0, 0, 0]],
    ]);
    expect(steps("symmetric x {\n  move (1, 0, 0)\n}").map((s) => s[0])).toEqual([
      "move",
      "return",
      "move",
      "return",
    ]);
  });

  it("leaves out moves of a shape inside lay", () => {
    expect(steps("lay {\n  forward 1\n}")).toEqual([]);
  });

  it("points each step at the statement that made it", () => {
    const source = "forward 1\nbranch {\n  back 1\n}";
    const path = run(source, { trace: true }).path!;
    const text = `creature Test\n${source}\n`;
    expect(path.map((p) => text.slice(p.span.start, p.span.end).split("\n")[0])).toEqual([
      "forward 1",
      "back 1",
      "branch {",
    ]);
  });
});

describe("strokes", () => {
  const strokes = (body: string) => run(body).shapes.filter((s) => s.shape === "stroke");

  it("turns each lay inside into a point of one stroke", () => {
    const r = run("stroke {\n  repeat 3 {\n    lay\n    forward 1\n  }\n}");
    expect(r.shapes).toHaveLength(1);
    const s = r.shapes[0]!;
    expect(s.shape).toBe("stroke");
    expect(s.points!.map((p) => near([p.matrix[12]!, p.matrix[13]!, p.matrix[14]!]))).toEqual([
      [0, 0, 0],
      [0, 0, 1],
      [0, 0, 2],
    ]);
  });

  it("keeps each point's placement and look", () => {
    const [s] = strokes(
      "stroke {\n  colour red\n  shine 0.4\n  lay { grow 0.5 }\n  forward 1\n  colour blue\n  lay\n}",
    );
    const [a, b] = s!.points!;
    expect(a!.matrix[0]).toBeCloseTo(0.5);
    expect(b!.matrix[0]).toBeCloseTo(1);
    expect([a!.colour.h, a!.colour.s]).toEqual([0, 1]);
    expect(a!.shine).toBe(0.4);
    expect(b!.colour.h).toBeCloseTo(240);
  });

  it("draws nothing with fewer than two points", () => {
    expect(run("stroke {\n  lay\n}").shapes).toEqual([]);
    expect(run("stroke {\n  forward 1\n}").shapes).toEqual([]);
  });

  it("doesn't put the turtle back, and lays shapes again after it", () => {
    const r = run("stroke {\n  lay\n  forward 2\n  lay\n}\nlay");
    expect(r.shapes.map((s) => s.shape)).toEqual(["stroke", "ball"]);
    expect(near(centre(r.shapes[1]!))).toEqual([0, 0, 2]);
  });

  it("adds to the innermost stroke, also from parts", () => {
    const r = run(
      "stroke {\n  lay\n  stroke {\n    tip\n    tip\n  }\n  tip\n}\npart tip {\n  forward 1\n  lay\n}",
    );
    expect(r.shapes.map((s) => s.points!.length)).toEqual([2, 2]);
  });

  it("counts points towards the shape limit", () => {
    const r = run("stroke {\n  repeat 10 {\n    lay\n    forward 1\n  }\n}", {
      limits: { shapes: 4 },
    });
    expect(r.shapes[0]!.points).toHaveLength(4);
    expect(r.diagnostics[0]!.message).toContain("4 shapes");
  });
});

describe("control flow, parts and functions", () => {
  it("repeats and loops", () => {
    expect(run("repeat 2.5 as i {\n  print(i)\n}").printed).toEqual(["0", "1", "2"]);
    expect(run("repeat -1 {\n  print(1)\n}").printed).toEqual([]);
    expect(run("for i from 0 to 1 by 0.25 {\n  print(i)\n}").printed).toEqual([
      "0",
      "0.25",
      "0.5",
      "0.75",
      "1",
    ]);
    expect(run("for i from 3 to 1 by -1 {\n  print(i)\n}").printed).toEqual(["3", "2", "1"]);
    expect(run("let n = 0\nwhile n < 3 {\n  n += 1\n}\nprint(n)").printed).toEqual(["3"]);
  });

  it("chooses with if", () => {
    expect(
      run(
        "let a = 5\nif a > 10 {\n  print(1)\n} else if a > 3 {\n  print(2)\n} else {\n  print(3)\n}",
      ).printed,
    ).toEqual(["2"]);
  });

  it("calls parts and functions, with recursion", () => {
    const r = run(
      "function fact(n) {\n  if n <= 1 {\n    return 1\n  }\n  return n * fact(n - 1)\n}\nprint(fact(5))",
    );
    expect(r.printed).toEqual(["120"]);
    expect(
      run(
        "tree(3)\npart tree(n) {\n  if n == 0 {\n    return\n  }\n  lay\n  tree(n - 1)\n  tree(n - 1)\n}",
      ).shapes,
    ).toHaveLength(7);
  });

  it("leaves a part or function at once on return, from inside loops, branches and lay", () => {
    const r = run(
      "print(first(10))\nstop\nprint(turtle.position.z)\n" +
        "function first(n) {\n  for i from 0 to n {\n    repeat 3 as j {\n      if i * 3 + j == 7 {\n        return i\n      }\n    }\n  }\n  return -1\n}\n" +
        "part stop {\n  forward 1\n  branch {\n    forward 5\n    stroke {\n      lay\n      forward 1\n      lay\n      return\n    }\n  }\n  lay\n}",
    );
    expect(r.printed).toEqual(["2", "1"]);
    // The stroke still ends and draws and the branch still puts the turtle back, but the `lay`
    // after the branch never runs.
    expect(r.shapes.map((s) => s.shape)).toEqual(["stroke"]);
  });

  it("samples a gradient held in a variable", () => {
    const r = run("let g = gradient(red at 0, blue at 1)\nprint(g(0) == red, clamp(5, 0, 1))");
    expect(r.printed).toEqual(["true 1"]);
  });

  it("builds the same program again and again with different genes", () => {
    const program = checked("creature T\ngene n = 2 in 0..5\nrepeat n {\n  forward 1\n  lay\n}\n");
    for (const n of [1, 4, 0, 3]) {
      const genes = new Map([["n", n]]);
      expect(build(program, { genes }).shapes).toHaveLength(n);
    }
  });

  it("gives each part call its genes and copies of its arguments", () => {
    const r = run(
      "let a = 1\nleg(a)\nprint(a)\npart leg(x) {\n  gene g = 2 in 0..3\n  x = 5\n  print(g)\n}",
    );
    expect(r.printed).toEqual(["2", "1"]);
  });

  it("calls the part a part gene names", () => {
    const body =
      "gene limb = leg from [leg, fin]\nlimb\npart leg {\n  shape cube\n  lay\n}\npart fin {\n  shape cone\n  lay\n}";
    expect(run(body).shapes[0]!.shape).toBe("cube");
    const genes = new Map([["limb", { type: "part" as const, name: "fin" }]]);
    expect(run(body, { genes }).shapes[0]!.shape).toBe("cone");
  });

  it("reports a global used before its let has run", () => {
    const r = run("leg\nlet reach = 1\npart leg {\n  forward reach\n}");
    expect(r.ok).toBe(false);
    expect(r.diagnostics[0]!.message).toContain("its `let` hasn't run");
  });

  it("reports runtime type errors with their place", () => {
    const r = run("let a = 1\nlet b = (1, 2, 3)\nif a > 0 {\n  b = red\n}\nforward b");
    expect(r.ok).toBe(false);
    expect(r.diagnostics[0]!.message).toContain("needs a number, not a colour");
  });
});

describe("values and library", () => {
  it("does arithmetic on numbers and vectors", () => {
    expect(value("7 / 2")).toBe("3.5");
    expect(value("-7 % 3")).toBe("-1");
    expect(value("-2 ^ 2")).toBe("-4");
    expect(value("(1, 2, 3) * 2 + (1, 1, 1)")).toBe("(3, 5, 7)");
    expect(value("(2, 4, 6) / (2, 2, 2)")).toBe("(1, 2, 3)");
    expect(value("(1, 2, 3).y")).toBe("2");
  });

  it("rounds halves up, and keeps frac's sign", () => {
    expect(value("round(2.5), round(-2.5), frac(-1.25)")).toBe("3 -2 -0.25");
  });

  it("wraps and bounces", () => {
    expect(value("wrap(370, 0, 360), wrap(-10, 0, 360), wrap(360, 0, 360)")).toBe("10 350 0");
    expect(value("bounce(1.5, 0, 1), bounce(2.5, 0, 1), bounce(-0.25, 0, 1)")).toBe("0.5 0.5 0.25");
  });

  it("uses degrees", () => {
    expect(value("sin(90), cos(180), atan2(1, 1), degrees(pi)")).toBe("1 -1 45 180");
    expect(value("wave(0.25), bump(0.5)")).toBe("1 1");
  });

  it("mixes numbers, vectors and colours", () => {
    expect(value("mix(0, 10, 0.25), mix(0, 10, 1.5)")).toBe("2.5 15");
    expect(value("smoothmix(0, 10, 0.5)")).toBe("5");
    expect(value("mix(hsv(350, 1, 1), hsv(10, 1, 1), 0.5).hue")).toBe("0");
    expect(value("mix(hsv(0, 1, 1), hsv(180, 1, 1), 0.5).hue")).toBe("90");
  });

  it("builds and samples gradients", () => {
    expect(value("gradient(black, white)(0.5).val")).toBe("0.5");
    expect(value("gradient(red, green, blue at 1)(0.5).hue")).toBe("120");
    expect(value("gradient(red, blue at 0.5, green at 0.5, white)(0.5).hue")).toBe("120");
    expect(value("gradient(red, blue)(2).hue")).toBe("240");
    const r = run("let g = gradient(red at 0.5, blue at 0.2)\nprint(g(0))");
    expect(r.diagnostics[0]!.message).toContain("must not go down");
  });

  it("builds spectrums, whose hue goes in a straight line", () => {
    // Blue (240°) to red (0°): a gradient goes the short way, through magenta (300°); a spectrum
    // goes through green (120°).
    expect(value("gradient(blue, red)(0.5).hue")).toBe("300");
    expect(value("spectrum(blue, red)(0.5).hue")).toBe("120");
    expect(value("spectrum(hsv(350, 1, 1), hsv(10, 1, 1))(0.25).hue")).toBe("265");
    expect(value("spectrum(black, white at 0.5)(0.25).val")).toBe("0.5");
    expect(value("spectrum(red, blue)")).toBe(
      "spectrum(hsv(0, 1, 1, 1) at 0, hsv(240, 1, 1, 1) at 1)",
    );
    expect(errors("let spectrum = 1")).toEqual([
      "`spectrum` is built in, so it can't be used as the name of a variable.",
    ]);
  });

  it("knows its colours", () => {
    expect(value("#ff0000.hue, rgb(0, 0, 1).hue, hsv(400, 2, 1).hue, hsv(400, 2, 1).sat")).toBe(
      "0 240 40 1",
    );
    expect(value("purple")).toBe("hsv(270, 1, 0.8, 1)");
  });

  it("computes mandel", () => {
    expect(value("mandel(0, 0), mandel(2, 2)")).toBe("1 0");
  });

  it("gives noise in range, the same every time", () => {
    const r = run("print(noise(0.5), noise((1.3, 2.7, 0.1)), fbm(3.2))");
    expect(r.printed[0]).toBe(
      run("print(noise(0.5), noise((1.3, 2.7, 0.1)), fbm(3.2))").printed[0],
    );
    for (const n of r.printed[0]!.split(" ").map(Number))
      expect(Math.abs(n)).toBeLessThanOrEqual(1);
    expect(value("noise(0), noise(5)")).toBe("0 0");
  });
});

describe("genes, randomness and inputs", () => {
  it("uses gene values given to the build", () => {
    const program = checked("creature T\ngene n = 2 in 1..5 step 1\nrepeat n {\n  lay\n}\n");
    expect(build(program).shapes).toHaveLength(2);
    expect(build(program, { genes: new Map([["n", 4]]) }).shapes).toHaveLength(4);
    expect(build(program, { genes: new Map([["n", true]]) }).diagnostics[0]!.message).toContain(
      "given a bool",
    );
  });

  it("draws random numbers from the seed gene with mulberry32", () => {
    const program = checked("creature T\nprint(random(0, 1), random(10, 20))\n");
    const next = mulberry32(42);
    const expected = `${formatValue(next())} ${formatValue(10 + 10 * next())}`;
    expect(build(program, { genes: new Map([["seed", 42]]) }).printed[0]).toBe(expected);
    expect(build(program).printed[0]).toBe(build(program).printed[0]);
  });

  it("reads time and music, which are 0 by default", () => {
    const program = checked("creature T\nprint(time, beat, music.bass, music.hit)\n");
    expect(build(program).printed[0]).toBe("0 0 0 0");
    expect(build(program, { inputs: { time: 2, music: { bass: 0.5 } } }).printed[0]).toBe(
      "2 0 0.5 0",
    );
  });

  it("works out backgrounds", () => {
    const program = checked(
      "creature T\nlay\nbackground {\n  gene hue = 200 in 0..360\n  fill hsv(hue + 100 * music.bass, 1, 1)\n}\n",
    );
    expect(formatValue(buildBackground(program).fill!)).toBe("hsv(200, 1, 1, 1)");
    expect(formatValue(buildBackground(program, { inputs: { music: { bass: 0.5 } } }).fill!)).toBe(
      "hsv(250, 1, 1, 1)",
    );
    const file = checked("background Sky\nfill gradient(blue, white)\n");
    expect(formatValue(buildBackground(file).fill!)).toBe(
      "gradient(hsv(240, 1, 1, 1) at 0, hsv(0, 0, 1, 1) at 1)",
    );
  });
});

describe("dance styles", () => {
  it("runs the dance block with the music of the moment, filling in defaults", () => {
    const program = checked(`creature T
lay
dance {
  gene drive = 2 in 0..3
  morph follows clamp(music.mid * 2, 0, 1) speed drive
  spin follows music.bass_hit from 10 to 20
  turn on music.mid drops by 1
  flat on music.level
}
`);
    const quiet = buildDance(program).style!;
    expect(quiet.morph).toEqual({ input: 0, speed: 2, settle: 2 });
    expect(quiet.spin).toEqual({ input: 0, from: 10, to: 20, smooth: 0.4 });
    expect(quiet.turn).toEqual({ input: 0, when: "drops", by: 1, bursts: undefined });
    expect(quiet.flat).toEqual({ input: 0, when: "changes", by: 0.5, bursts: { on: 24, off: 48 } });
    expect(quiet.zoom).toBeUndefined();
    const loud = buildDance(program, { inputs: { music: { mid: 0.3, bass_hit: 1.5 } } }).style!;
    expect(loud.morph!.input).toBeCloseTo(0.6);
    expect(loud.spin!.input).toBe(1);
  });

  it("reads bursts, and dance files", () => {
    const file = checked("dance Pulse\nreverse on music.bass rises by 0.3 on 2 off 6\n");
    expect(buildDance(file).style!.reverse).toEqual({
      input: 0,
      when: "rises",
      by: 0.3,
      bursts: { on: 2, off: 6 },
    });
    expect(buildDance(checked("creature T\nlay\n")).style).toBeUndefined();
  });
});

describe("limits and bad numbers", () => {
  it("stops runaway loops and keeps what was built", () => {
    const r = run("lay\nwhile true {\n  yaw 1\n}", { limits: { steps: 1000 } });
    expect(r.shapes).toHaveLength(1);
    expect(r.ok).toBe(true);
    expect(r.diagnostics[0]!.message).toContain("stopped after 1,000 steps");
  });

  it("stops at the shape limit", () => {
    const r = run("repeat 10 {\n  lay\n}", { limits: { shapes: 4 } });
    expect(r.shapes).toHaveLength(4);
    expect(r.diagnostics[0]!.message).toContain("4 shapes");
  });

  it("stops deep recursion", () => {
    const r = run("down\npart down {\n  down\n}");
    expect(r.diagnostics[0]!.message).toContain("more than 200 deep");
  });

  it("leaves out shapes whose placement isn't finite", () => {
    const r = run("lay\nbranch {\n  forward sqrt(-1)\n  lay\n  grow 1 / 0\n  lay\n}\nlay");
    expect(r.shapes).toHaveLength(2);
    expect(r.diagnostics[0]!.message).toContain("2 shapes were left out");
  });

  it("refuses to build a file with errors", () => {
    const r = build(check("creature T\nforward red\n"));
    expect(r.ok).toBe(false);
    expect(r.shapes).toEqual([]);
  });
});

describe("constants", () => {
  it("has the documented values", () => {
    expect(value("tau / pi, golden, x_axis")).toBe(
      `2 ${formatValue((1 + Math.sqrt(5)) / 2)} (1, 0, 0)`,
    );
  });
});
