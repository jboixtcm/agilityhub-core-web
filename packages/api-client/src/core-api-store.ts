import {
  doorPolygonFromEdge,
  placeObstacleInRing,
  type CourseData,
  type CoursePlacement,
  type ObstacleType,
} from "@agilityhub/course-core";
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

function placementRotation(obstacleDegrees: number | null, placement: CoursePlacement): number {
  const theta = ((obstacleDegrees ?? 0) * Math.PI) / 180;
  const x = (placement.flipX ? -1 : 1) * Math.cos(theta);
  const y = (placement.flipY ? -1 : 1) * Math.sin(theta);
  const phi = (placement.rotationDegrees * Math.PI) / 180;
  const rx = x * Math.cos(phi) - y * Math.sin(phi);
  const ry = x * Math.sin(phi) + y * Math.cos(phi);
  return (Math.atan2(ry, rx) * 180) / Math.PI;
}

function resolvedObstacles(course: CourseData, placement: CoursePlacement) {
  const numbers = new Map<string, number[]>();
  for (const number of course.numbers) {
    if (number.linkedObstacleSourceId === null || number.sequenceNumber === null) continue;
    const current = numbers.get(number.linkedObstacleSourceId) ?? [];
    current.push(number.sequenceNumber);
    numbers.set(number.linkedObstacleSourceId, current);
  }
  return course.obstacles.flatMap((obstacle) => {
    const point = placeObstacleInRing(obstacle, placement, course);
    return point === null
      ? []
      : [
          {
            numbers: numbers.get(obstacle.sourceId) ?? [],
            obstacleId: obstacle.sourceId,
            rotationDeg: placementRotation(obstacle.rotationDegrees, placement),
            type: obstacle.obstacleType,
            x: point.x,
            y: point.y,
          },
        ];
  });
}

function plannerCourse(course: ApiCourse): PlannerCourse {
  return { id: course.id, name: course.name, version: course.version };
}

function plannerPlacement(placement: ApiPlacement): PlannerPlacement {
  return {
    activityId: placement.activityId ?? null,
    courseId: placement.courseId,
    displayName: placement.displayName ?? null,
    id: placement.id,
    mode: placement.mode,
    name: placement.name ?? null,
    ringId: placement.ringId,
    scheduledAt: placement.scheduledAt ?? null,
    status: placement.status,
    version: placement.version,
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

  constructor(options: CoreApiStoreOptions) {
    this.#client = options.client ?? apiClient;
    this.#uploadFetch = options.uploadFetch ?? globalThis.fetch;
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

  async updateRingDoors(ringId: string, doors: readonly SaveRingDoorInput[]): Promise<PlannerRing> {
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
    const result = await this.#client.PUT("/rings/{id}/geometry", {
      body: ringGeometryRequest(current, { doors: apiDoors }),
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
    const result = await this.#client.POST("/courses", {
      body: {
        designedOn,
        designerName: metadata.designer.trim() === "" ? null : metadata.designer,
        discipline,
        levelIds: [],
        name: { [this.#locale]: input.courseData.title },
        normalizedJson: input.courseData,
        schemaVersion: 1,
        source: "SMARTER",
        sourceFileKey: upload.fileKey,
        tags: [],
        visibility: "CLUB",
      },
      headers: { "Idempotency-Key": input.submissionKey },
    });
    return { course: plannerCourse(required(result.data, "createCourse")) };
  }

  async savePlacement(input: SavePlacementInput): Promise<PlannerPlacement> {
    const result = await this.#client.POST("/placements", {
      body: {
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
        resolvedObstacles: resolvedObstacles(input.course, input.placement),
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
        warningThresholdM: input.thresholdMeters,
        warnings: input.warnings.map((warning) => ({ ...warning })),
      },
      headers: { "Idempotency-Key": input.submissionKey },
    });
    return plannerPlacement(required(result.data, "createPlacement"));
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
    const saved = await this.#putGeometry(input.ringId, current, [...current.markers, marker]);
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

  async #putGeometry(
    ringId: string,
    current: ApiGeometry,
    markers: ApiGeometryRequest["markers"],
  ): Promise<ApiGeometry> {
    const result = await this.#client.PUT("/rings/{id}/geometry", {
      body: ringGeometryRequest(current, { markers }),
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

  async #hydrateRing(base: ApiRing): Promise<PlannerRing | null> {
    try {
      const [geometryResult, inventoryResult] = await Promise.all([
        this.#client.GET("/rings/{id}/geometry", { params: { path: { id: base.id } } }),
        this.#client.GET("/obstacle-inventories/{scope}", {
          params: { path: { scope: `ring:${base.id}` } },
        }),
      ]);
      const ring = mapGeometry(
        required(geometryResult.data, "ringGeometry"),
        base.id,
        this.#venue.id,
        base,
        required(inventoryResult.data, "getObstacleInventory").items,
      );
      this.#ringCache.set(base.id, ring);
      return ring;
    } catch (error) {
      if (isApiError(error) && error.status === 404) return null;
      throw error;
    }
  }
}
