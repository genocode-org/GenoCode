import { describe, expect, it } from "vitest";
import { evenSound, opusSamples } from "./mp4sound.js";

// A small fragmented MP4 like the ones Chromium records: a video track and an Opus or AAC sound
// track, with fragments whose sound pieces are stamped by the clock.

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u64 = (n: number) => [...u32(Math.floor(n / 2 ** 32)), ...u32(n >>> 0)];
const text = (s: string) => [...s].map((c) => c.charCodeAt(0));
const box = (type: string, ...body: number[][]) => {
  const flat = body.flat();
  return [...u32(8 + flat.length), ...text(type), ...flat];
};
const full = (type: string, version: number, flags: number, ...body: number[][]) =>
  box(type, [version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255], ...body);

function trak(id: number, handler: string, timescale: number, entry: number[]) {
  return box(
    "trak",
    full("tkhd", 0, 3, u32(0), u32(0), u32(id), new Array(68).fill(0)),
    box(
      "mdia",
      full("mdhd", 0, 0, u32(0), u32(0), u32(timescale), u32(0), [0, 0, 0, 0]),
      full("hdlr", 0, 0, u32(0), text(handler), new Array(12).fill(0), [0]),
      box("minf", box("stbl", full("stsd", 0, 0, u32(1), entry))),
    ),
  );
}

const opusEntry = box("Opus", new Array(28).fill(0));
const aacEntry = box("mp4a", new Array(24).fill(0), u32(44100 * 65536), new Array(4).fill(0));

/** A 60 ms Opus packet: CELT 20 ms frames (config 31), code 3, three frames. */
const opus60 = [0xfb, 3, 9, 9, 9];

interface Fragment {
  time: number;
  durations: number[];
  /** Each piece's bytes. */
  pieces: number[][];
}

function file(entry: number[], fragments: Fragment[]) {
  const head = [
    ...box("ftyp", text("isom"), u32(512)),
    ...box(
      "moov",
      trak(1, "vide", 30000, box("vp09", new Array(8).fill(0))),
      trak(2, "soun", entry === opusEntry ? 48000 : 44100, entry),
      box("mvex", full("trex", 0, 0, u32(1), u32(1), u32(0), u32(0), u32(0))),
    ),
  ];
  const out = [...head];
  for (const f of fragments) {
    const data = f.pieces.flat();
    const trafOf = (offset: number) =>
      box(
        "traf",
        full("tfhd", 0, 0x20020, u32(2), u32(0)),
        full("tfdt", 1, 0, u64(f.time)),
        full(
          "trun",
          1,
          0x301,
          u32(f.durations.length),
          u32(offset),
          ...f.durations.map((d, i) => [...u32(d), ...u32(f.pieces[i]!.length)]),
        ),
      );
    const moofSize = box("moof", full("mfhd", 0, 0, u32(1)), trafOf(0)).length;
    out.push(...box("moof", full("mfhd", 0, 0, u32(1)), trafOf(moofSize + 8)));
    out.push(...box("mdat", data));
  }
  return new Uint8Array(out);
}

/** Each fragment's start and its pieces' lengths, as the file now says. */
function stamps(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const found: { time: number; durations: number[] }[] = [];
  for (let at = 0; at + 8 <= bytes.length;) {
    if (String.fromCharCode(...bytes.subarray(at + 4, at + 8)) === "tfdt") {
      const time = Number(view.getBigUint64(at + 12));
      const trun = at + 20;
      const count = view.getUint32(trun + 12);
      const durations = Array.from({ length: count }, (_, i) => view.getUint32(trun + 20 + i * 8));
      found.push({ time, durations });
      at = trun;
    } else at++;
  }
  return found;
}

describe("evening out a recording's sound", () => {
  it("knows an Opus packet's length", () => {
    expect(opusSamples(new Uint8Array(opus60))).toBe(2880);
    expect(opusSamples(new Uint8Array([0xf8]))).toBe(960); // one 20 ms frame
    expect(opusSamples(new Uint8Array([0x09]))).toBe(1920); // SILK 20 ms, two frames
    expect(opusSamples(new Uint8Array([]))).toBeUndefined();
  });

  it("stamps each Opus piece with its real length, and each fragment where the last ended", () => {
    const before = file(opusEntry, [
      { time: 100, durations: [2651, 3025, 2517], pieces: [opus60, opus60, opus60] },
      { time: 9000, durations: [3163, 3026], pieces: [opus60, opus60] },
    ]);
    const after = evenSound(before);
    expect(after.length).toBe(before.length);
    expect(stamps(after)).toEqual([
      { time: 100, durations: [2880, 2880, 2880] },
      { time: 100 + 3 * 2880, durations: [2880, 2880] },
    ]);
  });

  it("gives AAC pieces 1024 samples each", () => {
    const after = evenSound(
      file(aacEntry, [{ time: 0, durations: [1100, 950], pieces: [[1, 2], [3]] }]),
    );
    expect(stamps(after)).toEqual([{ time: 0, durations: [1024, 1024] }]);
  });

  it("leaves a file that is already even as it was", () => {
    const even = file(opusEntry, [{ time: 0, durations: [2880], pieces: [opus60] }]);
    expect(evenSound(even)).toBe(even);
  });

  it("leaves anything else as it was", () => {
    const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4]);
    expect(evenSound(webm)).toBe(webm);
    const broken = file(opusEntry, [{ time: 0, durations: [3000], pieces: [opus60] }]).slice(0, -3);
    expect(evenSound(broken)).toBe(broken);
  });
});
