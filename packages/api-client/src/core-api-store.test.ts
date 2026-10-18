import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CoreApiStore } from "@agilityhub/api-client/core-api-store";

import { createBuildEventsSubscriber, type SubscribeBuildEvents } from "./build-events";
import { createApiClient } from "./client";
import { createFakeCoreApi, type FakeCoreApi } from "./core-api-store.fake";

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
  it("R-16-04 replaces the doors under the geometry version the user edited, keeping the markers", async () => {
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

    await store.updateRingDoors(
      "ring-1",
      [
        {
          clearanceMeters: 0.5,
          endMeters: 4,
          flow: "both",
          isActive: true,
          label: "Access",
          side: "north",
          startMeters: 2,
        },
      ],
      7,
    );

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

  it("R-16-16 E9-T07: getRing has no catalog fallback after GET /rings/{id} allows INSTRUCTOR", async () => {
    const requests: string[] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const request = input instanceof Request ? input : new Request(input);
      const url = new URL(request.url);
      requests.push(`${request.method} ${decodeURIComponent(url.pathname)}${url.search}`);
      if (url.pathname === "/rings/ring-1") {
        return Promise.resolve(
          Response.json(
            { code: "FORBIDDEN", details: {}, message: "Forbidden", traceId: "t" },
            { status: 403 },
          ),
        );
      }
      if (url.pathname === "/rings") {
        return Promise.resolve(
          Response.json({
            items: [
              {
                active: true,
                allowsFreeTraining: true,
                color: "var(--ah-color-primary)",
                effectiveTrainingCapacity: 3,
                id: "ring-1",
                name: "Muntanya",
                order: 1,
                shortName: "MUN",
                version: 1,
              },
            ],
          }),
        );
      }
      if (url.pathname === "/rings/ring-1/geometry") {
        return Promise.resolve(
          Response.json({
            borderClearanceM: 1,
            doors: [],
            lengthM: 40,
            markers: [
              {
                aprilTagId: 101,
                id: "m-a",
                isActive: true,
                isFixed: true,
                label: "A",
                markerUid: "muntanya-a",
                physicalHeightM: 0.2,
                physicalWidthM: 0.2,
                role: "reference",
                rotationYDeg: 0,
                xM: 0,
                yM: 0,
                zM: 0,
              },
            ],
            noGoZones: [],
            notes: null,
            orientationDeg: null,
            surface: null,
            updatedAt: "2026-10-16T10:00:00Z",
            version: 1,
            widthM: 20,
          }),
        );
      }
      return Promise.resolve(
        Response.json(
          { code: "NOT_FOUND", details: {}, message: "No inventory", traceId: "t" },
          { status: 404 },
        ),
      );
    });
    const store = new CoreApiStore({
      client: createApiClient({ baseUrl: "https://core.test", fetch: fetchMock }),
      venue,
    });

    await expect(store.getRing("ring-1")).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    expect(requests).toEqual(["GET /rings/ring-1"]);
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
    const subscribeBuildEvents = vi.fn<SubscribeBuildEvents>(() => cleanup);
    const store = new CoreApiStore({ subscribeBuildEvents, venue });

    const unsubscribe = store.subscribeBuildObstacleStatuses("build-1", vi.fn());
    unsubscribe();

    expect(subscribeBuildEvents).toHaveBeenCalledWith("build-1", expect.any(Function), {
      onFinished: expect.any(Function) as unknown,
      onOpened: expect.any(Function) as unknown,
    });
    expect(cleanup).toHaveBeenCalledOnce();
  });
});

const LATER = "2026-10-15T09:05:00Z";

function buildStoreOn(
  api: FakeCoreApi,
  options: { fetch?: typeof globalThis.fetch; subscribeBuildEvents?: SubscribeBuildEvents } = {},
): CoreApiStore {
  return new CoreApiStore({
    client: createApiClient({ baseUrl: "https://core.test", fetch: options.fetch ?? api.fetch }),
    ...(options.subscribeBuildEvents === undefined
      ? {}
      : { subscribeBuildEvents: options.subscribeBuildEvents }),
    venue,
  });
}

function sessionReads(api: FakeCoreApi): number {
  return api.requests.filter(
    (request) => request.method === "GET" && request.path === "/build-sessions/session-1",
  ).length;
}

describe("INC-60 / R-16-11: the build session's live updates without a configured stream (polling)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("T-16-10 R-16-11 INC-60 polls GET /build-sessions/{id} every 2 s and emits only the obstacles another phone changed", async () => {
    const api = createFakeCoreApi();
    const store = buildStoreOn(api);
    await store.getBuildSession("session-1");
    const onChange = vi.fn();
    const onSession = vi.fn();

    store.subscribeBuildObstacleStatuses("session-1", onChange, { onSession });
    api.tapElsewhere("obstacle-2", "PLACED");
    await vi.advanceTimersByTimeAsync(1999);
    expect(sessionReads(api)).toBe(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(sessionReads(api)).toBe(2);
    expect(onChange.mock.calls).toEqual([
      [
        {
          at: LATER,
          byAccountId: "account-other",
          lastUpdatedClientSessionId: null,
          obstacleId: "obstacle-2",
          status: "PLACED",
        },
      ],
    ]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(sessionReads(api)).toBe(3);
    expect(onChange).toHaveBeenCalledOnce();
    // The status did not change: the page already knows the session.
    expect(onSession).not.toHaveBeenCalled();
  });

  it("INC-60 without a remembered session the first poll is the baseline (no obstacle emitted)", async () => {
    const api = createFakeCoreApi();
    const store = buildStoreOn(api);
    const onChange = vi.fn();
    const onSession = vi.fn();

    store.subscribeBuildObstacleStatuses("session-1", onChange, { onSession });
    await vi.advanceTimersByTimeAsync(2000);
    expect(onChange).not.toHaveBeenCalled();
    expect(onSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: "session-1", status: "IN_PROGRESS" }),
    );

    api.tapElsewhere("obstacle-3", "SKIPPED");
    await vi.advanceTimersByTimeAsync(2000);
    expect(onChange.mock.calls).toEqual([
      [expect.objectContaining({ obstacleId: "obstacle-3", status: "SKIPPED" })],
    ]);
  });

  it("R-16-11 the phone's own tap does not swallow another phone's change made meanwhile", async () => {
    const api = createFakeCoreApi();
    const store = buildStoreOn(api);
    await store.getBuildSession("session-1");
    const onChange = vi.fn();

    store.subscribeBuildObstacleStatuses("session-1", onChange);
    api.tapElsewhere("obstacle-3", "PLACED");
    // The PATCH answer carries the whole session, the other phone's tap included.
    await store.upsertBuildObstacleStatus({
      buildSessionId: "session-1",
      obstacleId: "obstacle-2",
      status: "CURRENT",
    });
    await vi.advanceTimersByTimeAsync(2000);

    expect(onChange.mock.calls).toEqual([
      [expect.objectContaining({ byAccountId: "account-other", obstacleId: "obstacle-3" })],
    ]);
  });

  it("INC-60 a poll never overlaps the previous one, and a failed poll is skipped", async () => {
    const api = createFakeCoreApi();
    let gate: (() => void) | null = null;
    let reads = 0;
    const store = buildStoreOn(api, {
      fetch: async (input, init) => {
        reads += 1;
        if (reads === 2) await new Promise<void>((resolve) => (gate = resolve));
        return api.fetch(input, init);
      },
    });
    await store.getBuildSession("session-1");
    const onChange = vi.fn();

    store.subscribeBuildObstacleStatuses("session-1", onChange);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(reads).toBe(2); // the second read hangs: no other poll starts meanwhile
    api.loseNextAnswer("GET", "/build-sessions/session-1");
    (gate as (() => void) | null)?.();
    await vi.advanceTimersByTimeAsync(0);
    api.tapElsewhere("obstacle-2", "NEEDS_CHECK");
    await vi.advanceTimersByTimeAsync(2000);

    expect(reads).toBe(3);
    expect(onChange.mock.calls).toEqual([
      [expect.objectContaining({ obstacleId: "obstacle-2", status: "NEEDS_CHECK" })],
    ]);
  });

  it("INC-60 cleanup stops the polling", async () => {
    const api = createFakeCoreApi();
    const store = buildStoreOn(api);
    await store.getBuildSession("session-1");

    const unsubscribe = store.subscribeBuildObstacleStatuses("session-1", vi.fn());
    await vi.advanceTimersByTimeAsync(2000);
    unsubscribe();
    await vi.advanceTimersByTimeAsync(20_000);

    expect(sessionReads(api)).toBe(2);
  });

  it("T-16-10 R-16-11 a session closed by another phone reaches onSession with its setupId and the polling stops", async () => {
    const api = createFakeCoreApi();
    const store = buildStoreOn(api);
    await store.getBuildSession("session-1");
    const onSession = vi.fn();

    store.subscribeBuildObstacleStatuses("session-1", vi.fn(), { onSession });
    api.closeElsewhere("COMPLETED");
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(20_000);

    expect(onSession.mock.calls).toEqual([
      [
        expect.objectContaining({
          finishedAt: "2026-10-15T09:00:00Z",
          setupId: "setup-1",
          status: "COMPLETED",
        }),
      ],
    ]);
    expect(sessionReads(api)).toBe(2);
  });

  it("INC-60 a stream that cannot open (no EventSource) falls back to polling", async () => {
    const api = createFakeCoreApi();
    const store = buildStoreOn(api, {
      subscribeBuildEvents: () => {
        throw new Error("BUILD_EVENTS_UNSUPPORTED");
      },
    });
    await store.getBuildSession("session-1");
    const onChange = vi.fn();

    store.subscribeBuildObstacleStatuses("session-1", onChange);
    api.tapElsewhere("obstacle-2", "PLACED");
    await vi.advanceTimersByTimeAsync(2000);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ obstacleId: "obstacle-2", status: "PLACED" }),
    );
  });
});

describe("R-16-11: the build session's live updates through the event stream", () => {
  function captureTransport() {
    const captured: {
      onObstacle?: Parameters<SubscribeBuildEvents>[1];
      handlers?: Parameters<SubscribeBuildEvents>[2];
    } = {};
    const cleanup = vi.fn();
    const subscribeBuildEvents: SubscribeBuildEvents = (_id, onObstacle, handlers) => {
      captured.onObstacle = onObstacle;
      captured.handlers = handlers;
      return cleanup;
    };
    const obstacle = (event: Parameters<Parameters<SubscribeBuildEvents>[1]>[0]) => {
      captured.onObstacle?.(event);
    };
    return { captured, cleanup, obstacle, subscribeBuildEvents };
  }

  it("T-16-10 R-16-11 an obstacle event is emitted; after a reconnection the store reads the session again and emits what it missed", async () => {
    const api = createFakeCoreApi();
    const transport = captureTransport();
    const store = buildStoreOn(api, { subscribeBuildEvents: transport.subscribeBuildEvents });
    await store.getBuildSession("session-1");
    const onChange = vi.fn();

    store.subscribeBuildObstacleStatuses("session-1", onChange);
    api.tapElsewhere("obstacle-2", "CURRENT");
    transport.obstacle({
      at: LATER,
      byAccountId: "account-other",
      obstacleId: "obstacle-2",
      sessionId: "session-1",
      status: "CURRENT",
      version: 5,
    });
    expect(onChange.mock.calls).toEqual([
      [
        {
          at: LATER,
          byAccountId: "account-other",
          lastUpdatedClientSessionId: null,
          obstacleId: "obstacle-2",
          status: "CURRENT",
        },
      ],
    ]);

    // Missed while the stream was down (no replay after a reconnection).
    api.tapElsewhere("obstacle-3", "PLACED");
    transport.captured.handlers?.onOpened();
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(2);
    });

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ obstacleId: "obstacle-3", status: "PLACED" }),
    );
    expect(sessionReads(api)).toBe(2);
  });

  it("T-16-10 R-16-11 a change made before the stream first opens is read once the stream opens", async () => {
    const api = createFakeCoreApi();
    const sources: { url: string; emit: (type: string) => void }[] = [];
    class FakeSource {
      readonly #listeners = new Map<string, ((event: Event) => void)[]>();
      constructor(readonly url: string) {
        sources.push({
          emit: (type) => {
            for (const listener of this.#listeners.get(type) ?? []) listener(new Event(type));
          },
          url,
        });
      }
      addEventListener(type: string, listener: (event: Event) => void): void {
        this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), listener]);
      }
      close(): void {
        this.#listeners.clear();
      }
    }
    const store = buildStoreOn(api, {
      subscribeBuildEvents: createBuildEventsSubscriber({
        EventSourceImpl: FakeSource,
        eventsUrl: (id) => `https://core.test/build-sessions/${id}/events`,
        getAccessToken: () => "token-1",
      }),
    });
    await store.getBuildSession("session-1");
    const onChange = vi.fn();

    store.subscribeBuildObstacleStatuses("session-1", onChange);
    // Another phone taps between the page's GET and the stream's first open: not on the stream.
    api.tapElsewhere("obstacle-2", "PLACED");
    sources[0]?.emit("open");
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalledOnce();
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ byAccountId: "account-other", obstacleId: "obstacle-2" }),
    );
    expect(sessionReads(api)).toBe(2);
  });

  it("R-16-11 an event newer than a re-read wins over the re-read", async () => {
    const api = createFakeCoreApi();
    const transport = captureTransport();
    const store = buildStoreOn(api, { subscribeBuildEvents: transport.subscribeBuildEvents });
    await store.getBuildSession("session-1");
    const onChange = vi.fn();

    store.subscribeBuildObstacleStatuses("session-1", onChange);
    transport.obstacle({
      at: LATER,
      byAccountId: "account-other",
      obstacleId: "obstacle-1",
      sessionId: "session-1",
      status: "NEEDS_CHECK",
      version: 7,
    });
    // The api's state is older (version 5) than that event for obstacle-1.
    api.tapElsewhere("obstacle-3", "PLACED");
    transport.captured.handlers?.onOpened();
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(2);
    });

    expect(onChange.mock.calls).toEqual([
      [expect.objectContaining({ obstacleId: "obstacle-1", status: "NEEDS_CHECK" })],
      [expect.objectContaining({ obstacleId: "obstacle-3", status: "PLACED" })],
    ]);
  });

  it("T-16-10 R-16-11 finished → the store reads the session and onSession carries setupId and finishedAt", async () => {
    const api = createFakeCoreApi();
    const transport = captureTransport();
    const store = buildStoreOn(api, { subscribeBuildEvents: transport.subscribeBuildEvents });
    await store.getBuildSession("session-1");
    const onSession = vi.fn();

    store.subscribeBuildObstacleStatuses("session-1", vi.fn(), { onSession });
    api.closeElsewhere("COMPLETED");
    transport.captured.handlers?.onFinished({
      finishedAt: "2026-10-15T09:00:00Z",
      sessionId: "session-1",
      status: "COMPLETED",
      version: 5,
    });
    await vi.waitFor(() => {
      expect(onSession).toHaveBeenCalledOnce();
    });

    expect(onSession).toHaveBeenCalledWith(
      expect.objectContaining({
        finishedAt: "2026-10-15T09:00:00Z",
        setupId: "setup-1",
        status: "COMPLETED",
      }),
    );
  });

  it("R-16-11 an outlived session's finished {ABANDONED} is reported even while GET still reads it open", async () => {
    const api = createFakeCoreApi();
    const transport = captureTransport();
    const store = buildStoreOn(api, { subscribeBuildEvents: transport.subscribeBuildEvents });
    await store.getBuildSession("session-1");
    const onSession = vi.fn();

    store.subscribeBuildObstacleStatuses("session-1", vi.fn(), { onSession });
    transport.captured.handlers?.onFinished({
      finishedAt: null,
      sessionId: "session-1",
      status: "ABANDONED",
      version: 4,
    });
    await vi.waitFor(() => {
      expect(onSession).toHaveBeenCalledOnce();
    });

    expect(onSession).toHaveBeenCalledWith(
      expect.objectContaining({ finishedAt: null, setupId: null, status: "ABANDONED" }),
    );
  });
});
