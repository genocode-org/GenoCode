// Textures from patterns (docs/LANGUAGE.md section 14): a pattern's grey picture (patterns.ts)
// coloured by its palette (palette.ts). Pictures and palettes are kept for a while, as drawing a
// picture is the slow part and creatures often use the same few again and again.
//
// Pictures can be drawn elsewhere, such as in a web worker, so the page doesn't stall: with a
// drawer set (drawFieldsWith), the WebGL views ask for pictures with readyField, which starts one
// drawing and says it's not ready yet, and are told when it is (onFieldReady). The original drew
// its textures in the background the same way. Without a drawer, pictures are drawn on the spot.

import type { PatternMix, Pattern, PatternSource } from "@genocode/core";
import { paletteTable, SHEEN, TABLE_SIZE } from "./palette.js";
import { drawField, type Field } from "./patterns.js";

/** How big a shape's texture is, in pixels along each side. */
export const TEXTURE_SIZE = 256;

/** A map that forgets what was used least recently once it holds more than `limit`. */
class Recent<V> {
  private readonly map = new Map<string, V>();

  constructor(private readonly limit: number) {}

  has(key: string): boolean {
    return this.map.has(key);
  }

  get(key: string, make: () => V): V {
    let v = this.map.get(key);
    if (v === undefined) v = make();
    else this.map.delete(key);
    this.map.set(key, v);
    if (this.map.size > this.limit) this.map.delete(this.map.keys().next().value!);
    return v;
  }
}

const fields = new Recent<Field>(48);
const palettes = new Recent<Float32Array>(256);

/**
 * The keys of patterns asked for before, at the usual size. A creature's shapes share a few
 * patterns, and a key can be long (a pattern written in GenoCode carries its code), so each
 * pattern's keys are made once. Patterns are never changed once made.
 */
const fieldKeys = new WeakMap<Pattern, string>();
const textureKeys = new WeakMap<Pattern, string>();

/** What decides a pattern's grey picture: its kind, seed and second pattern. */
export function fieldKey(p: Pattern, size = TEXTURE_SIZE): string {
  if (size !== TEXTURE_SIZE) return makeFieldKey(p, size);
  let key = fieldKeys.get(p);
  if (key === undefined) fieldKeys.set(p, (key = makeFieldKey(p, size)));
  return key;
}

function makeFieldKey(p: Pattern, size: number): string {
  const m = p.mix;
  return `${p.kind}/${p.seed}/${m ? `${m.way}/${m.kind}/${m.amount}${sourceKey(m.source)}` : ""}/${size}${sourceKey(p.source)}`;
}

/** A pattern written in GenoCode: its code and its genes' values decide its picture too. */
function sourceKey(s: PatternSource | undefined): string {
  return s ? `/${JSON.stringify(s.genes)}/${s.text}` : "";
}

/** What decides everything about a texture's look. */
export function textureKey(p: Pattern, size = TEXTURE_SIZE): string {
  if (size !== TEXTURE_SIZE) return `${makeFieldKey(p, size)}/${p.hue}/${p.scheme}/${p.finish}`;
  let key = textureKeys.get(p);
  if (key === undefined) {
    textureKeys.set(p, (key = `${fieldKey(p)}/${p.hue}/${p.scheme}/${p.finish}`));
  }
  return key;
}

/** A pattern's grey picture. The pattern must have a kind (not be `none`). */
export function patternField(p: Pattern, size = TEXTURE_SIZE): Field {
  return fields.get(fieldKey(p, size), () => drawField(p.kind!, p.seed, p.mix, size, p.source));
}

/** Whether a pattern's picture is ready, so colouring it is quick. */
export function hasField(p: Pattern, size = TEXTURE_SIZE): boolean {
  return fields.has(fieldKey(p, size));
}

/** Draws a pattern's grey picture somewhere else, giving its values (see drawField). */
export type FieldDrawer = (
  kind: string,
  seed: number,
  mix: PatternMix | undefined,
  size: number,
  source: PatternSource | undefined,
) => Promise<Float32Array>;

let drawer: FieldDrawer | undefined;
const drawing = new Set<string>();
const readyListeners = new Set<() => void>();

/** Has pictures drawn by `d` from now on, such as in a web worker; undefined draws them here. */
export function drawFieldsWith(d: FieldDrawer | undefined): void {
  drawer = d;
}

/** Calls `listener` whenever a picture being drawn elsewhere is ready. Returns a way to stop. */
export function onFieldReady(listener: () => void): () => void {
  readyListeners.add(listener);
  return () => readyListeners.delete(listener);
}

/**
 * A pattern's grey picture if it's ready. If it isn't and there's a drawer, starts drawing it
 * there and returns undefined; without a drawer, draws it now.
 */
export function readyField(p: Pattern, size = TEXTURE_SIZE): Field | undefined {
  const key = fieldKey(p, size);
  if (fields.has(key) || drawer === undefined) return patternField(p, size);
  if (!drawing.has(key)) {
    drawing.add(key);
    drawer(p.kind!, p.seed, p.mix, size, p.source)
      .then((v) => fields.get(key, () => ({ size, v })))
      // If drawing elsewhere fails, it's drawn here instead.
      .catch(() => patternField(p, size))
      .finally(() => {
        drawing.delete(key);
        for (const l of readyListeners) l();
      });
  }
  return undefined;
}

/** A pattern as a picture, once its grey picture is ready, wherever it's drawn. */
export function pixelsWhenReady(
  p: Pattern,
  size = TEXTURE_SIZE,
): Promise<Uint8ClampedArray<ArrayBuffer>> {
  const now = readyPixels(p, size);
  if (now) return Promise.resolve(now);
  return new Promise((resolve) => {
    const stop = onFieldReady(() => {
      const px = readyPixels(p, size);
      if (!px) return;
      stop();
      resolve(px);
    });
  });
}

/** A pattern as a picture if its grey picture is ready (see readyField). */
export function readyPixels(
  p: Pattern,
  size = TEXTURE_SIZE,
): Uint8ClampedArray<ArrayBuffer> | undefined {
  const f = readyField(p, size);
  return f && colourField(f, p);
}

/** A pattern's palette: TABLE_SIZE colours, r, g, b from 0 to 1. */
export function patternPalette(p: Pattern): Float32Array {
  return palettes.get(`${p.hue}/${p.scheme}/${p.finish}/${p.seed}`, () =>
    paletteTable(p.hue, p.scheme, p.finish, p.seed),
  );
}

/** How much a pattern's finish adds a white sheen at a shape's edges, 0 to 1. */
export function patternSheen(p: Pattern): number {
  return SHEEN[p.finish];
}

/** A pattern as a picture: RGBA, 8 bits per channel, rows from the top. */
export function patternPixels(p: Pattern, size = TEXTURE_SIZE): Uint8ClampedArray<ArrayBuffer> {
  return colourField(patternField(p, size), p);
}

/** The middle colour of a pattern's palette, r, g, b from 0 to 1: a stand-in for its picture. */
export function patternMiddle(p: Pattern): [number, number, number] {
  const t = patternPalette(p);
  const k = (TABLE_SIZE >> 1) * 3;
  return [t[k]!, t[k + 1]!, t[k + 2]!];
}

function colourField({ size, v }: Field, p: Pattern): Uint8ClampedArray<ArrayBuffer> {
  const table = patternPalette(p);
  const out = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < v.length; i++) {
    const k = Math.round(v[i]! * (TABLE_SIZE - 1)) * 3;
    out[i * 4] = table[k]! * 255;
    out[i * 4 + 1] = table[k + 1]! * 255;
    out[i * 4 + 2] = table[k + 2]! * 255;
    out[i * 4 + 3] = 255;
  }
  return out;
}
