// What the player can show: the starter creatures, the community's creatures, the dance styles,
// all from the repository's folders, and creatures opened from a file or a link, kept on the phone.

import { check, type CheckResult } from "@genocode/core";

const starterFiles = import.meta.glob("../../../creatures/*.genie", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const communityFiles = import.meta.glob("../../../community/*.genie", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const danceFiles = import.meta.glob("../../../dances/*.genie", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export type Shelf = "starter" | "community" | "opened";

export interface Entry {
  /** The file's name, as in `Stained_Glass_Bloom`. */
  name: string;
  shelf: Shelf;
  text: string;
}

export interface Style {
  name: string;
  /** What moves it, in the style's own words from the comment at its top. */
  about: string;
  program: CheckResult;
}

const fileName = (path: string) =>
  path
    .split("/")
    .pop()!
    .replace(/\.genie$/, "");

/** A name as people read it: `Stained_Glass_Bloom` is "Stained Glass Bloom". */
export const label = (name: string) => name.replace(/_/g, " ");

/** The issue a community creature was shared in, for newest first. */
const sharedIn = (text: string) => Number(/issues\/(\d+)/.exec(text)?.[1] ?? 0);

const starters: Entry[] = Object.entries(starterFiles)
  .map(([path, text]) => ({ name: fileName(path), shelf: "starter" as const, text }))
  .sort((a, b) => a.name.localeCompare(b.name));

const community: Entry[] = Object.entries(communityFiles)
  .map(([path, text]) => ({ name: fileName(path), shelf: "community" as const, text }))
  .sort((a, b) => sharedIn(b.text) - sharedIn(a.text) || a.name.localeCompare(b.name));

const OPENED_KEY = "genocode-player.opened";

function readOpened(): Entry[] {
  try {
    const list = JSON.parse(localStorage.getItem(OPENED_KEY) ?? "[]") as {
      name: string;
      text: string;
    }[];
    return list.map((e) => ({ name: e.name, shelf: "opened" as const, text: e.text }));
  } catch {
    return [];
  }
}

let opened = readOpened();

/** Every creature the player has, in the order the swipes go through them. */
export function entries(): Entry[] {
  return [...opened, ...starters, ...community];
}

/**
 * Keeps a creature someone opened, from a file or a link. It needs to be a creature that checks
 * without errors; the problem is given back in words otherwise.
 */
export function open(text: string): Entry | string {
  const program = check(text);
  if (program.file.kind !== "creature") return "That file isn't a creature.";
  if (!program.ok) return "That creature has mistakes in its code, so it can't dance.";
  const name = program.file.name;
  const entry: Entry = { name, shelf: "opened", text };
  opened = [entry, ...opened.filter((e) => e.name !== name)].slice(0, 30);
  try {
    localStorage.setItem(
      OPENED_KEY,
      JSON.stringify(opened.map(({ name, text }) => ({ name, text }))),
    );
  } catch {
    // Not kept for next time, then.
  }
  return entry;
}

/** A starter or community creature by its file name, as in a `?example=Medusa` link. */
export function find(shelf: Shelf, name: string): Entry | undefined {
  const list = shelf === "starter" ? starters : shelf === "community" ? community : opened;
  return list.find((e) => e.name.toLowerCase() === name.toLowerCase());
}

/** The comment lines straight after the `dance Name` line, joined. */
function aboutOf(text: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^\s*dance\s/.test(l));
  const about: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const m = /^\s*\/\/\s?(.*)$/.exec(line);
    if (!m) break;
    about.push(m[1]!);
  }
  // Where a style came from is for its file, not for the player.
  return about
    .join(" ")
    .replace(/\s*Inspired by[^.]*\./g, "")
    .trim();
}

export const styles: Style[] = Object.entries(danceFiles)
  .map(([path, text]) => ({
    name: label(fileName(path)),
    about: aboutOf(text),
    program: check(text),
  }))
  .filter((s) => s.program.ok)
  .sort((a, b) => a.name.localeCompare(b.name));
