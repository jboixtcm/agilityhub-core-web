import type { ApiClient } from "./client";
import type { components } from "./generated/schema";

export const BRANDING_CACHE_PREFIX = "agilityhub.branding";

type BrandingResponse = components["schemas"]["BrandingResponse"];

export function brandingCacheKey(host: string): string {
  return `${BRANDING_CACHE_PREFIX}:${host}`;
}

function isBrandingResponse(value: unknown): value is BrandingResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<BrandingResponse>;
  return (
    typeof candidate.club?.slug === "string" &&
    typeof candidate.club.name === "string" &&
    typeof candidate.theme?.colors?.primary === "string" &&
    Array.isArray(candidate.modules)
  );
}

export function readCachedBranding(
  host: string,
  storage: Pick<Storage, "getItem"> = localStorage,
): BrandingResponse | null {
  try {
    const serialized = storage.getItem(brandingCacheKey(host));
    if (serialized === null) {
      return null;
    }
    const value: unknown = JSON.parse(serialized);
    return isBrandingResponse(value) ? value : null;
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
): Promise<BrandingResponse> {
  try {
    const result = await client.GET("/branding");
    if (result.data === undefined) {
      throw new TypeError("The branding response did not contain data", { cause: result.error });
    }
    writeCachedBranding(result.data, host, storage);
    return result.data;
  } catch (error) {
    const cached = readCachedBranding(host, storage);
    if (cached !== null) {
      return cached;
    }
    throw error;
  }
}
