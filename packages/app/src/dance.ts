// Dancing: music moves the creature as a whole, by a dance style (docs/LANGUAGE.md section 17). Each
// frame the style's dance block runs with the music of the moment, the dancer works out the morph,
// zoom and turn from it, and the creature is built with the same music, so live creatures move to
// it as well.

import {
  buildDance,
  type CheckResult,
  type DanceStyle,
  type LaidShape,
  type MusicInputs,
} from "@genocode/core";
import { Dancer } from "@genocode/dance";
import type { MusicPlayer } from "@genocode/music";
import type { CreatureView } from "@genocode/render";
import { FrameBuilder, type Built } from "./builder.js";
import { buildCreature, type Creature } from "./creature.js";
import { morphAt, type MorphFrame } from "./morph.js";
import { songLook } from "./songlook.js";

export interface DanceFrame extends MorphFrame {
  music: MusicInputs;
  beat: number;
  /** Whether the style worked out; a style with errors at this moment dances as if it were silent. */
  styleOk: boolean;
}

/** The longest step a frame may take, so the dance doesn't leap after the tab was hidden. */
const LONGEST_STEP = 0.1;
/** Seconds the creature takes to shrink away and grow back in a new song's look. */
const CHANGE_SECONDS = 2;
/** How small it gets, at the moment the look changes. */
const SMALLEST = 0.02;

export class DanceFloor {
  /** The creature's family as it is, and as it looks for the song playing. */
  private family: Creature[] = [];
  private members: Creature[] = [];
  /** The look it's shrinking away from, after the song changed, and since when. */
  private leaving: Creature[] | undefined;
  private changed = 0;
  private song: string | undefined;
  private locked: ReadonlySet<string> = new Set();
  /** Whether each song gets a look of its own (songlook.ts). */
  songLooks = true;
  private style: CheckResult | undefined;
  private dancer = new Dancer();
  private frame = 0;
  private started = 0;
  private last = 0;
  private faceOn = false;
  private dancing = false;
  private readonly builder = new FrameBuilder();
  /** The build on show. */
  private shown: Built | undefined;

  constructor(
    private readonly view: CreatureView,
    private readonly player: MusicPlayer,
    private readonly onFrame: (f: DanceFrame) => void,
  ) {}

  /**
   * Starts dancing through these creatures (its morph loop) with a style, in the look for the
   * song playing, if any. Locked genes keep their values whatever the song.
   */
  start(
    members: Creature[],
    style: CheckResult | undefined,
    song: string | undefined,
    locked: ReadonlySet<string>,
  ): void {
    this.family = members;
    this.song = song;
    this.locked = locked;
    this.members = this.look();
    this.leaving = undefined;
    this.style = style;
    this.dancer = new Dancer();
    this.dancer.faceOn = this.faceOn;
    this.started = performance.now();
    this.last = this.started;
    this.stop();
    this.builder.reset();
    this.dancing = true;
    this.draw(true);
  }

  /**
   * Keeps the creature face-on, seen from straight in front with the camera locked, as the
   * original's dances were: it only spins flat. Otherwise it tumbles in 3D and the viewer can look
   * round.
   */
  setFaceOn(on: boolean): void {
    this.faceOn = on;
    this.dancer.faceOn = on;
    if (!this.dancing) return;
    this.view.lockCamera(on);
    this.reframe();
  }

  /**
   * Frames the camera again as when the dance started, on the first creature, whichever is on
   * show: framing a bigger or smaller one would show the rest too small or cut off.
   */
  reframe(): void {
    const first = this.members[0];
    if (!this.dancing || first === undefined) return;
    const { beat, music } = this.player.inputs();
    const time = (performance.now() - this.started) / 1000;
    const { built } = buildCreature(first, { time, beat, music });
    this.view.viewFrom(this.faceOn ? "front" : undefined, built);
  }

  /**
   * A new song (or none, for live music): the creature shrinks away and grows back in the song's
   * look. Turning song looks on or off does the same.
   */
  setSong(song: string | undefined): void {
    if (song === this.song) return;
    this.song = song;
    this.relook();
  }

  setSongLooks(on: boolean): void {
    this.songLooks = on;
    this.relook();
  }

  private look(): Creature[] {
    return this.songLooks && this.song !== undefined
      ? songLook(this.family, this.song, this.locked)
      : this.family;
  }

  private relook(): void {
    if (!this.dancing) return;
    const now = performance.now();
    const t = (now - this.changed) / 1000 / CHANGE_SECONDS;
    if (this.leaving === undefined || t >= 1) {
      this.leaving = this.members;
      this.changed = now;
    } else if (t >= 0.5) {
      // Already growing back: shrink the look on show away again from the size it's at.
      this.leaving = this.members;
      this.changed = now - (1 - t) * CHANGE_SECONDS * 1000;
    }
    // While it's still shrinking, it just grows back in the newer look.
    this.members = this.look();
  }

  /** Changes style while dancing; the dance carries on from where it is. */
  setStyle(style: CheckResult | undefined): void {
    this.style = style;
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
    this.dancing = false;
    this.view.setPose([0, 0, 0, 1], 0);
    this.view.lockCamera(false);
  }

  get count(): number {
    return this.members.length;
  }

  member(i: number): Creature {
    return this.members[i]!;
  }

  private draw(first: boolean): void {
    if (this.members.length === 0) return;
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, LONGEST_STEP);
    this.last = now;
    const { beat, music } = this.player.inputs();
    const inputs = { time: (now - this.started) / 1000, beat, music };

    let style: DanceStyle = {};
    let styleOk = true;
    if (this.style !== undefined) {
      const r = buildDance(this.style, { inputs });
      if (r.style !== undefined) style = r.style;
      else styleOk = this.style.dance === undefined;
    }
    this.dancer.step(style, dt);

    // The dancer counts in creatures; the loop runs from 0 to 1.
    const at = this.dancer.morph / this.members.length;
    const f = morphAt(this.members, at);
    // After the song changes, the old look shrinks away, and the new one takes its place while
    // it's tiny and grows back: the two looks can differ in ways that can't blend, such as where
    // things are placed at random, so they're never seen changing.
    let size = 1;
    if (this.leaving !== undefined) {
      const t = (now - this.changed) / 1000 / CHANGE_SECONDS;
      if (t >= 1) this.leaving = undefined;
      else {
        if (t < 0.5) f.creature = morphAt(this.leaving, at).creature;
        size = Math.max(SMALLEST, (1 + Math.cos(2 * Math.PI * t)) / 2);
      }
    }
    // Built in the background: what's drawn is the newest build, a frame or so behind.
    const next = this.builder.frame(f.creature, inputs, first);
    const { built, background } = next;
    f.problems = built.diagnostics;
    // While the next build is on its way, the creature on show stays; the dance still moves it.
    if (first || next !== this.shown || size < 1) {
      this.shown = next;
      const shapes = size < 1 ? shrunk(built.shapes, built.focus, size) : built.shapes;
      this.view.setCreature(shapes, !first, built.focus);
      this.view.setBackground(background);
    }
    if (first && this.faceOn) {
      this.view.lockCamera(true);
      this.view.viewFrom("front");
    }
    this.view.setPose(this.dancer.orientation, this.dancer.nearness);
    this.onFrame({ ...f, music, beat, styleOk });
    this.frame = requestAnimationFrame(() => this.draw(false));
  }
}

/**
 * The shapes scaled by `k` round the creature's middle: its focus point, or, without one, the
 * middle of its shapes, which the view then still finds in the same place.
 */
function shrunk(
  shapes: readonly LaidShape[],
  focus: readonly [number, number, number] | undefined,
  k: number,
): LaidShape[] {
  let middle = focus;
  if (middle === undefined) {
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const s of shapes) {
      for (let i = 0; i < 3; i++) {
        lo[i] = Math.min(lo[i]!, s.matrix[12 + i]!);
        hi[i] = Math.max(hi[i]!, s.matrix[12 + i]!);
      }
    }
    middle = [(lo[0]! + hi[0]!) / 2, (lo[1]! + hi[1]!) / 2, (lo[2]! + hi[2]!) / 2];
  }
  const scaled = (matrix: readonly number[]) => {
    const m = matrix.map((v, i) => (i < 12 && i % 4 !== 3 ? v * k : v));
    for (let i = 0; i < 3; i++) m[12 + i] = middle[i]! + (matrix[12 + i]! - middle[i]!) * k;
    return m;
  };
  return shapes.map((s) => ({
    ...s,
    matrix: scaled(s.matrix),
    // A stroke's points shrink with it.
    ...(s.points ? { points: s.points.map((p) => ({ ...p, matrix: scaled(p.matrix) })) } : {}),
  }));
}
