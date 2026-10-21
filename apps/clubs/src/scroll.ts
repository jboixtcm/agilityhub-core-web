import { useEffect, useLayoutEffect } from "react";

import type { NavigationKind } from "./router";

/** How long a screen may take to draw what the scroll waits for (its data, a hash's target). */
const SETTLE_MS = 2_000;

/** The scroll each address was left at, for the tab's life (an address, not an entry: A38). */
const positions = new Map<string, number>();

/** The document's own address (A38's screens rewrite their query in place, `writeParam`). */
function liveAddress(): string {
  return `${window.location.pathname}${window.location.search}`;
}

function nextFrame(callback: () => void): () => void {
  if (typeof window.requestAnimationFrame === "function") {
    const frame = window.requestAnimationFrame(callback);
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }
  const timer = window.setTimeout(callback, 16);
  return () => {
    window.clearTimeout(timer);
  };
}

/** Runs `attempt` each frame until it reports done, the user scrolls, or `SETTLE_MS` passes. */
function untilSettled(attempt: () => boolean): () => void {
  const deadline = Date.now() + SETTLE_MS;
  let cancelFrame: () => void = () => undefined;
  const stop = () => {
    cancelFrame();
    for (const type of ["wheel", "touchstart", "keydown"] as const) {
      window.removeEventListener(type, stop);
    }
  };
  // The reader's own scroll wins over a restore still waiting for the screen's height.
  for (const type of ["wheel", "touchstart", "keydown"] as const) {
    window.addEventListener(type, stop, { passive: true });
  }
  const step = () => {
    if (attempt() || Date.now() >= deadline) stop();
    else cancelFrame = nextFrame(step);
  };
  step();
  return stop;
}

/** The hash's target, scrolled into view once the screen draws it (`/perfil#avisos`). */
function scrollToHash(hash: string): () => void {
  const id = decodeURIComponent(hash.slice(1));
  return untilSettled(() => {
    const target = document.getElementById(id);
    if (target === null) return false;
    target.scrollIntoView();
    return true;
  });
}

/**
 * E11-W02 round 2 (review #6): the shell stays mounted from one screen to the next (A38), so the
 * document's scroll is the app's to manage. A new screen (a link, a redirect) opens at its top, or
 * at its hash's target; Back and Forward return to where the reader left that address, once the
 * screen is tall enough again; the document's load only looks for its hash's target. `visit`
 * changes once per screen shown (`App`'s location).
 *
 * E11-W05 step 5 (c): a load (a reload of a scrolled screen) keeps the browser's own restoration. The
 * app takes it over («manual») only once it navigates, and gives it back when the page goes, so
 * the next load of that entry is the browser's again.
 */
export function useDocumentScroll(visit: number, kind: NavigationKind): void {
  useEffect(() => {
    if (!("scrollRestoration" in window.history)) return undefined;
    const browser = window.history.scrollRestoration;
    const giveBack = () => {
      window.history.scrollRestoration = browser;
    };
    window.addEventListener("pagehide", giveBack);
    return () => {
      window.removeEventListener("pagehide", giveBack);
      giveBack();
    };
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      positions.set(liveAddress(), window.scrollY);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useLayoutEffect(() => {
    const hash = window.location.hash;
    // After an in-app navigation the browser's own restore would run before the screen redraws,
    // against a shorter document.
    if (kind !== "load" && "scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    if (kind === "pop") {
      // Read before the new screen's first scroll event can overwrite it with a clamped value.
      const top = positions.get(liveAddress()) ?? 0;
      return untilSettled(() => {
        if (Math.abs(window.scrollY - top) > 1) window.scrollTo(0, top);
        return Math.abs(window.scrollY - top) <= 1;
      });
    }
    if (hash.length > 1) return scrollToHash(hash);
    if (kind !== "load") window.scrollTo(0, 0);
    return undefined;
    // `kind` comes with each `visit`: one run per screen shown, none for an in-page hash jump.
  }, [visit]);
}
