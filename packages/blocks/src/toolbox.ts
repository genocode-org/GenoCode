// The palettes: the blocks to drag in, by kind (docs/LANGUAGE.md section 21). Parts and names are
// filled in from the creature: a block to call each of its parts and functions, and one for each of
// its genes and variables.

import type * as Blockly from "blockly/core";
import { HUES } from "./blocks.js";
import type { BlockState } from "./state.js";

const n = (num: string): { block: BlockState } => ({
  block: { type: "g_number", fields: { NUM: num } },
});
const name = (text: string): { block: BlockState } => ({
  block: { type: "g_name", fields: { NAME: text } },
});
const call = (callee: string, ...args: { block: BlockState }[]): { block: BlockState } => ({
  block: {
    type: "g_call",
    fields: { NAME: callee },
    extraState: { count: args.length },
    inputs: Object.fromEntries(args.map((a, k) => [`ARG${k}`, a])),
  },
});
const vector = (x: string, y: string, z: string): { block: BlockState } => ({
  block: { type: "g_vector", inputs: { X: n(x), Y: n(y), Z: n(z) } },
});

type Item = { kind: "block" } & BlockState;
const block = (b: BlockState): Item => ({ kind: "block", ...b });

const command = (cmd: string, v: { block: BlockState }): Item =>
  block({ type: "g_command", fields: { CMD: cmd }, inputs: { VALUE: v } });
const material = (prop: string, v: { block: BlockState }): Item =>
  block({ type: "g_material", fields: { PROP: prop }, inputs: { VALUE: v } });
const binary = (op: string, a: string, b: string): Item =>
  block({ type: "g_binary", fields: { OP: op }, inputs: { A: n(a), B: n(b) } });
const effect = (
  effectName: string,
  words: (string | null)[],
  values: { block: BlockState }[],
): Item =>
  block({
    type: "g_effect",
    fields: { NAME: effectName },
    extraState: { words },
    inputs: Object.fromEntries(values.map((v, k) => [`V${k}`, v])),
  });

const category = (label: string, hue: number, contents: object[]) => ({
  kind: "category",
  name: label,
  colour: String(hue),
  contents,
});

/** The palettes, as a Blockly toolbox. */
export const TOOLBOX = {
  kind: "categoryToolbox",
  contents: [
    category("Turtle", HUES.turtle, [
      command("forward", n("1")),
      command("back", n("1")),
      command("pitch", n("30")),
      command("yaw", n("30")),
      command("roll", n("30")),
      command("move", vector("0", "1", "0")),
      command("grow", n("0.8")),
      block({ type: "g_rotate", inputs: { ANGLE: n("45"), AXIS: name("x_axis") } }),
      block({ type: "g_mirror", fields: { AXIS: "x" } }),
      block({ type: "g_branch" }),
      block({ type: "g_symmetric", fields: { AXIS: "x" } }),
      block({ type: "g_focuspoint" }),
      block({ type: "g_turtle", fields: { FIELD: "position" } }),
    ]),
    category("Shapes and colour", HUES.look, [
      block({ type: "g_lay" }),
      block({ type: "g_lay_with" }),
      block({ type: "g_reshape" }),
      block({ type: "g_stroke" }),
      material("shape", name("ball")),
      material("colour", name("red")),
      material("colour", call("hsv", n("200"), n("0.8"), n("1"))),
      material("shine", n("0.5")),
      material("sharpness", n("0.5")),
      material("texture", call("pattern", name("marble"), n("200"), n("7"))),
      material("wear", n("1")),
      block({ type: "g_hex", fields: { HEX: "#ff8000" } }),
      block({
        type: "g_gradient",
        fields: { KIND: "gradient" },
        extraState: { count: 2 },
        inputs: { C0: name("red"), C1: name("blue") },
      }),
    ]),
    category("Control", HUES.control, [
      block({ type: "g_if", extraState: { count: 1 } }),
      block({ type: "g_if", extraState: { count: 1, hasElse: true } }),
      block({ type: "g_repeat", inputs: { COUNT: n("3") } }),
      block({ type: "g_for", fields: { VAR: "i" }, inputs: { FROM: n("0"), TO: n("1") } }),
      block({ type: "g_while" }),
      block({ type: "g_let", fields: { NAME: "x" }, inputs: { VALUE: n("0") } }),
      block({ type: "g_assign", fields: { NAME: "x", OP: "+=" }, inputs: { VALUE: n("1") } }),
      block({ type: "g_print", extraState: { count: 1 } }),
      block({ type: "g_return" }),
    ]),
    category("Values", HUES.values, [
      block({ type: "g_number", fields: { NUM: "1" } }),
      block({ type: "g_bool", fields: { BOOL: "true" } }),
      block({ type: "g_name", fields: { NAME: "name" } }),
      block({ type: "g_vector", inputs: vector("0", "0", "0").block.inputs! }),
      binary("+", "1", "1"),
      binary("*", "1", "1"),
      binary("<", "1", "1"),
      block({ type: "g_binary", fields: { OP: "and" } }),
      block({ type: "g_unary", fields: { OP: "-" } }),
      block({ type: "g_member", fields: { NAME: "x" } }),
      block(call("sin", n("30")).block),
      block(call("mix", n("0"), n("1"), n("0.5")).block),
      block(call("noise", n("0")).block),
      block({ type: "g_string", fields: { TEXT: "" } }),
    ]),
    category("Genes", HUES.genes, [
      block({
        type: "g_gene",
        fields: { NAME: "size", DESC: "how big it is", LOG: "FALSE" },
        extraState: { range: "range" },
        inputs: { VALUE: n("1"), MIN: n("0.5"), MAX: n("2") },
      }),
      block({
        type: "g_gene",
        fields: { NAME: "skin", DESC: "", LOG: "FALSE" },
        extraState: { range: "range" },
        inputs: {
          VALUE: call("hsv", n("200"), n("0.8"), n("1")),
          MIN: call("hsv", n("0"), n("0"), n("0")),
          MAX: call("hsv", n("360"), n("1"), n("1")),
        },
      }),
      block({
        type: "g_gene",
        fields: { NAME: "kind", DESC: "" },
        extraState: { range: "choice", count: 2 },
        inputs: { VALUE: name("ball"), OPT0: name("ball"), OPT1: name("cube") },
      }),
      block({
        type: "g_gene",
        fields: { NAME: "on", DESC: "" },
        extraState: { range: "none" },
        inputs: { VALUE: { block: { type: "g_bool", fields: { BOOL: "true" } } } },
      }),
      block({ type: "g_variant", fields: { NAME: "Big" } }),
      block({ type: "g_breed", fields: { ON: "off" } }),
      block({ type: "g_setting", fields: { GENE: "size" }, inputs: { VALUE: n("2") } }),
    ]),
    category("Patterns", HUES.look, [
      block({ type: "g_pattern", fields: { NAME: "Ripples" } }),
      block(call("clouds").block),
      block({
        type: "g_value",
        inputs: {
          VALUE: {
            block: {
              type: "g_picture",
              inputs: {
                BODY: {
                  block: {
                    type: "g_value",
                    inputs: { VALUE: call("sin", name("r")) },
                  },
                },
              },
            },
          },
        },
      }),
      block({ type: "g_picture" }),
      block(call("blur", name("p"), n("2")).block),
      block(call("stretch", name("p")).block),
      block({ type: "g_list", extraState: { count: 0 } }),
      block({ type: "g_index", inputs: { INDEX: n("0") } }),
    ]),
    category("Parts", HUES.parts, [
      block({ type: "g_part", fields: { NAME: "limb", PARAMS: "" } }),
      block({ type: "g_function", fields: { NAME: "twice", PARAMS: "x" } }),
    ]),
    { kind: "category", name: "Its parts", colour: String(HUES.parts), custom: "GENOCODE_PARTS" },
    { kind: "category", name: "Names", colour: String(HUES.values), custom: "GENOCODE_NAMES" },
    category("Music and dance", HUES.music, [
      block({ type: "g_time" }),
      block({ type: "g_beat" }),
      block({ type: "g_music", fields: { FIELD: "bass" } }),
      block({ type: "g_background" }),
      block({
        type: "g_fill",
        inputs: { VALUE: call("pattern", name("aurora"), n("200"), n("7")) },
      }),
      block({ type: "g_dance" }),
      effect(
        "morph",
        ["follows", null, "speed", null, "settle", null],
        [{ block: { type: "g_music", fields: { FIELD: "level" } } }, n("1"), n("2")],
      ),
      effect(
        "zoom",
        ["follows", null, "amount", null, "settle", null],
        [{ block: { type: "g_music", fields: { FIELD: "bass_hit" } } }, n("0.5"), n("15")],
      ),
      effect(
        "spin",
        ["follows", null, "from", null, "to", null, "smooth", null],
        [{ block: { type: "g_music", fields: { FIELD: "bass" } } }, n("45"), n("170"), n("0.4")],
      ),
      effect(
        "turn",
        ["on", null, "changes", "by", null],
        [{ block: { type: "g_music", fields: { FIELD: "mid" } } }, n("1")],
      ),
      effect(
        "reverse",
        ["on", null, "drops", "by", null, "on", null, "off", null],
        [{ block: { type: "g_music", fields: { FIELD: "bass" } } }, n("1"), n("4"), n("4")],
      ),
      effect(
        "flat",
        ["on", null, "drops", "by", null, "on", null, "off", null],
        [{ block: { type: "g_music", fields: { FIELD: "mid_hit" } } }, n("0.86"), n("24"), n("48")],
      ),
    ]),
  ],
};

/**
 * Fills the palettes that come from the creature: a block to call each of its parts and functions,
 * and one for each of its genes and variables.
 */
export function registerCategories(ws: Blockly.WorkspaceSvg): void {
  ws.registerToolboxCategoryCallback("GENOCODE_PARTS", (w) => {
    const items: Item[] = [];
    for (const b of w.getAllBlocks(false)) {
      if (b.type !== "g_part" && b.type !== "g_function") continue;
      const params = String(b.getFieldValue("PARAMS") ?? "")
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p !== "");
      const callName = String(b.getFieldValue("NAME"));
      items.push(
        block({
          type: b.type === "g_part" ? "g_partcall" : "g_call",
          fields: { NAME: callName },
          extraState: { count: params.length },
        }),
      );
    }
    return items as never;
  });
  ws.registerToolboxCategoryCallback("GENOCODE_NAMES", (w) => {
    const names = new Set<string>();
    for (const b of w.getAllBlocks(false)) {
      if (b.type === "g_gene" || b.type === "g_let") names.add(String(b.getFieldValue("NAME")));
      if (b.type === "g_for") names.add(String(b.getFieldValue("VAR")));
      if (b.type === "g_repeat" && b.getFieldValue("AS")) names.add(String(b.getFieldValue("AS")));
      if (b.type === "g_part" || b.type === "g_function") {
        for (const p of String(b.getFieldValue("PARAMS") ?? "").split(",")) {
          if (p.trim()) names.add(p.trim());
        }
      }
    }
    return [...names].sort().map((text) => block(name(text).block)) as never;
  });
}
