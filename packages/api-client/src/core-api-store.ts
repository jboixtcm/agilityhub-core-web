import {
  coursePathLengthMeters,
  doorPolygonFromEdge,
  type CoursePlacement,
  type ObstacleType,
} from "@agilityhub/course-core";
import { resolvePlacedObstacles } from "@agilityhub/course-ui";
import type {
  CreateCalibrationLogInput,
  CreateMarkerInput,
  ListCalendarPlacementsInput,
  PlannerBuildObstacleStatus,
  PlannerBuildSession,
  PlannerCalibrationLog,
  PlannerCourse,
  PlannerPlacement,
  PlannerRing,
  PlannerRingDoor,
  PlannerRingMarker,
  PlannerStore,
  PlannerVenue,
  SavePlacementInput,
  SaveRingDoorInput,
  UpdateMarkerPatch,
  UpdatePlacementInput,
  UpsertBuildObstacleStatusInput,
  UploadCourseInput,
} from "@agilityhub/course-ui";

import { isApiError } from "./api-error";
import { apiClient, type ApiClient } from "./client";
import type { components } from "./generated/schema";

type ApiBuildSession = components["schemas"]["BuildSession"];
type ApiBuildObstacle = components["schemas"]["BuildObstacle"];
type ApiCalibrationLog = components["schemas"]["CalibrationLog"];
type ApiCourse = components["schemas"]["Course"];
type ApiCourseRequest = components["schemas"]["CourseRequest"];
type ApiGeometry = components["schemas"]["RingGeometry"];
type ApiGeometryRequest = components["schemas"]["RingGeometryRequest"];
type ApiInventory = components["schemas"]["ObstacleInventory"];
type ApiPlacement = components["schemas"]["Placement"];
type ApiRing = components["schemas"]["Ring"] | components["schemas"]["RingReaderView"];
type ApiRingMarker = components["schemas"]["RingMarker"];

interface CoreApiVenue {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly city?: string | null;
  readonly defaultPaperSize?: "a4" | "letter";
  readonly locale?: string;
}

export interface CoreApiStoreOptions {
  readonly client?: ApiClient;
  readonly subscribeBuildEvents?: (
    buildSessionId: string,
    onObstacle: (status: PlannerBuildObstacleStatus) => void,
  ) => () => void;
  readonly uploadFetch?: typeof globalThis.fetch;
  readonly venue: CoreApiVenue;
}

function required<T>(value: T | undefined, operation: string): T {
  if (value === undefined) {
    throw new Error(`CORE_API_EMPTY_RESPONSE:${operation}`);
  }
  return value;
}

function placementMode(
  value: CoursePlacement["placementMode"],
): "CENTERED" | "FIT_TO_RING" | "PRESERVE_METERS" {
  if (value === "centered") return "CENTERED";
  if (value === "fitToRing") return "FIT_TO_RING";
  return "PRESERVE_METERS";
}

function plannerCourse(course: ApiCourse): PlannerCourse {
  return { id: course.id, name: course.name, version: course.version };
}

function coursePlacementMode(
  value: ApiPlacement["placementMode"],
): CoursePlacement["placementMode"] {
  if (value === "CENTERED") return "centered";
  if (value === "FIT_TO_RING") return "fitToRing";
  return "preserveMeters";
}

function plannerPlacement(placement: ApiPlacement): PlannerPlacement {
  return {
    activityId: placement.activityId ?? null,
    courseId: placement.courseId,
    courseVersion: placement.courseVersion,
    displayName: placement.displayName ?? null,
    id: placement.id,
    mode: placement.mode,
    name: placement.name ?? null,
    placement: {
      flipX: placement.transform.flipX,
      flipY: placement.transform.flipY,
      offsetXMeters: placement.transform.offsetXM,
      offsetYMeters: placement.transform.offsetYM,
      placementMode: coursePlacementMode(placement.placementMode),
      rotationDegrees: placement.transform.rotationDeg,
    },
    ringId: placement.ringId,
    scheduledAt: placement.scheduledAt ?? null,
    stale: placement.stale,
    status: placement.status,
    updatedAt: placement.updatedAt,
    version: placement.version,
  };
}

type PlacementBody = Omit<components["schemas"]["PlacementRequest"], "force">;

/** The body `POST /placements` and `PUT /placements/{id}` share (R-16-05: course-core computes). */
function placementBody(input: Omit<SavePlacementInput, "submissionKey">): PlacementBody {
  return {
    activityId: input.activityId ?? null,
    courseId: input.courseId,
    courseVersion: input.courseVersion,
    displayName: input.displayName ?? null,
    grades: input.grades === undefined ? null : [...input.grades],
    mode:
      input.mode === "event"
        ? "EVENT"
        : input.mode === "training"
          ? "TRAINING"
          : input.mode === "free-floating"
            ? "FREE_FLOATING"
            : null,
    name: input.name ?? null,
    placementMode: placementMode(input.placement.placementMode),
    resolvedObstacles: resolvePlacedObstacles(input.course, input.placement).map((obstacle) => ({
      ...obstacle,
      numbers: [...obstacle.numbers],
    })),
    ringId: input.ringId,
    scheduledAt: input.scheduledAt ?? null,
    sizes: input.sizes === undefined ? null : [...input.sizes],
    status: "READY_TO_BUILD",
    transform: {
      flipX: input.placement.flipX,
      flipY: input.placement.flipY,
      offsetXM: input.placement.offsetXMeters,
      offsetYM: input.placement.offsetYMeters,
      rotationDeg: input.placement.rotationDegrees,
    },
    warningThresholdM: input.thresholdMeters ?? null,
    warnings: input.warnings.map((warning) => ({ ...warning })),
  };
}

function plannerBuildSession(session: ApiBuildSession): PlannerBuildSession {
  return {
    buildSheetFileKey: session.buildSheetFileKey ?? null,
    finishedAt: session.finishedAt ?? null,
    id: session.id,
    joinCode: session.joinCode,
    joinToken: session.joinToken ?? null,
    joinTokenRotatedAt: session.joinTokenRotatedAt ?? null,
    lastKnownMarkerId: session.lastKnownMarkerId ?? null,
    live: session.live,
    localCacheVersion: session.localCacheVersion,
    obstacles: session.obstacles.map(plannerBuildObstacle),
    participants: session.participants,
    placementId: session.placementId,
    progressJson: session.progressJson ?? null,
    ringId: session.ringId,
    selectedStrategy: session.selectedStrategy,
    startedAt: session.startedAt ?? null,
    startedByAccountId: session.startedByAccountId,
    status: session.status,
    version: session.version,
  };
}

function plannerBuildObstacle(obstacle: ApiBuildObstacle): PlannerBuildObstacleStatus {
  return {
    at: obstacle.at ?? null,
    byAccountId: obstacle.byAccountId ?? null,
    lastUpdatedClientSessionId: obstacle.lastUpdatedClientSessionId ?? null,
    obstacleId: obstacle.obstacleId,
    status: obstacle.status,
  };
}

function plannerCalibration(log: ApiCalibrationLog): PlannerCalibrationLog {
  return {
    appVersion: log.appVersion ?? null,
    arProvider: log.arProvider ?? null,
    averageErrorCm: log.averageErrorCm,
    createdAt: log.createdAt,
    createdByAccountId: log.createdByAccountId,
    deviceModel: log.deviceModel ?? null,
    id: log.id,
    markerCount: log.markerCount,
    maxErrorCm: log.maxErrorCm,
    notes: log.notes ?? null,
    osVersion: log.osVersion ?? null,
    outcome: log.outcome,
    rawMetadata: log.rawMetadata,
    ringId: log.ringId,
  };
}

function plannerDoor(door: ApiGeometry["doors"][number]): PlannerRingDoor {
  return {
    clearance_m: door.clearanceM,
    end_m: door.endM,
    flow: door.flow.toLowerCase() as "both" | "in" | "out",
    id: door.id,
    is_active: door.isActive,
    label: door.label,
    notes: door.notes ?? null,
    polygon_points_m: door.polygonPointsM,
    side: door.side.toLowerCase(),
    start_m: door.startM,
  };
}

function plannerMarker(marker: ApiGeometry["markers"][number], ringId: string): PlannerRingMarker {
  return {
    april_tag_id: marker.aprilTagId ?? null,
    id: marker.id,
    is_active: marker.isActive,
    is_fixed: marker.isFixed,
    label: marker.label,
    marker_uid: marker.markerUid,
    notes: marker.notes ?? null,
    physical_height_m: marker.physicalHeightM,
    physical_width_m: marker.physicalWidthM,
    ring_id: ringId,
    role: marker.role,
    rotation_y_deg: marker.rotationYDeg,
    x_m: marker.xM,
    y_m: marker.yM,
    z_m: marker.zM,
  };
}

function mapGeometry(
  geometry: ApiGeometry,
  ringId: string,
  venueId: string,
  base?: ApiRing,
  inventory: ApiInventory["items"] = [],
): PlannerRing {
  return {
    border_clearance_m: geometry.borderClearanceM,
    created_at: geometry.updatedAt,
    default_units: "m",
    doors: geometry.doors.map(plannerDoor),
    geometry_version: geometry.version,
    id: ringId,
    is_active: base?.active ?? true,
    length_m: geometry.lengthM,
    markers: geometry.markers.map((marker) => plannerMarker(marker, ringId)),
    name: base?.name ?? ringId,
    no_go_zones: geometry.noGoZones.map((zone) => ({
      id: zone.id,
      label: zone.label,
      polygon_points_m: zone.polygonPointsM,
      warning_margin_m: zone.warningMarginM,
    })),
    notes: geometry.notes ?? null,
    obstacle_inventory: inventory.map((item) => ({
      obstacle_type: item.type,
      quantity: item.count,
    })),
    surface: geometry.surface ?? null,
    updated_at: geometry.updatedAt,
    venue_id: venueId,
    width_m: geometry.widthM,
  };
}

function ringGeometryRequest(
  geometry: ApiGeometry,
  overrides: Partial<Pick<ApiGeometryRequest, "doors" | "markers">> = {},
): ApiGeometryRequest {
  return {
    borderClearanceM: geometry.borderClearanceM,
    doors: overrides.doors ?? geometry.doors,
    lengthM: geometry.lengthM,
    markers: overrides.markers ?? geometry.markers,
    noGoZones: geometry.noGoZones,
    notes: geometry.notes ?? null,
    orientationDeg: geometry.orientationDeg ?? null,
    surface: geometry.surface ?? null,
    version: geometry.version,
    widthM: geometry.widthM,
  };
}

export class CoreApiStore implements PlannerStore {
  readonly kind = "core-api" as const;
  readonly #client: ApiClient;
  readonly #uploadFetch: typeof globalThis.fetch;
  readonly #venue: PlannerVenue;
  readonly #locale: string;
  readonly #subscribeBuildEvents: CoreApiStoreOptions["subscribeBuildEvents"];
  readonly #ringBase = new Map<string, ApiRing>();
  readonly #ringCache = new Map<string, PlannerRing>();
  /**
   * The complete `POST /courses` body each upload `Idempotency-Key` owns (CONVENCIONS_API §7):
   * once the source bytes are stored, a retry under the same key resends exactly this body (same
   * `sourceFileKey`), never a new upload, so a lost answer is recovered instead of tripping
   * `IDEMPOTENCY_KEY_REUSED`. A new file comes with a new key (UploadCourse), hence a new upload.
   */
  readonly #courseUploads = new Map<string, ApiCourseRequest>();

  constructor(options: CoreApiStoreOptions) {
    this.#client = options.client ?? apiClient;
    // A browser's `fetch` throws «Illegal invocation» when called as another object's method:
    // the default goes through `globalThis` at call time (E9-W03, found by the D18 e2e).
    this.#uploadFetch = options.uploadFetch ?? ((input, init) => globalThis.fetch(input, init));
    this.#locale = options.venue.locale ?? "ca";
    this.#subscribeBuildEvents = options.subscribeBuildEvents;
    this.#venue = {
      city: options.venue.city ?? null,
      default_paper_size: options.venue.defaultPaperSize ?? "a4",
      id: options.venue.id,
      name: options.venue.name,
      slug: options.venue.slug,
    };
  }

  listVenues(): Promise<readonly PlannerVenue[]> {
    return Promise.resolve([this.#venue]);
  }

  async listRings(venueId: string): Promise<readonly PlannerRing[]> {
    if (venueId !== this.#venue.id) return [];
    const result = await this.#client.GET("/rings", {
      params: { query: { includeInactive: false } },
    });
    const rings = required(result.data, "listRings").items;
    for (const ring of rings) this.#ringBase.set(ring.id, ring);
    const hydrated = await Promise.all(rings.map(async (ring) => this.#hydrateRing(ring)));
    return hydrated.filter((ring): ring is PlannerRing => ring !== null);
  }

  async getRing(ringId: string): Promise<PlannerRing | null> {
    try {
      const result = await this.#client.GET("/rings/{id}", { params: { path: { id: ringId } } });
      const ring = required(result.data, "getRing");
      this.#ringBase.set(ring.id, ring);
      return await this.#hydrateRing(ring);
    } catch (error) {
      if (isApiError(error) && error.status === 404) return null;
      throw error;
    }
  }

  async updateRingInventory(
    ringId: string,
    inventory: readonly { obstacle_type: ObstacleType; quantity: number }[],
  ): Promise<PlannerRing> {
    const result = await this.#client.PUT("/obstacle-inventories/{scope}", {
      body: {
        items: inventory.map((item) => ({ count: item.quantity, type: item.obstacle_type })),
      },
      params: { path: { scope: `ring:${ringId}` } },
    });
    const saved = required(result.data, "putObstacleInventory");
    const cached = this.#ringCache.get(ringId);
    if (cached !== undefined) {
      const next = {
        ...cached,
        obstacle_inventory: saved.items.map((item) => ({
          obstacle_type: item.type,
          quantity: item.count,
        })),
      };
      this.#ringCache.set(ringId, next);
      return next;
    }
    const refreshed = await this.getRing(ringId);
    if (refreshed === null) throw new Error("CORE_API_EMPTY_RESPONSE:updateRingInventory:ring");
    return refreshed;
  }

  async updateRingDoors(
    ringId: string,
    doors: readonly SaveRingDoorInput[],
    geometryVersion: number,
  ): Promise<PlannerRing> {
    const current = required(
      (await this.#client.GET("/rings/{id}/geometry", { params: { path: { id: ringId } } })).data,
      "ringGeometry",
    );
    const apiDoors: ApiGeometryRequest["doors"] = doors.map((door) => ({
      clearanceM: door.clearanceMeters ?? 0.5,
      endM: door.endMeters,
      flow: door.flow.toUpperCase() as "BOTH" | "IN" | "OUT",
      id: door.id ?? crypto.randomUUID(),
      isActive: door.isActive ?? true,
      label: door.label,
      notes: door.notes ?? null,
      polygonPointsM: doorPolygonFromEdge({
        endMeters: door.endMeters,
        ringLengthMeters: current.lengthM,
        ringWidthMeters: current.widthM,
        side: door.side,
        startMeters: door.startMeters,
      }),
      side: door.side.toUpperCase() as "EAST" | "NORTH" | "SOUTH" | "WEST",
      startM: door.startMeters,
    }));
    // The doors replace the list the user edited, so the body carries the version the user edited
    // (`geometryVersion`), never the fresh one: if another editor saved in between, the api
    // answers 409 STALE_VERSION and their doors survive (CONVENCIONS_API §7, R-16-04). When the
    // versions match, `current` is exactly the geometry the user edited.
    const result = await this.#client.PUT("/rings/{id}/geometry", {
      body: { ...ringGeometryRequest(current, { doors: apiDoors }), version: geometryVersion },
      params: { path: { id: ringId } },
    });
    const geometry = required(result.data, "putRingGeometry");
    const cached = this.#ringCache.get(ringId);
    const next = mapGeometry(
      geometry,
      ringId,
      this.#venue.id,
      this.#ringBase.get(ringId),
      cached?.obstacle_inventory.map((item) => ({
        count: item.quantity,
        type: item.obstacle_type,
      })) ?? [],
    );
    this.#ringCache.set(ringId, next);
    return next;
  }

  async uploadSmarterFile(input: UploadCourseInput): Promise<{ readonly course: PlannerCourse }> {
    const body =
      this.#courseUploads.get(input.submissionKey) ?? (await this.#storeCourseSource(input));
    const result = await this.#client.POST("/courses", {
      body,
      headers: { "Idempotency-Key": input.submissionKey },
    });
    return { course: plannerCourse(required(result.data, "createCourse")) };
  }

  /** Stores the `.txt` (signed upload) and remembers the creation body under the upload's key. */
  async #storeCourseSource(input: UploadCourseInput): Promise<ApiCourseRequest> {
    const upload = required(
      (
        await this.#client.POST("/courses/upload-urls", {
          body: {
            contentType: "text/plain",
            purpose: "SMARTER_SOURCE",
            size: input.bytes.byteLength,
          },
        })
      ).data,
      "courseUploadUrl",
    );
    const uploaded = await this.#uploadFetch(upload.uploadUrl, {
      body: new Blob([input.bytes as BlobPart], { type: "text/plain" }),
      headers: { "Content-Type": "text/plain" },
      method: "PUT",
    });
    if (!uploaded.ok) throw new Error(`COURSE_SOURCE_UPLOAD_FAILED:${String(uploaded.status)}`);
    const metadata = input.courseData.metadata;
    const discipline = metadata.courseType.toLowerCase().includes("jump")
      ? "JUMPING"
      : metadata.courseType.toLowerCase().includes("agility")
        ? "AGILITY"
        : "OTHER";
    const designedOn = /^\d{4}-\d{2}-\d{2}$/.test(metadata.date) ? metadata.date : null;
    const body: ApiCourseRequest = {
      designedOn,
      designerName: metadata.designer.trim() === "" ? null : metadata.designer,
      discipline,
      levelIds: [],
      name: { [this.#locale]: input.courseData.title },
      normalizedJson: input.courseData,
      // stats.pathLengthM is course-core's (R-16-01: the api computes no geometry).
      pathLengthM: coursePathLengthMeters(input.courseData),
      schemaVersion: 1,
      source: "SMARTER",
      sourceFileKey: upload.fileKey,
      tags: [],
      visibility: "CLUB",
    };
    this.#courseUploads.set(input.submissionKey, body);
    return body;
  }

  async savePlacement(input: SavePlacementInput): Promise<PlannerPlacement> {
    const result = await this.#client.POST("/placements", {
      body: {
        ...placementBody(input),
        // R-16-05: only an ADMIN's confirmed retry overrides a critical warning.
        ...(input.force === true ? { force: true } : {}),
      },
      headers: { "Idempotency-Key": input.submissionKey },
    });
    return plannerPlacement(required(result.data, "createPlacement"));
  }

  async updatePlacement(input: UpdatePlacementInput): Promise<PlannerPlacement> {
    const result = await this.#client.PUT("/placements/{id}", {
      body: {
        ...placementBody(input),
        ...(input.force === true ? { force: true } : {}),
        // The version the user edited (R-16-06's recalculation included): another editor's
        // save in between answers 409 STALE_VERSION.
        version: input.version,
      },
      params: { path: { id: input.placementId } },
    });
    return plannerPlacement(required(result.data, "putPlacement"));
  }

  async listCalendarPlacements(
    input: ListCalendarPlacementsInput = {},
  ): Promise<readonly PlannerPlacement[]> {
    const result = await this.#client.GET("/placements", {
      params: {
        query: {
          ...(input.activityId === undefined ? {} : { activityId: input.activityId }),
          ...(input.courseId === undefined ? {} : { courseId: input.courseId }),
          ...(input.ringId === undefined ? {} : { ringId: input.ringId }),
        },
      },
    });
    return required(result.data, "listCalendarPlacements").map(plannerPlacement);
  }

  async listMarkers(ringId: string): Promise<readonly PlannerRingMarker[]> {
    const geometry = required(
      (await this.#client.GET("/rings/{id}/geometry", { params: { path: { id: ringId } } })).data,
      "ringGeometry",
    );
    return geometry.markers.map((marker) => plannerMarker(marker, ringId));
  }

  async createMarker(input: CreateMarkerInput): Promise<PlannerRingMarker> {
    const current = await this.#getGeometry(input.ringId);
    const marker: ApiRingMarker = {
      aprilTagId: input.aprilTagId ?? null,
      id: crypto.randomUUID(),
      isActive: true,
      isFixed: input.isFixed ?? true,
      label: input.label,
      markerUid: input.markerUid,
      notes: input.notes ?? null,
      physicalHeightM: input.physicalHeightMeters,
      physicalWidthM: input.physicalWidthMeters,
      role: input.role,
      rotationYDeg: input.rotationYDegrees ?? 0,
      xM: input.xMeters,
      yM: input.yMeters,
      zM: input.zMeters ?? 0,
    };
    const saved = await this.#putGeometry(
      input.ringId,
      current,
      [...current.markers, marker],
      input.geometryVersion,
    );
    return plannerMarker(
      required(
        saved.markers.find((candidate) => candidate.id === marker.id),
        "createMarker",
      ),
      input.ringId,
    );
  }

  async updateMarker(
    ringId: string,
    markerId: string,
    patch: UpdateMarkerPatch,
  ): Promise<PlannerRingMarker> {
    const current = await this.#getGeometry(ringId);
    const existing = required(
      current.markers.find((marker) => marker.id === markerId),
      "updateMarker:marker",
    );
    const edited: ApiRingMarker = {
      ...existing,
      ...(patch.isActive === undefined ? {} : { isActive: patch.isActive }),
      ...(patch.isFixed === undefined ? {} : { isFixed: patch.isFixed }),
      ...(patch.label === undefined ? {} : { label: patch.label }),
      ...(patch.notes === undefined ? {} : { notes: patch.notes }),
      ...(patch.physicalHeightMeters === undefined
        ? {}
        : { physicalHeightM: patch.physicalHeightMeters }),
      ...(patch.physicalWidthMeters === undefined
        ? {}
        : { physicalWidthM: patch.physicalWidthMeters }),
      ...(patch.role === undefined ? {} : { role: patch.role }),
      ...(patch.rotationYDegrees === undefined ? {} : { rotationYDeg: patch.rotationYDegrees }),
      ...(patch.xMeters === undefined ? {} : { xM: patch.xMeters }),
      ...(patch.yMeters === undefined ? {} : { yM: patch.yMeters }),
      ...(patch.zMeters === undefined ? {} : { zM: patch.zMeters }),
    };
    const saved = await this.#putGeometry(
      ringId,
      current,
      current.markers.map((marker) => (marker.id === markerId ? edited : marker)),
      patch.geometryVersion,
    );
    return plannerMarker(
      required(
        saved.markers.find((marker) => marker.id === markerId),
        "updateMarker:saved",
      ),
      ringId,
    );
  }

  deactivateMarker(ringId: string, markerId: string): Promise<PlannerRingMarker> {
    return this.updateMarker(ringId, markerId, { isActive: false });
  }

  async listCalibrationLogs(ringId: string): Promise<readonly PlannerCalibrationLog[]> {
    const result = await this.#client.GET("/rings/{id}/calibrations", {
      params: { path: { id: ringId } },
    });
    return required(result.data, "listCalibrationLogs").map(plannerCalibration);
  }

  async createCalibrationLog(input: CreateCalibrationLogInput): Promise<PlannerCalibrationLog> {
    const result = await this.#client.POST("/rings/{id}/calibrations", {
      body: {
        appVersion: input.appVersion ?? null,
        arProvider: input.arProvider ?? null,
        averageErrorCm: input.averageErrorCm,
        deviceModel: input.deviceModel ?? null,
        markerCount: input.markerCount,
        maxErrorCm: input.maxErrorCm,
        notes: input.notes ?? null,
        osVersion: input.osVersion ?? null,
        outcome: input.outcome,
        rawMetadata: input.rawMetadata ?? {},
      },
      params: { path: { id: input.ringId } },
    });
    return plannerCalibration(required(result.data, "createCalibrationLog"));
  }

  async createBuildSession(input: {
    readonly submissionKey: string;
    readonly placementId: string;
    readonly live?: boolean;
  }): Promise<PlannerBuildSession> {
    const result = await this.#client.POST("/build-sessions", {
      body: { live: input.live ?? true, placementId: input.placementId },
      headers: { "Idempotency-Key": input.submissionKey },
    });
    return plannerBuildSession(required(result.data, "createBuildSession"));
  }

  async getBuildSession(buildSessionId: string): Promise<PlannerBuildSession | null> {
    try {
      const result = await this.#client.GET("/build-sessions/{id}", {
        params: { path: { id: buildSessionId } },
      });
      return plannerBuildSession(required(result.data, "getBuildSession"));
    } catch (error) {
      if (isApiError(error) && error.status === 404) return null;
      throw error;
    }
  }

  async listBuildObstacleStatuses(
    buildSessionId: string,
  ): Promise<readonly PlannerBuildObstacleStatus[]> {
    const result = await this.#client.GET("/build-sessions/{id}", {
      params: { path: { id: buildSessionId } },
    });
    return required(result.data, "listBuildObstacleStatuses").obstacles.map(plannerBuildObstacle);
  }

  async upsertBuildObstacleStatus(
    input: UpsertBuildObstacleStatusInput,
  ): Promise<PlannerBuildObstacleStatus> {
    const result = await this.#client.PATCH("/build-sessions/{id}/obstacles/{obstacleId}", {
      body: { status: input.status, version: input.version ?? null },
      params: {
        path: { id: input.buildSessionId, obstacleId: input.obstacleId },
      },
    });
    const session = required(result.data, "upsertBuildObstacleStatus");
    return plannerBuildObstacle(
      required(
        session.obstacles.find((obstacle) => obstacle.obstacleId === input.obstacleId),
        "upsertBuildObstacleStatus:obstacle",
      ),
    );
  }

  async finishBuildSession(input: {
    readonly buildSessionId: string;
    readonly submissionKey: string;
  }): Promise<PlannerBuildSession> {
    const result = await this.#client.POST("/build-sessions/{id}/finish", {
      headers: { "Idempotency-Key": input.submissionKey },
      params: { path: { id: input.buildSessionId } },
    });
    return plannerBuildSession(required(result.data, "finishBuildSession"));
  }

  subscribeBuildObstacleStatuses(
    buildSessionId: string,
    onChange: (status: PlannerBuildObstacleStatus) => void,
  ): () => void {
    if (this.#subscribeBuildEvents === undefined) {
      throw new Error("CORE_API_BUILD_EVENTS_NOT_CONFIGURED");
    }
    return this.#subscribeBuildEvents(buildSessionId, onChange);
  }

  async #getGeometry(ringId: string): Promise<ApiGeometry> {
    return required(
      (await this.#client.GET("/rings/{id}/geometry", { params: { path: { id: ringId } } })).data,
      "ringGeometry",
    );
  }

  /**
   * Writes `markers` over the geometry just read. `userVersion` is the version the user read
   * (E9-W02 review #2): when another editor saved in between it differs from `current.version`,
   * and sending it makes the api answer `409 STALE_VERSION` instead of overwriting their markers
   * with this edit rebased on values the user never saw.
   */
  async #putGeometry(
    ringId: string,
    current: ApiGeometry,
    markers: ApiGeometryRequest["markers"],
    userVersion?: number,
  ): Promise<ApiGeometry> {
    const result = await this.#client.PUT("/rings/{id}/geometry", {
      body: {
        ...ringGeometryRequest(current, { markers }),
        version: userVersion ?? current.version,
      },
      params: { path: { id: ringId } },
    });
    const saved = required(result.data, "putRingGeometry");
    const cached = this.#ringCache.get(ringId);
    if (cached !== undefined) {
      this.#ringCache.set(ringId, {
        ...cached,
        geometry_version: saved.version,
        markers: saved.markers.map((marker) => plannerMarker(marker, ringId)),
        updated_at: saved.updatedAt,
      });
    }
    return saved;
  }

  /**
   * The ring with its geometry and its effective inventory; `null` for a ring without geometry
   * (`GET /rings/{id}/geometry` → 404). A ring with geometry but no inventory, its own or the
   * club's (`GET /obstacle-inventories/ring:{id}` → 404, R-16-12), is still a ring: it has an
   * empty inventory, so placements skip the inventory checks.
   */
  async #hydrateRing(base: ApiRing): Promise<PlannerRing | null> {
    const notFoundAs =
      <T>(fallback: T) =>
      (error: unknown): T => {
        if (isApiError(error) && error.status === 404) return fallback;
        throw error;
      };
    const [geometry, inventory] = await Promise.all([
      this.#client
        .GET("/rings/{id}/geometry", { params: { path: { id: base.id } } })
        .then((result) => required(result.data, "ringGeometry"), notFoundAs(null)),
      this.#client
        .GET("/obstacle-inventories/{scope}", { params: { path: { scope: `ring:${base.id}` } } })
        .then(
          (result) => required(result.data, "getObstacleInventory").items,
          notFoundAs<ApiInventory["items"]>([]),
        ),
    ]);
    if (geometry === null) return null;
    const ring = mapGeometry(geometry, base.id, this.#venue.id, base, inventory);
    this.#ringCache.set(base.id, ring);
    return ring;
  }
}
