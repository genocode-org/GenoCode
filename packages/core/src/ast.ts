// The syntax tree. The parser builds it, and the checker, formatter, interpreter and block editor
// all work from it. It keeps comments, so code can be printed back without losing them.

import type { Span } from "./source.js";

export interface Comment {
  /** The comment as written, including `//` or `/* … *\/`. */
  text: string;
  span: Span;
  /** 0-based lines of the comment's start and end. */
  line: number;
  endLine: number;
  /** Nothing but whitespace comes before it on its line. */
  ownLine: boolean;
  /** A blank line comes before it. */
  blankBefore: boolean;
}

// ---------- expressions ----------

export type Expr =
  | NumberLit
  | BoolLit
  | StringLit
  | HexLit
  | NameRef
  | TurtleRef
  | TimeRef
  | BeatRef
  | MusicRef
  | VectorLit
  | Unary
  | Binary
  | Member
  | CallExpr
  | GradientLit
  | ListLit
  | Index
  | PictureExpr
  | ErrorExpr;

export interface NumberLit {
  kind: "Number";
  span: Span;
  value: number;
  /** As written, without any `°`. */
  raw: string;
  degree: boolean;
}

export interface BoolLit {
  kind: "Bool";
  span: Span;
  value: boolean;
}

export interface StringLit {
  kind: "String";
  span: Span;
  value: string;
}

export interface HexLit {
  kind: "Hex";
  span: Span;
  raw: string;
}

export interface NameRef {
  kind: "Name";
  span: Span;
  name: string;
}

export interface TurtleRef {
  kind: "Turtle";
  span: Span;
  field: string;
  fieldSpan: Span;
}

export interface TimeRef {
  kind: "Time";
  span: Span;
}

export interface BeatRef {
  kind: "Beat";
  span: Span;
}

export interface MusicRef {
  kind: "Music";
  span: Span;
  field: string;
  fieldSpan: Span;
}

export interface VectorLit {
  kind: "Vector";
  span: Span;
  x: Expr;
  y: Expr;
  z: Expr;
}

export type UnaryOp = "-" | "not";

export interface Unary {
  kind: "Unary";
  span: Span;
  op: UnaryOp;
  operand: Expr;
}

export type BinaryOp =
  "or" | "and" | "==" | "!=" | "<" | "<=" | ">" | ">=" | "+" | "-" | "*" | "/" | "%" | "^";

export interface Binary {
  kind: "Binary";
  span: Span;
  op: BinaryOp;
  opSpan: Span;
  left: Expr;
  right: Expr;
}

export interface Member {
  kind: "Member";
  span: Span;
  object: Expr;
  name: string;
  nameSpan: Span;
}

export interface CallExpr {
  kind: "Call";
  span: Span;
  callee: Expr;
  args: Expr[];
}

export interface GradientStop {
  colour: Expr;
  at: Expr | undefined;
}

export interface GradientLit {
  kind: "Gradient";
  span: Span;
  stops: GradientStop[];
  /** Written `spectrum(…)`: hue blends in a straight line (section 13.3). */
  straight: boolean;
}

/** `[a, b, c]` (section 8.3). */
export interface ListLit {
  kind: "List";
  span: Span;
  items: Expr[];
}

/** `l[i]`: an item of a list. */
export interface Index {
  kind: "Index";
  span: Span;
  object: Expr;
  index: Expr;
}

/** `picture { … }` in pattern code: a block run for every pixel (section 14.1). */
export interface PictureExpr {
  kind: "Picture";
  span: Span;
  body: Block;
}

export interface ErrorExpr {
  kind: "ErrorExpr";
  span: Span;
}

// ---------- statements ----------

/** Fields every statement and declaration has. */
export interface StmtBase {
  span: Span;
  /** Comments on their own lines directly above. */
  leading: Comment[];
  /** A comment at the end of the statement's line (simple statements and genes only). */
  trailing: Comment | undefined;
  /** A blank line comes before it (or before its leading comments). */
  blankBefore: boolean;
}

export interface Block {
  span: Span;
  items: Stmt[];
  /** A comment after `{` on the same line. */
  open: Comment | undefined;
  /** Comments after the last statement, before `}`. */
  endComments: Comment[];
  /** A comment after `}` on the same line. */
  close: Comment | undefined;
}

export type Stmt =
  | GeneDecl
  | PartDecl
  | FunctionDecl
  | BackgroundDecl
  | DanceDecl
  | VariantDecl
  | BreedSetting
  | GeneSetting
  | Let
  | Assign
  | PartCall
  | Return
  | Print
  | If
  | Repeat
  | For
  | While
  | BranchStmt
  | Symmetric
  | Lay
  | FocusPoint
  | Reshape
  | Stroke
  | Command
  | Rotate
  | Mirror
  | Material
  | Fill
  | Effect
  | PatternDecl
  | ValueStmt
  | ErrorStmt;

export type GeneRange =
  | { kind: "Range"; min: Expr; max: Expr; step: Expr | undefined; log: boolean }
  | { kind: "Choice"; options: Expr[] };

export interface GeneDecl extends StmtBase {
  kind: "Gene";
  name: string;
  nameSpan: Span;
  value: Expr;
  range: GeneRange | undefined;
}

export interface Param {
  name: string;
  span: Span;
}

export interface PartDecl extends StmtBase {
  kind: "Part";
  name: string;
  nameSpan: Span;
  params: Param[];
  body: Block;
}

export interface FunctionDecl extends StmtBase {
  kind: "Function";
  name: string;
  nameSpan: Span;
  params: Param[];
  body: Block;
}

export interface BackgroundDecl extends StmtBase {
  kind: "Background";
  body: Block;
}

/** `variant Name { … }`: another set of gene values for the creature (section 6.6). */
export interface VariantDecl extends StmtBase {
  kind: "Variant";
  name: string;
  nameSpan: Span;
  body: Block;
}

/** `breed off`: whether the app may mutate and breed the creature (section 19). */
export interface BreedSetting extends StmtBase {
  kind: "Breed";
  on: boolean;
}

/** `whorl.petals = 9` inside a variant: a gene, by its full name, and its value. */
export interface GeneSetting extends StmtBase {
  kind: "GeneSetting";
  gene: string;
  geneSpan: Span;
  value: Expr;
}

export interface DanceDecl extends StmtBase {
  kind: "Dance";
  body: Block;
}

/** `pattern Name { … }`: a pattern kind written in GenoCode (section 14.1). */
export interface PatternDecl extends StmtBase {
  kind: "Pattern";
  name: string;
  nameSpan: Span;
  body: Block;
}

/** `value v`: what a pattern or a `picture` block gives. */
export interface ValueStmt extends StmtBase {
  kind: "Value";
  value: Expr;
}

export interface Let extends StmtBase {
  kind: "Let";
  name: string;
  nameSpan: Span;
  value: Expr;
}

export type AssignOp = "=" | "+=" | "-=" | "*=" | "/=";

export interface Assign extends StmtBase {
  kind: "Assign";
  name: string;
  nameSpan: Span;
  op: AssignOp;
  value: Expr;
}

export interface PartCall extends StmtBase {
  kind: "PartCall";
  name: string;
  nameSpan: Span;
  args: Expr[];
}

export interface Return extends StmtBase {
  kind: "Return";
  value: Expr | undefined;
}

export interface Print extends StmtBase {
  kind: "Print";
  args: Expr[];
}

export interface IfBranch {
  condition: Expr;
  block: Block;
}

export interface If extends StmtBase {
  kind: "If";
  branches: IfBranch[];
  elseBlock: Block | undefined;
}

export interface Repeat extends StmtBase {
  kind: "Repeat";
  count: Expr;
  as: Param | undefined;
  block: Block;
}

export interface For extends StmtBase {
  kind: "For";
  variable: Param;
  from: Expr;
  to: Expr;
  by: Expr | undefined;
  block: Block;
}

export interface While extends StmtBase {
  kind: "While";
  condition: Expr;
  block: Block;
}

export interface BranchStmt extends StmtBase {
  kind: "Branch";
  block: Block;
}

export type Axis = "x" | "y" | "z";

export interface Symmetric extends StmtBase {
  kind: "Symmetric";
  axis: Axis;
  block: Block;
}

export interface Lay extends StmtBase {
  kind: "Lay";
  block: Block | undefined;
}

export interface FocusPoint extends StmtBase {
  kind: "FocusPoint";
}

export interface Reshape extends StmtBase {
  kind: "Reshape";
  block: Block;
}

/** `stroke { … }`: each `lay` inside adds a point to one smooth tube instead of laying a shape. */
export interface Stroke extends StmtBase {
  kind: "Stroke";
  block: Block;
}

export type CommandName = "forward" | "back" | "move" | "pitch" | "yaw" | "roll" | "grow";

export interface Command extends StmtBase {
  kind: "Command";
  command: CommandName;
  value: Expr;
}

export interface Rotate extends StmtBase {
  kind: "Rotate";
  angle: Expr;
  axis: Expr;
}

export interface Mirror extends StmtBase {
  kind: "Mirror";
  axis: Axis;
}

export type MaterialProperty = "shape" | "colour" | "shine" | "sharpness" | "texture" | "wear";

export interface Material extends StmtBase {
  kind: "Material";
  property: MaterialProperty;
  /** The word as written: `colour` or `color` for the colour property. */
  keyword: string;
  value: Expr;
}

export interface Fill extends StmtBase {
  kind: "Fill";
  value: Expr;
}

/** A part of a dance effect line: a word, or the value after it (section 17). */
export type EffectArg = { kind: "Word"; text: string; span: Span } | { kind: "Value"; expr: Expr };

export interface Effect extends StmtBase {
  kind: "Effect";
  name: string;
  args: EffectArg[];
}

export interface ErrorStmt extends StmtBase {
  kind: "ErrorStmt";
}

// ---------- files ----------

export type FileKind = "creature" | "background" | "dance" | "pattern";

export interface SourceFile {
  kind: FileKind;
  name: string;
  nameSpan: Span;
  /** Comments before the header line. */
  headerComments: Comment[];
  /** Comment lines directly below the header. */
  description: Comment[];
  items: Stmt[];
  /** Comments after the last item. */
  endComments: Comment[];
  span: Span;
}

export const EFFECT_NAMES: ReadonlySet<string> = new Set([
  "morph",
  "zoom",
  "spin",
  "turn",
  "reverse",
  "flat",
]);

/** How an effect's lead word reads its input, and the settings the effect takes (section 17). */
export interface EffectLine {
  lead: "follows" | "on";
  settings: readonly string[];
}

export const EFFECT_LINES: ReadonlyMap<string, EffectLine> = new Map<string, EffectLine>([
  ["morph", { lead: "follows", settings: ["speed", "settle"] }],
  ["zoom", { lead: "follows", settings: ["amount", "settle"] }],
  ["spin", { lead: "follows", settings: ["from", "to", "smooth"] }],
  ["turn", { lead: "on", settings: ["by"] }],
  ["reverse", { lead: "on", settings: ["by", "on", "off"] }],
  ["flat", { lead: "on", settings: ["by", "on", "off"] }],
]);

/** Words in an effect line that stand alone: which moves of the input trigger it. */
export const TRIGGER_KINDS: ReadonlySet<string> = new Set(["changes", "drops", "rises"]);

/** Other words that stand alone in an effect line, and the effect each belongs to. */
export const EFFECT_FLAGS: ReadonlyMap<string, string> = new Map([["upright", "spin"]]);

/** Keywords that can be words in an effect line. */
export const EFFECT_KEYWORD_WORDS: ReadonlySet<string> = new Set(["from", "to", "by"]);
