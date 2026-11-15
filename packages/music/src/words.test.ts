import { describe, expect, it } from "vitest";
import { parseLrc, SongWords, songFromFileName } from "./words.js";

describe("parseLrc", () => {
  it("reads timed lines in order, with several times on a line and an offset", () => {
    const lines = parseLrc(
      [
        "[ar:Someone]",
        "[offset:+500]",
        "[00:12.50]First line",
        "[00:05.00][01:00.00]Hook",
        "[00:20.00]",
      ].join("\n"),
    );
    expect(lines).toEqual([
      { time: 4.5, text: "Hook" },
      { time: 12, text: "First line" },
      { time: 19.5, text: "" },
      { time: 59.5, text: "Hook" },
    ]);
  });
});

/** A made-up song: a verse, a chorus sung three times, an instrumental break, a verse. */
function song(): SongWords {
  const lrc = [
    "[00:10.00]Walking down the long road home",
    "[00:14.00]Nobody there to see",
    "[00:18.00]Hold me now",
    "[00:21.00]Never let me go",
    "[00:24.00]",
    "[00:30.00]Another day is gone",
    "[00:34.00]Hold me now (oh, baby)",
    "[00:37.00]Never let me go",
    // A long gap: an instrumental break, though no empty line marks it.
    "[01:30.00]Yeah, hold me now",
    "[01:33.00]Never let me go",
  ];
  return new SongWords(parseLrc(lrc.join("\n")), 100);
}

describe("SongWords", () => {
  it("is 0 before the singing starts, and 1 while a line is sung", () => {
    const w = song();
    expect(w.at(5).words).toBe(0);
    expect(w.at(11).words).toBe(1);
    expect(w.at(16).words).toBe(1);
  });

  it("stays up between lines sung one after another", () => {
    const w = song();
    for (let t = 10.5; t < 23; t += 0.05) expect(w.at(t).words).toBe(1);
  });

  it("falls in an empty line and in a long gap without one", () => {
    const w = song();
    expect(w.at(27).words).toBe(0);
    // Two lines of 4 words sung from 37 s: done well before the next line at 90 s.
    expect(w.at(60).words).toBe(0);
    expect(w.at(91).words).toBe(1);
  });

  it("finds the chorus: the lines sung again and again, ad-libs and all", () => {
    const w = song();
    expect(w.at(11).chorus).toBe(0);
    expect(w.at(19).chorus).toBe(1);
    expect(w.at(22).chorus).toBe(1);
    expect(w.at(31).chorus).toBe(0);
    expect(w.at(35).chorus).toBe(1);
    expect(w.at(91).chorus).toBe(1);
  });

  it("finds a run of lines sung again as a run, even only twice", () => {
    const lrc = [
      "[00:00.00]One thing",
      "[00:03.00]Sharing the sky above",
      "[00:06.00]Watching the signs along the way",
      "[00:09.00]Talking it over, the two of us",
      "[00:12.00]Something else",
      "[00:15.00]Sharing the sky above",
      "[00:18.00]Watching the signs along the way",
      "[00:21.00]Talking it over, just the two of us",
      "[00:24.00]The end of it",
    ];
    const w = new SongWords(parseLrc(lrc.join("\n")), 27);
    expect(w.at(1).chorus).toBe(0);
    expect(w.at(7).chorus).toBe(1);
    expect(w.at(13).chorus).toBe(0);
    expect(w.at(19).chorus).toBe(1);
    expect(w.at(25).chorus).toBe(0);
  });

  it("rises and falls smoothly, with no jumps", () => {
    const w = song();
    let last = w.at(0);
    for (let t = 0.05; t < 100; t += 0.05) {
      const now = w.at(t);
      expect(Math.abs(now.words - last.words)).toBeLessThanOrEqual(0.3);
      expect(Math.abs(now.chorus - last.chorus)).toBeLessThanOrEqual(0.3);
      last = now;
    }
  });
});

describe("songFromFileName", () => {
  it("reads the artist and title from a file name", () => {
    expect(songFromFileName("Bryan Ferry - Slave To Love.mp3")).toEqual({
      artist: "Bryan Ferry",
      title: "Slave To Love",
    });
    expect(songFromFileName("track01.mp3")).toBeUndefined();
  });
});
