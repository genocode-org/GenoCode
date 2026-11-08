// Patterns written in GenoCode (docs/LANGUAGE.md section 14.1), lists (8.3) and pictures (18.7).

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { check } from "./checker.js";
import { formatText } from "./format.js";
import { completionsAt, helpAt } from "./help.js";
import { build, buildBackground, buildPattern, patternFileText } from "./interpreter.js";
import { Canvas } from "./picture.js";
import { applyEdits, rename } from "./symbols.js";
import { patternOnBall, patternsOf } from "./wearing.js";
import type { Pattern } from "./values.js";

const errors = (text: string) =>
  check(text)
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.message);

const RIPPLES = `pattern Ripples
// Rings that wobble.

gene rings = 8 in 2..20
gene wobble = 0.3 in 0..1

let turn = random(0, 360)
let lumps = clouds(5, 3)
value picture {
  let ripple = sin(r * rings * 180 + turn + lumps(x, y) * wobble * 360)
  value ripple * 0.5 + 0.5
}
`;

const SHELL = `creature Shell

pattern Ripples {
  gene rings = 8 in 2..20

  value picture {
    value sin(r * rings * 180) * 0.5 + 0.5
  }
}

gene kind = Ripples from [marble, Ripples]

shape ball
texture pattern(kind, 30, 4, dusk, pearl)
lay
texture mixed(pattern(cells, 200, 1), warp, Ripples, 0.5)
lay

background {
  fill pattern(Ripples, 200, 3)
}

variant Many { Ripples.rings = 18 }
`;

const canvas = (size = 32) => new Canvas(size);

describe("pattern files", () => {
  it("check, format and draw", () => {
    const program = check(RIPPLES);
    expect(program.diagnostics).toEqual([]);
    expect(formatText(RIPPLES).text).toBe(RIPPLES);
    expect(program.genes.map((g) => g.fullName)).toEqual(["Ripples.rings", "Ripples.wobble"]);
    const { picture, diagnostics } = buildPattern(program, "Ripples", 4, canvas());
    expect(diagnostics).toEqual([]);
    expect(picture?.size).toBe(32);
    expect(Math.min(...picture!.v)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...picture!.v)).toBeLessThanOrEqual(1);
  });

  it("draw the same picture for the same seed, and another for another", () => {
    const program = check(RIPPLES);
    const draw = (seed: number) => buildPattern(program, "Ripples", seed, canvas()).picture!.v;
    expect(draw(4)).toEqual(draw(4));
    expect(draw(4)).not.toEqual(draw(5));
  });

  it("take their genes' values", () => {
    const program = check(RIPPLES);
    const draw = (rings: number) =>
      buildPattern(program, "Ripples", 4, canvas(), {
        genes: new Map([["Ripples.rings", rings]]),
      }).picture!.v;
    expect(draw(8)).not.toEqual(draw(16));
  });

  it("hold back the blurs around their value, for mixing, when asked", () => {
    const text = `${RIPPLES.replace("value picture {", "let rings_picture = picture {")}value zoom_blur(blur(rings_picture, random(1, 2)), 0.3)\n`;
    const program = check(text);
    expect(program.diagnostics).toEqual([]);
    const full = buildPattern(program, "Ripples", 4, canvas());
    const held = buildPattern(program, "Ripples", 4, canvas(), { holdFinish: true });
    expect(held.picture!.v).not.toEqual(full.picture!.v);
    expect(held.finish(held.picture!).v).toEqual(full.picture!.v);
    // Without holding back, there's nothing left to do.
    expect(full.finish(full.picture!)).toBe(full.picture);
  });

  it("don't give a creature a seed gene when they use random", () => {
    expect(check(SHELL).genes.map((g) => g.fullName)).not.toContain("seed");
  });
});

describe("pattern blocks in creatures", () => {
  it("make new pattern kinds, for textures, mixes, gene options and backgrounds", () => {
    const program = check(SHELL);
    expect(program.diagnostics).toEqual([]);
    expect(formatText(SHELL).text).toBe(SHELL);
    const { shapes, diagnostics } = build(program);
    expect(diagnostics).toEqual([]);
    const [first, second] = shapes.map((s) => s.texture!) as [Pattern, Pattern];
    expect(first.kind).toBe("Ripples");
    expect(first.source?.text).toBe(patternFileText(program, "Ripples"));
    expect(first.source?.genes).toEqual([["Ripples.rings", 8]]);
    expect(second.kind).toBe("cells");
    expect(second.mix?.kind).toBe("Ripples");
    expect(second.mix?.source?.text).toContain("pattern Ripples");
    const fill = buildBackground(program).fill as Pattern;
    expect(fill.kind).toBe("Ripples");
    expect(fill.source).toBeDefined();
  });

  it("carry the genes of a variant", () => {
    const program = check(SHELL);
    const many = program.variants.find((v) => v.name === "Many")!;
    const { shapes } = build(program, { genes: many.values });
    expect(shapes[0]!.texture!.source?.genes).toEqual([["Ripples.rings", 18]]);
  });

  it("rename with their genes' full names in variants, with a warning", () => {
    const program = check(SHELL);
    const result = rename(program, SHELL.indexOf("Ripples {"), "Waves");
    if ("error" in result) throw new Error(result.error);
    expect(result.warning).toMatch(/Ripples\.rings/);
    const renamed = applyEdits(SHELL, result.edits);
    expect(renamed).toContain("variant Many { Waves.rings = 18 }");
    expect(renamed).not.toContain("Ripples");
    expect(check(renamed).diagnostics).toEqual([]);
  });

  it("convert into pattern files that check and draw the same", () => {
    const program = check(SHELL);
    const file = check(patternFileText(program, "Ripples")!);
    expect(file.diagnostics).toEqual([]);
    expect(buildPattern(file, "Ripples", 3, canvas()).picture!.v).toEqual(
      buildPattern(program, "Ripples", 3, canvas()).picture!.v,
    );
  });

  it("are self-contained", () => {
    expect(
      errors(`creature C
gene size = 1 in 0..2
pattern P {
  value picture {
    value size
  }
}
`),
    ).toContainEqual("A pattern can't use the creature's `size`; it must be self-contained.");
    expect(errors("creature C\nshape ball\nlay\nlet p = picture {\n  value 1\n}\n")).toContainEqual(
      expect.stringMatching(/only be used in a pattern|There's nothing called `picture`/),
    );
  });

  it("need a name of their own", () => {
    expect(errors("creature C\npattern marble {\n  value clouds()\n}\n")).toContainEqual(
      expect.stringMatching(/built in/),
    );
    expect(
      errors("creature C\npart P {\n  lay\n}\npattern P {\n  value clouds()\n}\nP\n"),
    ).toContainEqual(expect.stringMatching(/already/));
  });
});

describe("a pattern file on a ball", () => {
  it("is a creature wearing the pattern, with the file's genes", () => {
    const ball = patternOnBall(check(RIPPLES));
    expect(ball.diagnostics).toEqual([]);
    expect(ball.file.kind).toBe("creature");
    expect(ball.genes.map((g) => g.fullName)).toEqual(["Ripples.rings", "Ripples.wobble"]);
    const { shapes } = build(ball, { genes: new Map([["Ripples.rings", 12]]) });
    expect(shapes[0]!.texture!.kind).toBe("Ripples");
    expect(shapes[0]!.texture!.source?.genes).toContainEqual(["Ripples.rings", 12]);
  });
});

describe("patternsOf", () => {
  it("gives a file's patterns with the sources their recipes carry", () => {
    const program = check(SHELL);
    const [ripples, ...rest] = patternsOf(program, new Map([["Ripples.rings", 12]]));
    expect(rest).toEqual([]);
    expect(ripples!.name).toBe("Ripples");
    expect(ripples!.source.genes).toEqual([["Ripples.rings", 12]]);
    // The same source a texture of the creature carries, at the same gene values.
    const built = build(program, { genes: new Map([["Ripples.rings", 12]]) });
    expect(built.shapes[0]!.texture!.source).toEqual(ripples!.source);
    expect(patternsOf(check(RIPPLES)).map((p) => p.name)).toEqual(["Ripples"]);
    expect(patternsOf(check("creature C\nlay\n"))).toEqual([]);
  });
});

describe("help in pattern code", () => {
  const title = (text: string, word: string, along = 1) =>
    helpAt(check(text), text.indexOf(word) + along)?.help.title;

  it("explains the pattern words, and leaves names called the same alone", () => {
    expect(title(SHELL, "pattern Ripples {")).toBe("pattern Name { … }");
    expect(title(RIPPLES, "pattern Ripples")).toBe("pattern Name { … }");
    expect(title(SHELL, "pattern(kind")).toMatch(/^pattern\(kind/);
    expect(title(RIPPLES, "value picture")).toBe("value v");
    expect(title(RIPPLES, "picture {")).toBe("picture { … }");
    expect(title("creature C\nlet value = 3\nforward value\n", "value\n")).toBe("value");
  });

  it("knows the names of the pattern and of each pixel", () => {
    expect(title(RIPPLES, "r * rings", 0)).toBe("r");
    expect(title(RIPPLES, "rings * 180")).toBe("gene Ripples.rings");
    expect(title(RIPPLES, "turn + lumps")).toBe("turn");
    expect(title(SHELL, "Ripples, 0.5")).toBe("pattern Ripples");
    const names = (text: string, word: string) =>
      completionsAt(check(text), text.indexOf(word)).map((c) => c.label);
    expect(names(RIPPLES, "value ripple")).toEqual(expect.arrayContaining(["x", "a", "ripple"]));
    expect(names(RIPPLES, "let lumps")).not.toContain("x");
    // A pattern block can't see the creature's names, and the creature can't see the pattern's.
    expect(names(SHELL, "value sin")).not.toContain("kind");
    expect(names(SHELL, "shape ball")).not.toContain("rings");
  });
});

describe("rules of pattern code", () => {
  const pattern = (body: string) => errors(`pattern P\n${body}`);

  it("ends with one value, a picture", () => {
    expect(pattern("let n = clouds()\n")).toContainEqual(expect.stringMatching(/needs a `value`/));
    expect(pattern("value 1\n")).toContainEqual(expect.stringMatching(/must be a picture/));
    expect(pattern("value clouds()\nlet n = 1\n")).toContainEqual(
      expect.stringMatching(/must be the last/),
    );
    expect(pattern("value picture {\n  let n = 1\n}\n")).toContainEqual(
      expect.stringMatching(/A picture needs a `value`/),
    );
  });

  it("keeps random and the picture functions out of the per-pixel code", () => {
    expect(pattern("value picture {\n  value random(0, 1)\n}\n")).toContainEqual(
      expect.stringMatching(/`random` can't be used inside/),
    );
    expect(pattern("value picture {\n  value blur(clouds(), 1)(x, y)\n}\n")).toContainEqual(
      expect.stringMatching(/`blur` can't be used inside/),
    );
    expect(
      pattern("value picture {\n  let p = picture {\n    value 1\n  }\n  value 1\n}\n"),
    ).toContainEqual(expect.stringMatching(/can't be made inside/));
  });

  it("can't use the turtle, time or music, or lay shapes", () => {
    expect(pattern("value picture {\n  value time\n}\n")).toContainEqual(
      expect.stringMatching(/can't read `time`/),
    );
    expect(pattern("forward 1\nvalue clouds()\n")).toContainEqual(
      expect.stringMatching(/Pattern code can only hold/),
    );
  });

  it("gives x, y, r and a only inside picture { }", () => {
    expect(pattern("let n = x\nvalue clouds()\n")).toContainEqual(
      expect.stringMatching(/nothing called `x`/),
    );
    expect(pattern("value picture {\n  let r = 1\n  value r\n}\n")).toContainEqual(
      expect.stringMatching(/already/),
    );
  });

  it("leaves the picture words free for creatures to use as names", () => {
    expect(
      errors(
        "creature C\nlet stretch = 2\nlet power = 3\nlet blur = 1\nlet value = 4\nlet picture = 5\nlet clouds = 6\nforward stretch + power + blur + value + picture + clouds\n",
      ),
    ).toEqual([]);
    expect(errors("creature C\nlet n = clouds()\n")).toContainEqual(
      expect.stringMatching(/only patterns can use/),
    );
  });
});

describe("lists", () => {
  const run = (code: string) => build(check(`creature L\n${code}`));

  it("are made, joined, read and counted", () => {
    const { printed, diagnostics } = run(
      "let l = [1, 2]\nl += [3]\nprint(l, l[2], length(l), length((3, 4, 0)), [] + [true])\n",
    );
    expect(diagnostics).toEqual([]);
    expect(printed).toEqual(["[1, 2, 3] 3 3 5 [true]"]);
  });

  it("round positions, and say when there's no such item", () => {
    expect(run("print([5, 6, 7][1.5])\n").printed).toEqual(["7"]);
    expect(run("print([5, 6][2])\n").diagnostics[0]?.message).toMatch(/no item 2.*2 items/);
    expect(errors("creature L\nprint(3[0])\n")).toContainEqual(
      expect.stringMatching(/Only a list/),
    );
  });

  it("compare item by item", () => {
    expect(run("print([1, (1, 2, 3)] == [1, (1, 2, 3)], [1] == [2])\n").printed).toEqual([
      "true false",
    ]);
  });

  it("can't be genes", () => {
    expect(errors("creature L\ngene g = [1] in 0..1\n").length).toBeGreaterThan(0);
  });
});

describe("the two ways of running per-pixel code", () => {
  const dir = new URL("../../../patterns/", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith(".genie"));

  it.each(files)("give the same picture for %s", (file) => {
    const program = check(readFileSync(new URL(file, dir), "utf8"));
    expect(program.diagnostics).toEqual([]);
    const name = program.file.name;
    const draw = (pixels: "javascript" | "closures") =>
      buildPattern(program, name, 7, canvas(48), { pixels });
    const js = draw("javascript");
    expect(js.diagnostics).toEqual([]);
    expect(draw("closures").picture!.v).toEqual(js.picture!.v);
  });

  it("report the same errors", () => {
    const program = check("pattern P\nlet l = [1, 2]\nvalue picture {\n  value l[x * 10]\n}\n");
    const message = (pixels: "javascript" | "closures") =>
      buildPattern(program, "P", 1, canvas(8), { pixels }).diagnostics.map((d) => d.message);
    expect(message("javascript")).toEqual(message("closures"));
    expect(message("javascript")[0]).toMatch(/There's no item/);
  });

  it("never turn the code's own text into JavaScript", () => {
    const g = globalThis as { pwned?: number };
    delete g.pwned;
    const tricks = [
      '"); globalThis.pwned = 1; ("',
      '\\"); globalThis.pwned = 1; //',
      "`${globalThis.pwned = 1}`",
      "\n}; globalThis.pwned = 1; {",
      "</script><script>globalThis.pwned = 1</script>",
    ];
    for (const trick of tricks) {
      const quoted = JSON.stringify(trick);
      // Allowed (strings in `print`), and not allowed (strings as values): neither may run it.
      const texts = [
        `pattern P\nprint(${quoted})\nvalue picture {\n  print(${quoted})\n  value 1\n}\n`,
        `pattern P\nlet s = ${quoted}\nvalue picture {\n  let t = ${quoted}\n  value 1\n}\n`,
      ];
      for (const text of texts) {
        const program = check(text);
        for (const pixels of ["javascript", "closures"] as const) {
          buildPattern(program, "P", 1, canvas(2), { pixels });
        }
      }
      const fine = check(texts[0]!);
      expect(fine.diagnostics).toEqual([]);
      const built = buildPattern(fine, "P", 1, canvas(2), { pixels: "javascript" });
      expect([...built.picture!.v]).toEqual([1, 1, 1, 1]);
    }
    expect(g.pwned).toBeUndefined();
  });

  it("stop a loop that never ends", () => {
    const program = check(
      "pattern P\nvalue picture {\n  while true {\n    let n = 1\n  }\n  value 0\n}\n",
    );
    for (const pixels of ["javascript", "closures"] as const) {
      const { diagnostics } = buildPattern(program, "P", 1, canvas(2), { pixels });
      expect(diagnostics[0]?.message).toMatch(/never ends/);
    }
  }, 60_000);
});

describe("the patterns folder", () => {
  const dir = new URL("../../../patterns/", import.meta.url);

  it("has a twin of every built-in kind, each checking without problems", () => {
    const files = readdirSync(dir).filter((f) => f.endsWith(".genie"));
    expect(files).toHaveLength(11);
    for (const f of files) {
      const text = readFileSync(new URL(f, dir), "utf8");
      expect(check(text).diagnostics, f).toEqual([]);
    }
  });
});
