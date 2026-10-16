/**
 * An in-memory S16 api for the CoreApiStore tests (E9-W02 round 2): the real adapter talks to it
 * through `createApiClient({fetch})`, so the tests read the payloads the adapter really sends and
 * the answers the api really gives — statuses per CATALEG_ERRORS §1, the `ApiError` envelope
 * `{code, message, details, traceId}`, `Idempotency-Key` replay and `IDEMPOTENCY_KEY_REUSED
 * {reason: DIFFERENT_REQUEST}` per CONVENCIONS_API §7, `STALE_VERSION` on a geometry `version` that
 * is not the current one, and `422 PLACEMENT_BLOCKED {warnings}` for a critical warning without
 * `force` (R-16-05), and the build session `session-1` (R-16-11: join by code or QR token, taps,
 * finish; `422 BUILD_SESSION_FINISHED` once closed). Shapes are the generated schemas, so they
 * cannot drift from the snapshot.
 */
import type { components } from "./generated/schema";

type Schemas = components["schemas"];

const NOW = "2026-10-15T09:00:00Z";

/** The api's error answer (CATALEG_ERRORS rule 0: canonical status + top-level code). */
function apiError(status: number, code: string, details: unknown = null): Response {
  return Response.json(
    { code, details, message: `${code} (fake api)`, traceId: `trace-${code.toLowerCase()}` },
    { status },
  );
}

export interface FakeCoreApiRequest {
  readonly body: unknown;
  readonly idempotencyKey: string | null;
  readonly method: string;
  readonly path: string;
}

export interface FakeCoreApi {
  /** Requests in the order the api received them (bodies parsed). */
  readonly requests: FakeCoreApiRequest[];
  /** `PUT`s to the signed upload URL (the S3 side of `POST /courses/upload-urls`). */
  readonly uploads: { readonly url: string; readonly bytes: number }[];
  readonly fetch: typeof globalThis.fetch;
  readonly uploadFetch: typeof globalThis.fetch;
  geometry: Schemas["RingGeometry"];
  /** The ring's effective inventory; `null` = none, its own or the club's (`404`, R-16-12). */
  inventory: Schemas["ObstacleInventory"] | null;
  readonly placements: Schemas["Placement"][];
  readonly courses: Schemas["Course"][];
  /** The next answer to `METHOD path` is committed by the api but lost on the way back. */
  loseNextAnswer: (method: string, path: string) => void;
  /** Another editor's save of the ring geometry, straight into the api's state. */
  saveGeometryElsewhere: (
    edit: (geometry: Schemas["RingGeometry"]) => Schemas["RingGeometry"],
  ) => void;
  /** The build session `session-1` as the api stores it (R-16-11). */
  buildSession: Schemas["BuildSession"];
  /** Another phone's tap on an obstacle of `session-1`, straight into the api's state. */
  tapElsewhere: (obstacleId: string, status: Schemas["BuildObstacle"]["status"]) => void;
  /** Another phone closes `session-1` (`COMPLETED` with a setup, or `ABANDONED`). */
  closeElsewhere: (status: "ABANDONED" | "COMPLETED") => void;
}

export const fakeRing: Schemas["Ring"] = {
  active: true,
  allowsFreeTraining: true,
  color: "info",
  effectiveTrainingCapacity: 6,
  id: "ring-1",
  name: "Pista central",
  order: 1,
  shortName: "Central",
  version: 3,
};

/** The ring's north entrance, as the api stores it. */
export const fakeEntrance: Schemas["RingDoor"] = {
  clearanceM: 1.5,
  endM: 4,
  flow: "IN",
  id: "door-entrance",
  isActive: true,
  label: "Entrada",
  notes: null,
  polygonPointsM: [
    { x: 2, y: 20 },
    { x: 4, y: 20 },
    { x: 4, y: 19.9 },
    { x: 2, y: 19.9 },
  ],
  side: "NORTH",
  startM: 2,
};

export function fakeGeometry(): Schemas["RingGeometry"] {
  return {
    borderClearanceM: 1,
    doors: [fakeEntrance],
    lengthM: 40,
    markers: [
      {
        aprilTagId: null,
        id: "marker-a",
        isActive: true,
        isFixed: true,
        label: "A",
        markerUid: "marker-a",
        notes: null,
        physicalHeightM: 0.16,
        physicalWidthM: 0.16,
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
    surface: "GRASS",
    updatedAt: NOW,
    version: 3,
    widthM: 20,
  };
}

/** The api resolves `name` to the reader's language and keeps the map in `nameI18n`. */
function courseFrom(id: string, body: Schemas["CourseRequest"]): Schemas["Course"] {
  return {
    createdAt: NOW,
    createdByAccountId: "account-admin",
    designedOn: body.designedOn ?? null,
    designerName: body.designerName ?? null,
    discipline: body.discipline,
    id,
    levelIds: [...body.levelIds],
    name: body.name.ca ?? Object.values(body.name)[0] ?? "",
    nameI18n: { ...body.name },
    ownerType: "CLUB",
    schemaVersion: body.schemaVersion ?? 1,
    source: body.source,
    sourceFileKey: body.sourceFileKey ?? null,
    stats: { bbox: { h: 20, w: 40 }, obstacleCount: 0, pathLengthM: 0 },
    tags: [...body.tags],
    updatedAt: NOW,
    version: 1,
    visibility: body.visibility,
  };
}

function placementFrom(id: string, body: Schemas["PlacementRequest"]): Schemas["Placement"] {
  return {
    activityId: body.activityId ?? null,
    buildSheetFileKey: null,
    classSessionIds: [],
    courseId: body.courseId,
    courseVersion: body.courseVersion,
    createdAt: NOW,
    createdByAccountId: "account-admin",
    displayName: body.displayName ?? null,
    grades: body.grades ?? [],
    id,
    mode: body.mode ?? "TRAINING",
    name: body.name ?? null,
    placementMode: body.placementMode,
    resolvedObstacles: body.resolvedObstacles,
    ringId: body.ringId,
    scheduledAt: body.scheduledAt ?? null,
    sizes: body.sizes ?? [],
    stale: false,
    status: body.status ?? "DRAFT",
    transform: body.transform,
    updatedAt: NOW,
    version: 1,
    warningThresholdM: body.warningThresholdM ?? 1.5,
    warnings: body.warnings,
  };
}

/** An open build session with three obstacles, one already placed by the admin. */
export function fakeBuildSession(): Schemas["BuildSession"] {
  return {
    buildSheetFileKey: null,
    finishedAt: null,
    id: "session-1",
    joinCode: "QX7K2M",
    joinToken: "join-token-1",
    joinTokenRotatedAt: null,
    lastKnownMarkerId: null,
    live: true,
    localCacheVersion: 1,
    obstacles: [
      {
        at: NOW,
        byAccountId: "account-admin",
        lastUpdatedClientSessionId: null,
        obstacleId: "obstacle-1",
        status: "PLACED",
      },
      {
        at: null,
        byAccountId: null,
        lastUpdatedClientSessionId: null,
        obstacleId: "obstacle-2",
        status: "NOT_PLACED",
      },
      {
        at: null,
        byAccountId: null,
        lastUpdatedClientSessionId: null,
        obstacleId: "obstacle-3",
        status: "NOT_PLACED",
      },
    ],
    participants: [{ accountId: "account-admin", joinedAt: NOW, joinedVia: "CODE" }],
    placementId: "placement-1",
    progressJson: null,
    ringId: "ring-1",
    selectedStrategy: "EQUIPMENT_TYPE",
    setupId: null,
    startedAt: NOW,
    startedByAccountId: "account-admin",
    status: "IN_PROGRESS",
    version: 4,
  };
}

const LATER = "2026-10-15T09:05:00Z";

/** `files.maxSizeMb` is the club parameter (CATALEG_PARAMETRES, default 25). */
export function createFakeCoreApi({ maxSizeMb = 25 }: { maxSizeMb?: number } = {}): FakeCoreApi {
  const requests: FakeCoreApiRequest[] = [];
  const uploads: { url: string; bytes: number }[] = [];
  const courses: Schemas["Course"][] = [];
  const placements: Schemas["Placement"][] = [];
  const answers = new Map<string, { fingerprint: string; status: number; body: unknown }>();
  const lost = new Set<string>();
  let uploadCount = 0;

  /** R-16-11: an obstacle's tap (last write wins), the first one makes the session IN_PROGRESS. */
  function tap(
    obstacleId: string,
    status: Schemas["BuildObstacle"]["status"],
    byAccountId: string,
  ): void {
    const session = api.buildSession;
    api.buildSession = {
      ...session,
      obstacles: session.obstacles.map((obstacle) =>
        obstacle.obstacleId === obstacleId ? { ...obstacle, at: LATER, byAccountId, status } : obstacle,
      ),
      status: "IN_PROGRESS",
      version: session.version + 1,
    };
  }

  function close(status: "ABANDONED" | "COMPLETED"): Schemas["BuildSession"] {
    api.buildSession = {
      ...api.buildSession,
      finishedAt: status === "COMPLETED" ? NOW : null,
      setupId: status === "COMPLETED" ? "setup-1" : null,
      status,
      version: api.buildSession.version + 1,
    };
    return api.buildSession;
  }

  const api: FakeCoreApi = {
    buildSession: fakeBuildSession(),
    closeElsewhere: (status) => {
      close(status);
    },
    courses,
    fetch: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const url = new URL(request.url);
      const path = decodeURIComponent(url.pathname);
      const text = request.method === "GET" ? "" : await request.text();
      const body: unknown = text === "" ? null : JSON.parse(text);
      const idempotencyKey = request.headers.get("Idempotency-Key");
      requests.push({ body, idempotencyKey, method: request.method, path });
      const response = keyed(request.method, path, idempotencyKey, text, () =>
        route(request.method, path, body),
      );
      if (lost.delete(`${request.method} ${path}`)) {
        throw new TypeError("Failed to fetch (the answer was lost on the way back)");
      }
      return response;
    },
    geometry: fakeGeometry(),
    inventory: {
      items: [{ count: 12, type: "Jump" }],
      ringId: "ring-1",
      scope: "RING",
      updatedAt: NOW,
    },
    loseNextAnswer: (method, path) => {
      lost.add(`${method} ${path}`);
    },
    placements,
    requests,
    saveGeometryElsewhere: (edit) => {
      const next = edit(api.geometry);
      api.geometry = { ...next, updatedAt: NOW, version: api.geometry.version + 1 };
    },
    tapElsewhere: (obstacleId, status) => {
      tap(obstacleId, status, "account-other");
    },
    uploadFetch: (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      const bytes = init?.body instanceof Blob ? init.body.size : 0;
      uploads.push({ bytes, url });
      return Promise.resolve(new Response(null, { status: 200 }));
    },
    uploads,
  };

  /** CONVENCIONS_API §7: same key + same body → the saved answer; another body → 409. */
  function keyed(
    method: string,
    path: string,
    key: string | null,
    fingerprint: string,
    run: () => { status: number; body: unknown },
  ): Response {
    if (key === null) return toResponse(run());
    const saved = answers.get(`${method} ${path} ${key}`);
    if (saved !== undefined) {
      return saved.fingerprint === fingerprint
        ? toResponse(saved)
        : apiError(409, "IDEMPOTENCY_KEY_REUSED", { reason: "DIFFERENT_REQUEST" });
    }
    const answer = run();
    // Only a 2xx or a 4xx with the api's body retires the key (E85); a 5xx releases it.
    if (answer.status < 500) answers.set(`${method} ${path} ${key}`, { ...answer, fingerprint });
    return toResponse(answer);
  }

  function toResponse(answer: { status: number; body: unknown }): Response {
    return answer.body instanceof Response
      ? answer.body.clone()
      : Response.json(answer.body, { status: answer.status });
  }

  function failure(status: number, code: string, details: unknown = null) {
    return { body: apiError(status, code, details), status };
  }

  function route(method: string, path: string, body: unknown): { status: number; body: unknown } {
    if (method === "GET" && path === "/rings/ring-1") return { body: fakeRing, status: 200 };
    if (method === "GET" && path === "/rings/ring-1/geometry") {
      return { body: api.geometry, status: 200 };
    }
    if (method === "GET" && path === "/obstacle-inventories/ring:ring-1") {
      return api.inventory === null
        ? failure(404, "NOT_FOUND")
        : { body: api.inventory, status: 200 };
    }
    if (method === "PUT" && path === "/rings/ring-1/geometry") {
      const request = body as Schemas["RingGeometryRequest"];
      if (request.version !== api.geometry.version) return failure(409, "STALE_VERSION");
      api.geometry = {
        ...request,
        updatedAt: NOW,
        version: api.geometry.version + 1,
      };
      return { body: api.geometry, status: 200 };
    }
    if (method === "POST" && path === "/courses/upload-urls") {
      // The published rule: 0 < size ≤ files.maxSizeMb, else 400 FILE_TOO_LARGE {maxSizeMb}.
      const { size } = body as Schemas["CourseUploadUrlRequest"];
      if (size <= 0 || size > maxSizeMb * 1024 * 1024) {
        const details: Schemas["FileTooLargeDetails"] = { maxSizeMb };
        return failure(400, "FILE_TOO_LARGE", details);
      }
      uploadCount += 1;
      const upload: Schemas["CourseUploadUrl"] = {
        fileKey: `club-1/courses/source-${String(uploadCount)}.txt`,
        uploadUrl: `https://files.test/upload/source-${String(uploadCount)}`,
      };
      return { body: upload, status: 201 };
    }
    if (method === "POST" && path === "/courses") {
      const course = courseFrom(
        `course-${String(courses.length + 1)}`,
        body as Schemas["CourseRequest"],
      );
      courses.push(course);
      return { body: course, status: 201 };
    }
    if (method === "POST" && path === "/placements") {
      const request = body as Schemas["PlacementRequest"];
      const critical = request.warnings.filter((warning) => warning.severity === "critical");
      if (critical.length > 0 && request.force !== true) {
        return failure(422, "PLACEMENT_BLOCKED", { warnings: critical });
      }
      const placement = placementFrom(`placement-${String(placements.length + 1)}`, request);
      placements.push(placement);
      return { body: placement, status: 201 };
    }
    const placementPath = /^\/placements\/([^/]+)$/u.exec(path);
    if (method === "PUT" && placementPath !== null) {
      // The published rules: the stored version (else STALE_VERSION), the same ring (else
      // PLACEMENT_RING_MISMATCH); the stored placement is no longer stale (R-16-06).
      const request = body as Schemas["PlacementUpdateRequest"];
      const index = placements.findIndex((candidate) => candidate.id === placementPath[1]);
      const current = placements[index];
      if (current === undefined) return failure(404, "NOT_FOUND");
      if (request.version !== current.version) return failure(409, "STALE_VERSION");
      if (request.ringId !== current.ringId) return failure(422, "PLACEMENT_RING_MISMATCH");
      const updated: Schemas["Placement"] = {
        ...placementFrom(current.id, request),
        buildSheetFileKey: current.buildSheetFileKey ?? null,
        createdAt: current.createdAt,
        version: current.version + 1,
      };
      placements[index] = updated;
      return { body: updated, status: 200 };
    }
    const sheetPath = /^\/placements\/([^/]+)\/build-sheet$/u.exec(path);
    if (sheetPath !== null) {
      // R-16-10 (E9-T05): the upload's key binds to the placement; its version does not change.
      const index = placements.findIndex((candidate) => candidate.id === sheetPath[1]);
      const current = placements[index];
      if (current === undefined) return failure(404, "NOT_FOUND");
      if (method === "POST") {
        const { fileKey } = body as Schemas["BuildSheetRequest"];
        const updated = { ...current, buildSheetFileKey: fileKey };
        placements[index] = updated;
        return { body: updated, status: 200 };
      }
      if (current.buildSheetFileKey == null) return failure(404, "NOT_FOUND");
      return {
        body: new Response(new Blob(["%PDF-1.4"], { type: "application/pdf" }), {
          headers: { "Content-Type": "application/pdf" },
        }),
        status: 200,
      };
    }
    return buildSessionRoute(method, path, body) ?? failure(404, "NOT_FOUND");
  }

  /** The published R-16-11 rules of `session-1` (the only session of the fake club). */
  function buildSessionRoute(
    method: string,
    path: string,
    body: unknown,
  ): { status: number; body: unknown } | null {
    const session = api.buildSession;
    const open = session.status === "NOT_STARTED" || session.status === "IN_PROGRESS";
    if (method === "POST" && path === "/build-sessions/join") {
      // The joinCode (case-insensitive, CODE) or the QR's joinToken (QR) of an open session.
      const { code } = body as Schemas["BuildJoinRequest"];
      const byCode = code.toUpperCase() === session.joinCode.toUpperCase();
      if (!open || (!byCode && code !== session.joinToken)) return failure(404, "NOT_FOUND");
      if (!session.participants.some((participant) => participant.accountId === "account-me")) {
        api.buildSession = {
          ...session,
          participants: [
            ...session.participants,
            { accountId: "account-me", joinedAt: LATER, joinedVia: byCode ? "CODE" : "QR" },
          ],
          version: session.version + 1,
        };
      }
      return { body: api.buildSession, status: 200 };
    }
    if (method === "GET" && path === "/build-sessions/session-1") {
      return { body: session, status: 200 };
    }
    const obstaclePath = /^\/build-sessions\/session-1\/obstacles\/([^/]+)$/u.exec(path);
    if (method === "PATCH" && obstaclePath !== null) {
      const obstacleId = obstaclePath[1] ?? "";
      if (!session.obstacles.some((obstacle) => obstacle.obstacleId === obstacleId)) {
        return failure(404, "NOT_FOUND");
      }
      if (!open) return failure(422, "BUILD_SESSION_FINISHED");
      tap(obstacleId, (body as Schemas["BuildObstacleRequest"]).status, "account-me");
      return { body: api.buildSession, status: 200 };
    }
    if (method === "POST" && path === "/build-sessions/session-1/finish") {
      if (!open) return failure(422, "BUILD_SESSION_FINISHED");
      return { body: close("COMPLETED"), status: 200 };
    }
    return null;
  }

  return api;
}
