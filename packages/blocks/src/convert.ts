// Code to blocks and back (docs/LANGUAGE.md section 21). A syntax tree becomes blocks in Blockly's
// saved form, and blocks become a syntax tree again, which the standard formatter prints. What a
// block doesn't show (blank lines, how a comment was written, the comments inside `{ … }`) is
// kept with it, so code turned into blocks and straight back comes out as the formatter writes it.

import type { Block, Comment, Expr, GeneDecl, Param, SourceFile, Span, Stmt } from "@genocode/core";
import type {
  BlockState,
  BodyComments,
  ExtraState,
  Meta,
  RawComment,
  WorkspaceState,
} from "./state.js";

/** The block types that stand on their own on the canvas, holding a part of the program. */
export const DEFINITIONS = [
  "g_part",
  "g_function",
  "g_background",
  "g_dance",
  "g_pattern",
  "g_variant",
];

/** The main block: the file's header, with the top-level statements below it. */
export const MAIN = "g_main";

// ---------- code to blocks ----------

/** A syntax tree (without errors) as blocks: the main block first, then each definition. */
export function toBlocks(file: SourceFile): WorkspaceState {
  const statements = file.items.filter((s) => !isDefinition(s));
  const definitions = file.items.filter(isDefinition);
  const main: BlockState = {
    type: MAIN,
    fields: { NAME: file.name },
    extraState: {
      file: {
        kind: file.kind,
        ...(file.headerComments.length > 0 && { header: raws(file.headerComments) }),
        ...(file.description.length > 0 && { description: file.description.map((c) => c.text) }),
        ...(file.endComments.length > 0 && { end: raws(file.endComments) }),
      },
    },
    ...note(file.description.map((c) => c.text)),
  };
  const body = chain(statements);
  if (body) main.inputs = { BODY: { block: body } };
  const blocks = [main, ...definitions.map((d, order) => withOrder(stmtBlock(d), order))];
  return { blocks: { languageVersion: 0, blocks } };
}

function withOrder(b: BlockState, order: number): BlockState {
  b.extraState = { ...b.extraState, order };
  return b;
}

function isDefinition(s: Stmt): boolean {
  return ["Part", "Function", "Background", "Dance", "Pattern", "Variant"].includes(s.kind);
}

function raws(comments: Comment[]): RawComment[] {
  return comments.map((c) => (c.blankBefore ? { text: c.text, blank: true } : { text: c.text }));
}

/** A note on a block showing comments, written without their `//`. */
function note(texts: string[]): Pick<BlockState, "icons"> {
  if (texts.length === 0) return {};
  return { icons: { comment: { text: noteText(texts), pinned: false, height: 80, width: 240 } } };
}

function noteText(texts: string[]): string {
  return texts.map((t) => t.replace(/^\/\/ ?/, "")).join("\n");
}

/** Statements as a stack of blocks, each joined to the next. */
function chain(items: Stmt[]): BlockState | undefined {
  let first: BlockState | undefined;
  let last: BlockState | undefined;
  for (const s of items) {
    const b = stmtBlock(s);
    if (last) last.next = { block: b };
    else first = b;
    last = b;
  }
  return first;
}

function metaOf(s: Stmt | undefined, bodies?: Record<string, Block>): Meta {
  const meta: Meta = {};
  if (s && s.leading.length > 0) meta.leading = raws(s.leading);
  if (s?.blankBefore) meta.blank = true;
  if (s?.trailing) meta.trailing = s.trailing.text;
  if (bodies) {
    const comments: Record<string, BodyComments> = {};
    for (const [name, b] of Object.entries(bodies)) {
      const c: BodyComments = {};
      if (b.open) c.open = b.open.text;
      if (b.endComments.length > 0) c.end = raws(b.endComments);
      if (b.close) c.close = b.close.text;
      if (Object.keys(c).length > 0) comments[name] = c;
    }
    if (Object.keys(comments).length > 0) meta.bodies = comments;
  }
  return meta;
}

function stmtBlock(s: Stmt): BlockState {
  const bodies: Record<string, Block> = {};
  const inputs: NonNullable<BlockState["inputs"]> = {};
  const fields: NonNullable<BlockState["fields"]> = {};
  const extra: ExtraState = {};
  const value = (name: string, e: Expr | undefined) => {
    if (e) inputs[name] = { block: exprBlock(e) };
  };
  const body = (name: string, b: Block) => {
    bodies[name] = b;
    const first = chain(b.items);
    if (first) inputs[name] = { block: first };
  };
  let type: string;
  switch (s.kind) {
    case "Gene":
      type = "g_gene";
      fields["NAME"] = s.name;
      fields["DESC"] = s.trailing ? describe(s.trailing.text) : "";
      value("VALUE", s.value);
      geneRange(s, extra, fields, value);
      break;
    case "Let":
      type = "g_let";
      fields["NAME"] = s.name;
      value("VALUE", s.value);
      break;
    case "Assign":
      type = "g_assign";
      fields["NAME"] = s.name;
      fields["OP"] = s.op;
      value("VALUE", s.value);
      break;
    case "PartCall":
      type = "g_partcall";
      fields["NAME"] = s.name;
      extra.count = s.args.length;
      s.args.forEach((a, k) => value(`ARG${k}`, a));
      break;
    case "Return":
      type = "g_return";
      value("VALUE", s.value);
      break;
    case "Print":
      type = "g_print";
      extra.count = s.args.length;
      s.args.forEach((a, k) => value(`ARG${k}`, a));
      break;
    case "If":
      type = "g_if";
      extra.count = s.branches.length;
      if (s.elseBlock) extra.hasElse = true;
      s.branches.forEach((b, k) => {
        value(`COND${k}`, b.condition);
        body(`DO${k}`, b.block);
      });
      if (s.elseBlock) body("ELSE", s.elseBlock);
      break;
    case "Repeat":
      type = "g_repeat";
      fields["AS"] = s.as?.name ?? "";
      value("COUNT", s.count);
      body("DO", s.block);
      break;
    case "For":
      type = "g_for";
      fields["VAR"] = s.variable.name;
      value("FROM", s.from);
      value("TO", s.to);
      value("BY", s.by);
      body("DO", s.block);
      break;
    case "While":
      type = "g_while";
      value("COND", s.condition);
      body("DO", s.block);
      break;
    case "Branch":
      type = "g_branch";
      body("DO", s.block);
      break;
    case "Symmetric":
      type = "g_symmetric";
      fields["AXIS"] = s.axis;
      body("DO", s.block);
      break;
    case "Lay":
      if (s.block) {
        type = "g_lay_with";
        body("DO", s.block);
      } else {
        type = "g_lay";
      }
      break;
    case "Reshape":
      type = "g_reshape";
      body("DO", s.block);
      break;
    case "Stroke":
      type = "g_stroke";
      body("DO", s.block);
      break;
    case "FocusPoint":
      type = "g_focuspoint";
      break;
    case "Command":
      type = "g_command";
      fields["CMD"] = s.command;
      value("VALUE", s.value);
      break;
    case "Rotate":
      type = "g_rotate";
      value("ANGLE", s.angle);
      value("AXIS", s.axis);
      break;
    case "Mirror":
      type = "g_mirror";
      fields["AXIS"] = s.axis;
      break;
    case "Material":
      type = "g_material";
      fields["PROP"] = s.keyword;
      value("VALUE", s.value);
      break;
    case "Fill":
      type = "g_fill";
      value("VALUE", s.value);
      break;
    case "Effect": {
      type = "g_effect";
      fields["NAME"] = s.name;
      let k = 0;
      extra.words = s.args.map((a) => {
        if (a.kind === "Word") return a.text;
        value(`V${k++}`, a.expr);
        return null;
      });
      break;
    }
    case "Part":
    case "Function":
      type = s.kind === "Part" ? "g_part" : "g_function";
      fields["NAME"] = s.name;
      fields["PARAMS"] = s.params.map((p) => p.name).join(", ");
      body("BODY", s.body);
      break;
    case "Background":
      type = "g_background";
      body("BODY", s.body);
      break;
    case "Dance":
      type = "g_dance";
      body("BODY", s.body);
      break;
    case "Pattern":
      type = "g_pattern";
      fields["NAME"] = s.name;
      body("BODY", s.body);
      break;
    case "Value":
      type = "g_value";
      value("VALUE", s.value);
      break;
    case "Variant":
      type = "g_variant";
      fields["NAME"] = s.name;
      body("BODY", s.body);
      break;
    case "Breed":
      type = "g_breed";
      fields["ON"] = s.on ? "on" : "off";
      break;
    case "GeneSetting":
      type = "g_setting";
      fields["GENE"] = s.gene;
      value("VALUE", s.value);
      break;
    case "ErrorStmt":
      throw new Error("Code with syntax errors can't be shown as blocks.");
  }
  // Kept even when empty: a block without it is new, made in the block editor.
  extra.meta = metaOf(s, bodies);
  const b: BlockState = { type };
  if (Object.keys(fields).length > 0) b.fields = fields;
  if (Object.keys(inputs).length > 0) b.inputs = inputs;
  if (Object.keys(extra).length > 0) b.extraState = extra;
  return { ...b, ...note(s.leading.map((c) => c.text)) };
}

function geneRange(
  g: GeneDecl,
  extra: ExtraState,
  fields: NonNullable<BlockState["fields"]>,
  value: (name: string, e: Expr | undefined) => void,
): void {
  const r = g.range;
  if (r === undefined) {
    extra.range = "none";
  } else if (r.kind === "Range") {
    extra.range = "range";
    value("MIN", r.min);
    value("MAX", r.max);
    value("STEP", r.step);
    fields["LOG"] = r.log ? "TRUE" : "FALSE";
  } else {
    extra.range = "choice";
    extra.count = r.options.length;
    r.options.forEach((o, k) => value(`OPT${k}`, o));
  }
}

/** A gene's description: its comment without the `//`. */
function describe(comment: string): string {
  return comment.replace(/^\/\/ ?/, "");
}

function exprBlock(e: Expr): BlockState {
  const inputs: NonNullable<BlockState["inputs"]> = {};
  const value = (name: string, x: Expr | undefined) => {
    if (x) inputs[name] = { block: exprBlock(x) };
  };
  let b: BlockState;
  switch (e.kind) {
    case "Number":
      b = { type: "g_number", fields: { NUM: e.raw + (e.degree ? "°" : "") } };
      break;
    case "Bool":
      b = { type: "g_bool", fields: { BOOL: e.value ? "true" : "false" } };
      break;
    case "String":
      b = { type: "g_string", fields: { TEXT: e.value } };
      break;
    case "Hex":
      b = { type: "g_hex", fields: { HEX: e.raw } };
      break;
    case "Name":
      b = { type: "g_name", fields: { NAME: e.name } };
      break;
    case "Turtle":
      b = { type: "g_turtle", fields: { FIELD: e.field } };
      break;
    case "Time":
      b = { type: "g_time" };
      break;
    case "Beat":
      b = { type: "g_beat" };
      break;
    case "Music":
      b = { type: "g_music", fields: { FIELD: e.field } };
      break;
    case "Vector":
      b = { type: "g_vector" };
      value("X", e.x);
      value("Y", e.y);
      value("Z", e.z);
      break;
    case "Unary":
      b = { type: "g_unary", fields: { OP: e.op } };
      value("A", e.operand);
      break;
    case "Binary":
      b = { type: "g_binary", fields: { OP: e.op } };
      value("A", e.left);
      value("B", e.right);
      break;
    case "Member":
      b = { type: "g_member", fields: { NAME: e.name } };
      value("OBJ", e.object);
      break;
    case "Call":
      if (e.callee.kind === "Name") {
        b = {
          type: "g_call",
          fields: { NAME: e.callee.name },
          extraState: { count: e.args.length },
        };
      } else {
        b = { type: "g_apply", extraState: { count: e.args.length } };
        value("CALLEE", e.callee);
      }
      e.args.forEach((a, k) => value(`ARG${k}`, a));
      break;
    case "Gradient":
      b = {
        type: "g_gradient",
        fields: { KIND: e.straight ? "spectrum" : "gradient" },
        extraState: { count: e.stops.length, at: e.stops.map((s) => s.at !== undefined) },
      };
      e.stops.forEach((s, k) => {
        value(`C${k}`, s.colour);
        value(`AT${k}`, s.at);
      });
      break;
    case "List":
      b = { type: "g_list", extraState: { count: e.items.length } };
      e.items.forEach((item, k) => value(`ARG${k}`, item));
      break;
    case "Index":
      b = { type: "g_index" };
      value("OBJ", e.object);
      value("INDEX", e.index);
      break;
    case "Picture": {
      // A value block holding statements: the block run for every pixel.
      b = { type: "g_picture" };
      const first = chain(e.body.items);
      if (first) inputs["BODY"] = { block: first };
      const meta = metaOf(undefined, { BODY: e.body });
      if (Object.keys(meta).length > 0) b.extraState = { meta };
      break;
    }
    case "ErrorExpr":
      throw new Error("Code with syntax errors can't be shown as blocks.");
  }
  if (Object.keys(inputs).length > 0) b.inputs = inputs;
  return b;
}

// ---------- blocks to code ----------

/** A block whose slot needs a value before the blocks can be turned into code. */
export interface EmptySlot {
  /** The block's id, when it has one. */
  block: string | undefined;
  input: string;
}

export interface FromBlocksResult {
  /** The syntax tree, or undefined when the blocks have empty slots or no main block. */
  file: SourceFile | undefined;
  empty: EmptySlot[];
}

const NOWHERE: Span = { start: 0, end: 0 };

class Empty extends Error {
  constructor(readonly slot: EmptySlot) {
    super(`The ${slot.input} slot is empty.`);
  }
}

/**
 * Blocks as a syntax tree: the main block's statements, then the definitions in the order they
 * came in the code, and new ones after them. Loose blocks, not under the main block nor a
 * definition, aren't part of the program.
 */
export function fromBlocks(state: WorkspaceState): FromBlocksResult {
  const all = state.blocks.blocks;
  const main = all.find((b) => b.type === MAIN);
  if (!main) return { file: undefined, empty: [] };
  const definitions = all
    .map((b, k) => ({ b, k }))
    .filter(({ b }) => DEFINITIONS.includes(b.type))
    .sort((p, q) => (p.b.extraState?.order ?? 1e9 + p.k) - (q.b.extraState?.order ?? 1e9 + q.k))
    .map(({ b }) => b);
  const empty: EmptySlot[] = [];
  const reader = new Reader(empty);
  const first = main.inputs?.["BODY"]?.block;
  const items = [...reader.stack(first), ...definitions.map((d) => reader.stmt(d))];
  if (empty.length > 0) return { file: undefined, empty };
  // A new first statement is set off from the header by a blank line, as code usually is.
  const top = items[0];
  if (first && first.extraState?.meta === undefined && top && !isDefinition(top)) {
    // With comments above it, the blank line goes above them.
    if (top.leading[0]) top.leading[0].blankBefore = true;
    else top.blankBefore = true;
  }
  const f = main.extraState?.file;
  const description = descriptionOf(main, f?.description ?? []);
  const file: SourceFile = {
    kind: f?.kind ?? "creature",
    name: String(main.fields?.["NAME"] ?? "Untitled"),
    nameSpan: NOWHERE,
    headerComments: comments(f?.header ?? []),
    description,
    items,
    endComments: comments(f?.end ?? []),
    span: NOWHERE,
  };
  return { file, empty };
}

/** The file's description: the main block's note, written as comments under the header. */
function descriptionOf(main: BlockState, kept: string[]): Comment[] {
  const shown = main.icons?.comment?.text;
  if (shown === undefined) return [];
  const lines = shown === noteText(kept) ? kept : noteLines(shown);
  return lines.map((text) => comment(text, false));
}

function noteLines(text: string): string[] {
  return text
    .replace(/\s+$/, "")
    .split("\n")
    .map((l) => (l.trim() === "" ? "//" : `// ${l}`));
}

function comment(text: string, blankBefore: boolean): Comment {
  return {
    text,
    span: NOWHERE,
    line: 0,
    endLine: 0,
    ownLine: true,
    blankBefore,
  };
}

function comments(list: RawComment[]): Comment[] {
  return list.map((c) => comment(c.text, c.blank === true));
}

class Reader {
  constructor(private readonly empty: EmptySlot[]) {}

  /** A stack of statement blocks, from the first. A block with an empty slot is noted and left out. */
  stack(first: BlockState | undefined): Stmt[] {
    const out: Stmt[] = [];
    for (let b = first; b; b = b.next?.block) {
      try {
        out.push(this.stmt(b));
      } catch (e) {
        if (!(e instanceof Empty)) throw e;
        this.empty.push(e.slot);
      }
    }
    return out;
  }

  private block(b: BlockState, name: string): Block {
    const c = b.extraState?.meta?.bodies?.[name];
    return {
      span: NOWHERE,
      items: this.stack(b.inputs?.[name]?.block),
      open: c?.open ? comment(c.open, false) : undefined,
      endComments: comments(c?.end ?? []),
      close: c?.close ? comment(c.close, false) : undefined,
    };
  }

  private value(b: BlockState, name: string): Expr {
    const v = b.inputs?.[name]?.block;
    if (!v) throw new Empty({ block: b.id, input: name });
    return this.expr(v);
  }

  private maybe(b: BlockState, name: string): Expr | undefined {
    const v = b.inputs?.[name]?.block;
    return v ? this.expr(v) : undefined;
  }

  private args(b: BlockState): Expr[] {
    return Array.from({ length: b.extraState?.count ?? 0 }, (_, k) => this.value(b, `ARG${k}`));
  }

  stmt(b: BlockState): Stmt {
    const meta = b.extraState?.meta ?? {};
    const field = (name: string) => String(b.fields?.[name] ?? "");
    const leading = leadingOf(b, meta);
    const base = {
      span: NOWHERE,
      leading,
      trailing: meta.trailing ? comment(meta.trailing, false) : undefined,
      blankBefore: meta.blank === true,
    };
    const name = { name: field("NAME"), nameSpan: NOWHERE };
    switch (b.type) {
      case "g_gene": {
        const desc = field("DESC");
        const trailing =
          desc === ""
            ? undefined
            : comment(
                meta.trailing && describe(meta.trailing) === desc ? meta.trailing : `// ${desc}`,
                false,
              );
        return {
          ...base,
          ...name,
          trailing,
          kind: "Gene",
          value: this.value(b, "VALUE"),
          range: this.range(b),
        };
      }
      case "g_let":
        return { ...base, ...name, kind: "Let", value: this.value(b, "VALUE") };
      case "g_assign":
        return {
          ...base,
          ...name,
          kind: "Assign",
          op: field("OP") as "=",
          value: this.value(b, "VALUE"),
        };
      case "g_partcall":
        return { ...base, ...name, kind: "PartCall", args: this.args(b) };
      case "g_return":
        return { ...base, kind: "Return", value: this.maybe(b, "VALUE") };
      case "g_print":
        return { ...base, kind: "Print", args: this.args(b) };
      case "g_if":
        return {
          ...base,
          kind: "If",
          branches: Array.from({ length: b.extraState?.count ?? 1 }, (_, k) => ({
            condition: this.value(b, `COND${k}`),
            block: this.block(b, `DO${k}`),
          })),
          elseBlock: b.extraState?.hasElse ? this.block(b, "ELSE") : undefined,
        };
      case "g_repeat":
        return {
          ...base,
          kind: "Repeat",
          count: this.value(b, "COUNT"),
          as: field("AS") ? param(field("AS")) : undefined,
          block: this.block(b, "DO"),
        };
      case "g_for":
        return {
          ...base,
          kind: "For",
          variable: param(field("VAR")),
          from: this.value(b, "FROM"),
          to: this.value(b, "TO"),
          by: this.maybe(b, "BY"),
          block: this.block(b, "DO"),
        };
      case "g_while":
        return {
          ...base,
          kind: "While",
          condition: this.value(b, "COND"),
          block: this.block(b, "DO"),
        };
      case "g_branch":
        return { ...base, kind: "Branch", block: this.block(b, "DO") };
      case "g_symmetric":
        return {
          ...base,
          kind: "Symmetric",
          axis: field("AXIS") as "x",
          block: this.block(b, "DO"),
        };
      case "g_lay":
        return { ...base, kind: "Lay", block: undefined };
      case "g_lay_with":
        return { ...base, kind: "Lay", block: this.block(b, "DO") };
      case "g_reshape":
        return { ...base, kind: "Reshape", block: this.block(b, "DO") };
      case "g_stroke":
        return { ...base, kind: "Stroke", block: this.block(b, "DO") };
      case "g_focuspoint":
        return { ...base, kind: "FocusPoint" };
      case "g_command":
        return {
          ...base,
          kind: "Command",
          command: field("CMD") as "forward",
          value: this.value(b, "VALUE"),
        };
      case "g_rotate":
        return {
          ...base,
          kind: "Rotate",
          angle: this.value(b, "ANGLE"),
          axis: this.value(b, "AXIS"),
        };
      case "g_mirror":
        return { ...base, kind: "Mirror", axis: field("AXIS") as "x" };
      case "g_material": {
        const keyword = field("PROP");
        return {
          ...base,
          kind: "Material",
          property: (keyword === "color" ? "colour" : keyword) as "colour",
          keyword,
          value: this.value(b, "VALUE"),
        };
      }
      case "g_fill":
        return { ...base, kind: "Fill", value: this.value(b, "VALUE") };
      case "g_effect": {
        let k = 0;
        const args = (b.extraState?.words ?? []).map((w) =>
          w === null
            ? { kind: "Value" as const, expr: this.value(b, `V${k++}`) }
            : { kind: "Word" as const, text: w, span: NOWHERE },
        );
        return { ...base, kind: "Effect", name: field("NAME"), args };
      }
      case "g_part":
      case "g_function":
        return {
          ...base,
          ...name,
          kind: b.type === "g_part" ? "Part" : "Function",
          params: field("PARAMS")
            .split(",")
            .map((p) => p.trim())
            .filter((p) => p !== "")
            .map(param),
          body: this.block(b, "BODY"),
        };
      case "g_background":
        return { ...base, kind: "Background", body: this.block(b, "BODY") };
      case "g_dance":
        return { ...base, kind: "Dance", body: this.block(b, "BODY") };
      case "g_pattern":
        return { ...base, ...name, kind: "Pattern", body: this.block(b, "BODY") };
      case "g_value":
        return { ...base, kind: "Value", value: this.value(b, "VALUE") };
      case "g_variant":
        return { ...base, ...name, kind: "Variant", body: this.block(b, "BODY") };
      case "g_breed":
        return { ...base, kind: "Breed", on: field("ON") === "on" };
      case "g_setting":
        return {
          ...base,
          kind: "GeneSetting",
          gene: field("GENE"),
          geneSpan: NOWHERE,
          value: this.value(b, "VALUE"),
        };
      default:
        throw new Error(`A ${b.type} block isn't a statement.`);
    }
  }

  private range(b: BlockState): GeneDecl["range"] {
    switch (b.extraState?.range) {
      case "range":
        return {
          kind: "Range",
          min: this.value(b, "MIN"),
          max: this.value(b, "MAX"),
          step: this.maybe(b, "STEP"),
          log: b.fields?.["LOG"] === "TRUE" || b.fields?.["LOG"] === true,
        };
      case "choice":
        return {
          kind: "Choice",
          options: Array.from({ length: b.extraState.count ?? 0 }, (_, k) =>
            this.value(b, `OPT${k}`),
          ),
        };
      default:
        return undefined;
    }
  }

  expr(b: BlockState): Expr {
    const field = (name: string) => String(b.fields?.[name] ?? "");
    const span = NOWHERE;
    switch (b.type) {
      case "g_number": {
        const text = field("NUM").trim();
        const degree = text.endsWith("°");
        const raw = degree ? text.slice(0, -1) : text;
        return { kind: "Number", span, value: Number(raw), raw, degree };
      }
      case "g_bool":
        return { kind: "Bool", span, value: field("BOOL") === "true" };
      case "g_string":
        return { kind: "String", span, value: field("TEXT") };
      case "g_hex":
        return { kind: "Hex", span, raw: field("HEX") };
      case "g_name":
        return { kind: "Name", span, name: field("NAME") };
      case "g_turtle":
        return { kind: "Turtle", span, field: field("FIELD"), fieldSpan: span };
      case "g_time":
        return { kind: "Time", span };
      case "g_beat":
        return { kind: "Beat", span };
      case "g_music":
        return { kind: "Music", span, field: field("FIELD"), fieldSpan: span };
      case "g_vector":
        return {
          kind: "Vector",
          span,
          x: this.value(b, "X"),
          y: this.value(b, "Y"),
          z: this.value(b, "Z"),
        };
      case "g_unary":
        return { kind: "Unary", span, op: field("OP") as "-", operand: this.value(b, "A") };
      case "g_binary":
        return {
          kind: "Binary",
          span,
          op: field("OP") as "+",
          opSpan: span,
          left: this.value(b, "A"),
          right: this.value(b, "B"),
        };
      case "g_member":
        return {
          kind: "Member",
          span,
          object: this.value(b, "OBJ"),
          name: field("NAME"),
          nameSpan: span,
        };
      case "g_call":
        return {
          kind: "Call",
          span,
          callee: { kind: "Name", span, name: field("NAME") },
          args: this.args(b),
        };
      case "g_apply":
        return { kind: "Call", span, callee: this.value(b, "CALLEE"), args: this.args(b) };
      case "g_gradient": {
        const at = b.extraState?.at ?? [];
        return {
          kind: "Gradient",
          span,
          straight: field("KIND") === "spectrum",
          stops: Array.from({ length: b.extraState?.count ?? 0 }, (_, k) => ({
            colour: this.value(b, `C${k}`),
            at: at[k] ? this.value(b, `AT${k}`) : this.maybe(b, `AT${k}`),
          })),
        };
      }
      case "g_list":
        return { kind: "List", span, items: this.args(b) };
      case "g_index":
        return { kind: "Index", span, object: this.value(b, "OBJ"), index: this.value(b, "INDEX") };
      case "g_picture":
        return { kind: "Picture", span, body: this.block(b, "BODY") };
      default:
        throw new Error(`A ${b.type} block isn't a value.`);
    }
  }
}

function param(name: string): Param {
  return { name, span: NOWHERE };
}

/**
 * A statement's comments above it: as they were written, while its note still says the same; or
 * the note's lines as new comments when it's been changed.
 */
function leadingOf(b: BlockState, meta: Meta): Comment[] {
  const kept = meta.leading ?? [];
  const shown = b.icons?.comment?.text;
  if (shown === undefined || shown.trim() === "") return [];
  if (shown === noteText(kept.map((c) => c.text))) return comments(kept);
  return noteLines(shown).map((text, k) => comment(text, k === 0 && kept[0]?.blank === true));
}
