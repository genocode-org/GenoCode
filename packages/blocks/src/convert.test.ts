import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { format, formatText, parse } from "@genocode/core";
import { describe, expect, it } from "vitest";
import { fromBlocks, toBlocks } from "./convert.js";
import type { BlockState, WorkspaceState } from "./state.js";

const repo = join(import.meta.dirname, "../../..");

/** Code turned into blocks and back, printed by the formatter. */
function roundTrip(text: string): string {
  const parsed = parse(text);
  expect(parsed.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  // Through JSON, as Blockly saves it.
  const state = JSON.parse(JSON.stringify(toBlocks(parsed.file))) as WorkspaceState;
  const back = fromBlocks(state);
  expect(back.empty).toEqual([]);
  return format(back.file!);
}

describe("code to blocks and back", () => {
  for (const dir of ["creatures", "dances", "patterns"]) {
    for (const name of readdirSync(join(repo, dir)).filter((f) => f.endsWith(".genie"))) {
      it(`gives ${dir}/${name} back as the formatter writes it`, () => {
        const text = readFileSync(join(repo, dir, name), "utf8");
        expect(roundTrip(text)).toBe(formatText(text).text);
      });
    }
  }

  it("keeps a stroke", () => {
    const text = "creature Hair\n\nstroke {\n  repeat 4 {\n    lay\n    forward 1\n  }\n}\n";
    expect(roundTrip(text)).toBe(text);
  });

  it("keeps a focus point", () => {
    const text = "creature Focus\n\nlay\nbranch {\n  forward 3\n  focuspoint\n}\n";
    expect(roundTrip(text)).toBe(text);
  });

  it("keeps comments everywhere they can be", () => {
    const text = [
      "// before the header",
      "creature Notes",
      "// what it is",
      "",
      "gene size = 1 in 0.5..2  // how big",
      "",
      "// a note above",
      "branch {  // after the brace",
      "  lay",
      "  // at the end of the block",
      "}  // after the block",
      "if size > 1 {",
      "  lay",
      "} else {",
      "  forward 1  /* inline */",
      "}",
      "",
      "// at the very end",
      "",
    ].join("\n");
    expect(roundTrip(text)).toBe(formatText(text).text);
  });

  it("keeps a creature's own patterns, lists and pictures", () => {
    const text = [
      "creature Shell",
      "",
      "texture pattern(Ripples, 30, 4)",
      "lay",
      "",
      "pattern Ripples {",
      "  gene rings = 8 in 2..20",
      "",
      "  let sizes = [1, 2] + []",
      "  value picture {  // every pixel",
      "    // a ripple",
      "    value sin(r * rings * 180 * sizes[0]) * 0.5 + 0.5",
      "  }",
      "}",
      "",
    ].join("\n");
    expect(roundTrip(text)).toBe(formatText(text).text);
  });
});

describe("blocks to code", () => {
  const main = (body?: BlockState): WorkspaceState => ({
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: "g_main",
          fields: { NAME: "Made" },
          ...(body && { inputs: { BODY: { block: body } } }),
        },
      ],
    },
  });

  it("writes new blocks, with no details kept, as plain code", () => {
    const lay: BlockState = { type: "g_lay" };
    const grow: BlockState = {
      type: "g_command",
      fields: { CMD: "grow" },
      inputs: { VALUE: { block: { type: "g_number", fields: { NUM: "2" } } } },
      next: { block: lay },
      icons: { comment: { text: "bigger", pinned: false, height: 80, width: 160 } },
    };
    expect(format(fromBlocks(main(grow)).file!)).toBe("creature Made\n\n// bigger\ngrow 2\nlay\n");
  });

  it("notes empty slots instead of writing code", () => {
    const grow: BlockState = { type: "g_command", id: "g1", fields: { CMD: "grow" } };
    const r = fromBlocks(main(grow));
    expect(r.file).toBeUndefined();
    expect(r.empty).toEqual([{ block: "g1", input: "VALUE" }]);
  });

  it("writes a changed gene description and note", () => {
    const state = JSON.parse(
      JSON.stringify(
        toBlocks(parse("creature A\n\n// old note\ngene size = 1 in 0..2  // old\n").file),
      ),
    ) as WorkspaceState;
    const gene = state.blocks.blocks[0]!.inputs!["BODY"]!.block!;
    gene.fields!["DESC"] = "new description";
    gene.icons!.comment!.text = "new note\nsecond line";
    expect(format(fromBlocks(state).file!)).toBe(
      "creature A\n\n// new note\n// second line\ngene size = 1 in 0..2 // new description\n",
    );
  });
});
