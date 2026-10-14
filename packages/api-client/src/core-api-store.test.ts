import { describe, expect, it, vi } from "vitest";

import { CoreApiStore } from "@agilityhub/api-client/core-api-store";

import { createApiClient } from "./client";

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
        return Promise.resolve(
          Response.json({
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
          }),
        );
      }
      return Promise.resolve(
        Response.json({
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
        }),
      );
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
      const path = new URL(request.url).pathname;
      if (path === "/rings/ring-1") {
        return Promise.resolve(Response.json({ active: true, id: "ring-1", name: "Main ring" }));
      }
      if (path === "/rings/ring-1/geometry") {
        return Promise.resolve(
          Response.json({
            borderClearanceM: 1,
            doors: [],
            lengthM: 40,
            markers: [],
            noGoZones: [],
            notes: null,
            orientationDeg: null,
            surface: "GRASS",
            updatedAt: "2026-10-13T10:00:00Z",
            version: 2,
            widthM: 20,
          }),
        );
      }
      return Promise.resolve(
        Response.json({
          items: [{ count: 12, type: "Jump" }],
          ringId: "ring-1",
          scope: "RING",
          updatedAt: "2026-10-13T10:00:00Z",
        }),
      );
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
    expect(result).toMatchObject({ length_m: 40, width_m: 20 });
    expect(result.obstacle_inventory).toEqual([{ obstacle_type: "Jump", quantity: 12 }]);
  });

  it("R-16-11 keeps the caller's opaque Idempotency-Key for one build-session payload", async () => {
    const requests: Request[] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const request = input instanceof Request ? input : new Request(input);
      requests.push(request);
      return Promise.resolve(
        Response.json({
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
        }),
      );
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

  it("R-16-04 rebases only the edited marker on the latest geometry", async () => {
    const requests: Request[] = [];
    const geometry = {
      borderClearanceM: 1,
      doors: [],
      lengthM: 40,
      markers: [
        {
          aprilTagId: 1,
          id: "marker-1",
          isActive: true,
          isFixed: true,
          label: "A",
          markerUid: "marker-a",
          notes: null,
          physicalHeightM: 0.16,
          physicalWidthM: 0.16,
          role: "reference",
          rotationYDeg: 0,
          xM: 1,
          yM: 2,
          zM: 0,
        },
        {
          aprilTagId: null,
          id: "marker-2",
          isActive: true,
          isFixed: false,
          label: "B",
          markerUid: "marker-b",
          notes: "untouched",
          physicalHeightM: 0.16,
          physicalWidthM: 0.16,
          role: "redundant",
          rotationYDeg: 5,
          xM: 3,
          yM: 4,
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
    } as const;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const request = input instanceof Request ? input : new Request(input);
      requests.push(request);
      if (request.method === "GET") return Response.json(geometry);
      const body = (await request.clone().json()) as typeof geometry;
      return Response.json({ ...geometry, ...body, updatedAt: "2026-10-13T10:00:01Z", version: 8 });
    });
    const store = new CoreApiStore({
      client: createApiClient({ baseUrl: "https://core.test", fetch: fetchMock }),
      venue,
    });

    const saved = await store.updateMarker("ring-1", "marker-1", {
      label: "C",
      xMeters: 1.5,
    });

    expect(saved).toMatchObject({ id: "marker-1", label: "C", x_m: 1.5, y_m: 2 });
    expect(await requestJson(requestAt(requests, 1))).toMatchObject({
      markers: [
        expect.objectContaining({ id: "marker-1", label: "C", xM: 1.5, yM: 2 }),
        expect.objectContaining({
          aprilTagId: null,
          id: "marker-2",
          notes: "untouched",
          xM: 3,
          yM: 4,
        }),
      ],
      version: 7,
    });
  });

  it("R-16-04 creates and lists calibration logs with the published nulls", async () => {
    const requests: Request[] = [];
    const calibration = {
      appVersion: null,
      arProvider: null,
      averageErrorCm: 1.25,
      createdAt: "2026-10-13T10:00:00Z",
      createdByAccountId: "account-1",
      deviceModel: null,
      id: "calibration-1",
      markerCount: 4,
      maxErrorCm: 2.5,
      notes: null,
      osVersion: null,
      outcome: "GREEN",
      rawMetadata: {},
      ringId: "ring-1",
    } as const;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const request = input instanceof Request ? input : new Request(input);
      requests.push(request);
      return Promise.resolve(Response.json(request.method === "GET" ? [calibration] : calibration));
    });
    const store = new CoreApiStore({
      client: createApiClient({ baseUrl: "https://core.test", fetch: fetchMock }),
      venue,
    });

    const listed = await store.listCalibrationLogs("ring-1");
    const created = await store.createCalibrationLog({
      averageErrorCm: 1.25,
      markerCount: 4,
      maxErrorCm: 2.5,
      notes: null,
      outcome: "GREEN",
      ringId: "ring-1",
    });

    expect(listed).toEqual([calibration]);
    expect(created).toEqual(calibration);
    expect(await requestJson(requestAt(requests, 1))).toEqual({
      appVersion: null,
      arProvider: null,
      averageErrorCm: 1.25,
      deviceModel: null,
      markerCount: 4,
      maxErrorCm: 2.5,
      notes: null,
      osVersion: null,
      outcome: "GREEN",
      rawMetadata: {},
    });
  });

  it("R-16-05 lists calendar placements with only the filters published by the core", async () => {
    const requests: Request[] = [];
    const placement = {
      activityId: null,
      buildSheetFileKey: null,
      classSessionIds: [],
      courseId: "course-1",
      courseVersion: 2,
      createdAt: "2026-10-13T09:00:00Z",
      createdByAccountId: "account-1",
      displayName: null,
      grades: [],
      id: "placement-1",
      mode: "FREE_FLOATING",
      name: null,
      placementMode: "CENTERED",
      resolvedObstacles: [],
      ringId: "ring-1",
      scheduledAt: null,
      sizes: [],
      stale: false,
      status: "READY_TO_BUILD",
      transform: { flipX: false, flipY: false, offsetXM: 0, offsetYM: 0, rotationDeg: 0 },
      updatedAt: "2026-10-13T09:00:00Z",
      version: 1,
      warningThresholdM: 0.5,
      warnings: [],
    } as const;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const request = input instanceof Request ? input : new Request(input);
      requests.push(request);
      return Promise.resolve(Response.json([placement]));
    });
    const store = new CoreApiStore({
      client: createApiClient({ baseUrl: "https://core.test", fetch: fetchMock }),
      venue,
    });

    const result = await store.listCalendarPlacements({
      activityId: "activity-1",
      courseId: "course-1",
      ringId: "ring-1",
    });

    expect(Object.fromEntries(new URL(requestAt(requests, 0).url).searchParams)).toEqual({
      activityId: "activity-1",
      courseId: "course-1",
      ringId: "ring-1",
    });
    expect(result).toEqual([
      expect.objectContaining({
        activityId: null,
        displayName: null,
        id: "placement-1",
        scheduledAt: null,
      }),
    ]);
  });

  it("R-16-11 reads a build snapshot after an obstacle update and sends its version", async () => {
    const requests: Request[] = [];
    const session = {
      buildSheetFileKey: null,
      finishedAt: null,
      id: "build-1",
      joinCode: "ABC123",
      joinToken: null,
      joinTokenRotatedAt: null,
      lastKnownMarkerId: null,
      live: true,
      localCacheVersion: 0,
      obstacles: [
        {
          at: null,
          byAccountId: null,
          lastUpdatedClientSessionId: null,
          obstacleId: "obstacle-1",
          status: "NOT_PLACED",
        },
      ],
      participants: [],
      placementId: "placement-1",
      progressJson: {},
      ringId: "ring-1",
      selectedStrategy: "FREE_BUILD",
      startedAt: null,
      startedByAccountId: "account-1",
      status: "IN_PROGRESS",
      version: 3,
    } as const;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const request = input instanceof Request ? input : new Request(input);
      requests.push(request);
      if (request.method === "GET") return Promise.resolve(Response.json(session));
      return Promise.resolve(
        Response.json({
          ...session,
          obstacles: [{ ...session.obstacles[0], status: "PLACED" }],
          version: 4,
        }),
      );
    });
    const store = new CoreApiStore({
      client: createApiClient({ baseUrl: "https://core.test", fetch: fetchMock }),
      venue,
    });

    const saved = await store.upsertBuildObstacleStatus({
      buildSessionId: "build-1",
      obstacleId: "obstacle-1",
      status: "PLACED",
      version: 3,
    });
    const snapshot = await store.listBuildObstacleStatuses("build-1");

    expect(saved).toMatchObject({ obstacleId: "obstacle-1", status: "PLACED" });
    expect(snapshot).toEqual([
      expect.objectContaining({ obstacleId: "obstacle-1", status: "NOT_PLACED" }),
    ]);
    expect(await requestJson(requestAt(requests, 0))).toEqual({ status: "PLACED", version: 3 });
    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual(
      ["PATCH /build-sessions/build-1/obstacles/obstacle-1", "GET /build-sessions/build-1"],
    );
  });

  it("R-16-11 exposes the authenticated SSE transport and its cleanup through PlannerStore", () => {
    const cleanup = vi.fn();
    const subscribeBuildEvents = vi.fn(() => cleanup);
    const onObstacle = vi.fn();
    const store = new CoreApiStore({ subscribeBuildEvents, venue });

    const unsubscribe = store.subscribeBuildObstacleStatuses("build-1", onObstacle);
    unsubscribe();

    expect(subscribeBuildEvents).toHaveBeenCalledWith("build-1", onObstacle);
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
