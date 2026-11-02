// The code editor: CodeMirror 6 with GenoCode's colours, problems, completions, hover help, going to
// where a name is defined, renaming and colour pickers, all worked out by @genocode/core, so they
// match what the creature does.

import { autocompletion, type Completion, type CompletionContext } from "@codemirror/autocomplete";
import { indentWithTab } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { linter, type Diagnostic as LintDiagnostic } from "@codemirror/lint";
import {
  Annotation,
  EditorState,
  RangeSetBuilder,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  hoverTooltip,
  keymap,
  WidgetType,
  type DecorationSet,
} from "@codemirror/view";
import {
  BUILTIN_CONSTANTS,
  BUILTIN_FUNCTIONS,
  colourLiterals,
  completionsAt,
  helpAt,
  hexColour,
  lex,
  PICTURE_FUNCTIONS,
  rename,
  singleSpaced,
  symbolAt,
  toRgb,
  writeColour,
  type ColourLiteral,
  type CompletionKind,
  type Token,
} from "@genocode/core";
import { basicSetup } from "codemirror";
import { checkText } from "./creature.js";
import { askText, tell } from "./dialog.js";

/** Marks changes made by the app rather than typed, such as opening a file. */
const fromApp = Annotation.define<boolean>();

const INPUTS = new Set(["time", "beat", "music", "turtle"]);

/** Colours every token, using the core lexer and what the checker knows of the creature's names. */
export function colour(state: EditorState): DecorationSet {
  const text = state.doc.toString();
  const program = checkText(text);
  const genes = new Set(program.genes.map((g) => g.name));
  const marks: { from: number; to: number; cls: string }[] = [];
  const { tokens, comments } = lex(text);
  // Pattern code (section 14.1): a pattern file, or a creature's pattern blocks. Its words
  // `pattern`, `picture` and `value` aren't keywords, so creatures can use them as names.
  const { file } = program;
  const patternCode =
    file.kind === "pattern"
      ? [file.span]
      : file.items.flatMap((i) => (i.kind === "Pattern" ? [i.span] : []));
  const inPattern = (at: number) => patternCode.some((s) => s.start <= at && at < s.end);
  // The `pattern` before a pattern's name, in a pattern file's header or a pattern block.
  const names = new Set(
    file.kind === "pattern"
      ? [file.nameSpan.start]
      : file.items.flatMap((i) => (i.kind === "Pattern" ? [i.nameSpan.start] : [])),
  );
  tokens.forEach((t, i) => {
    let cls: string | undefined;
    const next = tokens[i + 1];
    const before = tokens[i - 1];
    if (t.kind === "keyword") cls = INPUTS.has(t.text) ? "input" : "keyword";
    else if (t.kind === "name" && inPattern(t.span.start) && isPatternWord(t.text, before, next)) {
      cls = "keyword";
    } else if (t.kind === "name" && t.text === "pattern" && names.has(next?.span.start ?? -1)) {
      cls = "keyword";
    } else if (t.kind === "number" || t.kind === "hex") cls = "number";
    else if (t.kind === "string") cls = "string";
    else if (t.kind === "name") {
      if (genes.has(t.text)) cls = "gene";
      else if (BUILTIN_FUNCTIONS.has(t.text) || t.text === "gradient" || t.text === "spectrum")
        cls = "function";
      else if (PICTURE_FUNCTIONS.has(t.text) && inPattern(t.span.start)) cls = "function";
      else if (BUILTIN_CONSTANTS.has(t.text)) cls = "constant";
      else if (
        program.parts.has(t.text) ||
        program.functions.has(t.text) ||
        program.patterns.has(t.text)
      )
        cls = "part";
    }
    if (cls && t.span.end > t.span.start) marks.push({ from: t.span.start, to: t.span.end, cls });
  });
  for (const c of comments) marks.push({ from: c.span.start, to: c.span.end, cls: "comment" });
  marks.sort((a, b) => a.from - b.from);
  const builder = new RangeSetBuilder<Decoration>();
  for (const m of marks) {
    if (m.to <= text.length) builder.add(m.from, m.to, Decoration.mark({ class: `g-${m.cls}` }));
  }
  return builder.finish();
}

/** Whether a name in pattern code is one of its words: `picture` before `{`, or `value` starting a
 * statement (not one that sets a variable called `value`). */
function isPatternWord(word: string, before: Token | undefined, next: Token | undefined): boolean {
  if (word === "picture") return next?.text === "{";
  if (word !== "value") return false;
  const starts = !before || before.kind === "newline" || before.text === "{" || before.text === ";";
  const sets = next?.kind === "op" && /^[-+*/]?=$/.test(next.text);
  return starts && !sets && next?.kind !== "newline";
}

const colours = StateField.define<DecorationSet>({
  create: colour,
  update: (value, tr) => (tr.docChanged ? colour(tr.state) : value),
  provide: (f) => EditorView.decorations.from(f),
});

const problems = linter(
  (view) => {
    const length = view.state.doc.length;
    return checkText(view.state.doc.toString()).diagnostics.map((d): LintDiagnostic => {
      const from = Math.min(d.span.start, length);
      return {
        from,
        to: Math.min(Math.max(d.span.end, from), length),
        severity: d.severity,
        message: d.message,
      };
    });
  },
  { delay: 250 },
);

const help = hoverTooltip((view, pos) => {
  const found = helpAt(checkText(view.state.doc.toString()), pos);
  if (!found) return null;
  return {
    pos: found.span.start,
    end: found.span.end,
    above: true,
    create() {
      const dom = document.createElement("div");
      dom.className = "g-help";
      const title = document.createElement("code");
      title.textContent = found.help.title;
      const text = document.createElement("p");
      text.textContent = found.help.text;
      const section = document.createElement("span");
      section.className = "g-section";
      section.textContent = `LANGUAGE.md § ${found.help.section}`;
      dom.append(title, text, section);
      if (symbolAt(checkText(view.state.doc.toString()), pos)) {
        const keys = document.createElement("p");
        keys.className = "g-section";
        keys.textContent = "F12 or Ctrl+click: jump to where it's defined · F2: rename it";
        dom.append(keys);
      }
      return { dom };
    },
  };
});

/** Marks every use of the name the cursor is on, and more strongly where it's defined. */
export function uses(state: EditorState): DecorationSet {
  const { main } = state.selection;
  if (!main.empty) return Decoration.none;
  const found = symbolAt(checkText(state.doc.toString()), main.head);
  if (!found) return Decoration.none;
  return Decoration.set(
    found.spans.map((s) =>
      Decoration.mark({
        class: s.start === found.declaration.start ? "g-use g-definition" : "g-use",
      }).range(s.start, s.end),
    ),
  );
}

const usesField = StateField.define<DecorationSet>({
  create: uses,
  update: (value, tr) => (tr.docChanged || tr.selection ? uses(tr.state) : value),
  provide: (f) => EditorView.decorations.from(f),
});

/** Lights up the line holding a position, or none: the code that made the path step pointed at. */
const markLine = StateEffect.define<number | undefined>();

const markedLine = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(markLine)) continue;
      if (e.value === undefined || e.value > tr.state.doc.length) return Decoration.none;
      const line = tr.state.doc.lineAt(e.value);
      value = Decoration.set(Decoration.line({ class: "g-path-line" }).range(line.from));
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Moves the cursor to where the name at `at` is defined, selecting it. False if there's no name. */
function goToDefinition(view: EditorView, at = view.state.selection.main.head): boolean {
  const found = symbolAt(checkText(view.state.doc.toString()), at);
  if (!found) return false;
  view.dispatch({
    selection: { anchor: found.declaration.start, head: found.declaration.end },
    scrollIntoView: true,
  });
  return true;
}

/** Asks for a new name for the name at the cursor and writes it everywhere the name is used. */
async function renameAtCursor(view: EditorView): Promise<void> {
  const at = view.state.selection.main.head;
  const program = checkText(view.state.doc.toString());
  const found = symbolAt(program, at);
  if (!found) {
    await tell("Put the cursor on the name of a gene, part, function or variable to rename it.");
    view.focus();
    return;
  }
  const name = await askText(`Rename \`${found.name}\` everywhere it's used, to:`, "Rename", {
    value: found.name,
    check(text) {
      const result = rename(program, at, text.trim());
      if ("error" in result) return { problem: result.error };
      return result.warning ? { warning: result.warning, ok: "Rename anyway" } : undefined;
    },
  });
  view.focus();
  // Nothing to do, or the text changed while the dialog was open.
  if (!name || name === found.name || view.state.doc.toString() !== program.text) return;
  const result = rename(program, at, name);
  if ("error" in result) return;
  view.dispatch({
    changes: result.edits.map((e) => ({ from: e.span.start, to: e.span.end, insert: e.text })),
  });
}

/** A small square of a colour written in the code, which opens a colour picker when clicked. */
class Swatch extends WidgetType {
  constructor(
    readonly start: number,
    readonly css: string,
  ) {
    super();
  }

  override eq(other: Swatch): boolean {
    return other.start === this.start && other.css === this.css;
  }

  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement("span");
    box.className = "g-swatch";
    box.style.background = this.css;
    box.title = "Pick a colour";
    box.addEventListener("mousedown", (event) => {
      event.preventDefault();
      pickColour(view, this.start, box);
    });
    return box;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

/** The colour as CSS, with its alpha. */
function cssColour(c: ColourLiteral["colour"]): string {
  const [r, g, b] = toRgb(c).map((x) => Math.round(Math.min(Math.max(x, 0), 1) * 255));
  return `rgba(${r}, ${g}, ${b}, ${c.a})`;
}

/** A swatch before every colour written out in the code. */
export function swatches(state: EditorState): DecorationSet {
  return Decoration.set(
    colourLiterals(state.doc.toString()).map((l) =>
      Decoration.widget({ widget: new Swatch(l.span.start, cssColour(l.colour)), side: -1 }).range(
        l.span.start,
      ),
    ),
  );
}

const swatchesField = StateField.define<DecorationSet>({
  create: swatches,
  update: (value, tr) => (tr.docChanged ? swatches(tr.state) : value),
  provide: (f) => EditorView.decorations.from(f),
});

/** The browser's colour picker, kept for the next colour once it's been used. */
let picker: HTMLInputElement | undefined;

/**
 * Opens the browser's colour picker for the colour written at `start`. Each colour picked is
 * written in its place, the same way it was written (hsv, rgb, hex, or hex in place of a name), and
 * keeping its alpha.
 */
function pickColour(view: EditorView, start: number, near: HTMLElement): void {
  const at = () => colourLiterals(view.state.doc.toString()).find((l) => l.span.start === start);
  const found = at();
  if (!found) return;
  picker?.remove();
  const input = document.createElement("input");
  picker = input;
  input.type = "color";
  input.className = "g-colour-picker";
  input.value = writeColour({ ...found.colour, a: 1 }, "hex") ?? "#000000";
  const box = near.getBoundingClientRect();
  input.style.left = `${box.left}px`;
  input.style.top = `${box.bottom}px`;
  document.body.append(input);
  input.addEventListener("input", () => {
    const now = at();
    if (!now) return;
    const picked = { ...hexColour(input.value), a: now.colour.a };
    const text = writeColour(picked, now.form, now.alpha) ?? writeColour(picked, "hex", now.alpha);
    if (text === undefined) return;
    view.dispatch({ changes: { from: now.span.start, to: now.span.end, insert: text } });
  });
  input.click();
}

const COMPLETION_TYPES: Record<CompletionKind, string> = {
  keyword: "keyword",
  function: "function",
  constant: "constant",
  input: "variable",
  gene: "property",
  part: "class",
  variable: "variable",
  member: "property",
};

function complete(ctx: CompletionContext) {
  const word = ctx.matchBefore(/[A-Za-z_][A-Za-z0-9_]*/);
  const afterDot = ctx.state.sliceDoc(ctx.pos - 1, ctx.pos) === ".";
  if (!word && !afterDot && !ctx.explicit) return null;
  const items = completionsAt(checkText(ctx.state.doc.toString()), ctx.pos);
  return {
    from: word ? word.from : ctx.pos,
    validFor: /^[A-Za-z0-9_]*$/,
    options: items.map((c): Completion => ({
      label: c.label,
      type: COMPLETION_TYPES[c.kind],
      ...(c.detail ? { info: c.detail } : {}),
      boost: c.kind === "gene" || c.kind === "variable" || c.kind === "member" ? 2 : 0,
    })),
  };
}

const theme = EditorView.theme(
  {
    "&": { height: "100%", fontSize: "13.5px", backgroundColor: "var(--bg)", color: "var(--text)" },
    ".cm-scroller": { fontFamily: "ui-monospace, monospace", lineHeight: "1.5" },
    ".cm-gutters": { backgroundColor: "var(--bg)", color: "#4b5570", border: "none" },
    ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "#ffffff08" },
    ".g-path-line": { backgroundColor: "#ffc23d26", boxShadow: "inset 3px 0 #ffc23d" },
    "&.cm-focused .cm-cursor": { borderLeftColor: "var(--accent)" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
      backgroundColor: "#2e3a5c !important",
    },
    ".cm-tooltip": {
      backgroundColor: "#1b2133",
      border: "1px solid var(--line)",
      color: "var(--text)",
    },
    ".cm-tooltip-autocomplete ul li[aria-selected]": {
      backgroundColor: "#2a3350",
      color: "var(--text)",
    },
    ".cm-diagnostic-error": { borderLeftColor: "var(--error)" },
    ".cm-diagnostic-warning": { borderLeftColor: "var(--warning)" },
    ".cm-panels": { backgroundColor: "var(--panel)", color: "var(--text)" },
  },
  { dark: true },
);

export class CodeEditor {
  readonly view: EditorView;
  private timer = 0;

  /**
   * `onEdit` is called a moment after the text is typed or changed by `applyEdits`, and `onCursor`
   * whenever the cursor is moved by the user, with where it is.
   */
  constructor(
    parent: HTMLElement,
    onEdit: (text: string) => void,
    onCursor?: (at: number) => void,
  ) {
    this.view = new EditorView({
      parent,
      state: EditorState.create({
        extensions: [
          basicSetup,
          keymap.of([
            indentWithTab,
            { key: "F12", run: (view) => goToDefinition(view) },
            {
              key: "F2",
              run: (view) => {
                void renameAtCursor(view);
                return true;
              },
            },
          ]),
          EditorView.domEventHandlers({
            // Ctrl+click (⌘+click on a Mac) on a name jumps to where it's defined; anywhere else
            // it does what it always does.
            mousedown(event, view) {
              if (event.button !== 0 || !(event.ctrlKey || event.metaKey)) return false;
              const at = view.posAtCoords({ x: event.clientX, y: event.clientY });
              if (at === null || !goToDefinition(view, at)) return false;
              event.preventDefault();
              return true;
            },
          }),
          // Pasted or dropped code comes in with one space between things.
          EditorView.clipboardInputFilter.of((text) => singleSpaced(text)),
          indentUnit.of("  "),
          EditorView.lineWrapping,
          autocompletion({ override: [complete] }),
          colours,
          usesField,
          markedLine,
          swatchesField,
          problems,
          help,
          theme,
          EditorView.updateListener.of((u) => {
            const byApp = u.transactions.some((t) => t.annotation(fromApp));
            if (u.selectionSet && !byApp) onCursor?.(u.state.selection.main.head);
            if (!u.docChanged || byApp) return;
            clearTimeout(this.timer);
            this.timer = window.setTimeout(() => onEdit(this.text), 150);
          }),
        ],
      }),
    });
  }

  get text(): string {
    return this.view.state.doc.toString();
  }

  /** Replaces the whole text, as when opening a file. Doesn't call `onEdit`. */
  setText(text: string): void {
    if (text === this.text) return;
    clearTimeout(this.timer);
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: text },
      annotations: fromApp.of(true),
    });
  }

  /** Puts the cursor at `at` and scrolls to it. Doesn't call `onCursor`. */
  moveTo(at: number): void {
    this.view.dispatch({
      selection: { anchor: Math.min(at, this.view.state.doc.length) },
      scrollIntoView: true,
      annotations: fromApp.of(true),
    });
  }

  /** Lights up the line holding `at`, scrolling to it; undefined clears it. */
  markLine(at: number | undefined): void {
    this.view.dispatch({
      effects: [
        markLine.of(at),
        ...(at === undefined ? [] : [EditorView.scrollIntoView(at, { y: "nearest" })]),
      ],
    });
  }

  /** Where the cursor is. */
  get cursor(): number {
    return this.view.state.selection.main.head;
  }

  /** Changes parts of the text, keeping the cursor and the undo history. Calls `onEdit`. */
  applyEdits(edits: readonly { start: number; end: number; text: string }[]): void {
    if (edits.length === 0) return;
    this.view.dispatch({
      changes: edits.map((e) => ({ from: e.start, to: e.end, insert: e.text })),
    });
  }
}
