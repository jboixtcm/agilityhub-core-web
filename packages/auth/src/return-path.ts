/**
 * S11 R-11-11 and S01 §2 01/02 (E11-W06 W1): the address a signed-out visit asked for (an e-mail's
 * `/espera/:id`, `/reserves/:id`, `/preinscripcions/:id`) survives the sign-in. `RequireAuth` sends
 * it to 01 as `/entrar?next=…` and mirrors it here, so the magic link opened in another tab finds
 * it; it expires after 15 minutes and is consumed once.
 */
export const RETURN_PATH_STORAGE_KEY = "agilityhub.returnPath";
export const RETURN_PATH_PARAM = "next";
const RETURN_PATH_TTL_MS = 15 * 60_000;
/** The access screens themselves, and the gates the sign-in goes through: never a return path. */
const ACCESS_PATHS = [
  "/login",
  "/entrar",
  "/activacio",
  "/acces",
  "/benvinguda",
  "/perfil-acces",
  "/apuntat-hi",
  "/suport",
];

interface StoredReturnPath {
  expiresAt: number;
  path: string;
}

function storage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * A same-origin app path: one leading `/` (never `//` or a backslash, which a browser reads as
 * another host), not an access screen, not the bare root (that is the profile's landing).
 */
export function isReturnPath(path: string | null | undefined): path is string {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) return false;
  if (path.includes("\\")) return false;
  for (let index = 0; index < path.length; index += 1) {
    // A control character (a tab or a new line a browser drops) never reaches the address.
    if (path.charCodeAt(index) < 0x20) return false;
  }
  let url: URL;
  try {
    url = new URL(path, "https://return-path.invalid");
  } catch {
    return false;
  }
  if (url.origin !== "https://return-path.invalid" || url.pathname === "/") return false;
  return (
    !url.pathname.startsWith("/alta") &&
    !ACCESS_PATHS.some((access) => url.pathname === access || url.pathname.startsWith(`${access}/`))
  );
}

/** Where 01 is for a visit to `path`: `/entrar?next=<path>` when `path` may be returned to. */
export function accessPathFor(path: string): string {
  return isReturnPath(path)
    ? `/entrar?${new URLSearchParams({ [RETURN_PATH_PARAM]: path }).toString()}`
    : "/entrar";
}

/** Keeps `path` for the sign-in that follows (15 minutes); an access screen is never kept. */
export function rememberReturnPath(path: string, now: number = Date.now()): void {
  if (!isReturnPath(path)) return;
  try {
    storage()?.setItem(
      RETURN_PATH_STORAGE_KEY,
      JSON.stringify({ expiresAt: now + RETURN_PATH_TTL_MS, path } satisfies StoredReturnPath),
    );
  } catch {
    // Without storage, the `?next=` of 01 still carries it in this tab.
  }
}

/** Forgets the kept path (an ADMIN handoff to the back office, R-01-13). */
export function dropReturnPath(): void {
  try {
    storage()?.removeItem(RETURN_PATH_STORAGE_KEY);
  } catch {
    // Nothing kept.
  }
}

function storedReturnPath(now: number): string | null {
  try {
    const raw = storage()?.getItem(RETURN_PATH_STORAGE_KEY);
    if (raw === null || raw === undefined) return null;
    const value = JSON.parse(raw) as Partial<StoredReturnPath>;
    return typeof value.expiresAt === "number" && now < value.expiresAt && isReturnPath(value.path)
      ? value.path
      : null;
  } catch {
    return null;
  }
}

/**
 * The path to open after the sign-in, consumed: the `?next=` of 01's address first, then the one
 * kept for another tab, while it has not expired. `null` → the profile's landing.
 */
export function takeReturnPath(
  search: string = typeof window === "undefined" ? "" : window.location.search,
  now: number = Date.now(),
): string | null {
  const requested = new URLSearchParams(search).get(RETURN_PATH_PARAM);
  const path = isReturnPath(requested) ? requested : storedReturnPath(now);
  dropReturnPath();
  return path;
}

/**
 * 01 opened with `?next=`: the path is kept for the steps that leave 01's address before the
 * landing (the magic link's tab, onboarding, 03b), which then find it in storage.
 */
export function keepReturnPath(
  search: string = typeof window === "undefined" ? "" : window.location.search,
  now: number = Date.now(),
): void {
  const requested = new URLSearchParams(search).get(RETURN_PATH_PARAM);
  if (isReturnPath(requested)) rememberReturnPath(requested, now);
}
