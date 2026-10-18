import { useEffect } from "react";

/**
 * A38 (Jordi, 27-09; E11-W02 step 1): the members' app router. Every screen of `apps/clubs` is
 * drawn by `App` from `window.location`, so moving between them is a history entry plus a
 * `popstate` the app listens to — never a document load, which would renew the token and read
 * `/branding` and `/me` again (INC-07's amplifier). Links stay plain `<a href>` (a new tab, a copy
 * of the address and the e-mails' links keep working); a document-level listener takes the plain
 * clicks on them.
 */

export interface NavigateOptions {
  /** Replaces the current entry (a redirect) instead of adding one. */
  replace?: boolean;
  /** The entry's `history.state` (e.g. a `PageNotice` for the next screen). */
  state?: unknown;
}

/** The same-site proxy routes (the service worker's navigation denylist): never a screen. */
const SERVER_PATHS = [/^\/api\//u, /^\/oauth2\//u, /^\/connect\//u, /^\/\.well-known\//u];
/** A path whose last segment has an extension is a file (a PDF, an image), not a screen. */
const FILE_PATH = /\/[^/]+\.[a-z0-9]+$/iu;

function appUrl(target: string): URL | null {
  const url = new URL(target, window.location.href);
  if (url.origin !== window.location.origin) return null;
  if (SERVER_PATHS.some((pattern) => pattern.test(url.pathname))) return null;
  if (FILE_PATH.test(url.pathname)) return null;
  return url;
}

/**
 * How the app came to its current address (E11-W02 round 2, review #6): the document's load, a
 * history move (Back, Forward), or an in-app navigation that added or replaced an entry.
 */
export type NavigationKind = "load" | "pop" | "push" | "replace";

/** A `popstate` the app handles: how it came, and for `navigate`'s own, the address it left. */
export interface Navigation {
  kind: "pop" | "push" | "replace";
  /** The document's address (path and query) before `navigate` moved it; none for a pop. */
  from?: string;
}

/** The navigation `navigate` is dispatching; outside it, a `popstate` is the browser's own. */
let pending: Required<Navigation> | null = null;

/** The navigation behind the `popstate` being handled: `navigate`'s own push or replace, else a pop. */
export function takeNavigation(): Navigation {
  const navigation = pending ?? { kind: "pop" };
  pending = null;
  return navigation;
}

/** Opens `path`: in place when it is a screen of this app, as a document load otherwise. */
export function navigate(path: string, { replace = false, state = null }: NavigateOptions = {}) {
  const url = appUrl(path);
  if (url === null) {
    if (replace) window.location.replace(path);
    else window.location.assign(path);
    return;
  }
  const target = `${url.pathname}${url.search}${url.hash}`;
  const from = `${window.location.pathname}${window.location.search}`;
  if (replace) window.history.replaceState(state, "", target);
  else window.history.pushState(state, "", target);
  pending = { from, kind: replace ? "replace" : "push" };
  window.dispatchEvent(new PopStateEvent("popstate", { state }));
  pending = null;
}

/**
 * The in-app address a click on a link should open, or `null` when the browser must handle it: a
 * click a component already took, any button but the main one or with a modifier (a new tab or
 * window), a link with a `target`, `download` or `data-reload`, another origin or scheme, the
 * proxy routes, a file, or a jump inside the current page.
 */
export function inAppDestination(event: MouseEvent): string | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const origin = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!(origin instanceof HTMLAnchorElement)) return null;
  if (origin.target !== "" && origin.target !== "_self") return null;
  if (origin.hasAttribute("download") || origin.hasAttribute("data-reload")) return null;
  const href = origin.getAttribute("href") ?? "";
  const url = appUrl(href);
  if (url === null || !/^https?:$/u.test(url.protocol)) return null;
  const samePage =
    url.pathname === window.location.pathname && url.search === window.location.search;
  if (samePage && url.hash !== "") return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Takes the plain clicks on the app's links (installed once, by `App`). */
export function useInAppLinks(): void {
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const destination = inAppDestination(event);
      if (destination === null) return;
      event.preventDefault();
      // The link to the screen already open (its own tab) adds no history entry.
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      navigate(destination, { replace: destination === current });
    };
    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
    };
  }, []);
}
