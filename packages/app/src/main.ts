// The GenoCode app. View: write a creature's code and see it beside the code, rebuilt as you type,
// with a control for each gene and sliders for time and music. Breed: a grid of variations to
// mutate and breed. Morph: a loop blending creatures into one another. Dance: music moves the
// creature along that loop, turns it and brings it nearer, by a dance style. Patterns: design
// texture and background recipes. Library: the starter creatures and dance styles, and everything
// kept in this browser, as pictures to open. Creatures come from the
// examples, from files (watched for changes where the browser allows it), or from those saved in
// this browser.

import {
  addVariant,
  check,
  format,
  geneEdits,
  KEYWORDS,
  MUSIC_FIELDS,
  patternsOf,
  valuesEqual,
  valuesOf,
  variantEdits,
  type CheckResult,
  type Diagnostic,
  type Pattern,
  type Value,
} from "@genocode/core";
import { hooks } from "@genocode/blocks";
import { InputControls, type GeneEditing } from "@genocode/controls";
import { MusicPlayer } from "@genocode/music";
import { CreatureView, type Side } from "@genocode/render";
import { BlocksView } from "./blocksview.js";
import { Breeder } from "./breed.js";
import {
  breedable,
  buildCreature,
  checkText,
  familyOf,
  fromProgram,
  type Creature,
} from "./creature.js";
import { DanceFloor, type DanceFrame } from "./dance.js";
import { RecentSongs, songLabel } from "./recent.js";
import { ask, askText, choose, tell } from "./dialog.js";
import { CodeEditor } from "./editor.js";
import { drawFieldsInWorkers } from "./fields.js";
import { kindOf, LibraryView, type LibraryEntry } from "./libraryview.js";
import { deleteCreature, saveCreature, savedNames, savedText } from "./library.js";
import { Morpher } from "./morph.js";
import {
  definitionLines,
  PatternDesigner,
  type OwnPattern,
  saveBlob,
  withBackground,
  withDefinition,
} from "./patterns.js";
import {
  locked,
  showGenes,
  showInfo,
  showProblems,
  showStatus,
  type VariantGenes,
} from "./panel.js";
import { CreaturePicker, type PickerEntry } from "./picker.js";
import { canRecord, LONGEST, VideoRecorder, type Video, type VideoShape } from "./recorder.js";
import { dropdown, Shell, type Mode } from "./shell.js";

// The starter creatures in the repository's creatures/ folder.
const examples = import.meta.glob("../../../creatures/*.genie", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

// GenoCode's own pattern kinds written in GenoCode, in the repository's patterns/ folder.
const patternFiles = import.meta.glob("../../../patterns/*.genie", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

// The dance styles in the repository's dances/ folder.
const danceFiles = import.meta.glob("../../../dances/*.genie", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const NEW_CREATURE = `creature New_Creature
// What it is, in a line or two.

gene size = 1 in 0.5..2  // how big it is

shape ball
grow size
lay
`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>("view");
const grid = $("grid");
const codeSection = $("code");
drawFieldsInWorkers();
const view = new CreatureView(canvas);
const app = $("app");
const fileInput = $<HTMLInputElement>("file-input");
const watching = $("watching");

let mode: Mode = "view";
/** The turtle's path is drawn over the creature in the View. */
let showingPath = false;

/** Where the code came from: an example, a creature saved in this browser, or elsewhere. */
type Source = { kind: "example" | "mine"; name: string } | { kind: "other" };
let source: Source = { kind: "other" };
/** The text as last opened or saved, to tell whether there are changes to lose. */
let savedAs = "";
/** Said in Breed's hint until the next click in the grid or its tools. */
let breedNote = "";
/** The last version opened or saved, checked, to see which genes have changed since. */
let savedProgram: CheckResult | undefined;
/** The variant menu's last entry, which makes a new variant. */
const NEW_VARIANT = "+new";

/** The latest text, as checked, whether or not it has errors. */
let program: CheckResult | undefined;
/** The creature: the last version without errors, with its gene values. */
let current: Creature | undefined;
/** The variant chosen to be on show, by name; none for the creature itself. */
let variant: string | undefined;
/** What the full view and the panel show: the creature, or the chosen variant of it. */
let shown: Creature | undefined;
let liveFrame = 0;
let watchTimer = 0;
/** Whether the music was playing when Dance was left, to carry on when it's back. */
let musicWasPlaying = false;

const editor = new CodeEditor(
  codeSection,
  (text) => {
    // Typed here, so the browser has the latest version now, not the file on disk.
    stopWatching();
    show(text, true);
  },
  cursorMoved,
);
const blocksSection = $("blocks");
const blocks = new BlocksView(
  blocksSection,
  (text) => {
    // Built with blocks: the code is written for them.
    stopWatching();
    editor.setText(text);
    show(text, true);
  },
  (name) => chooseVariant(name, false),
);

// The background and dance blocks' export buttons save each as its own file (section 15).
hooks.exportDefinition = (kind) => {
  const file = checkText(editor.text).file;
  const item = file.items.find((i) => i.kind === (kind === "background" ? "Background" : "Dance"));
  if (!item || (item.kind !== "Background" && item.kind !== "Dance")) return;
  const name = `${file.name}_${kind === "background" ? "Background" : "Dance"}`;
  const nowhere = { start: 0, end: 0 };
  const description = {
    text: `// The ${kind} of ${file.name}.`,
    span: nowhere,
    line: 0,
    endLine: 0,
    ownLine: true,
    blankBefore: false,
  };
  const text = format({
    kind,
    name,
    nameSpan: nowhere,
    headerComments: [],
    description: [description],
    // Set off from the header by a blank line, as files are.
    items: item.body.items.map((s, k) =>
      k > 0
        ? s
        : s.leading.length > 0
          ? { ...s, leading: [{ ...s.leading[0]!, blankBefore: true }, ...s.leading.slice(1)] }
          : { ...s, blankBefore: true },
    ),
    endComments: [],
    span: nowhere,
  });
  const blob = new Blob([text], { type: "text/plain" });
  void saveBlob(blob, `${name}.genie`, `GenoCode ${kind}s`, ".genie");
};
const inputs = new InputControls($("inputs-section"), () => {
  if (mode === "view" && !inputs.running) showCurrent(true, false);
});

// ---------- view ----------

/** Shows new text. Keeps showing the last good version while the text has errors. */
function show(text: string, keepView: boolean, carried?: ReadonlyMap<string, Value>): void {
  blocks.show(text);
  program = checkText(text);
  if (breedable(program)) {
    current = fromProgram(program);
    // Genes without a line in the code, such as `seed`, keep the values they came with.
    for (const g of program.genes) {
      const v = carried?.get(g.fullName);
      if (g.decl === undefined && v !== undefined) current.values.set(g.fullName, v);
    }
  } else if (!keepView) current = undefined;
  pickShown();
  fillVariantMenu();
  showInfo(program, shown?.variant);
  enableTools();
  showSaved();
  // A creature that says `breed off` can't be bred: it's shown instead.
  if (mode === "breed" && current && !current.program.breedable) {
    setMode("view");
    return;
  }
  // The grid stays while it holds this very program, such as after adding one of it as a variant.
  if (mode === "breed" && current && !breeder.holds(current)) {
    breeder.start(familyOf(current), strength());
  }
  // A background has no creature to morph or dance: it's shown instead.
  if ((mode === "morph" || mode === "dance") && current && !hasCreature(current)) {
    setMode("view");
    return;
  }
  if (mode === "morph" && current) startMorph();
  // A new creature while dancing keeps the style it's danced to.
  if (mode === "dance" && current) startDance(true);
  // The kind menus offer the file's own patterns. The same creature keeps the recipe being designed.
  if (mode === "patterns") showPatterns(keepView ? undefined : creaturePattern());
  if (mode === "view") showCurrent(keepView);
}

/**
 * Gene controls write into the code, so they're only offered while the code is what's on show:
 * into the gene's line for the creature itself, or into the variant's block for a variant.
 */
const geneEditing: GeneEditing = {
  input(g, v) {
    shown?.values.set(g.fullName, v);
    showCurrent(true, false);
  },
  change(g, v) {
    if (!current || !shown || current.program.text !== editor.text) return;
    shown.values.set(g.fullName, v);
    // A locked gene changed by hand stays locked at its new value.
    if (locked.has(g.fullName)) locked.set(g.fullName, v);
    const values = new Map([[g.fullName, v]]);
    editor.applyEdits(
      shown.variant === undefined
        ? geneEdits(current.program, values)
        : variantEdits(current.program, shown.variant, values),
    );
  },
};

/** The genes the variant on show sets itself, which the panel marks and can put back. */
function variantGenes(): VariantGenes | undefined {
  const own = current?.program.variants.find((v) => v.name === shown?.variant);
  if (!current || !own) return undefined;
  return {
    sets: new Set(own.values.keys()),
    reset(g) {
      if (!current || current.program.text !== editor.text) return;
      editor.applyEdits(variantEdits(current.program, own.name, new Map(), [g.fullName]));
    },
  };
}

// ---------- variants ----------

const variantSelect = $<HTMLSelectElement>("variant");

/** Works out what's on show: the chosen variant, while the creature still has it. */
function pickShown(): void {
  shown = current && familyOf(current).find((c) => c.variant === variant);
  shown ??= current;
}

/**
 * Lists the creature and its variants in the View's menu, and a way to make a new one. It's hidden
 * for creatures without genes.
 */
function fillVariantMenu(): void {
  const variants = current?.program.variants ?? [];
  const none = !current || current.program.genes.length === 0;
  $("variant-field").hidden = none;
  $("variant-sep").hidden = none;
  const option = (value: string, label: string) => {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = label;
    return o;
  };
  variantSelect.replaceChildren(
    option("", `${current?.program.file.name.replace(/_/g, " ") ?? "The creature"} itself`),
    ...variants.map((v) => option(`:${v.name}`, v.name)),
    option(NEW_VARIANT, "New variant…"),
  );
  variantSelect.value = shown?.variant === undefined ? "" : `:${shown.variant}`;
}

/**
 * Shows a variant (by name) or the creature itself (none) in the view and the panel. With
 * `reveal`, the code's cursor goes to its block, or to the creature's first gene.
 */
function chooseVariant(name: string | undefined, reveal: boolean): void {
  if (reveal && current) {
    const p = current.program;
    const at =
      name === undefined
        ? p.genes.find((g) => g.decl)?.decl?.span.start
        : p.variants.find((v) => v.name === name)?.decl.nameSpan.end;
    if (at !== undefined && p.text === editor.text) editor.moveTo(at);
  }
  if (name === variant) return;
  variant = name;
  pickShown();
  variantSelect.value = shown?.variant === undefined ? "" : `:${shown.variant}`;
  if (program) showInfo(program, shown?.variant);
  if (mode === "view") showCurrent(true);
}

variantSelect.addEventListener("change", () => {
  if (variantSelect.value === NEW_VARIANT) {
    variantSelect.value = shown?.variant === undefined ? "" : `:${shown.variant}`;
    void newVariant();
    return;
  }
  const name = variantSelect.value === "" ? undefined : variantSelect.value.slice(1);
  chooseVariant(name, true);
});

// ---------- making variants ----------

type Edit = { start: number; end: number; text: string };

/** Asks for a new variant's name, refusing ones the creature can't take. */
function askVariantName(p: CheckResult, message: string): Promise<string | undefined> {
  return askText(message, "Make variant", {
    placeholder: "A name, such as Spotty",
    check(text) {
      const name = text.trim();
      if (name === "") return { problem: "" };
      const added = addVariant(p, name, new Map());
      return "error" in added ? { problem: added.error } : undefined;
    },
  });
}

/** Adds a variant with these edits, and shows it (in View, with the cursor in its block). */
function putInVariant(name: string, edits: Edit[]): void {
  editor.applyEdits([...edits].sort((a, b) => a.start - b.start));
  variant = name;
  show(editor.text, true, current?.values);
  if (mode === "view") chooseVariant(name, true);
}

/** An empty variant, from the variant menu: the gene controls then set its genes. */
async function newVariant(): Promise<void> {
  if (!current || current.program.text !== editor.text) return;
  const p = current.program;
  const name = await askVariantName(
    p,
    "Name the new variant. It starts out as the creature itself; the genes you change then go into it.",
  );
  if (!name || editor.text !== p.text) return;
  const added = addVariant(p, name, new Map());
  if (!("error" in added)) putInVariant(name, added.edits);
}

/**
 * The gene changes made since the creature was opened or saved, as a new variant would hold them,
 * and the edits that put back what was changed. For the creature itself, its own genes go back;
 * for a variant, the variant goes back as it was. Undefined when nothing has changed.
 */
function changesSinceSaved(): { values: Map<string, Value>; putBack: Edit[] } | undefined {
  if (!current || !shown || current.program !== program || program.text !== editor.text) {
    return undefined;
  }
  if (savedAs === "") return undefined;
  if (savedProgram?.text !== savedAs) savedProgram = check(savedAs);
  const base = savedProgram;
  const p = current.program;
  const was = new Map(base.genes.map((g) => [g.fullName, g]));
  const same = (g: (typeof p.genes)[number]) => was.get(g.fullName)?.kind === g.kind;
  if (shown.variant === undefined) {
    const values = new Map<string, Value>();
    const back = new Map<string, Value>();
    for (const g of p.genes) {
      const v = shown.values.get(g.fullName);
      const before = was.get(g.fullName)?.value;
      if (!same(g) || v === undefined || before === undefined || valuesEqual(v, before)) continue;
      values.set(g.fullName, v);
      back.set(g.fullName, before);
    }
    return values.size > 0 ? { values, putBack: geneEdits(p, back) } : undefined;
  }
  // A variant: the new one is a copy of it as it is now.
  const name = shown.variant;
  const values = new Map<string, Value>();
  for (const g of p.genes) {
    const v = shown.values.get(g.fullName);
    if (v !== undefined && !valuesEqual(v, g.value)) values.set(g.fullName, v);
  }
  const before = base.variants.find((v) => v.name === name);
  // A variant made since saving is copied as it is, and left alone.
  if (!before) return values.size > 0 ? { values, putBack: [] } : undefined;
  const beforeValues = valuesOf(base.genes, before.values);
  const setBack = new Map<string, Value>();
  const unset: string[] = [];
  for (const g of p.genes) {
    const v = shown.values.get(g.fullName);
    const old = beforeValues.get(g.fullName);
    if (!same(g) || v === undefined || old === undefined || valuesEqual(v, old)) continue;
    const own = before.values.get(g.fullName);
    if (own === undefined) unset.push(g.fullName);
    else setBack.set(g.fullName, own);
  }
  if (setBack.size === 0 && unset.length === 0) return undefined;
  return { values, putBack: variantEdits(p, name, setBack, unset) };
}

/** The genes panel's Make a variant button: shown with the gene controls, active after changes. */
function showMakeVariant(editable: boolean): void {
  const button = $<HTMLButtonElement>("make-variant");
  button.hidden =
    !editable ||
    mode !== "view" ||
    !current ||
    !hasVariants(current) ||
    current.program.genes.length === 0;
  if (button.hidden) return;
  const changed = changesSinceSaved() !== undefined;
  button.disabled = !changed;
  button.title = !changed
    ? "Change some genes first: their new values can then become a variant of the creature"
    : variantMessage(true);
}

/** What Make a variant does with the changes there are: as a tooltip, or as the dialog says it. */
function variantMessage(short: boolean): string {
  const from = shown?.variant;
  const putsBack = (changesSinceSaved()?.putBack.length ?? 0) > 0;
  if (from === undefined) {
    return short
      ? "Put the gene values you've changed into a new variant, and set the creature's own genes back"
      : "Name the new variant. It gets the gene values you've changed since the creature was opened or saved, and the creature's own genes go back to how they were.";
  }
  if (short) {
    return putsBack
      ? `Copy ${from} as it is now into a new variant, and set ${from} back as it was`
      : `Copy ${from} into a new variant`;
  }
  return putsBack
    ? `Name the new variant. It's a copy of ${from} as it is now, and ${from} goes back to how it was.`
    : `Name the new variant. It's a copy of ${from}.`;
}

$("make-variant").addEventListener("click", async () => {
  const changes = changesSinceSaved();
  if (!changes || !current || !shown) return;
  const p = current.program;
  const name = await askVariantName(p, variantMessage(false));
  if (!name || editor.text !== p.text) return;
  const added = addVariant(p, name, changes.values);
  if (!("error" in added)) putInVariant(name, [...added.edits, ...changes.putBack]);
});

/** Breed's Add as variant: the picked creature joins the open one's family, and the grid stays. */
$("add-variant").addEventListener("click", async () => {
  const [child] = breeder.selection;
  if (
    !current ||
    !child ||
    breeder.selection.length !== 1 ||
    current.program.text !== editor.text
  ) {
    return;
  }
  const p = current.program;
  const values = new Map<string, Value>();
  for (const g of p.genes) {
    const v = child.values.get(g.fullName);
    if (v !== undefined && !valuesEqual(v, g.value)) values.set(g.fullName, v);
  }
  if (values.size === 0) {
    await tell(
      "This one has the same genes as the creature itself, so it can't be a variant of it.",
    );
    return;
  }
  const name = await askVariantName(
    p,
    "Name the new variant. The creature you picked is added to the open one as a variant, and you can keep breeding.",
  );
  if (!name || editor.text !== p.text) return;
  const added = addVariant(p, name, values);
  if ("error" in added) return;
  let text = p.text;
  for (const e of [...added.edits].reverse()) {
    text = text.slice(0, e.start) + e.text + text.slice(e.end);
  }
  breeder.adopt(checkText(text));
  putInVariant(name, added.edits);
  breedNote = `Added ${name} as a variant`;
  enableTools();
});

/**
 * The cursor in a variant's block shows that variant; on a gene's line, the creature itself.
 * Anywhere else, what's on show stays, so the drawing code can be changed while a variant is shown.
 */
function cursorMoved(at: number): void {
  lightPath();
  if (!current) return;
  const p = checkText(editor.text);
  const inside = (span: { start: number; end: number }) => span.start <= at && at <= span.end;
  const found = p.variants.find((v) => inside(v.decl.span));
  if (found) chooseVariant(found.name, false);
  else if (p.genes.some((g) => g.decl && inside(g.decl.span))) chooseVariant(undefined, false);
}

/**
 * Shows the current creature in the full view. Creatures that read time are rebuilt every frame.
 * `panel` redraws the gene panel too, which mustn't happen while one of its sliders is dragged.
 */
function showCurrent(keepView: boolean, panel = true): void {
  cancelAnimationFrame(liveFrame);
  if (!shown) {
    view.setCreature([]);
    view.setBackground(undefined);
    showProblems(program!, program!.diagnostics);
    showGenes(program?.genes ?? [], new Map());
    inputs.show(false);
    showStatus("");
    return;
  }
  const c = shown;
  const live = c.program.live || c.program.backgroundLive;
  if (panel) {
    const editable = c.program === program;
    showGenes(
      c.program.genes,
      c.values,
      editable ? geneEditing : undefined,
      editable ? variantGenes() : undefined,
    );
    showMakeVariant(editable);
    inputs.show(live);
  }
  const frame = (keep: boolean | "unless-inside") => {
    const { built, background } = buildCreature(c, inputs.now(), showingPath);
    view.setCreature(built.shapes, keep, built.focus);
    view.setPath(showingPath ? (built.path ?? []) : undefined);
    lightPath();
    view.setBackground(background);
    blocks.setBackground(background);
    report(built.diagnostics, built.shapes.length, live);
    if (live && inputs.running) liveFrame = requestAnimationFrame(() => frame(true));
  };
  // A change to the code that grows the creature round the camera frames it afresh; a live
  // creature moving on its own doesn't.
  frame(keepView && "unless-inside");
}

/** Lists problems and says what's on show. */
function report(buildProblems: Diagnostic[], shapeCount: number, live: boolean): void {
  const latest = program!;
  const fresh = current?.program === latest;
  showProblems(latest, [...latest.diagnostics, ...(fresh ? buildProblems : [])]);
  const stale = current && !fresh ? " · showing the last version without errors" : "";
  const shapes =
    current?.program.file.kind === "background"
      ? "A background"
      : `${shapeCount} shape${shapeCount === 1 ? "" : "s"}`;
  showStatus(`${shapes} · ${live ? "moves with time" : "still"}${stale}`);
}

// ---------- opening ----------

const dirty = () => editor.text !== savedAs;

/** Asks before losing changes. */
async function mayDiscard(): Promise<boolean> {
  if (!dirty()) return true;
  return ask("Your changes to this creature aren't saved.", "Lose them", {
    no: "Keep editing",
    danger: true,
  });
}

/** Puts new code in the editor and shows it. */
function load(text: string, from: Source): void {
  stopWatching();
  variant = undefined;
  source = from;
  savedAs = text;
  editor.setText(text);
  inputs.restart();
  show(text, false);
  showSource();
}

/** Shows what's open in the creature menu and the address. */
function showSource(): void {
  const file = checkText(editor.text).file;
  picker.setCurrent(file.name || "Untitled", editor.text, file.kind);
  $("delete").hidden = source.kind !== "mine";
  showSaved();
  const url = new URL(location.href);
  url.searchParams.delete("example");
  url.searchParams.delete("mine");
  if (source.kind !== "other") url.searchParams.set(source.kind, source.name);
  history.replaceState(null, "", url);
}

const exampleNames = Object.keys(examples)
  .map((path) =>
    path
      .split("/")
      .pop()!
      .replace(/\.genie$/, ""),
  )
  .sort();

function exampleText(name: string): string | undefined {
  const path = Object.keys(examples).find((p) => p.endsWith(`/${name}.genie`));
  return path ? examples[path] : undefined;
}

/** What the creature menu offers: those kept in this browser, then the starters. */
function pickerEntries(): PickerEntry[] {
  const mine = savedNames().map((name) => {
    const text = savedText(name)!;
    return { kind: "mine" as const, name, text, what: kindOf(text) };
  });
  const starters = exampleNames.map((name) => {
    const text = exampleText(name)!;
    return { kind: "example" as const, name, text, what: kindOf(text) };
  });
  return [...mine, ...starters];
}

const picker = new CreaturePicker({
  entries: pickerEntries,
  open: (e) => void openPicked(e.kind, e.name),
  library: () => setMode("library"),
});

function openListed(kind: "example" | "mine", name: string): boolean {
  const text = kind === "example" ? exampleText(name) : savedText(name);
  if (text === undefined) return false;
  load(text, { kind, name });
  return true;
}

/** Opens a creature picked from the menu, unless that would lose changes. */
async function openPicked(kind: "example" | "mine", name: string): Promise<void> {
  if (await mayDiscard()) openListed(kind, name);
}

/** Dances the next (or previous) creature in the creature menu. */
function stepCreature(by: number): void {
  const list = pickerEntries().filter((e) => e.what === "creature");
  if (list.length === 0) return;
  const at = list.findIndex((e) => source.kind === e.kind && source.name === e.name);
  const next = list[(at + by + list.length) % list.length]!;
  void openPicked(next.kind, next.name);
}

/** Says in the top bar whether what's open has changes that aren't kept anywhere. */
function showSaved(): void {
  const saved = $("saved-state");
  const changed = dirty();
  saved.hidden = !changed && source.kind !== "mine";
  saved.classList.toggle("changed", changed);
  saved.textContent = changed ? "Not saved" : "Saved";
  saved.title = changed
    ? "Your changes are only on this page: Save keeps them in this browser"
    : "Kept in this browser";
}

$("new").addEventListener("click", async () => {
  if (await mayDiscard()) load(NEW_CREATURE, { kind: "other" });
});

// ---------- modes ----------

const breeder = new Breeder(grid, {
  inspect(c) {
    breedNote = "";
    showGenes(c.program.genes, c.values);
    enableTools();
  },
  open(c) {
    // Write its genes into the code, so the code is the creature on show.
    let text = c.program.text;
    for (const e of geneEdits(c.program, c.values).reverse()) {
      text = text.slice(0, e.start) + e.text + text.slice(e.end);
    }
    editor.setText(text);
    // Its values are now the creature's own.
    variant = undefined;
    show(text, false, c.values);
    setMode("view");
  },
});

let lastPanel = 0;
const morpher = new Morpher(view, (f) => {
  if (performance.now() - lastPanel < 200) return;
  lastPanel = performance.now();
  showGenes(f.creature.program.genes, f.creature.values);
  const next = (f.index + 1) % morpher.count;
  const label = (i: number) => {
    const c = morpher.member(i);
    return c.variant ?? (c === current ? (c.program.file.name ?? "") : `Creature ${i + 1}`);
  };
  $("morph-hint").textContent =
    `${label(f.index)} → ${label(next)} · ${f.index + 1} of ${morpher.count}`;
  showProblems(f.creature.program, f.problems);
});

const shell = new Shell(app, {
  changed: showPanes,
  wantView: () => setMode("view"),
});

/** Shows or hides the code and the blocks as the frame says. */
function showPanes(): void {
  codeSection.hidden = !shell.codeShown;
  const wasHidden = blocksSection.hidden;
  blocksSection.hidden = !shell.blocksShown;
  if (!blocksSection.hidden && wasHidden) blocks.revealed();
}

function setMode(next: Mode): void {
  recorder.stop();
  // Music only moves the creature in Dance, so a song (not live music) waits there for it.
  if (mode === "dance" && next !== "dance") {
    musicWasPlaying = player.active && !player.live && !player.paused;
    if (musicWasPlaying) void player.togglePause();
  } else if (next === "dance" && mode !== "dance" && musicWasPlaying) {
    musicWasPlaying = false;
    if (player.paused) void playMusic(() => player.togglePause());
  }
  mode = next;
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
    b.setAttribute("aria-pressed", String(b.dataset["mode"] === mode));
  }
  for (const m of ["view", "breed", "morph", "dance"]) {
    $(`${m}-tools`).hidden = mode !== m;
    $(`${m}-hint`).hidden = mode !== m;
  }
  // Shown again by the View, with the gene controls.
  if (mode !== "view") $("make-variant").hidden = true;
  shell.setMode(mode);
  const pictureless = mode === "breed" || mode === "patterns" || mode === "library";
  canvas.hidden = pictureless;
  grid.hidden = mode !== "breed";
  patternsSection.hidden = mode !== "patterns";
  librarySection.hidden = mode !== "library";
  $("views").hidden = pictureless;
  $("stage-title").hidden = pictureless;
  cancelAnimationFrame(liveFrame);
  morpher.stop();
  floor.stop();
  inputs.show(false);
  $("path-toggle").hidden = mode !== "view";
  if (mode !== "view") view.setPath(undefined);
  if (mode === "view") showCurrent(false);
  if (mode === "breed" && current) {
    if (!breeder.holds(current)) breeder.start(familyOf(current), strength());
    else breeder.render();
    showGenes(current.program.genes, current.values);
  }
  if (mode === "morph") startMorph();
  if (mode === "dance") startDance();
  if (mode === "patterns") showPatterns(creaturePattern());
  if (mode === "library") library.show(libraryEntries());
  showFaceOn();
  enableTools();
  // One Video button, in the Morph or the Dance tools.
  if (mode === "morph" || mode === "dance") $(`${mode}-tools`).append($("record-tools"));
}

/**
 * The creatures to morph through: those chosen in the grid, or else the creature's family (itself
 * and its variants), or else the whole grid, or else variations of the creature. The grid only
 * counts while it holds the current creature: one opened since breeding starts afresh.
 */
function loopMembers(current: Creature): Creature[] {
  const ours = breeder.holds(current);
  let members = ours ? breeder.selection : [];
  if (members.length < 2) members = familyOf(current);
  if (members.length < 2 && ours) members = [...breeder.creatures];
  if (members.length < 2) {
    breeder.start([current], 0.5);
    members = breeder.creatures.slice(0, 6);
  }
  return members;
}

function startMorph(): void {
  if (current) morpher.start(loopMembers(current));
}

/** The slider bent like DancerDNA's, so its low half gives fine control: 50 is 0.25. */
function strength(): number {
  return strengthOf(Number($<HTMLInputElement>("strength").value));
}

/** Strength from a slider at 0 to 100: a smooth curve through 0, 0.125, 0.25, 0.5 and 1. */
function strengthOf(slider: number): number {
  const points = [0, 0, 0.125, 0.25, 0.5, 1, 1];
  const at = Math.min(Math.max(slider, 0), 100) / 25;
  const i = Math.min(Math.floor(at), 3);
  const t = at - i;
  const [p0, p1, p2, p3] = points.slice(i, i + 4) as [number, number, number, number];
  // Catmull-Rom through the points, with the ends repeated.
  return (
    0.5 *
    (2 * p1 +
      (p2 - p0) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
      (3 * p1 - p0 - 3 * p2 + p3) * t * t * t)
  );
}

/** Whether there's a creature to morph or dance: a pattern is shown on a ball, a background alone isn't. */
function hasCreature(c: Creature): boolean {
  return c.program.file.kind !== "background";
}

/** Only a creature file can hold variants. */
function hasVariants(c: Creature): boolean {
  return c.program.file.kind === "creature";
}

function enableTools(): void {
  const ok = current !== undefined;
  for (const b of document.querySelectorAll<HTMLButtonElement>(
    "[data-mode=breed], [data-mode=morph], [data-mode=dance], [data-go]",
  )) {
    b.disabled = !ok;
  }
  const unbred = current !== undefined && !current.program.breedable;
  for (const b of document.querySelectorAll<HTMLButtonElement>(
    "[data-mode=breed], [data-go=breed]",
  )) {
    if (unbred) b.disabled = true;
    b.title = unbred
      ? "This creature says `breed off`: its children don't keep its look"
      : "Breed new creatures from this one";
  }
  const bare = current !== undefined && !hasCreature(current);
  for (const b of document.querySelectorAll<HTMLButtonElement>(
    "[data-mode=morph], [data-go=morph], [data-mode=dance], [data-go=dance]",
  )) {
    const morph = (b.dataset["mode"] ?? b.dataset["go"]) === "morph";
    if (bare) b.disabled = true;
    b.title = bare
      ? `A background on its own has nothing to ${morph ? "morph" : "dance"}`
      : morph
        ? "Watch the creature flow through its family"
        : "Make it dance to music";
  }
  // `breed off` rules out mutating as well as breeding.
  const chosen = unbred ? 0 : breeder.selection.length;
  $<HTMLButtonElement>("mutate").disabled = chosen < 1;
  $<HTMLButtonElement>("breed").disabled = chosen < 2;
  $<HTMLButtonElement>("back").disabled = !breeder.canGoBack;
  const addVariant = $<HTMLButtonElement>("add-variant");
  const variantless = !current || !hasVariants(current);
  addVariant.disabled = chosen !== 1 || variantless;
  addVariant.title = variantless
    ? "Only a creature can have variants: a background, pattern or dance file can't"
    : "Add the creature you picked to the open creature as a variant";
  $("breed-hint").textContent =
    breedNote ||
    (chosen === 0
      ? "Click creatures to choose parents · double-click to open one"
      : `${chosen} parent${chosen === 1 ? "" : "s"} chosen`);
}

for (const b of document.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
  b.addEventListener("click", () => setMode(b.dataset["mode"] as Mode));
}

for (const b of document.querySelectorAll<HTMLButtonElement>("[data-go]")) {
  b.addEventListener("click", () => setMode(b.dataset["go"] as Mode));
}

$("mutate").addEventListener("click", () => {
  breedNote = "";
  if (current && !current.program.breedable) return;
  breeder.mutateSelection(strength(), keepParents());
  enableTools();
});
$("breed").addEventListener("click", () => {
  breedNote = "";
  if (current && !current.program.breedable) return;
  breeder.breedSelection(keepParents());
  enableTools();
});
$("back").addEventListener("click", () => {
  breedNote = "";
  breeder.back();
  enableTools();
});
const keepParents = () => $<HTMLInputElement>("keep").checked;

$("play").addEventListener("click", () => {
  morpher.playing = !morpher.playing;
  $("play").dataset["state"] = morpher.playing ? "pause" : "play";
  $("play").setAttribute("aria-label", morpher.playing ? "Pause" : "Play");
});
$<HTMLInputElement>("speed").addEventListener("input", (e) => {
  morpher.secondsEach = Number((e.target as HTMLInputElement).value);
});

// ---------- patterns ----------

const patternsSection = $("patterns");
const designer = new PatternDesigner(patternsSection, {
  useAsBackground(lines, patterns) {
    // The library's patterns the recipe uses go in first, so the background can name them.
    let text: string | undefined = editor.text;
    for (const p of patterns) {
      const body = definitionLines(p.source.text);
      text = body && text !== undefined ? withDefinition(text, "pattern", body, p.name) : undefined;
    }
    text = text === undefined ? undefined : withBackground(text, lines);
    if (text === undefined) return;
    editor.setText(text);
    show(text, true);
    setMode("view");
  },
});

/** Shows the designer, from `start` if given, offering the file's patterns and the library's as kinds. */
function showPatterns(start?: Pattern): void {
  const own = shown ? patternsOf(shown.program, shown.values) : [];
  designer.show(start, own, libraryPatterns());
}

/** The pattern files kept in this browser's library, for the designer to offer as kinds. */
function libraryPatterns(): OwnPattern[] {
  return savedNames().flatMap((name) => {
    const text = savedText(name);
    if (text === undefined || kindOf(text) !== "pattern") return [];
    const program = checkText(text);
    return program.ok ? patternsOf(program) : [];
  });
}

/** The creature's background, when it's a pattern, to start designing from. */
function creaturePattern(): Pattern | undefined {
  if (!shown) return undefined;
  const { background } = buildCreature(shown);
  return typeof background === "object" && background.type === "pattern" ? background : undefined;
}

// ---------- the library ----------

const librarySection = $("library");
const library = new LibraryView(librarySection, {
  async open(entry) {
    if (!(await mayDiscard())) return;
    const from: Source = entry.yours
      ? { kind: "mine", name: entry.name }
      : entry.kind === "creature"
        ? { kind: "example", name: entry.name }
        : { kind: "other" };
    load(entry.text, from);
    setMode("view");
  },
  async dance(entry) {
    const key = entry.yours ? `mine:${entry.name}` : entry.name;
    if (entry.yours) yourStyles.set(key, check(entry.text));
    // A style needs a creature to dance: the one on show, or else Geno.
    if (current?.program.file.kind !== "creature") {
      if (!(await mayDiscard())) return;
      openListed("example", "Geno");
    }
    wantedStyle = key;
    setMode("dance");
  },
  putIn(entry) {
    if (putIn(entry.text)) setMode(entry.kind === "dance" ? "dance" : "view");
  },
  async remove(entry) {
    if (!(await ask(`Delete ${entry.name} from this browser?`, "Delete", { danger: true }))) return;
    deleteCreature(entry.name);
    if (source.kind === "mine" && source.name === entry.name) {
      source = { kind: "other" };
      savedAs = "";
    }
    showSource();
    library.show(libraryEntries());
  },
  creature() {
    const file = current?.program.file;
    return file?.kind === "creature" ? file.name : undefined;
  },
});

/** Everything the library shows: what's kept in this browser, then what comes with GenoCode. */
function libraryEntries(): LibraryEntry[] {
  const yours = savedNames().map((name) => {
    const text = savedText(name)!;
    return { kind: kindOf(text), name, text, yours: true };
  });
  const starters = exampleNames.map((name) => {
    const text = exampleText(name)!;
    return { kind: kindOf(text), name, text, yours: false };
  });
  const styles = Object.entries(danceFiles)
    .map(([path, text]) => ({
      kind: "dance" as const,
      name: path
        .split("/")
        .pop()!
        .replace(/\.genie$/, ""),
      text,
      yours: false,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const patterns = Object.values(patternFiles)
    .map((text) => ({
      kind: "pattern" as const,
      name: checkText(text).file.name,
      text,
      yours: false,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...yours, ...starters, ...patterns, ...styles];
}

// ---------- dancing ----------

const player = new MusicPlayer();
const styleSelect = $<HTMLSelectElement>("dance-style");
const OWN_STYLE = "own";

const styleNames = Object.keys(danceFiles)
  .map((path) =>
    path
      .split("/")
      .pop()!
      .replace(/\.genie$/, ""),
  )
  .sort();
const styles = new Map<string, CheckResult>();
/** Dance styles kept in this browser, added to the menu when danced to from the library. */
const yourStyles = new Map<string, CheckResult>();
/** The style to dance to next, picked in the library. */
let wantedStyle: string | undefined;

/** A style from the dances/ folder (checked once), or one of yours (`mine:Name`). */
function libraryStyle(name: string): CheckResult | undefined {
  if (name.startsWith("mine:")) return yourStyles.get(name);
  if (!styles.has(name)) {
    const path = Object.keys(danceFiles).find((p) => p.endsWith(`/${name}.genie`));
    if (path === undefined) return undefined;
    styles.set(name, check(danceFiles[path]!));
  }
  return styles.get(name);
}

const rememberedStyle = (): string => {
  try {
    return localStorage.getItem("genocode.style") ?? "";
  } catch {
    return "";
  }
};

/**
 * Lists the styles: the creature's own first (when it has a dance block), then the library's and
 * yours. With `keep`, a style from the library that's chosen stays chosen, as when the creature
 * changes while dancing.
 */
function fillStyleMenu(keep = false): void {
  const before = keep && styleSelect.value !== OWN_STYLE ? styleSelect.value : undefined;
  const own = current?.program.dance !== undefined;
  const options = [
    ...(own ? [[OWN_STYLE, `Its own (${current!.program.file.name})`]] : []),
    ...styleNames.map((n) => [n, n.replace(/_/g, " ")]),
    ...[...yourStyles.keys()].map((k) => [k, `${k.slice(5).replace(/_/g, " ")} (yours)`]),
  ].map(([value, label]) => {
    const o = document.createElement("option");
    o.value = value!;
    o.textContent = label!;
    return o;
  });
  styleSelect.replaceChildren(...options);
  const remembered = rememberedStyle();
  const wanted = wantedStyle ?? before;
  wantedStyle = undefined;
  styleSelect.value = wanted
    ? wanted
    : own
      ? OWN_STYLE
      : styleNames.includes(remembered)
        ? remembered
        : (styleNames.find((n) => n === "Groove") ?? styleNames[0] ?? "");
}

function chosenStyle(): CheckResult | undefined {
  return styleSelect.value === OWN_STYLE ? current?.program : libraryStyle(styleSelect.value);
}

/** Whether the creature dances face-on, seen from the front (remembered in this browser). */
let faceOn = (() => {
  try {
    return localStorage.getItem("genocode.faceOn") === "on";
  } catch {
    return false;
  }
})();

/** Shows the 2D view button's state; the side buttons can't move a locked camera. */
function showFaceOn(): void {
  $("face-on").setAttribute("aria-pressed", String(faceOn));
  const locked = mode === "dance" && faceOn;
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-side]")) b.disabled = locked;
}

$("face-on").addEventListener("click", () => {
  faceOn = !faceOn;
  try {
    localStorage.setItem("genocode.faceOn", faceOn ? "on" : "off");
  } catch {
    // Not remembered, then.
  }
  floor.setFaceOn(faceOn);
  showFaceOn();
});

function startDance(keepStyle = false): void {
  if (!current) return;
  fillStyleMenu(keepStyle);
  floor.setFaceOn(faceOn);
  floor.start(loopMembers(current), chosenStyle(), songName(), new Set(locked.keys()));
}

/** The song playing, to give the creature its look for it; live music has no song to name. */
function songName(): string | undefined {
  return player.source === "file" || player.source === "url" ? player.name : undefined;
}

styleSelect.addEventListener("change", () => {
  if (styleSelect.value !== OWN_STYLE) {
    try {
      localStorage.setItem("genocode.style", styleSelect.value);
    } catch {
      // Not remembered, then.
    }
  }
  floor.setStyle(chosenStyle());
});

// A small bar for each music input, and the beat.
const meterNames = [...MUSIC_FIELDS, "beat"] as const;
const meterBars = meterNames.map((name) => {
  const meter = document.createElement("div");
  meter.className = `meter${name.endsWith("hit") ? " hit" : ""}`;
  meter.title = name === "beat" ? "beat" : `music.${name}`;
  const bar = document.createElement("div");
  meter.append(bar);
  $("meters").append(meter);
  return bar;
});

let lastDancePanel = 0;
const floor = new DanceFloor(view, player, (f: DanceFrame) => {
  meterNames.forEach((name, i) => {
    const v = name === "beat" ? f.beat : f.music[name];
    meterBars[i]!.style.height = `${Math.round(v * 100)}%`;
  });
  if (performance.now() - lastDancePanel < 200) return;
  lastDancePanel = performance.now();
  showGenes(f.creature.program.genes, f.creature.values);
  showProblems(f.creature.program, f.problems);
  showDanceHint(f.styleOk);
});

floor.songLooks = (() => {
  try {
    return localStorage.getItem("genocode.songLooks") !== "off";
  } catch {
    return true;
  }
})();
$("song-looks").setAttribute("aria-pressed", String(floor.songLooks));
$("song-looks").addEventListener("click", () => {
  floor.setSongLooks(!floor.songLooks);
  $("song-looks").setAttribute("aria-pressed", String(floor.songLooks));
  try {
    localStorage.setItem("genocode.songLooks", floor.songLooks ? "on" : "off");
  } catch {
    // Not remembered, then.
  }
});

/** A time in seconds as minutes and seconds: 3:07. */
function minutes(seconds: number): string {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function showDanceHint(styleOk = true): void {
  const tempo = player.tempo;
  const at = player.position;
  const music = player.active
    ? [
        `${player.name}${player.paused ? " (paused)" : ""}`,
        ...(at ? [`${minutes(at.at)} of ${minutes(at.length)}`] : []),
        ...(tempo ? [`${Math.round(tempo)} beats a minute`] : []),
      ].join(" · ")
    : "Pick some music to dance to";
  $("dance-hint").textContent = styleOk ? music : `${music} · the style has a problem`;
  const play = $<HTMLButtonElement>("music-play");
  play.disabled = !player.active || player.live;
  const state = player.live ? "live" : player.active && !player.paused ? "pause" : "play";
  play.dataset["state"] = state;
  play.setAttribute("aria-label", { live: "Listening", pause: "Pause", play: "Play" }[state]);
  const label = $("music-button").querySelector(".label")!;
  label.textContent = player.active ? player.name : "Music";
}

/** Starts some music, reporting what went wrong if it can't. */
async function playMusic(start: () => Promise<void>): Promise<void> {
  try {
    await start();
  } catch (e) {
    await tell(`That music can't be played: ${e instanceof Error ? e.message : String(e)}`);
  }
  floor.setSong(songName());
  showDanceHint();
}

/** Plays a music file, and puts it at the top of the recent songs. */
function playFile(file: File): Promise<void> {
  return playMusic(async () => {
    await player.playFile(file);
    await recent.played(file);
  });
}

/** Plays music from a web address, and puts it at the top of the recent songs. */
function playUrl(url: string): Promise<void> {
  return playMusic(async () => {
    await player.playUrl(url);
    await recent.played(url);
  });
}

// The recent songs, at the bottom of the Music menu, nearest the button: each plays at a click,
// and the cross beside it takes it off the list.
const recent = new RecentSongs();
void recent.load().then(showRecent);
function showRecent(): void {
  const list = $("music-recent-list");
  list.replaceChildren(
    ...recent.songs.map((song) => {
      const row = document.createElement("div");
      row.className = "recent-row";
      const play = document.createElement("button");
      play.type = "button";
      play.setAttribute("role", "menuitem");
      play.title = song.kind === "url" ? `Dance to ${song.name}` : `Dance to ${song.name} again`;
      play.innerHTML = `<svg class="ico sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></svg>`;
      play.append(songLabel(song));
      play.addEventListener("click", () => {
        if (song.kind === "url") void playUrl(song.name);
        else if (song.file)
          void playFile(new File([song.file], song.name, { type: song.file.type }));
      });
      const forget = document.createElement("button");
      forget.type = "button";
      forget.className = "recent-forget";
      forget.title = "Take it off this list";
      forget.setAttribute("aria-label", `Take ${songLabel(song)} off the recent songs`);
      forget.textContent = "×";
      forget.addEventListener("click", () => {
        void recent.forget(song.key);
        showRecent();
        $("music-menu").querySelector<HTMLElement>("[role=menuitem]")?.focus();
      });
      row.append(play, forget);
      return row;
    }),
  );
  $("music-recent").hidden = recent.songs.length === 0;
}

const musicInput = $<HTMLInputElement>("music-input");
dropdown($("music-button"), $("music-menu"), showRecent);
$("music-file").addEventListener("click", () => musicInput.click());
musicInput.addEventListener("change", () => {
  const file = musicInput.files?.[0];
  if (file) void playFile(file);
  musicInput.value = "";
});
$("music-url").addEventListener("click", async () => {
  const url = await askText(
    "The web address of some music. The site must allow it to be played here.",
    "Play",
    { placeholder: "https://…" },
  );
  if (url) void playUrl(url);
});
$("music-mic").addEventListener("click", () => void playMusic(() => player.listen()));
// Phone browsers can't share another tab, so they don't get the button.
$("music-tab").hidden = typeof navigator.mediaDevices?.getDisplayMedia !== "function";
$("music-tab").addEventListener(
  "click",
  () =>
    void playMusic(async () => {
      try {
        await player.listenToTab();
      } catch (e) {
        // Closing the browser's tab picker isn't a problem worth an alert.
        if (!(e instanceof DOMException && e.name === "NotAllowedError")) throw e;
      }
    }),
);
player.onEnd = () => {
  floor.setSong(songName());
  showDanceHint();
};
$("music-play").addEventListener("click", () => void playMusic(() => player.togglePause()));

const isMusic = (f: File) =>
  f.type.startsWith("audio/") || /\.(mp3|wav|ogg|oga|opus|flac|m4a|aac|webm)$/i.test(f.name);

// ---------- videos ----------

const recordButton = $<HTMLButtonElement>("record-button");
const recorder = new VideoRecorder(view, canvas, $("stage"), $("record-mark"), player, () =>
  // On a wide screen the tools float over the bottom of the stage; on a phone they're in the sheet.
  shell.narrow.matches ? 0 : $("modebar").offsetHeight + 34,
);
recorder.onReframe = () => {
  if (mode === "dance") floor.reframe();
  else if (mode === "morph") morpher.reframe();
  else view.resetView();
};
recorder.onTick = (seconds) => {
  $("record-label").textContent = `Stop ${minutes(seconds)}`;
};
$("record-tools").hidden = !canRecord();

/** Whether the music is a file or an address, which can be recorded from start to end. */
const wholeSongs = () => mode === "dance" && player.position !== undefined;

dropdown(recordButton, $("record-menu"), () => {
  $("record-whole-row").hidden = !wholeSongs();
  $("record-note").textContent =
    mode === "dance" && !player.active
      ? "No music is playing, so the video will be silent."
      : `Up to ${LONGEST / 60} minutes. Press Stop to finish.`;
});
// While recording, the button stops it instead of opening the menu.
recordButton.addEventListener(
  "click",
  (e) => {
    if (!recorder.recording) return;
    e.stopImmediatePropagation();
    recorder.stop();
  },
  { capture: true },
);
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-shape]")) {
  b.addEventListener("click", () => void record(b.dataset["shape"] as VideoShape));
}

async function record(shape: VideoShape): Promise<void> {
  const name = creatureName();
  recordButton.classList.add("recording");
  recordButton.title = "Stop recording and keep the video";
  let video: Video | undefined;
  try {
    video = await recorder.start({
      shape,
      sound: mode === "dance",
      wholeSong: wholeSongs() && $<HTMLInputElement>("record-whole").checked,
    });
  } catch (e) {
    await tell(`The video can't be recorded: ${e instanceof Error ? e.message : String(e)}`);
  }
  recordButton.classList.remove("recording");
  recordButton.title = "Make a video of the creature, to keep or share";
  $("record-label").textContent = "Video";
  showDanceHint();
  if (video) await keepVideo(video, name);
}

/** Offers to save the video, or share it where the browser can (phones, mostly). */
async function keepVideo(video: Video, name: string): Promise<void> {
  const file = new File([video.blob], `${name}${video.ext}`, { type: video.blob.type });
  const share = navigator.canShare?.({ files: [file] }) ?? false;
  const size = `${Math.max(1, Math.round(video.blob.size / 1e6))} MB`;
  const choice = await choose(`Your video is ready: ${minutes(video.seconds)}, ${size}.`, [
    { label: "Throw away", danger: true },
    ...(share ? [{ label: "Share…" }] : []),
    { label: "Save…", main: true },
  ]);
  if (choice <= 0) return;
  if (share && choice === 1) {
    try {
      await navigator.share({ files: [file], title: name.replace(/_/g, " ") });
    } catch {
      // The share sheet was closed.
    }
    return;
  }
  await saveBlob(video.blob, file.name, "Videos", video.ext);
}

// ---------- saving ----------

/** The name to save under: the one in the code's header. */
const creatureName = () => checkText(editor.text).file.name || "Untitled";

/** Whether a name can be a creature's: letters, digits and _, not starting with a digit. */
const isName = (name: string) => /^[\p{L}_][\p{L}\p{N}_]*$/u.test(name) && !KEYWORDS.has(name);

/**
 * Asks what to save as, offering the name in the code's header. A name already saved in this
 * browser is only replaced when the user says so, except by the creature that was saved under it.
 */
function askSaveName(): Promise<string | undefined> {
  const { kind } = checkText(editor.text).file;
  return askText(`Save this ${kind} in this browser as:`, "Save", {
    value: creatureName(),
    check(name) {
      if (name === "") return { problem: "Give it a name." };
      if (!isName(name)) {
        return KEYWORDS.has(name)
          ? { problem: `${name} is one of GenoCode's own words: pick another name.` }
          : { problem: "Use letters, digits and _ only, and don't start with a digit." };
      }
      const resaving = source.kind === "mine" && source.name === name;
      if (savedText(name) !== undefined && !resaving) {
        return {
          warning: `You already have one called ${name}. Saving replaces it.`,
          ok: "Replace",
        };
      }
      return undefined;
    },
  });
}

$("save").addEventListener("click", async () => {
  const name = await askSaveName();
  if (name === undefined) return;
  // A new name goes into the code's header too, so the file says what it's called.
  const { file } = checkText(editor.text);
  if (file.name !== "" && file.name !== name) {
    const { start, end } = file.nameSpan;
    const text = editor.text.slice(0, start) + name + editor.text.slice(end);
    editor.setText(text);
    show(text, true);
  }
  try {
    saveCreature(name, editor.text);
  } catch {
    await tell(
      "This browser won't keep it (its storage is full or turned off). Use Download instead.",
    );
    return;
  }
  source = { kind: "mine", name };
  savedAs = editor.text;
  showSource();
});

$("delete").addEventListener("click", async () => {
  if (source.kind !== "mine") return;
  if (!(await ask(`Delete ${source.name} from this browser?`, "Delete", { danger: true }))) return;
  deleteCreature(source.name);
  savedAs = "";
  source = { kind: "other" };
  showSource();
});

type SaveWindow = Window & {
  showSaveFilePicker?: (options: object) => Promise<{
    createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  }>;
};

$("download").addEventListener("click", async () => {
  const text = editor.text;
  const name = `${creatureName()}.genie`;
  const picker = (window as SaveWindow).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: name,
        types: [{ description: "GenoCode creatures", accept: { "text/plain": [".genie"] } }],
      });
      const out = await handle.createWritable();
      await out.write(text);
      await out.close();
    } catch {
      // The picker was closed.
    }
    return;
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
});

// ---------- opening files ----------

interface FileHandleLike {
  name: string;
  getFile(): Promise<File>;
}

function stopWatching(): void {
  clearInterval(watchTimer);
  watching.hidden = true;
}

/** Shows a file, and keeps checking it for changes until it's edited here or another is opened. */
async function openHandle(handle: FileHandleLike): Promise<void> {
  let file = await handle.getFile();
  const text = await file.text();
  if ((await offerDefinition(text)) || !(await mayDiscard())) return;
  load(text, { kind: "other" });
  let modified = file.lastModified;
  watching.textContent = `Watching ${handle.name} for changes`;
  watching.hidden = false;
  watchTimer = window.setInterval(async () => {
    try {
      file = await handle.getFile();
      if (file.lastModified !== modified) {
        modified = file.lastModified;
        const text = await file.text();
        savedAs = text;
        editor.setText(text);
        show(text, true);
      }
    } catch {
      stopWatching();
    }
  }, 750);
}

async function openFile(file: File): Promise<void> {
  const text = await file.text();
  if ((await offerDefinition(text)) || !(await mayDiscard())) return;
  load(text, { kind: "other" });
}

/**
 * Offers to put a background or dance file into the creature on show, replacing its background or
 * dance block (docs/LANGUAGE.md sections 15 and 17). Says whether that's all: true when it was put
 * in or the user cancelled, false when the file is to be opened on its own.
 */
async function offerDefinition(text: string): Promise<boolean> {
  const file = checkText(text).file;
  const creature = current?.program.file;
  if (file.kind === "creature" || creature?.kind !== "creature") return false;
  const question =
    file.kind === "background"
      ? `Put the background ${file.name} behind ${creature.name}?`
      : file.kind === "pattern"
        ? `Give ${creature.name} the pattern ${file.name}, to use in its textures?`
        : `Give ${creature.name} the dance ${file.name}?`;
  const answer = await choose(question, [
    { label: "Cancel" },
    { label: `Open the ${file.kind} on its own` },
    { label: file.kind === "background" ? "Put it behind" : "Give it", main: true },
  ]);
  if (answer === 1) return false;
  return answer === 2 ? putIn(text) : true;
}

/** Puts a background or dance file into the creature on show. Says whether it could. */
function putIn(text: string): boolean {
  const { kind, name } = checkText(text).file;
  const lines = definitionLines(text);
  if (kind === "creature" || !lines) return false;
  const out = withDefinition(editor.text, kind, lines, name);
  if (out === undefined) return false;
  editor.setText(out);
  show(out, true);
  return true;
}

type PickerWindow = Window & {
  showOpenFilePicker?: (options: object) => Promise<FileHandleLike[]>;
};

$("open").addEventListener("click", async () => {
  const picker = (window as PickerWindow).showOpenFilePicker;
  if (picker) {
    try {
      const [handle] = await picker({
        types: [{ description: "GenoCode creatures", accept: { "text/plain": [".genie"] } }],
      });
      if (handle) await openHandle(handle);
    } catch {
      // The picker was closed.
    }
  } else {
    fileInput.click();
  }
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void openFile(file);
  fileInput.value = "";
});

const drop = $("drop");
window.addEventListener("dragover", (e) => {
  e.preventDefault();
  drop.hidden = false;
});
window.addEventListener("dragleave", (e) => {
  if (e.relatedTarget === null) drop.hidden = true;
});
window.addEventListener("drop", async (e) => {
  e.preventDefault();
  drop.hidden = true;
  const item = e.dataTransfer?.items[0] as
    (DataTransferItem & { getAsFileSystemHandle?: () => Promise<unknown> }) | undefined;
  const handle = await item?.getAsFileSystemHandle?.();
  if (handle && (handle as { kind?: string }).kind === "file")
    return openHandle(handle as FileHandleLike);
  const file = e.dataTransfer?.files[0];
  if (file && isMusic(file)) {
    if (current && mode !== "dance") setMode("dance");
    await playFile(file);
  } else if (file) await openFile(file);
});

$("reset").addEventListener("click", () => view.resetView());

async function savePicture(): Promise<void> {
  const blob = await view.picture(2);
  if (blob) await saveBlob(blob, `${creatureName()}.png`, "PNG pictures", ".png");
}
$("picture").addEventListener("click", () => void savePicture());
$("picture-bar").addEventListener("click", () => void savePicture());

dropdown($("file-button"), $("file-menu"));
dropdown($("camera-button"), $("camera-menu"));

/** The keys the app answers to, for the menu item and the ? key. */
function showShortcuts(): void {
  void tell(
    [
      "F: full screen, in View, Morph and Dance (Esc or F again to leave)",
      "[ and ]: the previous or next creature, while dancing",
      "1 to 9: the dance styles in the Style menu, while dancing",
      "F12 or Ctrl+click (⌘+click on a Mac) on a name in the code: jump to where it's defined",
      "F2 on a name in the code: rename it everywhere it's used",
      "?: this list",
    ].join("\n"),
  );
}
$("shortcuts").addEventListener("click", showShortcuts);

$("inputs-toggle").addEventListener("click", () => {
  const open = $("inputs-section").classList.toggle("open");
  $("inputs-toggle").setAttribute("aria-expanded", String(open));
});

// ---------- looking from each side, and full screen ----------

for (const b of document.querySelectorAll<HTMLButtonElement>("[data-side]")) {
  b.addEventListener("click", () => view.viewFrom(b.dataset["side"] as Side));
}

/**
 * Only the creature and its tools fill the screen, as a video does; Esc or F brings the page back.
 * Browsers that can't make the page full screen (phones, mostly) still hide everything else.
 */
function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen();
  else if (app.classList.contains("full")) setFull(false);
  else if (app.requestFullscreen) void app.requestFullscreen().catch(() => setFull(true));
  else setFull(true);
}

function setFull(full: boolean): void {
  app.classList.toggle("full", full);
  $("fullscreen").setAttribute("aria-pressed", String(full));
  if (full) showTools();
  else {
    clearTimeout(toolsTimer);
    app.classList.remove("awake");
  }
}

// In full screen the tools only show while the mouse moves (not while it drags the creature
// round), or for a moment after a tap, and fade a moment after, unless the mouse is resting on
// them. A touch screen keeps whatever was last tapped "hovered", so there hovering doesn't count.
const TOOLS_SHOW_MS = 2000;
const canHover = matchMedia("(hover: hover)");
let toolsTimer = 0;
function showTools(): void {
  app.classList.add("awake");
  clearTimeout(toolsTimer);
  toolsTimer = window.setTimeout(() => {
    if (canHover.matches && app.querySelector(".modebar:hover, .corner:hover, .menu:not([hidden])"))
      showTools();
    else app.classList.remove("awake");
  }, TOOLS_SHOW_MS);
}
app.addEventListener("pointermove", (e) => {
  if (app.classList.contains("full") && e.pointerType === "mouse" && e.buttons === 0) showTools();
});
app.addEventListener("pointerdown", (e) => {
  if (app.classList.contains("full") && e.pointerType !== "mouse") showTools();
});

$("fullscreen").addEventListener("click", toggleFullscreen);

// ---------- the turtle's path ----------

/** Whether the creature on show was built from the code in the editor, so its path points into it. */
function pathMatchesCode(): boolean {
  return shown?.program === program && program?.file.kind === "creature";
}

/** Where in the code the step under the pointer was made, while one is pointed at. */
let pointedAt: number | undefined;

/**
 * Lights up the steps of the path made by one line of the code: the line of the step pointed at,
 * or else the line the cursor is on. A live creature calls this every frame.
 */
function lightPath(): void {
  if (!showingPath || !pathMatchesCode()) return view.highlightPath(undefined);
  const doc = editor.view.state.doc;
  const line = doc.lineAt(Math.min(pointedAt ?? editor.cursor, doc.length));
  view.highlightPath((s) => s.span.start >= line.from && s.span.start <= line.to);
}

$("path-toggle").addEventListener("click", () => {
  showingPath = !showingPath;
  $("path-toggle").setAttribute("aria-pressed", String(showingPath));
  if (!showingPath) {
    pointedAt = undefined;
    editor.markLine(undefined);
  }
  showCurrent(true, false);
});
// Pointing at a step lights up its line of code, and every step that line made.
view.onPathHover = (step) => {
  pointedAt = step && pathMatchesCode() ? step.span.start : undefined;
  editor.markLine(pointedAt);
  lightPath();
};
view.onPathClick = (step) => {
  if (!pathMatchesCode()) return;
  editor.moveTo(step.span.start);
  editor.view.focus();
  lightPath();
};
document.addEventListener("fullscreenchange", () => setFull(document.fullscreenElement === app));
window.addEventListener("keydown", (e) => {
  const typing =
    e.target instanceof HTMLElement &&
    (e.target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName));
  const asking = document.querySelector("dialog[open]") !== null;
  if (typing || asking || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "Escape" && app.classList.contains("full") && !document.fullscreenElement) {
    setFull(false);
  }
  if ((e.key === "f" || e.key === "F") && ["view", "morph", "dance"].includes(mode)) {
    e.preventDefault();
    toggleFullscreen();
  }
  if (e.key === "?") showShortcuts();
  // [ and ] switch creatures while dancing, so it can be done in full screen.
  if (mode === "dance" && (e.key === "[" || e.key === "]")) stepCreature(e.key === "]" ? 1 : -1);
  // Number keys switch styles while dancing, as the original's function keys did.
  const n = Number(e.key);
  if (mode === "dance" && Number.isInteger(n) && n >= 1 && n <= styleSelect.options.length) {
    styleSelect.selectedIndex = n - 1;
    styleSelect.dispatchEvent(new Event("change"));
  }
});

// ---------- start ----------

const params = new URL(location.href).searchParams;
const mine = params.get("mine");
const example = params.get("example");
// Without one asked for in the address, the app opens with Geno, the logo come to life.
if (!(mine && openListed("mine", mine)) && !(example && openListed("example", example))) {
  if (!openListed("example", "Geno")) openListed("example", exampleNames[0] ?? "");
}
setMode("view");
