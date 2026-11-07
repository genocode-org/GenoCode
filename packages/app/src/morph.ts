// Morphing: a loop through a set of creatures, each blending into the next (docs/LANGUAGE.md
// section 19.3), as the original's genespace did. Creature i sits at position i / n of the loop.

import { morph, type Diagnostic } from "@genocode/core";
import type { CreatureView } from "@genocode/render";
import { FrameBuilder, type Built } from "./builder.js";
import { buildCreature, type Creature } from "./creature.js";

export interface MorphFrame {
  creature: Creature;
  /** Which creature of the loop it's leaving, and how far it is towards the next. */
  index: number;
  t: number;
  problems: Diagnostic[];
}

/** The creature at a position in a loop of creatures, from 0 up to 1 (and round again). */
export function morphAt(members: readonly Creature[], position: number): MorphFrame {
  const n = members.length;
  const x = (((position % 1) + 1) % 1) * n;
  const index = Math.min(Math.floor(x), n - 1);
  const t = x - index;
  const a = members[index]!;
  const b = members[(index + 1) % n]!;
  const m = morph(
    { genes: a.program.genes, values: a.values },
    { genes: b.program.genes, values: b.values },
    t,
  );
  const program = m.from === "a" ? a.program : b.program;
  return { creature: { program, values: m.values }, index, t, problems: [] };
}

export class Morpher {
  private members: Creature[] = [];
  private position = 0;
  private last = 0;
  private frame = 0;
  private started = 0;
  playing = true;
  private readonly builder = new FrameBuilder();
  /** The build on show. */
  private shown: Built | undefined;
  /** Seconds from one creature to the next. */
  secondsEach = 3;

  constructor(
    private readonly view: CreatureView,
    private readonly onFrame: (f: MorphFrame) => void,
  ) {}

  get count(): number {
    return this.members.length;
  }

  member(i: number): Creature {
    return this.members[i]!;
  }

  /** Starts morphing through these creatures, from the first. */
  start(members: Creature[]): void {
    this.members = members;
    this.position = 0;
    this.started = performance.now();
    this.last = this.started;
    this.stop();
    this.builder.reset();
    this.draw(true);
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
  }

  /**
   * Frames the camera again as when the morph started, on the first creature, whichever is on
   * show: framing a bigger or smaller one would show the rest too small or cut off.
   */
  reframe(): void {
    const first = this.members[0];
    if (first === undefined) return;
    const { built } = buildCreature(first, { time: (performance.now() - this.started) / 1000 });
    this.view.viewFrom(undefined, built);
  }

  resume(): void {
    this.stop();
    this.last = performance.now();
    this.draw(false);
  }

  private draw(first: boolean): void {
    if (this.members.length === 0) return;
    const now = performance.now();
    if (this.playing && !first) {
      this.position += (now - this.last) / 1000 / (this.secondsEach * this.members.length);
    }
    this.last = now;
    const f = morphAt(this.members, this.position);
    // Built in the background: what's drawn is the newest build, a frame or so behind.
    const next = this.builder.frame(f.creature, { time: (now - this.started) / 1000 }, first);
    const { built, background } = next;
    f.problems = built.diagnostics;
    // While the next build is on its way, the creature on show stays.
    if (first || next !== this.shown) {
      this.shown = next;
      this.view.setCreature(built.shapes, !first, built.focus);
      this.view.setBackground(background);
    }
    this.onFrame(f);
    this.frame = requestAnimationFrame(() => this.draw(false));
  }
}
