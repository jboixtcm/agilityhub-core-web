import { describe, expect, it, vi } from "vitest";

import { apiWritesInFlight, createApiClient } from "./client";
import { putSignedFile } from "./uploads";

/** A `fetch` whose answers the test sends, one per call. */
function heldFetch() {
  const pending: { reject: (error: unknown) => void; resolve: (response: Response) => void }[] = [];
  const fetchImpl = (() =>
    new Promise<Response>((resolve, reject) => {
      pending.push({ reject, resolve });
    })) as typeof fetch;
  return { fetchImpl, pending };
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });

describe("FE-07 the writes in flight, which the «new version» offer waits for", () => {
  it("counts a write from its send to its answer; a read never", async () => {
    const { fetchImpl, pending } = heldFetch();
    const client = createApiClient({
      baseUrl: "https://core.example.test/api/v1",
      fetch: fetchImpl,
    });
    expect(apiWritesInFlight()).toBe(0);

    const read = client.GET("/me");
    await vi.waitFor(() => {
      expect(pending).toHaveLength(1);
    });
    expect(apiWritesInFlight()).toBe(0);
    pending[0]?.resolve(json({}));
    await read;

    const write = client.PATCH("/me", { body: {} as never });
    await vi.waitFor(() => {
      expect(pending).toHaveLength(2);
    });
    expect(apiWritesInFlight()).toBe(1);
    pending[1]?.resolve(json({}));
    await write;
    expect(apiWritesInFlight()).toBe(0);
  });

  it("a write that fails, by a refusal or the network, is no longer in flight", async () => {
    const { fetchImpl, pending } = heldFetch();
    const client = createApiClient({
      baseUrl: "https://core.example.test/api/v1",
      fetch: fetchImpl,
    });
    const refused = client.DELETE("/saved-views/{id}", { params: { path: { id: "view-1" } } });
    const failed = client.PATCH("/me", { body: {} as never });
    await vi.waitFor(() => {
      expect(pending).toHaveLength(2);
    });
    expect(apiWritesInFlight()).toBe(2);
    pending[0]?.resolve(
      new Response(JSON.stringify({ code: "NOT_FOUND", message: "x" }), {
        headers: { "Content-Type": "application/json" },
        status: 404,
      }),
    );
    pending[1]?.reject(new TypeError("Failed to fetch"));
    await expect(refused).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(failed).rejects.toMatchObject({ status: 0 });
    expect(apiWritesInFlight()).toBe(0);
  });

  it("a signed upload is a write too", async () => {
    let answer: (response: Response) => void = () => undefined;
    const original = globalThis.fetch;
    globalThis.fetch = () =>
      new Promise<Response>((resolve) => {
        answer = resolve;
      });
    try {
      const upload = putSignedFile(
        { headers: {}, uploadUrl: "https://storage.example.test/file" },
        new Blob(["x"]),
      );
      expect(apiWritesInFlight()).toBe(1);
      answer(new Response(null, { status: 200 }));
      await upload;
      expect(apiWritesInFlight()).toBe(0);
    } finally {
      globalThis.fetch = original;
    }
  });
});
