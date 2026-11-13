import { describe, expect, it } from "vitest";
import { MusicAnalyser } from "./analyser.js";

const RATE = 44100;

/** Feeds `seconds` of a signal to an analyser, in chunks like an audio callback's. */
function play(a: MusicAnalyser, seconds: number, signal: (t: number) => number, from = 0): void {
  const chunk = new Float32Array(128);
  const total = Math.round(seconds * RATE);
  for (let start = 0; start < total; start += chunk.length) {
    for (let i = 0; i < chunk.length; i++) chunk[i] = signal(from + (start + i) / RATE);
    a.push(chunk);
  }
}

const tone = (hz: number, amplitude: number) => (t: number) =>
  amplitude * Math.sin(2 * Math.PI * hz * t);

/** A kick drum on every beat: a falling low thump. */
const kicks = (bpm: number, amplitude: number) => (t: number) => {
  const since = t % (60 / bpm);
  return amplitude * Math.exp(-since * 25) * Math.sin(2 * Math.PI * 60 * since);
};

describe("MusicAnalyser", () => {
  it("reads silence as all zeros, with no beat", () => {
    const a = new MusicAnalyser(RATE);
    play(a, 2, () => 0);
    expect(Object.values(a.music).every((v) => v === 0)).toBe(true);
    expect(a.beat()).toBe(0);
    expect(a.tempo).toBeUndefined();
  });

  it("hears a low note in the bass, not the highs", () => {
    const a = new MusicAnalyser(RATE);
    play(a, 2, tone(80, 0.5));
    expect(a.music.bass).toBeGreaterThan(0.9);
    expect(a.music.level).toBeGreaterThan(0.9);
    expect(a.music.high).toBeLessThan(0.2);
  });

  it("hears a high note in the highs, not the bass", () => {
    const a = new MusicAnalyser(RATE);
    play(a, 2, tone(6000, 0.5));
    expect(a.music.high).toBeGreaterThan(0.9);
    expect(a.music.bass).toBeLessThan(0.2);
  });

  it("reads quiet and loud music the same once it has listened a while", () => {
    const loud = new MusicAnalyser(RATE);
    const quiet = new MusicAnalyser(RATE);
    play(loud, 3, tone(200, 0.8));
    play(quiet, 3, tone(200, 0.01));
    expect(quiet.music.mid).toBeCloseTo(loud.music.mid, 1);
    expect(quiet.music.level).toBeCloseTo(loud.music.level, 1);
  });

  it("keeps the loudness up through a short gap, and lets it fall when the music stops", () => {
    const a = new MusicAnalyser(RATE);
    play(a, 2, tone(200, 0.5));
    expect(a.music.level).toBeGreaterThan(0.9);
    // The bands drop at once in a 50 ms gap, as between notes; the loudness only dips.
    play(a, 0.05, () => 0, 2);
    expect(a.music.mid).toBe(0);
    expect(a.music.level).toBeGreaterThan(0.5);
    // Two seconds of silence is the music stopping.
    play(a, 2, () => 0, 2.05);
    expect(a.music.level).toBeLessThan(0.01);
  });

  it("keeps the loudness up between drum hits half a second apart, with silence between", () => {
    const a = new MusicAnalyser(RATE);
    play(a, 2, kicks(120, 0.8));
    let lowest = 1;
    for (let t = 2; t < 4; t += 0.01) {
      play(a, 0.01, kicks(120, 0.8), t);
      lowest = Math.min(lowest, a.music.level);
    }
    expect(lowest).toBeGreaterThan(0.2);
  });

  it("jumps on each kick and falls back between them", () => {
    const a = new MusicAnalyser(RATE);
    play(a, 4, kicks(120, 0.8));
    // Just after a kick, then just before the next.
    play(a, 0.03, kicks(120, 0.8), 4);
    const onKick = a.music.bass_hit;
    play(a, 0.4, kicks(120, 0.8), 4.03);
    const between = a.music.bass_hit;
    expect(onKick).toBeGreaterThan(0.6);
    expect(between).toBeLessThan(onKick / 2);
    expect(a.music.hit).toBeGreaterThan(0);
  });

  it("finds the tempo and where the beats fall", () => {
    const a = new MusicAnalyser(RATE);
    play(a, 8, kicks(120, 0.8));
    expect(a.tempo).toBeGreaterThan(117);
    expect(a.tempo).toBeLessThan(123);
    // At 8 s a kick is due: the beat should be near 0 (or just under 1).
    const b = a.beat(8);
    expect(Math.min(b, 1 - b)).toBeLessThan(0.15);
    expect(a.beat(8.25)).toBeCloseTo(0.5, 0);
  });

  it("follows a slower tempo too", () => {
    const a = new MusicAnalyser(RATE);
    play(a, 8, kicks(90, 0.8));
    expect(a.tempo).toBeGreaterThan(87);
    expect(a.tempo).toBeLessThan(93);
  });

  /** Feeds `seconds` of a signal for each side. */
  function playSides(
    a: MusicAnalyser,
    seconds: number,
    left: (t: number) => number,
    right: (t: number) => number,
  ): void {
    const l = new Float32Array(128);
    const r = new Float32Array(128);
    const total = Math.round(seconds * RATE);
    for (let start = 0; start < total; start += l.length) {
      for (let i = 0; i < l.length; i++) {
        l[i] = left((start + i) / RATE);
        r[i] = right((start + i) / RATE);
      }
      a.push(l, r);
    }
  }

  /** Noise that's the same every run. */
  const noise = (amplitude: number) => {
    let seed = 12345;
    return () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return amplitude * (seed / 2 ** 31 - 1);
    };
  };

  it("reads the tempo from the beat: 0.5 at 120 beats a minute", () => {
    const a = new MusicAnalyser(RATE);
    play(a, 12, kicks(120, 0.8));
    expect(a.music.tempo).toBeCloseTo(0.5, 1);
    const slow = new MusicAnalyser(RATE);
    play(slow, 12, kicks(75, 0.8));
    expect(slow.music.tempo).toBeCloseTo(0.125, 1);
  });

  it("reads a low note as dark and a high note as bright", () => {
    const low = new MusicAnalyser(RATE);
    play(low, 2, tone(80, 0.5));
    expect(low.music.bright).toBeLessThan(0.1);
    const high = new MusicAnalyser(RATE);
    play(high, 2, tone(6000, 0.5));
    expect(high.music.bright).toBeGreaterThan(0.9);
  });

  it("reads a pure note as smooth and noise as rough", () => {
    const note = new MusicAnalyser(RATE);
    play(note, 2, tone(440, 0.5));
    expect(note.music.rough).toBeLessThan(0.1);
    const hiss = new MusicAnalyser(RATE);
    play(hiss, 2, noise(0.5));
    expect(hiss.music.rough).toBeGreaterThan(0.85);
  });

  it("reads which side the sound comes from", () => {
    const silent = (): number => 0;
    const left = new MusicAnalyser(RATE);
    playSides(left, 2, tone(440, 0.5), silent);
    expect(left.music.balance).toBeLessThan(-0.95);
    const right = new MusicAnalyser(RATE);
    playSides(right, 2, silent, tone(440, 0.5));
    expect(right.music.balance).toBeGreaterThan(0.95);
    const middle = new MusicAnalyser(RATE);
    playSides(middle, 2, tone(440, 0.5), tone(440, 0.5));
    expect(middle.music.balance).toBeCloseTo(0, 5);
  });

  it("reads a quiet part after a loud one as low energy, though its level is high", () => {
    const a = new MusicAnalyser(RATE);
    play(a, 10, tone(200, 0.8));
    const loud = a.music.energy;
    expect(loud).toBeGreaterThan(0.6);
    play(a, 20, tone(200, 0.04), 10);
    expect(a.music.level).toBeGreaterThan(0.5);
    expect(a.music.energy).toBeLessThan(0.15);
  });
});
