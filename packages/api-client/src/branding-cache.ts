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

export async function refreshBranding(
  client: ApiClient,
  host: string,
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
): Promise<NormalizedBranding> {
  try {
    const result = await client.GET("/branding");
    if (result.data === undefined) {
      throw new TypeError("The branding response did not contain data", { cause: result.error });
    }
    const branding = normalizeBranding(result.data);
    writeCachedBranding(branding, host, storage);
    return branding;
  } catch (error) {
    const cached = readCachedBranding(host, storage);
    if (cached !== null) {
      return cached;
    }
    throw error;
  }
}
