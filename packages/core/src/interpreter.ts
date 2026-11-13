// Builds a creature: runs the checked program with a set of gene values and inputs, and collects
// the shapes it lays (docs/LANGUAGE.md section 20).

import {
  EFFECT_FLAGS,
  TRIGGER_KINDS,
  type BinaryOp,
  type Block,
  type Expr,
  type FunctionDecl,
  type PartDecl,
  type Stmt,
} from "./ast.js";
import {
  BUILTIN_CONSTANTS,
  BUILTIN_FUNCTIONS,
  PICTURE_FUNCTIONS,
  type BuiltinContext,
} from "./builtins.js";
import type { CheckResult } from "./checker.js";
import { hexColour, makeGradient, sampleGradient } from "./colour.js";
import { format } from "./format.js";
import type { GeneInfo } from "./genes.js";
import { mulberry32 } from "./noise.js";
import { Canvas, sample } from "./picture.js";
import { drawPixels, listItem, PixelError, PixelLimit, type PixelEngine } from "./pixels.js";
import type { Diagnostic, Span } from "./source.js";
import {
  cloneFrame,
  frameMatrix,
  grow,
  move,
  multiply,
  newFrame,
  rotateAround,
  turn,
  type Frame,
  type V3,
} from "./turtle.js";
import {
  binaryOp,
  formatValue,
  isBuiltinKind,
  isColour,
  isList,
  isPicture,
  isVec,
  member,
  negate,
  NO_PATTERN,
  not,
  roundHalfUp,
  SHAPES,
  typeLabel,
  typeOf,
  ValueError,
  vec,
  type Colour,
  type Pattern,
  type PatternSource,
  type Picture,
  type ShapeName,
  type Value,
} from "./values.js";

/** The parts of `music` (section 16). */
export const MUSIC_FIELDS = [
  "bass",
  "mid",
  "high",
  "level",
  "hit",
  "bass_hit",
  "mid_hit",
  "high_hit",
  "tempo",
  "energy",
  "bright",
  "rough",
  "balance",
  "note",
  "clear",
  "key",
  "major",
  "pitch",
] as const;

export type MusicInputs = Record<(typeof MUSIC_FIELDS)[number], number>;

/** The least and greatest value of the parts of `music` that don't run from 0 to 1. */
export const MUSIC_RANGES: Readonly<Partial<Record<keyof MusicInputs, readonly [number, number]>>> =
  { balance: [-1, 1], note: [0, 360], key: [0, 360] };

/** The least and greatest value a part of `music` takes. */
export function musicRange(field: keyof MusicInputs): readonly [number, number] {
  return MUSIC_RANGES[field] ?? [0, 1];
}

/** Time and music (section 16). Everything left out is 0: the rest pose. */
export interface Inputs {
  time: number;
  beat: number;
  music: MusicInputs;
}

export interface Limits {
  shapes: number;
  steps: number;
  depth: number;
}

/** Every `music` value at 0, as when no music is playing. */
export function silence(): MusicInputs {
  return Object.fromEntries(MUSIC_FIELDS.map((f) => [f, 0])) as MusicInputs;
}

export const DEFAULT_LIMITS: Readonly<Limits> = { shapes: 50_000, steps: 10_000_000, depth: 200 };

export interface BuildOptions {
  /** Gene values by full name. Genes left out keep the value written in the code. */
  genes?: ReadonlyMap<string, Value>;
  inputs?: Partial<Omit<Inputs, "music">> & { music?: Partial<MusicInputs> };
  limits?: Partial<Limits>;
  /** How pictures' per-pixel code is run (pixels.ts): for tests that compare the two ways. */
  pixels?: PixelEngine;
  /** Record the turtle's path in the result's `path`, for the app's path view. */
  trace?: boolean;
}

/**
 * One straight piece of the turtle's path, in world space. A `"move"` is a `forward`, `back` or
 * `move`; a `"return"` is the jump back to where a `branch` (or one side of a `symmetric`)
 * started, when it ends somewhere else. `span` is the statement that made it.
 */
export interface PathStep {
  kind: "move" | "return";
  from: [number, number, number];
  to: [number, number, number];
  span: Span;
}

/**
 * Something laid: one of the six shapes, or a `"stroke"`, one smooth tube through `points`. A
 * stroke's other fields are its first point's (its matrix places it, for anything that only needs
 * to know roughly where it is); it wears no texture and isn't mirrored as a whole.
 */
export interface LaidShape {
  shape: ShapeName | "stroke";
  /** 4×4 placement matrix, column-major, from the shape's own space to the world. */
  matrix: number[];
  colour: Colour;
  shine: number;
  sharpness: number;
  /** Null for no texture. */
  texture: Pattern | null;
  /** How much of its texture the shape wears: 0 its plain colour, 1 all texture. */
  wear: number;
  /** The placement reverses handedness (the shape is drawn mirrored). */
  mirrored: boolean;
  /** A stroke's points, in the order they were laid: at least two. */
  points?: StrokePoint[];
}

/**
 * A point a stroke passes through: where a shape would have been laid. The tube passes through the
 * matrix's origin along its z axis, and its cross-section there is the shape's 1×1 middle: the x
 * and y axes give its width and height.
 */
export interface StrokePoint {
  matrix: number[];
  colour: Colour;
  shine: number;
  sharpness: number;
}

export interface BuildResult {
  shapes: LaidShape[];
  /**
   * Where the camera looks: the turtle's position at the last `focuspoint` (section 11.8), or
   * undefined if the creature has none and the middle of its shapes is used instead.
   */
  focus?: [number, number, number] | undefined;
  diagnostics: Diagnostic[];
  /** What `print` wrote, one entry per call. */
  printed: string[];
  /** The build ran to the end without errors (it may still have warnings). */
  ok: boolean;
  /** The turtle's path, in the order it was walked: only when built with `trace`. */
  path?: PathStep[];
}

export interface BackgroundResult {
  /** A pattern, colour or gradient; undefined if there's no background or it failed. */
  fill: Value | undefined;
  diagnostics: Diagnostic[];
  printed: string[];
}

/** Builds a checked creature. */
export function build(program: CheckResult, options: BuildOptions = {}): BuildResult {
  const run = new Run(program, options);
  if (!program.ok || program.file.kind !== "creature") {
    return {
      shapes: [],
      diagnostics: [
        {
          severity: "error",
          message: program.ok
            ? "This file isn't a creature."
            : "The file has errors, so it can't be built.",
          span: program.file.nameSpan,
        },
      ],
      printed: [],
      ok: false,
    };
  }
  run.guarded(() => run.runCreature());
  return {
    shapes: run.shapes,
    focus: run.focus,
    diagnostics: run.finish(),
    printed: run.printed,
    ok: !run.failed,
    ...(options.trace ? { path: run.path } : {}),
  };
}

/** Which moves of an input trigger an effect (section 17). */
export type TriggerKind = "changes" | "drops" | "rises";

/** A trigger effect's settings: its input, what triggers it, and its bursts (on/off counts). */
export interface Trigger {
  input: number;
  when: TriggerKind;
  by: number;
  /** Triggers it works for, then rests for, or undefined to always work. */
  bursts: { on: number; off: number } | undefined;
}

/** A dance style at one moment: each effect's input (0–1) and settings, or undefined if it's off. */
export interface DanceStyle {
  morph?: { input: number; speed: number; settle: number };
  zoom?: { input: number; amount: number; settle: number };
  /** `upright`: the spin stays about the creature's up axis, so it never tips over. */
  spin?: { input: number; from: number; to: number; smooth: number; upright?: boolean };
  turn?: Trigger;
  reverse?: Trigger;
  flat?: Trigger;
}

export interface DanceResult {
  /** Undefined if there's no dance block or it failed. */
  style: DanceStyle | undefined;
  diagnostics: Diagnostic[];
  printed: string[];
}

/**
 * Works out a creature's or dance file's dance style at one moment (section 17). The block runs
 * with the inputs given, so the app runs it again at every moment of the dance.
 */
export function buildDance(program: CheckResult, options: BuildOptions = {}): DanceResult {
  const run = new Run(program, options);
  if (!program.ok || program.dance === undefined) {
    return { style: undefined, diagnostics: [], printed: [] };
  }
  run.guarded(() => run.runSection(program.dance!, "dance"));
  return {
    style: run.failed ? undefined : danceStyle(run.effects),
    diagnostics: run.finish(),
    printed: run.printed,
  };
}

interface EffectValues {
  name: string;
  settings: Map<string, number>;
  when: TriggerKind | undefined;
  /** The words that stand alone and aren't triggers, such as `upright`. */
  flags: Set<string>;
}

/** The effect lines as a style, with the defaults of section 17 for settings left out. */
function danceStyle(effects: EffectValues[]): DanceStyle {
  const style: DanceStyle = {};
  const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1);
  for (const e of effects) {
    const get = (name: string, fallback: number) => e.settings.get(name) ?? fallback;
    const input = clamp01(get("input", 0));
    const trigger = (defaultBursts: Trigger["bursts"]): Trigger => ({
      input,
      when: e.when ?? "changes",
      by: get("by", 0.5),
      bursts: e.settings.has("off")
        ? { on: Math.max(1, Math.round(get("on", 1))), off: Math.max(1, Math.round(get("off", 1))) }
        : defaultBursts,
    });
    switch (e.name) {
      case "morph":
        style.morph = { input, speed: get("speed", 1), settle: get("settle", 2) };
        break;
      case "zoom":
        style.zoom = { input, amount: clamp01(get("amount", 0.5)), settle: get("settle", 15) };
        break;
      case "spin":
        style.spin = {
          input,
          from: get("from", 45),
          to: get("to", 170),
          smooth: get("smooth", 0.4),
          upright: e.flags.has("upright"),
        };
        break;
      case "turn":
        style.turn = trigger(undefined);
        break;
      case "reverse":
        style.reverse = trigger(undefined);
        break;
      case "flat":
        style.flat = trigger({ on: 24, off: 48 });
        break;
    }
  }
  return style;
}

/** Works out a creature's or background file's background (section 15). */
export function buildBackground(
  program: CheckResult,
  options: BuildOptions = {},
): BackgroundResult {
  const run = new Run(program, options);
  if (!program.ok || program.background === undefined) {
    return { fill: undefined, diagnostics: [], printed: [] };
  }
  run.guarded(() => run.runSection(program.background!, "background"));
  return {
    fill: run.failed ? undefined : run.fill,
    diagnostics: run.finish(),
    printed: run.printed,
  };
}

export interface PatternResult {
  /** The grey picture, or undefined if the pattern failed. */
  picture: Picture | undefined;
  /**
   * With `holdFinish`: the blurs around the pattern's `value`, held back so that they're done
   * after it's mixed with another pattern. Without, nothing is held back and this does nothing.
   */
  finish: (p: Picture) => Picture;
  diagnostics: Diagnostic[];
  printed: string[];
}

export interface PatternOptions extends BuildOptions {
  /**
   * Leaves out the `blur` and `zoom_blur` calls wrapped around the pattern's `value`, giving them
   * as `finish` instead (section 14.1): a mixed pattern is blurred after the mixing, as the
   * built-in kinds are.
   */
  holdFinish?: boolean;
}

/** The finishing blurs a pattern's `value` is wrapped in, outermost last. */
const FINISHES = new Set(["blur", "zoom_blur"]);

/**
 * Draws a pattern written in GenoCode (section 14.1): its picture for a recipe's `seed`, on a
 * canvas of pixel positions (pushed about when the pattern is mixed in with `warp`). The genes are
 * the pattern's, by full name, such as `Ripples.rings`.
 */
export function buildPattern(
  program: CheckResult,
  name: string,
  seed: number | (() => number),
  canvas: Canvas,
  options: PatternOptions = {},
): PatternResult {
  const run = new Run(program, options);
  const items = program.patterns.get(name);
  const none = (p: Picture) => p;
  if (!program.ok || items === undefined) {
    return { picture: undefined, finish: none, diagnostics: [], printed: [] };
  }
  const steps: ((p: Picture) => Picture)[] = [];
  run.guarded(() =>
    run.runPattern(items, name, seed, canvas, options.holdFinish ? steps : undefined),
  );
  const v = run.value;
  return {
    picture: !run.failed && v !== undefined && isPicture(v) ? v : undefined,
    finish: (p) => steps.reduce((q, step) => step(q), p),
    diagnostics: run.finish(),
    printed: run.printed,
  };
}

/** A pattern block of a creature as a pattern file, the form a recipe carries it in. */
export function patternFileText(program: CheckResult, name: string): string | undefined {
  if (program.file.kind === "pattern") return program.file.name === name ? program.text : undefined;
  const decl = program.file.items.find((s) => s.kind === "Pattern" && s.name === name);
  if (decl?.kind !== "Pattern") return undefined;
  return format({
    kind: "pattern",
    name,
    nameSpan: decl.nameSpan,
    headerComments: [],
    description: [],
    items: decl.body.items,
    endComments: decl.body.endComments,
    span: decl.span,
  });
}

class RuntimeError extends Error {
  constructor(
    readonly span: Span,
    message: string,
  ) {
    super(message);
  }
}

class LimitReached extends Error {
  constructor(
    readonly span: Span,
    message: string,
  ) {
    super(message);
  }
}

/** A value error (such as adding a colour to a number) as a runtime error at the code that caused it. */
function located(e: unknown, span: Span): unknown {
  return e instanceof ValueError ? new RuntimeError(span, e.message) : e;
}

/** An expression turned into a function that works it out for a run, in a scope. */
type Compiled = (r: Run, env: Env) => Value;

/** Statements turned into a function that runs them, giving back a `return`'s signal if one ran. */
type Exec = (r: Run, env: Env) => ReturnSignal | undefined;

/**
 * Where each expression, and each list of statements, keeps its function, made the first time
 * it's run and kept for every build of the program.
 */
const COMPILED = Symbol("compiled");

class ReturnSignal {
  constructor(readonly value: Value | undefined) {}
}

interface Binding {
  value: Value;
  mutable: boolean;
}

/**
 * A scope of variables. Most scopes (a loop's pass, an `if` block) never bind anything, so their
 * map is made only when needed. Scopes that grow from one root share the set of every name ever
 * bound in them: a name that isn't in it, such as a built-in function's, is known to be unbound
 * without walking up the scopes.
 */
class Env {
  private vars: Map<string, Binding> | undefined;
  private readonly names: Set<string>;

  constructor(readonly parent: Env | undefined) {
    this.names = parent ? parent.names : new Set();
  }

  set(name: string, binding: Binding): void {
    (this.vars ??= new Map()).set(name, binding);
    this.names.add(name);
  }

  lookup(name: string): Binding | undefined {
    if (!this.names.has(name)) return undefined;
    for (let e: Env | undefined = this; e; e = e.parent) {
      const b = e.vars?.get(name);
      if (b) return b;
    }
    return undefined;
  }
}

interface DrawState {
  turtle: Frame;
  shapeFrame: Frame;
  shape: ShapeName;
  colour: Colour;
  shine: number;
  sharpness: number;
  texture: Pattern | null;
  wear: number;
}

function cloneState(s: DrawState): DrawState {
  return { ...s, turtle: cloneFrame(s.turtle), shapeFrame: cloneFrame(s.shapeFrame) };
}

const WHITE: Colour = { type: "colour", h: 0, s: 0, v: 1, a: 1 };

class Run {
  shapes: LaidShape[] = [];
  /** The turtle's path, when the build traces it. */
  path: PathStep[] = [];
  /** The points of the strokes being drawn, innermost last: a `lay` adds to the innermost. */
  private strokes: StrokePoint[][] = [];
  /** Stroke points laid so far, which count towards the shapes limit. */
  private strokePoints = 0;
  focus: [number, number, number] | undefined;
  printed: string[] = [];
  failed = false;
  fill: Value | undefined;
  /** A pattern's `value`. */
  value: Value | undefined;
  readonly effects: EffectValues[] = [];
  /** In pattern code: the pixels being drawn. */
  private canvas: Canvas | undefined;
  /** Patterns written in GenoCode, as recipes carry them, made when first needed. */
  private readonly sources = new Map<string, PatternSource>();
  private readonly diagnostics: Diagnostic[] = [];
  private readonly limits: Limits;
  private readonly inputs: Inputs;
  private random: () => number = () => 0;
  private readonly genesByOwner = new Map<string | undefined, GeneInfo[]>();
  private readonly globals = new Set<string>();
  private steps = 0;
  private depth = 0;
  private skipped = 0;
  private skippedSpan: Span | undefined;
  private shapeMode = 0;
  private module = new Env(undefined);
  private state: DrawState = {
    turtle: newFrame(),
    shapeFrame: newFrame(),
    shape: "ball",
    colour: WHITE,
    shine: 0,
    sharpness: 0,
    texture: null,
    wear: 1,
  };

  constructor(
    private readonly program: CheckResult,
    private readonly options: BuildOptions,
  ) {
    this.limits = { ...DEFAULT_LIMITS, ...options.limits };
    const i = options.inputs ?? {};
    this.inputs = {
      time: i.time ?? 0,
      beat: i.beat ?? 0,
      music: { ...silence(), ...i.music },
    };
    for (const g of program.genes) {
      const key = geneKey(g);
      if (!this.genesByOwner.has(key)) this.genesByOwner.set(key, []);
      this.genesByOwner.get(key)!.push(g);
    }
    for (const item of program.file.items) if (item.kind === "Let") this.globals.add(item.name);
  }

  /** Runs `f`, turning errors and limits into diagnostics. */
  guarded(f: () => void): void {
    try {
      f();
    } catch (e) {
      if (e instanceof RuntimeError) {
        this.failed = true;
        this.diagnostics.push({ severity: "error", message: e.message, span: e.span });
      } else if (e instanceof LimitReached) {
        this.diagnostics.push({ severity: "warning", message: e.message, span: e.span });
      } else {
        throw e;
      }
    }
  }

  finish(): Diagnostic[] {
    if (this.skipped > 0) {
      this.diagnostics.push({
        severity: "warning",
        message: `${this.skipped} shape${this.skipped === 1 ? " was" : "s were"} left out because ${this.skipped === 1 ? "its" : "their"} placement wasn't a finite number.`,
        span: this.skippedSpan!,
      });
    }
    return this.diagnostics;
  }

  private geneValue(g: GeneInfo | undefined): Value | undefined {
    if (g === undefined) return undefined;
    const given = this.options.genes?.get(g.fullName);
    if (given === undefined) return g.value;
    if (typeOf(given) !== typeOf(g.value)) {
      throw new RuntimeError(
        g.span,
        `The gene \`${g.fullName}\` was given ${typeLabel(typeOf(given))}, but it holds ${typeLabel(typeOf(g.value))}.`,
      );
    }
    return given;
  }

  private bindGenes(env: Env, owner: string | undefined): void {
    const genes = this.genesByOwner.get(owner);
    if (genes === undefined) return;
    for (const g of genes) {
      if (g.fullName === "seed") continue;
      env.set(g.name, { value: this.geneValue(g)!, mutable: false });
    }
  }

  private startRandom(): void {
    const seed = this.geneValue(this.program.genes.find((g) => g.fullName === "seed"));
    this.random = mulberry32(typeof seed === "number" ? seed : 0);
  }

  runCreature(): void {
    this.startRandom();
    this.bindGenes(this.module, undefined);
    this.execItems(this.program.file.items, this.module);
  }

  /** Runs a pattern. With `finish`, the blurs around its `value` are put there, not done. */
  runPattern(
    items: Stmt[],
    name: string,
    seed: number | (() => number),
    canvas: Canvas,
    finish?: ((p: Picture) => Picture)[],
  ): void {
    // `random` draws from the recipe's seed, afresh for each picture (section 18.5).
    this.random = typeof seed === "number" ? mulberry32(seed) : seed;
    this.canvas = canvas;
    const env = new Env(undefined);
    this.bindGenes(env, `pattern:${name}`);
    const inner = new Env(env);
    const last = items[items.length - 1];
    if (finish === undefined || last?.kind !== "Value") {
      this.execItems(items, inner);
      return;
    }
    this.execItems(items.slice(0, -1), inner);
    this.tick(last.span);
    this.value = this.holdingFinish(last.value, inner, finish);
  }

  /**
   * A pattern's `value`, without the `blur` and `zoom_blur` calls wrapped around it, which go into
   * `finish`. Everything is worked out in the order it would be anyway, so random numbers drawn in
   * their arguments stay the same.
   */
  private holdingFinish(e: Expr, env: Env, finish: ((p: Picture) => Picture)[]): Value {
    if (
      e.kind !== "Call" ||
      e.callee.kind !== "Name" ||
      !FINISHES.has(e.callee.name) ||
      env.lookup(e.callee.name) !== undefined ||
      this.program.functions.has(e.callee.name) ||
      e.args.length === 0
    ) {
      return this.eval(e, env);
    }
    const builtin = PICTURE_FUNCTIONS.get(e.callee.name)!;
    const inner = this.holdingFinish(e.args[0]!, env, finish);
    const rest = e.args.slice(1).map((a) => this.eval(a, env));
    const context = this.builtinContext();
    finish.push((p) => builtin.call([p, ...rest], context) as Picture);
    return inner;
  }

  runSection(items: Stmt[], section: "background" | "dance"): void {
    this.startRandom();
    const env = new Env(undefined);
    this.bindGenes(env, section);
    this.execItems(items, new Env(env));
  }

  // ---------- statements ----------

  private tick(span: Span): void {
    if (++this.steps > this.limits.steps) {
      throw new LimitReached(
        span,
        `The build stopped after ${this.limits.steps.toLocaleString("en")} steps. Is there a loop that never ends?`,
      );
    }
  }

  /**
   * Runs statements in order until one returns. Like expressions, a list of statements is turned
   * once into a function that runs them (see `compileItems`), kept on the list.
   */
  private execItems(items: Stmt[], env: Env): ReturnSignal | undefined {
    let c = (items as { [COMPILED]?: Exec })[COMPILED];
    if (c === undefined) {
      c = Run.compileItems(items);
      Object.defineProperty(items, COMPILED, { value: c });
    }
    return c(this, env);
  }

  /** Statements as one function that runs each in turn, stopping at a `return`. */
  private static compileItems(items: Stmt[]): Exec {
    const execs = items.map((s) => Run.compileStatement(s));
    const n = execs.length;
    if (n === 1) return execs[0]!;
    return (r, env) => {
      for (let i = 0; i < n; i++) {
        const done = execs[i]!(r, env);
        if (done) return done;
      }
      return undefined;
    };
  }

  /** A block's statements as a function that runs them in a scope of their own. */
  private static compileBlock(block: Block): Exec {
    const items = Run.compileItems(block.items);
    return (r, env) => items(r, new Env(env));
  }

  /**
   * A statement as a function that runs it exactly as `execTree` does, counting the same steps
   * and giving the same errors. The common kinds are done here; the rest go to `execTree`.
   */
  private static compileStatement(s: Stmt): Exec {
    const span = s.span;
    switch (s.kind) {
      case "Gene":
      case "Part":
      case "Function":
      case "Background":
      case "Dance":
      case "Variant":
      case "Breed":
      case "GeneSetting":
      case "Pattern":
      case "ErrorStmt":
        return (r) => {
          r.tick(span);
          return undefined;
        };
      case "Let": {
        const name = s.name;
        const value = Run.compile(s.value);
        return (r, env) => {
          r.tick(span);
          env.set(name, { value: value(r, env), mutable: true });
          return undefined;
        };
      }
      case "Assign": {
        const { name, nameSpan } = s;
        const value = Run.compile(s.value);
        const op = s.op === "=" ? undefined : (s.op[0] as "+" | "-" | "*" | "/");
        return (r, env) => {
          r.tick(span);
          const v = value(r, env);
          const b = env.lookup(name);
          if (b === undefined) throw new RuntimeError(nameSpan, r.unsetMessage(name));
          if (op === undefined) b.value = v;
          else {
            try {
              b.value = binaryOp(op, b.value, v);
            } catch (err) {
              throw located(err, span);
            }
          }
          return undefined;
        };
      }
      case "PartCall": {
        const { name, nameSpan } = s;
        const args = s.args.map((a) => Run.compile(a));
        return (r, env) => {
          r.tick(span);
          const values = new Array<Value>(args.length);
          for (let i = 0; i < args.length; i++) values[i] = args[i]!(r, env);
          r.callPart(name, values, nameSpan, env);
          return undefined;
        };
      }
      case "Return": {
        const value = s.value ? Run.compile(s.value) : undefined;
        return (r, env) => {
          r.tick(span);
          return new ReturnSignal(value ? value(r, env) : undefined);
        };
      }
      case "If": {
        const conditions = s.branches.map((b) => Run.compileBool(b.condition, "A condition"));
        const blocks = s.branches.map((b) => Run.compileBlock(b.block));
        const otherwise = s.elseBlock ? Run.compileBlock(s.elseBlock) : undefined;
        const n = conditions.length;
        return (r, env) => {
          r.tick(span);
          for (let i = 0; i < n; i++) {
            if (conditions[i]!(r, env)) return blocks[i]!(r, env);
          }
          return otherwise ? otherwise(r, env) : undefined;
        };
      }
      case "Repeat": {
        const count = Run.compileNumber(s.count, "`repeat`");
        const items = Run.compileItems(s.block.items);
        const as = s.as?.name;
        return (r, env) => {
          r.tick(span);
          const n = roundHalfUp(count(r, env));
          for (let k = 0; k < n; k++) {
            r.tick(span);
            const inner = new Env(env);
            if (as !== undefined) inner.set(as, { value: k, mutable: false });
            const done = items(r, inner);
            if (done) return done;
          }
          return undefined;
        };
      }
      case "For": {
        const from = Run.compileNumber(s.from, "`for`");
        const to = Run.compileNumber(s.to, "`for`");
        const by = s.by ? Run.compileNumber(s.by, "`for`") : undefined;
        const bySpan = s.by?.span;
        const items = Run.compileItems(s.block.items);
        const name = s.variable.name;
        return (r, env) => {
          r.tick(span);
          const a = from(r, env);
          const b = to(r, env);
          const step = by ? by(r, env) : 1;
          if (step === 0) throw new RuntimeError(bySpan!, "`by 0` would never finish.");
          for (let k = 0; ; k++) {
            const v = a + k * step;
            if (step > 0 ? v > b : v < b) break;
            r.tick(span);
            const inner = new Env(env);
            inner.set(name, { value: v, mutable: false });
            const done = items(r, inner);
            if (done) return done;
          }
          return undefined;
        };
      }
      case "Branch": {
        const block = Run.compileBlock(s.block);
        return (r, env) => {
          r.tick(span);
          const saved = cloneState(r.state);
          try {
            return block(r, env);
          } finally {
            r.record("return", r.state.turtle.pos, saved.turtle.pos, span);
            r.state = saved;
          }
        };
      }
      case "Lay": {
        if (s.block === undefined) {
          return (r) => {
            r.tick(span);
            r.lay(span);
            return undefined;
          };
        }
        const block = Run.compileBlock(s.block);
        return (r, env) => {
          r.tick(span);
          const saved = cloneFrame(r.state.shapeFrame);
          r.shapeMode++;
          let done;
          try {
            done = block(r, env);
          } finally {
            r.shapeMode--;
          }
          // A `return` inside leaves the part straight away, without laying the shape.
          if (done) return done;
          r.lay(span);
          r.state.shapeFrame = saved;
          return undefined;
        };
      }
      case "Stroke": {
        const block = Run.compileBlock(s.block);
        return (r, env) => {
          r.tick(span);
          const points: StrokePoint[] = [];
          r.strokes.push(points);
          try {
            return block(r, env);
          } finally {
            r.endStroke(points);
          }
        };
      }
      case "Command": {
        const value = s.value;
        switch (s.command) {
          case "forward":
          case "back": {
            const d = Run.compileNumber(value, `\`${s.command}\``);
            const sign = s.command === "forward" ? 1 : -1;
            return (r, env) => {
              r.tick(span);
              const f = r.frame();
              r.walk(f, [0, 0, sign * d(r, env)], span);
              return undefined;
            };
          }
          case "move": {
            const v = Run.compileVector(value, "`move`");
            return (r, env) => {
              r.tick(span);
              const f = r.frame();
              r.walk(f, v(r, env), span);
              return undefined;
            };
          }
          case "pitch":
          case "yaw":
          case "roll": {
            const a = Run.compileNumber(value, `\`${s.command}\``);
            const axis = s.command === "pitch" ? 0 : s.command === "yaw" ? 1 : 2;
            return (r, env) => {
              r.tick(span);
              const f = r.frame();
              turn(f, axis, a(r, env));
              return undefined;
            };
          }
          case "grow": {
            const g = Run.compile(value);
            return (r, env) => {
              r.tick(span);
              const f = r.frame();
              const v = g(r, env);
              if (typeof v === "number") grow(f, [v, v, v]);
              else if (isVec(v)) grow(f, [v.x, v.y, v.z]);
              else
                throw new RuntimeError(
                  value.span,
                  `\`grow\` needs a number or a vector, not ${typeLabel(typeOf(v))}.`,
                );
              return undefined;
            };
          }
        }
        break;
      }
      case "Rotate": {
        const angle = Run.compileNumber(s.angle, "`rotate`");
        const axis = Run.compileVector(s.axis, "`around`");
        return (r, env) => {
          r.tick(span);
          const a = angle(r, env);
          rotateAround(r.frame(), axis(r, env), a);
          return undefined;
        };
      }
      case "Material":
        return (r, env) => {
          r.tick(span);
          r.material(s, env);
          return undefined;
        };
    }
    return (r, env) => r.execTree(s, env);
  }

  private execBlock(block: Block, env: Env, setup?: (env: Env) => void): ReturnSignal | undefined {
    const inner = new Env(env);
    setup?.(inner);
    return this.execItems(block.items, inner);
  }

  /** The values of a call's arguments. */
  private evalAll(args: Expr[], env: Env): Value[] {
    const values = new Array<Value>(args.length);
    for (let i = 0; i < args.length; i++) values[i] = this.eval(args[i]!, env);
    return values;
  }

  /** The frame that turtle commands act on: the shape transform inside reshape and lay blocks. */
  private frame(): Frame {
    return this.shapeMode > 0 ? this.state.shapeFrame : this.state.turtle;
  }

  /** Runs a statement by walking its tree; a `return` comes back as its signal. */
  private execTree(s: Stmt, env: Env): ReturnSignal | undefined {
    this.tick(s.span);
    switch (s.kind) {
      case "Gene":
      case "Part":
      case "Function":
      case "Background":
      case "Dance":
      case "Variant":
      case "Breed":
      case "GeneSetting":
      case "Pattern":
      case "ErrorStmt":
        return;
      case "Value":
        this.value = this.eval(s.value, env);
        return;
      case "Effect":
        this.effect(s, env);
        return;
      case "Let":
        env.set(s.name, { value: this.eval(s.value, env), mutable: true });
        return;
      case "Assign": {
        const value = this.eval(s.value, env);
        const b = env.lookup(s.name);
        if (b === undefined) throw new RuntimeError(s.nameSpan, this.unsetMessage(s.name));
        if (s.op === "=") b.value = value;
        else {
          const op = s.op[0] as "+" | "-" | "*" | "/";
          try {
            b.value = binaryOp(op, b.value, value);
          } catch (err) {
            throw located(err, s.span);
          }
        }
        return;
      }
      case "PartCall":
        this.callPart(s.name, this.evalAll(s.args, env), s.nameSpan, env);
        return;
      case "Return":
        return new ReturnSignal(s.value ? this.eval(s.value, env) : undefined);
      case "Print":
        this.printed.push(s.args.map((a) => formatValue(this.eval(a, env))).join(" "));
        return;
      case "If": {
        for (const b of s.branches) {
          if (this.bool(b.condition, env, "A condition")) return this.execBlock(b.block, env);
        }
        if (s.elseBlock) return this.execBlock(s.elseBlock, env);
        return;
      }
      case "Repeat": {
        const n = roundHalfUp(this.num(s.count, env, "`repeat`"));
        for (let k = 0; k < n; k++) {
          this.tick(s.span);
          const inner = new Env(env);
          if (s.as) inner.set(s.as.name, { value: k, mutable: false });
          const done = this.execItems(s.block.items, inner);
          if (done) return done;
        }
        return;
      }
      case "For": {
        const from = this.num(s.from, env, "`for`");
        const to = this.num(s.to, env, "`for`");
        const by = s.by ? this.num(s.by, env, "`for`") : 1;
        if (by === 0) throw new RuntimeError(s.by!.span, "`by 0` would never finish.");
        for (let k = 0; ; k++) {
          const v = from + k * by;
          if (by > 0 ? v > to : v < to) break;
          this.tick(s.span);
          const inner = new Env(env);
          inner.set(s.variable.name, { value: v, mutable: false });
          const done = this.execItems(s.block.items, inner);
          if (done) return done;
        }
        return;
      }
      case "While":
        while (this.bool(s.condition, env, "A condition")) {
          this.tick(s.span);
          const done = this.execBlock(s.block, env);
          if (done) return done;
        }
        return;
      case "Branch":
        return this.branch(s.span, () => this.execBlock(s.block, env));
      case "Symmetric": {
        const axis = { x: 0, y: 1, z: 2 }[s.axis];
        const flip: V3 = [1, 1, 1];
        flip[axis] = -1;
        const done = this.branch(s.span, () =>
          this.execBlock(s.block, env, (inner) => inner.set("side", { value: 1, mutable: false })),
        );
        if (done) return done;
        return this.branch(s.span, () => {
          grow(this.state.turtle, flip);
          return this.execBlock(s.block, env, (inner) =>
            inner.set("side", { value: -1, mutable: false }),
          );
        });
      }
      case "Lay": {
        if (s.block === undefined) {
          this.lay(s.span);
          return;
        }
        const saved = cloneFrame(this.state.shapeFrame);
        this.shapeMode++;
        let done;
        try {
          done = this.execBlock(s.block, env);
        } finally {
          this.shapeMode--;
        }
        // A `return` inside leaves the part straight away, without laying the shape.
        if (done) return done;
        this.lay(s.span);
        this.state.shapeFrame = saved;
        return;
      }
      case "FocusPoint": {
        const [x, y, z] = this.state.turtle.pos;
        // Like a shape whose placement isn't finite, a focus point that isn't is left out.
        if ([x, y, z].every(Number.isFinite)) this.focus = [x, y, z];
        return;
      }
      case "Reshape":
        this.shapeMode++;
        try {
          return this.execBlock(s.block, env);
        } finally {
          this.shapeMode--;
        }
      case "Stroke": {
        const points: StrokePoint[] = [];
        this.strokes.push(points);
        try {
          return this.execBlock(s.block, env);
        } finally {
          this.endStroke(points);
        }
      }
      case "Command": {
        const f = this.frame();
        switch (s.command) {
          case "forward":
            this.walk(f, [0, 0, this.num(s.value, env, "`forward`")], s.span);
            return;
          case "back":
            this.walk(f, [0, 0, -this.num(s.value, env, "`back`")], s.span);
            return;
          case "move":
            this.walk(f, this.vector(s.value, env, "`move`"), s.span);
            return;
          case "pitch":
            turn(f, 0, this.num(s.value, env, "`pitch`"));
            return;
          case "yaw":
            turn(f, 1, this.num(s.value, env, "`yaw`"));
            return;
          case "roll":
            turn(f, 2, this.num(s.value, env, "`roll`"));
            return;
          case "grow": {
            const v = this.eval(s.value, env);
            if (typeof v === "number") grow(f, [v, v, v]);
            else if (isVec(v)) grow(f, [v.x, v.y, v.z]);
            else
              throw new RuntimeError(
                s.value.span,
                `\`grow\` needs a number or a vector, not ${typeLabel(typeOf(v))}.`,
              );
            return;
          }
        }
        return;
      }
      case "Rotate": {
        const angle = this.num(s.angle, env, "`rotate`");
        rotateAround(this.frame(), this.vector(s.axis, env, "`around`"), angle);
        return;
      }
      case "Mirror": {
        const flip: V3 = [1, 1, 1];
        flip[{ x: 0, y: 1, z: 2 }[s.axis]] = -1;
        grow(this.frame(), flip);
        return;
      }
      case "Material":
        this.material(s, env);
        return;
      case "Fill": {
        const v = this.eval(s.value, env);
        this.fill = typeof v === "object" && v.type === "pattern" ? this.withSource(v) : v;
        return;
      }
    }
  }

  /** An effect line's values, each under the word before it; the lead word's under `input`. */
  private effect(s: Extract<Stmt, { kind: "Effect" }>, env: Env): void {
    const settings = new Map<string, number>();
    let when: TriggerKind | undefined;
    const flags = new Set<string>();
    s.args.forEach((a, i) => {
      if (a.kind === "Word") {
        if (TRIGGER_KINDS.has(a.text)) when = a.text as TriggerKind;
        else if (EFFECT_FLAGS.has(a.text)) flags.add(a.text);
        return;
      }
      const word = s.args[i - 1]!;
      const name = word.kind === "Word" ? word.text : "";
      settings.set(i === 1 ? "input" : name, this.num(a.expr, env, `\`${name}\``));
    });
    this.effects.push({ name: s.name, settings, when, flags });
  }

  private material(s: Extract<Stmt, { kind: "Material" }>, env: Env): void {
    const v = this.eval(s.value, env);
    const wrong = (what: string): never => {
      throw new RuntimeError(
        s.value.span,
        `\`${s.keyword}\` needs ${what}, not ${typeLabel(typeOf(v))}.`,
      );
    };
    switch (s.property) {
      case "shape":
        if (typeof v === "number") this.state.shape = SHAPES[Math.abs(roundHalfUp(v)) % 6]!;
        else if (typeof v === "object" && v.type === "shape") this.state.shape = v.name;
        else wrong("a shape or a number");
        return;
      case "colour":
        if (!isColour(v)) wrong("a colour");
        this.state.colour = v as Colour;
        return;
      case "shine":
      case "sharpness":
      case "wear":
        if (typeof v !== "number") return wrong("a number");
        this.state[s.property] = Math.min(1, Math.max(0, v));
        return;
      case "texture":
        if (typeof v !== "object" || v.type !== "pattern") return wrong("a pattern");
        this.state.texture = v.kind === null ? null : this.withSource(v);
        return;
    }
  }

  /** Ends the innermost stroke, laying it if it has points to join. */
  private endStroke(points: StrokePoint[]): void {
    this.strokes.pop();
    // A stroke with fewer than two points has nothing to join, so it draws nothing.
    const first = points[0];
    if (first && points.length >= 2) {
      this.shapes.push({
        shape: "stroke",
        matrix: first.matrix,
        colour: first.colour,
        shine: first.shine,
        sharpness: first.sharpness,
        texture: null,
        wear: 0,
        mirrored: false,
        points,
      });
    }
  }

  private branch<T>(span: Span, f: () => T): T {
    const saved = cloneState(this.state);
    try {
      return f();
    } finally {
      this.record("return", this.state.turtle.pos, saved.turtle.pos, span);
      this.state = saved;
    }
  }

  /** Moves the frame; a move of the turtle (not of a shape in `lay`) is part of its path. */
  private walk(f: Frame, local: V3, span: Span): void {
    if (!this.options.trace) {
      move(f, local);
      return;
    }
    const from: V3 = [f.pos[0], f.pos[1], f.pos[2]];
    move(f, local);
    if (f === this.state.turtle) this.record("move", from, f.pos, span);
  }

  private record(kind: PathStep["kind"], from: V3, to: V3, span: Span): void {
    if (!this.options.trace || this.path.length >= this.limits.shapes) return;
    if (from[0] === to[0] && from[1] === to[1] && from[2] === to[2]) return;
    if (![...from, ...to].every(Number.isFinite)) return;
    this.path.push({ kind, from: [...from], to: [...to], span });
  }

  private lay(span: Span): void {
    if (this.shapes.length + this.strokePoints >= this.limits.shapes) {
      throw new LimitReached(
        span,
        `The build stopped at ${this.limits.shapes.toLocaleString("en")} shapes, the most a creature can have.`,
      );
    }
    const st = this.state;
    const matrix = multiply(frameMatrix(st.turtle), frameMatrix(st.shapeFrame));
    if (!matrix.every(Number.isFinite)) {
      this.skipped++;
      this.skippedSpan ??= span;
      return;
    }
    const stroke = this.strokes[this.strokes.length - 1];
    if (stroke) {
      stroke.push({ matrix, colour: st.colour, shine: st.shine, sharpness: st.sharpness });
      this.strokePoints++;
      return;
    }
    this.shapes.push({
      shape: st.shape,
      matrix,
      colour: st.colour,
      shine: st.shine,
      sharpness: st.sharpness,
      texture: st.texture,
      wear: st.wear,
      mirrored: st.turtle.mirrored !== st.shapeFrame.mirrored,
    });
  }

  // ---------- calls ----------

  private enter(span: Span): void {
    if (++this.depth > this.limits.depth) {
      throw new LimitReached(
        span,
        `The build stopped: parts and functions were nested more than ${this.limits.depth} deep.`,
      );
    }
  }

  private bindParams(env: Env, decl: PartDecl | FunctionDecl, args: Value[]): void {
    const params = decl.params;
    for (let i = 0; i < params.length; i++) {
      env.set(params[i]!.name, { value: args[i]!, mutable: true });
    }
  }

  private callPart(name: string, args: Value[], span: Span, env: Env): void {
    let partName = name;
    const b = env.lookup(name);
    if (b && typeof b.value === "object" && b.value.type === "part") partName = b.value.name;
    const decl = this.program.parts.get(partName);
    if (decl === undefined) throw new RuntimeError(span, `There's no part called \`${partName}\`.`);
    this.enter(span);
    const callEnv = new Env(this.module);
    this.bindParams(callEnv, decl, args);
    this.bindGenes(callEnv, decl.name);
    try {
      this.execItems(decl.body.items, callEnv);
    } finally {
      this.depth--;
    }
  }

  private callFunction(decl: FunctionDecl, args: Value[], span: Span): Value {
    this.enter(span);
    const callEnv = new Env(this.module);
    this.bindParams(callEnv, decl, args);
    this.bindGenes(callEnv, decl.name);
    let done;
    try {
      done = this.execItems(decl.body.items, callEnv);
    } finally {
      this.depth--;
    }
    if (done?.value !== undefined) return done.value;
    throw new RuntimeError(
      decl.nameSpan,
      `The function \`${decl.name}\` ended without returning a value.`,
    );
  }

  // ---------- expressions ----------

  private guard<T>(span: Span, f: () => T): T {
    try {
      return f();
    } catch (e) {
      throw located(e, span);
    }
  }

  private unsetMessage(name: string): string {
    return this.globals.has(name)
      ? `\`${name}\` hasn't been given a value yet: its \`let\` hasn't run.`
      : `There's nothing called \`${name}\`.`;
  }

  private num(e: Expr, env: Env, what: string): number {
    const v = this.eval(e, env);
    if (typeof v !== "number")
      throw new RuntimeError(e.span, `${what} needs a number, not ${typeLabel(typeOf(v))}.`);
    return v;
  }

  private bool(e: Expr, env: Env, what: string): boolean {
    const v = this.eval(e, env);
    if (typeof v !== "boolean")
      throw new RuntimeError(e.span, `${what} must be a bool, not ${typeLabel(typeOf(v))}.`);
    return v;
  }

  private vector(e: Expr, env: Env, what: string): V3 {
    const v = this.eval(e, env);
    if (!isVec(v))
      throw new RuntimeError(e.span, `${what} needs a vector, not ${typeLabel(typeOf(v))}.`);
    return [v.x, v.y, v.z];
  }

  /**
   * Works out an expression. Each expression is turned once into a JavaScript function that
   * works it out (see `compile`), which runs much faster than walking the tree every time.
   */
  private eval(e: Expr, env: Env): Value {
    let c = (e as { [COMPILED]?: Compiled })[COMPILED];
    if (c === undefined) {
      c = Run.compile(e);
      // Hidden from equality checks and JSON, so the tree reads as it did.
      Object.defineProperty(e, COMPILED, { value: c });
    }
    return c(this, env);
  }

  /**
   * An expression as a function that works it out exactly as `evalTree` does, counting the same
   * steps and giving the same errors, with its parts already turned into functions. The common
   * kinds are done here; the rest go to `evalTree`.
   */
  private static compile(e: Expr): Compiled {
    switch (e.kind) {
      case "Number":
      case "Bool": {
        const value = e.value;
        const span = e.span;
        return (r) => {
          r.tick(span);
          return value;
        };
      }
      case "Name": {
        const { name, span } = e;
        return (r, env) => {
          r.tick(span);
          const b = env.lookup(name);
          if (b) return b.value;
          if (r.program.patterns.has(name)) return { type: "patternKind", name };
          const c = BUILTIN_CONSTANTS.get(name);
          if (c !== undefined) return c;
          throw new RuntimeError(span, r.unsetMessage(name));
        };
      }
      case "Turtle": {
        const { field, span } = e;
        return (r) => {
          r.tick(span);
          return r.turtleField(field, span);
        };
      }
      case "Time":
        return (r) => {
          r.tick(e.span);
          return r.inputs.time;
        };
      case "Vector": {
        const x = Run.compileNumber(e.x, "A vector");
        const y = Run.compileNumber(e.y, "A vector");
        const z = Run.compileNumber(e.z, "A vector");
        return (r, env) => {
          r.tick(e.span);
          return vec(x(r, env), y(r, env), z(r, env));
        };
      }
      case "Unary": {
        const operand = Run.compile(e.operand);
        const minus = e.op === "-";
        return (r, env) => {
          r.tick(e.span);
          const v = operand(r, env);
          try {
            return minus ? negate(v) : not(v);
          } catch (err) {
            throw located(err, e.span);
          }
        };
      }
      case "Binary": {
        const { op, opSpan } = e;
        if (op === "and" || op === "or") {
          const left = Run.compileBool(e.left, `The left side of \`${op}\``);
          const right = Run.compileBool(e.right, `The right side of \`${op}\``);
          const and = op === "and";
          return (r, env) => {
            r.tick(e.span);
            const l = left(r, env);
            if (and ? !l : l) return l;
            return right(r, env);
          };
        }
        const left = Run.compile(e.left);
        const right = Run.compile(e.right);
        return (r, env) => {
          r.tick(e.span);
          const a = left(r, env);
          const b = right(r, env);
          try {
            return binaryOp(op, a, b);
          } catch (err) {
            throw located(err, opSpan);
          }
        };
      }
      case "Member": {
        const object = Run.compile(e.object);
        const { name, nameSpan } = e;
        return (r, env) => {
          r.tick(e.span);
          const v = object(r, env);
          try {
            return member(v, name);
          } catch (err) {
            throw located(err, nameSpan);
          }
        };
      }
      case "Call": {
        const callee = e.callee;
        if (callee.kind !== "Name") break;
        const name = callee.name;
        const args = e.args.map((a) => Run.compile(a));
        const evalArgs = (r: Run, env: Env): Value[] => {
          const values = new Array<Value>(args.length);
          for (let i = 0; i < args.length; i++) values[i] = args[i]!(r, env);
          return values;
        };
        // What the name means doesn't change within a program, so it's looked up once for each.
        let program: CheckResult | undefined;
        let fn: FunctionDecl | undefined;
        const builtin = BUILTIN_FUNCTIONS.get(name);
        const picture = PICTURE_FUNCTIONS.get(name);
        return (r, env) => {
          r.tick(e.span);
          if (env.lookup(name) === undefined) {
            if (r.program !== program) {
              program = r.program;
              fn = program.functions.get(name);
            }
            if (fn) return r.callFunction(fn, evalArgs(r, env), callee.span);
            const f = builtin ?? (r.canvas ? picture : undefined);
            if (f) {
              const values = evalArgs(r, env);
              try {
                return f.call(values, r.builtinContext());
              } catch (err) {
                throw located(err, e.span);
              }
            }
          }
          return r.callValue(e, env);
        };
      }
    }
    return (r, env) => r.evalTree(e, env);
  }

  /** `compile` for a value that must be a number, with `num`'s error. */
  private static compileNumber(e: Expr, what: string): (r: Run, env: Env) => number {
    const f = Run.compile(e);
    return (r, env) => {
      const v = f(r, env);
      if (typeof v !== "number")
        throw new RuntimeError(e.span, `${what} needs a number, not ${typeLabel(typeOf(v))}.`);
      return v;
    };
  }

  /** `compile` for a value that must be a vector, with `vector`'s error. */
  private static compileVector(e: Expr, what: string): (r: Run, env: Env) => V3 {
    const f = Run.compile(e);
    return (r, env) => {
      const v = f(r, env);
      if (!isVec(v))
        throw new RuntimeError(e.span, `${what} needs a vector, not ${typeLabel(typeOf(v))}.`);
      return [v.x, v.y, v.z];
    };
  }

  /** `compile` for a value that must be a bool, with `bool`'s error. */
  private static compileBool(e: Expr, what: string): (r: Run, env: Env) => boolean {
    const f = Run.compile(e);
    return (r, env) => {
      const v = f(r, env);
      if (typeof v !== "boolean")
        throw new RuntimeError(e.span, `${what} must be a bool, not ${typeLabel(typeOf(v))}.`);
      return v;
    };
  }

  /** Works out an expression by walking its tree. */
  private evalTree(e: Expr, env: Env): Value {
    this.tick(e.span);
    switch (e.kind) {
      case "Number":
        return e.value;
      case "Bool":
        return e.value;
      case "String":
        return e.value;
      case "Hex":
        return this.guard(e.span, () => hexColour(e.raw));
      case "Name": {
        const b = env.lookup(e.name);
        if (b) return b.value;
        if (this.program.patterns.has(e.name)) return { type: "patternKind", name: e.name };
        const c = BUILTIN_CONSTANTS.get(e.name);
        if (c !== undefined) return c;
        throw new RuntimeError(e.span, this.unsetMessage(e.name));
      }
      case "Turtle":
        return this.turtleField(e.field, e.span);
      case "Time":
        return this.inputs.time;
      case "Beat":
        return this.inputs.beat;
      case "Music":
        return this.inputs.music[e.field as keyof MusicInputs];
      case "Vector":
        return vec(
          this.num(e.x, env, "A vector"),
          this.num(e.y, env, "A vector"),
          this.num(e.z, env, "A vector"),
        );
      case "Unary": {
        const v = this.eval(e.operand, env);
        try {
          return e.op === "-" ? negate(v) : not(v);
        } catch (err) {
          throw located(err, e.span);
        }
      }
      case "Binary": {
        if (e.op === "and" || e.op === "or") {
          const left = this.bool(e.left, env, `The left side of \`${e.op}\``);
          if (e.op === "and" ? !left : left) return left;
          return this.bool(e.right, env, `The right side of \`${e.op}\``);
        }
        const a = this.eval(e.left, env);
        const b = this.eval(e.right, env);
        try {
          return binaryOp(e.op, a, b);
        } catch (err) {
          throw located(err, e.opSpan);
        }
      }
      case "Member": {
        const v = this.eval(e.object, env);
        try {
          return member(v, e.name);
        } catch (err) {
          throw located(err, e.nameSpan);
        }
      }
      case "Call":
        return this.call(e, env);
      case "Gradient": {
        const stops = e.stops.map((s) => {
          const colour = this.eval(s.colour, env);
          if (!isColour(colour))
            throw new RuntimeError(
              s.colour.span,
              `A gradient is made of colours, not ${typeLabel(typeOf(colour))}.`,
            );
          return { colour, at: s.at ? this.num(s.at, env, "A gradient position") : undefined };
        });
        return this.guard(e.span, () => makeGradient(stops, e.straight));
      }
      case "List":
        return { type: "list", items: e.items.map((item) => this.eval(item, env)) };
      case "Index":
        return itemOf(this.eval(e.object, env), this.eval(e.index, env), e);
      case "Picture":
        return this.picture(e, env);
      case "ErrorExpr":
        throw new RuntimeError(e.span, "This expression couldn't be read.");
    }
  }

  private call(e: Extract<Expr, { kind: "Call" }>, env: Env): Value {
    const callee = e.callee;
    if (callee.kind === "Name" && env.lookup(callee.name) === undefined) {
      const fn = this.program.functions.get(callee.name);
      if (fn) return this.callFunction(fn, this.evalAll(e.args, env), callee.span);
      const builtin =
        BUILTIN_FUNCTIONS.get(callee.name) ??
        (this.canvas ? PICTURE_FUNCTIONS.get(callee.name) : undefined);
      if (builtin) {
        const args = this.evalAll(e.args, env);
        try {
          return builtin.call(args, this.builtinContext());
        } catch (err) {
          throw located(err, e.span);
        }
      }
    }
    return this.callValue(e, env);
  }

  /** A call of something that isn't a function by name: a picture or gradient being sampled. */
  private callValue(e: Extract<Expr, { kind: "Call" }>, env: Env): Value {
    const callee = e.callee;
    const target = this.eval(callee, env);
    if (isPicture(target)) {
      return samplePicture(
        target,
        e.args.map((a) => this.num(a, env, "A point in a picture")),
      );
    }
    if (typeof target !== "object" || target.type !== "gradient") {
      throw new RuntimeError(
        callee.span,
        `${typeLabel(typeOf(target))} can't be called or sampled.`,
      );
    }
    const t = this.num(e.args[0]!, env, "A gradient position");
    return sampleGradient(target, t);
  }

  /** Kept while it's still right, as built-ins are called thousands of times a build. */
  private context: BuiltinContext | undefined;

  private builtinContext(): BuiltinContext {
    const c = this.context;
    if (c !== undefined && c.random === this.random && c.pictureSize === this.canvas?.size) {
      return c;
    }
    return (this.context = this.canvas
      ? { random: this.random, pictureSize: this.canvas.size }
      : { random: this.random });
  }

  /** A recipe of a pattern written in GenoCode carries the pattern, so it can be drawn anywhere. */
  private withSource(p: Pattern): Pattern {
    const source = (kind: string | null) =>
      kind === null || isBuiltinKind(kind) ? undefined : this.source(kind);
    const first = source(p.kind);
    const out: Pattern = first ? { ...p, source: first } : p;
    if (p.mix) {
      const second = source(p.mix.kind);
      if (second) return { ...out, mix: { ...p.mix, source: second } };
    }
    return out;
  }

  private source(name: string): PatternSource | undefined {
    let s = this.sources.get(name);
    if (s === undefined) {
      const text = patternFileText(this.program, name);
      if (text === undefined) return undefined;
      const genes = (this.genesByOwner.get(`pattern:${name}`) ?? []).map(
        (g) => [g.fullName, this.geneValue(g)!] as [string, Value],
      );
      s = { text, genes };
      this.sources.set(name, s);
    }
    return s;
  }

  /** `picture { … }`: its block, run for every pixel of the canvas (see pixels.ts). */
  private picture(e: Extract<Expr, { kind: "Picture" }>, env: Env): Picture {
    const canvas = this.canvas;
    if (!canvas) throw new RuntimeError(e.span, "`picture { }` can only be used in a pattern.");
    const last = e.body.items[e.body.items.length - 1];
    const valueSpan = last?.kind === "Value" ? last.value.span : e.span;
    try {
      const v = drawPixels(
        e.body,
        (name) => env.lookup(name)?.value,
        canvas,
        valueSpan,
        this.options.pixels,
      );
      return { type: "picture", size: canvas.size, v };
    } catch (err) {
      if (err instanceof PixelLimit) throw new LimitReached(err.span, err.message);
      if (err instanceof PixelError) throw new RuntimeError(err.span, err.message);
      throw err;
    }
  }

  private turtleField(field: string, span: Span): Value {
    const t = this.state.turtle;
    const v3 = (a: V3): Value => vec(a[0], a[1], a[2]);
    switch (field) {
      case "position":
        return v3(t.pos);
      case "side":
        return v3(t.ax[0]);
      case "up":
        return v3(t.ax[1]);
      case "heading":
        return v3(t.ax[2]);
      case "size":
        return v3(t.size);
      case "mirrored":
        return t.mirrored;
      case "shape":
        return { type: "shape", name: this.state.shape };
      case "colour":
      case "color":
        return this.state.colour;
      case "shine":
        return this.state.shine;
      case "sharpness":
        return this.state.sharpness;
      case "texture":
        return this.state.texture ?? NO_PATTERN;
      case "wear":
        return this.state.wear;
    }
    throw new RuntimeError(span, `The turtle has no \`${field}\`.`);
  }
}

/** Where a gene's value is bound: the creature's top level or a part, a section, or a pattern. */
function geneKey(g: GeneInfo): string | undefined {
  if (g.section === "creature") return g.owner;
  if (g.section === "pattern") return `pattern:${g.owner}`;
  return g.section;
}

/** `l[i]` (section 8.3). */
function itemOf(list: Value, index: Value, e: Extract<Expr, { kind: "Index" }>): Value {
  return listItem(list, index, (atIndex, message) => {
    throw new RuntimeError(atIndex ? e.index.span : e.object.span, message);
  });
}

function samplePicture(p: Picture, point: number[]): number {
  return sample(p.v, p.size, point[0]!, point[1]!);
}
