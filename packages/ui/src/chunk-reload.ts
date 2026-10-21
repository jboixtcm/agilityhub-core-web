/**
 * E11-W02 round 2 (review #4): since A38 a tab outlives a deploy, and the service worker drops the
 * old build's files, so the tab's next `import()` of a screen's chunk can find it gone. Such a
 * failure is a stale document, not a broken screen: one reload fetches the new build's chunks.
 * Shared by both apps since round 3 (the back office's lazy console and courses chunks).
 */
const CHUNK_LOAD_ERRORS = [
  /Failed to fetch dynamically imported module/u,
  /Importing a module script failed/u,
  /error loading dynamically imported module/u,
  /Unable to preload CSS/u,
];

const RELOADED_AT_KEY = "agilityhub.chunkReloadAt";
/** A chunk still missing after a reload is not fixed by another one: no reload loop. */
const RELOAD_WINDOW_MS = 60_000;

/**
 * A browser's error for a module that could not be fetched (Chromium, Safari, Firefox, Vite), or
 * a loader's error that wraps one as its `cause`.
 */
export function isChunkLoadError(error: unknown): boolean {
  for (let current = error, depth = 0; current instanceof Error && depth < 5; depth += 1) {
    const { message } = current;
    if (CHUNK_LOAD_ERRORS.some((pattern) => pattern.test(message))) return true;
    current = current.cause;
  }
  return false;
}

/** The document's reload, on its own so that a test can watch it. */
export function reloadDocument(): void {
  window.location.reload();
}

function sessionStore(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

/** Reloads unless this tab already reloaded for a missing chunk within the last minute. */
export function reloadOnce(reload: () => void = reloadDocument): boolean {
  const storage = sessionStore();
  const now = Date.now();
  let last = 0;
  try {
    last = Number(storage?.getItem(RELOADED_AT_KEY) ?? 0);
  } catch {
    last = 0;
  }
  if (now - last < RELOAD_WINDOW_MS) return false;
  try {
    storage?.setItem(RELOADED_AT_KEY, String(now));
  } catch {
    // Without storage the window cannot be kept: reload all the same, once per failure.
  }
  reload();
  return true;
}
