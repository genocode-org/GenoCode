// The checks run on a shared creature once it's an issue, before anyone approves it: that it is a
// creature, has the name it was shared under, has no errors, builds within the limits, and what
// it looks like. Runs in Node, in a GitHub Action.

import { build, buildBackground, check } from "@genocode/core";
import { rasterize } from "@genocode/render";
import { encodePng } from "./png.js";
import { freeFileName, readIssue, type Share } from "./share.js";

/** The picture's size in the issue, in pixels. */
const SIZE = 480;

/** How many problems of one kind the comment lists before it stops. */
const MOST_LISTED = 10;

export interface Review {
  /** The share the issue holds, if it holds one. */
  share?: Share;
  /** What's wrong with it; approving is refused while there's anything here. */
  problems: string[];
  /** What the reviewer should know that doesn't stop it, such as a changed file name. */
  notes: string[];
  /** The file name (without `.genie`) it gets in `community/`. */
  fileName?: string;
  /** The creature at rest, as PNG. */
  picture?: Uint8Array;
}

/** Reviews the share in an issue's text; `taken` holds the file names already in use. */
export function review(issueBody: string, taken: ReadonlySet<string>): Review {
  const share = readIssue(issueBody);
  if (!share) {
    return {
      problems: ["This issue holds no shared creature, or one that has been changed by hand."],
      notes: [],
    };
  }
  const problems: string[] = [];
  const notes: string[] = [];
  const program = check(share.code);
  const listed = (lines: string[]) =>
    lines.length > MOST_LISTED
      ? [...lines.slice(0, MOST_LISTED), `…and ${lines.length - MOST_LISTED} more.`]
      : lines;

  if (program.file.kind !== "creature") {
    problems.push(`This is a ${program.file.kind} file, not a creature.`);
  } else if (program.file.name !== share.name) {
    problems.push(`It was shared as ${share.name}, but its code calls it ${program.file.name}.`);
  }
  const lineOf = (at: number) => share.code.slice(0, at).split("\n").length;
  problems.push(
    ...listed(
      program.diagnostics
        .filter((d) => d.severity === "error")
        .map((d) => `Line ${lineOf(d.span.start)}: ${d.message}`),
    ),
  );

  const fileName = freeFileName(share.name, taken);
  if (fileName !== share.name) {
    notes.push(`A creature called ${share.name} is already there, so it becomes ${fileName}.`);
  }

  let picture: Uint8Array | undefined;
  if (problems.length === 0) {
    const inputs = { time: 0 };
    const built = build(program, { inputs });
    // A warning when built means a limit was reached or shapes were left out: not ready to share.
    const failed = built.diagnostics;
    problems.push(...listed(failed.map((d) => `When built: ${d.message}`)));
    if (failed.length === 0) {
      const image = rasterize(built.shapes, {
        width: SIZE,
        height: SIZE,
        background: buildBackground(program, { inputs }).fill,
        focus: built.focus,
      });
      picture = encodePng(image.width, image.height, image.data);
      const variants = program.variants.length;
      notes.push(
        `It has ${built.shapes.length.toLocaleString("en")} shapes and ${variants} variant${variants === 1 ? "" : "s"}.`,
      );
    }
  }
  return { share, problems, notes, fileName, ...(picture ? { picture } : {}) };
}

/** The comment put on the issue: what was found, the picture, and what to do next. */
export function reviewComment(r: Review, pictureUrl: string | undefined): string {
  const lines: string[] = [];
  if (r.problems.length > 0) {
    lines.push("**This creature can't be added yet.**", "");
    lines.push(...r.problems.map((p) => `- ${p}`), "");
  } else {
    lines.push("**This creature passed the checks.**", "");
  }
  if (pictureUrl) lines.push(`![The creature at rest](${pictureUrl})`, "");
  if (r.notes.length > 0) lines.push(...r.notes.map((n) => `- ${n}`), "");
  if (r.problems.length === 0) {
    lines.push(
      `To add it to the community gallery as \`community/${r.fileName}.genie\`, add the label \`approved\`. To turn it down, close this issue.`,
    );
  }
  return lines.join("\n").trimEnd() + "\n";
}
