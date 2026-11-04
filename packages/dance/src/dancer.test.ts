import type { DanceStyle } from "@genocode/core";
import { describe, expect, it } from "vitest";
import { Dancer } from "./dancer.js";

/** Runs a dancer for `seconds` at 60 frames a second, with a style that may change over time. */
function dance(d: Dancer, seconds: number, style: (t: number) => DanceStyle): void {
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i++) d.step(style(i / 60), 1 / 60);
}

const angleOf = (q: number[]) => (2 * Math.acos(Math.min(1, Math.abs(q[3]!))) * 180) / Math.PI;

describe("Dancer", () => {
  it("pushes the morph with the music, speeding up fast and coasting to a stop", () => {
    const d = new Dancer();
    const morph = (input: number): DanceStyle => ({ morph: { input, speed: 1, settle: 2 } });
    dance(d, 0.25, () => morph(1));
    // Up to full speed in a tenth of `settle`, then a creature a second.
    expect(d.morph).toBeGreaterThan(0.12);
    dance(d, 1, () => morph(1));
    const before = d.morph;
    dance(d, 3, () => morph(0));
    // Coasts from 1 a second to a stop over 2 seconds: about 1 more creature.
    expect(d.morph - before).toBeCloseTo(1, 1);
    const stopped = d.morph;
    dance(d, 1, () => morph(0));
    expect(d.morph).toBe(stopped);
  });

  it("brings the creature in with the music and lets it drift back", () => {
    const d = new Dancer();
    const zoom = (input: number): DanceStyle => ({ zoom: { input, amount: 0.5, settle: 10 } });
    dance(d, 0.5, () => zoom(1));
    expect(d.nearness).toBeCloseTo(0.5, 2);
    dance(d, 5, () => zoom(0));
    expect(d.nearness).toBeCloseTo(0.25, 1);
  });

  it("spins at the speed its input asks for, when there's nothing to turn it", () => {
    const d = new Dancer();
    dance(d, 0.5, () => ({ spin: { input: 0.5, from: 0, to: 120, smooth: 0 } }));
    expect(angleOf(d.orientation)).toBeCloseTo(30, 0);
  });

  it("turns the spin to a new axis when its input moves far enough", () => {
    let calls = 0;
    const d = new Dancer(() => (calls++ % 3) / 3);
    const style = (input: number): DanceStyle => ({
      spin: { input: 1, from: 10, to: 90, smooth: 0 },
      turn: { input, when: "changes", by: 0.5, bursts: undefined },
    });
    dance(d, 0.1, () => style(0));
    expect(d.spin.speed).toBe(10);
    expect(calls).toBe(0);
    dance(d, 0.1, () => style(0.4));
    expect(calls).toBe(0);
    dance(d, 0.1, () => style(0.6));
    expect(calls).toBe(3);
    expect(d.spin.speed).toBe(90);
  });

  it("swings smoothly to the new axis and speed", () => {
    const d = new Dancer(() => 1);
    const style = (input: number): DanceStyle => ({
      spin: { input: 1, from: 0, to: 100, smooth: 1 },
      turn: { input, when: "rises", by: 0.5, bursts: undefined },
    });
    dance(d, 0.1, () => style(1));
    dance(d, 0.4, () => style(1));
    expect(d.spin.speed).toBeGreaterThan(30);
    expect(d.spin.speed).toBeLessThan(70);
    dance(d, 1, () => style(1));
    expect(d.spin.speed).toBe(100);
  });

  it("reverses the morph on drops only, in bursts", () => {
    const d = new Dancer();
    const style = (input: number): DanceStyle => ({
      morph: { input: 1, speed: 1, settle: 1 },
      reverse: { input, when: "drops", by: 0.5, bursts: { on: 1, off: 1 } },
    });
    const flips: boolean[] = [];
    for (const level of [1, 0, 1, 0, 1, 0]) {
      dance(d, 0.1, () => style(level));
      flips.push(d.reversed);
    }
    // Rises never count. Drops: the first works, the next rests, the next works.
    expect(flips).toEqual([false, true, true, true, true, false]);
  });

  it("stays face-on, spinning only about the line of sight, when kept face-on", () => {
    const d = new Dancer(() => 0.9);
    d.faceOn = true;
    let input = 0;
    for (let i = 0; i < 200; i++) {
      input = i % 7 === 0 ? 1 - input : input;
      d.step(
        {
          spin: { input: 0.5, from: 90, to: 360, smooth: 0.3 },
          turn: { input, when: "changes", by: 0.5 },
          flat: { input, when: "changes", by: 0.5, bursts: { on: 1, off: 1 } },
        },
        0.05,
      );
      const [x, y] = d.orientation;
      expect(d.flat).toBe(true);
      expect(Math.hypot(x, y)).toBeLessThan(1e-9);
    }
  });

  it("starts in 3D, goes flat after its rest, and comes out after its burst", () => {
    const d = new Dancer();
    const style = (input: number): DanceStyle => ({
      spin: { input: 0, from: 30, to: 30, smooth: 0 },
      flat: { input, when: "changes", by: 0.5, bursts: { on: 2, off: 2 } },
    });
    dance(d, 0.1, () => style(0));
    expect(d.flat).toBe(false);
    dance(d, 0.1, () => style(1));
    dance(d, 0.1, () => style(0));
    expect(d.flat).toBe(false);
    dance(d, 0.1, () => style(1));
    expect(d.flat).toBe(true);
    expect(d.spin.axis[2]).toBeCloseTo(1);
    dance(d, 0.1, () => style(0));
    expect(d.flat).toBe(true);
    dance(d, 0.1, () => style(1));
    expect(d.flat).toBe(false);
  });

  it("keeps an upright spin about the up axis, turns reversing it and flat never tipping it", () => {
    const d = new Dancer(() => 0.9);
    const directions: number[] = [];
    let input = 0;
    for (let i = 0; i < 200; i++) {
      input = i % 7 === 0 ? 1 - input : input;
      d.step(
        {
          spin: { input: 0.5, from: 90, to: 360, smooth: 0.3, upright: true },
          turn: { input, when: "changes", by: 0.5, bursts: undefined },
          flat: { input, when: "changes", by: 0.5, bursts: { on: 1, off: 1 } },
        },
        0.05,
      );
      const [x, , z] = d.orientation;
      expect(d.flat).toBe(false);
      expect(Math.hypot(x, z)).toBeLessThan(1e-9);
      directions.push(Math.sign(d.spin.speed));
    }
    expect(directions).toContain(1);
    expect(directions).toContain(-1);
  });

  it("rights a tumbling creature when the style turns upright", () => {
    const d = new Dancer(() => 0.2);
    const style = (input: number, upright: boolean): DanceStyle => ({
      spin: { input: 1, from: 120, to: 120, smooth: 0.5, upright },
      turn: { input, when: "changes", by: 0.5, bursts: undefined },
    });
    dance(d, 0.1, () => style(0, false));
    dance(d, 1, () => style(1, false));
    expect(Math.hypot(d.orientation[0], d.orientation[2])).toBeGreaterThan(0.05);
    dance(d, 3, () => style(1, true));
    expect(Math.hypot(d.orientation[0], d.orientation[2])).toBeLessThan(1e-3);
    expect(d.spin.axis[1]).toBeCloseTo(1);
  });

  it("does nothing without a style", () => {
    const d = new Dancer();
    dance(d, 1, () => ({}));
    expect(d.morph).toBe(0);
    expect(d.nearness).toBe(0);
    expect(d.orientation).toEqual([0, 0, 0, 1]);
  });
});
