// Patterns: a designer for texture and background recipes (docs/LANGUAGE.md section 14). A big
// preview, a control for every part of the recipe, and a grid of variations to mutate and breed,
// as the Breed mode does for creatures. A recipe
// can be copied as code, put behind the creature as its background, or exported as a background
// file or a picture.

import {
  buildBackground,
  check,
  FINISHES,
  formatText,
  formatValue,
  isBuiltinKind,
  MIX_WAYS,
  NO_PATTERN,
  PATTERN_KINDS,
  SCHEMES,
  type MixWayName,
  type Pattern,
  type PatternSource,
  valuesOf,
} from "@genocode/core";
import { pixelsWhenReady } from "@genocode/render";

/** How big the preview is drawn: smaller while a control is dragged, so it keeps up. */
const PREVIEW_SIZE = 512;
const DRAGGING_SIZE = 256;
const VARIATION_SIZE = 128;
const VARIATIONS = 12;
/** How big an exported picture is. */
const EXPORT_SIZE = 1024;

/** The recipe the designer starts from, when the creature has no pattern of its own. */
export const DEFAULT_RECIPE: Pattern = {
  ...NO_PATTERN,
  kind: "kaleidoscope",
  hue: 47,
  seed: 35,
  scheme: "jewel",
  finish: "pearl",
  mix: { way: "blend", kind: "lightning", amount: 0.5 },
};

/** A pattern written in GenoCode, defined in the open file or kept in the library, which recipes
 * can use as a kind. */
export interface OwnPattern {
  name: string;
  source: PatternSource;
}

export interface PatternActions {
  /**
   * Puts this background source (the block's contents, one line each) behind the creature, with
   * the library's patterns it uses put into the creature first.
   */
  useAsBackground(lines: string[], patterns: OwnPattern[]): void;
}

const pick = <T>(options: readonly T[]): T => options[Math.floor(Math.random() * options.length)]!;
const wrapHue = (h: number) => Math.round(((h % 360) + 360) % 360);

/**
 * A variation on a recipe: each part may change, the hue only a little. A smaller `strength` makes
 * smaller, rarer changes. New kinds are picked from `kinds`.
 */
export function vary(p: Pattern, strength = 1, kinds: readonly string[] = PATTERN_KINDS): Pattern {
  const chance = (c: number) => Math.random() < c * strength;
  let mix = p.mix;
  if (chance(0.25)) {
    mix = chance(0.3)
      ? undefined
      : { way: pick(MIX_WAYS), kind: pick(kinds), amount: round2(Math.random()) };
  } else if (mix && chance(0.5)) {
    const nudge = (Math.random() - 0.5) * strength;
    mix = { ...mix, amount: round2(Math.min(1, Math.max(0, mix.amount + nudge))) };
  }
  return {
    ...p,
    kind: chance(0.25) ? pick(kinds) : p.kind,
    hue: wrapHue(p.hue + (Math.random() * 2 - 1) * 60 * strength),
    seed: chance(0.5) ? Math.floor(Math.random() * 100) : p.seed,
    scheme: chance(0.3) ? pick(SCHEMES) : p.scheme,
    finish: chance(0.3) ? pick(FINISHES) : p.finish,
    mix,
  };
}

/** A child of two recipes: each part from one parent or the other, the hue and amount blended. */
export function cross(a: Pattern, b: Pattern): Pattern {
  const either = <T>(x: T, y: T): T => (Math.random() < 0.5 ? x : y);
  // The hue goes the short way round the circle between the parents.
  const apart = ((((b.hue - a.hue) % 360) + 540) % 360) - 180;
  let mix = either(a.mix, b.mix);
  if (a.mix && b.mix) {
    const t = Math.random();
    mix = {
      way: either(a.mix.way, b.mix.way),
      kind: either(a.mix.kind, b.mix.kind),
      amount: round2(a.mix.amount + (b.mix.amount - a.mix.amount) * t),
    };
  }
  return {
    ...a,
    kind: either(a.kind, b.kind),
    hue: wrapHue(a.hue + apart * Math.random()),
    seed: either(a.seed, b.seed),
    scheme: either(a.scheme, b.scheme),
    finish: either(a.finish, b.finish),
    mix,
  };
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/**
 * A background holding a recipe, with each part of it a gene, so it can mutate and breed with
 * the creature: the lines of the block's contents. The kind genes choose from `kinds`, and the
 * recipe's own kinds.
 */
export function backgroundLines(p: Pattern, kinds: readonly string[] = PATTERN_KINDS): string[] {
  const list = (options: readonly string[]) => `[${options.join(", ")}]`;
  const kindList = list([...new Set([...kinds, p.kind ?? "aurora", p.mix?.kind ?? "vortex"])]);
  const lines = [
    `gene kind = ${p.kind} from ${kindList}`,
    `gene hue = ${p.hue} in 0..360`,
    `gene layout = ${p.seed} in 0..99 step 1`,
    `gene scheme = ${p.scheme} from ${list(SCHEMES)}`,
    `gene finish = ${p.finish} from ${list(FINISHES)}`,
  ];
  let fill = "pattern(kind, hue, layout, scheme, finish)";
  if (p.mix) {
    lines.push(
      `gene mixing = ${p.mix.way} from ${list(MIX_WAYS)}`,
      `gene other = ${p.mix.kind} from ${kindList}`,
      `gene amount = ${p.mix.amount} in 0..1`,
    );
    fill = `mixed(${fill}, mixing, other, amount)`;
  }
  return [...lines, "", `fill ${fill}`];
}

/**
 * The pattern a file's background shows: a background file's, or a creature's background block's,
 * with its genes as written. When there's none, `problem` says why.
 */
export function patternInFile(text: string): { pattern?: Pattern; problem?: string } {
  const program = check(text);
  const name = program.file.name || "That file";
  if (!program.ok) return { problem: `${name} has mistakes in it, so it can't be read.` };
  if (program.file.kind === "dance")
    return { problem: `${name} is a dance style, not a background.` };
  if (program.background === undefined) return { problem: `${name} has no background.` };
  const fill = buildBackground(program, { genes: valuesOf(program.genes) }).fill;
  if (typeof fill !== "object" || fill.type !== "pattern" || fill.kind === null) {
    return { problem: `${name}'s background is a colour or gradient, not a pattern.` };
  }
  return { pattern: fill };
}

/** Whether a recipe uses a pattern written in GenoCode, which a background file can't hold. */
export function usesOwnPattern(p: Pattern): boolean {
  return [p.kind, p.mix?.kind].some((k) => k != null && !isBuiltinKind(k));
}

/** A name for a recipe, such as Dusk_Aurora. */
export function recipeName(p: Pattern): string {
  const word = (s: string) => s[0]!.toUpperCase() + s.slice(1);
  return `${word(p.scheme)}_${word(p.kind ?? "pattern")}`;
}

/** A background file holding a recipe. */
export function backgroundFile(p: Pattern): string {
  const text = [
    `background ${recipeName(p)}`,
    `// Made in the Patterns designer: ${formatValue(p)}`,
    "",
    ...backgroundLines(p),
    "",
  ].join("\n");
  return formatText(text).text ?? text;
}

/**
 * The code with its background replaced by one holding these lines: the creature's background
 * block (added before its dance block or variants if it has none), or a background file's
 * contents. Undefined when the code has errors that hide where the background goes.
 */
export function withBackground(text: string, lines: string[]): string | undefined {
  return withDefinition(text, "background", lines);
}

/**
 * The code with its background or dance replaced by one holding these lines (docs/LANGUAGE.md
 * sections 15 and 17): the creature's block of that kind, or the contents of a file of that kind.
 * A creature without one gets it before its variants (and a background before its dance).
 * Undefined when the code has errors that hide where it goes.
 */
export function withDefinition(
  text: string,
  kind: "background" | "dance" | "pattern",
  lines: string[],
  name = "",
): string | undefined {
  const file = check(text).file;
  let out: string;
  if (file.kind === kind && (kind !== "pattern" || file.name === name)) {
    const first = file.items[0];
    if (!first) return undefined;
    out = text.slice(0, first.span.start) + lines.join("\n") + "\n";
  } else if (file.kind === "creature") {
    const header = kind === "pattern" ? `pattern ${name}` : kind;
    const block = [`${header} {`, ...lines.map((l) => (l ? `  ${l}` : "")), "}"].join("\n");
    // A pattern replaces the creature's pattern of the same name (section 14.1).
    const old = file.items.find((i) =>
      kind === "pattern"
        ? i.kind === "Pattern" && i.name === name
        : i.kind === (kind === "background" ? "Background" : "Dance"),
    );
    const before = file.items.find(
      (i) =>
        i.kind === "Variant" ||
        (kind !== "dance" && i.kind === "Dance") ||
        (kind === "pattern" && i.kind === "Background"),
    );
    if (old) out = text.slice(0, old.span.start) + block + text.slice(old.span.end);
    else if (before)
      out = `${text.slice(0, before.span.start)}${block}\n\n${text.slice(before.span.start)}`;
    else out = `${text.trimEnd()}\n\n${block}\n`;
  } else {
    return undefined;
  }
  return formatText(out).text ?? out;
}

/** The lines inside a background or dance file, below its header and description. */
export function definitionLines(text: string): string[] | undefined {
  const first = check(text).file.items[0];
  return first ? text.slice(first.span.start).trimEnd().split("\n") : undefined;
}

/** The latest picture asked of each canvas, so one that arrives late isn't drawn over it. */
const latest = new WeakMap<HTMLCanvasElement, Pattern>();

/** Draws a recipe into a canvas once its picture is ready (pictures are drawn in web workers). */
async function drawInto(target: HTMLCanvasElement, p: Pattern, size: number): Promise<void> {
  latest.set(target, p);
  const pixels = await pixelsWhenReady(p, size);
  if (latest.get(target) !== p) return;
  target.width = size;
  target.height = size;
  const ctx = target.getContext("2d")!;
  ctx.putImageData(new ImageData(pixels, size, size), 0, 0);
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
}

function choice<T extends string>(options: readonly T[], extra?: string): HTMLSelectElement {
  const select = element("select");
  if (extra !== undefined) select.append(element("option", { value: "", textContent: extra }));
  for (const o of options) select.append(element("option", { value: o, textContent: o }));
  return select;
}

/** Fills a kind menu: the built-in kinds, then the file's own patterns and the library's, each in
 * a group of their own. */
function kindOptions(
  select: HTMLSelectElement,
  own: readonly string[],
  library: readonly string[],
): void {
  const option = (o: string) => element("option", { value: o, textContent: o });
  select.replaceChildren(...PATTERN_KINDS.map(option));
  const group = (label: string, names: readonly string[]) => {
    if (names.length > 0) select.append(element("optgroup", { label }, ...names.map(option)));
  };
  group("In this file", own);
  group("In your library", library);
}

function slider(min: number, max: number, step: number): HTMLInputElement {
  return element("input", {
    type: "range",
    min: String(min),
    max: String(max),
    step: String(step),
  });
}

export class PatternDesigner {
  private recipe: Pattern = DEFAULT_RECIPE;
  private readonly preview = element("canvas", { className: "pattern-preview" });
  private readonly variations = element("div", { className: "pattern-variations" });
  /** The recipes in the grid, and which are chosen as parents. */
  private tiles: { p: Pattern; el: HTMLCanvasElement }[] = [];
  private readonly chosen = new Set<number>();
  private readonly mutateButton = element("button", { type: "button", textContent: "Mutate" });
  private readonly breedButton = element("button", { type: "button", textContent: "Breed" });
  private readonly gridHint = element("span", { className: "hint" });
  private readonly code = element("code");
  private readonly hint = element("span", { className: "hint" });
  private readonly fileInput = element("input", { type: "file", accept: ".genie", hidden: true });

  private readonly kind = choice(PATTERN_KINDS);
  /** The open file's own patterns, and every pattern source seen, by name. */
  private own: string[] = [];
  /** The library's patterns that the open file doesn't define. */
  private library: string[] = [];
  private readonly sources = new Map<string, PatternSource>();
  private readonly exportButton: HTMLButtonElement;
  private readonly hue = slider(0, 359, 1);
  private readonly seed = slider(0, 99, 1);
  private readonly scheme = choice(SCHEMES);
  private readonly finish = choice(FINISHES);
  private readonly way = choice(MIX_WAYS, "none");
  private readonly second = choice(PATTERN_KINDS);
  private readonly amount = slider(0, 1, 0.01);
  private readonly mixRows: HTMLElement[] = [];

  constructor(
    root: HTMLElement,
    private readonly actions: PatternActions,
  ) {
    const row = (label: string, control: HTMLElement, title = "") => {
      const r = element(
        "label",
        { className: "field", title },
        element("span", {}, label),
        control,
      );
      return r;
    };
    const withRow = row("with", this.second, "The second pattern");
    const amountRow = row("amount", this.amount, "How much of the second pattern, 0 to 1");
    this.mixRows.push(withRow, amountRow);
    const controls = element(
      "div",
      { className: "pattern-controls" },
      row("kind", this.kind),
      row("hue", this.hue, "The hue the colours are built round"),
      row("layout", this.seed, "The seed: the layout and the pattern's own details"),
      row("scheme", this.scheme, "How the colours are chosen round the hue"),
      row("finish", this.finish, "How the surface looks"),
      row("mix", this.way, "How a second pattern is mixed in"),
      withRow,
      amountRow,
    );
    const button = (label: string, title: string, run: () => void) => {
      const b = element("button", { type: "button", textContent: label, title });
      b.addEventListener("click", run);
      return b;
    };
    const actionsBar = element(
      "div",
      { className: "pattern-actions" },
      button("Copy code", "Copy the recipe, for `texture` or `fill`", () => void this.copy()),
      button("Use as background", "Put this recipe behind the creature, with genes", () =>
        this.useAsBackground(),
      ),
      button(
        "Open .genie…",
        "Load the pattern of a background file, or a creature's background",
        () => this.fileInput.click(),
      ),
      (this.exportButton = button(
        "Export .genie",
        "Save the recipe as a background file",
        () => void this.exportFile(),
      )),
      button("Export PNG", "Save the pattern as a picture", () => void this.exportPicture()),
      this.hint,
    );
    this.fileInput.addEventListener("change", () => {
      const file = this.fileInput.files?.[0];
      this.fileInput.value = "";
      if (file) void file.text().then((text) => this.openFile(text));
    });
    root.append(this.fileInput);
    this.mutateButton.title = "Variations of the recipe above and the chosen ones";
    this.breedButton.title = "Children of the recipe above and the chosen ones";
    this.mutateButton.addEventListener("click", () => this.mutate());
    this.breedButton.addEventListener("click", () => this.breed());
    // The picture and its variations on the left; what it's made of, and what to do with it, in a
    // card on the right (on a phone, the card sits under the pinned picture, above the variations).
    root.append(
      element(
        "div",
        { className: "pattern-main" },
        element("div", { className: "pattern-stage" }, this.preview),
        element(
          "div",
          { className: "pattern-actions" },
          this.mutateButton,
          this.breedButton,
          this.gridHint,
        ),
        this.variations,
      ),
      element(
        "div",
        { className: "pattern-side glass" },
        controls,
        element("div", { className: "pattern-code" }, this.code),
        actionsBar,
      ),
    );

    // Hue and amount only recolour or reblend, but drawing a new picture takes a moment, so the
    // preview is drawn smaller while a slider moves and in full once it's let go.
    for (const s of [this.hue, this.seed, this.amount]) {
      s.addEventListener("input", () => this.fromControls(DRAGGING_SIZE));
      s.addEventListener("change", () => this.fromControls(PREVIEW_SIZE, true));
    }
    for (const s of [this.kind, this.scheme, this.finish, this.way, this.second]) {
      s.addEventListener("change", () => this.fromControls(PREVIEW_SIZE, true));
    }
  }

  get pattern(): Pattern {
    return this.recipe;
  }

  /** Starts designing from a recipe, such as the creature's background. */
  /** Starts designing from the pattern in a file, with new variations of it. */
  openFile(text: string): void {
    const { pattern, problem } = patternInFile(text);
    if (!pattern) {
      this.hint.textContent = problem ?? "";
      return;
    }
    this.learn(pattern);
    this.recipe = pattern;
    this.toControls();
    this.draw(PREVIEW_SIZE);
    this.mutate();
  }

  /**
   * Starts designing, from a recipe such as the creature's background if there is one. `own` are
   * the open file's patterns and `library` the library's, offered as kinds beside the built-in
   * ones; where both have a pattern of the same name, the file's is used.
   */
  show(
    start?: Pattern,
    own: readonly OwnPattern[] = [],
    library: readonly OwnPattern[] = [],
  ): void {
    this.own = own.map((o) => o.name);
    this.library = library.map((o) => o.name).filter((n) => !this.own.includes(n));
    for (const o of [...library, ...own]) this.sources.set(o.name, o.source);
    kindOptions(this.kind, this.own, this.library);
    kindOptions(this.second, this.own, this.library);
    if (start && start.kind !== null) {
      this.learn(start);
      this.recipe = start;
    }
    // A recipe of the file's patterns draws as the file now defines them.
    this.recipe = this.withSources(this.recipe);
    this.tiles = this.tiles.map((t) => ({ ...t, p: this.withSources(t.p) }));
    this.toControls();
    this.draw(PREVIEW_SIZE);
    if (this.tiles.length === 0) this.mutate();
  }

  /** The kinds new recipes are made of: the built-in ones, the file's patterns and the library's. */
  private kinds(): string[] {
    return [...PATTERN_KINDS, ...this.own, ...this.library];
  }

  /**
   * Puts the recipe behind the creature. The library's patterns it uses go into the creature too,
   * and the kind genes choose from the creature's patterns, those included.
   */
  private useAsBackground(): void {
    const used = [this.recipe.kind, this.recipe.mix?.kind].filter(
      (k, i, all): k is string => k != null && this.library.includes(k) && all.indexOf(k) === i,
    );
    const patterns = used.map((name) => ({ name, source: this.sources.get(name)! }));
    const kinds = [...PATTERN_KINDS, ...this.own, ...used];
    this.actions.useAsBackground(backgroundLines(this.recipe, kinds), patterns);
  }

  /** Remembers the sources of a recipe's patterns written in GenoCode. */
  private learn(p: Pattern): void {
    if (p.kind !== null && p.source) this.sources.set(p.kind, p.source);
    if (p.mix?.source) this.sources.set(p.mix.kind, p.mix.source);
  }

  /** The recipe with the source of each of its patterns written in GenoCode, and no other. */
  private withSources(p: Pattern): Pattern {
    const source = (kind: string | null) =>
      kind === null || isBuiltinKind(kind) ? undefined : this.sources.get(kind);
    const out: Pattern = { ...p, source: source(p.kind) };
    if (p.mix) out.mix = { ...p.mix, source: source(p.mix.kind) };
    return out;
  }

  private fromControls(size: number, settled = false): void {
    const way = this.way.value as MixWayName | "";
    this.recipe = this.withSources({
      ...this.recipe,
      kind: this.kind.value,
      hue: Number(this.hue.value),
      seed: Number(this.seed.value),
      scheme: this.scheme.value as Pattern["scheme"],
      finish: this.finish.value as Pattern["finish"],
      mix:
        way === ""
          ? undefined
          : {
              way,
              kind: this.second.value,
              amount: Number(this.amount.value),
            },
    });
    this.showMixRows();
    this.draw(size);
    if (settled) this.hint.textContent = "";
  }

  private toControls(): void {
    const p = this.recipe;
    // A recipe from another file may use patterns this file doesn't have.
    for (const [select, kind] of [
      [this.kind, p.kind],
      [this.second, p.mix?.kind],
    ] as const) {
      if (kind && ![...select.options].some((o) => o.value === kind)) {
        select.append(element("option", { value: kind, textContent: kind }));
      }
    }
    this.kind.value = p.kind ?? "aurora";
    this.hue.value = String(wrapHue(p.hue));
    this.seed.value = String(p.seed);
    this.scheme.value = p.scheme;
    this.finish.value = p.finish;
    this.way.value = p.mix?.way ?? "";
    this.second.value = p.mix?.kind ?? "vortex";
    this.amount.value = String(p.mix?.amount ?? 0.5);
    this.showMixRows();
  }

  private showMixRows(): void {
    for (const r of this.mixRows) r.hidden = this.recipe.mix === undefined;
  }

  private draw(size: number): void {
    void drawInto(this.preview, this.recipe, size);
    this.code.textContent = formatValue(this.recipe);
    this.hint.textContent = "";
    const own = usesOwnPattern(this.recipe);
    this.exportButton.disabled = own;
    this.exportButton.title = own
      ? "A background file can't hold patterns written in GenoCode: use it as the creature's background instead"
      : "Save the recipe as a background file";
  }

  /** The parents: the recipe above, which is always one, and the chosen recipes. */
  private parents(): Pattern[] {
    return [this.recipe, ...[...this.chosen].map((i) => this.tiles[i]!.p)];
  }

  /** Fills the grid with variations of the parents. */
  private mutate(): void {
    const parents = this.parents();
    this.fill(() => vary(pick(parents), 1, this.kinds()));
  }

  /** Fills the grid with children of two of the parents at a time. */
  private breed(): void {
    const parents = this.parents();
    if (parents.length < 2) return;
    this.fill(() => {
      const a = pick(parents);
      const b = pick(parents.filter((p) => p !== a));
      // A little mutation too, as in breeding creatures: parents that share most of their parts
      // would otherwise have children that are all much the same.
      return vary(cross(a, b), 0.6, this.kinds());
    });
  }

  /**
   * Fills the grid. Clicking a recipe chooses it as a parent (or not); double-clicking one puts it
   * above, to work on.
   */
  private fill(make: () => Pattern): void {
    this.chosen.clear();
    // No two the same: a recipe already in the grid is made again, a few times at most.
    const seen = new Set<string>();
    const fresh = () => {
      let p = this.withSources(make());
      for (let tries = 0; tries < 20 && seen.has(formatValue(p)); tries++) {
        p = this.withSources(make());
      }
      seen.add(formatValue(p));
      return p;
    };
    this.tiles = Array.from({ length: VARIATIONS }, (_, i) => {
      const p = fresh();
      const el = element("canvas", { className: "pattern-variation", title: formatValue(p) });
      void drawInto(el, p, VARIATION_SIZE);
      el.addEventListener("click", () => {
        if (!this.chosen.delete(i)) this.chosen.add(i);
        this.showChosen();
      });
      el.addEventListener("dblclick", () => {
        this.recipe = p;
        this.toControls();
        this.draw(PREVIEW_SIZE);
      });
      return { p, el };
    });
    this.variations.replaceChildren(...this.tiles.map((t) => t.el));
    this.showChosen();
  }

  private showChosen(): void {
    this.tiles.forEach((t, i) => t.el.classList.toggle("selected", this.chosen.has(i)));
    const n = this.chosen.size;
    this.breedButton.disabled = n < 1;
    this.gridHint.textContent =
      n === 0
        ? "The recipe above is a parent: click others to choose more · double-click one to work on it"
        : `${n + 1} parents: the recipe above and ${n} chosen`;
  }

  private async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(formatValue(this.recipe));
      this.hint.textContent = "Copied";
    } catch {
      this.hint.textContent = "The browser didn't allow copying";
    }
  }

  private async exportFile(): Promise<void> {
    const blob = new Blob([backgroundFile(this.recipe)], { type: "text/plain" });
    await saveBlob(blob, `${recipeName(this.recipe)}.genie`, "GenoCode backgrounds", ".genie");
  }

  private async exportPicture(): Promise<void> {
    this.hint.textContent = "Drawing…";
    const big = element("canvas");
    await drawInto(big, this.recipe, EXPORT_SIZE);
    const blob = await new Promise<Blob | null>((r) => big.toBlob(r, "image/png"));
    this.hint.textContent = "";
    if (blob) await saveBlob(blob, `${recipeName(this.recipe)}.png`, "PNG pictures", ".png");
  }
}

type SaveWindow = Window & {
  showSaveFilePicker?: (options: object) => Promise<{
    createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
  }>;
};

/**
 * Saves a file: with the browser's save dialog where there is one, or else as a download. `make`,
 * when given, gives the file to save in place of `blob`, once the place to save it is known: the
 * dialog has to open straight after a click, before any slow work.
 */
export async function saveBlob(
  blob: Blob,
  name: string,
  description: string,
  ext: string,
  make?: () => Promise<Blob>,
): Promise<void> {
  const picker = (window as SaveWindow).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: name,
        types: [{ description, accept: { [blob.type]: [ext] } }],
      });
      const data = make ? await make() : blob;
      const out = await handle.createWritable();
      await out.write(data);
      await out.close();
    } catch {
      // The dialog was closed.
    }
    return;
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(make ? await make() : blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}
