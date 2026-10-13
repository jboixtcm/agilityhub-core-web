import {
  doorPolygonFromEdge,
  placeObstacleInRing,
  type CourseData,
  type CoursePlacement,
  type ObstacleType,
} from "@agilityhub/course-core";
import type {
  PlannerBuildSession,
  PlannerCourse,
  PlannerPlacement,
  PlannerRing,
  PlannerRingDoor,
  PlannerRingMarker,
  PlannerStore,
  PlannerVenue,
  SavePlacementInput,
  SaveRingDoorInput,
  UploadCourseInput,
} from "@agilityhub/course-ui";

import { isApiError } from "./api-error";
import { apiClient, type ApiClient } from "./client";
import type { components } from "./generated/schema";

type ApiBuildSession = components["schemas"]["BuildSession"];
type ApiCourse = components["schemas"]["Course"];
type ApiGeometry = components["schemas"]["RingGeometry"];
type ApiGeometryRequest = components["schemas"]["RingGeometryRequest"];
type ApiInventory = components["schemas"]["ObstacleInventory"];
type ApiPlacement = components["schemas"]["Placement"];
type ApiRing = components["schemas"]["Ring"] | components["schemas"]["RingReaderView"];

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
  readonly uploadFetch?: typeof globalThis.fetch;
  readonly venue: CoreApiVenue;
}

function required<T>(value: T | undefined, operation: string): T {
  if (value === undefined) {
    throw new Error(`CORE_API_EMPTY_RESPONSE:${operation}`);
  }
  return value;
}

function placementMode(value: CoursePlacement["placementMode"]): "CENTERED" | "FIT_TO_RING" | "PRESERVE_METERS" {
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
    courseId: placement.courseId,
    id: placement.id,
    ringId: placement.ringId,
    version: placement.version,
  };
}

function plannerBuildSession(session: ApiBuildSession): PlannerBuildSession {
  return {
    id: session.id,
    placementId: session.placementId,
    status: session.status,
    version: session.version,
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
    april_tag_id: marker.aprilTagId ?? 0,
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
  doors: readonly SaveRingDoorInput[],
): ApiGeometryRequest {
  return {
    borderClearanceM: geometry.borderClearanceM,
    doors: doors.map((door) => ({
      clearanceM: door.clearanceMeters ?? 0.5,
      endM: door.endMeters,
      flow: door.flow.toUpperCase() as "BOTH" | "IN" | "OUT",
      id: door.id ?? crypto.randomUUID(),
      isActive: door.isActive ?? true,
      label: door.label,
      notes: door.notes ?? null,
      polygonPointsM: doorPolygonFromEdge({
        endMeters: door.endMeters,
        ringLengthMeters: geometry.lengthM,
        ringWidthMeters: geometry.widthM,
        side: door.side,
        startMeters: door.startMeters,
      }),
      side: door.side.toUpperCase() as "EAST" | "NORTH" | "SOUTH" | "WEST",
      startM: door.startMeters,
    })),
    lengthM: geometry.lengthM,
    markers: geometry.markers,
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
  readonly #ringBase = new Map<string, ApiRing>();
  readonly #ringCache = new Map<string, PlannerRing>();

  constructor(options: CoreApiStoreOptions) {
    this.#client = options.client ?? apiClient;
    this.#uploadFetch = options.uploadFetch ?? globalThis.fetch;
    this.#locale = options.venue.locale ?? "ca";
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
    const result = await this.#client.GET("/rings", { params: { query: { includeInactive: false } } });
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
    return this.#inventoryOnlyRing(ringId, saved);
  }

  async updateRingDoors(
    ringId: string,
    doors: readonly SaveRingDoorInput[],
  ): Promise<PlannerRing> {
    const current = required(
      (await this.#client.GET("/rings/{id}/geometry", { params: { path: { id: ringId } } })).data,
      "ringGeometry",
    );
    const result = await this.#client.PUT("/rings/{id}/geometry", {
      body: ringGeometryRequest(current, doors),
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
          body: { contentType: "text/plain", purpose: "SMARTER_SOURCE", size: input.bytes.byteLength },
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

  #inventoryOnlyRing(ringId: string, inventory: ApiInventory): PlannerRing {
    const now = inventory.updatedAt;
    const ring: PlannerRing = {
      border_clearance_m: 0,
      created_at: now,
      default_units: "m",
      doors: [],
      geometry_version: 0,
      id: ringId,
      is_active: this.#ringBase.get(ringId)?.active ?? true,
      length_m: 0,
      markers: [],
      name: this.#ringBase.get(ringId)?.name ?? ringId,
      no_go_zones: [],
      notes: null,
      obstacle_inventory: inventory.items.map((item) => ({
        obstacle_type: item.type,
        quantity: item.count,
      })),
      surface: null,
      updated_at: now,
      venue_id: this.#venue.id,
      width_m: 0,
    };
    this.#ringCache.set(ringId, ring);
    return ring;
  }
}
