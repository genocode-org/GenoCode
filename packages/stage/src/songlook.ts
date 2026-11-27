// A look of its own for each song: while dancing, every song gets its own version of the creature,
// worked out from the song's name, so the same song always brings back the same creature. Only the
// genes the whole family shares are changed, all the same way, so a family that is one life (its
// variants changing only how far through it they are) keeps its life loop.

import { build, mutate, mulberry32, valuesEqual, type Value } from "@genocode/core";
import type { Creature } from "./creature.js";

/** How far genes move for a song: small enough that it's still recognisably the same creature. */
const STRENGTH = 0.25;
/** How many looks are tried before giving up on one that builds. */
const TRIES = 5;

/** The family's look for a song, or the family itself when it can't have one. */
export function songLook(
  members: readonly Creature[],
  song: string,
  locked: ReadonlySet<string>,
): Creature[] {
  const root = members[0];
  if (root === undefined || !root.program.breedable) return [...members];
  const genes = root.program.genes;
  const shared = genes.filter((g) =>
    members.every((m) => {
      const v = m.values.get(g.fullName);
      return v !== undefined && valuesEqual(v, root.values.get(g.fullName)!);
    }),
  );
  const fixed = new Set(locked);
  for (const g of genes) if (!shared.includes(g)) fixed.add(g.fullName);
  const random = mulberry32(hash(song));
  for (let i = 0; i < TRIES; i++) {
    const changed = mutate(genes, root.values, { random, strength: STRENGTH, locked: fixed });
    // A new seed every time, so whatever the creature places at random moves too.
    if (shared.some((g) => g.fullName === "seed") && !locked.has("seed")) {
      changed.set("seed", Math.floor(random() * 2 ** 32));
    }
    const look = members.map((m) =>
      withShared(
        m,
        shared.map((g) => g.fullName),
        changed,
      ),
    );
    if (builds(look[0]!)) return look;
  }
  return [...members];
}

function withShared(m: Creature, names: readonly string[], changed: Map<string, Value>): Creature {
  const values = new Map(m.values);
  for (const name of names) values.set(name, changed.get(name)!);
  return { ...m, values };
}

/** Whether a creature builds without errors and lays something. */
function builds(c: Creature): boolean {
  const r = build(c.program, { genes: c.values, inputs: { time: 0 } });
  return r.shapes.length > 0 && !r.diagnostics.some((d) => d.severity === "error");
}

/** FNV-1a: a 32-bit number from a song's name. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
