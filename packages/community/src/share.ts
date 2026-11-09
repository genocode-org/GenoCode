// A creature shared with the community, as the app sends it, the relay files it as a GitHub issue,
// and the checks read it back. Nothing here depends on the browser or on Node, so all three use it.

/** The terms every shared creature is given under. */
export const LICENCE = "CC BY 4.0";
export const LICENCE_URL = "https://creativecommons.org/licenses/by/4.0/";

/** The most each part of a share may hold, in characters. */
export const LIMITS = { name: 40, author: 40, description: 300, code: 32_000 } as const;

export interface Share {
  /** The creature's name, as on its `creature` line. */
  name: string;
  /** Who made it, as they want to be credited. */
  author: string;
  /** A sentence or two about it. */
  description: string;
  /** The `.genie` code. */
  code: string;
}

/** A creature's name: a letter, then letters, digits and `_`, as GenoCode names are written. */
const NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

/** Control characters, and new lines where only one line is wanted. */
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]/;
const LINE_BREAK = /[\r\n]/;

/**
 * What's wrong with a share, in plain words for the person sharing it, or nothing when it's fine.
 * This checks only its form: the code itself is checked by GenoCode once it arrives.
 */
export function problems(value: unknown): string[] {
  if (!value || typeof value !== "object") return ["Nothing was sent."];
  const s = value as Record<string, unknown>;
  const out: string[] = [];
  const text = (key: keyof Share, label: string, oneLine: boolean): string | undefined => {
    const v = s[key];
    if (typeof v !== "string") {
      out.push(`The ${label} is missing.`);
      return undefined;
    }
    if (v.length > LIMITS[key]) {
      out.push(`The ${label} is too long: at most ${LIMITS[key].toLocaleString("en")} characters.`);
    }
    if (CONTROL.test(v) || (oneLine && LINE_BREAK.test(v))) {
      out.push(`The ${label} has characters that can't be shown.`);
    }
    return v;
  };
  const name = text("name", "creature's name", true);
  if (name !== undefined && !NAME.test(name)) {
    out.push("The creature's name must start with a letter and hold only letters, digits and _.");
  }
  const author = text("author", "author's name", true);
  if (author !== undefined) {
    if (author.trim() === "") out.push("Please give a name to credit you by.");
    // `@` would notify someone on GitHub; the others would turn into links or markup there.
    if (/[@<>`[\]\\]/.test(author)) out.push("The author's name can't hold @ < > ` [ ] or \\.");
  }
  text("description", "description", false);
  const code = text("code", "code", false);
  if (code !== undefined && code.trim() === "") out.push("The code is empty.");
  return out;
}

/** The share, if `value` is one with nothing wrong, trimmed. */
export function asShare(value: unknown): Share | undefined {
  if (problems(value).length > 0) return undefined;
  const s = value as Share;
  return {
    name: s.name,
    author: s.author.trim(),
    description: s.description.trim(),
    code: s.code,
  };
}

// ---------- the GitHub issue ----------

/** The label every shared creature's issue gets, which starts its checks. */
export const LABEL = "community";

/** Marks the issue as a share, and holds the share itself, which is what's read back. */
const MARK = "genocode-share v1";

/** A fence that nothing in `text` can close: longer than any run of backticks in it. */
function fence(text: string): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  return "`".repeat(Math.max(3, longest + 1));
}

export function issueTitle(share: Share): string {
  return `Community creature: ${share.name} by ${share.author}`;
}

/**
 * The issue's text. People read the fenced blocks, where GitHub shows everything as it is
 * (no links, no mentions). The checks read only the hidden copy at the end, which is base64, so
 * nothing in the share can end the comment that holds it.
 */
export function issueBody(share: Share): string {
  const about = [
    `name: ${share.name}`,
    `author: ${share.author}`,
    `description: ${share.description}`,
  ].join("\n");
  const json = JSON.stringify(share);
  const hidden = toBase64(json);
  return [
    `A creature shared from the GenoCode app, under [${LICENCE}](${LICENCE_URL}).`,
    "",
    fence(about) + "text",
    about,
    fence(about),
    "",
    fence(share.code) + "genie",
    share.code.replace(/\n$/, ""),
    fence(share.code),
    "",
    `<!-- ${MARK} ${hidden} -->`,
  ].join("\n");
}

/** The share an issue holds, or undefined when it holds none, or one with something wrong. */
export function readIssue(body: string): Share | undefined {
  const m = body.match(new RegExp(`<!-- ${MARK} ([A-Za-z0-9+/=]+) -->`));
  if (!m) return undefined;
  try {
    return asShare(JSON.parse(fromBase64(m[1]!)));
  } catch {
    return undefined;
  }
}

function toBase64(text: string): string {
  let binary = "";
  for (const b of new TextEncoder().encode(text)) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(base64: string): string {
  const binary = atob(base64);
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

// ---------- the file it becomes ----------

/** The credit line put above an approved creature's code. */
export function creditLine(share: Share, issueUrl: string): string {
  return `// Shared by ${share.author} under ${LICENCE} (${LICENCE_URL}): ${issueUrl}`;
}

/** The creature's file text once approved: the credit line and what the sharer said, then its code. */
export function approvedText(share: Share, issueUrl: string): string {
  const code = share.code.endsWith("\n") ? share.code : `${share.code}\n`;
  const about = share.description.replace(/\s+/g, " ").trim();
  return `${creditLine(share, issueUrl)}\n${about ? `// About it: ${about}\n` : ""}${code}`;
}

export interface Credit {
  author: string;
  /** The issue it was shared in. */
  url: string;
  /** What the sharer said about it, if anything. */
  about: string;
}

/** Who shared an approved creature, read back from the lines `approvedText` put above its code. */
export function readCredit(text: string): Credit | undefined {
  const lines = text.split("\n");
  const m = lines[0]?.match(/^\/\/ Shared by (.+) under CC BY 4\.0 \([^)]*\): (https:\/\/\S+)$/);
  if (!m) return undefined;
  const about = lines[1]?.match(/^\/\/ About it: (.*)$/)?.[1] ?? "";
  return { author: m[1]!, url: m[2]!, about };
}

/** The file name for a creature called `name`, not one of `taken` (names without `.genie`). */
export function freeFileName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  for (let k = 2; ; k++) if (!taken.has(`${name}_${k}`)) return `${name}_${k}`;
}
