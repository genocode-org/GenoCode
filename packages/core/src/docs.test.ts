// Keeps the examples in docs/LANGUAGE.md and docs/REFERENCE.md valid: complete files must check (and
// the Flower must build), and fragments must at least parse. The reference must cover every built-in.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUILTIN_CONSTANTS, BUILTIN_FUNCTIONS, PICTURE_FUNCTIONS } from "./builtins.js";
import { check } from "./checker.js";
import { EFFECT_HELP, MEMBER_HELP } from "./help.js";
import { build } from "./interpreter.js";
import { KEYWORDS } from "./lexer.js";
import { parse } from "./parser.js";

const doc = (name: string) =>
  readFileSync(new URL(`../../../docs/${name}`, import.meta.url), "utf8");
/** A document's code examples: its fenced blocks without a language (syntax lines are `text`). */
const examples = (markdown: string) =>
  [...markdown.matchAll(/^```(\w*)\n([\s\S]*?)^```$/gm)].filter((m) => !m[1]).map((m) => m[2]!);
const spec = doc("LANGUAGE.md");
const blocks = examples(spec);
const reference = doc("REFERENCE.md");
const guide = doc("GETTING_STARTED.md");

const isFile = (b: string) => /^(creature|background|dance|pattern) \w+\n/.test(b);
const isWrappedBlock = (b: string) => /^(background|dance) \{\n/.test(b);
const isCode = (b: string) =>
  !b.includes("…") &&
  !b.includes("next():") &&
  !b.includes("file          =") &&
  !b.startsWith("creature gene part");

/** Tests for each example: files check. */
function checkExamples(blocks: string[]): void {
  for (const [i, b] of blocks.entries()) {
    if (isFile(b)) {
      it(`example ${i} (${b.split("\n")[0]}) checks`, () => {
        const r = check(b);
        expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      });
    } else if (isWrappedBlock(b)) {
      it(`example ${i} (${b.split("\n")[0]}) checks inside a creature`, () => {
        const r = check(`creature Example\n${b}`);
        expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      });
    } else if (isCode(b)) {
      it(`example ${i} (${b.split("\n")[0]}) parses`, () => {
        expect(parse(`creature Example\n${b}`).diagnostics).toEqual([]);
      });
    }
  }
}

describe("docs/LANGUAGE.md examples", () => {
  it("names the version of core that builds it", () => {
    const { version } = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    const minor = version.split(".").slice(0, 2).join(".");
    expect(spec).toContain(`Version ${minor}, as built by \`@genocode/core\` ${minor}.`);
  });

  it("has the examples this test expects", () => {
    expect(blocks.filter(isFile).length).toBeGreaterThanOrEqual(2);
  });

  checkExamples(blocks);

  it("the Flower builds 22 shapes", () => {
    const flower = blocks.find((b) => b.startsWith("creature Flower"))!;
    expect(build(check(flower)).shapes).toHaveLength(22);
  });
});

describe("docs/REFERENCE.md", () => {
  const headings = new Set([...reference.matchAll(/^### (\S+)/gm)].map((m) => m[1]!));

  it("has an entry for every built-in function", () => {
    const names = [...BUILTIN_FUNCTIONS.keys(), ...PICTURE_FUNCTIONS.keys()];
    expect(names.filter((n) => !headings.has(n))).toEqual([]);
  });

  it("has an entry for every statement and dance effect", () => {
    const statements = [
      ...["creature", "breed", "variant", "gene", "let", "part", "function", "return", "if"],
      ...["repeat", "for", "while", "forward", "back", "move", "pitch", "yaw", "roll", "rotate"],
      ...["grow", "mirror", "branch", "symmetric", "reshape", "shape", "lay", "colour", "shine"],
      ...["sharpness", "texture", "wear", "background", "fill", "dance", "print", "time", "beat"],
      ...["music", "turtle", "pattern", "picture", "value", "gradient", "spectrum"],
      ...EFFECT_HELP.keys(),
    ];
    expect(statements.filter((n) => !headings.has(n))).toEqual([]);
  });

  it("shows every keyword, constant and input in its code", () => {
    const code = [...reference.matchAll(/```\w*\n([\s\S]*?)^```$|`([^`\n]+)`/gm)];
    // Each word on its own, and dotted names such as `music.bass` whole.
    const words = new Set(
      code
        .flatMap((m) => (m[1] ?? m[2]!).match(/\w+(\.\w+)*/g) ?? [])
        .flatMap((w) => [w, ...w.split(".")]),
    );
    const members = [...MEMBER_HELP].flatMap(([of, parts]) =>
      [...parts.keys()].map((p) => `${of}.${p}`),
    );
    const names = [...KEYWORDS, ...BUILTIN_CONSTANTS.keys(), ...members];
    expect(names.filter((n) => !words.has(n))).toEqual([]);
  });

  checkExamples(examples(reference));
});

describe("pictures in the docs", () => {
  // Each marked example's picture is drawn by docs/pictures.mjs, which keeps a fingerprint of the
  // code it drew in docs/images/pictures.json.
  const images = new URL("../../../docs/images/", import.meta.url);
  const drawn = JSON.parse(readFileSync(new URL("pictures.json", images), "utf8")) as Record<
    string,
    string
  >;
  const marked = [spec, reference].flatMap((markdown) =>
    [
      ...markdown.matchAll(
        /^<!-- picture: (\S+)((?: [\w-]+=\S+)*) -->\n\n?```\n([\s\S]*?)^```\n\n!\[[^\]\n]+\]\(images\/(\S+)\.png\)$/gm,
      ),
    ].map((m) => ({
      name: m[1]!,
      shown: m[4]!,
      fingerprint: createHash("sha256")
        .update(JSON.stringify([m[2]!.trim(), m[3]!]))
        .digest("hex")
        .slice(0, 16),
    })),
  );

  it("every marker is followed by its code and its picture, with a description", () => {
    const markers = [spec, reference].flatMap((m) => m.match(/^<!-- picture:/gm) ?? []);
    expect(marked.length).toBe(markers.length);
    expect(marked.filter((m) => m.shown !== m.name)).toEqual([]);
  });

  it("every picture was drawn from the code above it: run `node docs/pictures.mjs` if not", () => {
    const stale = marked.filter((m) => drawn[m.name] !== m.fingerprint).map((m) => m.name);
    expect(stale).toEqual([]);
    expect(Object.keys(drawn).sort()).toEqual(marked.map((m) => m.name).sort());
  });

  it("has every picture file, and no others", () => {
    const files = readdirSync(images).filter((f) => f.endsWith(".png"));
    expect(files.sort()).toEqual(marked.map((m) => `${m.name}.png`).sort());
  });
});

describe("docs/GETTING_STARTED.md examples", () => {
  const files = [...guide.matchAll(/```\n([\s\S]*?)```/g)]
    .map((m) => m[1]!)
    .filter((b) => b.startsWith("creature "));

  it("has its creatures", () => expect(files.length).toBeGreaterThanOrEqual(4));

  for (const [i, b] of files.entries()) {
    it(`creature ${i} builds`, () => {
      const r = check(b);
      expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      expect(build(r).shapes.length).toBeGreaterThan(0);
    });
  }
});
