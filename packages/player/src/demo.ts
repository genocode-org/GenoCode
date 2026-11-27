// The demo tracks: short dance grooves made on the phone itself (drums, bass and chords from Web
// Audio oscillators and noise), written into a WAV file and played like any song, so the creature
// can dance straight away without shipping anyone's music. They're stand-ins until the player
// ships tracks of its own.

export interface Demo {
  name: string;
  /** Beats a minute. */
  bpm: number;
  /** The lowest bass note, as a MIDI note number. */
  root: number;
  feel: "four" | "half" | "drive";
  about: string;
}

export const DEMOS: readonly Demo[] = [
  { name: "Afterglow", bpm: 122, root: 45, feel: "four", about: "Steady dance beat" },
  { name: "Tidepool", bpm: 96, root: 50, feel: "half", about: "Slow and deep" },
  { name: "Neon Run", bpm: 132, root: 40, feel: "drive", about: "Fast, rolling bass" },
];

const RATE = 44100;
/** Ten bars of the groove, then two broken down to drums and chords, twice over. */
const BARS = 24;
/** The chord under each bar, in semitones from the root. */
const PROGRESSION = [0, -4, 3, -2];

const made = new Map<string, Promise<File>>();

/** The demo as a WAV file, made the first time it's asked for. */
export function demoFile(d: Demo): Promise<File> {
  let file = made.get(d.name);
  if (file === undefined) {
    file = render(d);
    made.set(d.name, file);
  }
  return file;
}

async function render(d: Demo): Promise<File> {
  const sixteenth = 60 / d.bpm / 4;
  const length = BARS * 16 * sixteenth;
  const ctx = new OfflineAudioContext(2, Math.ceil(length * RATE), RATE);
  const out = ctx.createDynamicsCompressor();
  const master = ctx.createGain();
  master.gain.value = 0.7;
  master.connect(out);
  out.connect(ctx.destination);
  const noise = ctx.createBuffer(1, RATE, RATE);
  const n = noise.getChannelData(0);
  for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;

  const hz = (note: number) => 440 * 2 ** ((note - 69) / 12);
  const fade = (g: GainNode, t: number, from: number, len: number) => {
    g.gain.setValueAtTime(from, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
  };
  const kick = (t: number) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    fade(g, t, 1, 0.32);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.35);
  };
  const hiss = (t: number, type: BiquadFilterType, freq: number, gain: number, len: number) => {
    const s = ctx.createBufferSource();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    s.buffer = noise;
    f.type = type;
    f.frequency.value = freq;
    fade(g, t, gain, len);
    s.connect(f).connect(g).connect(master);
    s.start(t);
    s.stop(t + len + 0.02);
  };
  const snare = (t: number) => {
    hiss(t, "bandpass", 1900, 0.55, 0.2);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = 190;
    fade(g, t, 0.35, 0.1);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.12);
  };
  const bass = (t: number, note: number, len: number) => {
    const o = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.value = hz(note);
    f.type = "lowpass";
    f.Q.value = 6;
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(140, t + len);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(f).connect(g).connect(master);
    o.start(t);
    o.stop(t + len + 0.02);
  };
  const chord = (t: number, root: number, len: number) => {
    [0, 3, 7, 10].forEach((step, k) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = k ? "triangle" : "sine";
      o.frequency.value = hz(root + 24 + step);
      o.detune.value = (k - 1.5) * 6;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + len);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + len + 0.02);
    });
  };

  for (let i = 0; i < BARS * 16; i++) {
    const t = i * sixteenth;
    const s = i % 16;
    const bar = Math.floor(i / 16);
    const section = bar % 12;
    const broken = section >= 10;
    const root = d.root + PROGRESSION[bar % 4]!;
    const kickOn = d.feel === "half" ? s === 0 || s === 10 : s % 4 === 0;
    if (kickOn && !broken) kick(t);
    const snareOn = d.feel === "half" ? s === 8 : s === 4 || s === 12;
    if (snareOn && section !== 10) snare(t);
    if (s % 2 === 0 && !(bar % 4 === 3 && s >= 8)) {
      hiss(t, "highpass", 7500, s % 4 === 2 ? 0.2 : 0.09, 0.05);
    }
    const bassOn = d.feel === "drive" ? s % 4 >= 2 : [0, 3, 6, 10, 14].includes(s);
    if (bassOn && !broken) bass(t, root + (s === 14 ? 7 : 0), sixteenth * 1.8);
    if (s === 0 || s === 6 || (d.feel !== "half" && s === 11)) {
      chord(t, root, sixteenth * (broken ? 8 : 2.5));
    }
  }
  const sound = await ctx.startRendering();
  return new File([wav(sound)], `${d.name}.wav`, { type: "audio/wav" });
}

/** Sound as a 16-bit stereo WAV file. */
function wav(sound: AudioBuffer): ArrayBuffer {
  const channels = [sound.getChannelData(0), sound.getChannelData(1)];
  const frames = sound.length;
  const bytes = frames * 4;
  const buffer = new ArrayBuffer(44 + bytes);
  const v = new DataView(buffer);
  const text = (at: number, s: string) =>
    [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  v.setUint32(4, 36 + bytes, true);
  text(8, "WAVE");
  text(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, sound.sampleRate, true);
  v.setUint32(28, sound.sampleRate * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, bytes, true);
  let at = 44;
  for (let i = 0; i < frames; i++) {
    for (const c of channels) {
      const x = Math.max(-1, Math.min(1, c[i]!));
      v.setInt16(at, x < 0 ? x * 0x8000 : x * 0x7fff, true);
      at += 2;
    }
  }
  return buffer;
}
