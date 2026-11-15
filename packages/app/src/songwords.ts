// Finds the timed words of the song that's playing, so creatures can follow the singing
// (music.words and music.chorus). The song's artist and title come from the file's tags, or from
// its name ("Artist - Title.mp3"); they and the song's length are looked up on lrclib.net. What's
// found is remembered in this browser, so the same song isn't looked up again.

import {
  findWords,
  songFromFileName,
  SongWords,
  type MusicPlayer,
  type TimedLine,
} from "@genocode/music";

/**
 * Where finding the words has got to: switched off, looking, found, not there for this song, the
 * lookup failed, or the song's artist and title aren't known.
 */
export type WordsState = "off" | "looking" | "found" | "none" | "failed" | "unnamed";

const SWITCH = "genocode.words";
const REMEMBERED = "genocode.words.";

export class SongWordsFinder {
  /** Where finding the current song's words has got to; undefined with no song (or live sound). */
  state: WordsState | undefined;
  /** Counts lookups, so one for a song that has since stopped is dropped. */
  private asked = 0;
  /** The song playing, to look it up when the switch is turned on. */
  private song: File | string | undefined;

  constructor(
    private readonly player: MusicPlayer,
    private readonly changed: () => void,
  ) {}

  /** Whether songs' words are looked up online. On unless the user switched it off. */
  get on(): boolean {
    try {
      return localStorage.getItem(SWITCH) !== "off";
    } catch {
      return true;
    }
  }

  /** Switches looking up on or off, for the song playing now as well. */
  set on(on: boolean) {
    try {
      localStorage.setItem(SWITCH, on ? "on" : "off");
    } catch {
      // Not remembered, then.
    }
    if (this.song !== undefined) void this.lookUp(this.song);
  }

  /** Finds the words of the song the player has just started: a file, or a web address. */
  async lookUp(song: File | string): Promise<void> {
    const ask = ++this.asked;
    this.song = song;
    const set = (state: WordsState | undefined, words?: SongWords): void => {
      if (ask !== this.asked) return;
      this.state = state;
      this.player.words = words;
      this.changed();
    };
    if (!this.on) return set("off");
    set("looking");
    const name = typeof song === "string" ? nameFromAddress(song) : song.name;
    const [named, length] = await Promise.all([
      typeof song === "string" ? undefined : tagged(song),
      songLength(this.player.audio),
    ]);
    const which = named ?? songFromFileName(name);
    if (which === undefined || length === undefined) return set("unnamed");
    const key = `${REMEMBERED}${which.artist}|${which.title}|${Math.round(length)}`;
    let lines = remembered(key);
    if (lines === undefined) {
      const found = await findWords({ ...which, length });
      if (found === "failed") return set("failed");
      lines = found === "none" ? null : found;
      remember(key, lines);
    }
    if (lines === null) return set("none");
    set("found", new SongWords(lines, length));
  }

  /** Forgets the current song's words, as when live sound plays instead. */
  clear(): void {
    this.asked++;
    this.song = undefined;
    this.state = undefined;
    this.player.words = undefined;
  }
}

/** The artist and title in a music file's own tags, if it has both. */
async function tagged(file: File): Promise<{ artist: string; title: string } | undefined> {
  try {
    const mb = await import("mediabunny");
    const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
    try {
      const tags = await input.getMetadataTags();
      const artist = tags.artist?.trim();
      const title = tags.title?.trim();
      return artist && title ? { artist, title } : undefined;
    } finally {
      input.dispose();
    }
  } catch {
    return undefined;
  }
}

/** The file name at the end of a web address. */
function nameFromAddress(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
  } catch {
    return "";
  }
}

/** The song's length in seconds, once the audio knows it. */
function songLength(audio: HTMLAudioElement): Promise<number | undefined> {
  const now = (): number | undefined =>
    Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : undefined;
  if (now() !== undefined) return Promise.resolve(now());
  return new Promise((resolve) => {
    const done = (): void => {
      audio.removeEventListener("durationchange", check);
      clearTimeout(timer);
      resolve(now());
    };
    const check = (): void => {
      if (now() !== undefined) done();
    };
    const timer = setTimeout(done, 15_000);
    audio.addEventListener("durationchange", check);
  });
}

/** A song's lines found before, null if it had none, or undefined if it hasn't been looked up. */
function remembered(key: string): TimedLine[] | null | undefined {
  try {
    const saved = localStorage.getItem(key);
    return saved === null ? undefined : (JSON.parse(saved) as TimedLine[] | null);
  } catch {
    return undefined;
  }
}

function remember(key: string, lines: TimedLine[] | null): void {
  try {
    localStorage.setItem(key, JSON.stringify(lines));
  } catch {
    // Looked up again next time, then.
  }
}
