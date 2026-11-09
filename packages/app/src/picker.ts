// The creature menu in the top bar: the creature on show, with its picture, and a menu of the
// creatures kept in this browser and the starters, as pictures to pick from.

import { dropdown } from "./shell.js";
import { drawPicturesIn, pictureOf } from "./pictures.js";

export interface PickerEntry {
  /** `mine` for one kept in this browser, `example` for a starter, `community` for a shared one. */
  kind: "mine" | "example" | "community";
  name: string;
  text: string;
  /** What it is, when it isn't a creature: background, pattern or dance. */
  what: string;
}

export interface PickerActions {
  /** Everything to offer; the community's creatures newest first. */
  entries(): PickerEntry[];
  open(entry: PickerEntry): void;
  /** Opens the library, on the community's shelf when asked. */
  library(shelf?: "community"): void;
}

/** How many of the community's creatures the menu shows; the library has them all. */
const NEWEST = 6;

const $ = (id: string) => document.getElementById(id)!;

export class CreaturePicker {
  private readonly menu = $("creature-menu");
  private drawing = 0;

  constructor(private readonly actions: PickerActions) {
    dropdown($("creature-button"), this.menu, () => this.fill());
  }

  /** Shows what's open: its name, its kind when it isn't a creature, and its picture. */
  setCurrent(name: string, text: string | undefined, what: string): void {
    $("creature-name").textContent = name.replace(/_/g, " ");
    $("creature-kind").textContent = what === "creature" ? "" : what;
    const picture = $("creature-picture");
    // Drawn after the page has shown, so opening a creature isn't held up by its picture.
    requestAnimationFrame(() => {
      const src = text === undefined ? undefined : pictureOf(text);
      picture.style.backgroundImage = src ? `url(${src})` : "";
    });
  }

  private fill(): void {
    const entries = this.actions.entries();
    const yours = entries.filter((e) => e.kind === "mine");
    const starters = entries.filter((e) => e.kind === "example");
    const shared = entries.filter((e) => e.kind === "community");
    const head = (text: string) => {
      const h = document.createElement("div");
      h.className = "menu-head";
      h.textContent = text;
      return h;
    };
    const item = (e: PickerEntry) => {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "menuitem");
      b.className = "pick";
      b.title = e.what === "creature" ? `Open ${e.name}` : `Open the ${e.what} ${e.name}`;
      const picture = document.createElement("span");
      picture.className = "pick-picture";
      picture.dataset["text"] = e.text;
      const label = document.createElement("span");
      label.className = "pick-name";
      label.textContent = e.name.replace(/_/g, " ");
      b.append(picture, label);
      if (e.what !== "creature") {
        const what = document.createElement("span");
        what.className = "pick-what";
        what.textContent = e.what;
        b.append(what);
      }
      b.addEventListener("click", () => this.actions.open(e));
      return b;
    };
    const grid = (list: PickerEntry[]) => {
      const g = document.createElement("div");
      g.className = "pick-grid";
      g.append(...list.map(item));
      return g;
    };
    const library = document.createElement("button");
    library.type = "button";
    library.setAttribute("role", "menuitem");
    library.className = "menu-foot";
    library.innerHTML =
      '<svg class="ico sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h4v16H4zM10 4h4v16h-4zM16.5 4.6l3.8 1-3.9 14.8-3.8-1z"/></svg>Patterns, dances and more in the Library';
    library.addEventListener("click", () => this.actions.library());
    // Past the newest few, the rest wait in the library, so the menu stays short.
    const allShared = (list: PickerEntry[]) => {
      if (list.length <= NEWEST) return [];
      const more = document.createElement("button");
      more.type = "button";
      more.setAttribute("role", "menuitem");
      more.className = "menu-more";
      more.textContent = `See all ${list.length} in the Library`;
      more.title = "Every creature the community has shared, in the Library";
      more.addEventListener("click", () => this.actions.library("community"));
      return [more];
    };
    this.menu.replaceChildren(
      ...(yours.length > 0 ? [head("Yours"), grid(yours)] : []),
      head("Starter creatures"),
      grid(starters),
      ...(shared.length > 0
        ? [head("Shared by the community"), grid(shared.slice(0, NEWEST)), ...allShared(shared)]
        : []),
      document.createElement("hr"),
      library,
    );
    const run = ++this.drawing;
    drawPicturesIn(this.menu, () => run === this.drawing && !this.menu.hidden);
  }
}
