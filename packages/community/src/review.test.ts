import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { review, reviewComment } from "./review.js";
import { issueBody, type Share } from "./share.js";

const geno = readFileSync(new URL("../../../creatures/Geno.genie", import.meta.url), "utf8");

const share = (code: string, name = "Geno"): Share => ({
  name,
  author: "Sam",
  description: "",
  code,
});

describe("reviewing a shared creature", () => {
  it("passes a good creature and draws it", () => {
    const r = review(issueBody(share(geno)), new Set());
    expect(r.problems).toEqual([]);
    expect(r.fileName).toBe("Geno");
    expect([...r.picture!.slice(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
    const comment = reviewComment(r, "https://example.com/1.png");
    expect(comment).toContain("passed the checks");
    expect(comment).toContain("![The creature at rest](https://example.com/1.png)");
    expect(comment).toContain("add the label `approved`");
  });

  it("checks a creature without drawing it, as approving does", () => {
    const r = review(issueBody(share(geno)), new Set(), false);
    expect(r.problems).toEqual([]);
    expect(r.picture).toBeUndefined();
    expect(r.notes.join(" ")).toMatch(/shapes/);
  });

  it("gives a creature whose name is taken a file name of its own", () => {
    const r = review(issueBody(share(geno)), new Set(["Geno"]));
    expect(r.fileName).toBe("Geno_2");
    expect(r.notes[0]).toMatch(/becomes Geno_2/);
  });

  it("refuses code with errors, the wrong name, or that isn't a creature", () => {
    expect(review(issueBody(share("creature Geno\nball(\n")), new Set()).problems[0]).toMatch(
      /^Line \d+:/,
    );
    expect(review(issueBody(share(geno, "Other")), new Set()).problems[0]).toMatch(/calls it Geno/);
    const pattern = "pattern Geno\nvalue picture {\n  value x\n}\n";
    expect(review(issueBody(share(pattern)), new Set()).problems[0]).toMatch(/not a creature/);
  });

  it("stops a creature whose loop never ends", () => {
    const r = review(issueBody(share("creature Geno\nwhile true {\n  let n = 1\n}\n")), new Set());
    expect(r.problems.join(" ")).toMatch(/When built:/);
    expect(r.picture).toBeUndefined();
    expect(reviewComment(r, undefined)).toContain("can't be added yet");
  }, 60_000);

  it("refuses an issue that holds no share", () => {
    expect(review("Hello", new Set()).problems[0]).toMatch(/holds no shared creature/);
  });
});
