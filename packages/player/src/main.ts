// The GenoCode player: one creature at a time, filling the screen, morphing and dancing to music.
// Swipe sideways for the next creature, up for all of them and down for the dance styles. The
// dance itself is the web app's (@genocode/stage), so a creature dances the same in both.

import "@fontsource/figtree/400.css";
import "@fontsource/figtree/600.css";
import "@fontsource/figtree/700.css";
import "@fontsource/unbounded/600.css";
import "@fontsource/unbounded/800.css";
import { silence, type CheckResult } from "@genocode/core";
import { MusicPlayer } from "@genocode/music";
import { CreatureView, Thumbnails } from "@genocode/render";
import {
  buildCreature,
  checkText,
  DanceFloor,
  drawFieldsInWorkers,
  familyOf,
  fromProgram,
  type Creature,
  type DanceFrame,
} from "@genocode/stage";
import { DEMOS, demoFile, demoName, type Demo } from "./demos.js";
import { entries, find, label, open, styles, type Entry } from "./library.js";
import { buzz, onBack, onHide, onLink, stayAwake } from "./native.js";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Small things kept on the phone between visits; nothing breaks when they can't be kept. */
const store = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(`genocode-player.${key}`);
      return v === null ? fallback : (JSON.parse(v) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(`genocode-player.${key}`, JSON.stringify(value));
    } catch {
      // Not kept, then.
    }
  },
};

const canvas = $<HTMLCanvasElement>("view");
const chrome = $("chrome");
drawFieldsInWorkers();
const view = new CreatureView(canvas);
// The camera stays put: drags on the screen are swipes, not turns.
view.lockCamera(true);
const player = new MusicPlayer();

// ---------- settings ----------

const settings = {
  buzz: $<HTMLInputElement>("buzz"),
  autohide: $<HTMLInputElement>("autohide"),
  awake: $<HTMLInputElement>("awake"),
  saver: $<HTMLInputElement>("saver"),
};
for (const [key, input] of Object.entries(settings)) {
  input.checked = store.get(key, input.checked);
  input.addEventListener("change", () => {
    store.set(key, input.checked);
    if (key === "saver") sharpness();
    if (key === "awake") keepAwake();
    poke();
  });
}
function sharpness(): void {
  view.setPixelRatio(settings.saver.checked ? 1 : Math.min(2, window.devicePixelRatio));
}
sharpness();

// ---------- the creature on show ----------

let list = entries();
let entry: Entry = list[0]!;
let members: Creature[] = [];
/** The names shown for each member of the loop. */
let names: string[] = [];

/** A variant's name as people read it: `LionsMane` and `Lions_Mane` are "Lions Mane". */
const spaced = (name: string) => {
  const words = label(name).replace(/([a-z])([A-Z])/g, "$1 $2");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

function familyFor(e: Entry): Creature[] {
  return familyOf(fromProgram(checkText(e.text)));
}

/** A bright colour from the creature's own shapes, for the controls. */
function accentOf(c: Creature): string {
  const { built } = buildCreature(c, { time: 0, beat: 0, music: silence() });
  let x = 0;
  let y = 0;
  for (const s of built.shapes) {
    const w = s.colour.s * s.colour.v;
    if (s.colour.s < 0.25 || s.colour.v < 0.3) continue;
    x += w * Math.cos((s.colour.h * Math.PI) / 180);
    y += w * Math.sin((s.colour.h * Math.PI) / 180);
  }
  if (Math.hypot(x, y) < 1e-6) return "#e9e6ff";
  const hue = Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
  return `hsl(${hue} 85% 68%)`;
}

function show(e: Entry): void {
  entry = e;
  members = familyFor(e);
  names = members.map((m) => spaced(m.variant ?? e.name));
  document.documentElement.style.setProperty("--accent", accentOf(members[0]!));
  $("who-name").textContent = label(e.name);
  $("who-line").hidden = members.length < 2;
  const loop = $("loop");
  loop.replaceChildren(...members.map(() => document.createElement("span")));
  loop.hidden = members.length < 2;
  store.set("creature", { shelf: e.shelf, name: e.name });
  fillWheel();
  floor.start(members, chosenStyle(), songName(), new Set());
  markCurrentCard();
}

let switching = false;
/** Shrinks the creature away and grows the next one (or the one given) in its place. */
function change(to: Entry | number): void {
  if (switching) return;
  list = entries();
  const at = list.findIndex((e) => e.shelf === entry.shelf && e.name === entry.name);
  const next =
    typeof to === "number" ? list[(((at + to) % list.length) + list.length) % list.length]! : to;
  if (next === entry) return;
  switching = true;
  canvas.classList.remove("arriving");
  canvas.classList.add("leaving");
  setTimeout(() => {
    show(next);
    canvas.classList.add("arriving");
    canvas.classList.remove("leaving");
    setTimeout(() => {
      canvas.classList.remove("arriving");
      switching = false;
    }, 600);
  }, 350);
}

// ---------- dance styles ----------

interface StyleOption {
  name: string;
  about: string;
  /** The creature's own dance when undefined. */
  program: CheckResult | undefined;
}

const OWN = "Its own";
let chosen = store.get("style", OWN);

function styleOptions(): StyleOption[] {
  const own = members[0]?.program.dance !== undefined;
  const library = styles.map((s) => ({ name: s.name, about: s.about, program: s.program }));
  return own
    ? [
        { name: OWN, about: "The dance written into this creature itself.", program: undefined },
        ...library,
      ]
    : library;
}

function chosenOption(): StyleOption {
  const options = styleOptions();
  return (
    options.find((o) => o.name === chosen) ??
    options.find((o) => o.name === OWN) ??
    options.find((o) => o.name === "Groove") ??
    options[0]!
  );
}

function chosenStyle(): CheckResult | undefined {
  return chosenOption().program ?? members[0]?.program;
}

// ---------- the dance, each frame ----------

let lastBass = 0;
let lastMeta = 0;
let lastRing = 0;

const floor = new DanceFloor(view, player, (f: DanceFrame) => {
  const n = members.length;
  const towards = names[(f.index + 1) % n] ?? "";
  const variant = $("who-variant");
  if (variant.textContent !== towards) variant.textContent = towards;
  const dots = $("loop").children;
  for (let k = 0; k < dots.length; k++) {
    const dot = dots[k] as HTMLElement;
    dot.classList.toggle("on", k === f.index);
    if (k === f.index) dot.style.setProperty("--fill", `${(f.t * 100).toFixed(1)}%`);
  }

  const live = player.active && !player.paused;
  const m = f.music;
  const pulse = Math.max(m.bass_hit, m.mid_hit * 0.8);
  $("glow").style.opacity = (0.15 + 0.55 * pulse).toFixed(3);
  const onBeat = player.tempo !== undefined ? (1 - f.beat) ** 4 : 0;
  $("play").style.setProperty("--beat", live ? Math.max(pulse, onBeat).toFixed(3) : "0");
  if (live && m.bass_hit > 0.75 && lastBass <= 0.75) strongBeat();
  lastBass = m.bass_hit;
  const levels = [m.bass, m.bass_hit, m.mid, m.mid_hit, m.high_hit];
  $("meter")
    .querySelectorAll("i")
    .forEach((bar, k) => {
      bar.style.height = `${Math.round(15 + 85 * Math.min(1, live ? levels[k]! : 0))}%`;
    });

  const now = performance.now();
  if (now - lastMeta > 250) {
    lastMeta = now;
    showPlaying();
  }
});

function strongBeat(): void {
  const now = performance.now();
  if (now - lastRing < 220) return;
  lastRing = now;
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const ring = document.createElement("div");
    ring.className = "ring";
    $("rings").append(ring);
    setTimeout(() => ring.remove(), 1150);
  }
  if (settings.buzz.checked) buzz();
}

// ---------- music ----------

/** The demo track playing, or last played. */
let demo: Demo | undefined;

/** The song playing, to give the creature its look for it; live music has no song to name. */
function songName(): string | undefined {
  return player.source === "file" ? player.name : undefined;
}

const minutes = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** The name of what's playing, how far in it is, and the play button. */
function showPlaying(): void {
  const live = player.active && !player.paused;
  let name = "Choose music";
  let meta = "Tap play for a demo track";
  if (player.live) {
    name = "Microphone";
    meta = player.tempo ? `Listening · ${Math.round(player.tempo)} beats a minute` : "Listening";
  } else if (player.active) {
    const isDemo = demo !== undefined && player.name === demoName(demo);
    name = isDemo ? demo!.name : player.name.replace(/\.[^.]+$/, "");
    const at = player.position;
    meta = `${isDemo ? "Demo track" : "Your song"} · ${player.paused ? "paused" : at ? minutes(at.at) : ""}`;
  }
  if ($("song-name").textContent !== name) $("song-name").textContent = name;
  if ($("song-meta").textContent !== meta) $("song-meta").textContent = meta;
  const play = $("play");
  const state = player.live ? "stop" : live ? "pause" : "play";
  if (play.dataset.state !== state) {
    play.dataset.state = state;
    play.setAttribute(
      "aria-label",
      state === "stop" ? "Stop listening" : state === "pause" ? "Pause" : "Play",
    );
    $("play-icon").innerHTML =
      state === "play"
        ? '<path d="M7 4.5v15l13-7.5z"/>'
        : state === "pause"
          ? '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>'
          : '<rect x="6" y="6" width="12" height="12" rx="2"/>';
    keepAwake();
    poke();
  }
}

let busy = false;
/** Runs a music change, showing the play button busy meanwhile and any problem in words. */
async function music(change: () => Promise<void>, problem: string): Promise<void> {
  if (busy) return;
  busy = true;
  $("play").classList.add("busy");
  try {
    await change();
  } catch {
    toast(problem);
  } finally {
    busy = false;
    $("play").classList.remove("busy");
    floor.setSong(songName());
    showPlaying();
  }
}

function playDemo(d: Demo): Promise<void> {
  return music(async () => {
    demo = d;
    store.set("demo", d.name);
    await player.playFile(await demoFile(d));
  }, "The demo track didn't play. Try again.");
}

function playSong(file: File): Promise<void> {
  return music(() => player.playFile(file), "That song didn't play. Try an MP3 or M4A file.");
}

function listen(): Promise<void> {
  return music(
    () => player.listen(),
    "The microphone isn't allowed. Turn it on for GenoCode Player in the phone's settings.",
  );
}

async function playOrPause(): Promise<void> {
  if (player.live) {
    player.stop();
    floor.setSong(undefined);
    showPlaying();
  } else if (player.active) {
    await player.togglePause();
    showPlaying();
  } else {
    const last = DEMOS.find((d) => d.name === store.get("demo", "")) ?? DEMOS[0]!;
    await playDemo(demo ?? last);
  }
}
player.onEnd = showPlaying;

/** Keeps the screen on while music plays, if that's wanted. */
function keepAwake(): void {
  stayAwake(settings.awake.checked && player.active && !player.paused);
}
// The music stops when the player goes out of sight (the back or home button, or another app),
// since nobody is watching the creature dance; Play carries on from there.
function stopInBackground(): void {
  if (player.live) {
    player.stop();
    floor.setSong(undefined);
  } else if (player.active && !player.paused) {
    void player.togglePause();
  }
  showPlaying();
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") keepAwake();
  else stopInBackground();
});
onHide(stopInBackground);

function fillDemos(): void {
  $("demo-list").replaceChildren(
    ...DEMOS.map((d) => {
      const on = demo === d && player.active && !player.paused && player.name === demoName(d);
      const b = document.createElement("button");
      b.type = "button";
      b.className = `source${on ? " on" : ""}`;
      b.innerHTML = `<span class="ico"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${
        on ? '<path d="M4 10h3v4H4zM10.5 6h3v12h-3zM17 8h3v8h-3z"/>' : '<path d="M8 5v14l11-7z"/>'
      }</svg></span><div><b></b><span></span></div><em>${d.bpm} beats a minute</em>`;
      b.querySelector("b")!.textContent = d.name;
      b.querySelector("div span")!.textContent = d.about;
      b.addEventListener("click", () => {
        closeSheet();
        void playDemo(d);
      });
      return b;
    }),
  );
}

$("song-button").addEventListener("click", () => {
  fillDemos();
  showSheet($("music"));
});
$<HTMLInputElement>("song-file").addEventListener("change", (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  closeSheet();
  void playSong(file);
});
$("mic").addEventListener("click", () => {
  closeSheet();
  void listen();
});
$("play").addEventListener("click", () => void playOrPause());

// ---------- controls showing and hiding ----------

let idle: ReturnType<typeof setTimeout> | undefined;
/** Brings the controls back, and hides them again after a while if the music plays. */
function poke(): void {
  // The wheel keeps the controls out of its way.
  if (wheelOpen) return;
  chrome.classList.remove("away");
  clearTimeout(idle);
  if (settings.autohide.checked && player.active && !player.paused) {
    idle = setTimeout(() => {
      if (!sheet && !wheelOpen) chrome.classList.add("away");
    }, 4500);
  }
}

// ---------- gestures on the creature ----------

const stage = $("stage");
const pointers = new Map<number, { x: number; y: number }>();
let gesture:
  | { kind: "swipe"; x: number; y: number; t: number }
  | { kind: "pinch"; d: number; zoom: number }
  | undefined;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const spread = () => {
  const [a, b] = [...pointers.values()];
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 1;
};
function zoomTo(z: number): void {
  view.camera.zoom = clamp(z, 0.6, 2);
  view.camera.updateProjectionMatrix();
}

stage.addEventListener("pointerdown", (e) => {
  stage.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1)
    gesture = { kind: "swipe", x: e.clientX, y: e.clientY, t: performance.now() };
  if (pointers.size === 2) gesture = { kind: "pinch", d: spread(), zoom: view.camera.zoom };
});
stage.addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (gesture?.kind === "pinch" && pointers.size === 2)
    zoomTo((gesture.zoom * spread()) / gesture.d);
});
function pointerUp(e: PointerEvent): void {
  if (!pointers.delete(e.pointerId)) return;
  const g = gesture;
  if (g?.kind !== "swipe") {
    if (pointers.size === 0) gesture = undefined;
    return;
  }
  gesture = undefined;
  const dx = e.clientX - g.x;
  const dy = e.clientY - g.y;
  if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && performance.now() - g.t < 350) {
    // A tap hides or shows the controls.
    if (chrome.classList.contains("away")) poke();
    else {
      chrome.classList.add("away");
      clearTimeout(idle);
    }
    return;
  }
  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 45) change(dx < 0 ? 1 : -1);
  else if (dy < -45) openDrawer();
  else if (dy > 45) openWheel();
  poke();
}
stage.addEventListener("pointerup", pointerUp);
stage.addEventListener("pointercancel", pointerUp);
stage.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    zoomTo(view.camera.zoom * Math.exp(-e.deltaY * 0.001));
  },
  { passive: false },
);

document.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === "ArrowRight") change(1);
  else if (e.key === "ArrowLeft") change(-1);
  else if (e.key === "ArrowUp") wheelOpen ? closeWheel() : openDrawer();
  else if (e.key === "ArrowDown") sheet ? closeSheet() : openWheel();
  else if (e.key === " ") {
    e.preventDefault();
    void playOrPause();
  } else if (e.key === "Escape") {
    closeSheet();
    closeWheel();
  } else return;
  poke();
});

// ---------- sheets ----------

const scrim = $("scrim");
let sheet: HTMLElement | undefined;

function showSheet(el: HTMLElement): void {
  closeWheel();
  sheet?.classList.remove("show");
  sheet = el;
  el.classList.add("show");
  scrim.classList.add("show");
  chrome.classList.remove("away");
  clearTimeout(idle);
}
function closeSheet(): void {
  if (!sheet) return;
  sheet.classList.remove("show");
  sheet = undefined;
  scrim.classList.remove("show");
  stopThumbnails();
  poke();
}
scrim.addEventListener("click", closeSheet);
// Pulling a sheet down by its top closes it.
for (const el of document.querySelectorAll<HTMLElement>(".sheet")) {
  let from: number | undefined;
  el.addEventListener("pointerdown", (e) => {
    const scroll = el.querySelector(".scroll");
    from = scroll?.contains(e.target as Node) && scroll.scrollTop > 0 ? undefined : e.clientY;
  });
  el.addEventListener("pointerup", (e) => {
    if (from !== undefined && e.clientY - from > 70) closeSheet();
    from = undefined;
  });
}

$("gear").addEventListener("click", () => showSheet($("settings")));

// ---------- the creatures drawer ----------

let thumbs: Thumbnails | undefined;
const families = new Map<string, Creature[]>();
const showing = new Set<HTMLElement>();
let thumbTimer: ReturnType<typeof setInterval> | undefined;
let thumbTurn = 0;
const watcher = new IntersectionObserver((seen) => {
  for (const s of seen) {
    const card = s.target as HTMLElement;
    if (s.isIntersecting) {
      showing.add(card);
      if (card.dataset.drawn !== "yes") drawCard(card);
    } else showing.delete(card);
  }
});

const keyOf = (e: Entry) => `${e.shelf}/${e.name}`;

/** Draws a card's creature, the next member of its loop each time. */
function drawCard(card: HTMLElement): void {
  const e = list.find((x) => keyOf(x) === card.dataset.key);
  if (!e) return;
  let family = families.get(card.dataset.key!);
  if (!family) {
    family = familyFor(e);
    families.set(card.dataset.key!, family);
  }
  const k = Number(card.dataset.member ?? -1) + 1;
  const member = family[k % family.length]!;
  card.dataset.member = String(k);
  card.dataset.drawn = "yes";
  thumbs ??= new Thumbnails();
  const { built, background } = buildCreature(member, { time: 0, beat: 0, music: silence() });
  thumbs.draw(card.querySelector("canvas")!, built.shapes, background, built.focus);
}

function stopThumbnails(): void {
  clearInterval(thumbTimer);
  thumbTimer = undefined;
}

function openDrawer(): void {
  list = entries();
  const box = $("drawer-list");
  watcher.disconnect();
  showing.clear();
  const shelves = [
    ["opened", "Opened from a file or link"],
    ["starter", "Starter creatures"],
    ["community", "Shared by the community"],
  ] as const;
  const parts: HTMLElement[] = [];
  for (const [shelf, heading] of shelves) {
    const group = document.createElement("div");
    group.className = "group";
    group.textContent = heading;
    const these = list.filter((e) => e.shelf === shelf);
    if (these.length === 0) {
      if (shelf !== "opened") continue;
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent =
        "When someone sends you a creature, open the .genie file from Settings and it's kept here.";
      parts.push(group, empty);
      continue;
    }
    const grid = document.createElement("div");
    grid.className = "grid";
    for (const e of these) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "card";
      card.dataset.key = keyOf(e);
      card.innerHTML = `<canvas width="280" height="280"></canvas><div class="label"><b></b><span></span></div>`;
      card.querySelector("b")!.textContent = label(e.name);
      const count = checkText(e.text).variants.length + 1;
      card.querySelector("span")!.textContent =
        count > 1 ? `${count} shapes to morph through` : "One shape";
      card.addEventListener("click", () => {
        closeSheet();
        change(e);
      });
      grid.append(card);
      watcher.observe(card);
    }
    parts.push(group, grid);
  }
  box.replaceChildren(...parts);
  markCurrentCard();
  showSheet($("drawer"));
  // The cards on show step through their shapes, one card at a time, so the phone keeps up.
  stopThumbnails();
  thumbTimer = setInterval(() => {
    const cards = [...showing];
    if (cards.length === 0) return;
    drawCard(cards[thumbTurn++ % cards.length]!);
  }, 260);
}

function markCurrentCard(): void {
  for (const card of document.querySelectorAll<HTMLElement>(".card")) {
    card.classList.toggle("current", card.dataset.key === keyOf(entry));
  }
}
$("who").addEventListener("click", openDrawer);

// ---------- opening a creature from a file ----------

$<HTMLInputElement>("genie-file").addEventListener("change", async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  const opened = open(await file.text());
  if (typeof opened === "string") return toast(opened);
  closeSheet();
  change(opened);
});

// ---------- the dance-style wheel ----------

let wheelOpen = false;
let wheelAngle = 0;
let options: StyleOption[] = [];
const spin = $("spin");
const RADIUS = 270;
const step = () => 360 / options.length;

function fillWheel(): void {
  options = styleOptions();
  spin.replaceChildren(
    ...options.map((o, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = o.name;
      b.style.transform = `rotate(${i * step()}deg) translateY(-${RADIUS}px)`;
      return b;
    }),
  );
  const name = chosenOption().name;
  pickStyle(
    options.findIndex((o) => o.name === name),
    false,
  );
}

function pickStyle(i: number, remember = true): void {
  const n = options.length;
  const k = ((i % n) + n) % n;
  const o = options[k]!;
  // Turn the shortest way round.
  const target = -k * step();
  wheelAngle += ((((target - wheelAngle) % 360) + 540) % 360) - 180;
  spin.style.transform = `rotate(${wheelAngle}deg)`;
  spin.querySelectorAll("button").forEach((b, j) => b.classList.toggle("on", j === k));
  $("wheel-name").textContent = o.name;
  $("wheel-text").textContent = o.about;
  $("style-name").textContent = o.name;
  if (!remember) return;
  chosen = o.name;
  store.set("style", chosen);
  floor.setStyle(chosenStyle());
}

function openWheel(): void {
  if (sheet) closeSheet();
  wheelOpen = true;
  $("wheel").classList.add("show");
  chrome.classList.add("away");
  clearTimeout(idle);
}
function closeWheel(): void {
  if (!wheelOpen) return;
  wheelOpen = false;
  $("wheel").classList.remove("show");
  poke();
}
$("style-chip").addEventListener("click", openWheel);
$("wheel-done").addEventListener("click", closeWheel);

{
  const dial = $("dial");
  let from: { x: number; angle: number } | undefined;
  let moved = false;
  dial.addEventListener("pointerdown", (e) => {
    from = { x: e.clientX, angle: wheelAngle };
    moved = false;
    dial.setPointerCapture(e.pointerId);
    spin.classList.add("dragging");
  });
  dial.addEventListener("pointermove", (e) => {
    if (!from) return;
    const dx = e.clientX - from.x;
    if (Math.abs(dx) > 4) moved = true;
    wheelAngle = from.angle + dx * 0.32;
    spin.style.transform = `rotate(${wheelAngle}deg)`;
    const n = options.length;
    const near = (((Math.round(-wheelAngle / step()) % n) + n) % n) as number;
    spin.querySelectorAll("button").forEach((b, j) => b.classList.toggle("on", j === near));
  });
  const up = (e: PointerEvent) => {
    if (!from) return;
    from = undefined;
    spin.classList.remove("dragging");
    if (moved) return pickStyle(Math.round(-wheelAngle / step()));
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const k = [...spin.children].indexOf(hit as Element);
    if (k >= 0) pickStyle(k);
  };
  dial.addEventListener("pointerup", up);
  dial.addEventListener("pointercancel", up);

  // A swipe up or a tap on the wheel's free space closes it.
  const wheel = $("wheel");
  let y: number | undefined;
  wheel.addEventListener("pointerdown", (e) => {
    y = (e.target as Element).closest(".dial, button") ? undefined : e.clientY;
  });
  wheel.addEventListener("pointerup", (e) => {
    if (y !== undefined && (y - e.clientY > 45 || Math.abs(y - e.clientY) < 8)) closeWheel();
    y = undefined;
  });
}

// ---------- messages ----------

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function toast(message: string): void {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}

// ---------- start ----------

/** The creature to start with: one a link names, else the last one shown, else Medusa. */
/** The creature a link names, as in `?example=Medusa` or `?community=Pesky`. */
function linked(params: URLSearchParams): Entry | undefined {
  const example = params.get("example");
  const shared = params.get("community");
  return (
    (example && find("starter", example)) || (shared && find("community", shared)) || undefined
  );
}

function firstEntry(): Entry {
  const link = linked(new URLSearchParams(location.search));
  if (link) return link;
  const last = store.get<{ shelf: Entry["shelf"]; name: string } | undefined>(
    "creature",
    undefined,
  );
  return (last && find(last.shelf, last.name)) || find("starter", "Medusa") || list[0]!;
}

show(firstEntry());
onLink((params) => {
  const e = linked(params);
  if (!e) return toast("That creature isn't in the player yet. Update the app to get it.");
  closeSheet();
  closeWheel();
  change(e);
});
// The back button closes the wheel or a sheet first.
onBack(() => {
  if (wheelOpen) closeWheel();
  else if (sheet) closeSheet();
  else return false;
  return true;
});
showPlaying();
if (!store.get("hinted", false)) {
  $("hint").classList.remove("gone");
  setTimeout(() => {
    $("hint").classList.add("gone");
    store.set("hinted", true);
  }, 7000);
}
// The first demo track is loaded ahead, so the first tap on play starts at once.
void demoFile(DEMOS[0]!);
