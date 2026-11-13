import { describe, expect, it } from "vitest";
import { MusicAnalyser } from "./analyser.js";

const RATE = 44100;

/** Plays a signal to an analyser and notes the most each shape input reached in each second. */
function listen(seconds: number, signal: (t: number) => number): Record<string, number>[] {
  const a = new MusicAnalyser(RATE);
  const chunk = new Float32Array(128);
  const most: Record<string, number>[] = [];
  const total = Math.round(seconds * RATE);
  for (let start = 0; start < total; start += chunk.length) {
    for (let i = 0; i < chunk.length; i++) chunk[i] = signal((start + i) / RATE);
    a.push(chunk);
    const second = (most[Math.floor(start / RATE)] ??= { quiet: 0, build: 0, drop: 0, change: 0 });
    for (const name of Object.keys(second)) {
      second[name] = Math.max(second[name]!, a.music[name as "quiet"]);
    }
  }
  return most;
}

/** The most an input reached between two times (whole seconds; `to` not included). */
function most(seconds: Record<string, number>[], name: string, from: number, to: number): number {
  return Math.max(...seconds.slice(from, to).map((s) => s[name]!));
}

const sine = (hz: number, t: number): number => Math.sin(2 * Math.PI * hz * t);
/** A soft chord. */
const pad = (t: number): number => 0.1 * (sine(262, t) + sine(330, t) + sine(392, t));
/** A kick drum on every beat, 120 beats a minute. */
const kick = (t: number): number => 0.7 * Math.exp(-(t % 0.5) * 25) * sine(60, t % 0.5);

describe("the song's shape", () => {
  it("is all 0 in silence, and stays near 0 through steady music", () => {
    const silent = listen(3, () => 0);
    for (const name of ["quiet", "build", "drop", "change"])
      expect(most(silent, name, 0, 3)).toBe(0);
    const steady = listen(30, (t) => pad(t) + kick(t));
    for (const name of ["quiet", "build", "drop", "change"]) {
      expect(most(steady, name, 0, 30)).toBeLessThan(0.25);
    }
  });

  it("reads a quiet part as quiet, and the drums coming back in as a drop", () => {
    // Drums and a chord, then the chord alone and softer, then the drums again.
    const heard = listen(30, (t) => (t < 12 || t >= 20 ? pad(t) + kick(t) : 0.3 * pad(t)));
    expect(most(heard, "quiet", 0, 12)).toBeLessThan(0.25);
    expect(most(heard, "quiet", 15, 20)).toBeGreaterThan(0.8);
    expect(most(heard, "drop", 0, 20)).toBeLessThan(0.1);
    expect(most(heard, "drop", 20, 22)).toBeGreaterThan(0.7);
    // The drop falls back, and the quiet is over.
    expect(heard[27]!.drop).toBeLessThan(0.1);
    expect(heard[27]!.quiet).toBeLessThan(0.25);
  });

  it("reads music that grows louder and brighter as a build", () => {
    // A steady chord, then eight seconds of hiss swelling over it.
    let seed = 12345;
    const hiss = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 31 - 1;
    };
    const heard = listen(20, (t) => pad(t) + (t < 10 ? 0 : ((t - 10) / 8) ** 2 * 0.5 * hiss()));
    expect(most(heard, "build", 4, 10)).toBeLessThan(0.2);
    expect(most(heard, "build", 13, 18)).toBeGreaterThan(0.6);
  });

  it("reads a new part of the song as a change", () => {
    // A low chord for a while, then a different, higher one.
    const other = (t: number): number => 0.1 * (sine(1109, t) + sine(1397, t) + sine(1661, t));
    const heard = listen(40, (t) => (t < 25 ? pad(t) : other(t)));
    expect(most(heard, "change", 0, 25)).toBeLessThan(0.1);
    expect(most(heard, "change", 25, 30)).toBeGreaterThan(0.7);
    expect(heard[39]!.change).toBeLessThan(0.1);
  });
});
