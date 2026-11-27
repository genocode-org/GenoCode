// Builds the frames of a dance or a morph in the background (build.worker.ts). Each frame the page
// asks for the creature of the moment and draws the newest build that has come back, while the next
// one is being worked out: building and drawing then take turns on two threads instead of one after
// the other, at the cost of showing the music a frame late. Where workers can't be used, or a build
// fails to come back, it builds on the page as before.

import type { BuildOptions, BuildResult, Value } from "@genocode/core";
import type { BuildReply, BuildRequest } from "./build.worker.js";
import { buildCreature, type Creature } from "./creature.js";

export interface Built {
  built: BuildResult;
  background: Value | undefined;
}

export class FrameBuilder {
  private worker: Worker | undefined;
  private failed = false;
  private next = 0;
  /** The build being worked out, if any. */
  private waiting: number | undefined;
  private latest: Built | undefined;

  /**
   * The newest build there is, having asked for this creature at these inputs, which will be the
   * newest a frame or so later. `now` builds it here and now instead, waiting for it: the first
   * frame, which the camera is framed on.
   */
  frame(c: Creature, inputs: BuildOptions["inputs"], now = false): Built {
    const worker = now ? undefined : this.start();
    if (!worker) {
      this.waiting = undefined;
      this.latest = buildCreature(c, inputs);
      return this.latest;
    }
    if (this.waiting === undefined) {
      const id = ++this.next;
      this.waiting = id;
      const request: BuildRequest = { id, text: c.program.text, values: [...c.values], inputs };
      worker.postMessage(request);
    }
    // Nothing has come back yet: this frame is built here, as before.
    this.latest ??= buildCreature(c, inputs);
    return this.latest;
  }

  /** Forgets the builds so far: the next frame is a new creature's or a new loop's. */
  reset(): void {
    this.waiting = undefined;
    this.latest = undefined;
    // A build still on its way is for the old creature: its reply's id no longer matches.
    this.next++;
  }

  private start(): Worker | undefined {
    if (this.failed || typeof Worker === "undefined") return undefined;
    if (this.worker) return this.worker;
    try {
      this.worker = new Worker(new URL("./build.worker.ts", import.meta.url), { type: "module" });
    } catch {
      this.failed = true;
      return undefined;
    }
    this.worker.onmessage = (e: MessageEvent<BuildReply>) => {
      if (e.data.id !== this.waiting) return;
      this.waiting = undefined;
      this.latest = { built: e.data.built, background: e.data.background };
    };
    this.worker.onerror = () => {
      // From now on every frame is built on the page.
      this.failed = true;
      this.worker?.terminate();
      this.worker = undefined;
      this.waiting = undefined;
    };
    return this.worker;
  }
}
