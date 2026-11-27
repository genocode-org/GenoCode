// Builds creatures away from the page, so a dance or a morph works out the next frame while the
// page draws this one. The program comes as its text and is checked here once.

import type { BuildOptions, BuildResult, Value } from "@genocode/core";
import { buildCreature, checkText } from "./creature.js";

export interface BuildRequest {
  id: number;
  text: string;
  values: [string, Value][];
  inputs: BuildOptions["inputs"];
}

export interface BuildReply {
  id: number;
  built: BuildResult;
  background: Value | undefined;
}

self.onmessage = (e: MessageEvent<BuildRequest>) => {
  const { id, text, values, inputs } = e.data;
  const { built, background } = buildCreature(
    { program: checkText(text), values: new Map(values) },
    inputs,
  );
  postMessage({ id, built, background } satisfies BuildReply);
};
