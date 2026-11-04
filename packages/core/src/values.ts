// Runtime values (docs/LANGUAGE.md section 5) and the operators on them (section 8).

import type { BinaryOp } from "./ast.js";

export interface Vec {
  type: "vector";
  x: number;
  y: number;
  z: number;
}

/** Hue in degrees, 0 up to 360; saturation, value and alpha 0–1. */
export interface Colour {
  type: "colour";
  h: number;
  s: number;
  v: number;
  a: number;
}

export interface GradientStopValue {
  pos: number;
  colour: Colour;
}

export interface Gradient {
  type: "gradient";
  stops: GradientStopValue[];
  /** A spectrum: hue blends in a straight line, rather than the short way round. */
  straight: boolean;
}

export const SHAPES = ["tube", "cube", "cone", "ball", "ring", "donut"] as const;
export type ShapeName = (typeof SHAPES)[number];

export interface ShapeValue {
  type: "shape";
  name: ShapeName;
}

export const PATTERN_KINDS = [
  "sunburst",
  "vortex",
  "plasma",
  "cells",
  "kaleidoscope",
  "interference",
  "starburst",
  "marble",
  "lightning",
  "aurora",
  "bloom",
] as const;
export type PatternKindName = (typeof PATTERN_KINDS)[number];

/** Whether a kind is one of the built-in ones, not a pattern written in GenoCode. */
export function isBuiltinKind(kind: string): kind is PatternKindName {
  return (PATTERN_KINDS as readonly string[]).includes(kind);
}

/** A pattern kind: a built-in one, or the name of a pattern written in GenoCode (section 14.1). */
export interface PatternKindValue {
  type: "patternKind";
  name: string;
}

/**
 * A pattern kind written in GenoCode, carried with a recipe so the picture can be drawn anywhere,
 * such as in a web worker: the pattern as a pattern file, and its genes' values by full name.
 */
export interface PatternSource {
  text: string;
  genes: [string, Value][];
}

/** The colour schemes a pattern can be coloured in (docs/LANGUAGE.md section 14). */
export const SCHEMES = [
  "jewel",
  "duotone",
  "split",
  "analogous",
  "pastel",
  "dusk",
  "electric",
] as const;
export type SchemeName = (typeof SCHEMES)[number];

/** How a pattern's surface looks. */
export const FINISHES = ["matte", "metallic", "iridescent", "pearl", "satin"] as const;
export type FinishName = (typeof FINISHES)[number];

/** The ways a second pattern can be mixed into a first. */
export const MIX_WAYS = ["warp", "blend", "mask", "carve"] as const;
export type MixWayName = (typeof MIX_WAYS)[number];

export interface SchemeValue {
  type: "scheme";
  name: SchemeName;
}

export interface FinishValue {
  type: "finish";
  name: FinishName;
}

export interface MixWayValue {
  type: "mixWay";
  name: MixWayName;
}

/** A second pattern mixed into a first: how, which kind, and how much (0 to 1). */
export interface PatternMix {
  way: MixWayName;
  kind: string;
  amount: number;
  /** For a pattern written in GenoCode. */
  source?: PatternSource | undefined;
}

/** A texture recipe. `kind` is null for `none`. */
export interface Pattern {
  type: "pattern";
  kind: string | null;
  /** For a pattern written in GenoCode. */
  source?: PatternSource | undefined;
  hue: number;
  seed: number;
  scheme: SchemeName;
  finish: FinishName;
  mix?: PatternMix | undefined;
}

/** No texture. */
export const NO_PATTERN: Pattern = {
  type: "pattern",
  kind: null,
  hue: 0,
  seed: 0,
  scheme: "jewel",
  finish: "matte",
};

/** Values in order (section 8.3). */
export interface ListValue {
  type: "list";
  items: Value[];
}

/** A grey picture, `size` × `size`, rows from the top, values usually 0 to 1 (section 14.1). */
export interface Picture {
  type: "picture";
  size: number;
  v: Float32Array;
}

/** The value of a part choice gene. Not a value the program can store or pass around. */
export interface PartRef {
  type: "part";
  name: string;
}

export type Value =
  | number
  | boolean
  | string
  | Vec
  | Colour
  | Gradient
  | ShapeValue
  | PatternKindValue
  | SchemeValue
  | FinishValue
  | MixWayValue
  | Pattern
  | ListValue
  | Picture
  | PartRef;

export type TypeName =
  | "number"
  | "bool"
  | "string"
  | "vector"
  | "colour"
  | "gradient"
  | "shape"
  | "patternKind"
  | "scheme"
  | "finish"
  | "mixWay"
  | "pattern"
  | "list"
  | "picture"
  | "part";

/** A problem with values; the interpreter adds where it happened. */
export class ValueError extends Error {}

export function typeOf(v: Value): TypeName {
  switch (typeof v) {
    case "number":
      return "number";
    case "boolean":
      return "bool";
    case "string":
      return "string";
    default:
      return v.type;
  }
}

const LABELS: Record<TypeName, string> = {
  number: "a number",
  bool: "a bool",
  string: "a string",
  vector: "a vector",
  colour: "a colour",
  gradient: "a gradient",
  shape: "a shape",
  patternKind: "a pattern kind",
  scheme: "a colour scheme",
  finish: "a finish",
  mixWay: "a way of mixing",
  pattern: "a pattern",
  list: "a list",
  picture: "a picture",
  part: "a part",
};

export function typeLabel(t: TypeName): string {
  return LABELS[t];
}

export function vec(x: number, y: number, z: number): Vec {
  return { type: "vector", x, y, z };
}

export function isVec(v: Value): v is Vec {
  return typeof v === "object" && v.type === "vector";
}

export function isList(v: Value): v is ListValue {
  return typeof v === "object" && v.type === "list";
}

export function isPicture(v: Value): v is Picture {
  return typeof v === "object" && v.type === "picture";
}

export function isColour(v: Value): v is Colour {
  return typeof v === "object" && v.type === "colour";
}

export function valuesEqual(a: Value, b: Value): boolean {
  if (typeof a !== "object" || typeof b !== "object") return a === b;
  switch (a.type) {
    case "vector":
      return b.type === "vector" && a.x === b.x && a.y === b.y && a.z === b.z;
    case "colour":
      return b.type === "colour" && a.h === b.h && a.s === b.s && a.v === b.v && a.a === b.a;
    case "shape":
    case "patternKind":
    case "scheme":
    case "finish":
    case "mixWay":
    case "part":
      return b.type === a.type && a.name === b.name;
    case "pattern":
      return (
        b.type === "pattern" &&
        a.kind === b.kind &&
        a.hue === b.hue &&
        a.seed === b.seed &&
        a.scheme === b.scheme &&
        a.finish === b.finish &&
        a.mix?.way === b.mix?.way &&
        a.mix?.kind === b.mix?.kind &&
        a.mix?.amount === b.mix?.amount &&
        sameSource(a.source, b.source) &&
        sameSource(a.mix?.source, b.mix?.source)
      );
    case "list":
      return (
        b.type === "list" &&
        a.items.length === b.items.length &&
        a.items.every((x, i) => valuesEqual(x, b.items[i]!))
      );
    case "picture":
      return a === b;
    case "gradient":
      return false;
  }
}

function sameSource(a: PatternSource | undefined, b: PatternSource | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return (
    a.text === b.text &&
    a.genes.length === b.genes.length &&
    a.genes.every(([name, v], i) => b.genes[i]![0] === name && valuesEqual(v, b.genes[i]![1]))
  );
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toPrecision(6)));
}

/** How `print` shows a value. */
export function formatValue(v: Value): string {
  if (typeof v === "number") return formatNumber(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "string") return v;
  switch (v.type) {
    case "vector":
      return `(${formatNumber(v.x)}, ${formatNumber(v.y)}, ${formatNumber(v.z)})`;
    case "colour":
      return `hsv(${formatNumber(v.h)}, ${formatNumber(v.s)}, ${formatNumber(v.v)}, ${formatNumber(v.a)})`;
    case "gradient":
      return `${v.straight ? "spectrum" : "gradient"}(${v.stops.map((s) => `${formatValue(s.colour)} at ${formatNumber(s.pos)}`).join(", ")})`;
    case "shape":
    case "patternKind":
    case "scheme":
    case "finish":
    case "mixWay":
    case "part":
      return v.name;
    case "pattern": {
      if (v.kind === null) return "none";
      // The scheme and finish are left out when they're the defaults, as they'd be written.
      const extra =
        v.finish !== "matte"
          ? `, ${v.scheme}, ${v.finish}`
          : v.scheme !== "jewel"
            ? `, ${v.scheme}`
            : "";
      const p = `pattern(${v.kind}, ${formatNumber(v.hue)}, ${v.seed}${extra})`;
      return v.mix === undefined
        ? p
        : `mixed(${p}, ${v.mix.way}, ${v.mix.kind}, ${formatNumber(v.mix.amount)})`;
    }
    case "list":
      return `[${v.items.map(formatValue).join(", ")}]`;
    case "picture":
      return "a picture";
  }
}

// ---------- operators ----------

function mismatch(op: string, a: Value, b: Value): ValueError {
  return new ValueError(
    `\`${op}\` can't be used on ${typeLabel(typeOf(a))} and ${typeLabel(typeOf(b))}.`,
  );
}

function perAxis(a: Vec, b: Vec, f: (p: number, q: number) => number): Vec {
  return vec(f(a.x, b.x), f(a.y, b.y), f(a.z, b.z));
}

function scaled(v: Vec, f: (p: number) => number): Vec {
  return vec(f(v.x), f(v.y), f(v.z));
}

export function binaryOp(op: BinaryOp, a: Value, b: Value): Value {
  // Two numbers are by far the most common case, so they're done first, the same way as below.
  if (typeof a === "number" && typeof b === "number") {
    switch (op) {
      case "+":
        return a + b;
      case "-":
        return a - b;
      case "*":
        return a * b;
      case "/":
        return a / b;
      case "%":
        return a % b;
      case "<":
        return a < b;
      case "<=":
        return a <= b;
      case ">":
        return a > b;
      case ">=":
        return a >= b;
      case "^":
        return Math.pow(a, b);
    }
  }
  switch (op) {
    case "==":
    case "!=": {
      if (typeOf(a) !== typeOf(b)) {
        throw new ValueError(
          `\`${op}\` compares two values of the same type, not ${typeLabel(typeOf(a))} and ${typeLabel(typeOf(b))}.`,
        );
      }
      if (typeOf(a) === "gradient" || typeOf(a) === "string" || typeOf(a) === "picture") {
        throw new ValueError(`${typeLabel(typeOf(a))} can't be compared.`);
      }
      return op === "==" ? valuesEqual(a, b) : !valuesEqual(a, b);
    }
    case "<":
    case "<=":
    case ">":
    case ">=": {
      if (typeof a !== "number" || typeof b !== "number") throw mismatch(op, a, b);
      if (op === "<") return a < b;
      if (op === "<=") return a <= b;
      if (op === ">") return a > b;
      return a >= b;
    }
    case "and":
    case "or":
      if (typeof a !== "boolean" || typeof b !== "boolean") throw mismatch(op, a, b);
      return op === "and" ? a && b : a || b;
    case "^":
      if (typeof a !== "number" || typeof b !== "number") throw mismatch(op, a, b);
      return Math.pow(a, b);
    case "+":
    case "-": {
      const f = op === "+" ? (p: number, q: number) => p + q : (p: number, q: number) => p - q;
      if (typeof a === "number" && typeof b === "number") return f(a, b);
      if (isVec(a) && isVec(b)) return perAxis(a, b, f);
      if (op === "+" && isList(a) && isList(b))
        return { type: "list", items: [...a.items, ...b.items] };
      throw mismatch(op, a, b);
    }
    case "*":
    case "/":
    case "%": {
      const f =
        op === "*"
          ? (p: number, q: number) => p * q
          : op === "/"
            ? (p: number, q: number) => p / q
            : (p: number, q: number) => p % q;
      if (typeof a === "number" && typeof b === "number") return f(a, b);
      if (op !== "%") {
        if (isVec(a) && isVec(b)) return perAxis(a, b, f);
        if (isVec(a) && typeof b === "number") return scaled(a, (p) => f(p, b));
        if (op === "*" && typeof a === "number" && isVec(b)) return scaled(b, (q) => a * q);
      }
      throw mismatch(op, a, b);
    }
  }
}

export function negate(v: Value): Value {
  if (typeof v === "number") return -v;
  if (isVec(v)) return vec(-v.x, -v.y, -v.z);
  throw new ValueError(`\`-\` can't be used on ${typeLabel(typeOf(v))}.`);
}

export function not(v: Value): Value {
  if (typeof v !== "boolean")
    throw new ValueError(`\`not\` needs a bool, not ${typeLabel(typeOf(v))}.`);
  return !v;
}

/** Rounds to a whole number with halves rounded up (section 5). */
export function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5);
}

export function member(v: Value, name: string): Value {
  if (isVec(v)) {
    if (name === "x") return v.x;
    if (name === "y") return v.y;
    if (name === "z") return v.z;
  } else if (isColour(v)) {
    if (name === "hue") return v.h;
    if (name === "sat") return v.s;
    if (name === "val") return v.v;
    if (name === "alpha") return v.a;
  }
  throw new ValueError(`${typeLabel(typeOf(v))} has no part called \`${name}\`.`);
}
