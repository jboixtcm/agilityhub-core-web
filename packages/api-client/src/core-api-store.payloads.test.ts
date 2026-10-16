import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  coursePathLengthMeters,
  makeWarning,
  parseSmarterTxt,
  type CourseData,
  type CoursePlacement,
} from "@agilityhub/course-core";
import type { SavePlacementInput } from "@agilityhub/course-ui";
import { describe, expect, it, vi } from "vitest";

import { isApiError } from "./api-error";
import { createApiClient } from "./client";
import { CoreApiStore } from "./core-api-store";
import { createFakeCoreApi, fakeEntrance, type FakeCoreApi } from "./core-api-store.fake";
import type { components } from "./generated/schema";

const FIXTURE = resolve(
  process.cwd(),
  "../course-core/fixtures/smarter/jp-s-sw_993483_sadesign.txt",
);
const source = readFileSync(FIXTURE, "utf8");
const course: CourseData = parseSmarterTxt(source, { sourceFileName: "jp-s-sw.txt" }).courseData;
const bytes = new TextEncoder().encode(source);

/** The course centred in the fake 40 × 20 m ring (`centerCourseInRing`'s result). */
const centred: CoursePlacement = {
  flipX: false,
  flipY: false,
  offsetXMeters: 20,
  offsetYMeters: 10,
  placementMode: "centered",
  rotationDegrees: 0,
};

function storeOn(api: FakeCoreApi): CoreApiStore {
  return new CoreApiStore({
    client: createApiClient({ baseUrl: "https://core.test", fetch: api.fetch }),
    uploadFetch: api.uploadFetch,
    venue: { id: "club-1", locale: "ca", name: "Club", slug: "club" },
  });
}

function calls(api: FakeCoreApi): string[] {
  return api.requests.map((request) => `${request.method} ${request.path}`);
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("EXPECTED_A_REJECTION");
}

function placementInput(overrides: Partial<SavePlacementInput> = {}): SavePlacementInput {
  return {
    course,
    courseId: "course-1",
    courseVersion: 1,
    placement: centred,
    ringId: "ring-1",
    submissionKey: "placement-key-1",
    thresholdMeters: 1.5,
    venueId: "club-1",
    warnings: [],
    ...overrides,
  };
}

describe("E9-W02 round 2: CoreApiStore payloads against the S16 contract", () => {
  it("#1 R-16-03 a lost POST /courses answer is retried with the same key and the same body (one upload)", async () => {
    const api = createFakeCoreApi();
    const store = storeOn(api);
    api.loseNextAnswer("POST", "/courses");
    const input = {
      bytes,
      courseData: course,
      filename: "jp-s-sw.txt",
      submissionKey: "upload-key-1",
    };

    const lost = await rejection(store.uploadSmarterFile(input));
    expect(isApiError(lost, "NETWORK")).toBe(true);
    const { course: saved } = await store.uploadSmarterFile(input);

    expect(calls(api)).toEqual(["POST /courses/upload-urls", "POST /courses", "POST /courses"]);
    expect(api.uploads).toHaveLength(1);
    const [first, second] = api.requests.filter((request) => request.path === "/courses");
    expect(first?.idempotencyKey).toBe("upload-key-1");
    expect(second?.idempotencyKey).toBe("upload-key-1");
    expect(second?.body).toEqual(first?.body);
    expect(first?.body).toMatchObject({
      levelIds: [],
      name: { ca: course.title },
      schemaVersion: 1,
      source: "SMARTER",
      sourceFileKey: "club-1/courses/source-1.txt",
      visibility: "CLUB",
    });
    // The api committed once; the retry read the saved answer (CONVENCIONS_API §7).
    expect(api.courses).toHaveLength(1);
    expect(saved).toEqual({ id: "course-1", name: course.title, version: 1 });

    // A new file comes with a new key: a new upload and a new course.
    await store.uploadSmarterFile({ ...input, submissionKey: "upload-key-2" });
    expect(api.uploads).toHaveLength(2);
    expect(api.courses.map((created) => created.sourceFileKey)).toEqual([
      "club-1/courses/source-1.txt",
      "club-1/courses/source-2.txt",
    ]);
  });

  it.each([
    // [Smarter angle, flipX, flipY, placement rotation, ring heading] — the table of course-core's
    // heading test and course-ui's Planner3D/PlannerCanvas test: persisted = rendered.
    [30, false, false, 0, -30],
    [30, true, false, 0, -150],
    [30, false, true, 0, 30],
    [30, true, true, 0, 150],
    [30, false, false, 90, 60],
    [30, true, false, 90, -60],
    [30, false, true, 90, 120],
    [30, true, true, 90, -120],
  ])(
    "#2 R-16-01/05 persists the heading the planners render: angle %d°, flipX=%s, flipY=%s, rotation %d° → %d°",
    async (angle, flipX, flipY, rotationDegrees, expected) => {
      const api = createFakeCoreApi();
      const first = course.obstacles.find((obstacle) => obstacle.controlPointsMeters === null);
      if (first === undefined) throw new Error("FIXTURE_WITHOUT_A_PLAIN_OBSTACLE");
      const tilted: CourseData = {
        ...course,
        obstacles: course.obstacles.map((obstacle) =>
          obstacle.sourceId === first.sourceId ? { ...obstacle, rotationDegrees: angle } : obstacle,
        ),
      };
      const placement: CoursePlacement = {
        ...centred,
        flipX,
        flipY,
        rotationDegrees,
      };

      await storeOn(api).savePlacement(placementInput({ course: tilted, placement }));

      const body = api.requests.at(-1)?.body as components["schemas"]["PlacementRequest"];
      const persisted = body.resolvedObstacles.find((item) => item.obstacleId === first.sourceId);
      expect(persisted?.rotationDeg).toBeCloseTo(expected, 9);
    },
  );

  it("#3 R-16-04 a door save after another editor's save answers 409 STALE_VERSION and their doors survive", async () => {
    const api = createFakeCoreApi();
    const store = storeOn(api);
    const edited = await store.getRing("ring-1");
    if (edited === null) throw new Error("RING_NOT_FOUND");
    expect(edited.geometry_version).toBe(3);

    // Another editor renames the entrance and adds a south door (geometry v3 → v4).
    api.saveGeometryElsewhere((geometry) => ({
      ...geometry,
      doors: [
        ...geometry.doors.map((door) => ({ ...door, label: "Entrada principal" })),
        { ...fakeEntrance, id: "door-south", label: "Sortida", side: "SOUTH" as const },
      ],
    }));

    // The user, still on v3, deactivates the entrance.
    const save = store.updateRingDoors(
      "ring-1",
      [
        {
          clearanceMeters: 1.5,
          endMeters: 4,
          flow: "in",
          id: "door-entrance",
          isActive: false,
          label: "Entrada",
          side: "north",
          startMeters: 2,
        },
      ],
      edited.geometry_version,
    );
    const error = await rejection(save);

    expect(isApiError(error, "STALE_VERSION")).toBe(true);
    expect(error).toMatchObject({ details: null, status: 409 });
    expect(api.requests.at(-1)?.body).toMatchObject({ version: 3 });
    expect(api.geometry.version).toBe(4);
    expect(api.geometry.doors.map((door) => [door.id, door.label, door.isActive])).toEqual([
      ["door-entrance", "Entrada principal", true],
      ["door-south", "Sortida", true],
    ]);

    // After reading the latest ring, the user's edit goes through on v4 and keeps the other door.
    const latest = await store.getRing("ring-1");
    if (latest === null) throw new Error("RING_NOT_FOUND");
    const saved = await store.updateRingDoors(
      "ring-1",
      latest.doors.map((door) => ({
        clearanceMeters: door.clearance_m,
        endMeters: door.end_m ?? 0,
        flow: door.flow ?? "both",
        id: door.id,
        isActive: door.id === "door-entrance" ? false : (door.is_active ?? true),
        label: door.label,
        side: (door.side ?? "north") as "north" | "south" | "east" | "west",
        startMeters: door.start_m ?? 0,
      })),
      latest.geometry_version,
    );
    expect(saved.geometry_version).toBe(5);
    expect(saved.doors.map((door) => [door.id, door.label, door.is_active])).toEqual([
      ["door-entrance", "Entrada principal", false],
      ["door-south", "Sortida", true],
    ]);
  });

  it("#4 R-16-05 a critical warning answers 422 PLACEMENT_BLOCKED {warnings}; the ADMIN's confirmed retry sends force: true", async () => {
    const api = createFakeCoreApi();
    const store = storeOn(api);
    // A warning exactly as course-core's engine builds it (all ten fields, nulls included).
    const critical = makeWarning({
      distanceMeters: 0.4,
      id: "ring-no-go:pond:3",
      message: "Obstacle 3 is inside the no-go zone",
      obstacleSourceId: course.obstacles[0]?.sourceId ?? null,
      ringNoGoZoneId: "pond",
      ruleId: "ring-no-go",
      severity: "critical",
      thresholdMeters: 0,
    });

    const blocked = await rejection(
      store.savePlacement(
        placementInput({ submissionKey: "placement-key-1", warnings: [critical] }),
      ),
    );
    expect(isApiError(blocked, "PLACEMENT_BLOCKED")).toBe(true);
    expect(blocked).toMatchObject({ details: { warnings: [critical] }, status: 422 });
    expect(api.requests.at(-1)?.body).not.toHaveProperty("force");

    // The 422 is an answer: its key is retired, the confirmed retry is a new submission.
    const saved = await store.savePlacement(
      placementInput({ force: true, submissionKey: "placement-key-2", warnings: [critical] }),
    );
    expect(api.requests.at(-1)).toMatchObject({
      body: { force: true, warnings: [critical] },
      idempotencyKey: "placement-key-2",
    });
    expect(saved).toMatchObject({ id: "placement-1", ringId: "ring-1", status: "DRAFT" });
  });

  it("R-16-05 savePlacement sends the complete published payload under the caller's key", async () => {
    const api = createFakeCoreApi();
    const placement = centred;
    await storeOn(api).savePlacement(
      placementInput({ name: "Dijous", placement, scheduledAt: "2026-10-22T16:00:00Z" }),
    );

    const request = api.requests.at(-1);
    expect(request?.idempotencyKey).toBe("placement-key-1");
    const body = request?.body as components["schemas"]["PlacementRequest"];
    expect(body).toMatchObject({
      activityId: null,
      courseId: "course-1",
      courseVersion: 1,
      displayName: null,
      grades: null,
      mode: null,
      name: "Dijous",
      placementMode: "CENTERED",
      ringId: "ring-1",
      scheduledAt: "2026-10-22T16:00:00Z",
      sizes: null,
      status: null,
      transform: {
        flipX: false,
        flipY: false,
        offsetXM: placement.offsetXMeters,
        offsetYM: placement.offsetYMeters,
        rotationDeg: 0,
      },
      warningThresholdM: 1.5,
      warnings: [],
    });
    expect(body.resolvedObstacles).toHaveLength(course.obstacles.length);
    expect(body.resolvedObstacles[0]).toEqual({
      numbers: expect.any(Array) as unknown,
      obstacleId: course.obstacles[0]?.sourceId,
      rotationDeg: expect.any(Number) as unknown,
      type: course.obstacles[0]?.obstacleType,
      x: expect.any(Number) as unknown,
      y: expect.any(Number) as unknown,
    });
  });

  it("#5 R-16-11 finishes a build session with the caller's key, and a retry reads the same answer", async () => {
    const api = createFakeCoreApi();
    const store = storeOn(api);

    const finished = await store.finishBuildSession({
      buildSessionId: "session-1",
      submissionKey: "finish-key-1",
    });
    const again = await store.finishBuildSession({
      buildSessionId: "session-1",
      submissionKey: "finish-key-1",
    });

    expect(calls(api)).toEqual([
      "POST /build-sessions/session-1/finish",
      "POST /build-sessions/session-1/finish",
    ]);
    expect(api.requests.map((request) => [request.idempotencyKey, request.body])).toEqual([
      ["finish-key-1", null],
      ["finish-key-1", null],
    ]);
    expect(finished).toMatchObject({
      finishedAt: "2026-10-15T09:00:00Z",
      id: "session-1",
      status: "COMPLETED",
    });
    expect(again).toEqual(finished);
    // The setup finish registered (R-16-07), so the phone can link to it.
    expect(finished.setupId).toBe("setup-1");
  });

  it("T-16-10 R-16-11 joinBuildSession posts the typed code (no Idempotency-Key) and answers the session with the caller in it", async () => {
    const api = createFakeCoreApi();
    const store = storeOn(api);

    const joined = await store.joinBuildSession({ code: "qx7k2m" });

    expect(api.requests).toEqual([
      { body: { code: "qx7k2m" }, idempotencyKey: null, method: "POST", path: "/build-sessions/join" },
    ]);
    expect(joined).toMatchObject({ id: "session-1", setupId: null, status: "IN_PROGRESS" });
    expect(joined.participants).toContainEqual(
      expect.objectContaining({ accountId: "account-me", joinedVia: "CODE" }),
    );
  });

  it("R-16-11 a code no open session has answers 404 NOT_FOUND; a tap on a closed session 422 BUILD_SESSION_FINISHED", async () => {
    const api = createFakeCoreApi();
    const store = storeOn(api);

    const wrongCode = await rejection(store.joinBuildSession({ code: "ZZZZZZ" }));
    api.closeElsewhere("ABANDONED");
    const lateTap = await rejection(
      store.upsertBuildObstacleStatus({
        buildSessionId: "session-1",
        obstacleId: "obstacle-2",
        status: "PLACED",
      }),
    );

    expect(isApiError(wrongCode) && [wrongCode.status, wrongCode.code]).toEqual([404, "NOT_FOUND"]);
    expect(isApiError(lateTap) && [lateTap.status, lateTap.code]).toEqual([
      422,
      "BUILD_SESSION_FINISHED",
    ]);
  });
});

describe("E9-W03: the store D16 and D18 use", () => {
  it("E9-W02 review #2 / R-16-04 a marker save after another editor's save answers 409 STALE_VERSION and their markers survive", async () => {
    const api = createFakeCoreApi();
    const store = storeOn(api);
    const read = await store.getRing("ring-1");
    if (read === null) throw new Error("RING_NOT_FOUND");
    expect(read.geometry_version).toBe(3);

    // Another editor moves marker A and adds marker B (geometry v3 → v4).
    api.saveGeometryElsewhere((geometry) => {
      const [first] = geometry.markers;
      if (first === undefined) throw new Error("MARKER_NOT_FOUND");
      return {
        ...geometry,
        markers: [
          { ...first, xM: 1 },
          { ...first, id: "marker-b", label: "B", markerUid: "marker-b", xM: 40 },
        ],
      };
    });

    // The user, still on v3, renames A: the edit carries the version the user read.
    const renamed = await rejection(
      store.updateMarker("ring-1", "marker-a", {
        geometryVersion: read.geometry_version,
        label: "A1",
      }),
    );
    expect(isApiError(renamed, "STALE_VERSION")).toBe(true);
    expect(renamed).toMatchObject({ details: null, status: 409 });
    expect(api.requests.at(-1)?.body).toMatchObject({ version: 3 });

    // Creating a marker on the stale read is refused the same way.
    const created = await rejection(
      store.createMarker({
        geometryVersion: read.geometry_version,
        label: "C",
        markerUid: "marker-c",
        physicalHeightMeters: 0.19,
        physicalWidthMeters: 0.19,
        ringId: "ring-1",
        role: "corner",
        xMeters: 40,
        yMeters: 20,
      }),
    );
    expect(isApiError(created, "STALE_VERSION")).toBe(true);

    // Deactivating a marker on the stale read too (E9-W03 round 2, review #10).
    const deactivated = await rejection(
      store.deactivateMarker("ring-1", "marker-a", read.geometry_version),
    );
    expect(isApiError(deactivated, "STALE_VERSION")).toBe(true);
    expect(api.requests.at(-1)?.body).toMatchObject({ version: 3 });

    // Their markers are intact.
    expect(api.geometry.version).toBe(4);
    expect(api.geometry.markers.map((item) => [item.id, item.label, item.xM])).toEqual([
      ["marker-a", "A", 1],
      ["marker-b", "B", 40],
    ]);

    // On the latest read the rename goes through and keeps their move and their marker.
    const latest = await store.getRing("ring-1");
    if (latest === null) throw new Error("RING_NOT_FOUND");
    const saved = await store.updateMarker("ring-1", "marker-a", {
      geometryVersion: latest.geometry_version,
      label: "A1",
    });
    expect(saved).toMatchObject({ label: "A1", x_m: 1 });
    expect(api.geometry.markers.map((item) => [item.id, item.label])).toEqual([
      ["marker-a", "A1"],
      ["marker-b", "B"],
    ]);
  });

  it("R-16-01 an import sends course-core's path length (pathLengthM, E9-T03): the api computes no geometry", async () => {
    const api = createFakeCoreApi();
    await storeOn(api).uploadSmarterFile({
      bytes,
      courseData: course,
      filename: "jp-s-sw.txt",
      submissionKey: "upload-key-path",
    });
    const body = api.requests.at(-1)?.body as components["schemas"]["CourseRequest"];
    expect(body.pathLengthM).toBe(coursePathLengthMeters(course));
    expect(body.pathLengthM).toBeGreaterThan(0);
  });

  it("E9-W03 (found by the e2e) without an injected uploadFetch the signed PUT goes through the global fetch, called as a browser requires", async () => {
    const api = createFakeCoreApi();
    const puts: string[] = [];
    // A browser's fetch refuses any receiver but the global object («Illegal invocation»).
    vi.stubGlobal("fetch", function strictFetch(this: unknown, input: RequestInfo | URL) {
      if (this !== undefined && this !== globalThis) {
        return Promise.reject(new TypeError("Failed to execute 'fetch': Illegal invocation"));
      }
      puts.push(input instanceof Request ? input.url : String(input));
      return Promise.resolve(new Response(null, { status: 200 }));
    });
    try {
      const store = new CoreApiStore({
        client: createApiClient({ baseUrl: "https://core.test", fetch: api.fetch }),
        venue: { id: "club-1", locale: "ca", name: "Club", slug: "club" },
      });
      await store.uploadSmarterFile({
        bytes,
        courseData: course,
        filename: "jp-s-sw.txt",
        submissionKey: "upload-key-browser",
      });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(puts).toEqual(["https://files.test/upload/source-1"]);
    expect(api.courses).toHaveLength(1);
  });

  it("R-16-12 a ring with geometry and no inventory (404) is still offered, with an empty inventory", async () => {
    const api = createFakeCoreApi();
    api.inventory = null;
    const store = storeOn(api);
    const ring = await store.getRing("ring-1");
    expect(ring).toMatchObject({ geometry_version: 3, id: "ring-1", obstacle_inventory: [] });
  });

  it("R-16-06 a stale placement is re-saved at the version the user edited and keeps what the user did not change (schedule, grades, sizes, threshold, status, mode)", async () => {
    const api = createFakeCoreApi();
    const store = storeOn(api);
    const created = await store.savePlacement(
      placementInput({
        grades: ["G2"],
        mode: "free-floating",
        scheduledAt: "2026-10-24T08:00:00Z",
        sizes: ["S", "M"],
        status: "ARCHIVED",
        thresholdMeters: 2.5,
      }),
    );
    // The ring's geometry changed: the api marked the placement stale (R-16-06).
    const storedApi = api.placements[0];
    if (storedApi === undefined) throw new Error("PLACEMENT_NOT_STORED");
    api.placements[0] = { ...storedApi, stale: true };
    const stored = { ...created, stale: true };
    expect(stored).toMatchObject({
      grades: ["G2"],
      mode: "FREE_FLOATING",
      scheduledAt: "2026-10-24T08:00:00Z",
      sizes: ["S", "M"],
      status: "ARCHIVED",
      version: 1,
      warningThresholdM: 2.5,
    });

    const moved: CoursePlacement = {
      ...centred,
      offsetXMeters: 22,
      placementMode: "preserveMeters",
    };
    const updated = await store.updatePlacement({
      course,
      courseVersion: 1,
      placement: moved,
      stored,
      warnings: [],
    });
    const request = api.requests.at(-1);
    expect(request).toMatchObject({
      idempotencyKey: null,
      method: "PUT",
      path: "/placements/placement-1",
    });
    expect(request?.body).toMatchObject({
      courseId: "course-1",
      grades: ["G2"],
      mode: "FREE_FLOATING",
      placementMode: "PRESERVE_METERS",
      ringId: "ring-1",
      scheduledAt: "2026-10-24T08:00:00Z",
      sizes: ["S", "M"],
      status: "ARCHIVED",
      transform: { offsetXM: 22 },
      version: 1,
      warningThresholdM: 2.5,
    });
    expect(request?.body).not.toHaveProperty("force");
    // The api replaced the placement: what the user did not change survived, and it is fresh.
    expect(updated).toMatchObject({
      grades: ["G2"],
      mode: "FREE_FLOATING",
      placement: moved,
      scheduledAt: "2026-10-24T08:00:00Z",
      sizes: ["S", "M"],
      stale: false,
      status: "ARCHIVED",
      version: 2,
      warningThresholdM: 2.5,
    });

    // An edit the user made is sent; the rest stays as stored.
    await store.updatePlacement({
      course,
      courseVersion: 1,
      edits: { name: "Muntatge de dissabte", status: "READY_TO_BUILD" },
      placement: moved,
      stored: updated,
      warnings: [],
    });
    expect(api.placements[0]).toMatchObject({
      grades: ["G2"],
      mode: "FREE_FLOATING",
      name: "Muntatge de dissabte",
      status: "READY_TO_BUILD",
      version: 3,
      warningThresholdM: 2.5,
    });

    // The same old version again: another editor's save in between is never overwritten.
    const stale = await rejection(
      store.updatePlacement({
        course,
        courseVersion: 1,
        placement: centred,
        stored,
        warnings: [],
      }),
    );
    expect(isApiError(stale, "STALE_VERSION")).toBe(true);
    expect(api.placements[0].transform.offsetXM).toBe(22);
  });

  it("R-16-05 a new placement sends no status unless the user chose one (the api's default applies)", async () => {
    const api = createFakeCoreApi();
    const saved = await storeOn(api).savePlacement(placementInput());
    expect(api.requests.at(-1)?.body).toMatchObject({ status: null });
    expect(saved.status).toBe("DRAFT");
  });

  it("R-16-10 attachBuildSheet uploads the PDF (BUILD_SHEET) and attaches its key; the stored sheet is read back as a PDF", async () => {
    const api = createFakeCoreApi();
    const store = storeOn(api);
    const created = await store.savePlacement(placementInput());
    const pdf = new TextEncoder().encode("%PDF-1.4 fake sheet");

    const attached = await store.attachBuildSheet(created.id, pdf);
    expect(calls(api).slice(-2)).toEqual([
      "POST /courses/upload-urls",
      "POST /placements/placement-1/build-sheet",
    ]);
    expect(api.requests.at(-2)?.body).toEqual({
      contentType: "application/pdf",
      purpose: "BUILD_SHEET",
      size: pdf.byteLength,
    });
    expect(api.requests.at(-1)?.body).toEqual({ fileKey: "club-1/courses/source-1.txt" });
    expect(api.uploads).toEqual([
      { bytes: pdf.byteLength, url: "https://files.test/upload/source-1" },
    ]);
    // The placement's version does not change (E9-T05).
    expect(attached).toMatchObject({
      buildSheetFileKey: "club-1/courses/source-1.txt",
      version: created.version,
    });

    const sheet = await store.getBuildSheet(created.id);
    expect(sheet.type).toBe("application/pdf");
  });

  it("R-16-05 a placement without a known threshold sends warningThresholdM: null (the club's default applies)", async () => {
    const api = createFakeCoreApi();
    await storeOn(api).savePlacement(placementInput({ thresholdMeters: null }));
    expect(api.requests.at(-1)?.body).toMatchObject({ warningThresholdM: null });
  });
});
