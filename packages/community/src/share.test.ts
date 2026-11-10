import { describe, expect, it } from "vitest";
import {
  approvedText,
  fitsIssue,
  freeFileName,
  issueBody,
  LIMITS,
  MOST_ISSUE,
  problems,
  readCredit,
  readIssue,
  type Share,
} from "./share.js";

const share: Share = {
  name: "Wiggle",
  author: "Sam",
  description: "A worm that dances.",
  code: "creature Wiggle\nball()\n",
};

describe("a share", () => {
  it("is fine when every part is", () => {
    expect(problems(share)).toEqual([]);
  });

  it("says in plain words what's wrong", () => {
    expect(problems(undefined)).toEqual(["Nothing was sent."]);
    expect(problems({ ...share, name: "2 worms" })[0]).toMatch(/start with a letter/);
    expect(problems({ ...share, author: " " })).toEqual(["Please give a name to credit you by."]);
    expect(problems({ ...share, author: "@octocat" })[0]).toMatch(/can't hold @/);
    expect(problems({ ...share, author: "Sam\nSmith" })[0]).toMatch(/can't be shown/);
    expect(problems({ ...share, code: "x".repeat(LIMITS.code + 1) })[0]).toMatch(/too long/);
    expect(problems({ ...share, code: 3 })).toEqual(["The code is missing."]);
  });
});

describe("the issue", () => {
  it("gives back the share it was made from, whatever the code holds", () => {
    const tricky: Share = {
      ...share,
      description: "Ends early? --> ``` ~~~ <script>alert(1)</script> @someone",
      code: "creature Wiggle\n// ```` and --> and é, 🐛\nball()\n",
    };
    expect(readIssue(issueBody(tricky))).toEqual(tricky);
  });

  it("fences the code so nothing in it can end the block", () => {
    const body = issueBody({ ...share, code: "creature Wiggle\n// ````\nball()\n" });
    expect(body).toContain("`````genie\n");
  });

  it("leaves the code people read out of an issue it wouldn't fit in twice", () => {
    const long = { ...share, code: "creature Wiggle\n" + "ball()\n".repeat(4000) };
    expect(long.code.length).toBeLessThanOrEqual(LIMITS.code);
    const body = issueBody(long);
    expect(body.length).toBeLessThanOrEqual(MOST_ISSUE);
    expect(body).toContain("too long to show here");
    expect(readIssue(body)).toEqual(long);
    expect(fitsIssue(long)).toBe(true);
  });

  it("says when a share can't fit in an issue at all", () => {
    const huge = { ...share, code: "creature Wiggle\n// " + "🐛".repeat(15_000) + "\n" };
    expect(huge.code.length).toBeLessThanOrEqual(LIMITS.code);
    expect(fitsIssue(huge)).toBe(false);
  });

  it("holds no share when the hidden copy is missing or broken", () => {
    expect(readIssue("Just an issue.")).toBeUndefined();
    expect(readIssue("<!-- genocode-share v1 bm90IGpzb24= -->")).toBeUndefined();
    const bad = { ...share, author: "@octocat" };
    const hidden = Buffer.from(JSON.stringify(bad)).toString("base64");
    expect(readIssue(`<!-- genocode-share v1 ${hidden} -->`)).toBeUndefined();
  });
});

describe("the approved file", () => {
  it("credits the author above the code", () => {
    const text = approvedText(share, "https://github.com/o/r/issues/7");
    expect(text.split("\n")[0]).toBe(
      "// Shared by Sam under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/): https://github.com/o/r/issues/7",
    );
    expect(text.endsWith("ball()\n")).toBe(true);
  });

  it("says what the sharer said about it, and gives both back", () => {
    const url = "https://github.com/o/r/issues/7";
    const text = approvedText({ ...share, description: "A worm.\nIt dances." }, url);
    expect(text.split("\n")[1]).toBe("// About it: A worm. It dances.");
    expect(readCredit(text)).toEqual({ author: "Sam", url, about: "A worm. It dances." });
    expect(readCredit(approvedText({ ...share, description: "" }, url))?.about).toBe("");
    expect(readCredit(share.code)).toBeUndefined();
  });

  it("gets a name of its own", () => {
    expect(freeFileName("Wiggle", new Set())).toBe("Wiggle");
    expect(freeFileName("Wiggle", new Set(["Wiggle", "Wiggle_2"]))).toBe("Wiggle_3");
  });
});
