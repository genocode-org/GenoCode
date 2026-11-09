// Sharing a creature with the community: a dialog that asks who to credit and what to say about
// it, then sends it to the share relay (packages/community/src/relay.ts), which files it for a
// maintainer to look at. Turnstile, Cloudflare's check that a person is there, goes with it.
//
// The relay's address and Turnstile's site key come from the build (VITE_SHARE_RELAY and
// VITE_TURNSTILE_SITE_KEY). Without them there's nowhere to send to, and the app offers no sharing.

import { LICENCE, LICENCE_URL, LIMITS, problems, type Share } from "@genocode/community";

const RELAY = import.meta.env["VITE_SHARE_RELAY"] as string | undefined;
const SITE_KEY = import.meta.env["VITE_TURNSTILE_SITE_KEY"] as string | undefined;

/** The name the user was last credited by, to fill in next time. */
const AUTHOR_KEY = "genocode.author";

/** Whether this build of the app can share. */
export function canShare(): boolean {
  return !!RELAY && !!SITE_KEY;
}

interface Turnstile {
  render(
    element: HTMLElement,
    options: {
      sitekey: string;
      theme: "dark";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ): string;
  remove(id: string): void;
}

let turnstile: Promise<Turnstile> | undefined;

/** Loads Turnstile once, when it's first needed. */
function loadTurnstile(): Promise<Turnstile> {
  turnstile ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => {
      const t = (window as { turnstile?: Turnstile }).turnstile;
      if (t) resolve(t);
      else reject(new Error("Turnstile didn't start."));
    };
    script.onerror = () => {
      turnstile = undefined;
      reject(new Error("Turnstile couldn't be loaded."));
    };
    document.head.append(script);
  });
  return turnstile;
}

function readAuthor(): string {
  try {
    return localStorage.getItem(AUTHOR_KEY) ?? "";
  } catch {
    return "";
  }
}

function keepAuthor(author: string): void {
  try {
    localStorage.setItem(AUTHOR_KEY, author);
  } catch {
    // Not kept: it's asked for again next time.
  }
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
): HTMLElementTagNameMap[K] {
  return Object.assign(document.createElement(tag), props);
}

/**
 * Asks who to credit and what to say, and sends the creature `name` with its `code`. Resolves
 * once the dialog is closed.
 */
export function shareWithCommunity(name: string, code: string): Promise<void> {
  const dialog = element("dialog", { className: "ask share" });
  const shown = name.replace(/_/g, " ");
  const intro = element("p", {
    textContent: `Share ${shown} with everyone who uses GenoCode. Once it has been looked at, it appears in the Community gallery on the website and in the app.`,
  });

  const author = element("input", {
    type: "text",
    value: readAuthor(),
    maxLength: LIMITS.author,
    placeholder: "Your name, or a name you go by",
    autocomplete: "name",
  });
  const about = element("textarea", {
    maxLength: LIMITS.description,
    rows: 3,
    placeholder: "What it is, or what to try with it (you can leave this empty)",
  });
  const agree = element("input", { type: "checkbox" });
  const agreeLabel = element("label", { className: "share-agree" });
  const licence = element("a", { href: LICENCE_URL, target: "_blank", rel: "noopener" });
  licence.textContent = LICENCE;
  const terms = element("span");
  terms.append(
    "I made it, or changed a creature I'm allowed to share. Anyone may use and change it, as long as they credit me (",
    licence,
    ").",
  );
  agreeLabel.append(agree, terms);
  const check = element("div", { className: "share-check" });
  const note = element("p", { className: "ask-note" });
  const cancel = element("button", { type: "button", textContent: "Cancel" });
  const send = element("button", { type: "button", className: "main", textContent: "Share" });
  const buttons = element("div", { className: "ask-buttons" });
  buttons.append(cancel, send);
  const labelled = (text: string, field: HTMLElement) => {
    const label = element("label", { className: "share-label", textContent: text });
    label.append(field);
    return label;
  };
  dialog.append(
    intro,
    labelled("Credit it to", author),
    labelled("About it", about),
    agreeLabel,
    check,
    note,
    buttons,
  );

  let token = "";
  let widget: string | undefined;
  let sending = false;

  const share = (): Share => ({
    name,
    author: author.value.trim(),
    description: about.value.trim(),
    code,
  });
  /** What stops sending, in a few words, or nothing. */
  const blocked = (): string => {
    if (author.value.trim() === "") return "Give a name to credit it to.";
    const wrong = problems(share());
    if (wrong.length > 0) return wrong[0]!;
    if (!agree.checked) return "Tick the box to share it on those terms.";
    if (!token) return "Waiting for the check that you're a person…";
    return "";
  };
  const update = () => {
    if (sending) return;
    const why = blocked();
    note.textContent = why;
    note.classList.remove("problem");
    send.disabled = why !== "";
  };
  for (const input of [author, about, agree]) input.addEventListener("input", update);

  /** Puts Turnstile's check in the dialog, afresh: a pass is good for one share only. */
  const startCheck = () =>
    loadTurnstile()
      .then((t) => {
        if (!dialog.isConnected) return;
        if (widget !== undefined) t.remove(widget);
        token = "";
        widget = t.render(check, {
          sitekey: SITE_KEY!,
          theme: "dark",
          callback: (pass) => {
            token = pass;
            update();
          },
          "expired-callback": () => {
            token = "";
            update();
          },
          "error-callback": () => {
            token = "";
            note.textContent =
              "The check that you're a person didn't work. Close this and try again.";
            note.classList.add("problem");
          },
        });
      })
      .catch(() => {
        note.textContent = "Sharing can't start: check your connection, then try again.";
        note.classList.add("problem");
      });
  void startCheck();

  cancel.addEventListener("click", () => dialog.close());
  send.addEventListener("click", async () => {
    if (blocked() !== "" || sending) return;
    sending = true;
    send.disabled = true;
    cancel.disabled = true;
    send.textContent = "Sharing…";
    keepAuthor(author.value.trim());
    try {
      const r = await fetch(`${RELAY}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...share(), turnstile: token }),
      });
      const answer = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(answer.error ?? "Sharing didn't work. Please try again later.");
      if (widget !== undefined) {
        const t = await loadTurnstile();
        t.remove(widget);
        widget = undefined;
      }
      dialog.replaceChildren(
        element("p", {
          textContent: `Thank you! ${shown} has been sent. It appears in the Community gallery once it has been looked at.`,
        }),
        buttons,
      );
      cancel.remove();
      send.textContent = "OK";
      send.disabled = false;
      send.onclick = () => dialog.close();
      send.focus();
    } catch (e) {
      sending = false;
      cancel.disabled = false;
      send.textContent = "Share";
      token = "";
      note.textContent =
        e instanceof TypeError
          ? "It couldn't be sent: check your connection, then try again."
          : (e as Error).message;
      note.classList.add("problem");
      void startCheck();
    }
  });
  dialog.addEventListener("cancel", (e) => {
    if (sending) e.preventDefault();
  });

  return new Promise((resolve) => {
    dialog.addEventListener("close", () => {
      if (widget !== undefined) void loadTurnstile().then((t) => t.remove(widget!));
      dialog.remove();
      resolve();
    });
    document.body.append(dialog);
    dialog.showModal();
    update();
    author.focus();
  });
}
