// A page for each starter creature, and one listing them all: its picture, its family of
// variants, its genes and its code, with a link that opens it in the app. Pictures are drawn by
// the software renderer when the website is built, so they always match the creatures.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import {
  build,
  buildBackground,
  check,
  formatValue,
  geneRange,
  lex,
  toRgb,
  type CheckResult,
  type Value,
} from "@genocode/core";
import { encodePng } from "@genocode/community/png";
import { rasterize } from "@genocode/render";
import { escape, shell, type SiteFile } from "./site.js";

const folder = new URL("../../creatures/", import.meta.url);

/** The picture sizes: the creature's own, and each of its variants'. */
const BIG = 480;
const SMALL = 200;

interface Creature {
  /** The file's name without `.genie`, as the app's `?example=` takes it. */
  name: string;
  text: string;
  program: CheckResult;
  about: string;
}

function creatures(): Creature[] {
  return readdirSync(folder)
    .filter((f) => f.endsWith(".genie"))
    .sort()
    .map((f) => {
      const text = readFileSync(new URL(f, folder), "utf8");
      const program = check(text);
      const about = program.file.description.map((c) => c.text.replace(/^\/\/\s?/, "")).join(" ");
      return { name: f.replace(/\.genie$/, ""), text, program, about };
    });
}

/** Names as people read them: `member_3` as "member 3". */
const words = (name: string) => name.replace(/_/g, " ");

/** A file name for a variant's picture: its name, kept to safe characters. */
const fileName = (name: string) => name.replace(/[^\w-]/g, "_");

/** The description, cut at a word to fit in a search result. */
function short(text: string, length = 155): string {
  if (text.length <= length) return text;
  return `${text.slice(0, text.lastIndexOf(" ", length - 1))}…`;
}

const pictures = new Map<string, Uint8Array>();

/** The creature drawn at rest, with a variant's genes if given; kept while the text is the same. */
function picture(c: Creature, size: number, variant?: string): Uint8Array {
  const key = createHash("sha1")
    .update(`${c.text}\0${size}\0${variant ?? ""}`)
    .digest("hex");
  let png = pictures.get(key);
  if (!png) {
    const genes = c.program.variants.find((v) => v.name === variant)?.values;
    const inputs = { time: 0 };
    const built = build(c.program, genes ? { genes, inputs } : { inputs });
    const image = rasterize(built.shapes, {
      width: size,
      height: size,
      background: buildBackground(c.program, { inputs }).fill,
      focus: built.focus,
    });
    png = encodePng(image.width, image.height, image.data);
    pictures.set(key, png);
  }
  return png;
}

/** The code with its words coloured: keywords, numbers, text and comments. */
function highlight(text: string): string {
  const { tokens, comments } = lex(text);
  const marks = [
    ...tokens.map((t) => ({
      span: t.span,
      kind:
        t.kind === "keyword"
          ? "k"
          : t.kind === "number" || t.kind === "hex"
            ? "n"
            : t.kind === "string"
              ? "s"
              : "",
    })),
    ...comments.map((c) => ({ span: c.span, kind: "c" })),
  ]
    .filter((m) => m.kind)
    .sort((a, b) => a.span.start - b.span.start);
  let html = "";
  let at = 0;
  for (const m of marks) {
    if (m.span.start < at) continue;
    html += escape(text.slice(at, m.span.start));
    html += `<span class="${m.kind}">${escape(text.slice(m.span.start, m.span.end))}</span>`;
    at = m.span.end;
  }
  return html + escape(text.slice(at));
}

/** A gene's value as text, with a swatch for colours. */
function value(v: Value, colour: boolean): string {
  const text = escape(formatValue(v));
  if (!colour || typeof v !== "object" || !("h" in v)) return text;
  const [r, g, b] = toRgb(v as Parameters<typeof toRgb>[0]).map((x) => Math.round(x * 255));
  return `<span class="swatch" style="background: rgb(${r} ${g} ${b})"></span>${text}`;
}

const STYLE = `<style>
.crumbs { margin: 16px 0 0; color: var(--muted); }
.intro { display: grid; grid-template-columns: minmax(0, 480px) minmax(0, 1fr); gap: 32px;
  align-items: center; margin-top: 8px; }
.intro img, .grid img { display: block; border-radius: 10px; border: 1px solid var(--line); }
.intro h1 { margin: 0 0 8px; font-size: 2.4rem; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; margin: 20px 0; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 14px; }
.grid figure { margin: 0; }
.grid figcaption { color: var(--muted); font-size: 0.9em; margin-top: 4px; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 18px; }
.card { display: block; color: var(--text); text-decoration: none; background: var(--panel);
  border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
.card:hover { border-color: var(--accent); }
.card img { display: block; width: 100%; }
.card div { padding: 10px 14px 14px; }
.card h2 { margin: 0 0 4px; font-size: 1.15rem; border: 0; padding: 0; color: #6bc8f2; }
.card p { margin: 0; color: var(--muted); font-size: 0.92em; }
.swatch { display: inline-block; width: 0.9em; height: 0.9em; border-radius: 3px; margin-right: 6px;
  vertical-align: -1px; border: 1px solid var(--line); }
.others { display: flex; justify-content: space-between; gap: 16px; margin-top: 40px; }
.genes td:nth-child(2) { min-width: 14em; }
@media (max-width: 760px) { .intro { grid-template-columns: minmax(0, 1fr); gap: 16px; } }
</style>`;

function creaturePage(c: Creature, all: Creature[]): string {
  const p = c.program;
  const facts = [
    `${p.genes.length} genes`,
    p.variants.length ? `${p.variants.length} variants` : "",
    p.live ? "moves by itself" : "",
    p.dance ? "has a dance of its own" : "",
  ].filter(Boolean);
  const family = p.variants.length
    ? `<h2>Its family</h2>
<p>Each one is the same program with different genes. In the app, <strong>Morph</strong> glides from one to the next, and <strong>Breed</strong> starts from them.</p>
<div class="grid">
${p.variants
  .map(
    (v) =>
      `<figure><img src="pictures/${fileName(c.name)}/${fileName(v.name)}.png" width="${SMALL}" height="${SMALL}" loading="lazy" alt="${escape(`${c.name}, ${words(v.name)}`)}"><figcaption>${escape(words(v.name))}</figcaption></figure>`,
  )
  .join("\n")}
</div>`
    : "";
  const genes = p.genes.length
    ? `<h2>Genes</h2>
<p>The values that change when ${escape(c.name)} mutates, breeds and morphs.</p>
<table class="genes">
<thead><tr><th>Gene</th><th>What it does</th><th>Range</th><th>Value</th></tr></thead>
<tbody>
${p.genes
  .map(
    (g) =>
      `<tr><td><code>${escape(g.fullName)}</code></td><td>${escape(g.description ?? "")}</td><td>${escape(geneRange(g))}</td><td>${value(g.value, g.kind === "colour")}</td></tr>`,
  )
  .join("\n")}
</tbody>
</table>`
    : "";
  const i = all.indexOf(c);
  const before = all[(i + all.length - 1) % all.length]!;
  const after = all[(i + 1) % all.length]!;
  const body = `<p class="crumbs"><a href="./">Creatures</a> › ${escape(c.name)}</p>
<section class="intro">
<img src="pictures/${fileName(c.name)}.png" width="${BIG}" height="${BIG}" alt="${escape(`${c.name}: ${c.about}`)}">
<div>
<h1>${escape(c.name)}</h1>
<p>${escape(c.about)}</p>
<p class="muted">${escape(facts.join(" · "))}</p>
<p class="actions"><a class="button primary" href="../app/?example=${encodeURIComponent(c.name)}">Open in GenoCode</a><a class="button" href="${encodeURIComponent(c.name)}.genie" download>Download ${escape(c.name)}.genie</a></p>
</div>
</section>
${family}
${genes}
<h2>The code</h2>
<pre><code>${highlight(c.text)}</code></pre>
<p class="others"><a href="${encodeURIComponent(before.name)}.html">← ${escape(before.name)}</a><a href="./">All creatures</a><a href="${encodeURIComponent(after.name)}.html">${escape(after.name)} →</a></p>`;
  return shell({
    path: `creatures/${c.name}.html`,
    title: `${c.name} – a GenoCode creature`,
    description: short(c.about),
    image: `creatures/pictures/${fileName(c.name)}.png`,
    head: STYLE,
    wide: true,
    body,
  });
}

function listPage(all: Creature[]): string {
  const body = `<h1>Creatures</h1>
<p>The creatures that come with GenoCode. Each one is a short program you can open in the app, read, change and breed. Many are rewritten from DancerDNA's creatures and name the one they were inspired by.</p>
<div class="cards">
${all
  .map(
    (c) =>
      `<a class="card" href="${encodeURIComponent(c.name)}.html"><img src="pictures/${fileName(c.name)}.png" width="${BIG}" height="${BIG}" loading="lazy" alt=""><div><h2>${escape(c.name)}</h2><p>${escape(short(c.about, 120))}</p></div></a>`,
  )
  .join("\n")}
</div>`;
  return shell({
    path: "creatures/index.html",
    title: "Creatures · GenoCode",
    description: `The ${all.length} starter creatures of GenoCode, each with its picture, its family of variants, its genes and its code.`,
    head: STYLE,
    wide: true,
    body,
  });
}

/** The creature pages, their pictures and their files. */
export function creatureFiles(): SiteFile[] {
  const all = creatures().filter((c) => c.program.ok && c.program.file.kind === "creature");
  const html = "text/html; charset=utf-8";
  const files: SiteFile[] = [
    { path: "creatures/index.html", type: html, source: "creatures", make: () => listPage(all) },
  ];
  for (const c of all) {
    files.push(
      {
        path: `creatures/${c.name}.html`,
        type: html,
        source: `creatures/${c.name}.genie`,
        make: () => creaturePage(c, all),
      },
      { path: `creatures/${c.name}.genie`, type: "text/plain; charset=utf-8", make: () => c.text },
      {
        path: `creatures/pictures/${fileName(c.name)}.png`,
        type: "image/png",
        make: () => picture(c, BIG),
      },
      ...c.program.variants.map((v) => ({
        path: `creatures/pictures/${fileName(c.name)}/${fileName(v.name)}.png`,
        type: "image/png",
        make: () => picture(c, SMALL, v.name),
      })),
    );
  }
  return files;
}
