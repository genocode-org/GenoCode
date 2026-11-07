// Chromium-based browsers (Brave, Chrome, Edge) write a recorded MP4's sound with timestamps taken
// from the clock, not from the sound itself: each 60 ms piece is stamped a few milliseconds early
// or late. Players that follow the stamps (VLC, for one) leave a tiny gap or overlap at every
// piece, heard as clicks all through the video. `evenSound` stamps each piece with its real length
// instead, so the sound runs on without a break.
//
// Only the numbers in the fragment headers change: no box grows or shrinks, and nothing is encoded
// again. A file it doesn't understand is given back as it was.

interface Box {
  type: string;
  /** Where the box starts. */
  start: number;
  /** Where its contents start, after the header. */
  body: number;
  end: number;
}

function boxes(view: DataView, from: number, to: number): Box[] {
  const out: Box[] = [];
  let at = from;
  while (at + 8 <= to) {
    let size = view.getUint32(at);
    let body = at + 8;
    if (size === 1) {
      if (at + 16 > to) break;
      size = Number(view.getBigUint64(at + 8));
      body = at + 16;
    } else if (size === 0) {
      size = to - at;
    }
    if (size < body - at || at + size > to) break;
    const type = String.fromCharCode(
      view.getUint8(at + 4),
      view.getUint8(at + 5),
      view.getUint8(at + 6),
      view.getUint8(at + 7),
    );
    out.push({ type, start: at, body, end: at + size });
    at += size;
  }
  return out;
}

function child(view: DataView, box: Box | undefined, ...path: string[]): Box | undefined {
  let at = box;
  for (const type of path) {
    if (!at) return undefined;
    at = boxes(view, at.body, at.end).find((b) => b.type === type);
  }
  return at;
}

interface SoundTrack {
  id: number;
  /** Ticks per second of the track's timestamps. */
  timescale: number;
  /** The length of one piece of sound, in ticks, from its bytes. */
  length: (bytes: Uint8Array) => number | undefined;
  /** The piece size used when a fragment doesn't give each piece's size. */
  defaultSize: number;
}

/**
 * The length of an Opus packet in 48 kHz samples, from its first byte (RFC 6716, section 3.1),
 * or undefined when the packet is too short to say.
 */
export function opusSamples(packet: Uint8Array): number | undefined {
  if (packet.length < 1) return undefined;
  const toc = packet[0]!;
  const config = toc >> 3;
  // A frame's length in tenths of a millisecond.
  const tenths =
    config < 12
      ? [100, 200, 400, 600][config % 4]!
      : config < 16
        ? [100, 200][config % 2]!
        : [25, 50, 100, 200][config % 4]!;
  const code = toc & 3;
  let frames = code === 0 ? 1 : 2;
  if (code === 3) {
    if (packet.length < 2) return undefined;
    frames = packet[1]! & 0x3f;
  }
  return (frames * tenths * 48) / 10;
}

function soundTrack(view: DataView, moov: Box): SoundTrack | undefined {
  let defaults = new Map<number, number>();
  const mvex = child(view, moov, "mvex");
  if (mvex) {
    for (const trex of boxes(view, mvex.body, mvex.end)) {
      if (trex.type !== "trex" || trex.end - trex.body < 24) continue;
      defaults.set(view.getUint32(trex.body + 4), view.getUint32(trex.body + 16));
    }
  }
  for (const trak of boxes(view, moov.body, moov.end)) {
    if (trak.type !== "trak") continue;
    const hdlr = child(view, trak, "mdia", "hdlr");
    if (!hdlr || hdlr.end - hdlr.body < 12) continue;
    if (view.getUint32(hdlr.body + 8) !== 0x736f756e) continue; // "soun"
    const tkhd = child(view, trak, "tkhd");
    const mdhd = child(view, trak, "mdia", "mdhd");
    const stsd = child(view, trak, "mdia", "minf", "stbl", "stsd");
    if (!tkhd || !mdhd || !stsd) return undefined;
    const id = view.getUint32(tkhd.body + (view.getUint8(tkhd.body) === 1 ? 20 : 12));
    const timescale = view.getUint32(mdhd.body + (view.getUint8(mdhd.body) === 1 ? 20 : 12));
    const entry = boxes(view, stsd.body + 8, stsd.end)[0];
    if (!entry || timescale === 0) return undefined;
    const defaultSize = defaults.get(id) ?? 0;
    if (entry.type === "Opus") {
      return {
        id,
        timescale,
        defaultSize,
        length: (bytes) => {
          const samples = opusSamples(bytes);
          return samples === undefined ? undefined : (samples * timescale) / 48000;
        },
      };
    }
    if (entry.type === "mp4a" && entry.end - entry.start >= 36) {
      // AAC: 1024 samples a piece, at the rate in the sample entry (16.16 fixed point).
      const rate = view.getUint32(entry.start + 32) / 65536;
      if (rate <= 0) return undefined;
      return { id, timescale, defaultSize, length: () => (1024 * timescale) / rate };
    }
    return undefined;
  }
  return undefined;
}

/** The fragments' flags this needs: tfhd and trun (ISO/IEC 14496-12, 8.8.7 and 8.8.8). */
const BASE_OFFSET = 0x1;
const SAMPLE_DESCRIPTION = 0x2;
const DEFAULT_DURATION = 0x8;
const DEFAULT_SIZE = 0x10;
const DEFAULT_FLAGS = 0x20;
const BASE_IS_MOOF = 0x20000;
const DATA_OFFSET = 0x1;
const FIRST_FLAGS = 0x4;
const DURATIONS = 0x100;
const SIZES = 0x200;
const FLAGS = 0x400;
const TIME_OFFSETS = 0x800;

/**
 * A recorded MP4 with its sound's timestamps made to follow each piece's real length. The first
 * piece keeps its time, so the sound starts where it did. Anything else (a WebM, an MP4 that isn't
 * in fragments, a sound it doesn't know) is given back unchanged.
 */
export function evenSound(file: Uint8Array): Uint8Array {
  const out = file.slice();
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  const top = boxes(view, 0, out.length);
  const moov = top.find((b) => b.type === "moov");
  if (!moov) return file;
  const track = soundTrack(view, moov);
  if (!track) return file;

  let time: number | undefined;
  let changed = false;
  for (const moof of top) {
    if (moof.type !== "moof") continue;
    for (const traf of boxes(view, moof.body, moof.end)) {
      if (traf.type !== "traf") continue;
      const parts = boxes(view, traf.body, traf.end);
      const tfhd = parts.find((b) => b.type === "tfhd");
      const tfdt = parts.find((b) => b.type === "tfdt");
      if (!tfhd || view.getUint32(tfhd.body + 4) !== track.id) continue;
      if (!tfdt) return file;

      const tfhdFlags = view.getUint32(tfhd.body) & 0xffffff;
      let at = tfhd.body + 8;
      let base = moof.start;
      if (tfhdFlags & BASE_OFFSET) {
        base = Number(view.getBigUint64(at));
        at += 8;
      } else if (!(tfhdFlags & BASE_IS_MOOF)) {
        // The data would start where the previous track's ended: not worth following.
        return file;
      }
      if (tfhdFlags & SAMPLE_DESCRIPTION) at += 4;
      if (tfhdFlags & DEFAULT_DURATION) at += 4;
      const defaultSize = tfhdFlags & DEFAULT_SIZE ? view.getUint32(at) : track.defaultSize;
      if (tfhdFlags & DEFAULT_SIZE) at += 4;
      if (tfhdFlags & DEFAULT_FLAGS) at += 4;

      // The first fragment keeps its start; each one after starts where the last one ended.
      const v1 = view.getUint8(tfdt.body) === 1;
      if (time === undefined) {
        time = v1 ? Number(view.getBigUint64(tfdt.body + 4)) : view.getUint32(tfdt.body + 4);
      } else if (v1) {
        view.setBigUint64(tfdt.body + 4, BigInt(Math.round(time)));
      } else {
        view.setUint32(tfdt.body + 4, Math.round(time));
      }

      let now = time;
      let data = base;
      for (const trun of parts) {
        if (trun.type !== "trun") continue;
        const flags = view.getUint32(trun.body) & 0xffffff;
        if (!(flags & DURATIONS)) return file;
        const count = view.getUint32(trun.body + 4);
        let entry = trun.body + 8;
        if (flags & DATA_OFFSET) {
          data = base + view.getInt32(entry);
          entry += 4;
        }
        if (flags & FIRST_FLAGS) entry += 4;
        const stride =
          4 *
          (1 + (flags & SIZES ? 1 : 0) + (flags & FLAGS ? 1 : 0) + (flags & TIME_OFFSETS ? 1 : 0));
        if (entry + count * stride > trun.end) return file;
        for (let i = 0; i < count; i++, entry += stride) {
          const size = flags & SIZES ? view.getUint32(entry + 4) : defaultSize;
          if (size === 0 || data + size > out.length) return file;
          const length = track.length(out.subarray(data, data + size));
          if (length === undefined) return file;
          // Ticks are whole numbers: round the running time, not each piece, so nothing drifts.
          const next = now + length;
          const ticks = Math.round(next) - Math.round(now);
          if (view.getUint32(entry) !== ticks) changed = true;
          view.setUint32(entry, ticks);
          now = next;
          data += size;
        }
      }
      time = now;
    }
  }
  return changed ? out : file;
}
