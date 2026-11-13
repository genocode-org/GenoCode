// The blocks themselves, for Blockly (docs/LANGUAGE.md section 21): one for every construct, with
// fields and inputs named as convert.ts reads and writes them. Labels are friendlier than the
// keywords where that helps ("turn left/right" for `yaw`). Blocks whose shape depends on the code
// (how many arguments, else-ifs, options or stops) rebuild their inputs from their extra state, and
// offer to add or remove them from their context menu.

import * as Blockly from "blockly/core";
import { MUSIC_FIELDS } from "@genocode/core";
import { colourOf, FieldNameText, FieldNumberText, pickColour, swatch } from "./fields.js";
import type { ExtraState } from "./state.js";

/** What the app does for the blocks: exporting a background or dance as its own file. */
export const hooks: { exportDefinition?: (kind: "background" | "dance") => void } = {};

/** A picture of a download arrow, for the export buttons. */
const EXPORT_ICON = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="#dfe5f2" ' +
    'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M3 13.5h10"/></svg>',
)}`;

/** An export button for a background or dance block. */
function exportButton(kind: "background" | "dance"): Blockly.FieldImage {
  return new Blockly.FieldImage(EXPORT_ICON, 16, 16, `Export the ${kind} as its own file`, () =>
    hooks.exportDefinition?.(kind),
  );
}

/** A colour block's swatch, which opens a colour picker, kept up to date as its values change. */
function addSwatch(input: Blockly.Input): void {
  input.appendField(
    new Blockly.FieldImage(swatch(undefined), 16, 16, "Pick a colour", pickColour),
    "SWATCH",
  );
}

function updateSwatch(block: Blockly.Block): void {
  const field = block.getField("SWATCH");
  if (!field) return;
  const rgb = colourOf(block);
  const src = swatch(rgb);
  if (field.getValue() !== src) field.setValue(src);
  if (field.isVisible() !== (rgb !== undefined)) {
    field.setVisible(rgb !== undefined);
    if (block instanceof Blockly.BlockSvg && block.rendered) block.queueRender();
  }
}

/** The colours of the palettes' blocks, as hues. */
export const HUES = {
  turtle: 210,
  look: 290,
  control: 120,
  values: 230,
  genes: 330,
  parts: 20,
  music: 170,
} as const;

const TURTLE_FIELDS = [
  "position",
  "heading",
  "up",
  "side",
  "size",
  "mirrored",
  "shape",
  "colour",
  "color",
  "shine",
  "sharpness",
  "texture",
  "wear",
];

/** The dance effects (docs/LANGUAGE.md section 17). */
const EFFECTS = ["morph", "zoom", "spin", "turn", "reverse", "flat"];

const COMMANDS: [string, string][] = [
  ["move forward", "forward"],
  ["move back", "back"],
  ["move by", "move"],
  ["turn up/down", "pitch"],
  ["turn left/right", "yaw"],
  ["roll", "roll"],
  ["grow", "grow"],
];

const MATERIALS: [string, string][] = [
  ["shape", "shape"],
  ["colour", "colour"],
  ["color", "color"],
  ["shine", "shine"],
  ["sharpness", "sharpness"],
  ["texture", "texture"],
  ["wear", "wear"],
];

const OPERATORS = ["+", "-", "*", "/", "%", "^", "==", "!=", "<", "<=", ">", ">=", "and", "or"];

const options = (values: readonly string[]): [string, string][] => values.map((v) => [v, v]);
const axes = () => new Blockly.FieldDropdown(options(["x", "y", "z"]));

/** A block of ours: its extra state, and how it rebuilds its inputs from it. */
type GBlock = Blockly.Block & { extra: ExtraState; shape?: () => void };

/** What every block of ours shares: keeping its extra state, and rebuilding from it. */
const keeps = {
  saveExtraState(this: GBlock): ExtraState | null {
    return Object.keys(this.extra).length > 0 ? this.extra : null;
  },
  loadExtraState(this: GBlock, state: ExtraState): void {
    this.extra = { ...state };
    this.shape?.();
  },
};

/** Changes a block's extra state from its menu, as an undoable change other views hear about. */
function change(block: GBlock, edit: (extra: ExtraState) => void): void {
  const before = JSON.stringify(block.saveExtraState?.() ?? null);
  edit(block.extra);
  block.shape?.();
  const after = JSON.stringify(block.saveExtraState?.() ?? null);
  const Change = Blockly.Events.get(Blockly.Events.BLOCK_CHANGE);
  Blockly.Events.fire(new Change(block, "mutation", null, before, after));
}

/** Makes sure inputs `prefix0` … `prefix(count - 1)` exist, before `before` if given. */
function numbered(
  block: GBlock,
  prefix: string,
  count: number,
  add: (name: string, k: number) => void,
  before?: string,
): void {
  for (let k = 0; block.getInput(`${prefix}${k}`); k++) {
    if (k >= count) block.removeInput(`${prefix}${k}`);
  }
  for (let k = 0; k < count; k++) {
    if (block.getInput(`${prefix}${k}`)) continue;
    add(`${prefix}${k}`, k);
    if (before && block.getInput(before)) block.moveInputBefore(`${prefix}${k}`, before);
  }
}

/** Context-menu items to add and remove numbered inputs. */
function countMenu(
  block: GBlock,
  menu: Blockly.ContextMenuRegistry.LegacyContextMenuOption[],
  what: string,
  least = 0,
): void {
  const count = block.extra.count ?? 0;
  menu.push(
    {
      text: `Add ${what}`,
      enabled: true,
      callback: () => change(block, (x) => (x.count = count + 1)),
    },
    {
      text: `Remove the last ${what}`,
      enabled: count > least,
      callback: () => change(block, (x) => (x.count = count - 1)),
    },
  );
}

function define(type: string, spec: Record<string, unknown>): void {
  Blockly.Blocks[type] = { ...keeps, ...spec };
}

function statement(b: Blockly.Block, hue: number, tooltip: string): void {
  b.setPreviousStatement(true, null);
  b.setNextStatement(true, null);
  b.setColour(hue);
  b.setTooltip(tooltip);
}

function value(b: Blockly.Block, hue: number, tooltip: string): void {
  b.setOutput(true, null);
  b.setColour(hue);
  b.setTooltip(tooltip);
  b.setInputsInline(true);
}

let defined = false;

/** Defines every GenoCode block with Blockly. Safe to call more than once. */
export function defineBlocks(): void {
  if (defined) return;
  defined = true;

  // ---------- the program ----------

  define("g_main", {
    init(this: GBlock) {
      this.extra = {};
      this.appendDummyInput("HEAD")
        .appendField(new Blockly.FieldLabel("creature"), "KIND")
        .appendField(new Blockly.FieldTextInput("New_Creature"), "NAME");
      this.appendStatementInput("BODY");
      this.setColour(HUES.parts);
      this.setTooltip("The creature: its genes and the statements that build it, from the top.");
      this.setDeletable(false);
    },
    shape(this: GBlock) {
      this.setFieldValue(this.extra.file?.kind ?? "creature", "KIND");
    },
  });

  for (const [type, word, tooltip] of [
    ["g_part", "part", "A part: statements to run where it's called, with these parameters."],
    ["g_function", "function", "A function: works out a value from its parameters."],
  ] as const) {
    define(type, {
      init(this: GBlock) {
        this.extra = {};
        this.appendDummyInput()
          .appendField(word)
          .appendField(new Blockly.FieldTextInput("name"), "NAME")
          .appendField("(")
          .appendField(new Blockly.FieldTextInput(""), "PARAMS")
          .appendField(")");
        this.appendStatementInput("BODY");
        this.setColour(HUES.parts);
        this.setTooltip(tooltip);
      },
    });
  }

  define("g_background", {
    init(this: GBlock) {
      this.extra = {};
      this.appendDummyInput()
        .appendField("background")
        .appendField(new Blockly.FieldImage(swatch(undefined), 48, 24, "A preview"), "PREVIEW")
        .appendField(exportButton("background"));
      this.appendStatementInput("BODY");
      this.setColour(HUES.music);
      this.setTooltip("The background the creature is shown against: its genes, then one fill.");
    },
  });

  define("g_dance", {
    init(this: GBlock) {
      this.extra = {};
      this.appendDummyInput().appendField("dance").appendField(exportButton("dance"));
      this.appendStatementInput("BODY");
      this.setColour(HUES.music);
      this.setTooltip("The creature's own dance style: its genes and one line per effect.");
    },
  });

  define("g_pattern", {
    init(this: GBlock) {
      this.extra = {};
      this.appendDummyInput()
        .appendField("pattern")
        .appendField(new Blockly.FieldTextInput("Name"), "NAME");
      this.appendStatementInput("BODY");
      this.setColour(HUES.look);
      this.setTooltip(
        "A pattern kind of the creature's own: its genes and settings, then the picture it makes.",
      );
    },
  });

  define("g_value", {
    init(this: GBlock) {
      this.extra = {};
      this.appendValueInput("VALUE").appendField("value");
      statement(
        this,
        HUES.look,
        "What a pattern gives, its picture; or, in a picture block, the pixel's number.",
      );
    },
  });

  define("g_picture", {
    init(this: GBlock) {
      this.extra = {};
      this.appendDummyInput().appendField("picture: for every pixel x, y, r, a");
      this.appendStatementInput("BODY");
      value(this, HUES.look, "A picture, made by running these statements for every pixel.");
      this.setInputsInline(false);
    },
  });

  define("g_variant", {
    init(this: GBlock) {
      this.extra = {};
      this.appendDummyInput()
        .appendField("variant")
        .appendField(new Blockly.FieldTextInput("Name"), "NAME");
      this.appendStatementInput("BODY");
      this.setColour(HUES.genes);
      this.setTooltip("Another set of gene values for the creature.");
    },
  });

  define("g_breed", {
    init(this: GBlock) {
      this.extra = {};
      this.appendDummyInput()
        .appendField("breed")
        .appendField(new Blockly.FieldDropdown(options(["off", "on"])), "ON");
      statement(this, HUES.genes, "Whether the app may mutate and breed the creature.");
    },
  });

  define("g_setting", {
    init(this: GBlock) {
      this.extra = {};
      this.appendValueInput("VALUE")
        .appendField(new Blockly.FieldTextInput("gene"), "GENE")
        .appendField("=");
      statement(this, HUES.genes, "A gene's value in this variant.");
      this.setInputsInline(true);
    },
  });

  // ---------- genes ----------

  define("g_gene", {
    init(this: GBlock) {
      this.extra = { range: "range" };
      this.appendValueInput("VALUE")
        .appendField("gene")
        .appendField(new Blockly.FieldTextInput("name"), "NAME")
        .appendField("=");
      // Three rows: the value, the range, and the description.
      this.appendEndRowInput("ROW1");
      this.appendEndRowInput("ROW2");
      this.appendDummyInput("DESC_INPUT")
        .appendField("//")
        .appendField(new Blockly.FieldTextInput(""), "DESC");
      statement(
        this,
        HUES.genes,
        "A gene: a value that can mutate, breed and morph, and its range.",
      );
      this.setInputsInline(true);
      this.shape?.();
    },
    shape(this: GBlock) {
      const range = this.extra.range ?? "none";
      for (const name of ["MIN", "MAX", "STEP", "LOG_INPUT"]) {
        if (range !== "range" && this.getInput(name)) this.removeInput(name);
      }
      if (range === "range" && !this.getInput("MIN")) {
        this.appendValueInput("MIN").appendField("in");
        this.appendValueInput("MAX").appendField("..");
        this.appendValueInput("STEP").appendField("step");
        this.appendDummyInput("LOG_INPUT")
          .appendField("log")
          .appendField(new Blockly.FieldCheckbox("FALSE"), "LOG");
        for (const name of ["MIN", "MAX", "STEP", "LOG_INPUT"]) this.moveInputBefore(name, "ROW2");
      }
      if (range === "choice" && !this.getInput("FROM")) {
        this.appendDummyInput("FROM").appendField("from");
        this.moveInputBefore("FROM", "ROW2");
      }
      if (range !== "choice" && this.getInput("FROM")) this.removeInput("FROM");
      numbered(
        this,
        "OPT",
        range === "choice" ? (this.extra.count ?? 2) : 0,
        (name, k) => this.appendValueInput(name).appendField(k === 0 ? "" : ","),
        "ROW2",
      );
    },
    customContextMenu(this: GBlock, menu: Blockly.ContextMenuRegistry.LegacyContextMenuOption[]) {
      const range = this.extra.range ?? "none";
      for (const [r, text] of [
        ["range", "Give it a range (in … ..)"],
        ["choice", "Make it a choice (from …)"],
        ["none", "Give it no range (bools)"],
      ] as const) {
        if (r !== range) {
          menu.push({
            text,
            enabled: true,
            callback: () =>
              change(this, (x) => {
                x.range = r;
                if (r === "choice") x.count = Math.max(2, x.count ?? 2);
              }),
          });
        }
      }
      if (range === "choice") countMenu(this, menu, "option", 2);
    },
  });

  // ---------- statements ----------

  define("g_let", {
    init(this: GBlock) {
      this.extra = {};
      this.appendValueInput("VALUE")
        .appendField("let")
        .appendField(new Blockly.FieldTextInput("name"), "NAME")
        .appendField("=");
      statement(this, HUES.control, "Makes a variable.");
      this.setInputsInline(true);
    },
  });

  define("g_assign", {
    init(this: GBlock) {
      this.extra = {};
      this.appendValueInput("VALUE")
        .appendField(new Blockly.FieldTextInput("name"), "NAME")
        .appendField(new Blockly.FieldDropdown(options(["=", "+=", "-=", "*=", "/="])), "OP");
      statement(this, HUES.control, "Changes a variable.");
      this.setInputsInline(true);
    },
  });

  for (const [type, word, hue, tooltip] of [
    ["g_partcall", "", HUES.parts, "Runs a part here."],
    ["g_print", "print", HUES.control, "Writes values out, to help find problems."],
  ] as const) {
    define(type, {
      init(this: GBlock) {
        this.extra = { count: 0 };
        const head = this.appendDummyInput("HEAD");
        if (type === "g_partcall") head.appendField(new Blockly.FieldTextInput("part"), "NAME");
        else head.appendField(word);
        statement(this, hue, tooltip);
        this.setInputsInline(true);
        this.shape?.();
      },
      shape(this: GBlock) {
        numbered(this, "ARG", this.extra.count ?? 0, (name, k) =>
          this.appendValueInput(name).appendField(k === 0 ? "(" : ","),
        );
      },
      customContextMenu(this: GBlock, menu: Blockly.ContextMenuRegistry.LegacyContextMenuOption[]) {
        countMenu(this, menu, "argument");
      },
    });
  }

  define("g_return", {
    init(this: GBlock) {
      this.extra = {};
      this.appendValueInput("VALUE").appendField("return");
      statement(this, HUES.parts, "Gives a function's value, or leaves a part early.");
    },
  });

  define("g_if", {
    init(this: GBlock) {
      this.extra = { count: 1 };
      this.shape?.();
      statement(this, HUES.control, "Runs blocks only when a condition is true.");
    },
    shape(this: GBlock) {
      const count = this.extra.count ?? 1;
      for (let k = 0; this.getInput(`COND${k}`); k++) {
        if (k >= count) {
          this.removeInput(`COND${k}`);
          this.removeInput(`DO${k}`);
        }
      }
      if (this.getInput("ELSE")) this.removeInput("ELSE");
      for (let k = 0; k < count; k++) {
        if (!this.getInput(`COND${k}`)) {
          this.appendValueInput(`COND${k}`).appendField(k === 0 ? "if" : "else if");
          this.appendStatementInput(`DO${k}`);
        }
      }
      if (this.extra.hasElse) this.appendStatementInput("ELSE").appendField("else");
    },
    customContextMenu(this: GBlock, menu: Blockly.ContextMenuRegistry.LegacyContextMenuOption[]) {
      countMenu(this, menu, "else if", 1);
      menu.push({
        text: this.extra.hasElse ? "Remove the else" : "Add an else",
        enabled: true,
        callback: () => change(this, (x) => (x.hasElse = !x.hasElse)),
      });
    },
  });

  define("g_repeat", {
    init(this: GBlock) {
      this.extra = {};
      this.appendValueInput("COUNT").appendField("repeat");
      this.appendDummyInput()
        .appendField("times, counting in")
        .appendField(new Blockly.FieldTextInput(""), "AS");
      this.appendStatementInput("DO");
      statement(this, HUES.control, "Runs blocks a number of times, counting from 0.");
      this.setInputsInline(true);
    },
  });

  define("g_for", {
    init(this: GBlock) {
      this.extra = {};
      this.appendValueInput("FROM")
        .appendField("for")
        .appendField(new Blockly.FieldTextInput("i"), "VAR")
        .appendField("from");
      this.appendValueInput("TO").appendField("to");
      this.appendValueInput("BY").appendField("by");
      this.appendStatementInput("DO");
      statement(this, HUES.control, "Runs blocks for each value from one number to another.");
      this.setInputsInline(true);
    },
  });

  define("g_while", {
    init(this: GBlock) {
      this.extra = {};
      this.appendValueInput("COND").appendField("while");
      this.appendStatementInput("DO");
      statement(this, HUES.control, "Runs blocks again and again while a condition is true.");
    },
  });

  define("g_branch", {
    init(this: GBlock) {
      this.extra = {};
      this.appendDummyInput().appendField("branch, then come back");
      this.appendStatementInput("DO");
      statement(this, HUES.turtle, "Runs blocks, then puts the turtle back as it was.");
    },
  });

  define("g_symmetric", {
    init(this: GBlock) {
      this.extra = {};
      this.appendDummyInput().appendField("symmetric in").appendField(axes(), "AXIS");
      this.appendStatementInput("DO");
      statement(this, HUES.turtle, "Runs blocks twice: as they are, and mirrored.");
    },
  });

  define("g_focuspoint", {
    init(this: GBlock) {
      this.extra = {};
      this.appendDummyInput().appendField("focus point here");
      statement(
        this,
        HUES.turtle,
        "Makes where the turtle is the creature's middle: the camera looks here, and a dance turns the creature round here.",
      );
    },
  });

  define("g_lay", {
    init(this: GBlock) {
      this.extra = {};
      this.appendDummyInput().appendField("lay a shape");
      statement(this, HUES.look, "Lays the current shape where the turtle is.");
    },
  });

  define("g_lay_with", {
    init(this: GBlock) {
      this.extra = {};
      this.appendDummyInput().appendField("lay a shape, changed by");
      this.appendStatementInput("DO");
      statement(this, HUES.look, "Lays the current shape, changed by these blocks for it alone.");
    },
  });

  define("g_reshape", {
    init(this: GBlock) {
      this.extra = {};
      this.appendDummyInput().appendField("reshape every later shape by");
      this.appendStatementInput("DO");
      statement(this, HUES.look, "Changes every shape laid after this, by these blocks.");
    },
  });

  define("g_stroke", {
    init(this: GBlock) {
      this.extra = {};
      this.appendDummyInput().appendField("one smooth stroke through");
      this.appendStatementInput("DO");
      statement(
        this,
        HUES.look,
        "Draws one smooth tube instead of separate shapes: every shape laid inside becomes a point the tube passes through.",
      );
    },
  });

  define("g_command", {
    init(this: GBlock) {
      this.extra = {};
      this.appendValueInput("VALUE").appendField(new Blockly.FieldDropdown(COMMANDS), "CMD");
      statement(this, HUES.turtle, "Moves, turns or grows the turtle.");
      this.setInputsInline(true);
    },
  });

  define("g_rotate", {
    init(this: GBlock) {
      this.extra = {};
      this.appendValueInput("ANGLE").appendField("rotate");
      this.appendValueInput("AXIS").appendField("around");
      statement(this, HUES.turtle, "Turns the turtle by an angle around an axis.");
      this.setInputsInline(true);
    },
  });

  define("g_mirror", {
    init(this: GBlock) {
      this.extra = {};
      this.appendDummyInput().appendField("mirror in").appendField(axes(), "AXIS");
      statement(this, HUES.turtle, "Mirrors the turtle.");
    },
  });

  define("g_material", {
    init(this: GBlock) {
      this.extra = {};
      this.appendValueInput("VALUE")
        .appendField("set")
        .appendField(new Blockly.FieldDropdown(MATERIALS), "PROP")
        .appendField("to");
      statement(this, HUES.look, "Sets the shape, colour or material of later shapes.");
      this.setInputsInline(true);
    },
  });

  define("g_fill", {
    init(this: GBlock) {
      this.extra = {};
      this.appendValueInput("VALUE").appendField("fill with");
      statement(this, HUES.music, "What the background shows: a pattern, a colour or a gradient.");
    },
  });

  define("g_effect", {
    init(this: GBlock) {
      this.extra = { words: [] };
      this.appendDummyInput("HEAD").appendField(
        new Blockly.FieldDropdown(options(EFFECTS)),
        "NAME",
      );
      statement(this, HUES.music, "One of the dance's effects, and what moves it.");
      this.setInputsInline(true);
    },
    shape(this: GBlock) {
      for (const input of [...this.inputList]) {
        if (input.name !== "HEAD") this.removeInput(input.name);
      }
      let k = 0;
      (this.extra.words ?? []).forEach((w, n) => {
        if (w === null) this.appendValueInput(`V${k++}`);
        else this.appendDummyInput(`W${n}`).appendField(w);
      });
    },
  });

  // ---------- values ----------

  define("g_number", {
    init(this: GBlock) {
      this.extra = {};
      this.appendDummyInput().appendField(new FieldNumberText("0"), "NUM");
      value(this, HUES.values, "A number. Write ° after it for degrees.");
    },
  });

  define("g_bool", {
    init(this: GBlock) {
      this.extra = {};
      this.appendDummyInput().appendField(
        new Blockly.FieldDropdown(options(["true", "false"])),
        "BOOL",
      );
      value(this, HUES.values, "True or false.");
    },
  });

  define("g_string", {
    init(this: GBlock) {
      this.extra = {};
      this.appendDummyInput()
        .appendField("“")
        .appendField(new Blockly.FieldTextInput(""), "TEXT")
        .appendField("”");
      value(this, HUES.values, "Some text, for print.");
    },
  });

  define("g_hex", {
    init(this: GBlock) {
      this.extra = {};
      const input = this.appendDummyInput();
      addSwatch(input);
      input.appendField(new Blockly.FieldTextInput("#ff8000"), "HEX");
      value(this, HUES.look, "A colour written in hex.");
    },
    onchange(this: GBlock) {
      updateSwatch(this);
    },
  });

  define("g_name", {
    init(this: GBlock) {
      this.extra = {};
      this.appendDummyInput().appendField(new FieldNameText("name"), "NAME");
      value(this, HUES.values, "A gene, variable or parameter, or a built-in name such as red.");
    },
  });

  define("g_turtle", {
    init(this: GBlock) {
      this.extra = {};
      this.appendDummyInput()
        .appendField("turtle's")
        .appendField(new Blockly.FieldDropdown(options(TURTLE_FIELDS)), "FIELD");
      value(this, HUES.turtle, "Reads the turtle.");
    },
  });

  define("g_time", {
    init(this: GBlock) {
      this.extra = {};
      this.appendDummyInput().appendField("time");
      value(this, HUES.music, "Seconds since the creature appeared.");
    },
  });

  define("g_beat", {
    init(this: GBlock) {
      this.extra = {};
      this.appendDummyInput().appendField("beat");
      value(this, HUES.music, "How far through the current beat of the music, 0 to 1.");
    },
  });

  define("g_music", {
    init(this: GBlock) {
      this.extra = {};
      this.appendDummyInput()
        .appendField("music's")
        .appendField(new Blockly.FieldDropdown(options(MUSIC_FIELDS)), "FIELD");
      value(this, HUES.music, "What the music is doing now. Most run from 0 to 1.");
    },
  });

  define("g_vector", {
    init(this: GBlock) {
      this.extra = {};
      this.appendValueInput("X").appendField("(");
      this.appendValueInput("Y").appendField(",");
      this.appendValueInput("Z").appendField(",");
      this.appendDummyInput().appendField(")");
      value(this, HUES.values, "A vector: x, y and z.");
    },
  });

  define("g_unary", {
    init(this: GBlock) {
      this.extra = {};
      this.appendValueInput("A").appendField(
        new Blockly.FieldDropdown(options(["-", "not"])),
        "OP",
      );
      value(this, HUES.values, "Minus a value, or not a condition.");
    },
  });

  define("g_binary", {
    init(this: GBlock) {
      this.extra = {};
      this.appendValueInput("A");
      this.appendValueInput("B").appendField(new Blockly.FieldDropdown(options(OPERATORS)), "OP");
      value(this, HUES.values, "Works out a value from two others.");
    },
  });

  define("g_member", {
    init(this: GBlock) {
      this.extra = {};
      this.appendValueInput("OBJ");
      this.appendDummyInput()
        .appendField("'s")
        .appendField(new Blockly.FieldTextInput("x"), "NAME");
      value(this, HUES.values, "A part of a value: a vector's x, a colour's hue, and so on.");
    },
  });

  for (const [type, tooltip] of [
    ["g_call", "Calls a function, or samples a gradient."],
    ["g_apply", "Calls the function or gradient a value gives."],
  ] as const) {
    define(type, {
      init(this: GBlock) {
        this.extra = { count: 0 };
        if (type === "g_call") {
          const head = this.appendDummyInput("HEAD");
          addSwatch(head);
          head.appendField(new Blockly.FieldTextInput("name"), "NAME");
          this.getField("SWATCH")?.setVisible(false);
        } else {
          this.appendValueInput("CALLEE").appendField("call");
        }
        value(this, HUES.values, tooltip);
        this.shape?.();
      },
      shape(this: GBlock) {
        numbered(this, "ARG", this.extra.count ?? 0, (name, k) =>
          this.appendValueInput(name).appendField(k === 0 ? "(" : ","),
        );
        if (this.getInput("CLOSE")) this.removeInput("CLOSE");
        this.appendDummyInput("CLOSE").appendField((this.extra.count ?? 0) === 0 ? "()" : ")");
      },
      customContextMenu(this: GBlock, menu: Blockly.ContextMenuRegistry.LegacyContextMenuOption[]) {
        countMenu(this, menu, "argument");
      },
      onchange(this: GBlock) {
        updateSwatch(this);
      },
    });
  }

  define("g_list", {
    init(this: GBlock) {
      this.extra = { count: 0 };
      this.appendDummyInput("HEAD").appendField("list");
      value(this, HUES.values, "Values in order: right-click to add or remove items.");
      this.shape?.();
    },
    shape(this: GBlock) {
      numbered(this, "ARG", this.extra.count ?? 0, (name, k) =>
        this.appendValueInput(name).appendField(k === 0 ? "[" : ","),
      );
      if (this.getInput("CLOSE")) this.removeInput("CLOSE");
      this.appendDummyInput("CLOSE").appendField((this.extra.count ?? 0) === 0 ? "[]" : "]");
    },
    customContextMenu(this: GBlock, menu: Blockly.ContextMenuRegistry.LegacyContextMenuOption[]) {
      countMenu(this, menu, "item");
    },
  });

  define("g_index", {
    init(this: GBlock) {
      this.extra = {};
      this.appendValueInput("OBJ");
      this.appendValueInput("INDEX").appendField("item");
      value(this, HUES.values, "An item of a list, counting from 0.");
    },
  });

  define("g_gradient", {
    init(this: GBlock) {
      this.extra = { count: 2 };
      this.appendDummyInput("HEAD").appendField(
        new Blockly.FieldDropdown(options(["gradient", "spectrum"])),
        "KIND",
      );
      value(this, HUES.look, "Colours blended from 0 to 1; a stop's 'at' is optional.");
      this.shape?.();
    },
    shape(this: GBlock) {
      const count = this.extra.count ?? 2;
      for (let k = 0; this.getInput(`C${k}`); k++) {
        if (k >= count) {
          this.removeInput(`C${k}`);
          this.removeInput(`AT${k}`);
        }
      }
      for (let k = 0; k < count; k++) {
        if (this.getInput(`C${k}`)) continue;
        this.appendValueInput(`C${k}`).appendField(k === 0 ? "(" : ",");
        this.appendValueInput(`AT${k}`).appendField("at");
      }
      if (this.getInput("CLOSE")) this.removeInput("CLOSE");
      this.appendDummyInput("CLOSE").appendField(")");
    },
    customContextMenu(this: GBlock, menu: Blockly.ContextMenuRegistry.LegacyContextMenuOption[]) {
      countMenu(this, menu, "colour", 1);
    },
  });
}
