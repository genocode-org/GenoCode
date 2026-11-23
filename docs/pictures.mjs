// Draws the pictures in docs/LANGUAGE.md and docs/REFERENCE.md with GenoCode's own renderer, so they
// always show what the code above them really draws.
//
// An example gets a picture when the line just before its code block is a marker:
//
//   <!-- picture: forward -->
//
// and, after the block, the picture itself: ![What it shows](images/forward.png). The marker can
// also say how to draw it: `view=three-quarter` (or `view=30,10`, yaw and pitch in degrees),
// `views=front,top` (side by side), `time=2` (seconds), `variant=Name` and `variants=all` (the
// creature and then each of its variants, side by side) and `morph=A,B` (variant A, halfway
// through the morph from A to B, and B, side by side). `columns=N` puts the pictures in rows of
// N instead of one long row. A pattern file is drawn flat, filling the picture. Code that isn't a
// whole file is drawn inside a creature, as the docs tests check it.
//
//   npm run build && node docs/pictures.mjs   draws every picture again
//
// docs/images/pictures.json keeps a fingerprint of each picture's code, so the docs tests can tell
// when an example changed but its picture wasn't drawn again.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const root = new URL("../", import.meta.url);
const core = await import(new URL("packages/core/dist/index.js", root).href);
const { rasterize } = await import(new URL("packages/render/dist/index.js", root).href);

const SIZE = 320;
const DOCS = ["LANGUAGE.md", "REFERENCE.md"];
const VIEWS = {
  front: { yaw: 0, pitch: 0 },
  right: { yaw: 90, pitch: 0 },
  back: { yaw: 180, pitch: 0 },
  left: { yaw: -90, pitch: 0 },
  top: { yaw: 0, pitch: 90 },
  bottom: { yaw: 0, pitch: -90 },
  "three-quarter": { yaw: 45, pitch: 30 },
};

/** The marked examples in a document: name, options, code and the fingerprint of both. */
export function markedExamples(markdown) {
  const found = [];
  for (const m of markdown.matchAll(
    /^<!-- picture: (\S+)((?: [\w-]+=\S+)*) -->\n\n?```\n([\s\S]*?)^```$/gm,
  )) {
    const options = Object.fromEntries(
      m[2]
        .trim()
        .split(" ")
        .filter(Boolean)
        .map((o) => o.split("=")),
    );
    const code = m[3];
    const fingerprint = createHash("sha256")
      .update(JSON.stringify([m[2].trim(), code]))
      .digest("hex")
      .slice(0, 16);
    found.push({ name: m[1], options, code, fingerprint });
  }
  return found;
}

function view(text) {
  if (VIEWS[text]) return VIEWS[text];
  const [yaw, pitch] = text.split(",").map(Number);
  if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) throw new Error(`\`${text}\` isn't a view`);
  return { yaw, pitch };
}

/** A pattern file as a creature whose background is the pattern, so it fills the picture. */
function flat(program) {
  const { name, items } = program.file;
  const body = program.text
    .slice(items[0].span.start)
    .trimEnd()
    .split("\n")
    .map((l) => (l ? `  ${l}` : ""))
    .join("\n");
  return core.check(
    `creature ${name}\n\npattern ${name} {\n${body}\n}\n\nbackground {\n  fill pattern(${name}, 200, 1)\n}\n`,
  );
}

function draw({ name, options, code }) {
  const whole = /^(creature|background|dance|pattern) \w+\n/.test(code);
  let program = core.check(whole ? code : `creature Example\n${code}`);
  const errors = program.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) throw new Error(`${name}: ${errors.map((e) => e.message).join("; ")}`);
  if (program.file.kind === "pattern") program = flat(program);
  const pick = (variant) => {
    const found = program.variants.find((v) => v.name === variant);
    if (!found) throw new Error(`${name}: no variant \`${variant}\``);
    return found.values;
  };
  const halfway = (a, b) =>
    core.morph({ genes: program.genes, values: a }, { genes: program.genes, values: b }, 0.5)
      .values;
  const [from, to] = (options.morph ?? "").split(",");
  const geneSets = options.morph
    ? [pick(from), halfway(pick(from), pick(to)), pick(to)]
    : options.variants === "all"
      ? [new Map(), ...program.variants.map((v) => v.values)]
      : [options.variant ? pick(options.variant) : new Map()];
  const inputs = { time: Number(options.time ?? 0), beat: 0, music: {} };
  const views = options.views
    ? options.views.split(",").map(view)
    : [options.view ? view(options.view) : undefined];
  const images = geneSets.flatMap((genes) => {
    const built = core.build(program, { inputs, genes });
    const background = core.buildBackground(program, { inputs, genes }).fill;
    return views.map((v) =>
      rasterize(built.shapes, {
        width: SIZE,
        height: SIZE,
        background,
        view: v,
        focus: built.focus,
      }),
    );
  });
  const gap = 6;
  const columns = Math.min(Number(options.columns ?? images.length), images.length);
  const rows = Math.ceil(images.length / columns);
  const width = SIZE * columns + gap * (columns - 1);
  const height = SIZE * rows + gap * (rows - 1);
  const data = new Uint8ClampedArray(width * height * 4);
  images.forEach((image, k) => {
    const left = (k % columns) * (SIZE + gap);
    const top = Math.floor(k / columns) * (SIZE + gap);
    for (let y = 0; y < SIZE; y++) {
      data.set(
        image.data.subarray(y * SIZE * 4, (y + 1) * SIZE * 4),
        ((top + y) * width + left) * 4,
      );
    }
  });
  return png(width, height, data);
}

/** RGBA pixels as a PNG, each row stored as its difference from the row above. */
function png(width, height, rgba) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const chunk = (type, body) => {
    const out = Buffer.alloc(12 + body.length);
    out.writeUInt32BE(body.length, 0);
    out.write(type, 4, "ascii");
    body.copy(out, 8);
    let c = 0xffffffff;
    for (const b of out.subarray(4, 8 + body.length)) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    out.writeUInt32BE((c ^ 0xffffffff) >>> 0, 8 + body.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const row = width * 4;
  const raw = Buffer.alloc((row + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (row + 1)] = y === 0 ? 0 : 2;
    for (let x = 0; x < row; x++) {
      const v = rgba[y * row + x];
      raw[y * (row + 1) + 1 + x] = y === 0 ? v : (v - rgba[(y - 1) * row + x]) & 0xff;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const only = process.argv.slice(2);
const images = new URL("docs/images/", root);
mkdirSync(images, { recursive: true });
const fingerprints = {};
for (const doc of DOCS) {
  const markdown = readFileSync(new URL(`docs/${doc}`, root), "utf8");
  for (const example of markedExamples(markdown)) {
    if (fingerprints[example.name]) throw new Error(`two pictures are called ${example.name}`);
    fingerprints[example.name] = example.fingerprint;
    if (only.length > 0 && !only.includes(example.name)) continue;
    writeFileSync(new URL(`${example.name}.png`, images), draw(example));
    console.log(`${doc}: ${example.name}.png`);
  }
}
const sorted = Object.fromEntries(
  Object.entries(fingerprints).sort(([a], [b]) => a.localeCompare(b)),
);
writeFileSync(new URL("pictures.json", images), JSON.stringify(sorted, null, 2) + "\n");
