// The library: the starter creatures and dance styles, and everything kept in this browser, as
// tiles with small pictures, one shelf at a time. A creature or background tile opens its file, and
// a dance style dances the creature on show to it. A background or dance can also be put into the
// creature, a style opened to edit it, and your own deleted.

import { checkText } from "./creature.js";
import { drawPicturesWhenSeen, onPicturesStale } from "./pictures.js";

export type EntryKind = "creature" | "background" | "dance" | "pattern";

export interface LibraryEntry {
  kind: EntryKind;
  name: string;
  text: string;
  /** Kept in this browser, or one that comes with GenoCode. */
  yours: boolean;
  /** Shared by someone in the community, and approved. */
  community?: boolean;
}

export interface LibraryActions {
  open(entry: LibraryEntry): void;
  /** Dances the creature on show (or Geno) to a dance style. */
  dance(entry: LibraryEntry): void;
  /** Puts a background or dance into the creature on show. */
  putIn(entry: LibraryEntry): void;
  remove(entry: LibraryEntry): void;
  /** The name of the creature on show, which backgrounds and dances can be put into. */
  creature(): string | undefined;
}

/** The kind of a file, from its header. */
export function kindOf(text: string): EntryKind {
  return checkText(text).file.kind;
}

export type Shelf = "yours" | "creatures" | "community" | "backgrounds" | "patterns" | "dances";

export class LibraryView {
  private shelf: Shelf | undefined;
  private entries: LibraryEntry[] = [];
  /** Stops drawing the pictures of the shelf shown before. */
  private stopDrawing = () => {};

  constructor(
    private readonly root: HTMLElement,
    private readonly actions: LibraryActions,
  ) {
    onPicturesStale(() => {
      if (!this.root.hidden) this.drawPictures();
    });
  }

  /** Makes `shelf` the one shown next. */
  choose(shelf: Shelf): void {
    this.shelf = shelf;
  }

  show(entries: LibraryEntry[]): void {
    this.entries = entries;
    const creature = this.actions.creature();
    const into = creature ? `, or put it into ${creature}` : "";
    const starters = entries.filter((e) => !e.yours && !e.community);
    const shelves: { id: Shelf; label: string; hint: string; list: LibraryEntry[] }[] = [
      {
        id: "yours",
        label: "Yours",
        hint: "Kept in this browser. Click one to open it.",
        list: entries.filter((e) => e.yours),
      },
      {
        id: "creatures",
        label: "Starter creatures",
        hint: "The creatures that come with GenoCode. Click one to open it.",
        list: starters.filter((e) => e.kind === "creature"),
      },
      {
        id: "community",
        label: "Community",
        hint: "Creatures shared by people who use GenoCode. Click one to open it.",
        list: entries.filter((e) => e.community && e.kind === "creature"),
      },
      {
        id: "backgrounds",
        label: "Backgrounds",
        hint: `Click one to open it${into}.`,
        list: starters.filter((e) => e.kind === "background"),
      },
      {
        id: "patterns",
        label: "Patterns",
        hint: `Pattern kinds written in GenoCode, to read and change. Click one to open it${creature ? `, or give it to ${creature}` : ""}.`,
        list: starters.filter((e) => e.kind === "pattern"),
      },
      {
        id: "dances",
        label: "Dance styles",
        hint: `How music moves a creature. Click one to dance ${creature ?? "Geno"} to it.`,
        list: starters.filter((e) => e.kind === "dance"),
      },
    ].filter((s) => s.list.length > 0) as {
      id: Shelf;
      label: string;
      hint: string;
      list: LibraryEntry[];
    }[];
    if (!shelves.some((s) => s.id === this.shelf)) {
      this.shelf = shelves.find((s) => s.id === "yours")?.id ?? shelves[0]?.id;
    }
    const current = shelves.find((s) => s.id === this.shelf);

    const head = document.createElement("div");
    head.className = "library-head";
    const title = document.createElement("h2");
    title.textContent = "Library";
    const tabs = document.createElement("div");
    tabs.className = "seg";
    tabs.setAttribute("role", "group");
    tabs.setAttribute("aria-label", "Shelf");
    for (const s of shelves) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = s.label;
      b.setAttribute("aria-pressed", String(s.id === this.shelf));
      b.addEventListener("click", () => {
        this.shelf = s.id;
        this.show(this.entries);
      });
      tabs.append(b);
    }
    head.append(title, tabs);
    const note = document.createElement("p");
    note.className = "hint";
    note.textContent = current?.hint ?? "";
    const grid = document.createElement("div");
    grid.className = "library-grid";
    grid.append(...(current?.list ?? []).map((e) => this.tile(e)));
    this.root.replaceChildren(head, note, grid);
    this.drawPictures();
  }

  private tile(entry: LibraryEntry): HTMLElement {
    const tile = document.createElement("div");
    tile.className = `library-tile ${entry.kind}`;
    tile.tabIndex = 0;
    tile.title =
      entry.kind === "dance"
        ? `Dance ${this.actions.creature() ?? "Geno"} to ${entry.name}`
        : `Open ${entry.name}`;
    const program = checkText(entry.text);
    if (entry.kind === "dance") {
      const icon = document.createElement("div");
      icon.className = "library-dance";
      icon.innerHTML =
        '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>';
      tile.append(icon);
    } else {
      const picture = document.createElement("div");
      picture.className = "library-picture";
      picture.dataset["text"] = entry.text;
      tile.append(picture);
    }
    const label = document.createElement("div");
    label.className = "library-name";
    label.textContent = entry.name.replace(/_/g, " ");
    const about = document.createElement("div");
    about.className = "library-about";
    about.textContent = program.file.description
      .map((c) => c.text.replace(/^\/\/\s?/, ""))
      .join(" ");
    tile.append(label, about);

    const buttons = document.createElement("div");
    buttons.className = "library-buttons";
    const button = (text: string, title: string, run: () => void) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      b.title = title;
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        run();
      });
      buttons.append(b);
    };
    const creature = this.actions.creature();
    if (entry.kind === "background" && creature) {
      button("Put behind", `Put this background behind ${creature}`, () =>
        this.actions.putIn(entry),
      );
    }
    if (entry.kind === "pattern" && creature) {
      button("Give it", `Give ${creature} this pattern kind, to use in its textures`, () =>
        this.actions.putIn(entry),
      );
    }
    if (entry.kind === "dance") {
      if (creature) {
        button("Make it its own", `Write this style into ${creature} as its own dance`, () =>
          this.actions.putIn(entry),
        );
      }
      button("Edit", "Open the style's code, to change or export it", () =>
        this.actions.open(entry),
      );
    }
    if (entry.yours) {
      button("Delete", `Delete ${entry.name} from this browser`, () => this.actions.remove(entry));
    }
    if (buttons.childElementCount > 0) tile.append(buttons);

    const open = () =>
      entry.kind === "dance" ? this.actions.dance(entry) : this.actions.open(entry);
    tile.addEventListener("click", open);
    tile.addEventListener("keydown", (e) => {
      if (e.key === "Enter") open();
    });
    return tile;
  }

  private drawPictures(): void {
    this.stopDrawing();
    this.stopDrawing = drawPicturesWhenSeen(this.root);
  }
}
