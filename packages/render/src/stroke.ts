// Turns a stroke (docs/LANGUAGE.md section 12.1) into triangles: one smooth tube through its
// points, with rounded ends. Plain numbers, in world space, so the WebGL view and the software
// renderer draw the same thing.
//
// Between two points the middle of the tube follows a cubic Hermite curve, like a thread pulled
// through beads: at each point it runs the way from the point before to the point after (at the
// ends, towards the only neighbour), with a pull as long as the distance between the two points.
// Only where the points are matters, not which way the turtle faced, so a loop that turns before it
// moves and one that turns after give the same smooth curve. The cross-section is an ellipse whose axes come from each point's side
// and up axes (so `grow` makes it wider, flatter or turns it, and a `roll` twists it), blended from
// one point to the next and kept square to the curve. Colours blend as `mix` does, and shine and
// sharpness in a straight line.

import { mixColour, toRgb, type Colour, type StrokePoint } from "@genocode/core";
import type { Detail } from "./geometry.js";

type V3 = [number, number, number];

export interface StrokeMesh {
  position: Float32Array;
  normal: Float32Array;
  /** Red, green and blue, 0 to 1, in sRGB as `toRgb` gives them. */
  colour: Float32Array;
  /** Shine, sharpness, alpha and 0 (no texture sheen), as the shapes carry them. */
  look: Float32Array;
  index: Uint32Array;
}

/** Rings along each piece between two points, and corners round each ring. */
const STEPS = { high: 10, low: 5 };
const SIDES = { high: 16, low: 8 };
/** Rings in each rounded end, from its edge to its tip. */
const CAP_RINGS = { high: 5, low: 3 };

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const length = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const lerp3 = (a: V3, b: V3, t: number): V3 => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];
function unit(a: V3, fallback: V3): V3 {
  const l = length(a);
  return l > 1e-9 && Number.isFinite(l) ? scale(a, 1 / l) : fallback;
}
/** `a` with its part along unit vector `n` taken away. */
const flatten = (a: V3, n: V3): V3 => sub(a, scale(n, dot(a, n)));

/** What the tube is like at one point: where, which way it runs, its section and its look. */
interface Section {
  at: V3;
  along: V3;
  side: V3;
  up: V3;
  /** Half the width along `side` and along `up`. */
  rx: number;
  ry: number;
  colour: Colour;
  shine: number;
  sharpness: number;
}

function column(m: readonly number[], i: number): V3 {
  return [m[i * 4]!, m[i * 4 + 1]!, m[i * 4 + 2]!];
}

function section(p: StrokePoint): Section {
  const m = p.matrix;
  const x = column(m, 0);
  const y = column(m, 1);
  return {
    at: [m[12]!, m[13]!, m[14]!],
    along: [0, 0, 1],
    side: x,
    up: y,
    rx: length(x) / 2,
    ry: length(y) / 2,
    colour: p.colour,
    shine: p.shine,
    sharpness: p.sharpness,
  };
}

/**
 * The points as sections, leaving out any that sit where the one before does, each with the way
 * the tube runs there: from the point before to the point after.
 */
function sections(points: readonly StrokePoint[]): Section[] {
  const out: Section[] = [];
  for (const p of points) {
    if (!p.matrix.every(Number.isFinite)) continue;
    const s = section(p);
    const last = out[out.length - 1];
    if (last && length(sub(s.at, last.at)) < 1e-9) continue;
    out.push(s);
  }
  out.forEach((s, i) => {
    const before = out[i - 1] ?? s;
    const after = out[i + 1] ?? s;
    s.along = unit(sub(after.at, before.at), [0, 0, 1]);
  });
  return out;
}

/** A ring of the tube: its middle, the way along, its section's axes and look. */
interface Ring {
  at: V3;
  along: V3;
  side: V3;
  up: V3;
  rx: number;
  ry: number;
  colour: [number, number, number, number];
  shine: number;
  sharpness: number;
}

/** A colour as red, green, blue (sRGB, 0 to 1) and alpha. */
function rgba(c: Colour): [number, number, number, number] {
  const [r, g, b] = toRgb(c);
  return [r, g, b, c.a];
}

/** The ring `t` (0 to 1) of the way from section `a` to section `b`. */
function ringBetween(a: Section, b: Section, t: number, previous: Ring | undefined): Ring {
  const d = length(sub(b.at, a.at));
  const ta = scale(a.along, d);
  const tb = scale(b.along, d);
  const t2 = t * t;
  const t3 = t2 * t;
  // The Hermite curve and its slope.
  const at = add(
    add(scale(a.at, 2 * t3 - 3 * t2 + 1), scale(ta, t3 - 2 * t2 + t)),
    add(scale(b.at, -2 * t3 + 3 * t2), scale(tb, t3 - t2)),
  );
  const slope = add(
    add(scale(a.at, 6 * t2 - 6 * t), scale(ta, 3 * t2 - 4 * t + 1)),
    add(scale(b.at, -6 * t2 + 6 * t), scale(tb, 3 * t2 - 2 * t)),
  );
  const along = unit(slope, unit(sub(b.at, a.at), a.along));
  // The section's axes, blended and kept square to the curve. If the blend cancels out (a half
  // turn of roll between two points), the last ring's side carries on.
  const side = unit(
    flatten(lerp3(unit(a.side, [1, 0, 0]), unit(b.side, [1, 0, 0]), t), along),
    previous
      ? unit(flatten(previous.side, along), [1, 0, 0])
      : unit(flatten(a.side, along), [1, 0, 0]),
  );
  // Up is square to both. Which way it points doesn't change the ellipse; this way, side, up and
  // along are right-handed, which the winding below relies on.
  const up = cross(along, side);
  return {
    at,
    along,
    side,
    up,
    rx: lerp(a.rx, b.rx, t),
    ry: lerp(a.ry, b.ry, t),
    colour: rgba(mixColour(a.colour, b.colour, t)),
    shine: lerp(a.shine, b.shine, t),
    sharpness: lerp(a.sharpness, b.sharpness, t),
  };
}

/** The tube for a stroke's points, or undefined if they don't make one (fewer than two places). */
export function strokeMesh(
  points: readonly StrokePoint[],
  detail: Detail = "high",
): StrokeMesh | undefined {
  const all = sections(points);
  if (all.length < 2) return undefined;
  const steps = STEPS[detail];
  const sides = SIDES[detail];
  const capRings = CAP_RINGS[detail];

  // The rings down the tube.
  const rings: Ring[] = [];
  for (let i = 0; i + 1 < all.length; i++) {
    for (let k = i === 0 ? 0 : 1; k <= steps; k++) {
      rings.push(ringBetween(all[i]!, all[i + 1]!, k / steps, rings[rings.length - 1]));
    }
  }

  // Every corner and triangle is counted first and written straight into its array: building the
  // tube is done again for every frame while dancing, so it has to be quick.
  const ringCount = 2 * capRings + rings.length;
  const position = new Float32Array(ringCount * sides * 3);
  const normal = new Float32Array(ringCount * sides * 3);
  const colour = new Float32Array(ringCount * sides * 3);
  const look = new Float32Array(ringCount * sides * 4);
  const index = new Uint32Array((ringCount - 1) * sides * 6);
  const cos = new Float64Array(sides);
  const sin = new Float64Array(sides);
  for (let j = 0; j < sides; j++) {
    const angle = (2 * Math.PI * j) / sides;
    cos[j] = Math.cos(angle);
    sin[j] = Math.sin(angle);
  }
  let corners = 0;
  let corner3 = 0;
  let corner4 = 0;
  let joined = 0;

  /**
   * Adds a ring of corners: `bulge` (0 to 1) moves it along the tube by that much of its width
   * and shrinks it to match, for the rounded ends; `out` is +1 or −1, which end it belongs to.
   */
  const ring = (r: Ring, bulge = 0, out = 0): void => {
    const shrink = Math.sqrt(Math.max(0, 1 - bulge * bulge));
    const reach = Math.min(r.rx, r.ry) * bulge * out;
    const [atx, aty, atz] = r.at;
    const [lx, ly, lz] = r.along;
    const [sx, sy, sz] = r.side;
    const [ux, uy, uz] = r.up;
    // The middle, moved along the tube for a rounded end.
    const mx = atx + lx * reach;
    const my = aty + ly * reach;
    const mz = atz + lz * reach;
    const toEnd = (bulge * out) / Math.max(Math.min(r.rx, r.ry), 1e-9);
    const [red, green, blue, alpha] = r.colour;
    for (let j = 0; j < sides; j++) {
      const c = cos[j]!;
      const s = sin[j]!;
      const ks = r.rx * shrink * c;
      const ku = r.ry * shrink * s;
      position[corner3] = mx + (sx * ks + ux * ku);
      position[corner3 + 1] = my + (sy * ks + uy * ku);
      position[corner3 + 2] = mz + (sz * ks + uz * ku);
      // The ellipse's outward direction, tipping along the tube on the rounded ends.
      const ns = (shrink * c) / Math.max(r.rx, 1e-9);
      const nu = (shrink * s) / Math.max(r.ry, 1e-9);
      let nx = sx * ns + ux * nu + lx * toEnd;
      let ny = sy * ns + uy * nu + ly * toEnd;
      let nz = sz * ns + uz * nu + lz * toEnd;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (l > 1e-9 && Number.isFinite(l)) {
        const k = 1 / l;
        nx *= k;
        ny *= k;
        nz *= k;
      } else {
        nx = sx;
        ny = sy;
        nz = sz;
      }
      normal[corner3] = nx;
      normal[corner3 + 1] = ny;
      normal[corner3 + 2] = nz;
      colour[corner3] = red;
      colour[corner3 + 1] = green;
      colour[corner3 + 2] = blue;
      look[corner4] = r.shine;
      look[corner4 + 1] = r.sharpness;
      look[corner4 + 2] = alpha;
      look[corner4 + 3] = 0;
      corner3 += 3;
      corner4 += 4;
    }
    corners += sides;
  };

  /** Joins the last two rings added. */
  const join = (): void => {
    const first = corners - 2 * sides;
    const second = first + sides;
    for (let j = 0; j < sides; j++) {
      const a = first + j;
      const b = first + ((j + 1) % sides);
      const c = second + j;
      const d = second + ((j + 1) % sides);
      // Side, up and along make a right-handed set, so this winding faces outwards.
      index[joined] = a;
      index[joined + 1] = b;
      index[joined + 2] = d;
      index[joined + 3] = a;
      index[joined + 4] = d;
      index[joined + 5] = c;
      joined += 6;
    }
  };

  const start = rings[0]!;
  const end = rings[rings.length - 1]!;
  // The rounded start, from its tip to the tube's first ring.
  for (let k = capRings; k > 0; k--) {
    ring(start, Math.sin((Math.PI / 2) * (k / capRings)), -1);
    if (k < capRings) join();
  }
  for (const r of rings) {
    ring(r);
    if (corners > sides) join();
  }
  // The rounded end, from the tube's last ring to its tip.
  for (let k = 1; k <= capRings; k++) {
    ring(end, Math.sin((Math.PI / 2) * (k / capRings)), 1);
    join();
  }

  return { position, normal, colour, look, index };
}
