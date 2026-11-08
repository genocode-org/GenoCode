// The app's own dialogs, in place of the browser's alert, confirm and prompt: they match the page,
// don't block it, and work in full screen. Each one is a modal <dialog> that's removed when closed.

export interface Choice {
  label: string;
  /** The button Enter presses. */
  main?: boolean;
  /** Marks a choice that loses something. */
  danger?: boolean;
  /**
   * Work to do before the dialog closes, started by the click itself (so it can open the
   * browser's own dialogs). Meanwhile the dialog stays open and its buttons can't be pressed;
   * `busy` changes this button's label to say what's happening.
   */
  act?: ((busy: (label: string) => void) => Promise<unknown>) | undefined;
}

/** What a text field's check says about the text in it. */
export type TextCheck =
  /** The text can't be used: the main button is greyed out. */
  | { problem: string }
  /** The text can be used, but the user should know something first. */
  | { warning: string; ok: string }
  | undefined;

/** A text field for the dialog, checked as the user types. */
interface Field {
  input: HTMLInputElement;
  check?: ((text: string) => TextCheck) | undefined;
}

/**
 * Shows a message with some buttons and waits for one. Gives the button's index, or -1 when the
 * dialog is closed with Escape.
 */
export function choose(message: string, choices: Choice[], field?: Field): Promise<number> {
  const dialog = document.createElement("dialog");
  dialog.className = "ask";
  const text = document.createElement("p");
  text.textContent = message;
  dialog.append(text);
  const note = document.createElement("p");
  note.className = "ask-note";
  if (field) dialog.append(field.input, note);
  const buttons = document.createElement("div");
  buttons.className = "ask-buttons";
  dialog.append(buttons);

  return new Promise((resolve) => {
    let answer = -1;
    let working = false;
    choices.forEach((c, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = c.label;
      if (c.main) b.classList.add("main");
      if (c.danger) b.classList.add("danger");
      b.addEventListener("click", () => {
        if (working) return;
        answer = i;
        if (!c.act) {
          dialog.close();
          return;
        }
        working = true;
        for (const other of buttons.children)
          if (other !== b) (other as HTMLButtonElement).disabled = true;
        b.setAttribute("aria-busy", "true");
        void c
          .act((label) => (b.textContent = label))
          .catch(() => undefined)
          .finally(() => dialog.close());
      });
      buttons.append(b);
    });
    const main = choices.findIndex((c) => c.main);
    const mainButton = buttons.children[main] as HTMLButtonElement | undefined;
    // Checks the field's text: says what's wrong with it, and changes the main button to match.
    const update = () => {
      const said = field?.check?.(field.input.value.trim());
      note.textContent = said ? ("problem" in said ? said.problem : said.warning) : "";
      note.classList.toggle("problem", said !== undefined && "problem" in said);
      if (!mainButton) return;
      mainButton.disabled = said !== undefined && "problem" in said;
      mainButton.textContent = said && "ok" in said ? said.ok : choices[main]!.label;
      mainButton.classList.toggle("danger", said && "ok" in said ? true : !!choices[main]!.danger);
    };
    field?.input.addEventListener("input", update);
    update();
    dialog.addEventListener("keydown", (e) => {
      const usable = mainButton !== undefined && !mainButton.disabled;
      if (e.key === "Enter" && usable && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        mainButton.click();
      }
    });
    // Escape can't close it while a button's work is going on.
    dialog.addEventListener("cancel", (e) => {
      if (working) e.preventDefault();
    });
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(answer);
    });
    document.body.append(dialog);
    dialog.showModal();
    // Focus the input, or else the main button, so the keyboard works straight away.
    if (field) field.input.select();
    else mainButton?.focus();
  });
}

/** Tells the user something and waits until they've read it. */
export async function tell(message: string): Promise<void> {
  await choose(message, [{ label: "OK", main: true }]);
}

/** Asks a yes-or-no question: true for `yes`, false for `no` or Escape. */
export async function ask(
  message: string,
  yes: string,
  options: { no?: string; danger?: boolean } = {},
): Promise<boolean> {
  const i = await choose(message, [
    { label: options.no ?? "Cancel" },
    { label: yes, main: true, danger: options.danger ?? false },
  ]);
  return i === 1;
}

/**
 * Asks for some text: the trimmed text, or undefined when the user cancels or leaves it empty.
 * `check` looks at the text as it's typed, and can refuse it or warn about it.
 */
export async function askText(
  message: string,
  ok: string,
  options: { value?: string; placeholder?: string; check?: (text: string) => TextCheck } = {},
): Promise<string | undefined> {
  const input = document.createElement("input");
  input.type = "text";
  input.value = options.value ?? "";
  input.placeholder = options.placeholder ?? "";
  input.spellcheck = false;
  const i = await choose(message, [{ label: "Cancel" }, { label: ok, main: true }], {
    input,
    check: options.check,
  });
  return i === 1 ? input.value.trim() || undefined : undefined;
}
