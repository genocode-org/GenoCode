// Sliders standing in for `time`, `beat` and the `music` values (docs/LANGUAGE.md section 16), so a
// creature's reactions can be tried before there's music to play.

import { MUSIC_FIELDS, silence, type BuildOptions, type MusicInputs } from "@genocode/core";

const MAX_TIME = 60;

export class InputControls {
  private readonly music: MusicInputs = silence();
  private beat = 0;
  /** While time runs: when it was 0. While it's held: the time it's held at. */
  private started = performance.now();
  private held: number | undefined;
  private readonly timeSlider: HTMLInputElement;
  private readonly timeText: HTMLElement;
  private readonly run: HTMLInputElement;

  /**
   * `onChange` is called when a slider moves, so the view can be redrawn. `resumed` says time was
   * just let run again, so drawing every frame has to start again too.
   */
  constructor(
    private readonly section: HTMLElement,
    private readonly onChange: (resumed: boolean) => void,
  ) {
    const list = document.createElement("div");
    list.className = "inputs";

    this.run = document.createElement("input");
    this.run.type = "checkbox";
    this.run.checked = true;
    this.run.title = "Let time run";
    this.run.addEventListener("change", () => {
      if (this.run.checked) {
        this.started = performance.now() - (this.held ?? 0) * 1000;
        this.held = undefined;
      } else {
        this.held = this.time;
      }
      this.onChange(this.run.checked);
    });
    this.timeSlider = this.range(0, MAX_TIME, 0.01, 0);
    this.timeSlider.addEventListener("input", () => {
      this.run.checked = false;
      this.held = Number(this.timeSlider.value);
      this.showTime();
      this.onChange(false);
    });
    this.timeText = document.createElement("span");
    this.timeText.className = "input-value";
    list.append(this.row("time", this.timeSlider, this.timeText, this.run));

    const beat = this.range(0, 1, 0.01, 0);
    beat.addEventListener("input", () => {
      this.beat = Number(beat.value);
      this.onChange(false);
    });
    list.append(this.row("beat", beat));
    for (const name of MUSIC_FIELDS) {
      const s = this.range(0, 1, 0.01, 0);
      s.addEventListener("input", () => {
        this.music[name] = Number(s.value);
        this.onChange(false);
      });
      list.append(this.row(`music.${name}`, s));
    }
    section.append(list);
  }

  /** Seconds since the creature was shown, or where the slider holds it. */
  get time(): number {
    return this.held ?? (performance.now() - this.started) / 1000;
  }

  /** Whether the view needs redrawing every frame. */
  get running(): boolean {
    return this.held === undefined;
  }

  /** Starts time again from 0, as when a new creature is shown. */
  restart(): void {
    this.started = performance.now();
    if (this.held !== undefined) this.held = 0;
    this.showTime();
  }

  /** The inputs for building a frame now. */
  now(): BuildOptions["inputs"] {
    if (this.running) this.showTime();
    return { time: this.time, beat: this.beat, music: { ...this.music } };
  }

  show(visible: boolean): void {
    this.section.hidden = !visible;
  }

  private showTime(): void {
    const t = this.time;
    this.timeSlider.value = String(t % MAX_TIME);
    this.timeText.textContent = `${t.toFixed(1)} s`;
  }

  private range(min: number, max: number, step: number, value: number): HTMLInputElement {
    const s = document.createElement("input");
    s.type = "range";
    s.min = String(min);
    s.max = String(max);
    s.step = String(step);
    s.value = String(value);
    return s;
  }

  private row(label: string, ...controls: HTMLElement[]): HTMLElement {
    const row = document.createElement("div");
    row.className = "input-row";
    const name = document.createElement("code");
    name.textContent = label;
    row.append(name, ...controls);
    return row;
  }
}
