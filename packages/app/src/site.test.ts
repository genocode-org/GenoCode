import { readdirSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import { describe, expect, it } from "vitest";
import { creatureFiles } from "../creatures.js";
import { docs } from "../docs.js";
import { sitemap } from "../site.js";

const app = new URL("../", import.meta.url);

/** Everything the website has: its own pages and files, and what Vite publishes. */
function published(): Set<string> {
  const paths = new Set([...docs(), ...creatureFiles()].map((f) => f.path));
  for (const p of ["index.html", "app/index.html", "sitemap.xml", "licenses.txt"]) paths.add(p);
  for (const f of readdirSync(new URL("public/", app))) paths.add(f);
  for (const f of readdirSync(new URL("landing/", app))) paths.add(`landing/${f}`);
  return paths;
}

/** The website's own links in a page: not other websites, not anchors in the page itself. */
function links(html: string): string[] {
  return [...html.matchAll(/(?:href|src)="([^"]*)"/g)]
    .map((m) => m[1]!)
    .filter((l) => !/^(https?:|mailto:|#)/.test(l));
}

/** Where a link from a page goes, as a published path. */
function target(from: string, link: string): string {
  let path = posix.join(posix.dirname(from), decodeURIComponent(link.split(/[?#]/)[0]!));
  if (link.split(/[?#]/)[0]!.endsWith("/") || path === ".") path = posix.join(path, "index.html");
  return path;
}

describe("the website", () => {
  const paths = published();
  const pages = [...docs(), ...creatureFiles()].filter((f) => f.path.endsWith(".html"));

  it("has a page for every starter creature", () => {
    const names = readdirSync(new URL("../../creatures/", app)).filter((f) => f.endsWith(".genie"));
    for (const f of names) expect(paths).toContain(`creatures/${f.replace(/\.genie$/, ".html")}`);
  });

  it("has the community's page, and a page for every creature shared with it", () => {
    expect(paths).toContain("community/index.html");
    const names = readdirSync(new URL("../../community/", app)).filter((f) => f.endsWith(".genie"));
    for (const f of names) expect(paths).toContain(`community/${f.replace(/\.genie$/, ".html")}`);
  });

  it("links only to what it publishes", () => {
    const broken: string[] = [];
    for (const page of pages) {
      for (const l of links(page.make() as string)) {
        if (!paths.has(target(page.path, l))) broken.push(`${page.path} → ${l}`);
      }
    }
    for (const path of ["index.html", "app/index.html"]) {
      const html = readFileSync(new URL(path, app), "utf8");
      // The app's own code and styles are Vite's to publish.
      for (const l of links(html).filter((l) => !l.includes("src/"))) {
        if (!paths.has(target(path, l))) broken.push(`${path} → ${l}`);
      }
    }
    expect(broken).toEqual([]);
  });

  for (const path of ["docs/reference.html", "docs/language.html"]) {
    it(`gives ${path} a tree with every section and entry, in place of its own contents`, () => {
      const html = docs()
        .find((f) => f.path === path)!
        .make() as string;
      const tree = html.match(/<nav class="tree"[\s\S]*?<\/nav>/)![0];
      const ids = [...html.matchAll(/<h[23] id="([^"]+)"/g)].map((m) => m[1]!);
      expect(ids.length).toBeGreaterThan(20);
      expect(ids.filter((id) => !tree.includes(`href="#${id}"`))).toEqual([]);
      expect(ids).not.toContain("contents");
    });

    it(`gives ${path}'s sections an arrow button beside the link, not around it`, () => {
      const html = docs()
        .find((f) => f.path === path)!
        .make() as string;
      const tree = html.match(/<nav class="tree"[\s\S]*?<\/nav>/)![0];
      expect(tree).not.toContain("<summary");
      const buttons = [...tree.matchAll(/<button class="tree-toggle"[^>]*><\/button>/g)];
      expect(buttons.length).toBeGreaterThan(5);
      for (const [b] of buttons) {
        const controls = b.match(/aria-controls="([^"]+)"/)![1]!;
        expect(tree).toContain(`<ul id="${controls}" hidden>`);
      }
    });
  }
});

describe("the sitemap", () => {
  it("lists each page's address, with the day it last changed when that's known", () => {
    const xml = sitemap([
      { path: "index.html", modified: "2026-10-29" },
      { path: "creatures/index.html" },
    ]);
    expect(xml).toContain(
      "<url><loc>https://genocode.piorek.co.za/</loc><lastmod>2026-10-29</lastmod></url>",
    );
    expect(xml).toContain("<url><loc>https://genocode.piorek.co.za/creatures/</loc></url>");
  });

  it("dates every page from a file in the repo", () => {
    const pages = [...docs(), ...creatureFiles()].filter((f) => f.path.endsWith(".html"));
    expect(pages.filter((f) => !f.source).map((f) => f.path)).toEqual([]);
  });
});
