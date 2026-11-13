import { describe, expect, it } from "vitest";
import { BINS, SPECTRUM_BLOCK, spectrum } from "./fft.js";

const RATE = 44100;

function sine(hz: number, amplitude: number): Float32Array {
  const x = new Float32Array(SPECTRUM_BLOCK);
  for (let i = 0; i < x.length; i++) x[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / RATE);
  return x;
}

describe("spectrum", () => {
  it("puts a note at its frequency, with a full-scale sine adding up to 1", () => {
    const power = spectrum(sine(1000, 1));
    let top = 0;
    let sum = 0;
    for (let k = 0; k < BINS; k++) {
      if (power[k]! > power[top]!) top = k;
      sum += power[k]!;
    }
    expect((top * RATE) / SPECTRUM_BLOCK).toBeCloseTo(1000, -1);
    expect(sum).toBeCloseTo(1, 2);
  });

  it("gives a quarter of the power for half the amplitude", () => {
    const sum = (p: Float64Array): number => p.reduce((s, v) => s + v, 0);
    expect(sum(spectrum(sine(440, 0.5)))).toBeCloseTo(0.25, 2);
  });

  it("reads a ring from where it's told to start", () => {
    const x = sine(1000, 1);
    const turned = new Float32Array(SPECTRUM_BLOCK);
    for (let i = 0; i < x.length; i++) turned[(i + 100) % x.length] = x[i]!;
    const a = spectrum(x);
    const b = spectrum(turned, 100, new Float64Array(BINS));
    expect([...b]).toEqual([...a]);
  });

  it("is silent for silence", () => {
    expect(spectrum(new Float32Array(SPECTRUM_BLOCK)).every((v) => v === 0)).toBe(true);
  });
});
