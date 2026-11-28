// The demo tracks, so the creature can dance straight away. They're instrumentals made with the
// ACE-Step music model and shipped as files in public/demos/ (scripts/demos.md says how).

export interface Demo {
  name: string;
  /** Beats a minute, as measured in the track. */
  bpm: number;
  about: string;
}

export const DEMOS: readonly Demo[] = [
  { name: "Afterglow", bpm: 122, about: "Steady dance beat" },
  { name: "Disco Glow", bpm: 118, about: "Funky dance groove" },
  { name: "Log Drum", bpm: 112, about: "Bouncy and jazzy" },
];

/** The demo's file name, as in `Disco_Glow.m4a`. */
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
