// The demo tracks, so the creature can dance straight away. They're grooves GenoCode made itself
// (scripts/synth.ts), shipped as files in public/demos/, and stand-ins until the player ships
// tracks of its own.

export interface Demo {
  name: string;
  /** Beats a minute. */
  bpm: number;
  /** The lowest bass note, as a MIDI note number, for making it. */
  root: number;
  feel: "four" | "half" | "drive";
  about: string;
}

export const DEMOS: readonly Demo[] = [
  { name: "Afterglow", bpm: 122, root: 45, feel: "four", about: "Steady dance beat" },
  { name: "Tidepool", bpm: 96, root: 50, feel: "half", about: "Slow and deep" },
  { name: "Neon Run", bpm: 132, root: 40, feel: "drive", about: "Fast, rolling bass" },
];

/** The demo's file name, as in `Neon_Run.m4a`. */
export const demoName = (d: Demo) => `${d.name.replace(/ /g, "_")}.m4a`;

const loaded = new Map<string, Promise<File>>();

/** The demo as a file, loaded from the app the first time it's asked for. */
export function demoFile(d: Demo): Promise<File> {
  let file = loaded.get(d.name);
  if (file === undefined) {
    file = fetch(`./demos/${demoName(d)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`no demo ${d.name}`);
        return r.blob();
      })
      .then((b) => new File([b], demoName(d), { type: "audio/mp4" }));
    file.catch(() => loaded.delete(d.name));
    loaded.set(d.name, file);
  }
  return file;
}
