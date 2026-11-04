// The turtle's frame: position, axes, size per axis and mirroring (docs/LANGUAGE.md section 11).
// The shape transform uses the same maths.

export type V3 = [number, number, number];

export interface Frame {
  pos: V3;
  /** Side (x), up (y) and heading (z), as unit vectors in the parent space. */
  ax: [V3, V3, V3];
  /** Size per axis; each belongs to the axis with the same index. */
  size: V3;
  mirrored: boolean;
}

export function newFrame(): Frame {
  return {
    pos: [0, 0, 0],
    ax: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    size: [1, 1, 1],
    mirrored: false,
  };
}

export function cloneFrame(f: Frame): Frame {
  const [x, y, z] = f.ax;
  return {
    pos: [f.pos[0], f.pos[1], f.pos[2]],
    ax: [
      [x[0], x[1], x[2]],
      [y[0], y[1], y[2]],
      [z[0], z[1], z[2]],
    ],
    size: [f.size[0], f.size[1], f.size[2]],
    mirrored: f.mirrored,
  };
}

const DEG = Math.PI / 180;

/** Moves by `local` along the frame's own axes, scaled by its size. */
export function move(f: Frame, local: V3): void {
  for (let i = 0; i < 3; i++) {
    const d = local[i]! * f.size[i]!;
    const a = f.ax[i]!;
    f.pos[0] += a[0] * d;
    f.pos[1] += a[1] * d;
    f.pos[2] += a[2] * d;
  }
}

/**
 * Turns about one of the frame's own axes (0 side, 1 up, 2 heading) by the right-hand rule.
 * The turn is written in terms of the frame's axes, so in a mirrored (left-handed) frame it comes
 * out as the mirror image.
 */
export function turn(f: Frame, axis: 0 | 1 | 2, degrees: number): void {
  const i = ((axis + 1) % 3) as 0 | 1 | 2;
  const j = ((axis + 2) % 3) as 0 | 1 | 2;
  const c = Math.cos(degrees * DEG);
  const s = Math.sin(degrees * DEG);
  const a = f.ax[i];
  const b = f.ax[j];
  f.ax[i] = [c * a[0] + s * b[0], c * a[1] + s * b[1], c * a[2] + s * b[2]];
  f.ax[j] = [c * b[0] - s * a[0], c * b[1] - s * a[1], c * b[2] - s * a[2]];
}

/** Turns about `local` (given in the frame's own axes). A zero vector does nothing. */
export function rotateAround(f: Frame, local: V3, degrees: number): void {
  const k: V3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const a = f.ax[i]!;
    k[0] += a[0] * local[i]!;
    k[1] += a[1] * local[i]!;
    k[2] += a[2] * local[i]!;
  }
  const len = Math.hypot(k[0], k[1], k[2]);
  if (len === 0 || !Number.isFinite(len)) return;
  k[0] /= len;
  k[1] /= len;
  k[2] /= len;
  // Mirrored frames turn the other way, to match `turn`.
  const angle = (f.mirrored ? -degrees : degrees) * DEG;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  for (let i = 0; i < 3; i++) {
    const v = f.ax[i]!;
    const kv: V3 = [
      k[1] * v[2] - k[2] * v[1],
      k[2] * v[0] - k[0] * v[2],
      k[0] * v[1] - k[1] * v[0],
    ];
    const kd = (k[0] * v[0] + k[1] * v[1] + k[2] * v[2]) * (1 - c);
    f.ax[i] = [
      v[0] * c + kv[0] * s + k[0] * kd,
      v[1] * c + kv[1] * s + k[1] * kd,
      v[2] * c + kv[2] * s + k[2] * kd,
    ];
  }
}

/** Multiplies each axis's size; a negative factor also reverses that axis. */
export function grow(f: Frame, factors: V3): void {
  for (let i = 0; i < 3; i++) {
    const k = factors[i]!;
    f.size[i]! *= Math.abs(k);
    if (k < 0) {
      const a = f.ax[i]!;
      f.ax[i] = [-a[0], -a[1], -a[2]];
      f.mirrored = !f.mirrored;
    }
  }
}

/** 4×4 matrix, column-major: size, then axes, then position. */
export function frameMatrix(f: Frame): number[] {
  const [x, y, z] = f.ax;
  const [sx, sy, sz] = f.size;
  // prettier-ignore
  return [
    x[0] * sx, x[1] * sx, x[2] * sx, 0,
    y[0] * sy, y[1] * sy, y[2] * sy, 0,
    z[0] * sz, z[1] * sz, z[2] * sz, 0,
    f.pos[0], f.pos[1], f.pos[2], 1,
  ];
}

export function multiply(a: number[], b: number[]): number[] {
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row]! * b[col * 4 + k]!;
      out[col * 4 + row] = sum;
    }
  }
  return out;
}
