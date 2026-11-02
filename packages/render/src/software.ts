// A small software renderer: draws a creature into an RGBA image without a browser, for
// `genie render`, thumbnails and tests. It uses the same shapes, camera and lights as the WebGL view.

import { toRgb, type LaidShape, type Pattern, type Value } from "@genocode/core";
import { creatureBounds, shapeGeometry } from "./geometry.js";
import { strokeMesh } from "./stroke.js";
import {
  backgroundRamp,
  FIELD_OF_VIEW,
  frameCamera,
  LIGHTS,
  shininess,
  type CameraPlacement,
  type Rgb,
  type View,
} from "./look.js";
import { patternPixels, patternSheen, TEXTURE_SIZE } from "./texture.js";

/** How big a pattern background is drawn, in pixels along each side. */
const BACKGROUND_SIZE = 512;

export interface RasterOptions {
  width: number;
  height: number;
  /** The background's fill (a colour, gradient or pattern); the default background if left out. */
  background?: Value | undefined;
  /** Samples per pixel along each side, for smoother edges. Default 2. */
  supersample?: number;
  /** Where the creature is seen from; the front, from a little above, if left out. */
  view?: View | undefined;
  /** The creature's focus point (`BuildResult.focus`), where the camera looks; if left out, the middle of its shapes. */
  focus?: readonly [number, number, number] | undefined;
}

export interface Image {
  width: number;
  height: number;
  /** RGBA, 8 bits per channel, rows from the top. */
  data: Uint8ClampedArray;
}

type V3 = [number, number, number];

function sub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function dot(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function normalise(a: V3): V3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

/** The inverse transpose of a placement's 3×3 part, which carries normals. Row-major result. */
function normalMatrix(m: readonly number[]): number[] | undefined {
  // Columns of the 3×3 part.
  const a = [m[0]!, m[1]!, m[2]!];
  const b = [m[4]!, m[5]!, m[6]!];
  const c = [m[8]!, m[9]!, m[10]!];
  const bc = cross(b as V3, c as V3);
  const ca = cross(c as V3, a as V3);
  const ab = cross(a as V3, b as V3);
  const det = dot(a as V3, bc);
  if (det === 0 || !Number.isFinite(det)) return undefined;
  // The inverse's rows are bc, ca, ab over det; its transpose's columns are those, i.e. rows of N.
  return [
    bc[0] / det,
    ca[0] / det,
    ab[0] / det,
    bc[1] / det,
    ca[1] / det,
    ab[1] / det,
    bc[2] / det,
    ca[2] / det,
    ab[2] / det,
  ];
}

/** The camera's right, up and back, the way to it from what it looks at. */
function cameraAxes(cam: CameraPlacement): { right: V3; up: V3; back: V3 } {
  const forward = normalise(sub(cam.target, cam.position));
  const right = normalise(cross(forward, cam.up));
  return { right, up: cross(right, forward), back: [-forward[0], -forward[1], -forward[2]] };
}

/** A direction turned from one camera's axes to another's, as if fixed to the camera. */
function turnWith(
  d: V3,
  from: ReturnType<typeof cameraAxes>,
  to: ReturnType<typeof cameraAxes>,
): V3 {
  const [x, y, z] = [dot(d, from.right), dot(d, from.up), dot(d, from.back)];
  return [
    to.right[0] * x + to.up[0] * y + to.back[0] * z,
    to.right[1] * x + to.up[1] * y + to.back[1] * z,
    to.right[2] * x + to.up[2] * y + to.back[2] * z,
  ];
}

/** A texture's colours, 0 to 1, rows from the top. */
function texturePixels(p: Pattern): Float32Array {
  const px = patternPixels(p, TEXTURE_SIZE);
  const out = new Float32Array(TEXTURE_SIZE * TEXTURE_SIZE * 3);
  for (let i = 0; i < TEXTURE_SIZE * TEXTURE_SIZE; i++) {
    out[i * 3] = px[i * 4]! / 255;
    out[i * 3 + 1] = px[i * 4 + 1]! / 255;
    out[i * 3 + 2] = px[i * 4 + 2]! / 255;
  }
  return out;
}

/** How far a worn texture leans towards the shape's own colour (docs/LANGUAGE.md section 14). */
const HINT = 0.2;

/**
 * A shape's surface wearing a texture: the texture's own colours with a hint of the shape's,
 * blended with the plain colour by how much of its texture the shape wears.
 */
function worn(plain: Rgb, texel: Rgb, wear: number): Rgb {
  const brightest = Math.max(plain[0], plain[1], plain[2], 0.05);
  return plain.map((c, k) => {
    const textured = texel[k]! * (1 - HINT + (HINT * c) / brightest);
    return c + (textured - c) * wear;
  }) as Rgb;
}

/**
 * A texture wrapped onto a shape from three sides, as the WebGL view does: the picture projected
 * along each axis of the shape's 1×1×1 box, blended by which way the surface faces.
 */
function triplanar(texture: Float32Array, p: V3, n: V3): Rgb {
  const f = n.map((x) => Math.abs(x) ** 4);
  const total = f[0]! + f[1]! + f[2]! || 1;
  const x = texelAt(texture, p[1] + 0.5, p[2] + 0.5);
  const y = texelAt(texture, p[0] + 0.5, p[2] + 0.5);
  const z = texelAt(texture, p[0] + 0.5, p[1] + 0.5);
  const mix = (k: number) => (x[k]! * f[0]! + y[k]! * f[1]! + z[k]! * f[2]!) / total;
  return [mix(0), mix(1), mix(2)];
}

/** A texture's colour at u, v (0 to 1 across, and up from the bottom), repeating outside. */
function texelAt(texture: Float32Array, u: number, v: number): Rgb {
  const n = TEXTURE_SIZE;
  const col = ((Math.floor(u * n) % n) + n) % n;
  const row = ((Math.floor((1 - v) * n) % n) + n) % n;
  const k = (row * n + col) * 3;
  return [texture[k]!, texture[k + 1]!, texture[k + 2]!];
}

export function rasterize(shapes: readonly LaidShape[], options: RasterOptions): Image {
  const ss = Math.max(1, Math.round(options.supersample ?? 2));
  const W = options.width * ss;
  const H = options.height * ss;
  const colour = new Float32Array(W * H * 3);
  const depth = new Float32Array(W * H); // 1 / distance; bigger is nearer, 0 is empty

  const bg = options.background;
  if (typeof bg === "object" && bg.type === "pattern" && bg.kind !== null) {
    // The square pattern covers the picture, cut off where it's longer than the picture.
    const px = patternPixels(bg, BACKGROUND_SIZE);
    const side = Math.max(W, H);
    for (let y = 0; y < H; y++) {
      const row = Math.floor(((y + (side - H) / 2) / side) * BACKGROUND_SIZE);
      for (let x = 0; x < W; x++) {
        const col = Math.floor(((x + (side - W) / 2) / side) * BACKGROUND_SIZE);
        const k = (row * BACKGROUND_SIZE + col) * 4;
        colour.set([px[k]! / 255, px[k + 1]! / 255, px[k + 2]! / 255], (y * W + x) * 3);
      }
    }
  } else {
    const ramp = backgroundRamp(bg, H);
    for (let y = 0; y < H; y++) {
      const c = ramp[H - 1 - y]!;
      for (let x = 0; x < W; x++) colour.set(c, (y * W + x) * 3);
    }
  }

  const bounds = creatureBounds(shapes, options.focus);
  const aspect = options.width / options.height;
  const cam = frameCamera(bounds, aspect, options.view);
  const eye = cam.position;
  const axes = cameraAxes(cam);
  const { right, up } = axes;
  const forward: V3 = [-axes.back[0], -axes.back[1], -axes.back[2]];
  const focal = H / 2 / Math.tan((FIELD_OF_VIEW * Math.PI) / 360);
  // The lights turn with the camera, as in the app, so every side is lit as the front is.
  const front = options.view ? cameraAxes(frameCamera(bounds, aspect)) : undefined;
  const lights = [LIGHTS.key, LIGHTS.fill].map((l) =>
    front ? { ...l, direction: turnWith(l.direction, front, axes) } : l,
  );

  // A stroke is see-through if any of it is.
  const alphaOf = (s: LaidShape) =>
    s.points ? Math.min(...s.points.map((p) => p.colour.a)) : s.colour.a;
  const opaque = shapes.filter((s) => alphaOf(s) >= 0.999);
  const seeThrough = shapes
    .filter((s) => alphaOf(s) < 0.999 && (s.points ?? [s]).some((p) => p.colour.a > 0))
    .map((s) => ({ s, d: dot(sub([s.matrix[12]!, s.matrix[13]!, s.matrix[14]!], eye), forward) }))
    .sort((p, q) => q.d - p.d)
    .map((p) => p.s);

  const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const shape of [...opaque, ...seeThrough]) {
    // A stroke's tube is already in world space, with a colour and look at each corner.
    const stroke = shape.points ? strokeMesh(shape.points, "high") : undefined;
    if (shape.shape === "stroke" && !stroke) continue;
    const m = stroke ? IDENTITY : shape.matrix;
    const nm = normalMatrix(m);
    if (!nm) continue;
    const geometry =
      shape.shape === "stroke" ? undefined : shapeGeometry(shape.shape, false, "low");
    const pos = stroke ? stroke.position : geometry!.getAttribute("position").array;
    const nor = stroke ? stroke.normal : geometry!.getAttribute("normal").array;
    // A shape that wears none of its texture is drawn as if it had none.
    const pattern = shape.wear > 0 ? shape.texture : null;
    const texture = pattern ? texturePixels(pattern) : undefined;
    const sheen = pattern ? patternSheen(pattern) * shape.wear : 0;
    const index = stroke ? stroke.index : geometry!.getIndex()?.array;
    const count = pos.length / 3;
    const base: Rgb = toRgb(shape.colour);
    const alpha = alphaOf(shape);

    // Per corner: screen x, screen y, 1/distance, how much light falls on it (which the colour
    // and texture multiply), and the light it gives off whatever its colour (highlights and sheen).
    const sx = new Float32Array(count);
    const sy = new Float32Array(count);
    const iz = new Float32Array(count);
    const shade = new Float32Array(count);
    const glint = new Float32Array(count);
    for (let v = 0; v < count; v++) {
      const px = pos[v * 3]!;
      const py = pos[v * 3 + 1]!;
      const pz = pos[v * 3 + 2]!;
      const world: V3 = [
        m[0]! * px + m[4]! * py + m[8]! * pz + m[12]!,
        m[1]! * px + m[5]! * py + m[9]! * pz + m[13]!,
        m[2]! * px + m[6]! * py + m[10]! * pz + m[14]!,
      ];
      const nx = nor[v * 3]!;
      const ny = nor[v * 3 + 1]!;
      const nz = nor[v * 3 + 2]!;
      const n = normalise([
        nm[0]! * nx + nm[1]! * ny + nm[2]! * nz,
        nm[3]! * nx + nm[4]! * ny + nm[5]! * nz,
        nm[6]! * nx + nm[7]! * ny + nm[8]! * nz,
      ]);
      const rel = sub(world, eye);
      const dist = dot(rel, forward);
      iz[v] = dist > cam.near * 0.5 ? 1 / dist : 0;
      sx[v] = W / 2 + (dot(rel, right) / dist) * focal;
      sy[v] = H / 2 - (dot(rel, up) / dist) * focal;
      const toEye = normalise(sub(eye, world));
      let diffuse = LIGHTS.ambient;
      let specular = 0;
      const shine = stroke ? stroke.look[v * 4]! : shape.shine;
      const exponent = shininess(stroke ? stroke.look[v * 4 + 1]! : shape.sharpness);
      for (const l of lights) {
        diffuse += l.strength * Math.max(0, dot(n, l.direction));
        if (shine > 0) {
          const half = normalise([
            l.direction[0] + toEye[0],
            l.direction[1] + toEye[1],
            l.direction[2] + toEye[2],
          ]);
          specular += l.strength * shine * Math.pow(Math.max(0, dot(n, half)), exponent);
        }
      }
      if (sheen > 0) specular += sheen * 0.5 * Math.pow(1 - Math.abs(dot(n, toEye)), 3);
      shade[v] = diffuse;
      glint[v] = specular;
    }

    const triangles = index ? index.length / 3 : count / 3;
    for (let t = 0; t < triangles; t++) {
      const a = index ? index[t * 3]! : t * 3;
      const b = index ? index[t * 3 + 1]! : t * 3 + 1;
      const c = index ? index[t * 3 + 2]! : t * 3 + 2;
      if (iz[a] === 0 || iz[b] === 0 || iz[c] === 0) continue; // behind the camera
      const area = (sx[b]! - sx[a]!) * (sy[c]! - sy[a]!) - (sy[b]! - sy[a]!) * (sx[c]! - sx[a]!);
      if (area === 0 || !Number.isFinite(area)) continue;
      const x0 = Math.max(0, Math.floor(Math.min(sx[a]!, sx[b]!, sx[c]!)));
      const x1 = Math.min(W - 1, Math.ceil(Math.max(sx[a]!, sx[b]!, sx[c]!)));
      const y0 = Math.max(0, Math.floor(Math.min(sy[a]!, sy[b]!, sy[c]!)));
      const y1 = Math.min(H - 1, Math.ceil(Math.max(sy[a]!, sy[b]!, sy[c]!)));
      for (let y = y0; y <= y1; y++) {
        const py = y + 0.5;
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5;
          const wa = ((sx[b]! - px) * (sy[c]! - py) - (sy[b]! - py) * (sx[c]! - px)) / area;
          const wb = ((sx[c]! - px) * (sy[a]! - py) - (sy[c]! - py) * (sx[a]! - px)) / area;
          const wc = 1 - wa - wb;
          if (wa < 0 || wb < 0 || wc < 0) continue;
          const z = wa * iz[a]! + wb * iz[b]! + wc * iz[c]!;
          const at = y * W + x;
          if (z <= depth[at]!) continue;
          const ka = (wa * iz[a]!) / z;
          const kb = (wb * iz[b]!) / z;
          const kc = (wc * iz[c]!) / z;
          const light = ka * shade[a]! + kb * shade[b]! + kc * shade[c]!;
          const extra = ka * glint[a]! + kb * glint[b]! + kc * glint[c]!;
          let surface = base;
          let see = alpha;
          if (stroke) {
            // A stroke's colour and see-through are blended from its corners.
            const col = stroke.colour;
            const blend = (arr: ArrayLike<number>, n: number, k: number) =>
              ka * arr[a * n + k]! + kb * arr[b * n + k]! + kc * arr[c * n + k]!;
            surface = [blend(col, 3, 0), blend(col, 3, 1), blend(col, 3, 2)];
            see = blend(stroke.look, 4, 2);
          }
          if (texture) {
            // Where on the shape this is, and which way it faces there, in the shape's own box.
            const at3 = (arr: ArrayLike<number>, k: number) =>
              ka * arr[a * 3 + k]! + kb * arr[b * 3 + k]! + kc * arr[c * 3 + k]!;
            const t = triplanar(
              texture,
              [at3(pos, 0), at3(pos, 1), at3(pos, 2)],
              [at3(nor, 0), at3(nor, 1), at3(nor, 2)],
            );
            surface = worn(base, t, shape.wear);
          }
          for (let k = 0; k < 3; k++) {
            const value = surface[k]! * light + extra;
            colour[at * 3 + k] =
              see >= 0.999 ? value : colour[at * 3 + k]! * (1 - see) + value * see;
          }
          if (see >= 0.999) depth[at] = z;
        }
      }
    }
  }

  const data = new Uint8ClampedArray(options.width * options.height * 4);
  for (let y = 0; y < options.height; y++) {
    for (let x = 0; x < options.width; x++) {
      const out = (y * options.width + x) * 4;
      for (let k = 0; k < 3; k++) {
        let sum = 0;
        for (let dy = 0; dy < ss; dy++) {
          for (let dx = 0; dx < ss; dx++) sum += colour[((y * ss + dy) * W + x * ss + dx) * 3 + k]!;
        }
        data[out + k] = Math.round(Math.min(1, Math.max(0, sum / (ss * ss))) * 255);
      }
      data[out + 3] = 255;
    }
  }
  return { width: options.width, height: options.height, data };
}
