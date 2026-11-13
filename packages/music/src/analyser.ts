// Turns a stream of samples into the music.* inputs and beat (docs/LANGUAGE.md section 16). It looks
// at the last 2048 samples every 512 (about 86 times a second at 44.1 kHz), splits them into octaves
// the way DancerDNA did, and groups those into bass, mid and high. Each value is measured against its
// own recent peak, so the inputs fill 0–1 however loud the music is. The music's mood (tempo,
// energy, bright, rough) and its left–right balance are worked out beside them.

import { silence, type MusicInputs } from "@genocode/core";
import { BeatTracker } from "./beat.js";
import { BINS, SPECTRUM_BLOCK, spectrum } from "./fft.js";
import { Notes } from "./notes.js";
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
 * at once. The gaps between notes and drum hits then don't read as the music stopping, even in a
 * song that opens with drums alone, half a second apart.
 */
const LEVEL_FALL = 0.3;
/** Seconds for a hit to fall to about a third. */
const HIT_FALL = 0.12;
/** Rises smaller than this share of the recent largest don't count as hits. */
const HIT_GATE = 0.25;

/** Beats a minute that read as `tempo` 0 and 1. */
const SLOW = 60;
const FAST = 180;
/**
 * Seconds for the loudest the music has been to fall to about a third, for `energy`: much longer
 * than a quiet part of a song lasts, so a quiet part reads as low energy all the way through.
 */
const ENERGY_MEMORY = 60;
/** Seconds `energy` takes to follow the music. */
const ENERGY_SMOOTH = 2;
/** The share of `energy` that comes from how loud the music is; the rest from how busy it is. */
const ENERGY_LOUDNESS = 0.7;
/** The average of `hit` in music busy enough to count as full. */
const BUSY = 0.5;
/** Decibels a hit must rise by to count as making the music busy: a steady note's ripples don't. */
const BUSY_RISE = 1;
/** Where the sound's weight sits, in octaves from the lowest, for `bright` 0 and 1. */
const DARK = 3;
const SPARKLING = 6.5;
/**
 * `tempo` is the middle one of the beat tracker's last answers, this many, one taken every
 * TEMPO_EVERY seconds, so a few wrong guesses at the beat (twice as fast, say) don't show.
 */
const TEMPO_ANSWERS = 31;
const TEMPO_EVERY = 0.5;
/** Seconds `tempo` takes to glide to a new value. */
const TEMPO_SMOOTH = 1;
/** The octaves `balance` listens to: the bass sits in the middle in nearly all music. */
const BALANCE_FROM = 4;
/** Seconds `bright`, `rough` and `balance` take to follow the music. */
const MOOD_SMOOTH = 0.25;
/** Samples between spectra. */
const SPECTRUM_HOP = SPECTRUM_BLOCK / 2;
/** The frequencies `rough` listens to, split into bands an octave wide. */
const ROUGH_FROM = 200;
const ROUGH_BANDS = 5;
/** How noise-like a band's spectrum is (0 a pure note, 1 flat) when the sound is noise. */
const NOISE = 0.56;

/** Follows a value's recent peak, falling slowly when the value stays below it. */
class Peak {
  value = 0;
  constructor(
    private readonly floor: number,
    private readonly memory = PEAK_MEMORY,
  ) {}
  follow(x: number, dt: number, floor = this.floor): number {
    this.value = Math.max(x, this.value * Math.exp(-dt / this.memory), floor);
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
  private readonly notes: Notes;
  // The last SPECTRUM_BLOCK samples of both sides mixed, for the spectrum.
  private readonly mono = new Float32Array(SPECTRUM_BLOCK);
  private monoNext = 0;
  private sinceSpectrum = 0;
  private readonly power = new Float64Array(BINS);
  private readonly loudest = new Peak(FLOOR, ENERGY_MEMORY);
  /** `hit`, counting only real rises, and its slow average. */
  private struck = 0;
  private busy = 0;
  private energy = 0;
  private bright = 0;
  /** How noise-like the latest spectrum was, and `rough`, which follows it. */
  private noisy = 0;
  private rough = 0;
  private balance = 0;
  /** The beat tracker's latest answers (beats a minute), oldest first, and `tempo` from them. */
  private answers: number[] = [];
  private sinceAnswer = 0;
  private pace = 0;
  private samples = 0;
  private current: MusicInputs = silence();

  constructor(readonly sampleRate = 44100) {
    this.beats = new BeatTracker(sampleRate / HOP);
    this.notes = new Notes(sampleRate);
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
      this.mono[this.monoNext] = (left[i]! + (right[i] ?? left[i]!)) / 2;
      this.notes.push(this.mono[this.monoNext]!);
      this.monoNext = (this.monoNext + 1) % SPECTRUM_BLOCK;
      this.samples++;
      if (++this.sinceSpectrum >= SPECTRUM_HOP && this.samples >= SPECTRUM_BLOCK) {
        this.sinceSpectrum = 0;
        this.noisy = this.noisiness(spectrum(this.mono, this.monoNext, this.power));
      }
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

    this.struck = Math.max(rise >= BUSY_RISE ? fresh : 0, this.struck * Math.exp(-dt / HIT_FALL));
    this.mood(dt);

    this.current = {
      bass: this.bass.level,
      mid: this.mid.level,
      high: this.high.level,
      level: this.level,
      hit: this.hit,
      bass_hit: this.bass.hit,
      mid_hit: this.mid.hit,
      high_hit: this.high.hit,
      tempo: this.pace,
      energy: this.energy,
      bright: this.bright,
      rough: this.rough,
      balance: this.balance,
      ...this.notes.inputs,
    };
    // Beats are mostly carried by the drums: the low and middle rises.
    this.beats.push(this.bass.rise + 0.5 * this.mid.rise, this.time);
  }

  /** Moves energy, bright, rough and balance towards what the latest octaves say. */
  private mood(dt: number): void {
    let left = 0;
    let right = 0;
    for (let j = BALANCE_FROM; j < OCTAVES; j++) {
      left += this.l[j]!;
      right += this.r[j]!;
    }
    left = Math.sqrt(left);
    right = Math.sqrt(right);
    const amplitude = Math.sqrt((this.l[OCTAVES]! + this.r[OCTAVES]!) / 2);
    const sounding = amplitude > FLOOR;
    const follow = (now: number, target: number, seconds: number): number =>
      now + (target - now) * (1 - Math.exp(-dt / seconds));

    // Energy: how loud the music is against the loudest it has been for a long while, and how
    // busy it is with hits.
    const peak = this.loudest.follow(amplitude, dt);
    const loud = sounding ? clamp(1 + (20 * Math.log10(amplitude / peak)) / LEVEL_RANGE, 0, 1) : 0;
    this.busy = follow(this.busy, this.struck, ENERGY_SMOOTH);
    const intense = ENERGY_LOUDNESS * loud + (1 - ENERGY_LOUDNESS) * clamp(this.busy / BUSY, 0, 1);
    this.energy = follow(this.energy, sounding ? intense : 0, ENERGY_SMOOTH);

    // Bright: where the sound's weight sits among the octaves.
    let weight = 0;
    let total = 0;
    for (let j = 0; j < OCTAVES; j++) {
      const a = Math.sqrt(this.l[j]! + this.r[j]!);
      weight += j * a;
      total += a;
    }
    const bright = sounding ? clamp((weight / total - DARK) / (SPARKLING - DARK), 0, 1) : 0;
    this.bright = follow(this.bright, bright, MOOD_SMOOTH);

    this.rough = follow(this.rough, sounding ? this.noisy : 0, MOOD_SMOOTH);
    const side = sounding && right + left > 0 ? (right - left) / (right + left) : 0;
    this.balance = follow(this.balance, side, MOOD_SMOOTH);

    this.sinceAnswer += dt;
    if (this.sinceAnswer >= TEMPO_EVERY) {
      this.sinceAnswer = 0;
      const bpm = this.beats.tempo;
      // Through a part of the song with no beat, the tempo stays as it was.
      if (bpm === undefined) this.answers = sounding ? this.answers : [];
      else if (this.answers.push(bpm) > TEMPO_ANSWERS) this.answers.shift();
    }
    if (this.answers.length === 0) {
      this.pace = 0;
    } else {
      const sorted = [...this.answers].sort((a, b) => a - b);
      const bpm = sorted[Math.floor(sorted.length / 2)]!;
      const pace = clamp((bpm - SLOW) / (FAST - SLOW), 0, 1);
      // The first beat found is taken as it is; after that the tempo glides.
      this.pace = this.pace === 0 ? pace : follow(this.pace, pace, TEMPO_SMOOTH);
    }
  }

  /**
   * How noise-like a spectrum is, 0–1. In each octave-wide band it compares the typical power of a
   * frequency with the average: a note is a few strong frequencies among weak ones, noise is much
   * the same all over. The bands count by how much sound they hold.
   */
  private noisiness(power: Float64Array): number {
    const hz = this.sampleRate / SPECTRUM_BLOCK;
    let flat = 0;
    let all = 0;
    for (let b = 0; b < ROUGH_BANDS; b++) {
      const from = Math.round((ROUGH_FROM * 2 ** b) / hz);
      const to = Math.min(Math.round((ROUGH_FROM * 2 ** (b + 1)) / hz), BINS);
      if (to - from < 4) continue;
      let sum = 0;
      let logs = 0;
      for (let k = from; k < to; k++) {
        sum += power[k]!;
        logs += Math.log(power[k]! + 1e-20);
      }
      if (sum <= 0) continue;
      const mean = sum / (to - from);
      flat += sum * (Math.exp(logs / (to - from)) / mean);
      all += sum;
    }
    return all <= FLOOR * FLOOR ? 0 : clamp(flat / all / NOISE, 0, 1);
  }

  private split(ring: Float32Array, out: Float64Array): void {
    for (let i = 0; i < BLOCK; i++) this.x[i] = toInt16(ring[(this.next + i) % BLOCK]!);
    octaves(this.x, out);
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi);
}
