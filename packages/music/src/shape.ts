// Where the song is going: the music inputs quiet, build, drop and change (docs/LANGUAGE.md
// section 16). They are worked out from how the sound of the last second or two differs from the
// seconds before it.

/** Octaves the sound is split into (octaves.ts). */
const OCTAVES = 11;
/** The octaves that count as bass. */
const BASS = [1, 3] as const;
/** The quietest amplitude taken as music. */
const FLOOR = 1e-4;
/** Seconds for the loudest the music has been to fall to about a third. */
const MEMORY = 60;

/** Decibels under the loudest lately where `quiet` starts to rise, and where it reads fully 1. */
const QUIET_FROM = 6;
const QUIET_FULL = 14;
/** Seconds `quiet` takes to follow. */
const QUIET_SMOOTH = 1;

/** Seconds at the start of a song before what's heard can be compared with what came before. */
const SETTLING = 4;

/** Seconds of "just now" and of "a while before" that `build` compares. */
const BUILD_NOW = 1.5;
const BUILD_BEFORE = 8;
/** How much louder (decibels), brighter and busier (each 0–1) the music has got for `build` 1. */
const BUILD_LOUDER = 8;
const BUILD_BRIGHTER = 0.3;
const BUILD_BUSIER = 0.4;
/** Decibels quieter than before at which the music can't be building at all. */
const BUILD_FALLING = 4;
/** Seconds `build` takes to follow. */
const BUILD_SMOOTH = 0.7;

/** Seconds the bass and the loudness are held for, so the gaps between hits don't read as quiet. */
const BASS_HOLD = 0.6;
/** Seconds of bass before now that a drop is measured against. */
const BASS_BEFORE = 4;
/** Decibels the bass must jump by to be a drop, and the jump that reads as fully 1. */
const DROP_FROM = 5;
const DROP_FULL = 10;
/** Seconds a build or a quiet part still counts as "just before" a drop. */
const PRIMED = 2;
/** The least `drop` that starts one, the seconds it can grow for, and the least seconds between two. */
const DROP_LEAST = 0.3;
const DROP_GROWS = 1;
const DROP_APART = 8;
/** Seconds for `drop` to fall to about a third. */
const DROP_FALL = 1.5;

/** Seconds of "just now" and of "a while before" that `change` compares. */
const CHANGE_NOW = 2.5;
const CHANGE_BEFORE = 10;
/** The decibels below its loudest at which an octave reads as empty. */
const CHANGE_RANGE = 30;
/**
 * Music differs from moment to moment all the time. A change is the sound differing by this many
 * times its usual amount, and by this many times for `change` to read fully 1. The usual amount
 * is taken over this many seconds.
 */
const CHANGE_FROM = 1.35;
const CHANGE_FULL = 2;
const CHANGE_USUAL = 30;
/** Seconds for `change` to fall to about a third. */
const CHANGE_FALL = 1;

export interface ShapeInputs {
  quiet: number;
  build: number;
  drop: number;
  change: number;
}

export class SongShape {
  private loudest = 0;
  private bassLoudest = 0;
  private readonly octaveLoudest = new Float64Array(OCTAVES);
  private heard = 0;
  /** The loudness, held through the gaps between hits. */
  private held = 0;
  private quiet = 0;
  // Loudness (decibels), brightness and busyness, just now and a while before.
  private readonly now = new Float64Array(3);
  private readonly before = new Float64Array(3);
  private build = 0;
  private bassHeld = 0;
  private bassBefore = 0;
  private primed = 0;
  private drop = 0;
  /** Seconds since the last drop started. */
  private sinceDrop = DROP_APART;
  // What the sound is like, just now and a while before: each octave's level, then the notes.
  private readonly like = new Float64Array(OCTAVES + 12);
  private readonly likeBefore = new Float64Array(OCTAVES + 12);
  private usual = 0;
  private change = 0;

  get inputs(): ShapeInputs {
    return { quiet: this.quiet, build: this.build, drop: this.drop, change: this.change };
  }

  /**
   * Takes in a moment of music. `octaves`: the energy in each octave; `notes`: how strongly each
   * of the twelve notes sounds; `bright` and `busy`: 0–1.
   */
  update(
    dt: number,
    octaves: ArrayLike<number>,
    notes: ArrayLike<number>,
    bright: number,
    busy: number,
  ): void {
    const follow = (seconds: number): number => 1 - Math.exp(-dt / seconds);
    const fade = Math.exp(-dt / MEMORY);
    let total = 0;
    let bass = 0;
    for (let j = 0; j < OCTAVES; j++) {
      total += octaves[j]!;
      if (j >= BASS[0] && j <= BASS[1]) bass += octaves[j]!;
    }
    const amplitude = Math.sqrt(total);
    if (amplitude <= FLOOR) {
      // Silence: everything falls back, and the song starts afresh if it goes on.
      this.quiet += (0 - this.quiet) * follow(QUIET_SMOOTH);
      this.build += (0 - this.build) * follow(BUILD_SMOOTH);
      this.drop *= Math.exp(-dt / DROP_FALL);
      this.change *= Math.exp(-dt / CHANGE_FALL);
      this.heard = 0;
      return;
    }
    const first = this.heard === 0;
    this.heard += dt;
    this.loudest = Math.max(amplitude, this.loudest * fade, FLOOR);
    this.held = Math.max(amplitude, this.held * Math.exp(-dt / BASS_HOLD));
    const under = 20 * Math.log10(this.loudest / this.held);

    // Quiet: well under the loudest the music has been lately.
    const quiet = clamp((under - QUIET_FROM) / (QUIET_FULL - QUIET_FROM), 0, 1);
    this.quiet += (quiet - this.quiet) * follow(QUIET_SMOOTH);

    // Build: louder, brighter and busier now than a while before.
    const state = [-under, bright, busy];
    for (let i = 0; i < 3; i++) {
      // Over a song's first seconds the brightness and busyness are still settling.
      if (this.heard < SETTLING) this.now[i] = this.before[i] = state[i]!;
      this.now[i]! += (state[i]! - this.now[i]!) * follow(BUILD_NOW);
      this.before[i]! += (state[i]! - this.before[i]!) * follow(BUILD_BEFORE);
    }
    // A song's first seconds have no "before" to have risen from; and music that has got quieter
    // isn't building, even if losing its bass has left it brighter.
    const louder = this.now[0]! - this.before[0]!;
    const rising =
      this.heard < SETTLING
        ? 0
        : (Math.max(0, louder) / BUILD_LOUDER +
            Math.max(0, this.now[1]! - this.before[1]!) / BUILD_BRIGHTER +
            Math.max(0, this.now[2]! - this.before[2]!) / BUILD_BUSIER) *
          clamp(1 + louder / BUILD_FALLING, 0, 1);

    // Drop: the bass jumping in, straight after a build or a quiet part.
    const bassNow = Math.sqrt(bass);
    this.bassLoudest = Math.max(bassNow, this.bassLoudest * fade, FLOOR);
    this.bassHeld = Math.max(bassNow, this.bassHeld * Math.exp(-dt / BASS_HOLD));
    const held = 20 * Math.log10(Math.max(this.bassHeld, FLOOR) / this.bassLoudest);
    if (first) this.bassBefore = held;
    const jump = held - this.bassBefore;
    this.bassBefore += (held - this.bassBefore) * follow(BASS_BEFORE);
    // Half-way quiet, or half a build, is enough to set a drop up fully.
    const ready = Math.min(1, 2 * Math.max(this.quiet, this.build));
    this.primed = Math.max(ready, this.primed * Math.exp(-dt / PRIMED));
    const fresh = clamp((jump - DROP_FROM) / (DROP_FULL - DROP_FROM), 0, 1) * this.primed;
    // A drop starts when the jump is big enough, and takes its size from the first moment of it:
    // the bass may come in over a few beats. Then no other drop follows for a while.
    this.sinceDrop += dt;
    if (this.sinceDrop >= DROP_APART && fresh >= DROP_LEAST) this.sinceDrop = 0;
    if (this.sinceDrop < DROP_GROWS) this.drop = Math.max(this.drop, fresh);
    else this.drop *= Math.exp(-dt / DROP_FALL);

    // A build is the climb before the drop, not the jump of the drop itself.
    const build = clamp(rising, 0, 1) * (1 - this.drop);
    this.build += (build - this.build) * follow(BUILD_SMOOTH);

    // Change: what the sound is like now against a while before.
    let noteSum = 0;
    for (let n = 0; n < 12; n++) noteSum += notes[n]!;
    let difference = 0;
    for (let i = 0; i < this.like.length; i++) {
      let v: number;
      if (i < OCTAVES) {
        const a = Math.sqrt(octaves[i]!);
        this.octaveLoudest[i] = Math.max(a, this.octaveLoudest[i]! * fade, FLOOR);
        v = clamp(
          1 + (20 * Math.log10(Math.max(a, 1e-9) / this.octaveLoudest[i]!)) / CHANGE_RANGE,
          0,
          1,
        );
      } else {
        v = noteSum > 1e-9 ? notes[i - OCTAVES]! / noteSum : 0;
      }
      if (first) this.like[i] = this.likeBefore[i] = v;
      this.like[i]! += (v - this.like[i]!) * follow(CHANGE_NOW);
      this.likeBefore[i]! += (v - this.likeBefore[i]!) * follow(CHANGE_BEFORE);
      // The notes add up to 1 between them, so each counts for more than one octave's level.
      difference += Math.abs(this.like[i]! - this.likeBefore[i]!) * (i < OCTAVES ? 1 : 3);
    }
    difference /= OCTAVES + 6;
    // The first seconds of a song are no change: there's nothing before them.
    const settled = this.heard > CHANGE_BEFORE;
    if (!settled) this.usual = difference;
    const times = this.usual > 1e-6 ? difference / this.usual : 0;
    const changed = settled ? clamp((times - CHANGE_FROM) / (CHANGE_FULL - CHANGE_FROM), 0, 1) : 0;
    this.usual += (difference - this.usual) * follow(CHANGE_USUAL);
    this.change = Math.max(changed, this.change * Math.exp(-dt / CHANGE_FALL));
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi);
}
