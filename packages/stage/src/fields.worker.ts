// Draws the grey pictures of textures (see @genocode/render's texture.ts) away from the page, so
// the view keeps moving while a new pattern is drawn.

import type { PatternMix, PatternSource } from "@genocode/core";
import { drawField } from "@genocode/render/patterns";

export interface FieldRequest {
  id: number;
  kind: string;
  seed: number;
  mix: PatternMix | undefined;
  size: number;
  /** A pattern written in GenoCode, drawn by running its code here too. */
  source: PatternSource | undefined;
}

self.onmessage = (e: MessageEvent<FieldRequest>) => {
  const { id, kind, seed, mix, size, source } = e.data;
  const { v } = drawField(kind, seed, mix, size, source);
  postMessage({ id, v }, { transfer: [v.buffer] });
};
