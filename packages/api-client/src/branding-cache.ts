import type { ApiClient } from "./client";
import type { components } from "./generated/schema";

export const BRANDING_CACHE_PREFIX = "agilityhub.branding";

type BrandingResponse = components["schemas"]["BrandingResponse"];
type BrandingClub = NonNullable<BrandingResponse["club"]>;
type BrandingLegal = NonNullable<BrandingResponse["legal"]>;
type BrandingSignup = NonNullable<BrandingResponse["signup"]>;
type BrandingTheme = NonNullable<BrandingResponse["theme"]>;
type BrandingColors = NonNullable<BrandingTheme["colors"]>;

export type NormalizedBranding = BrandingResponse & {
  club: BrandingClub & { name: string; slug: string };
  countryProfile: NonNullable<BrandingResponse["countryProfile"]>;
  currency: string;
  defaultLocale: string;
  legal: BrandingLegal & { privacyPolicyUrl: string };
  locales: string[];
  modules: string[];
  signup: BrandingSignup & { enabled: boolean };
  status: string;
  theme: BrandingTheme & {
    colors: Required<BrandingColors>;
    mode: NonNullable<BrandingTheme["mode"]>;
  };
  timeZone: string;
};

const brandingColorNames = [
  "background",
  "border",
  "danger",
  "info",
  "onPrimary",
  "primary",
  "success",
  "surface",
  "surfaceAlt",
  "text",
  "textMuted",
  "warning",
] as const satisfies readonly (keyof BrandingColors)[];

export function brandingCacheKey(host: string): string {
  return `${BRANDING_CACHE_PREFIX}:${host}`;
}

function isNormalizedBranding(value: unknown): value is NormalizedBranding {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<BrandingResponse>;
  const theme = candidate.theme;
  const colors = theme?.colors;
  return (
    typeof candidate.club?.slug === "string" &&
    typeof candidate.club.name === "string" &&
    candidate.countryProfile !== undefined &&
    typeof candidate.currency === "string" &&
    typeof candidate.defaultLocale === "string" &&
    typeof candidate.legal?.privacyPolicyUrl === "string" &&
    Array.isArray(candidate.locales) &&
    candidate.locales.every((locale) => typeof locale === "string") &&
    Array.isArray(candidate.modules) &&
    candidate.modules.every((module) => typeof module === "string") &&
    typeof candidate.signup?.enabled === "boolean" &&
    typeof candidate.status === "string" &&
    colors !== undefined &&
    brandingColorNames.every((name) => typeof colors[name] === "string") &&
    (theme?.mode === "auto" || theme?.mode === "dark" || theme?.mode === "light") &&
    typeof candidate.timeZone === "string"
  );
}

export function normalizeBranding(source: BrandingResponse): NormalizedBranding {
  if (!isNormalizedBranding(source)) {
    throw new TypeError("The branding response did not contain the required application fields");
  }
  return source;
}

export function readCachedBranding(
  host: string,
  storage: Pick<Storage, "getItem"> = localStorage,
): NormalizedBranding | null {
  try {
    const serialized = storage.getItem(brandingCacheKey(host));
    if (serialized === null) {
      return null;
    }
    const value: unknown = JSON.parse(serialized);
    return isNormalizedBranding(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeCachedBranding(
  branding: BrandingResponse,
  host: string,
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  try {
    storage.setItem(brandingCacheKey(host), JSON.stringify(branding));
  } catch {
    // Storage can be unavailable in private contexts; the live theme still applies.
  }
}

/**
 * How long an app's boot waits for the live `/branding` when it has a cached one (E7-W06 step 2):
 * past it, the app starts with the cache. A read that never answered left the add-dog success page
 * blank — never rendered, so its session was never restored (T-04-34, INC-07).
 */
export const BRANDING_BOOT_TIMEOUT_MS = 4_000;

export interface RefreshBrandingOptions {
  /**
   * With a cached branding, boot with the cache once the live read has taken this long. The read
   * goes on: its late answer is cached for the next load (E7-W07 step 1).
   */
  cachedTimeoutMs?: number;
}

/** The live `/branding`, normalised and cached. */
async function readLiveBranding(
  client: ApiClient,
  host: string,
  storage: Pick<Storage, "setItem">,
): Promise<NormalizedBranding> {
  const result = await client.GET("/branding");
  if (result.data === undefined) {
    throw new TypeError("The branding response did not contain data", { cause: result.error });
  }
  const branding = normalizeBranding(result.data);
  writeCachedBranding(branding, host, storage);
  return branding;
}

export async function refreshBranding(
  client: ApiClient,
  host: string,
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
  options: RefreshBrandingOptions = {},
): Promise<NormalizedBranding> {
  const cached = options.cachedTimeoutMs === undefined ? null : readCachedBranding(host, storage);
  const live = readLiveBranding(client, host, storage);
  // Without a cache there is nothing to fall back on: the read is waited for as before.
  if (cached === null) {
    try {
      return await live;
    } catch (error) {
      const fallback = readCachedBranding(host, storage);
      if (fallback !== null) return fallback;
      throw error;
    }
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<"late">((resolve) => {
    timer = setTimeout(() => {
      resolve("late");
    }, options.cachedTimeoutMs);
  });
  try {
    const first = await Promise.race([live, limit]);
    if (first !== "late") return first;
    // Past the limit the page boots with the cache and keeps it (E7-W06 review #2). The read is not
    // given up: its answer replaces the cache for the next load; a failure leaves the cache as is.
    void live.catch(() => undefined);
    return cached;
  } catch {
    return readCachedBranding(host, storage) ?? cached;
  } finally {
    clearTimeout(timer);
  }
}
