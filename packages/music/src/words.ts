// The singing in a song, from its timed words: music.words (a line is being sung) and
// music.chorus (the line being sung is one the song keeps coming back to). The words come from
// lrclib.net, a free library of timed song words, looked up by the song's artist, title and length.
// Only when each line starts is kept: the words themselves are never handed on.

/** One line of timed words: when it starts, in seconds, and its words. */
export interface TimedLine {
  time: number;
  text: string;
}

/** Seconds the singing value takes to rise as a line starts. */
const RISE = 0.3;
/** Seconds it takes to fall once the singing stops. */
const FALL = 0.6;
/** Seconds a line of `n` words is taken to last at most: a longer gap after it is a break. */
const lineLength = (n: number): number => 2 + 0.6 * n;
/** How many times a line must come back to count as part of the chorus. */
const CHORUS_REPEATS = 3;
/** How many lines in a row, sung again in the same order, count as part of the chorus. */
const CHORUS_RUN = 3;

/**
 * Reads timed words in the LRC format: lines like `[01:23.45]Words`, a line may carry several
 * times, and `[offset:+250]` moves them all (in milliseconds, later for a positive offset).
 */
export function parseLrc(text: string): TimedLine[] {
  const lines: TimedLine[] = [];
  let offset = 0;
  for (const raw of text.split(/\r?\n/)) {
    const off = /^\s*\[offset:\s*([+-]?\d+)\s*\]/i.exec(raw);
    if (off) offset = Number(off[1]) / 1000;
    const times: number[] = [];
    let rest = raw.trim();
    for (;;) {
      const m = /^\[(\d+):(\d+(?:\.\d+)?)\]/.exec(rest);
      if (!m) break;
      times.push(Number(m[1]) * 60 + Number(m[2]));
      rest = rest.slice(m[0].length);
    }
    for (const t of times) lines.push({ time: t, text: rest.trim() });
  }
  // A positive offset means the words come earlier than written.
  return lines
    .map((l) => ({ time: Math.max(0, l.time - offset), text: l.text }))
    .sort((a, b) => a.time - b.time);
}

/** A line's words: lower case, letters and digits only. */
function plain(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Sounds sung around the words ("oh", "uh", "yeah"), left out when comparing lines. */
const FILLERS = new Set(["oh", "ooh", "uh", "ah", "eh", "yeah", "hey", "hoo", "hee", "baby", "no"]);

/** The words that make a line what it is: no backing calls in brackets, no fillers. */
function core(text: string): string[] {
  return plain(text.replace(/\([^)]*\)?/g, " "))
    .split(" ")
    .filter((w) => w !== "" && !FILLERS.has(w));
}

/** Whether two lines are the same line sung again: most of their words match, in any order. */
function same(a: readonly string[], b: readonly string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const left = [...b];
  let shared = 0;
  for (const w of a) {
    const i = left.indexOf(w);
    if (i >= 0) {
      shared++;
      left.splice(i, 1);
    }
  }
  return shared / Math.max(a.length, b.length) >= 0.75;
}

/** A stretch of time, in seconds. */
interface Span {
  from: number;
  to: number;
}

/** Joins spans closer than a fall apart, so the value doesn't dip between lines sung on end. */
function join(spans: Span[]): Span[] {
  const out: Span[] = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (last && s.from - last.to < FALL) last.to = Math.max(last.to, s.to);
    else out.push({ ...s });
  }
  return out;
}

/** 0 → 1 easing in and out. */
const ease = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : (1 - Math.cos(Math.PI * x)) / 2);

/** The value at `t` for a set of spans: rising at each start, falling after each end. */
function valueAt(spans: readonly Span[], t: number): number {
  let v = 0;
  for (const s of spans) {
    if (s.from - t > 0) break;
    v = Math.max(v, Math.min(ease((t - s.from) / RISE), ease(1 - (t - s.to) / FALL)));
  }
  return v;
}

/** The singing of one song, worked out once from its timed words. */
export class SongWords {
  /** When a line is being sung. */
  readonly singing: readonly Span[];
  /** When a chorus line is being sung. */
  readonly chorus: readonly Span[];

  /** `length` is the song's length in seconds, which ends the last line. */
  constructor(lines: readonly TimedLine[], length = Infinity) {
    const sung: (Span & { words: string[] })[] = [];
    lines.forEach((l, i) => {
      const all = plain(l.text);
      if (all === "") return;
      const next = lines[i + 1]?.time ?? length;
      const to = Math.min(next, l.time + lineLength(all.split(" ").length));
      if (to > l.time) sung.push({ from: l.time, to, words: core(l.text) });
    });
    // A chorus line is one the song keeps coming back to: it's sung again at least twice more, or
    // it's in a run of lines that's sung again as a run.
    const inChorus = sung.map(
      (s, i) =>
        sung.filter((o, j) => j !== i && same(s.words, o.words)).length >= CHORUS_REPEATS - 1,
    );
    for (let i = 0; i < sung.length; i++) {
      for (let j = i + 1; j < sung.length; j++) {
        let run = 0;
        while (
          j + run < sung.length &&
          i + run < j &&
          same(sung[i + run]!.words, sung[j + run]!.words)
        )
          run++;
        if (run < CHORUS_RUN) continue;
        for (let k = 0; k < run; k++) inChorus[i + k] = inChorus[j + k] = true;
      }
    }
    this.singing = join(sung);
    this.chorus = join(sung.filter((_, i) => inChorus[i]));
  }

  /** music.words and music.chorus at `t` seconds into the song. */
  at(t: number): { words: number; chorus: number } {
    return { words: valueAt(this.singing, t), chorus: valueAt(this.chorus, t) };
  }
}

/** What lrclib.net knows of a song. */
interface LrclibSong {
  duration?: number;
  syncedLyrics?: string | null;
}

const LRCLIB = "https://lrclib.net/api";
/** How far, in seconds, a found song's length may be from ours: another version's timings would be wrong. */
const SAME_LENGTH = 3;

/**
 * Looks up a song's timed lines on lrclib.net by its artist, title and length in seconds. Only
 * those three are sent. "none" when the song isn't there with timed words for this length,
 * "failed" when lrclib.net couldn't be asked (no connection, or it didn't answer).
 */
export async function findWords(song: {
  artist: string;
  title: string;
  length: number;
}): Promise<TimedLine[] | "none" | "failed"> {
  const linesOf = (hit: LrclibSong | undefined): TimedLine[] | undefined => {
    if (!hit?.syncedLyrics) return undefined;
    if (hit.duration !== undefined && Math.abs(hit.duration - song.length) > SAME_LENGTH) {
      return undefined;
    }
    const lines = parseLrc(hit.syncedLyrics);
    return lines.length > 0 ? lines : undefined;
  };
  let failed = false;
  const get = async (path: string, query: Record<string, string>): Promise<unknown> => {
    try {
      const r = await fetch(`${LRCLIB}/${path}?${new URLSearchParams(query)}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (r.status === 404) return undefined;
      if (!r.ok) failed = true;
      return r.ok ? await r.json() : undefined;
    } catch {
      failed = true;
      return undefined;
    }
  };
  const exact = linesOf(
    (await get("get", {
      artist_name: song.artist,
      track_name: song.title,
      duration: String(Math.round(song.length)),
    })) as LrclibSong | undefined,
  );
  if (exact) return exact;
  // The same recording may be filed under a slightly different name: search, and take the first
  // with timed words and the same length.
  const found = await get("search", { q: `${song.artist} ${song.title}` });
  for (const hit of Array.isArray(found) ? (found as LrclibSong[]) : []) {
    const lines = linesOf(hit);
    if (lines) return lines;
  }
  return failed ? "failed" : "none";
}

/**
 * The artist and title of a song from its file name, as in "Artist - Title.mp3". Undefined when
 * the name doesn't say both.
 */
export function songFromFileName(name: string): { artist: string; title: string } | undefined {
  const base = name.replace(/\.[^.]+$/, "").replace(/_/g, " ");
  const at = base.indexOf(" - ");
  if (at < 0) return undefined;
  const artist = base.slice(0, at).trim();
  const title = base.slice(at + 3).trim();
  return artist && title ? { artist, title } : undefined;
}
