// What the phone app does beyond a web page: a tap you can feel, keeping the screen on, the
// Android back button and links that open the app. In a browser each falls back to the web's own
// way, or does nothing.

import { KeepAwake } from "@capacitor-community/keep-awake";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

/** Whether the player runs as the phone app rather than in a browser. */
export const native = Capacitor.isNativePlatform();

/** A small tap the hand can feel. */
export function buzz(): void {
  if (native) {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  } else if ("vibrate" in navigator) {
    try {
      navigator.vibrate(12);
    } catch {
      // No buzz on this phone.
    }
  }
}

let wake: WakeLockSentinel | undefined;
let awake = false;

/** Keeps the screen on, or lets it sleep again. */
export function stayAwake(on: boolean): void {
  if (on === awake) return;
  awake = on;
  if (native) {
    (on ? KeepAwake.keepAwake() : KeepAwake.allowSleep()).catch(() => {});
    return;
  }
  if (on && "wakeLock" in navigator) {
    navigator.wakeLock
      .request("screen")
      .then((w) => {
        wake = w;
        // The browser lets go when the page is hidden; asked for again when it's back.
        w.addEventListener("release", () => {
          wake = undefined;
          awake = false;
        });
      })
      .catch(() => (awake = false));
  } else if (!on) {
    void wake?.release().catch(() => {});
    wake = undefined;
  }
}

/**
 * Calls `open` with each link that opens the app, as in `genocode://open?example=Medusa` or the
 * website's `…/app/?community=Pesky`.
 */
export function onLink(open: (params: URLSearchParams) => void): void {
  if (!native) return;
  void App.addListener("appUrlOpen", (e) => {
    try {
      open(new URL(e.url).searchParams);
    } catch {
      // Not a link the player understands.
    }
  });
}

/**
 * The Android back button: `back` closes whatever is open and says whether there was anything;
 * when there wasn't, the app goes into the background, as phone apps do.
 */
export function onBack(back: () => boolean): void {
  if (!native) return;
  void App.addListener("backButton", () => {
    if (!back()) void App.minimizeApp();
  });
}

/** Calls `hide` when the app goes into the background. */
export function onHide(hide: () => void): void {
  if (!native) return;
  void App.addListener("pause", hide);
}
