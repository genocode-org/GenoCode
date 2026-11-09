// Encodes pictures as PNG files, for the creature pages and for shared creatures' reviews (made
// in Node).

import { deflateSync } from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** An opaque picture as a PNG: RGB only, as the pictures have a background behind them. */
export function encodePng(width: number, height: number, rgba: Uint8ClampedArray): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8; // bits per channel
  header[9] = 2; // RGB
  // Each row starts with a filter byte. 2 ("up") stores each byte as its difference from the one
  // above, which is nearly always 0 in the smooth backgrounds, so they pack small.
  const row = width * 3 + 1;
  const raw = new Uint8Array(row * height);
  for (let y = 0; y < height; y++) {
    raw[y * row] = 2;
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        const here = rgba[(y * width + x) * 4 + c]!;
        const above = y > 0 ? rgba[((y - 1) * width + x) * 4 + c]! : 0;
        raw[y * row + 1 + x * 3 + c] = (here - above) & 0xff;
      }
    }
  }
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
