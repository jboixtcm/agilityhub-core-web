import { describe, expect, it } from "vitest";

import {
  normalizeBranding,
  readCachedBranding,
  refreshBranding,
  writeCachedBranding,
} from "./branding-cache";
import { createApiClient } from "./client";
import brandingCanic from "./mocks/fixtures/branding-canic.json";

type Branding = Parameters<typeof normalizeBranding>[0];

const host = "app.example.test";
const live = normalizeBranding(brandingCanic as Branding);
const cached = normalizeBranding({
  ...(brandingCanic as Branding),
  club: { ...(brandingCanic as Branding).club, name: "Club de la memòria cau" },
});

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

/** A `/branding` read that never answers until it is aborted (E7-W06 step 2's stalled read). */
function stalledClient(reads: string[]) {
  return createApiClient({
    baseUrl: "https://app.example.test/api/v1",
    fetch: (input: RequestInfo | URL) => {
      if (!(input instanceof Request)) throw new TypeError("openapi-fetch sends a Request");
      reads.push(new URL(input.url).pathname);
      return new Promise<Response>((_resolve, reject) => {
        input.signal.addEventListener("abort", () => {
          reject(input.signal.reason instanceof Error ? input.signal.reason : new Error("aborted"));
        });
      });
    },
  });
}

/** A `/branding` read that answers the live branding after `delayMs`. */
function slowClient(delayMs: number) {
  return createApiClient({
    baseUrl: "https://app.example.test/api/v1",
    fetch: () =>
      new Promise<Response>((resolve) => {
        setTimeout(() => {
          resolve(Response.json(brandingCanic));
        }, delayMs);
      }),
  });
}

describe("E7-W06 step 2 · the boot never waits forever for /branding (INC-07: the add-dog success page left blank)", () => {
  it("E7-W06 step 2: with a cached branding, a /branding read that never answers gives up after the boot's limit and the cache is used", async () => {
    const storage = memoryStorage();
    writeCachedBranding(cached, host, storage);
    const reads: string[] = [];
    const started = Date.now();
    const branding = await refreshBranding(stalledClient(reads), host, storage, {
      cachedTimeoutMs: 50,
    });
    expect(reads).toEqual(["/api/v1/branding"]);
    expect(branding.club.name).toBe("Club de la memòria cau");
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("E7-W06 step 2: without a cached branding there is nothing to fall back on, so a slow /branding is waited for and cached", async () => {
    const storage = memoryStorage();
    const branding = await refreshBranding(slowClient(120), host, storage, {
      cachedTimeoutMs: 50,
    });
    expect(branding.club.name).toBe(live.club.name);
    expect(readCachedBranding(host, storage)?.club.name).toBe(live.club.name);
  });

  it("E7-W06 step 2: an answer inside the limit wins over the cache and replaces it", async () => {
    const storage = memoryStorage();
    writeCachedBranding(cached, host, storage);
    const branding = await refreshBranding(slowClient(10), host, storage, {
      cachedTimeoutMs: 2_000,
    });
    expect(branding.club.name).toBe(live.club.name);
    expect(readCachedBranding(host, storage)?.club.name).toBe(live.club.name);
  });
});
