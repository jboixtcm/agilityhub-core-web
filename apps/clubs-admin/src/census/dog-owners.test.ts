import { createApiClient } from "@agilityhub/api-client";
import { server } from "@agilityhub/api-client/mocks/server";
import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { OWNER_BATCH_SIZE, resolveDogOwners } from "./dog-owners";

/** 1,200 selected dogs, two per owner: more than one page of the api (1,000 rows). */
const SELECTED = Array.from({ length: 1200 }, (_, index) => `dog-${String(index)}`);
const ownerOf = (dogId: string) => `member-${String(Math.floor(Number(dogId.slice(4)) / 2))}`;

let requested: string[][] = [];

/** `GET /dogs?fields=id,owner&filter=id:in:…` as the api answers it, at most `size` rows. */
function serveDogs(skip: ReadonlySet<string> = new Set()) {
  server.use(
    http.get("*/api/v1/dogs", ({ request }) => {
      const url = new URL(request.url);
      const ids = (url.searchParams.get("filter") ?? "").replace(/^id:in:/u, "").split(",");
      requested.push(ids);
      const size = Number(url.searchParams.get("size") ?? "50");
      const items = ids
        .filter((id) => !skip.has(id))
        .slice(0, size)
        .map((id) => ({ id, owner: { fullName: "Persona fictícia", id: ownerOf(id) } }));
      return HttpResponse.json({
        appliedFilters: [],
        items,
        page: 0,
        size,
        totalItems: items.length,
        totalPages: 1,
      });
    }),
  );
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
  requested = [];
});
afterAll(() => {
  server.close();
});

describe("E7-W01 round 2 #6: D15's «Enviar comunicat» reads the owners of the whole selection", () => {
  it("1,200 selected dogs: read in batches of 100 ids, every dog resolved, each owner once", async () => {
    serveDogs();
    const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
    const { memberIds, missing } = await resolveDogOwners(client, SELECTED);
    expect(requested).toHaveLength(SELECTED.length / OWNER_BATCH_SIZE);
    expect(requested.every((ids) => ids.length <= OWNER_BATCH_SIZE)).toBe(true);
    expect(requested.flat()).toEqual(SELECTED);
    expect(missing).toEqual([]);
    expect(memberIds).toHaveLength(600);
    expect(new Set(memberIds).size).toBe(600);
    expect(memberIds.at(-1)).toBe("member-599");
  });

  it("a selected dog the api does not return is reported, so the audience is never silently short", async () => {
    serveDogs(new Set(["dog-1150"]));
    const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
    const { memberIds, missing } = await resolveDogOwners(client, SELECTED);
    expect(missing).toEqual(["dog-1150"]);
    // Its owner still has the other dog (1151), so the owner is kept.
    expect(memberIds).toContain("member-575");
  });
});
