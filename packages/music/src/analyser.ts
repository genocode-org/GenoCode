// Turns a stream of samples into the music.* inputs and beat (docs/LANGUAGE.md section 16). It looks
// at the last 2048 samples every 512 (about 86 times a second at 44.1 kHz), splits them into octaves
// the way DancerDNA did, and groups those into bass, mid and high. Each value is measured against its
// own recent peak, so the inputs fill 0–1 however loud the music is.

import { silence, type MusicInputs } from "@genocode/core";
import { BeatTracker } from "./beat.js";
import { BLOCK, OCTAVES, octaves, toInt16 } from "./octaves.js";

/** Samples between analyses. */
export const HOP = 512;

/** Octaves in each band (at 44.1 kHz: bass 22–172 Hz, mid 172 Hz–2.8 kHz, high 2.8–22 kHz). */
const BANDS = { bass: [1, 3], mid: [4, 7], high: [8, 10] } as const;

/** Seconds for a peak to fall to about a third, once the music gets quieter. */
const PEAK_MEMORY = 8;
/** Levels this many decibels below the peak read as 0. */
const LEVEL_RANGE = 24;
/**
 * A band is measured against its own peak, but never against less than the whole music's peak
 * lowered by this many decibels, so a band with only a trace of the music reads low.
 */
const BAND_REFERENCE = 9;
/** The quietest amplitude (of full scale) taken as music rather than silence. */
const FLOOR = 1e-4;
/** Seconds of the slow average that rises are measured against. */
const RISE_AVERAGE = 0.15;
/**
 * Seconds for the overall loudness to fall to about a third once the music gets quieter; it rises
 * at once. The short gaps between notes and drum hits then don't read as the music stopping.
 */
const LEVEL_FALL = 0.15;
/** Seconds for a hit to fall to about a third. */
const HIT_FALL = 0.12;
/** Rises smaller than this share of the recent largest don't count as hits. */
const HIT_GATE = 0.25;

/** Follows a value's recent peak, falling slowly when the value stays below it. */
class Peak {
  value = 0;
  constructor(private readonly floor: number) {}
  follow(x: number, dt: number, floor = this.floor): number {
    this.value = Math.max(x, this.value * Math.exp(-dt / PEAK_MEMORY), floor);
    return this.value;
  }
}

/** One band's level and hit. */
class Band {
  readonly peak = new Peak(FLOOR);
  private readonly risePeak = new Peak(1e-3);
  private slow = 0;
  level = 0;
  hit = 0;
  /** How sharply the band rose this time, 0 or more. */
  rise = 0;

  /** `reference`: the least peak to measure the band against. */
  update(energy: number, dt: number, reference = FLOOR): void {
    const amplitude = Math.sqrt(energy);
    const peak = this.peak.follow(amplitude, dt, Math.max(reference, FLOOR));
    this.level =
      amplitude <= FLOOR ? 0 : clamp(1 + (20 * Math.log10(amplitude / peak)) / LEVEL_RANGE, 0, 1);
    // A rise is the band's level (in decibels) climbing above its slow average.
    const db = 20 * Math.log10(Math.max(amplitude, FLOOR));
    if (this.slow === 0) this.slow = db;
    this.rise = Math.max(0, db - this.slow);
    this.slow += (db - this.slow) * (1 - Math.exp(-dt / RISE_AVERAGE));
    const relative = this.rise / this.risePeak.follow(this.rise, dt);
    const fresh = amplitude <= FLOOR ? 0 : clamp((relative - HIT_GATE) / (1 - HIT_GATE), 0, 1);
    this.hit = Math.max(fresh, this.hit * Math.exp(-dt / HIT_FALL));
  }
}

export class MusicAnalyser {
  // The last BLOCK samples, in rings that `next` goes round.
  private readonly left = new Float32Array(BLOCK);
  private readonly right = new Float32Array(BLOCK);
  private next = 0;
  private sinceAnalysis = 0;
  private readonly x = new Float64Array(BLOCK);
  private readonly l = new Float64Array(OCTAVES + 1);
  private readonly r = new Float64Array(OCTAVES + 1);
  private readonly bass = new Band();
  /** The overall loudness given out: the whole music's level, falling gently. */
  private level = 0;
  private readonly mid = new Band();
  private readonly high = new Band();
  private readonly all = new Band();
  private readonly allHit = new Peak(1e-3);
  private hit = 0;
  private readonly beats: BeatTracker;
  private samples = 0;
  private current: MusicInputs = silence();

  constructor(readonly sampleRate = 44100) {
    this.beats = new BeatTracker(sampleRate / HOP);
  }

  /** Seconds of music analysed so far. */
  get time(): number {
    return this.samples / this.sampleRate;
  }

  /** The music inputs, as of the latest analysis. */
  get music(): MusicInputs {
    return this.current;
  }

  /** The position within the beat at `time` (seconds of music), or now. */
  beat(time = this.time): number {
    return this.beats.at(time);
  }

  /** Beats a minute, or undefined while there's no beat to follow. */
  get tempo(): number | undefined {
    return this.beats.tempo;
  }

  /** Adds samples (−1..1). Mono music can leave out `right`. */
  push(left: Float32Array, right: Float32Array = left): void {
    for (let i = 0; i < left.length; i++) {
      this.left[this.next] = left[i]!;
      this.right[this.next] = right[i] ?? left[i]!;
      this.next = (this.next + 1) % BLOCK;
      this.samples++;
      if (++this.sinceAnalysis >= HOP && this.samples >= BLOCK) {
        this.sinceAnalysis = 0;
        this.analyse();
      }
    }
  }

  private analyse(): void {
    const dt = HOP / this.sampleRate;
    this.split(this.left, this.l);
    this.split(this.right, this.r);
    const sum = (from: number, to: number): number => {
      let s = 0;
      for (let j = from; j <= to; j++) s += this.l[j]! + this.r[j]!;
      return s / 2;
    };
    this.all.update((this.l[OCTAVES]! + this.r[OCTAVES]!) / 2, dt);
    const reference = this.all.peak.value * 10 ** (-BAND_REFERENCE / 20);
    this.bass.update(sum(...BANDS.bass), dt, reference);
    this.mid.update(sum(...BANDS.mid), dt, reference);
    this.high.update(sum(...BANDS.high), dt, reference);

    // Any hit: the strongest band's, so a kick, a snare or a hi-hat each count.
    const rise = Math.max(this.bass.rise, this.mid.rise, this.high.rise);
    const relative = rise / this.allHit.follow(rise, dt);
    const fresh = this.all.level === 0 ? 0 : clamp((relative - HIT_GATE) / (1 - HIT_GATE), 0, 1);
    this.hit = Math.max(fresh, this.hit * Math.exp(-dt / HIT_FALL));

    const loud = this.all.level;
    this.level =
      loud >= this.level
        ? loud
        : this.level + (loud - this.level) * (1 - Math.exp(-dt / LEVEL_FALL));

    this.current = {
      bass: this.bass.level,
      mid: this.mid.level,
      high: this.high.level,
      level: this.level,
      hit: this.hit,
      bass_hit: this.bass.hit,
      mid_hit: this.mid.hit,
      high_hit: this.high.hit,
    };
    // Beats are mostly carried by the drums: the low and middle rises.
    this.beats.push(this.bass.rise + 0.5 * this.mid.rise, this.time);
  }

  private split(ring: Float32Array, out: Float64Array): void {
    for (let i = 0; i < BLOCK; i++) this.x[i] = toInt16(ring[(this.next + i) % BLOCK]!);
    octaves(this.x, out);
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi);
}
