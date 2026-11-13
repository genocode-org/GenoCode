// Which notes are sounding: the music inputs note, clear, key, major and pitch (docs/LANGUAGE.md
// section 16). The sound is slowed to a quarter of its sample rate, so that a spectrum tells
// notes a semitone apart down to about 90 Hz, and the peaks of each spectrum are gathered into the
// twelve notes of the octave.
//
// Notes are placed round a wheel by fifths (C, G, D, A, E, B, F♯, C♯, G♯, D♯, A♯, F), so notes and
// keys that sound close sit next to each other, and the wheel's angle is a colour's hue: C is 0.

import { BINS, SPECTRUM_BLOCK, spectrum } from "./fft.js";

/** How many samples are averaged into one. */
const SLOWER = 4;
/** Slowed samples between spectra. */
const NOTES_HOP = SPECTRUM_BLOCK / 8;
/** The frequencies listened to for notes. */
const LOWEST = 65;
const HIGHEST = 2100;
/** The frequencies listened to for how high the tune sits. */
const TUNE_LOWEST = 180;
/** C0 in Hz, with A at 440. */
const C0 = 440 * 2 ** (-57 / 12);
/** A peak counts as a note when it stands this many times above the sound around it. */
const STANDS_OUT = 4;
/** Bins each side that "the sound around it" covers. */
const AROUND = 12;
/** Seconds the notes of the moment take to follow the music. */
const NOTE_SMOOTH = 0.2;
/** Seconds of music the key is judged from, and seconds `key` and `major` take to glide. */
const KEY_MEMORY = 20;
const KEY_SMOOTH = 2;
/** How far apart the best major and minor keys' fits are when `major` reads fully 1 or 0. */
const MODE_RANGE = 0.3;
/** Seconds of the tune's height that `pitch` is measured against, and the seconds it takes. */
const PITCH_MEMORY = 20;
const PITCH_SMOOTH = 0.3;
/** Octaves above and below its usual height that read as `pitch` 1 and 0. */
const PITCH_RANGE = 0.5;
/** The share of the sound that notes hold when `clear` can read fully 1. */
const TONAL = 0.5;

/**
 * How well each note of the scale fits a major and a minor key, from its key note upwards
 * (Krumhansl and Kessler's listening tests).
 */
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

/** A note's angle on the wheel, in degrees: notes a fifth apart are 30° apart. */
export function noteAngle(note: number): number {
  return ((((note * 7) % 12) + 12) % 12) * 30;
}

export interface NoteInputs {
  note: number;
  clear: number;
  key: number;
  major: number;
  pitch: number;
}

export class Notes {
  private readonly ring = new Float32Array(SPECTRUM_BLOCK);
  private next = 0;
  private filled = 0;
  private sinceSpectrum = 0;
  private sum = 0;
  private summed = 0;
  private readonly power = new Float64Array(BINS);
  /** How strongly each of the twelve notes sounds now (C first), and over the last while. */
  private readonly now = new Float64Array(12);
  private readonly lately = new Float64Array(12);
  private heard = 0;
  // Points on the wheel that `note` and `key` are the directions of.
  private noteX = 0;
  private noteY = 0;
  private keyX = 0;
  private keyY = 0;
  private mode = 0.5;
  private usual = 0;
  private usualHeard = 0;
  private height = 0;
  private current: NoteInputs = { note: 0, clear: 0, key: 0, major: 0, pitch: 0 };
  private readonly rate: number;

  constructor(sampleRate: number) {
    this.rate = sampleRate / SLOWER;
  }

  /** The note inputs, as of the latest spectrum. */
  get inputs(): NoteInputs {
    return this.current;
  }

  /** How strongly each of the twelve notes sounds now, C first: for showing and testing. */
  get strengths(): Float64Array {
    return this.now;
  }

  /** Adds one sample (−1..1) of both sides mixed. */
  push(sample: number): void {
    this.sum += sample;
    if (++this.summed < SLOWER) return;
    this.ring[this.next] = this.sum / SLOWER;
    this.next = (this.next + 1) % SPECTRUM_BLOCK;
    this.sum = 0;
    this.summed = 0;
    if (this.filled < SPECTRUM_BLOCK) this.filled++;
    if (++this.sinceSpectrum >= NOTES_HOP && this.filled === SPECTRUM_BLOCK) {
      this.sinceSpectrum = 0;
      this.listen(spectrum(this.ring, this.next, this.power), NOTES_HOP / this.rate);
    }
  }

  private listen(power: Float64Array, dt: number): void {
    const hz = this.rate / SPECTRUM_BLOCK;
    const from = Math.max(AROUND + 1, Math.round(LOWEST / hz));
    const to = Math.min(BINS - AROUND - 2, Math.round(HIGHEST / hz));
    const found = new Float64Array(12);
    let tonal = 0;
    let total = 0;
    let high = 0;
    let highWeight = 0;
    // The sound around each bin: a running sum over AROUND bins each side.
    let around = 0;
    for (let k = from - AROUND; k <= from + AROUND; k++) around += power[k]!;
    for (let k = from; k <= to; k++) {
      const p = power[k]!;
      total += p;
      if (p > power[k - 1]! && p >= power[k + 1]! && p * (2 * AROUND + 1) > STANDS_OUT * around) {
        // Between whole bins: the top of a parabola through the peak and its neighbours.
        const a = Math.log(power[k - 1]! + 1e-30);
        const b = Math.log(p + 1e-30);
        const c = Math.log(power[k + 1]! + 1e-30);
        const bend = a - 2 * b + c;
        const f = (k + (bend < 0 ? (0.5 * (a - c)) / bend : 0)) * hz;
        const all = power[k - 1]! + p + power[k + 1]!;
        const semitones = 12 * Math.log2(f / C0);
        const nearest = Math.round(semitones);
        // Peaks between two notes count for less; amplitude rather than power, so one loud note
        // doesn't drown the rest.
        const tuned = 1 - 2 * Math.abs(semitones - nearest);
        const strength = Math.sqrt(all) * tuned;
        found[((nearest % 12) + 12) % 12]! += strength;
        tonal += all;
        if (f >= TUNE_LOWEST) {
          high += strength * Math.log2(f);
          highWeight += strength;
        }
      }
      around += power[k + AROUND + 1]! - power[k - AROUND]!;
    }

    const sounding = total > 1e-9;
    const follow = (seconds: number): number => 1 - Math.exp(-dt / seconds);
    let sum = 0;
    for (let n = 0; n < 12; n++) {
      this.now[n]! += (found[n]! - this.now[n]!) * follow(NOTE_SMOOTH);
      sum += this.now[n]!;
    }

    // The note of the moment: the direction the sounding notes pull in, round the wheel.
    let x = 0;
    let y = 0;
    for (let n = 0; n < 12; n++) {
      const angle = (noteAngle(n) * Math.PI) / 180;
      x += this.now[n]! * Math.cos(angle);
      y += this.now[n]! * Math.sin(angle);
    }
    const share = sounding ? Math.min(1, tonal / total / TONAL) : 0;
    const oneSided = sum > 1e-9 ? Math.hypot(x, y) / sum : 0;
    const clear = oneSided * share;
    if (sum > 1e-9) {
      this.noteX += (x / sum - this.noteX) * follow(NOTE_SMOOTH);
      this.noteY += (y / sum - this.noteY) * follow(NOTE_SMOOTH);
    }

    // The key: the notes of the last while, matched against every major and minor key.
    let major = this.mode;
    if (sum > 1e-9 && share > 0.15) {
      this.heard = Math.min(this.heard + dt, KEY_MEMORY);
      const take = dt / Math.max(this.heard, dt);
      for (let n = 0; n < 12; n++) this.lately[n]! += (this.now[n]! / sum - this.lately[n]!) * take;
      let bestMajor = -1;
      let bestMinor = -1;
      let home = 0;
      let best = -1;
      for (let n = 0; n < 12; n++) {
        const asMajor = fit(this.lately, MAJOR, n);
        const asMinor = fit(this.lately, MINOR, n);
        bestMajor = Math.max(bestMajor, asMajor);
        bestMinor = Math.max(bestMinor, asMinor);
        if (asMajor > best) {
          best = asMajor;
          home = n;
        }
        // A minor key reads as the major key with the same notes, three semitones up.
        if (asMinor > best) {
          best = asMinor;
          home = (n + 3) % 12;
        }
      }
      major = clamp(0.5 + (bestMajor - bestMinor) / (2 * MODE_RANGE), 0, 1);
      const angle = (noteAngle(home) * Math.PI) / 180;
      const first = this.keyX === 0 && this.keyY === 0;
      const glide = first ? 1 : follow(KEY_SMOOTH);
      this.keyX += (Math.cos(angle) - this.keyX) * glide;
      this.keyY += (Math.sin(angle) - this.keyY) * glide;
      this.mode = first ? major : this.mode + (major - this.mode) * glide;
    }

    // How high the tune sits, against where it has been sitting.
    let pitch = 0;
    if (highWeight > 1e-9) {
      const at = high / highWeight;
      this.usualHeard = Math.min(this.usualHeard + dt, PITCH_MEMORY);
      this.usual += (at - this.usual) * (dt / Math.max(this.usualHeard, dt));
      pitch = clamp(0.5 + (at - this.usual) / (2 * PITCH_RANGE), 0, 1);
      this.height += (pitch - this.height) * follow(PITCH_SMOOTH);
    } else {
      this.height += (0 - this.height) * follow(PITCH_SMOOTH);
    }

    const heardKey = this.keyX !== 0 || this.keyY !== 0;
    this.current = {
      note: sounding ? degrees(this.noteX, this.noteY) : 0,
      clear: this.current.clear + (clear - this.current.clear) * follow(NOTE_SMOOTH),
      key: sounding && heardKey ? degrees(this.keyX, this.keyY) : 0,
      major: sounding && heardKey ? this.mode : 0,
      pitch: sounding ? this.height : 0,
    };
    if (!sounding && this.current.clear < 1e-4) this.current.clear = 0;
  }
}

/** How well the notes fit a key whose key note is `home`: −1 to 1. */
function fit(notes: Float64Array, profile: readonly number[], home: number): number {
  let meanN = 0;
  let meanP = 0;
  for (let i = 0; i < 12; i++) {
    meanN += notes[i]! / 12;
    meanP += profile[i]! / 12;
  }
  let both = 0;
  let nn = 0;
  let pp = 0;
  for (let i = 0; i < 12; i++) {
    const n = notes[(home + i) % 12]! - meanN;
    const p = profile[i]! - meanP;
    both += n * p;
    nn += n * n;
    pp += p * p;
  }
  return nn <= 0 ? 0 : both / Math.sqrt(nn * pp);
}

/** The direction of a point, 0–360. */
function degrees(x: number, y: number): number {
  const d = (Math.atan2(y, x) * 180) / Math.PI;
  return ((d % 360) + 360) % 360;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi);
}
