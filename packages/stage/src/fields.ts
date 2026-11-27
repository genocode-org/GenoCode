// A few web workers that draw the grey pictures of textures, so a new pattern doesn't stall the
// page: a breeding grid of new patterns is drawn side by side.

import { drawFieldsWith, type FieldDrawer } from "@genocode/render";
import type { FieldRequest } from "./fields.worker.js";

const WORKERS = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));

/** Has the render package draw its pictures in web workers from now on. */
export function drawFieldsInWorkers(): void {
  let workers: Worker[];
  try {
    workers = Array.from(
      { length: WORKERS },
      () => new Worker(new URL("./fields.worker.ts", import.meta.url), { type: "module" }),
    );
  } catch {
    return; // Without workers, pictures are drawn on the page.
  }
  const waiting = new Map<number, (v: Float32Array) => void>();
  for (const w of workers) {
    w.onmessage = (e: MessageEvent<{ id: number; v: Float32Array }>) => {
      waiting.get(e.data.id)?.(e.data.v);
      waiting.delete(e.data.id);
    };
  }
  let next = 0;
  const draw: FieldDrawer = (kind, seed, mix, size, source) =>
    new Promise((resolve) => {
      const id = next++;
      waiting.set(id, resolve);
      const request: FieldRequest = { id, kind, seed, mix, size, source };
      workers[id % workers.length]!.postMessage(request);
    });
  drawFieldsWith(draw);
}
