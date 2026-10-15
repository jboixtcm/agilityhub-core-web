import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  makeWarning,
  parseSmarterTxt,
  type CourseData,
  type CoursePlacement,
} from "@agilityhub/course-core";
import type { SavePlacementInput } from "@agilityhub/course-ui";
import { describe, expect, it } from "vitest";

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
    expect(saved).toMatchObject({ id: "placement-1", ringId: "ring-1", status: "READY_TO_BUILD" });
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
      status: "READY_TO_BUILD",
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
  });
});
