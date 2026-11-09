// The per-pixel code of pictures: the block of `picture { … }`, run once for every pixel
// (docs/LANGUAGE.md section 14.1). A picture has tens of thousands of pixels, so the block isn't
// walked like the rest of the program. It's turned into JavaScript, which the engine compiles like
// any other code, and where that isn't allowed (a page that forbids `eval`), into closures. Both
// mean just what the interpreter means: numbers take a short cut, and everything else goes through
// the same operators and library, so the three give the same pictures.

import type { BinaryOp, Block, Expr, Stmt } from "./ast.js";
import { BUILTIN_CONSTANTS, BUILTIN_FUNCTIONS, type BuiltinContext } from "./builtins.js";
import { hexColour, sampleGradient } from "./colour.js";
import { sample, type Canvas } from "./picture.js";
import type { Span } from "./source.js";
import {
  binaryOp,
  formatValue,
  isList,
  isPicture,
  member,
  negate,
  not,
  roundHalfUp,
  typeLabel,
  typeOf,
  ValueError,
  vec,
  type Value,
} from "./values.js";

/** A problem in a picture's code, and where it is. */
export class PixelError extends Error {
  constructor(
    readonly span: Span,
    message: string,
  ) {
    super(message);
  }
}

/** A picture whose loops ran too long. */
export class PixelLimit extends PixelError {}

/** How many loop rounds a picture may take for all its pixels, so a loop that never ends stops. */
export const PICTURE_STEPS = 400_000_000;

/** `l[i]` (section 8.3). `fail` says what's wrong, and whether it's the position's fault. */
export function listItem(
  list: Value,
  index: Value,
  fail: (atIndex: boolean, message: string) => never,
): Value {
  if (!isList(list)) return fail(false, `Only a list has items, not ${typeLabel(typeOf(list))}.`);
  if (typeof index !== "number") {
    return fail(true, `A position in a list must be a number, not ${typeLabel(typeOf(index))}.`);
  }
  const k = roundHalfUp(index);
  if (!(k >= 0 && k < list.items.length)) {
    const n = list.items.length;
    return fail(
      true,
      `There's no item ${formatValue(k)}: the list has ${n} item${n === 1 ? "" : "s"}, from 0.`,
    );
  }
  return list.items[k]!;
}

/** The pattern's variables and genes, as the picture is made. */
export type Outside = (name: string) => Value | undefined;

export type PixelEngine = "javascript" | "closures";

/**
 * The picture a `picture { … }` block makes on `canvas`. `engine` picks how the block is run; by
 * default it's JavaScript where the page allows it, and closures where it doesn't.
 */
export function drawPixels(
  body: Block,
  outside: Outside,
  canvas: Canvas,
  valueSpan: Span,
  engine?: PixelEngine,
): Float32Array {
  if (engine !== "closures") {
    const js = javascriptFor(body, outside, canvas.size, valueSpan);
    if (js) return js(canvas);
    if (engine === "javascript") throw new Error("This page doesn't allow JavaScript to be made.");
  }
  return withClosures(body, outside, canvas, valueSpan);
}

/** Whether pages here let code make JavaScript (`new Function`), checked once. */
let canMakeJavaScript: boolean | undefined;

// ---------- shared ----------

const NUMBER_OPS: Record<BinaryOp, ((p: number, q: number) => Value) | undefined> = {
  "+": (p, q) => p + q,
  "-": (p, q) => p - q,
  "*": (p, q) => p * q,
  "/": (p, q) => p / q,
  "%": (p, q) => p % q,
  "^": (p, q) => Math.pow(p, q),
  "<": (p, q) => p < q,
  "<=": (p, q) => p <= q,
  ">": (p, q) => p > q,
  ">=": (p, q) => p >= q,
  "==": (p, q) => p === q,
  "!=": (p, q) => p !== q,
  and: undefined,
  or: undefined,
};

function guarded<T>(span: Span, f: () => T): T {
  try {
    return f();
  } catch (e) {
    if (e instanceof ValueError) throw new PixelError(span, e.message);
    throw e;
  }
}

/** The library's context inside `picture { }`: no random numbers there (section 14.1). */
function libraryContext(size: number): BuiltinContext {
  return {
    random: () => {
      throw new ValueError("`random` can't be used inside `picture { }`.");
    },
    pictureSize: size,
  };
}

function notNumber(v: Value, span: Span, what: string): never {
  throw new PixelError(span, `${what} needs a number, not ${typeLabel(typeOf(v))}.`);
}

function notBool(v: Value, span: Span, what: string): never {
  throw new PixelError(span, `${what} must be a bool, not ${typeLabel(typeOf(v))}.`);
}

function badPixel(v: Value, span: Span): never {
  throw new PixelError(span, `A pixel's value must be a number, not ${typeLabel(typeOf(v))}.`);
}

function unsupported(span: Span): never {
  throw new PixelError(span, "This can't be used inside `picture { }`.");
}

// ---------- JavaScript ----------

type Kind = "n" | "b" | "?";

interface Code {
  js: string;
  kind: Kind;
}

/** What generated code calls on for everything that isn't plain number arithmetic. */
class Runtime {
  readonly spans: Span[] = [];
  readonly consts: unknown[] = [];
  readonly sample = sample;
  readonly round = roundHalfUp;
  readonly vec = vec;

  constructor(private readonly size: number) {}

  span(s: Span): number {
    this.spans.push(s);
    return this.spans.length - 1;
  }

  constant(v: unknown): number {
    this.consts.push(v);
    return this.consts.length - 1;
  }

  num(v: Value, s: number, what: string): number {
    return typeof v === "number" ? v : notNumber(v, this.spans[s]!, what);
  }

  bool(v: Value, s: number, what: string): boolean {
    return typeof v === "boolean" ? v : notBool(v, this.spans[s]!, what);
  }

  bin(op: BinaryOp, p: Value, q: Value, s: number): Value {
    const f = NUMBER_OPS[op];
    if (f && typeof p === "number" && typeof q === "number") return f(p, q);
    return guarded(this.spans[s]!, () => binaryOp(op, p, q));
  }

  neg(v: Value, s: number): Value {
    return typeof v === "number" ? -v : guarded(this.spans[s]!, () => negate(v));
  }

  not(v: Value, s: number): Value {
    return guarded(this.spans[s]!, () => not(v));
  }

  member(v: Value, name: string, s: number): Value {
    return guarded(this.spans[s]!, () => member(v, name));
  }

  item(list: Value, index: Value, objectSpan: number, indexSpan: number): Value {
    if (isList(list) && typeof index === "number") {
      const k = roundHalfUp(index);
      if (k >= 0 && k < list.items.length) return list.items[k]!;
    }
    return listItem(list, index, (atIndex, message) => {
      throw new PixelError(this.spans[atIndex ? indexSpan : objectSpan]!, message);
    });
  }

  list(items: Value[]): Value {
    return { type: "list", items };
  }

  call(name: string, args: Value[], s: number): Value {
    const f = BUILTIN_FUNCTIONS.get(name)!;
    return guarded(this.spans[s]!, () => f.call(args, libraryContext(this.size)));
  }

  /** Calling a value: sampling a gradient. */
  sampleValue(target: Value, args: Value[], calleeSpan: number, s: number): Value {
    if (typeof target === "object" && target.type === "gradient") {
      const at = args[0];
      if (typeof at !== "number" || args.length !== 1)
        throw new PixelError(
          this.spans[s]!,
          "A gradient is sampled at one position, such as `skin(0.5)`.",
        );
      return sampleGradient(target, at);
    }
    throw new PixelError(
      this.spans[calleeSpan]!,
      `${typeLabel(typeOf(target))} can't be called or sampled.`,
    );
  }

  tooLong(s: number): never {
    throw new PixelLimit(this.spans[s]!, "The picture stopped: is there a loop that never ends?");
  }

  badPixel(v: Value, s: number): never {
    return badPixel(v, this.spans[s]!);
  }

  fail(s: number, message: string): never {
    throw new PixelError(this.spans[s]!, message);
  }
}

/** A name in the block, and the JavaScript variable that holds it. */
interface Slot {
  id: number;
  /** Assigned only numbers, so it's a plain JavaScript number. */
  number: boolean;
  values: { expr: Expr; op: string }[];
  /** A loop counter: always a number. */
  counter: boolean;
}

class Generator {
  private readonly slots: Slot[] = [];
  private readonly scopes: Map<string, Slot>[] = [];
  /** Where each name in the block points: one of its slots, or nothing (outside the block). */
  private readonly resolved = new Map<object, Slot | undefined>();
  private readonly rt: Runtime;
  private readonly hoisted: string[] = [];
  private readonly outsideIds = new Map<string, string>();
  private temp = 0;

  constructor(
    private readonly outside: Outside,
    size: number,
  ) {
    this.rt = new Runtime(size);
  }

  /** The source of the pixel loop, or undefined if the block uses something it can't turn into JavaScript. */
  generate(body: Block, valueSpan: Span): { source: string; rt: Runtime } {
    // First find every variable and what it's given, so variables of numbers can be told apart.
    this.scopes.push(new Map());
    for (const [i, n] of ["x", "y", "r", "a"].entries()) {
      const slot: Slot = { id: i, number: true, values: [], counter: true };
      this.slots.push(slot);
      this.scopes[0]!.set(n, slot);
    }
    this.resolveBlock(body.items);
    this.scopes.pop();
    for (const s of this.slots) s.number = true;
    for (let changed = true; changed;) {
      changed = false;
      for (const s of this.slots) {
        if (!s.number || s.counter) continue;
        if (s.values.some((v) => this.kindOf(v.expr) !== "n")) {
          s.number = false;
          changed = true;
        }
      }
    }

    const lines: string[] = [];
    this.emitBlock(body.items, lines, "      ");
    const value = this.rt.span(valueSpan);
    const decls = [
      ...this.slots
        .slice(4)
        .filter((s) => !s.counter)
        .map((s) => `v${s.id}`),
      ...this.temps,
    ];
    const source = [
      `"use strict";`,
      ...this.hoisted,
      `return function (canvas, out) {`,
      `  const X = canvas.x, Y = canvas.y, R = canvas.r, A = canvas.a, N = canvas.size * canvas.size;`,
      `  const toDegrees = 180 / Math.PI;`,
      `  let steps = 0;`,
      `  for (let i = 0; i < N; i++) {`,
      `    let v0 = X[i], v1 = Y[i], v2 = R[i], v3 = A[i] * toDegrees, result = 0;`,
      decls.length > 0 ? `    let ${decls.join(", ")};` : "",
      `    {`,
      ...lines,
      `    }`,
      `    if (typeof result !== "number") rt.badPixel(result, ${value});`,
      `    out[i] = result;`,
      `  }`,
      `  return out;`,
      `};`,
    ].join("\n");
    return { source, rt: this.rt };
  }

  // ---------- finding variables ----------

  private lookup(name: string): Slot | undefined {
    for (let k = this.scopes.length - 1; k >= 0; k--) {
      const s = this.scopes[k]!.get(name);
      if (s) return s;
    }
    return undefined;
  }

  private newSlot(name: string, counter: boolean): Slot {
    const slot: Slot = { id: this.slots.length, number: true, values: [], counter };
    this.slots.push(slot);
    this.scopes[this.scopes.length - 1]!.set(name, slot);
    return slot;
  }

  private resolveBlock(items: Stmt[]): void {
    this.scopes.push(new Map());
    for (const s of items) this.resolveStmt(s);
    this.scopes.pop();
  }

  private resolveStmt(s: Stmt): void {
    switch (s.kind) {
      case "Let": {
        this.resolveExpr(s.value);
        const slot = this.newSlot(s.name, false);
        slot.values.push({ expr: s.value, op: "=" });
        this.resolved.set(s, slot);
        return;
      }
      case "Assign": {
        this.resolveExpr(s.value);
        const slot = this.lookup(s.name);
        if (slot === undefined || slot.id < 4) {
          throw new PixelError(
            s.nameSpan,
            slot === undefined
              ? `Inside \`picture { }\`, only its own variables can change, not \`${s.name}\`.`
              : `\`${s.name}\` can't be changed.`,
          );
        }
        slot.values.push({ expr: s.value, op: s.op });
        if (s.op !== "=")
          slot.values.push({ expr: { kind: "Name", name: s.name, span: s.nameSpan }, op: "=" });
        this.resolved.set(s, slot);
        return;
      }
      case "If":
        for (const b of s.branches) {
          this.resolveExpr(b.condition);
          this.resolveBlock(b.block.items);
        }
        if (s.elseBlock) this.resolveBlock(s.elseBlock.items);
        return;
      case "Repeat":
        this.resolveExpr(s.count);
        this.scopes.push(new Map());
        if (s.as) this.resolved.set(s, this.newSlot(s.as.name, true));
        this.resolveBlock(s.block.items);
        this.scopes.pop();
        return;
      case "For":
        this.resolveExpr(s.from);
        this.resolveExpr(s.to);
        if (s.by) this.resolveExpr(s.by);
        this.scopes.push(new Map());
        this.resolved.set(s, this.newSlot(s.variable.name, true));
        this.resolveBlock(s.block.items);
        this.scopes.pop();
        return;
      case "While":
        this.resolveExpr(s.condition);
        this.resolveBlock(s.block.items);
        return;
      case "Value":
        this.resolveExpr(s.value);
        return;
      case "Print":
      case "Gene":
      case "ErrorStmt":
        return;
      default:
        return unsupported(s.span);
    }
  }

  private resolveExpr(e: Expr): void {
    switch (e.kind) {
      case "Name":
        this.resolved.set(e, this.lookup(e.name));
        return;
      case "Vector":
        this.resolveExpr(e.x);
        this.resolveExpr(e.y);
        this.resolveExpr(e.z);
        return;
      case "Unary":
        this.resolveExpr(e.operand);
        return;
      case "Binary":
        this.resolveExpr(e.left);
        this.resolveExpr(e.right);
        return;
      case "Member":
        this.resolveExpr(e.object);
        return;
      case "Call":
        this.resolveExpr(e.callee);
        for (const a of e.args) this.resolveExpr(a);
        return;
      case "List":
        for (const i of e.items) this.resolveExpr(i);
        return;
      case "Index":
        this.resolveExpr(e.object);
        this.resolveExpr(e.index);
        return;
      case "Number":
      case "Bool":
      case "String":
      case "Hex":
        return;
      default:
        return unsupported(e.span);
    }
  }

  // ---------- what kind of value an expression gives ----------

  private outsideValue(name: string): Value | undefined {
    return this.outside(name) ?? BUILTIN_CONSTANTS.get(name);
  }

  private kindOf(e: Expr): Kind {
    switch (e.kind) {
      case "Number":
        return "n";
      case "Bool":
        return "b";
      case "Name": {
        const slot = this.resolved.get(e);
        if (slot) return slot.number ? "n" : "?";
        const v = this.outsideValue(e.name);
        return typeof v === "number" || (v !== undefined && isPicture(v))
          ? "n"
          : typeof v === "boolean"
            ? "b"
            : "?";
      }
      case "Unary":
        return e.op === "-" && this.kindOf(e.operand) === "n" ? "n" : "?";
      case "Binary": {
        if (e.op === "and" || e.op === "or") return "b";
        const l = this.kindOf(e.left);
        const r = this.kindOf(e.right);
        if (l !== "n" || r !== "n") return "?";
        return ["<", "<=", ">", ">=", "==", "!="].includes(e.op) ? "b" : "n";
      }
      case "Index":
        return this.numberList(e.object) ? "n" : "?";
      case "Call": {
        if (e.callee.kind !== "Name" || this.resolved.get(e.callee)) return "?";
        const outside = this.outside(e.callee.name);
        if (outside !== undefined) return isPicture(outside) ? "n" : "?";
        const f = BUILTIN_FUNCTIONS.get(e.callee.name);
        return f?.numeric &&
          e.args.length === f.numeric.length &&
          e.args.every((a) => this.kindOf(a) === "n")
          ? "n"
          : "?";
      }
      default:
        return "?";
    }
  }

  /** A list from outside the block that holds only numbers, so its items are known to be numbers. */
  private numberList(e: Expr): Extract<Value, { type: "list" }> | undefined {
    if (e.kind !== "Name" || this.resolved.get(e)) return undefined;
    const v = this.outside(e.name);
    return v !== undefined && isList(v) && v.items.every((i) => typeof i === "number")
      ? v
      : undefined;
  }

  // ---------- writing JavaScript ----------

  private readonly temps: string[] = [];

  private newTemp(): string {
    const t = `t${this.temp++}`;
    this.temps.push(t);
    return t;
  }

  private const(v: unknown): string {
    const id = `k${this.rt.constant(v)}`;
    this.hoisted.push(`const ${id} = rt.consts[${this.rt.consts.length - 1}];`);
    return id;
  }

  /** A value from outside the block: a constant, read once. */
  private outsideName(name: string, v: Value): string {
    let id = this.outsideIds.get(name);
    if (id === undefined) {
      id = this.const(isPicture(v) ? v.v : v);
      this.outsideIds.set(name, id);
    }
    return id;
  }

  private span(s: Span): number {
    return this.rt.span(s);
  }

  private num(c: Code, s: Span, what: string): string {
    return c.kind === "n" ? c.js : `rt.num(${c.js}, ${this.span(s)}, ${JSON.stringify(what)})`;
  }

  private bool(c: Code, s: Span, what: string): string {
    return c.kind === "b" ? c.js : `rt.bool(${c.js}, ${this.span(s)}, ${JSON.stringify(what)})`;
  }

  private emitBlock(items: Stmt[], lines: string[], pad: string): void {
    for (const s of items) this.emitStmt(s, lines, pad);
  }

  private tick(s: Span): string {
    return `if (++steps > ${PICTURE_STEPS}) rt.tooLong(${this.span(s)});`;
  }

  private emitStmt(s: Stmt, lines: string[], pad: string): void {
    switch (s.kind) {
      case "Let":
      case "Assign": {
        const slot = this.resolved.get(s)!;
        const value = this.expr(s.value);
        const name = `v${slot.id}`;
        if (s.kind === "Let" || s.op === "=") {
          lines.push(`${pad}${name} = ${value.js};`);
        } else {
          const op = safeOp(s.op[0]!, ["+", "-", "*", "/"]);
          lines.push(
            slot.number && value.kind === "n"
              ? `${pad}${name} ${op}= ${value.js};`
              : `${pad}${name} = rt.bin(${JSON.stringify(op)}, ${name}, ${value.js}, ${this.span(s.span)});`,
          );
        }
        return;
      }
      case "If": {
        s.branches.forEach((b, k) => {
          const test = this.bool(this.expr(b.condition), b.condition.span, "A condition");
          lines.push(`${pad}${k === 0 ? "if" : "} else if"} (${test}) {`);
          this.emitBlock(b.block.items, lines, pad + "  ");
        });
        if (s.elseBlock) {
          lines.push(`${pad}} else {`);
          this.emitBlock(s.elseBlock.items, lines, pad + "  ");
        }
        lines.push(`${pad}}`);
        return;
      }
      case "Repeat": {
        const n = `t${this.temp++}`;
        const counter = this.resolved.get(s);
        const j = counter ? `v${counter.id}` : `t${this.temp++}`;
        lines.push(`${pad}{`);
        lines.push(
          `${pad}  const ${n} = rt.round(${this.num(this.expr(s.count), s.count.span, "`repeat`")});`,
        );
        lines.push(`${pad}  for (let ${j} = 0; ${j} < ${n}; ${j}++) {`);
        lines.push(`${pad}    ${this.tick(s.span)}`);
        this.emitBlock(s.block.items, lines, pad + "    ");
        lines.push(`${pad}  }`);
        lines.push(`${pad}}`);
        return;
      }
      case "For": {
        const [f, t, b, j] = [0, 1, 2, 3].map(() => `t${this.temp++}`);
        const v = `v${this.resolved.get(s)!.id}`;
        lines.push(`${pad}{`);
        lines.push(`${pad}  const ${f} = ${this.num(this.expr(s.from), s.from.span, "`for`")};`);
        lines.push(`${pad}  const ${t} = ${this.num(this.expr(s.to), s.to.span, "`for`")};`);
        lines.push(
          `${pad}  const ${b} = ${s.by ? this.num(this.expr(s.by), s.by.span, "`for`") : "1"};`,
        );
        if (s.by)
          lines.push(
            `${pad}  if (${b} === 0) rt.fail(${this.span(s.by.span)}, "\`by 0\` would never finish.");`,
          );
        lines.push(`${pad}  for (let ${j} = 0; ; ${j}++) {`);
        lines.push(`${pad}    const ${v} = ${f} + ${j} * ${b};`);
        lines.push(`${pad}    if (${b} > 0 ? ${v} > ${t} : ${v} < ${t}) break;`);
        lines.push(`${pad}    ${this.tick(s.span)}`);
        this.emitBlock(s.block.items, lines, pad + "    ");
        lines.push(`${pad}  }`);
        lines.push(`${pad}}`);
        return;
      }
      case "While": {
        const test = this.bool(this.expr(s.condition), s.condition.span, "A condition");
        lines.push(`${pad}while (${test}) {`);
        lines.push(`${pad}  ${this.tick(s.span)}`);
        this.emitBlock(s.block.items, lines, pad + "  ");
        lines.push(`${pad}}`);
        return;
      }
      case "Value":
        lines.push(`${pad}result = ${this.expr(s.value).js};`);
        return;
      default:
        return;
    }
  }

  private expr(e: Expr): Code {
    const kind = this.kindOf(e);
    return { js: this.exprJs(e, kind), kind };
  }

  private exprJs(e: Expr, kind: Kind): string {
    switch (e.kind) {
      case "Number":
        return `(${numberJs(e.value)})`;
      case "Bool":
        return e.value ? "true" : "false";
      case "String":
        return JSON.stringify(e.value);
      case "Hex":
        return this.const(guarded(e.span, () => hexColour(e.raw)));
      case "Name": {
        const slot = this.resolved.get(e);
        if (slot) return `v${slot.id}`;
        const v = this.outsideValue(e.name);
        if (v === undefined) throw new PixelError(e.span, `There's nothing called \`${e.name}\`.`);
        // A picture named on its own is its value at this pixel (section 14.1).
        return isPicture(v) ? `${this.outsideName(e.name, v)}[i]` : this.outsideName(e.name, v);
      }
      case "Vector":
        return `rt.vec(${this.num(this.expr(e.x), e.x.span, "A vector")}, ${this.num(this.expr(e.y), e.y.span, "A vector")}, ${this.num(this.expr(e.z), e.z.span, "A vector")})`;
      case "Unary": {
        const operand = this.expr(e.operand);
        if (e.op === "-")
          return operand.kind === "n"
            ? `(-${operand.js})`
            : `rt.neg(${operand.js}, ${this.span(e.span)})`;
        return `rt.not(${operand.js}, ${this.span(e.span)})`;
      }
      case "Binary": {
        if (e.op === "and" || e.op === "or") {
          const l = this.bool(this.expr(e.left), e.left.span, `The left side of \`${e.op}\``);
          const r = this.bool(this.expr(e.right), e.right.span, `The right side of \`${e.op}\``);
          return `(${l} ${e.op === "and" ? "&&" : "||"} ${r})`;
        }
        const l = this.expr(e.left);
        const r = this.expr(e.right);
        if (kind !== "?") {
          const op =
            e.op === "=="
              ? "==="
              : e.op === "!="
                ? "!=="
                : e.op === "^"
                  ? undefined
                  : safeOp(e.op, JS_OPS);
          return op === undefined ? `Math.pow(${l.js}, ${r.js})` : `(${l.js} ${op} ${r.js})`;
        }
        return `rt.bin(${JSON.stringify(e.op)}, ${l.js}, ${r.js}, ${this.span(e.opSpan)})`;
      }
      case "Member":
        return `rt.member(${this.expr(e.object).js}, ${JSON.stringify(e.name)}, ${this.span(e.nameSpan)})`;
      case "Call":
        return this.call(e, kind);
      case "List":
        return `rt.list([${e.items.map((i) => this.expr(i).js).join(", ")}])`;
      case "Index": {
        const index = this.expr(e.index);
        const spans = `${this.span(e.object.span)}, ${this.span(e.index.span)}`;
        const list = this.numberList(e.object);
        if (list) {
          // Read straight from the numbers, rounding the position as the interpreter does.
          const items = this.const(Float64Array.from(list.items as number[]));
          const whole = this.const(list);
          const [at, k] = [this.newTemp(), this.newTemp()];
          const round =
            index.kind === "n"
              ? `Math.floor(${at} + 0.5)`
              : `(typeof ${at} === "number" ? Math.floor(${at} + 0.5) : -1)`;
          return `(${at} = ${index.js}, ${k} = ${round}, ${k} >= 0 && ${k} < ${list.items.length} ? ${items}[${k}] : rt.item(${whole}, ${at}, ${spans}))`;
        }
        return `rt.item(${this.expr(e.object).js}, ${index.js}, ${spans})`;
      }
      default:
        return unsupported(e.span);
    }
  }

  private call(e: Extract<Expr, { kind: "Call" }>, kind: Kind): string {
    const args = e.args.map((a) => this.expr(a));
    const callee = e.callee;
    if (callee.kind === "Name" && !this.resolved.get(callee)) {
      const v = this.outside(callee.name);
      if (v !== undefined && isPicture(v)) {
        // `lumps(x, y)`: the picture read at a point.
        if (args.length !== 2)
          throw new PixelError(e.span, "A picture is read at a point, such as `lumps(x, y)`.");
        const [x, y] = args.map((a, k) => this.num(a, e.args[k]!.span, "A point in a picture"));
        return `rt.sample(${this.outsideName(callee.name, v)}, ${v.size}, ${x}, ${y})`;
      }
      const f = v === undefined ? BUILTIN_FUNCTIONS.get(callee.name) : undefined;
      if (f) {
        if (kind === "n" && f.numeric) {
          return `${this.const(f.numeric)}(${args.map((a) => a.js).join(", ")})`;
        }
        return `rt.call(${JSON.stringify(f.name)}, [${args.map((a) => a.js).join(", ")}], ${this.span(e.span)})`;
      }
    }
    return `rt.sampleValue(${this.expr(callee).js}, [${args.map((a) => a.js).join(", ")}], ${this.span(callee.span)}, ${this.span(e.span)})`;
  }
}

// Only numbers, quoted strings, names this file makes up (v1, t2, k3) and the operators below go
// into the JavaScript, never the code's own text, so a shared creature can't slip JavaScript in.
// These two checks keep it that way if the parser ever lets something else through.

const JS_OPS = ["+", "-", "*", "/", "%", "<", "<=", ">", ">="] as const;

function numberJs(v: unknown): string {
  if (typeof v !== "number") throw new Error(`A number was expected, not ${typeof v}.`);
  return String(v);
}

function safeOp<T extends string>(op: string, allowed: readonly T[]): T {
  if (!(allowed as readonly string[]).includes(op)) throw new Error(`Unknown operator ${op}.`);
  return op as T;
}

/** The block as a JavaScript function of the canvas, or undefined if the page forbids making one. */
function javascriptFor(
  body: Block,
  outside: Outside,
  size: number,
  valueSpan: Span,
): ((canvas: Canvas) => Float32Array) | undefined {
  if (canMakeJavaScript === false) return undefined;
  const { source, rt } = new Generator(outside, size).generate(body, valueSpan);
  let make: (rt: Runtime) => (canvas: Canvas, out: Float32Array) => Float32Array;
  try {
    make = new Function("rt", source) as typeof make;
    canMakeJavaScript = true;
  } catch (e) {
    // A content security policy without 'unsafe-eval' forbids it; anything else is a bug here.
    if (
      e instanceof EvalError ||
      (e instanceof Error && /eval|Content Security/i.test(e.message))
    ) {
      canMakeJavaScript = false;
      return undefined;
    }
    throw e;
  }
  const run = make(rt);
  return (canvas) => run(canvas, new Float32Array(canvas.size * canvas.size));
}

// ---------- closures ----------

type Get = () => Value;
type Do = () => void;

function withClosures(
  body: Block,
  outside: Outside,
  canvas: Canvas,
  valueSpan: Span,
): Float32Array {
  const pixels = new Closures(outside, canvas.size);
  const run = pixels.compile(body);
  const n = canvas.size * canvas.size;
  const out = new Float32Array(n);
  const toDegrees = 180 / Math.PI;
  for (let i = 0; i < n; i++) {
    pixels.start(i, canvas.x[i]!, canvas.y[i]!, canvas.r[i]!, canvas.a[i]! * toDegrees);
    run();
    const v = pixels.result;
    if (typeof v !== "number") badPixel(v, valueSpan);
    out[i] = v;
  }
  return out;
}

/**
 * The block as closures: each statement and expression a small function. Slower than JavaScript,
 * but it needs nothing the page might forbid.
 */
class Closures {
  /** The current pixel's index, and its x, y, r and a in slots 0 to 3. */
  private i = 0;
  private readonly slots: Value[] = [0, 0, 0, 0];
  private readonly scopes: Map<string, number>[] = [
    new Map([
      ["x", 0],
      ["y", 1],
      ["r", 2],
      ["a", 3],
    ]),
  ];
  private steps = 0;
  result: Value = 0;

  constructor(
    private readonly outside: Outside,
    private readonly size: number,
  ) {}

  start(i: number, x: number, y: number, r: number, a: number): void {
    this.i = i;
    this.slots[0] = x;
    this.slots[1] = y;
    this.slots[2] = r;
    this.slots[3] = a;
  }

  compile(block: Block): Do {
    return this.block(block, false);
  }

  private block(block: Block, scoped = true): Do {
    if (scoped) this.scopes.push(new Map());
    const steps = block.items.map((s) => this.stmt(s));
    if (scoped) this.scopes.pop();
    if (steps.length === 1) return steps[0]!;
    const n = steps.length;
    return () => {
      for (let k = 0; k < n; k++) steps[k]!();
    };
  }

  private slot(name: string): number | undefined {
    for (let k = this.scopes.length - 1; k >= 0; k--) {
      const n = this.scopes[k]!.get(name);
      if (n !== undefined) return n;
    }
    return undefined;
  }

  private declare(name: string): number {
    const n = this.slots.length;
    this.slots.push(0);
    this.scopes[this.scopes.length - 1]!.set(name, n);
    return n;
  }

  private tooLong(span: Span): never {
    throw new PixelLimit(span, "The picture stopped: is there a loop that never ends?");
  }

  private num(f: Get, span: Span, what: string): () => number {
    return () => {
      const v = f();
      return typeof v === "number" ? v : notNumber(v, span, what);
    };
  }

  private bool(f: Get, span: Span, what: string): () => boolean {
    return () => {
      const v = f();
      return typeof v === "boolean" ? v : notBool(v, span, what);
    };
  }

  private stmt(s: Stmt): Do {
    const slots = this.slots;
    switch (s.kind) {
      case "Let": {
        const value = this.expr(s.value);
        const n = this.declare(s.name);
        return () => {
          slots[n] = value();
        };
      }
      case "Assign": {
        const n = this.slot(s.name);
        if (n === undefined || n < 4) {
          throw new PixelError(
            s.nameSpan,
            n === undefined
              ? `Inside \`picture { }\`, only its own variables can change, not \`${s.name}\`.`
              : `\`${s.name}\` can't be changed.`,
          );
        }
        const value = this.expr(s.value);
        if (s.op === "=")
          return () => {
            slots[n] = value();
          };
        const op = s.op[0] as "+" | "-" | "*" | "/";
        const f = NUMBER_OPS[op]!;
        return () => {
          const p = slots[n]!;
          const q = value();
          slots[n] =
            typeof p === "number" && typeof q === "number"
              ? f(p, q)
              : guarded(s.span, () => binaryOp(op, p, q));
        };
      }
      case "If": {
        const branches = s.branches.map((b) => ({
          test: this.bool(this.expr(b.condition), b.condition.span, "A condition"),
          run: this.block(b.block),
        }));
        const otherwise = s.elseBlock ? this.block(s.elseBlock) : undefined;
        return () => {
          for (const b of branches) {
            if (b.test()) {
              b.run();
              return;
            }
          }
          otherwise?.();
        };
      }
      case "Repeat": {
        const count = this.num(this.expr(s.count), s.count.span, "`repeat`");
        this.scopes.push(new Map());
        const k = s.as ? this.declare(s.as.name) : -1;
        const body = this.block(s.block, false);
        this.scopes.pop();
        return () => {
          const n = roundHalfUp(count());
          for (let j = 0; j < n; j++) {
            if (++this.steps > PICTURE_STEPS) this.tooLong(s.span);
            if (k >= 0) slots[k] = j;
            body();
          }
        };
      }
      case "For": {
        const from = this.num(this.expr(s.from), s.from.span, "`for`");
        const to = this.num(this.expr(s.to), s.to.span, "`for`");
        const by = s.by ? this.num(this.expr(s.by), s.by.span, "`for`") : () => 1;
        this.scopes.push(new Map());
        const k = this.declare(s.variable.name);
        const body = this.block(s.block, false);
        this.scopes.pop();
        return () => {
          const a = from();
          const b = to();
          const step = by();
          if (step === 0) throw new PixelError(s.by!.span, "`by 0` would never finish.");
          for (let j = 0; ; j++) {
            const v = a + j * step;
            if (step > 0 ? v > b : v < b) break;
            if (++this.steps > PICTURE_STEPS) this.tooLong(s.span);
            slots[k] = v;
            body();
          }
        };
      }
      case "While": {
        const test = this.bool(this.expr(s.condition), s.condition.span, "A condition");
        const body = this.block(s.block);
        return () => {
          while (test()) {
            if (++this.steps > PICTURE_STEPS) this.tooLong(s.span);
            body();
          }
        };
      }
      case "Value": {
        const value = this.expr(s.value);
        return () => {
          this.result = value();
        };
      }
      case "Print":
      case "Gene":
      case "ErrorStmt":
        return () => {};
      default:
        return unsupported(s.span);
    }
  }

  private expr(e: Expr): Get {
    const slots = this.slots;
    switch (e.kind) {
      case "Number":
      case "Bool":
      case "String": {
        const v = e.value;
        return () => v;
      }
      case "Hex": {
        const v = guarded(e.span, () => hexColour(e.raw));
        return () => v;
      }
      case "Name": {
        const n = this.slot(e.name);
        if (n !== undefined) return () => slots[n]!;
        const v = this.outside(e.name) ?? BUILTIN_CONSTANTS.get(e.name);
        if (v === undefined) throw new PixelError(e.span, `There's nothing called \`${e.name}\`.`);
        // A picture named on its own is its value at this pixel (section 14.1).
        if (isPicture(v)) {
          const pixels = v.v;
          return () => pixels[this.i]!;
        }
        return () => v;
      }
      case "Vector": {
        const x = this.num(this.expr(e.x), e.x.span, "A vector");
        const y = this.num(this.expr(e.y), e.y.span, "A vector");
        const z = this.num(this.expr(e.z), e.z.span, "A vector");
        return () => vec(x(), y(), z());
      }
      case "Unary": {
        const operand = this.expr(e.operand);
        if (e.op === "-") {
          return () => {
            const v = operand();
            return typeof v === "number" ? -v : guarded(e.span, () => negate(v));
          };
        }
        return () => guarded(e.span, () => not(operand()));
      }
      case "Binary": {
        if (e.op === "and" || e.op === "or") {
          const left = this.bool(this.expr(e.left), e.left.span, `The left side of \`${e.op}\``);
          const right = this.bool(
            this.expr(e.right),
            e.right.span,
            `The right side of \`${e.op}\``,
          );
          return e.op === "and" ? () => left() && right() : () => left() || right();
        }
        const left = this.expr(e.left);
        const right = this.expr(e.right);
        const op = e.op;
        const f = NUMBER_OPS[op]!;
        return () => {
          const p = left();
          const q = right();
          return typeof p === "number" && typeof q === "number"
            ? f(p, q)
            : guarded(e.opSpan, () => binaryOp(op, p, q));
        };
      }
      case "Member": {
        const object = this.expr(e.object);
        return () => {
          const v = object();
          return guarded(e.nameSpan, () => member(v, e.name));
        };
      }
      case "Call":
        return this.call(e);
      case "List": {
        const items = e.items.map((item) => this.expr(item));
        return () => ({ type: "list", items: items.map((f) => f()) });
      }
      case "Index": {
        const object = this.expr(e.object);
        const index = this.expr(e.index);
        const fail = (atIndex: boolean, message: string): never => {
          throw new PixelError(atIndex ? e.index.span : e.object.span, message);
        };
        return () => listItem(object(), index(), fail);
      }
      default:
        return unsupported(e.span);
    }
  }

  private call(e: Extract<Expr, { kind: "Call" }>): Get {
    const args = e.args.map((a) => this.expr(a));
    const callee = e.callee;
    if (callee.kind === "Name" && this.slot(callee.name) === undefined) {
      const v = this.outside(callee.name);
      if (v !== undefined && isPicture(v)) {
        // `lumps(x, y)`: the picture read at a point.
        if (args.length !== 2)
          throw new PixelError(e.span, "A picture is read at a point, such as `lumps(x, y)`.");
        const [x, y] = args.map((f, k) => this.num(f, e.args[k]!.span, "A point in a picture"));
        return () => sample(v.v, v.size, x!(), y!());
      }
      const builtin = v === undefined ? BUILTIN_FUNCTIONS.get(callee.name) : undefined;
      if (builtin) {
        const ctx = libraryContext(this.size);
        // One array of arguments for every call here: the library doesn't keep them.
        const values: Value[] = args.map(() => 0);
        const n = args.length;
        return () => {
          for (let k = 0; k < n; k++) values[k] = args[k]!();
          try {
            return builtin.call(values, ctx);
          } catch (err) {
            if (err instanceof ValueError) throw new PixelError(e.span, err.message);
            throw err;
          }
        };
      }
    }
    const target = this.expr(callee);
    return () => {
      const t = target();
      if (typeof t === "object" && t.type === "gradient") {
        const at = args[0]?.();
        if (typeof at !== "number" || args.length !== 1)
          throw new PixelError(
            e.span,
            "A gradient is sampled at one position, such as `skin(0.5)`.",
          );
        return sampleGradient(t, at);
      }
      throw new PixelError(callee.span, `${typeLabel(typeOf(t))} can't be called or sampled.`);
    };
  }
}
