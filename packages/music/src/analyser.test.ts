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
    // A second of silence is the music stopping.
    play(a, 1, () => 0, 2.05);
    expect(a.music.level).toBeLessThan(0.01);
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
});
