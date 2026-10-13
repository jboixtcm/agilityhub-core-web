import { describe, expect, it, vi } from "vitest";

import { createApiClient } from "./client";
import { CoreApiStore } from "./core-api-store";

const venue = {
  id: "club-1",
  name: "Club test",
  slug: "test",
};

function requestAt(requests: readonly Request[], index: number): Request {
  const request = requests[index];
  if (request === undefined) throw new Error(`MISSING_REQUEST:${String(index)}`);
  return request;
}

async function requestJson(request: Request): Promise<unknown> {
  return (await request.clone().json()) as unknown;
}

describe("CoreApiStore implements PlannerStore", () => {
  it("R-16-04 rebases only edited doors on the latest geometry version", async () => {
    const requests: Request[] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const request = input instanceof Request ? input : new Request(input);
      requests.push(request);
      if (request.method === "GET") {
        return Promise.resolve(Response.json({
          borderClearanceM: 1,
          doors: [],
          lengthM: 40,
          markers: [
            {
              aprilTagId: 1,
              id: "m1",
              isActive: true,
              isFixed: true,
              label: "A",
              markerUid: "marker-a",
              physicalHeightM: 0.16,
              physicalWidthM: 0.16,
              role: "reference",
              rotationYDeg: 0,
              xM: 1,
              yM: 1,
              zM: 0,
            },
          ],
          noGoZones: [],
          notes: null,
          orientationDeg: null,
          surface: "GRASS",
          updatedAt: "2026-10-13T10:00:00Z",
          version: 7,
          widthM: 20,
        }));
      }
      return Promise.resolve(Response.json({
        borderClearanceM: 1,
        doors: [],
        lengthM: 40,
        markers: [],
        noGoZones: [],
        notes: null,
        orientationDeg: null,
        surface: "GRASS",
        updatedAt: "2026-10-13T10:00:01Z",
        version: 8,
        widthM: 20,
      }));
    });
    const store = new CoreApiStore({
      client: createApiClient({ baseUrl: "https://core.test", fetch: fetchMock }),
      venue,
    });

    await store.updateRingDoors("ring-1", [
      {
        clearanceMeters: 0.5,
        endMeters: 4,
        flow: "both",
        isActive: true,
        label: "Access",
        side: "north",
        startMeters: 2,
      },
    ]);

    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual(
      ["GET /rings/ring-1/geometry", "PUT /rings/ring-1/geometry"],
    );
    expect(await requestJson(requestAt(requests, 1))).toMatchObject({
      doors: [expect.objectContaining({ label: "Access" })],
      markers: [{ id: "m1" }],
      version: 7,
    });
  });

  it("R-16-12 writes ring inventory with the published scope shape", async () => {
    const requests: Request[] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const request = input instanceof Request ? input : new Request(input);
      requests.push(request);
      return Promise.resolve(Response.json({
        items: [{ count: 12, type: "Jump" }],
        ringId: "ring-1",
        scope: "RING",
        updatedAt: "2026-10-13T10:00:00Z",
      }));
    });
    const store = new CoreApiStore({
      client: createApiClient({ baseUrl: "https://core.test", fetch: fetchMock }),
      venue,
    });

    const result = await store.updateRingInventory("ring-1", [
      { obstacle_type: "Jump", quantity: 12 },
    ]);

    expect(decodeURIComponent(new URL(requestAt(requests, 0).url).pathname)).toBe(
      "/obstacle-inventories/ring:ring-1",
    );
    expect(await requestJson(requestAt(requests, 0))).toEqual({
      items: [{ count: 12, type: "Jump" }],
    });
    expect(result.obstacle_inventory).toEqual([{ obstacle_type: "Jump", quantity: 12 }]);
  });

  it("R-16-11 keeps the caller's opaque Idempotency-Key for one build-session payload", async () => {
    const requests: Request[] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const request = input instanceof Request ? input : new Request(input);
      requests.push(request);
      return Promise.resolve(Response.json({
        buildSheetFileKey: null,
        finishedAt: null,
        id: "build-1",
        joinCode: "ABC123",
        joinToken: null,
        joinTokenRotatedAt: null,
        lastKnownMarkerId: null,
        live: true,
        localCacheVersion: 0,
        obstacles: [],
        participants: [],
        placementId: "placement-1",
        ringId: "ring-1",
        selectedStrategy: "FREE_BUILD",
        startedAt: null,
        startedByAccountId: "account-1",
        status: "NOT_STARTED",
        version: 0,
      }));
    });
    const store = new CoreApiStore({
      client: createApiClient({ baseUrl: "https://core.test", fetch: fetchMock }),
      venue,
    });
    const submissionKey = "40000000-0000-4000-8000-000000000016";

    await store.createBuildSession({
      live: true,
      placementId: "placement-1",
      submissionKey,
    });

    expect(requestAt(requests, 0).headers.get("Idempotency-Key")).toBe(submissionKey);
    expect(await requestJson(requestAt(requests, 0))).toEqual({
      live: true,
      placementId: "placement-1",
    });
  });
});
