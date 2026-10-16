import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import openapiDocument from "../../openapi/openapi.json";
import type { components } from "../generated/schema";

import {
  COURSE_IDS,
  courseState,
  mockScenario,
  PLACEMENT_IDS,
  resetCourseMockState,
  resetPlanningState,
  SETUP_IDS,
  type MockScenario,
} from "./handlers";
import { server } from "./server";

type Schemas = components["schemas"];

const origin = "http://localhost";
const schemaId = "https://agilityhub.local/openapi.json";
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(openapiDocument, schemaId);

function valid(name: string, value: unknown): void {
  const validate = ajv.compile({ $ref: `${schemaId}#/components/schemas/${name}` });
  expect(validate(value), `${name}: ${JSON.stringify(validate.errors, null, 2)}`).toBe(true);
}

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- each call names its answer's schema.
async function call<Body>(
  scenario: MockScenario,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  mockScenario(scenario);
  const response = await fetch(`${origin}/api/v1${path}`, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { "Content-Type": "application/json", ...headers },
    method,
  });
  const text = await response.text();
  return { body: (text === "" ? undefined : JSON.parse(text)) as Body, status: response.status };
}

function geometryRequest(
  geometry: Schemas["RingGeometry"],
  overrides: Partial<Schemas["RingGeometryRequest"]> = {},
): Schemas["RingGeometryRequest"] {
  return {
    borderClearanceM: geometry.borderClearanceM,
    doors: geometry.doors,
    lengthM: geometry.lengthM,
    markers: geometry.markers,
    noGoZones: geometry.noGoZones,
    notes: geometry.notes ?? null,
    orientationDeg: geometry.orientationDeg ?? null,
    surface: geometry.surface ?? null,
    version: geometry.version,
    widthM: geometry.widthM,
    ...overrides,
  };
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  resetCourseMockState();
  resetPlanningState();
});
afterEach(() => {
  server.resetHandlers();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

describe("E9-W03 · the S16 mock world answers as the api (S16 §6, CATALEG_ERRORS §1)", () => {
  it("GET /courses: a CoursePage of x-fields items, newest first; the owner chips; the AgilityHub library and the caller's own", async () => {
    const all = await call<Schemas["CoursePage"]>("admin", "GET", "/courses");
    expect(all.status).toBe(200);
    valid("CoursePage", all.body);
    expect(all.body.items.map((item) => item.id)).toEqual([
      COURSE_IDS.jumping,
      COURSE_IDS.agility,
      COURSE_IDS.image,
      COURSE_IDS.foundations,
      COURSE_IDS.mine,
    ]);
    const jumping = all.body.items[0];
    expect(Object.keys(jumping ?? {}).sort()).toEqual(
      [
        "activeOnRings",
        "designerName",
        "discipline",
        "id",
        "level",
        "name",
        "ownerType",
        "source",
        "stats",
        "thumbnailUrl",
      ].sort(),
    );
    // R-16-03 activeOnRings: the active Muntanya setup shows it through its placement.
    expect(jumping?.activeOnRings).toEqual([{ id: "ring-muntanya", name: "Muntanya" }]);
    // `level`: the club levels' codes joined by an en dash, else the AgilityHub level.
    expect(all.body.items[1]?.level).toBe("C–D");
    expect(jumping?.level).toBe("MEDIUM");

    const owners = async (owner: string, scenario: MockScenario = "admin") =>
      (
        await call<Schemas["CoursePage"]>(scenario, "GET", `/courses?filter=owner:eq:${owner}`)
      ).body.items.map((item) => item.id);
    expect(await owners("CLUB")).toEqual([
      COURSE_IDS.jumping,
      COURSE_IDS.agility,
      COURSE_IDS.image,
    ]);
    expect(await owners("AGILITYHUB")).toEqual([COURSE_IDS.foundations]);
    expect(await owners("MINE")).toEqual([COURSE_IDS.mine]);
    // Another account's PRIVATE course is never listed.
    expect(await owners("MINE", "instructor")).toEqual([]);

    const searched = await call<Schemas["CoursePage"]>("admin", "GET", "/courses?q=dijous");
    expect(searched.body.items.map((item) => item.id)).toEqual([COURSE_IDS.jumping]);
  });

  it("R-16-15 / R-16-16: COURSES off → 404 MODULE_DISABLED everywhere; a MEMBER → 403", async () => {
    for (const path of ["/courses", "/placements", "/rings/ring-muntanya/geometry"]) {
      const off = await call<Schemas["ApiError"]>("adminNoCourses", "GET", path);
      expect(off).toMatchObject({ body: { code: "MODULE_DISABLED" }, status: 404 });
    }
    const member = await call<Schemas["ApiError"]>("member", "GET", "/courses");
    expect(member).toMatchObject({ body: { code: "FORBIDDEN" }, status: 403 });
  });

  it("R-16-02/16 upload URLs: purpose and type, the 512 KB Smarter limit (details.maxSizeMb), and the image course they create", async () => {
    const exe = await call<Schemas["ApiError"]>("admin", "POST", "/courses/upload-urls", {
      contentType: "application/x-msdownload",
      purpose: "SMARTER_SOURCE",
      size: 1000,
    });
    expect(exe).toMatchObject({ body: { code: "FILE_TYPE_NOT_ALLOWED" }, status: 400 });
    const big = await call<Schemas["ApiError"]>("admin", "POST", "/courses/upload-urls", {
      contentType: "text/plain",
      purpose: "SMARTER_SOURCE",
      size: 600 * 1024,
    });
    expect(big).toMatchObject({
      body: { code: "FILE_TOO_LARGE", details: { maxSizeMb: 0.5 } },
      status: 400,
    });
    valid("CourseFileTooLargeDetails", big.body.details);

    const grant = await call<Schemas["CourseUploadUrl"]>("admin", "POST", "/courses/upload-urls", {
      contentType: "image/png",
      purpose: "COURSE_IMAGE",
      size: 4,
    });
    expect(grant.status).toBe(201);
    valid("CourseUploadUrl", grant.body);
    const put = await fetch(grant.body.uploadUrl, {
      body: new Uint8Array([1, 2, 3, 4]),
      headers: { "Content-Type": "image/png" },
      method: "PUT",
    });
    expect(put.status).toBe(200);

    const request: Schemas["CourseRequest"] = {
      discipline: "OTHER",
      imageFileKey: grant.body.fileKey,
      levelIds: [],
      name: { ca: "Plànol del pàdel" },
      source: "IMAGE",
      tags: [],
      visibility: "CLUB",
    };
    const key = { "Idempotency-Key": "image-course-1" };
    const created = await call<Schemas["Course"]>("admin", "POST", "/courses", request, key);
    expect(created.status).toBe(201);
    valid("Course", created.body);
    expect(created.body).toMatchObject({
      imageFileKey: grant.body.fileKey,
      source: "IMAGE",
      version: 1,
    });
    // The stored file is served back at the course's image address.
    const image = await fetch(created.body.imageUrl ?? "");
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));

    // CONVENCIONS_API §7: the same key and body replay the answer; another body is refused.
    const replay = await call<Schemas["Course"]>("admin", "POST", "/courses", request, key);
    expect(replay.body.id).toBe(created.body.id);
    const reused = await call<Schemas["ApiError"]>(
      "admin",
      "POST",
      "/courses",
      { ...request, name: { ca: "Un altre" } },
      key,
    );
    expect(reused).toMatchObject({
      body: { code: "IDEMPOTENCY_KEY_REUSED", details: { reason: "DIFFERENT_REQUEST" } },
      status: 409,
    });
    // A file key that is not this club's upload of that purpose → NOT_FOUND.
    const stranger = await call<Schemas["ApiError"]>("admin", "POST", "/courses", {
      ...request,
      imageFileKey: "another-club/courses/x",
    });
    expect(stranger).toMatchObject({ body: { code: "NOT_FOUND" }, status: 404 });
  });

  it("R-16-03 a PUBLIC course is copied to the club (AGILITYHUB_COPY) and never edited; a CLUB course cannot go PUBLIC", async () => {
    const forbidden = await call<Schemas["ApiError"]>(
      "admin",
      "PATCH",
      `/courses/${COURSE_IDS.foundations}`,
      {
        name: { ca: "Meu" },
        version: 1,
      },
    );
    expect(forbidden).toMatchObject({ body: { code: "FORBIDDEN" }, status: 403 });
    const copied = await call<Schemas["Course"]>(
      "admin",
      "POST",
      `/courses/${COURSE_IDS.foundations}/copy-to-club`,
      {},
    );
    expect(copied.status).toBe(201);
    valid("Course", copied.body);
    expect(copied.body).toMatchObject({
      ownerType: "CLUB",
      source: "AGILITYHUB_COPY",
      sourceCourseId: COURSE_IDS.foundations,
      visibility: "CLUB",
    });
    const publicClub = await call<Schemas["ApiError"]>(
      "admin",
      "PATCH",
      `/courses/${COURSE_IDS.jumping}`,
      {
        version: 3,
        visibility: "PUBLIC",
      },
    );
    expect(publicClub).toMatchObject({ body: { code: "VALIDATION_ERROR" }, status: 400 });
    const stale = await call<Schemas["ApiError"]>(
      "admin",
      "PATCH",
      `/courses/${COURSE_IDS.jumping}`,
      {
        notes: "x",
        version: 1,
      },
    );
    expect(stale).toMatchObject({ body: { code: "STALE_VERSION" }, status: 409 });
    // COURSE_IN_USE while an active setup shows it (through its placement).
    const inUse = await call<Schemas["ApiError"]>(
      "admin",
      "DELETE",
      `/courses/${COURSE_IDS.jumping}?version=3`,
    );
    expect(inUse).toMatchObject({ body: { code: "COURSE_IN_USE" }, status: 409 });
  });

  it("R-16-04/06 geometry: GEOMETRY_INVALID {violations}, STALE_VERSION, and a saved geometry marks the ring's placements stale", async () => {
    const read = await call<Schemas["RingGeometry"]>(
      "admin",
      "GET",
      "/rings/ring-central/geometry",
    );
    valid("RingGeometry", read.body);
    const invalid = await call<Schemas["ApiError"]>(
      "admin",
      "PUT",
      "/rings/ring-central/geometry",
      geometryRequest(read.body, { lengthM: 70, markers: read.body.markers.slice(0, 2) }),
    );
    expect(invalid.status).toBe(422);
    expect(invalid.body).toMatchObject({
      code: "GEOMETRY_INVALID",
      details: {
        violations: [
          { path: "lengthM", rule: "OUT_OF_RANGE" },
          { path: "markers", rule: "TOO_FEW_MARKERS" },
        ],
      },
    });
    valid("GeometryInvalidDetails", invalid.body.details);
    const stale = await call<Schemas["ApiError"]>(
      "admin",
      "PUT",
      "/rings/ring-central/geometry",
      geometryRequest(read.body, { version: 0 }),
    );
    expect(stale).toMatchObject({ body: { code: "STALE_VERSION" }, status: 409 });
    expect(
      courseState.placements.find((item) => item.id === PLACEMENT_IDS.centralLeague)?.stale,
    ).toBe(false);
    const saved = await call<Schemas["RingGeometry"]>(
      "admin",
      "PUT",
      "/rings/ring-central/geometry",
      geometryRequest(read.body, { widthM: 28 }),
    );
    expect(saved.status).toBe(200);
    valid("RingGeometry", saved.body);
    expect(saved.body.version).toBe(read.body.version + 1);
    const placement = await call<Schemas["Placement"]>(
      "admin",
      "GET",
      `/placements/${PLACEMENT_IDS.centralLeague}`,
    );
    expect(placement.body.stale).toBe(true);
    // An instructor reads the geometry but never writes it.
    const instructor = await call<Schemas["ApiError"]>(
      "instructor",
      "PUT",
      "/rings/ring-central/geometry",
      geometryRequest(saved.body),
    );
    expect(instructor).toMatchObject({ body: { code: "FORBIDDEN" }, status: 403 });
    // A ring without geometry → 404 NOT_FOUND.
    const none = await call<Schemas["ApiError"]>("admin", "GET", "/rings/ring-carretera/geometry");
    expect(none).toMatchObject({ body: { code: "NOT_FOUND" }, status: 404 });
  });

  it("R-16-05 placements: PLACEMENT_BLOCKED {warnings} without force, FORBIDDEN for an INSTRUCTOR's force, STALE_VERSION on PUT, and the build sheet is not implemented", async () => {
    const stored = courseState.placements.find((item) => item.id === PLACEMENT_IDS.muntanyaJumping);
    if (stored === undefined) throw new Error("PLACEMENT_NOT_FOUND");
    const critical: Schemas["PlacementWarning"] = {
      courseNoGoZoneId: null,
      distanceMeters: 0.2,
      doorId: null,
      id: "ring-no-go-inside:o-1:zone-muntanya-bassa",
      message: "inside",
      obstacleSourceId: "1",
      ringNoGoZoneId: "zone-muntanya-bassa",
      ruleId: "ring-no-go",
      severity: "critical",
      thresholdMeters: null,
    };
    const body: Schemas["PlacementRequest"] = {
      courseId: COURSE_IDS.jumping,
      courseVersion: 3,
      placementMode: "CENTERED",
      resolvedObstacles: stored.resolvedObstacles,
      ringId: "ring-muntanya",
      transform: stored.transform,
      warnings: [critical],
    };
    const blocked = await call<Schemas["ApiError"]>("admin", "POST", "/placements", body);
    expect(blocked).toMatchObject({
      body: { code: "PLACEMENT_BLOCKED", details: { warnings: [critical] } },
      status: 422,
    });
    valid("PlacementBlockedDetails", blocked.body.details);
    const instructor = await call<Schemas["ApiError"]>("instructor", "POST", "/placements", {
      ...body,
      force: true,
    });
    expect(instructor).toMatchObject({ body: { code: "FORBIDDEN" }, status: 403 });
    const forced = await call<Schemas["Placement"]>("admin", "POST", "/placements", {
      ...body,
      force: true,
    });
    expect(forced.status).toBe(201);
    valid("Placement", forced.body);

    const noGeometry = await call<Schemas["ApiError"]>("admin", "POST", "/placements", {
      ...body,
      ringId: "ring-carretera",
      warnings: [],
    });
    expect(noGeometry).toMatchObject({ body: { code: "RING_WITHOUT_GEOMETRY" }, status: 422 });

    const recalculated = await call<Schemas["Placement"]>(
      "admin",
      "PUT",
      `/placements/${stored.id}`,
      {
        ...body,
        version: stored.version,
        warnings: [],
      },
    );
    expect(recalculated.status).toBe(200);
    expect(recalculated.body).toMatchObject({ stale: false, version: stored.version + 1 });
    const stale = await call<Schemas["ApiError"]>("admin", "PUT", `/placements/${stored.id}`, {
      ...body,
      version: stored.version,
      warnings: [],
    });
    expect(stale).toMatchObject({ body: { code: "STALE_VERSION" }, status: 409 });
    const moved = await call<Schemas["ApiError"]>("admin", "PUT", `/placements/${stored.id}`, {
      ...body,
      ringId: "ring-central",
      version: stored.version + 1,
      warnings: [],
    });
    expect(moved).toMatchObject({ body: { code: "PLACEMENT_RING_MISMATCH" }, status: 422 });

    const sheet = await call<Schemas["ApiError"]>(
      "admin",
      "GET",
      `/placements/${stored.id}/build-sheet`,
    );
    expect(sheet).toMatchObject({ body: { code: "NOT_IMPLEMENTED" }, status: 501 });
  });

  it("R-16-07/08 setups: a new one replaces the active one (replacedSetupId, DISMANTLED in the history); the source rules", async () => {
    const created = await call<Schemas["RingSetupCreated"]>(
      "instructor",
      "POST",
      "/ring-setups",
      {
        kind: "JUMPING",
        levelIds: [],
        placementId: PLACEMENT_IDS.muntanyaJumping,
        ringId: "ring-muntanya",
      },
      { "Idempotency-Key": "setup-1" },
    );
    expect(created.status).toBe(201);
    valid("RingSetupCreated", created.body);
    expect(created.body.replacedSetupId).toBe(SETUP_IDS.muntanyaActive);
    const history = await call<Schemas["RingSetupPage"]>(
      "admin",
      "GET",
      "/rings/ring-muntanya/setups",
    );
    valid("RingSetupPage", history.body);
    expect(history.body.items.map((item) => [item.id, item.status])).toEqual([
      [created.body.setup.id, "ACTIVE"],
      [SETUP_IDS.muntanyaActive, "DISMANTLED"],
      [SETUP_IDS.muntanyaDismantled, "DISMANTLED"],
      [SETUP_IDS.muntanyaExpired, "EXPIRED"],
    ]);

    const mismatch = await call<Schemas["ApiError"]>("admin", "POST", "/ring-setups", {
      kind: "AGILITY",
      levelIds: [],
      placementId: PLACEMENT_IDS.centralLeague,
      ringId: "ring-muntanya",
    });
    expect(mismatch).toMatchObject({ body: { code: "PLACEMENT_RING_MISMATCH" }, status: 422 });
    const noSource = await call<Schemas["ApiError"]>("admin", "POST", "/ring-setups", {
      kind: "AGILITY",
      levelIds: [],
      ringId: "ring-muntanya",
    });
    expect(noSource).toMatchObject({ body: { code: "SETUP_SOURCE_REQUIRED" }, status: 422 });
    const renewExpired = await call<Schemas["ApiError"]>(
      "admin",
      "POST",
      `/ring-setups/${SETUP_IDS.muntanyaExpired}/renewal`,
      {},
    );
    expect(renewExpired).toMatchObject({ body: { code: "INVALID_STATE" }, status: 409 });
  });

  it("R-16-12 inventory: the ring's own or else the club's; INVENTORY_INVALID on a negative count", async () => {
    const own = await call<Schemas["ObstacleInventory"]>(
      "admin",
      "GET",
      "/obstacle-inventories/ring:ring-muntanya",
    );
    valid("ObstacleInventory", own.body);
    expect(own.body.scope).toBe("RING");
    const club = await call<Schemas["ObstacleInventory"]>(
      "admin",
      "GET",
      "/obstacle-inventories/ring:ring-central",
    );
    expect(club.body.scope).toBe("CLUB");
    const invalid = await call<Schemas["ApiError"]>(
      "admin",
      "PUT",
      "/obstacle-inventories/ring:ring-central",
      {
        items: [{ count: -1, type: "Jump" }],
      },
    );
    expect(invalid).toMatchObject({ body: { code: "INVENTORY_INVALID" }, status: 422 });
  });

  it("R-16-13 a class's placementId: the class's own ring (422 PLACEMENT_RING_MISMATCH), kept across a ring change only on that ring, refused without COURSES", async () => {
    const templates = await call<Schemas["WeekTemplate"]>(
      "admin",
      "GET",
      "/week-templates/template-setmana-a",
    );
    const template = templates.body;
    const item = template.classes.find((candidate) => candidate.ringId === "ring-muntanya");
    if (item === undefined) throw new Error("CLASS_NOT_FOUND");
    const path = `/week-templates/${template.id}/classes/${item.id}`;
    const wrong = await call<Schemas["ApiError"]>("admin", "PATCH", path, {
      placementId: PLACEMENT_IDS.centralLeague,
      version: template.version,
    });
    expect(wrong).toMatchObject({ body: { code: "PLACEMENT_RING_MISMATCH" }, status: 422 });
    const planned = await call<Schemas["WeekTemplate"]>("admin", "PATCH", path, {
      placementId: PLACEMENT_IDS.muntanyaJumping,
      version: template.version,
    });
    expect(planned.status).toBe(200);
    const saved = planned.body.classes.find((candidate) => candidate.id === item.id);
    expect(saved?.placementId).toBe(PLACEMENT_IDS.muntanyaJumping);
    // A new ring is checked against the kept placement.
    const moved = await call<Schemas["ApiError"]>("admin", "PATCH", path, {
      ringId: "ring-central",
      version: planned.body.version,
    });
    expect(moved).toMatchObject({ body: { code: "PLACEMENT_RING_MISMATCH" }, status: 422 });
    const off = await call<Schemas["ApiError"]>("adminNoCourses", "PATCH", path, {
      placementId: PLACEMENT_IDS.muntanyaJumping,
      version: planned.body.version,
    });
    expect(off).toMatchObject({
      body: {
        code: "VALIDATION_ERROR",
        details: { fieldErrors: [{ code: "MODULE_DISABLED", field: "placementId" }] },
      },
      status: 400,
    });
  });

  it("R-16-13 an activity lists its placements only with COURSES", async () => {
    const withCourses = await call<Schemas["Activity"]>(
      "admin",
      "GET",
      "/activities/activity-lliga-social-3",
    );
    expect(withCourses.body.placementIds).toEqual([PLACEMENT_IDS.centralLeague]);
    const without = await call<Schemas["Activity"]>(
      "adminNoCourses",
      "GET",
      "/activities/activity-lliga-social-3",
    );
    expect(without.body).not.toHaveProperty("placementIds");
  });
});
