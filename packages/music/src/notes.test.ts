import { describe, expect, it } from "vitest";
import { MusicAnalyser } from "./analyser.js";
import { noteAngle } from "./notes.js";

const RATE = 44100;
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** A note's frequency: `hz("A", 4)` is 440. */
function hz(name: string, octave: number): number {
  return 440 * 2 ** ((NAMES.indexOf(name) - 9) / 12 + octave - 4);
}

/** A note with a few overtones, as an instrument has. */
const voice = (f: number) => (t: number) =>
  [1, 0.5, 0.33, 0.2].reduce((s, a, i) => s + a * Math.sin(2 * Math.PI * f * (i + 1) * t), 0) / 2;

const chord =
  (names: readonly string[], octave = 4) =>
  (t: number): number =>
    names.reduce((s, n) => s + voice(hz(n, octave))(t), 0) / names.length;

/** Chords one after another, a second each, round and round. */
const chords =
  (list: readonly (readonly string[])[]) =>
  (t: number): number =>
    chord(list[Math.floor(t) % list.length]!)(t);

/** Noise that's the same every run. */
function noise(amplitude: number): () => number {
  let seed = 12345;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return amplitude * (seed / 2 ** 31 - 1);
  };
}

function listen(seconds: number, signal: (t: number) => number): MusicAnalyser["music"] {
  const a = new MusicAnalyser(RATE);
  const chunk = new Float32Array(128);
  const total = Math.round(seconds * RATE);
  for (let start = 0; start < total; start += chunk.length) {
    for (let i = 0; i < chunk.length; i++) chunk[i] = signal((start + i) / RATE);
    a.push(chunk);
  }
  return a.music;
}

/** The angle between two directions on the wheel, 0–180. */
function apart(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

describe("noteAngle", () => {
  it("puts notes a fifth apart next to each other, from C at 0", () => {
    expect(["C", "G", "D", "A", "E", "B"].map((n) => noteAngle(NAMES.indexOf(n)))).toEqual([
      0, 30, 60, 90, 120, 150,
    ]);
    expect(noteAngle(NAMES.indexOf("F"))).toBe(330);
  });
});

describe("the note inputs", () => {
  it("are all 0 in silence", () => {
    const m = listen(2, () => 0);
    expect([m.note, m.clear, m.key, m.major, m.pitch]).toEqual([0, 0, 0, 0, 0]);
  });

  it("read a single note at its place on the wheel, clearly", () => {
    const a = listen(3, (t) => 0.5 * Math.sin(2 * Math.PI * 440 * t));
    expect(apart(a.note, noteAngle(NAMES.indexOf("A")))).toBeLessThan(2);
    expect(a.clear).toBeGreaterThan(0.95);
    // A low note with overtones: the overtones pull it a little towards the next note round.
    const e = listen(3, voice(hz("E", 2)));
    expect(apart(e.note, noteAngle(NAMES.indexOf("E")))).toBeLessThan(10);
    expect(e.clear).toBeGreaterThan(0.9);
  });

  it("read a chord between its notes, less clearly than one note", () => {
    const m = listen(4, chord(["C", "E", "G"]));
    expect(m.note).toBeGreaterThan(20);
    expect(m.note).toBeLessThan(80);
    expect(m.clear).toBeGreaterThan(0.4);
    expect(m.clear).toBeLessThan(0.8);
  });

  it("read noise as no clear note, and a chord through noise as nearly as clear", () => {
    expect(listen(3, noise(0.4)).clear).toBeLessThan(0.15);
    const hiss = noise(0.3);
    const m = listen(4, (t) => 0.5 * chord(["C", "E", "G"])(t) + hiss());
    expect(m.clear).toBeGreaterThan(0.4);
  });

  it("find the key of a tune in a major key", () => {
    const c = listen(
      16,
      chords([
        ["C", "E", "G"],
        ["F", "A", "C"],
        ["G", "B", "D"],
        ["C", "E", "G"],
      ]),
    );
    expect(apart(c.key, noteAngle(NAMES.indexOf("C")))).toBeLessThan(5);
    expect(c.major).toBeGreaterThan(0.7);
    const d = listen(
      16,
      chords([
        ["D", "F#", "A"],
        ["A", "C#", "E"],
        ["B", "D", "F#"],
        ["G", "B", "D"],
      ]),
    );
    expect(apart(d.key, noteAngle(NAMES.indexOf("D")))).toBeLessThan(5);
    expect(d.major).toBeGreaterThan(0.6);
  });

  it("read a minor key as minor, at the major key with the same notes", () => {
    const m = listen(
      16,
      chords([
        ["A", "C", "E"],
        ["D", "F", "A"],
        ["E", "G#", "B"],
        ["A", "C", "E"],
      ]),
    );
    expect(m.major).toBeLessThan(0.2);
    expect(apart(m.key, noteAngle(NAMES.indexOf("C")))).toBeLessThan(5);
  });

  it("read a tune that climbs an octave as higher", () => {
    const m = listen(6, (t) => voice(hz("C", t < 4 ? 4 : 5))(t));
    expect(m.pitch).toBeGreaterThan(0.8);
    const down = listen(6, (t) => voice(hz("C", t < 4 ? 5 : 4))(t));
    expect(down.pitch).toBeLessThan(0.2);
  });
});
