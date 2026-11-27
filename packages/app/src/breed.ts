// The breeding grid: a generation of creatures shown as tiles. Select parents, then mutate or
// breed them into the next generation (docs/LANGUAGE.md section 19).

import {
  breed,
  familySpread,
  geneDistance,
  mutate,
  valuesEqual,
  type CheckResult,
  type GeneInfo,
  type GeneSpread,
  type Value,
} from "@genocode/core";
import { creatureBounds, onFieldReady, Thumbnails } from "@genocode/render";
import { buildCreature, type Creature } from "@genocode/stage";
import { locked } from "./panel.js";

const GRID_SIZE = 12;
/** Kept parents fill at most half the grid, so every generation has new creatures. */
const MAX_KEPT = GRID_SIZE / 2;
const HISTORY = 30;
/** How many children are tried for each tile, to find ones worth showing. */
const TRIES = 3;
/** A child is too big or too small next to its parent beyond this factor. */
const MAX_GROWTH = 4;
/** Children closer than this to a parent or another tile (`geneDistance`) look the same. */
const MIN_DISTANCE = 0.004;

/** Whether a locked value still suits the gene, which may have changed since it was locked. */
function suits(g: GeneInfo, v: Value): boolean {
  if (g.options) return g.options.some((o) => valuesEqual(o, v));
  const w = g.value;
  return (
    typeof v === typeof w && (typeof v !== "object" || typeof w !== "object" || v.type === w.type)
  );
}

/** The creature with its locked genes at the values they were locked at. */
export function pinned(c: Creature): Creature {
  let values: Map<string, Value> | undefined;
  for (const g of c.program.genes) {
    const v = locked.get(g.fullName);
    if (v === undefined || !suits(g, v)) continue;
    if (valuesEqual(v, c.values.get(g.fullName) ?? g.value)) continue;
    values ??= new Map(c.values);
    values.set(g.fullName, v);
  }
  return values ? { ...c, values } : c;
}

export interface BreederEvents {
  /** A tile was clicked: show its genes. */
  inspect(c: Creature): void;
  /** A tile was double-clicked: open it in the full view. */
  open(c: Creature): void;
}

export class Breeder {
  private generation: Creature[] = [];
  /** Which tiles were kept from the last generation as parents. */
  private parents = new Set<number>();
  private readonly selected = new Set<number>();
  private readonly history: { generation: Creature[]; parents: Set<number> }[] = [];
  /** How far apart the genes of the family the grid started from are; mutations keep to it. */
  private spread: GeneSpread | undefined;
  /** Each creature's size, from its bounds, once worked out. */
  private readonly sizes = new WeakMap<Creature, number | undefined>();
  private readonly thumbnails = new Thumbnails();
  private drawing = 0;
  /** The tiles on show, to draw again when a texture's picture is ready. */
  private shown: { canvas: HTMLCanvasElement; creature: Creature }[] = [];
  private repaint = 0;

  constructor(
    private readonly grid: HTMLElement,
    private readonly events: BreederEvents,
  ) {
    new ResizeObserver(() => this.render()).observe(grid);
    // Pictures drawn elsewhere arrive one by one; the tiles are drawn again once they've settled.
    onFieldReady(() => {
      clearTimeout(this.repaint);
      this.repaint = window.setTimeout(() => {
        if (!this.grid.hidden) this.paint(this.shown);
      }, 100);
    });
  }

  /** The tiles, in grid order. */
  get creatures(): readonly Creature[] {
    return this.generation;
  }

  get selection(): Creature[] {
    return [...this.selected].sort((a, b) => a - b).map((i) => this.generation[i]!);
  }

  /**
   * Moves the grid over to a new version of its creature's program with the same genes, such as
   * one with a variant added, keeping every tile and the generations before.
   */
  adopt(program: CheckResult): void {
    const move = (c: Creature): Creature => ({ ...c, program });
    this.generation = this.generation.map(move);
    for (const h of this.history) h.generation = h.generation.map(move);
    this.render();
  }

  /** True when the grid already holds creatures of this program. */
  holds(c: Creature): boolean {
    return this.generation.some((g) => g.program === c.program);
  }

  /**
   * Starts a new grid from a creature's family: the creature and its variants, filled up with
   * mutations of them. A creature without variants starts with mutations of itself.
   */
  start(whole: Creature[], strength: number): void {
    // Variants that set a locked gene take its locked value too; one that then looks just like an
    // earlier one is left out.
    const genes = whole[0]!.program.genes;
    const family: Creature[] = [];
    for (const c of whole.map(pinned)) {
      if (!family.some((f) => geneDistance(genes, f.values, c.values) < MIN_DISTANCE))
        family.push(c);
    }
    this.history.length = 0;
    this.selected.clear();
    this.selected.add(0);
    const first = family[0]!.program;
    this.spread =
      family.length > 1
        ? familySpread(
            first.genes,
            family.map((c) => c.values),
          )
        : undefined;
    if (family.length === 1) {
      this.next(family, strength, true);
      return;
    }
    const kept = family.slice(0, GRID_SIZE);
    this.show(
      kept,
      this.children(kept, () => this.mutant(kept, strength)),
    );
  }

  /** The next generation: mutations of the selected creatures. */
  mutateSelection(strength: number, keepParents: boolean): void {
    const parents = this.selection;
    if (parents.length === 0) return;
    this.remember();
    this.selected.clear();
    this.next(parents, strength, keepParents);
  }

  /** The next generation: children of random pairs of the selected creatures. */
  breedSelection(keepParents: boolean): void {
    const parents = this.selection;
    if (parents.length < 2) return;
    this.remember();
    this.selected.clear();
    const kept = keepParents ? parents.slice(0, MAX_KEPT) : [];
    const children = this.children(kept, () => {
      const i = Math.floor(Math.random() * parents.length);
      let j = Math.floor(Math.random() * (parents.length - 1));
      if (j >= i) j++;
      const a = parents[i]!;
      const b = parents[j]!;
      const values = breed(
        { genes: a.program.genes, values: a.values },
        { genes: b.program.genes, values: b.values },
        { random: Math.random, locked: new Set(locked.keys()) },
      );
      return { child: pinned({ program: a.program, values }), parents: [a, b] };
    });
    this.show(kept, children);
  }

  /** Goes back to the previous generation. */
  back(): boolean {
    const last = this.history.pop();
    if (!last) return false;
    this.generation = last.generation;
    this.parents = last.parents;
    this.selected.clear();
    this.render();
    return true;
  }

  get canGoBack(): boolean {
    return this.history.length > 0;
  }

  private next(parents: Creature[], strength: number, keepParents: boolean): void {
    const kept = keepParents ? parents.slice(0, MAX_KEPT) : [];
    this.show(
      kept,
      this.children(kept, () => this.mutant(parents, strength)),
    );
  }

  /** A mutation of one of the parents, chosen at random. */
  private mutant(parents: Creature[], strength: number): { child: Creature; parents: Creature[] } {
    const p = parents[Math.floor(Math.random() * parents.length)]!;
    const values = mutate(p.program.genes, p.values, {
      strength,
      random: Math.random,
      locked: new Set(locked.keys()),
      spread: this.spread,
    });
    return { child: pinned({ program: p.program, values }), parents: [p] };
  }

  /**
   * Children to fill the grid after the kept parents. Several are tried for each tile, and broken
   * ones, ones far bigger or smaller than their parents and ones that look the same as a tile are
   * left out. If too few are left, the least bad of the rest fill the grid.
   */
  private children(
    kept: Creature[],
    make: () => { child: Creature; parents: Creature[] },
  ): Creature[] {
    const wanted = GRID_SIZE - kept.length;
    const good: Creature[] = [];
    const rest: { child: Creature; fault: number }[] = [];
    for (let tries = 0; good.length < wanted && tries < wanted * TRIES; tries++) {
      const { child, parents } = make();
      const fault = this.fault(child, parents, [...kept, ...good]);
      if (fault === 0) good.push(child);
      else rest.push({ child, fault });
    }
    rest.sort((a, b) => a.fault - b.fault);
    return [...good, ...rest.slice(0, wanted - good.length).map((r) => r.child)];
  }

  /** What's wrong with a child, worst first: 3 broken, 2 the wrong size, 1 a look-alike, 0 nothing. */
  private fault(child: Creature, parents: Creature[], tiles: Creature[]): number {
    if (child.program.file.kind === "creature") {
      const size = this.size(child);
      if (size === undefined) return 3;
      const near = parents.some((p) => {
        const s = this.size(p);
        return s === undefined || (size < s * MAX_GROWTH && size > s / MAX_GROWTH);
      });
      if (!near) return 2;
    }
    const genes = child.program.genes;
    const alike = [...parents, ...tiles].some(
      (t) =>
        t.program === child.program && geneDistance(genes, t.values, child.values) < MIN_DISTANCE,
    );
    return alike ? 1 : 0;
  }

  /** How big a creature is, or undefined if it doesn't build or has no shapes. */
  private size(c: Creature): number | undefined {
    if (!this.sizes.has(c)) {
      const { built } = buildCreature(c);
      const ok = built.ok && built.shapes.length > 0;
      this.sizes.set(c, ok ? creatureBounds(built.shapes, built.focus).radius : undefined);
    }
    return this.sizes.get(c);
  }

  private show(kept: Creature[], children: Creature[]): void {
    this.generation = [...kept, ...children];
    this.parents = new Set(kept.map((_, i) => i));
    this.render();
  }

  private remember(): void {
    this.history.push({ generation: this.generation, parents: this.parents });
    if (this.history.length > HISTORY) this.history.shift();
  }

  /** Lays out the tiles, then draws them a few at a time so the page stays responsive. */
  render(): void {
    if (this.grid.hidden) return;
    const tiles = this.generation.map((c, i) => this.tile(c, i));
    this.grid.replaceChildren(...tiles.map((t) => t.element));
    this.shown = tiles;
    this.paint(tiles);
  }

  /** Draws the tiles a few at a time, so the page stays responsive. */
  private paint(tiles: readonly { canvas: HTMLCanvasElement; creature: Creature }[]): void {
    const run = ++this.drawing;
    const ratio = window.devicePixelRatio || 1;
    let k = 0;
    const step = () => {
      if (run !== this.drawing) return;
      const started = performance.now();
      while (k < tiles.length && performance.now() - started < 30) {
        const { canvas, creature } = tiles[k++]!;
        canvas.width = Math.round(canvas.clientWidth * ratio);
        canvas.height = Math.round(canvas.clientHeight * ratio);
        const { built, background } = buildCreature(creature);
        this.thumbnails.draw(canvas, built.shapes, background, built.focus);
      }
      if (k < tiles.length) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  private tile(
    c: Creature,
    i: number,
  ): { element: HTMLElement; canvas: HTMLCanvasElement; creature: Creature } {
    const element = document.createElement("div");
    element.className = "tile";
    element.classList.toggle("selected", this.selected.has(i));
    element.classList.toggle("parent", this.parents.has(i));
    element.title = "Click to choose as a parent; double-click to open";
    const canvas = document.createElement("canvas");
    element.append(canvas);
    element.addEventListener("click", () => {
      if (this.selected.has(i)) this.selected.delete(i);
      else this.selected.add(i);
      element.classList.toggle("selected", this.selected.has(i));
      this.events.inspect(c);
    });
    element.addEventListener("dblclick", () => this.events.open(c));
    return { element, canvas, creature: c };
  }
}
