// What the community Actions run, once the packages are built:
//
//   node packages/community/dist/cli.js review <out folder>
//     writes comment.md (and picture.png when there's a picture) for the issue in ISSUE_BODY.
//   node packages/community/dist/cli.js approve
//     writes community/<name>.genie for the issue in ISSUE_BODY, and prints the file's path.
//
// The issue arrives in environment variables, never on the command line, so nothing in it is
// read by a shell. PICTURE_URL is where picture.png will be put, for the comment to show.

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { review, reviewComment } from "./review.js";
import { approvedText } from "./share.js";

const root = process.env.REPO_ROOT ?? process.cwd();
const body = process.env.ISSUE_BODY ?? "";
const issueUrl = process.env.ISSUE_URL ?? "";

/** The creature file names already used, in `creatures/` and `community/`. */
function taken(): Set<string> {
  const names = new Set<string>();
  for (const folder of ["creatures", "community"]) {
    const dir = join(root, folder);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) if (f.endsWith(".genie")) names.add(f.slice(0, -6));
  }
  return names;
}

const [command, out] = process.argv.slice(2);
const r = review(body, taken());

if (command === "review" && out) {
  mkdirSync(out, { recursive: true });
  if (r.picture) writeFileSync(join(out, "picture.png"), r.picture);
  const url = r.picture ? process.env.PICTURE_URL : undefined;
  writeFileSync(join(out, "comment.md"), reviewComment(r, url));
  console.log(r.problems.length === 0 ? "passed" : "failed");
} else if (command === "approve") {
  if (!r.share || r.problems.length > 0) {
    console.error(reviewComment(r, undefined));
    process.exit(1);
  }
  const path = join("community", `${r.fileName}.genie`);
  mkdirSync(join(root, "community"), { recursive: true });
  writeFileSync(join(root, path), approvedText(r.share, issueUrl));
  console.log(path);
} else {
  console.error("Use: cli.js review <out folder> | cli.js approve");
  process.exit(2);
}
