// Records the creature as a video, with the music it dances to. While recording, the creature's
// picture takes the video's shape on the stage, so what's seen is what's filmed. Each frame is
// copied into a canvas of the video's size with the site's address in a corner, and the browser's
// MediaRecorder films that canvas and the sound together.

import type { MusicPlayer } from "@genocode/music";
import type { CreatureView } from "@genocode/render";
import { evenSound } from "./mp4sound.js";

export type VideoShape = "tall" | "square" | "wide";

/** Each shape's size in pixels. */
const SIZES: Record<VideoShape, readonly [number, number]> = {
  tall: [1080, 1920],
  square: [1080, 1080],
  wide: [1920, 1080],
};

/** The longest video, in seconds: about 300 MB at the bit rate below. */
export const LONGEST = 5 * 60;
const BITS_PER_SECOND = 8_000_000;
const FRAMES_PER_SECOND = 30;

/** The mark in the corner, so a shared video leads back to GenoCode. */
const MARK = "genocode.piorek.co.za";

/** The space round the picture on the stage while recording, in pixels. */
const GAP = 16;

/** The formats to try, best first: MP4 plays everywhere; Firefox only makes WebM. */
const FORMATS = [
  "video/mp4;codecs=avc1.640028,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export interface Video {
  blob: Blob;
  /** The file name's ending: `.mp4` or `.webm`. */
  ext: string;
  seconds: number;
}

export interface RecordOptions {
  shape: VideoShape;
  /** Records the music as well. */
  sound: boolean;
  /** Plays the music file from the start, and stops when it ends. */
  wholeSong: boolean;
}

/** The format this browser records in, or undefined when it can't record the canvas. */
function format(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  if (typeof HTMLCanvasElement.prototype.captureStream !== "function") return undefined;
  return FORMATS.find((f) => MediaRecorder.isTypeSupported(f));
}

export function canRecord(): boolean {
  return format() !== undefined;
}

/** The mark's size and distance from the corner, in the video's pixels. */
function markSize(w: number, h: number): { size: number; margin: number } {
  const short = Math.min(w, h);
  return { size: Math.round(short * 0.025), margin: Math.round(short * 0.045) };
}

export class VideoRecorder {
  private recorder: MediaRecorder | undefined;
  private chunks: Blob[] = [];
  private shape: VideoShape = "tall";
  private started = 0;
  private frame = 0;
  private songEnded: (() => void) | undefined;
  private readonly film = document.createElement("canvas");
  private readonly observer = new ResizeObserver(() => this.layout());
  /** Called on each frame while recording, with the seconds recorded. */
  onTick: ((seconds: number) => void) | undefined;
  /** Called when the picture changes shape, so the camera can frame the creature again. */
  onReframe: (() => void) | undefined;

  /**
   * `reserve` gives the space at the bottom of the stage that the tools cover, which the picture
   * keeps clear of.
   */
  constructor(
    private readonly view: CreatureView,
    private readonly canvas: HTMLCanvasElement,
    private readonly stage: HTMLElement,
    private readonly mark: HTMLElement,
    private readonly player: MusicPlayer,
    private readonly reserve: () => number,
  ) {
    mark.textContent = MARK;
  }

  get recording(): boolean {
    return this.recorder !== undefined;
  }

  /** Starts recording. Gives the video once `stop` is called, or undefined if nothing was filmed. */
  async start(options: RecordOptions): Promise<Video | undefined> {
    const type = format();
    if (type === undefined || this.recorder) return undefined;
    const audio = this.player.audio;
    if (options.wholeSong) {
      // Started first, while it's still part of the tap: phones refuse play() after an await.
      audio.loop = false;
      audio.currentTime = 0;
      if (audio.paused) void audio.play().catch(() => undefined);
      this.songEnded = () => this.stop();
      audio.addEventListener("ended", this.songEnded);
    }
    const tracks: MediaStreamTrack[] = this.film.captureStream(FRAMES_PER_SECOND).getVideoTracks();
    if (options.sound) tracks.push(...(await this.player.recordSound()).getAudioTracks());

    this.shape = options.shape;
    const [w, h] = SIZES[this.shape];
    this.film.width = w;
    this.film.height = h;
    const recorder = new MediaRecorder(new MediaStream(tracks), {
      mimeType: type,
      videoBitsPerSecond: BITS_PER_SECOND,
      audioBitsPerSecond: 192_000,
    });
    this.recorder = recorder;
    this.chunks = [];
    recorder.addEventListener("dataavailable", (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    });
    const done = new Promise<Video | undefined>((resolve) =>
      recorder.addEventListener("stop", () => resolve(this.finish(type))),
    );

    this.stage.classList.add("recording");
    this.mark.hidden = false;
    this.layout();
    this.observer.observe(this.stage);
    this.started = performance.now();
    this.paint();
    recorder.start(1000);
    return done;
  }

  /** Stops recording; `start` then gives the video. */
  stop(): void {
    if (this.recorder?.state !== "recording") return;
    cancelAnimationFrame(this.frame);
    this.recorder.stop();
  }

  /** Copies the creature's picture into the video, with the mark. */
  private paint = (): void => {
    const [w, h] = SIZES[this.shape];
    const ctx = this.film.getContext("2d")!;
    ctx.drawImage(this.canvas, 0, 0, w, h);
    const { size, margin } = markSize(w, h);
    ctx.font = `600 ${size}px system-ui, sans-serif`;
    ctx.textBaseline = "top";
    ctx.shadowColor = "rgb(0 0 0 / 0.5)";
    ctx.shadowBlur = size / 3;
    ctx.fillStyle = "rgb(255 255 255 / 0.62)";
    ctx.fillText(MARK, margin, margin);
    ctx.shadowColor = "transparent";

    const seconds = (performance.now() - this.started) / 1000;
    this.onTick?.(seconds);
    if (seconds >= LONGEST) this.stop();
    else this.frame = requestAnimationFrame(this.paint);
  };

  /** Gives the picture the video's shape, as big as the stage allows, and draws it at full size. */
  private layout(): void {
    if (!this.recorder) return;
    const [w, h] = SIZES[this.shape];
    const style = getComputedStyle(this.stage);
    const roomW = this.stage.clientWidth - 2 * GAP;
    const roomH =
      this.stage.clientHeight -
      parseFloat(style.paddingTop) -
      parseFloat(style.paddingBottom) -
      this.reserve() -
      2 * GAP;
    const scale = Math.max(0.01, Math.min(roomW / w, roomH / h));
    const shownW = Math.floor(w * scale);
    const shownH = Math.floor(h * scale);
    this.canvas.style.width = `${shownW}px`;
    this.canvas.style.height = `${shownH}px`;
    this.canvas.style.marginTop = `${GAP + Math.max(0, (roomH - shownH) / 2)}px`;
    this.view.setPixelRatio(w / shownW);

    // The mark on the stage, where it will be in the video.
    const { size, margin } = markSize(w, h);
    this.mark.style.left = `${this.canvas.offsetLeft + margin * scale}px`;
    this.mark.style.top = `${this.canvas.offsetTop + margin * scale}px`;
    this.mark.style.fontSize = `${size * scale}px`;
    this.onReframe?.();
  }

  /** Puts the stage back as it was, and gathers the video. */
  private async finish(type: string): Promise<Video | undefined> {
    const seconds = (performance.now() - this.started) / 1000;
    this.recorder?.stream.getVideoTracks().forEach((t) => t.stop());
    this.recorder = undefined;
    this.player.stopRecordingSound();
    if (this.songEnded) {
      this.player.audio.removeEventListener("ended", this.songEnded);
      this.player.audio.loop = true;
      this.songEnded = undefined;
    }
    this.observer.disconnect();
    this.stage.classList.remove("recording");
    this.mark.hidden = true;
    this.canvas.style.removeProperty("width");
    this.canvas.style.removeProperty("height");
    this.canvas.style.removeProperty("margin-top");
    this.view.setPixelRatio();
    this.onReframe?.();
    if (this.chunks.length === 0) return undefined;
    const base = type.split(";")[0]!;
    let blob = new Blob(this.chunks, { type: base });
    // The browser stamps the sound by the clock, which clicks in players such as VLC.
    if (base === "video/mp4") {
      try {
        const even = evenSound(new Uint8Array(await blob.arrayBuffer()));
        blob = new Blob([even as Uint8Array<ArrayBuffer>], { type: base });
      } catch {
        // A file it can't read is kept as the browser made it.
      }
    }
    return {
      blob,
      ext: base === "video/mp4" ? ".mp4" : ".webm",
      seconds,
    };
  }
}
