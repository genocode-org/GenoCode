// Plays music in the browser and listens to it: from a file, a web address, the microphone or
// another browser tab. The sound passes through a small audio worklet that hands every sample to a
// MusicAnalyser.

import { silence, type MusicInputs } from "@genocode/core";
import { MusicAnalyser } from "./analyser.js";
import type { SongWords } from "./words.js";

/** The rate DancerDNA analysed at, so the octaves land where they did. */
const RATE = 44100;

// The worklet passes the sound through unchanged and posts each block of samples to the page.
const WORKLET = `
class Listen extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const l = inputs[0][0];
    const r = inputs[0][1] ?? l;
    if (l) {
      outputs[0].forEach((ch, i) => ch.set(i === 0 ? l : r));
      this.port.postMessage([l.slice(), r.slice()]);
    }
    return true;
  }
}
registerProcessor("genocode-listen", Listen);
`;

export type MusicSource = "file" | "url" | "microphone" | "tab";

export class MusicPlayer {
  /** The music being listened to, or undefined when there's none. */
  private analyser: MusicAnalyser | undefined;
  private context: AudioContext | undefined;
  private node: AudioWorkletNode | undefined;
  /** The audio element's way into the graph: a browser allows only one, so it's kept. */
  private element: MediaElementAudioSourceNode | undefined;
  private microphone: MediaStreamAudioSourceNode | undefined;
  private stream: MediaStream | undefined;
  /** Where the sound also goes while a video is being recorded. */
  private recording: MediaStreamAudioDestinationNode | undefined;
  readonly audio = new Audio();
  /** What's playing: the file's name, the address, "Microphone" or "Another tab". */
  name = "";
  source: MusicSource | undefined;
  /**
   * The song's timed words, once they're found, for music.words and music.chorus. Set by whoever
   * looks them up; forgotten when the music stops or changes.
   */
  words: SongWords | undefined;
  /** Called when the music stops by itself, as when the user stops sharing a tab. */
  onEnd: (() => void) | undefined;

  constructor() {
    this.audio.crossOrigin = "anonymous";
    this.audio.loop = true;
  }

  /** Plays a music file. */
  async playFile(file: File): Promise<void> {
    await this.playAddress(URL.createObjectURL(file), file.name, "file");
  }

  /** Plays music from a web address. The site must allow it to be played from other sites. */
  async playUrl(url: string): Promise<void> {
    await this.playAddress(url, url, "url");
  }

  /** Listens to the microphone (the browser asks the user first). */
  async listen(): Promise<void> {
    this.stop();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: RAW_SOUND });
    await this.listenTo(stream, "Microphone", "microphone");
  }

  /**
   * Listens to another browser tab, such as a video site playing a song. The browser asks which
   * tab to share; its sound is only heard if the user leaves "share tab audio" ticked.
   */
  async listenToTab(): Promise<void> {
    this.stop();
    // Browsers only share a tab with its picture, so the picture is asked for and left unused.
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: RAW_SOUND,
      selfBrowserSurface: "exclude",
      preferCurrentTab: false,
    } as DisplayMediaStreamOptions);
    if (stream.getAudioTracks().length === 0) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error('the tab was shared without its sound; tick "Also share tab audio"');
    }
    await this.listenTo(stream, "Another tab", "tab");
  }

  /** Whether the music is live, from the microphone or a tab, so it can't be paused. */
  get live(): boolean {
    return this.source === "microphone" || this.source === "tab";
  }

  get paused(): boolean {
    return !this.live && this.audio.paused;
  }

  /** Pauses or carries on playing. Live music can't be paused, only stopped. */
  async togglePause(): Promise<void> {
    if (this.live || this.source === undefined) return;
    if (this.audio.paused) {
      // play() first, while it's still part of the tap: phones refuse it after anything is awaited.
      const playing = this.audio.play();
      await this.context?.resume();
      await playing;
    } else {
      this.audio.pause();
    }
  }

  /** Stops the music and forgets it. */
  stop(): void {
    this.audio.pause();
    if (this.audio.src.startsWith("blob:")) URL.revokeObjectURL(this.audio.src);
    this.audio.removeAttribute("src");
    this.audio.load();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
    this.microphone?.disconnect();
    this.microphone = undefined;
    this.element?.disconnect();
    this.analyser = undefined;
    this.source = undefined;
    this.name = "";
    this.words = undefined;
  }

  /** Whether there's music to listen to. */
  get active(): boolean {
    return this.analyser !== undefined;
  }

  /**
   * How far into the music it is, and how long the music is, in seconds; undefined for live
   * music, which has no length, or before the length is known.
   */
  get position(): { at: number; length: number } | undefined {
    if (!this.active || this.live) return undefined;
    const length = this.audio.duration;
    if (!Number.isFinite(length) || length <= 0) return undefined;
    return { at: this.audio.currentTime, length };
  }

  /** Beats a minute, once there's a beat to follow. */
  get tempo(): number | undefined {
    return this.analyser?.tempo;
  }

  /** The inputs for building a frame now: silence when there's no music or it's paused. */
  inputs(): { beat: number; music: MusicInputs } {
    if (this.analyser === undefined || this.paused) return { beat: 0, music: silence() };
    const music = this.analyser.music;
    // The singing comes from the song's timed words, at the place the song has reached.
    if (this.words === undefined || this.live) return { beat: this.analyser.beat(), music };
    return {
      beat: this.analyser.beat(),
      music: { ...music, ...this.words.at(this.audio.currentTime) },
    };
  }

  /**
   * Plays music from an address. If the browser won't start it without a tap (phones, after the
   * file picker), it's left ready and paused for the Play button.
   */
  private async playAddress(src: string, name: string, source: MusicSource): Promise<void> {
    this.stop();
    // play() first, while it's still part of what the user did: phones refuse it once the audio
    // graph has been awaited. The graph is joined up just after.
    this.audio.src = src;
    const playing = this.audio.play();
    const ctx = await this.connect();
    this.element ??= ctx.createMediaElementSource(this.audio);
    this.element.connect(this.node!);
    this.sendTo(ctx.destination);
    this.begin(name, source);
    try {
      await playing;
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "NotAllowedError")) throw e;
    }
  }

  private async listenTo(stream: MediaStream, name: string, source: MusicSource): Promise<void> {
    const ctx = await this.connect();
    this.stream = stream;
    this.microphone = ctx.createMediaStreamSource(stream);
    this.microphone.connect(this.node!);
    // Live sound isn't played back: the microphone would howl, and the tab plays its own. The
    // worklet still runs.
    this.sendTo(silentOutput(ctx));
    this.begin(name, source);
    // Stopping the sharing (from the browser's own bar) ends the tracks.
    for (const t of stream.getAudioTracks()) {
      t.addEventListener("ended", () => {
        if (this.stream !== stream) return;
        this.stop();
        this.onEnd?.();
      });
    }
  }

  /**
   * The sound as it's heard, for recording a video: whatever plays from now until
   * `stopRecordingSound`, even if the music changes.
   */
  async recordSound(): Promise<MediaStream> {
    const ctx = await this.connect();
    this.stopRecordingSound();
    this.recording = ctx.createMediaStreamDestination();
    this.node!.connect(this.recording);
    return this.recording.stream;
  }

  stopRecordingSound(): void {
    if (this.recording === undefined) return;
    this.node?.disconnect(this.recording);
    this.recording.stream.getTracks().forEach((t) => t.stop());
    this.recording = undefined;
  }

  /** Sends the sound out of the graph to `out`, and on to a recording if there is one. */
  private sendTo(out: AudioNode): void {
    this.node!.disconnect();
    this.node!.connect(out);
    if (this.recording) this.node!.connect(this.recording);
  }

  private begin(name: string, source: MusicSource): void {
    this.analyser = new MusicAnalyser(this.context!.sampleRate);
    this.name = name;
    this.source = source;
  }

  /** The audio graph, made on first use (browsers only allow it after the user does something). */
  private async connect(): Promise<AudioContext> {
    if (this.context === undefined) {
      const ctx = new AudioContext({ sampleRate: RATE });
      const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const node = new AudioWorkletNode(ctx, "genocode-listen", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      node.port.onmessage = (e: MessageEvent<[Float32Array, Float32Array]>) => {
        this.analyser?.push(e.data[0], e.data[1]);
      };
      this.context = ctx;
      this.node = node;
    }
    await this.context.resume();
    return this.context;
  }
}

/** The sound as it is: the browser's call clean-up would take the music for noise or echo. */
const RAW_SOUND = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };

/** A way out of the graph that makes no sound, so a node is still run. */
function silentOutput(ctx: AudioContext): AudioNode {
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(ctx.destination);
  return gain;
}
