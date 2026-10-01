import { describe, expect, it, vi } from "vitest";

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

/** A `/branding` read that never answers (E7-W06 step 2's stalled read), unless it is aborted. */
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

/** A `/branding` read the test answers (or fails) when it wants, recording an abort. */
function deferredClient() {
  let resolveFetch: (response: Response) => void = () => undefined;
  let rejectFetch: (reason: unknown) => void = () => undefined;
  let signal: AbortSignal | undefined;
  const response = new Promise<Response>((resolve, reject) => {
    resolveFetch = resolve;
    rejectFetch = reject;
  });
  const client = createApiClient({
    baseUrl: "https://app.example.test/api/v1",
    fetch: (input: RequestInfo | URL) => {
      if (!(input instanceof Request)) throw new TypeError("openapi-fetch sends a Request");
      signal = input.signal;
      input.signal.addEventListener("abort", () => {
        rejectFetch(input.signal.reason);
      });
      return response;
    },
  });
  return {
    aborted: () => signal?.aborted === true,
    answer: (value: Response) => {
      resolveFetch(value);
    },
    client,
    fail: (reason: unknown) => {
      rejectFetch(reason);
    },
    settled: () =>
      response.then(
        () => undefined,
        () => undefined,
      ),
  };
}

describe("T-02-14 E7-W06 step 2 · the boot never waits forever for /branding (INC-07: the add-dog success page left blank)", () => {
  it("E7-W06 step 2: with a cached branding, a /branding read that never answers no longer holds the boot: past the boot's limit the cache is used", async () => {
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

  it("E7-W07 step 1 (E7-W06 review #2): past the boot's limit the page boots with the cache, but the read is not given up: its late answer is cached, so the next load starts fresh", async () => {
    const storage = memoryStorage();
    writeCachedBranding(cached, host, storage);
    const late = deferredClient();
    const branding = await refreshBranding(late.client, host, storage, { cachedTimeoutMs: 20 });
    // The running page keeps what it booted with.
    expect(branding.club.name).toBe("Club de la memòria cau");
    expect(late.aborted()).toBe(false);
    late.answer(Response.json(brandingCanic));
    await vi.waitFor(() => {
      expect(readCachedBranding(host, storage)?.club.name).toBe(live.club.name);
    });
    expect(branding.club.name).toBe("Club de la memòria cau");
  });

  it("E7-W07 step 1: a late failure of that read (an error status, a broken body, a lost connection) leaves the cache as it was, and nothing is thrown at the page", async () => {
    const unhandled: unknown[] = [];
    const listener = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", listener);
    try {
      for (const failure of [
        (late: ReturnType<typeof deferredClient>) => {
          late.answer(
            Response.json(
              { code: "INTERNAL_ERROR", details: {}, message: "boom", traceId: "t-503" },
              { status: 503 },
            ),
          );
        },
        (late: ReturnType<typeof deferredClient>) => {
          late.answer(Response.json({ club: { name: "half" } }));
        },
        (late: ReturnType<typeof deferredClient>) => {
          late.fail(new TypeError("Failed to fetch"));
        },
      ]) {
        const storage = memoryStorage();
        writeCachedBranding(cached, host, storage);
        const late = deferredClient();
        const branding = await refreshBranding(late.client, host, storage, {
          cachedTimeoutMs: 20,
        });
        expect(branding.club.name).toBe("Club de la memòria cau");
        failure(late);
        await late.settled();
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(readCachedBranding(host, storage)).toEqual(cached);
      }
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", listener);
    }
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
