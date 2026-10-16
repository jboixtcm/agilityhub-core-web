import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import openapiDocument from "../../openapi/openapi.json";
import type { components } from "../generated/schema";

import { clubInstant } from "./fixtures/calendar";
import { addDays, clubLocalDate } from "./fixtures/planning";
import { findParameter, replaceParameter } from "./fixtures/settings";
import {
  COURSE_IDS,
  courseState,
  mockScenario,
  PLACEMENT_IDS,
  resetCourseMockState,
  resetPlanningState,
  resetSettingsState,
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

/** A file of the mock storage: an upload grant, then the signed PUT with the same type. */
async function upload(
  scenario: MockScenario,
  purpose: Schemas["CourseUploadUrlRequest"]["purpose"],
  contentType: string,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<string> {
  const grant = await call<Schemas["CourseUploadUrl"]>(scenario, "POST", "/courses/upload-urls", {
    contentType,
    purpose,
    size: bytes.length,
  });
  expect(grant.status).toBe(201);
  const put = await fetch(grant.body.uploadUrl, {
    body: bytes,
    headers: { "Content-Type": contentType },
    method: "PUT",
  });
  expect(put.status).toBe(200);
  return grant.body.fileKey;
}

/** `GET /placements/{id}/build-sheet`: the status, the type and the bytes (a PDF, not JSON). */
async function buildSheet(scenario: MockScenario, placementId: string) {
  mockScenario(scenario);
  const response = await fetch(`${origin}/api/v1/placements/${placementId}/build-sheet`);
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get("Content-Type"),
    status: response.status,
  };
}

/** Every route of `course-handlers.ts`, with a path that names the fixtures' records. */
const COURSE_ROUTES: readonly (readonly [method: string, path: string])[] = [
  ["GET", "/courses"],
  ["POST", "/courses/upload-urls"],
  ["POST", "/courses"],
  ["GET", `/courses/${COURSE_IDS.jumping}`],
  ["PATCH", `/courses/${COURSE_IDS.jumping}`],
  ["DELETE", `/courses/${COURSE_IDS.jumping}?version=3`],
  ["POST", `/courses/${COURSE_IDS.jumping}/duplicate`],
  ["POST", `/courses/${COURSE_IDS.foundations}/copy-to-club`],
  ["GET", "/placements"],
  ["GET", `/placements/${PLACEMENT_IDS.centralLeague}`],
  ["POST", "/placements"],
  ["PUT", `/placements/${PLACEMENT_IDS.centralLeague}`],
  ["GET", `/placements/${PLACEMENT_IDS.centralLeague}/build-sheet`],
  ["POST", `/placements/${PLACEMENT_IDS.centralLeague}/build-sheet`],
  ["GET", "/rings/ring-muntanya/geometry"],
  ["PUT", "/rings/ring-muntanya/geometry"],
  ["DELETE", "/rings/ring-muntanya/geometry?version=4"],
  ["GET", "/obstacle-inventories/club"],
  ["PUT", "/obstacle-inventories/club"],
  ["GET", "/rings/ring-muntanya/setups"],
  ["GET", `/ring-setups/${SETUP_IDS.muntanyaActive}`],
  ["POST", "/ring-setups"],
  ["POST", `/ring-setups/${SETUP_IDS.muntanyaActive}/dismantle`],
  ["POST", `/ring-setups/${SETUP_IDS.muntanyaActive}/renewal`],
];

/** The routes a MEMBER reads (R-16-16); every other one is staff-only. */
const MEMBER_READS = new Set([
  `GET /courses/${COURSE_IDS.jumping}`,
  `GET /ring-setups/${SETUP_IDS.muntanyaActive}`,
]);

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  resetCourseMockState();
  resetPlanningState();
  resetSettingsState();
});
afterEach(() => {
  server.resetHandlers();
  vi.useRealTimers();
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

  it("R-16-15 / R-16-16: COURSES off → 404 MODULE_DISABLED on every course route; a MEMBER → 403 on every staff route", async () => {
    for (const [method, path] of COURSE_ROUTES) {
      const body = method === "GET" || method === "DELETE" ? undefined : {};
      const off = await call<Schemas["ApiError"]>("adminNoCourses", method, path, body);
      expect(off, `${method} ${path}`).toMatchObject({
        body: { code: "MODULE_DISABLED" },
        status: 404,
      });
      if (MEMBER_READS.has(`${method} ${path}`)) continue;
      const member = await call<Schemas["ApiError"]>("member", method, path, body);
      expect(member, `${method} ${path}`).toMatchObject({
        body: { code: "FORBIDDEN" },
        status: 403,
      });
    }
  });

  it("T-16-05 R-16-16: an ADMIN of another club (coursesOtherClub) finds none of this club's courses, placements, geometry, inventory or setups, and changes none of them", async () => {
    const other = "coursesOtherClub";
    const notFound = async (method: string, path: string, body?: unknown) => {
      const answer = await call<Schemas["ApiError"]>(other, method, path, body);
      expect(answer, `${method} ${path}`).toMatchObject({
        body: { code: "NOT_FOUND" },
        status: 404,
      });
    };
    // The main reads.
    await notFound("GET", `/courses/${COURSE_IDS.jumping}`);
    await notFound("GET", `/placements/${PLACEMENT_IDS.centralLeague}`);
    await notFound("GET", "/rings/ring-muntanya/geometry");
    await notFound("GET", "/rings/ring-muntanya/setups");
    await notFound("GET", `/ring-setups/${SETUP_IDS.muntanyaActive}`);
    await notFound("GET", "/obstacle-inventories/ring:ring-muntanya");
    // The club scope is the caller's club: this one has no inventory yet.
    await notFound("GET", "/obstacle-inventories/club");
    // The AgilityHub library and the account's own courses (the account's, in any club); none of
    // the club's, and no ring of this club in activeOnRings.
    const list = await call<Schemas["CoursePage"]>(other, "GET", "/courses");
    expect(list.body.items.map((item) => [item.id, item.activeOnRings])).toEqual([
      [COURSE_IDS.foundations, []],
      [COURSE_IDS.mine, []],
    ]);
    const placements = await call<Schemas["Placement"][]>(other, "GET", "/placements");
    expect(placements.body).toEqual([]);
    // The writes.
    await notFound("DELETE", "/rings/ring-carretera/geometry?version=1");
    await notFound("DELETE", "/rings/ring-central/geometry?version=1");
    await notFound("PUT", "/obstacle-inventories/ring:ring-central", {
      items: [{ count: 1, type: "Jump" }],
    });
    await notFound("POST", `/ring-setups/${SETUP_IDS.muntanyaActive}/dismantle`);
    await notFound("POST", `/ring-setups/${SETUP_IDS.centralPhoto}/renewal`, {});
    await notFound("PUT", `/placements/${PLACEMENT_IDS.centralLeague}`, {});
    await notFound("POST", `/placements/${PLACEMENT_IDS.centralLeague}/build-sheet`, {
      fileKey: "x",
    });
    const sheet = await buildSheet(other, PLACEMENT_IDS.centralLeague);
    expect(sheet.status).toBe(404);
    // Its own club inventory is its own: this club's stays as it was.
    const own = await call<Schemas["ObstacleInventory"]>(
      other,
      "PUT",
      "/obstacle-inventories/club",
      {
        items: [{ count: 3, type: "Jump" }],
      },
    );
    expect(own).toMatchObject({ body: { ringId: null, scope: "CLUB" }, status: 200 });
    const read = await call<Schemas["ObstacleInventory"]>(
      other,
      "GET",
      "/obstacle-inventories/club",
    );
    expect(read.body.items).toEqual([{ count: 3, type: "Jump" }]);
    const mine = await call<Schemas["ObstacleInventory"]>(
      "admin",
      "GET",
      "/obstacle-inventories/club",
    );
    expect(mine.body.items).toContainEqual({ count: 16, type: "Jump" });
    const ringOwn = await call<Schemas["ObstacleInventory"]>(
      "admin",
      "GET",
      "/obstacle-inventories/ring:ring-central",
    );
    expect(ringOwn.body.scope).toBe("CLUB");
    expect(courseState.geometries["ring-central"]).toBeDefined();
    const setups = courseState.setups.filter((item) => item.status === "ACTIVE").map((s) => s.id);
    expect(setups).toEqual([SETUP_IDS.muntanyaActive, SETUP_IDS.centralPhoto]);
    expect(courseState.setups.find((item) => item.id === SETUP_IDS.centralPhoto)?.expiresAt).toBe(
      "2026-10-20T22:00:00Z",
    );
  });

  it("R-16-16 upload keys: fileKey = {the caller's clubId}/courses/{uuid}; another club's upload is NOT_FOUND here; BUILD_SHEET is application/pdf only", async () => {
    const theirs = await upload(
      "coursesOtherClub",
      "COURSE_IMAGE",
      "image/png",
      new Uint8Array([9, 9]),
    );
    expect(theirs).toMatch(
      /^50000000-0000-4000-8000-000000000002\/courses\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
    );
    const ours = await upload("admin", "COURSE_IMAGE", "image/png", new Uint8Array([1]));
    expect(ours.startsWith("50000000-0000-4000-8000-000000000001/courses/")).toBe(true);
    const stranger = await call<Schemas["ApiError"]>("admin", "POST", "/courses", {
      discipline: "OTHER",
      imageFileKey: theirs,
      levelIds: [],
      name: { ca: "Plànol" },
      source: "IMAGE",
      tags: [],
      visibility: "CLUB",
    });
    expect(stranger).toMatchObject({ body: { code: "NOT_FOUND" }, status: 404 });
    for (const contentType of ["image/png", "text/plain"]) {
      const refused = await call<Schemas["ApiError"]>("admin", "POST", "/courses/upload-urls", {
        contentType,
        purpose: "BUILD_SHEET",
        size: 100,
      });
      expect(refused).toMatchObject({ body: { code: "FILE_TYPE_NOT_ALLOWED" }, status: 400 });
    }
    // The signed URL takes the granted type only (like S3's signature).
    const grant = await call<Schemas["CourseUploadUrl"]>("admin", "POST", "/courses/upload-urls", {
      contentType: "application/pdf",
      purpose: "BUILD_SHEET",
      size: 4,
    });
    const wrongType = await fetch(grant.body.uploadUrl, {
      body: new Uint8Array([1, 2, 3, 4]),
      headers: { "Content-Type": "image/png" },
      method: "PUT",
    });
    expect(wrongType.status).toBe(403);
  });

  it("R-16-09 / R-16-16 a MEMBER (impersonation included) reads a PUBLIC course, a course an ACTIVE setup shows and an ACTIVE setup (view MEMBER), only while courses.showSetupToMembers", async () => {
    for (const reader of ["member", "impersonated"] as const) {
      const shown = await call<Schemas["Course"]>(reader, "GET", `/courses/${COURSE_IDS.jumping}`);
      expect(shown.status).toBe(200);
      valid("Course", shown.body);
      // Never editable by a member: no nameI18n.
      expect(shown.body).not.toHaveProperty("nameI18n");
      const library = await call<Schemas["Course"]>(
        reader,
        "GET",
        `/courses/${COURSE_IDS.foundations}`,
      );
      expect(library.status).toBe(200);
      // A CLUB course only an EXPIRED setup or a placement shows, and one no setup shows.
      for (const id of [COURSE_IDS.agility, COURSE_IDS.image, COURSE_IDS.mine]) {
        const hidden = await call<Schemas["ApiError"]>(reader, "GET", `/courses/${id}`);
        expect(hidden, id).toMatchObject({ body: { code: "COURSE_NOT_VISIBLE" }, status: 404 });
      }
      const active = await call<Schemas["MemberRingSetup"]>(
        reader,
        "GET",
        `/ring-setups/${SETUP_IDS.muntanyaActive}`,
      );
      expect(active.status).toBe(200);
      valid("MemberRingSetup", active.body);
      expect(active.body).toMatchObject({ id: SETUP_IDS.muntanyaActive, view: "MEMBER" });
      expect(active.body).not.toHaveProperty("builtByAccountId");
      expect(active.body).not.toHaveProperty("dismantledByAccountId");
      expect(active.body).not.toHaveProperty("notes");
      for (const id of [SETUP_IDS.muntanyaExpired, SETUP_IDS.muntanyaDismantled]) {
        const past = await call<Schemas["ApiError"]>(reader, "GET", `/ring-setups/${id}`);
        expect(past, id).toMatchObject({ body: { code: "NOT_FOUND" }, status: 404 });
      }
    }
    // The staff view is unchanged.
    const staff = await call<Schemas["RingSetup"]>(
      "instructor",
      "GET",
      `/ring-setups/${SETUP_IDS.muntanyaExpired}`,
    );
    expect(staff.body).toMatchObject({ notes: null, view: "STAFF" });

    const parameter = findParameter("courses.showSetupToMembers");
    if (parameter === undefined) throw new Error("PARAMETER_NOT_FOUND");
    replaceParameter({ ...parameter, value: false });
    for (const path of [
      `/courses/${COURSE_IDS.jumping}`,
      `/courses/${COURSE_IDS.foundations}`,
      `/ring-setups/${SETUP_IDS.muntanyaActive}`,
    ]) {
      const off = await call<Schemas["ApiError"]>("member", "GET", path);
      expect(off, path).toMatchObject({ body: { code: "NOT_FOUND" }, status: 404 });
    }
    const instructor = await call<Schemas["Course"]>(
      "instructor",
      "GET",
      `/courses/${COURSE_IDS.jumping}`,
    );
    expect(instructor.status).toBe(200);
  });

  it("CONVENCIONS_API §7 dismantle and renewal are keyed: the same key and body replay the answer, another body → 409 IDEMPOTENCY_KEY_REUSED", async () => {
    const path = `/ring-setups/${SETUP_IDS.muntanyaActive}/dismantle`;
    const key = { "Idempotency-Key": "dismantle-1" };
    const first = await call<Schemas["RingSetup"]>("admin", "POST", path, undefined, key);
    expect(first).toMatchObject({ body: { status: "DISMANTLED" }, status: 200 });
    const replay = await call<Schemas["RingSetup"]>("admin", "POST", path, undefined, key);
    expect(replay).toEqual(first);
    const reused = await call<Schemas["ApiError"]>("admin", "POST", path, { x: 1 }, key);
    expect(reused).toMatchObject({
      body: { code: "IDEMPOTENCY_KEY_REUSED", details: { reason: "DIFFERENT_REQUEST" } },
      status: 409,
    });
    // Without a key the second send is a second request.
    const again = await call<Schemas["ApiError"]>("admin", "POST", path);
    expect(again).toMatchObject({ body: { code: "INVALID_STATE" }, status: 409 });

    const renewal = `/ring-setups/${SETUP_IDS.centralPhoto}/renewal`;
    const renewKey = { "Idempotency-Key": "renewal-1" };
    const until = addDays(clubLocalDate(), 2);
    const renewed = await call<Schemas["RingSetup"]>(
      "admin",
      "POST",
      renewal,
      { expectedUntil: until },
      renewKey,
    );
    expect(renewed).toMatchObject({ body: { expectedUntil: until }, status: 200 });
    const renewReplay = await call<Schemas["RingSetup"]>(
      "admin",
      "POST",
      renewal,
      { expectedUntil: until },
      renewKey,
    );
    expect(renewReplay).toEqual(renewed);
    const renewReused = await call<Schemas["ApiError"]>(
      "admin",
      "POST",
      renewal,
      { expectedUntil: addDays(until, 1) },
      renewKey,
    );
    expect(renewReused).toMatchObject({
      body: { code: "IDEMPOTENCY_KEY_REUSED", details: { reason: "DIFFERENT_REQUEST" } },
      status: 409,
    });
  });

  it("T-16-19 R-16-10 build sheet: POST {fileKey} binds this club's BUILD_SHEET upload and replaces the previous one (version unchanged); GET answers the bytes as application/pdf; none, another purpose, another club's or another placement's key → 404", async () => {
    // The fixture's stored sheet (D7 offers it).
    const stored = courseState.placements.find((item) => item.id === PLACEMENT_IDS.centralLeague);
    if (stored === undefined) throw new Error("PLACEMENT_NOT_FOUND");
    expect(stored.buildSheetFileKey).not.toBeNull();
    const fixture = await buildSheet("instructor", PLACEMENT_IDS.centralLeague);
    expect(fixture.status).toBe(200);
    expect(fixture.contentType).toBe("application/pdf");
    expect(new TextDecoder().decode(fixture.bytes.slice(0, 5))).toBe("%PDF-");

    // None yet → 404 NOT_FOUND.
    const none = await call<Schemas["ApiError"]>(
      "admin",
      "GET",
      `/placements/${PLACEMENT_IDS.muntanyaJumping}/build-sheet`,
    );
    expect(none).toMatchObject({ body: { code: "NOT_FOUND" }, status: 404 });

    const pdf = new TextEncoder().encode("%PDF-1.4 first");
    const fileKey = await upload("instructor", "BUILD_SHEET", "application/pdf", pdf);
    const path = `/placements/${PLACEMENT_IDS.muntanyaJumping}/build-sheet`;
    const before = courseState.placements.find((item) => item.id === PLACEMENT_IDS.muntanyaJumping);
    const attached = await call<Schemas["Placement"]>("instructor", "POST", path, { fileKey });
    expect(attached.status).toBe(200);
    valid("Placement", attached.body);
    expect(attached.body).toMatchObject({ buildSheetFileKey: fileKey, version: before?.version });
    const read = await buildSheet("admin", PLACEMENT_IDS.muntanyaJumping);
    expect(read).toEqual({ bytes: pdf, contentType: "application/pdf", status: 200 });

    // A new sheet replaces it; the version still does not change.
    const second = new TextEncoder().encode("%PDF-1.4 second");
    const nextKey = await upload("admin", "BUILD_SHEET", "application/pdf", second);
    const replaced = await call<Schemas["Placement"]>("admin", "POST", path, { fileKey: nextKey });
    expect(replaced.body).toMatchObject({ buildSheetFileKey: nextKey, version: before?.version });
    expect((await buildSheet("admin", PLACEMENT_IDS.muntanyaJumping)).bytes).toEqual(second);
    const listed = await call<Schemas["Placement"][]>("admin", "GET", "/placements");
    expect(
      listed.body.find((item) => item.id === PLACEMENT_IDS.muntanyaJumping)?.buildSheetFileKey,
    ).toBe(nextKey);

    // Another purpose, another club's key, a key bound to another placement, an unknown key.
    const image = await upload("admin", "COURSE_IMAGE", "image/png", new Uint8Array([1]));
    const theirs = await upload("coursesOtherClub", "BUILD_SHEET", "application/pdf", pdf);
    for (const key of [image, theirs, nextKey, "50000000-0000-4000-8000-000000000001/courses/x"]) {
      const refused = await call<Schemas["ApiError"]>(
        "admin",
        "POST",
        `/placements/${PLACEMENT_IDS.centralLeague}/build-sheet`,
        { fileKey: key },
      );
      expect(refused, key).toMatchObject({ body: { code: "NOT_FOUND" }, status: 404 });
    }
    // An empty fileKey is a validation error; an unknown placement is NOT_FOUND.
    const empty = await call<Schemas["ApiError"]>("admin", "POST", path, { fileKey: "" });
    expect(empty).toMatchObject({
      body: { code: "VALIDATION_ERROR", details: { fieldErrors: [{ field: "fileKey" }] } },
      status: 400,
    });
    const unknown = await call<Schemas["ApiError"]>(
      "admin",
      "POST",
      "/placements/placement-x/build-sheet",
      { fileKey: nextKey },
    );
    expect(unknown).toMatchObject({ body: { code: "NOT_FOUND" }, status: 404 });
  });

  it("R-16-05 PUT /placements/{id} replaces the placement: absent fields take the defaults (DRAFT, TRAINING, courses.defaultWarningThresholdM, null), never the stored values; buildSheetFileKey is kept and read", async () => {
    const stored = courseState.placements.find((item) => item.id === PLACEMENT_IDS.centralLeague);
    if (stored === undefined) throw new Error("PLACEMENT_NOT_FOUND");
    const one = await call<Schemas["Placement"]>(
      "admin",
      "GET",
      `/placements/${PLACEMENT_IDS.centralLeague}`,
    );
    expect(one.body.buildSheetFileKey).toBe(stored.buildSheetFileKey);
    const list = await call<Schemas["Placement"][]>("admin", "GET", "/placements");
    for (const item of list.body) {
      valid("Placement", item);
      expect(item).toHaveProperty("buildSheetFileKey");
    }
    expect(
      list.body.find((item) => item.id === PLACEMENT_IDS.muntanyaJumping)?.buildSheetFileKey,
    ).toBeNull();

    const base: Schemas["PlacementRequest"] & { version: number } = {
      courseId: stored.courseId,
      courseVersion: 1,
      placementMode: stored.placementMode,
      resolvedObstacles: stored.resolvedObstacles,
      ringId: stored.ringId,
      transform: stored.transform,
      version: stored.version,
      warnings: [],
    };
    const path = `/placements/${PLACEMENT_IDS.centralLeague}`;
    const custom = await call<Schemas["Placement"]>("admin", "PUT", path, {
      ...base,
      warningThresholdM: 2.5,
    });
    // The stored EVENT, READY_TO_BUILD, name and activity are not kept.
    expect(custom.body).toMatchObject({
      activityId: null,
      mode: "TRAINING",
      name: null,
      status: "DRAFT",
      warningThresholdM: 2.5,
    });
    const replaced = await call<Schemas["Placement"]>("admin", "PUT", path, {
      ...base,
      version: custom.body.version,
    });
    expect(replaced.status).toBe(200);
    expect(replaced.body).toMatchObject({
      activityId: null,
      buildSheetFileKey: stored.buildSheetFileKey,
      displayName: null,
      grades: [],
      mode: "TRAINING",
      name: null,
      scheduledAt: null,
      sizes: [],
      status: "DRAFT",
      version: stored.version + 2,
      warningThresholdM: 1.5,
    });
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

  it("R-16-05 placements: PLACEMENT_BLOCKED {warnings} without force, FORBIDDEN for an INSTRUCTOR's force, RING_WITHOUT_GEOMETRY, STALE_VERSION and PLACEMENT_RING_MISMATCH on PUT", async () => {
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
  });

  it("R-16-08 / T-16-18 dismantle → DISMANTLED (no ACTIVE setup left on the ring); renewal of an ACTIVE setup → a new expiresAt counted from today; renewal or dismantle of another status → 409 INVALID_STATE", async () => {
    const dismantled = await call<Schemas["RingSetup"]>(
      "instructor",
      "POST",
      `/ring-setups/${SETUP_IDS.muntanyaActive}/dismantle`,
    );
    expect(dismantled.status).toBe(200);
    valid("RingSetup", dismantled.body);
    expect(dismantled.body).toMatchObject({
      dismantledByAccountId: "10000000-0000-4000-8000-000000000003",
      status: "DISMANTLED",
    });
    expect(dismantled.body.dismantledAt).not.toBeNull();
    const history = await call<Schemas["RingSetupPage"]>(
      "admin",
      "GET",
      "/rings/ring-muntanya/setups",
    );
    expect(history.body.items.filter((item) => item.status === "ACTIVE")).toEqual([]);
    const twice = await call<Schemas["ApiError"]>(
      "admin",
      "POST",
      `/ring-setups/${SETUP_IDS.muntanyaActive}/dismantle`,
    );
    expect(twice).toMatchObject({ body: { code: "INVALID_STATE" }, status: 409 });

    const before = courseState.setups.find((item) => item.id === SETUP_IDS.centralPhoto);
    const renewed = await call<Schemas["RingSetup"]>(
      "admin",
      "POST",
      `/ring-setups/${SETUP_IDS.centralPhoto}/renewal`,
      { expectedUntil: null },
    );
    expect(renewed.status).toBe(200);
    valid("RingSetup", renewed.body);
    const days = Number(findParameter("courses.setupAutoExpireDays")?.value);
    expect(renewed.body).toMatchObject({
      expectedUntil: null,
      expiresAt: clubInstant(addDays(clubLocalDate(), days), "00:00"),
      status: "ACTIVE",
    });
    expect(renewed.body.expiresAt).not.toBe(before?.expiresAt);
    const yesterday = await call<Schemas["ApiError"]>(
      "admin",
      "POST",
      `/ring-setups/${SETUP_IDS.centralPhoto}/renewal`,
      { expectedUntil: addDays(clubLocalDate(), -1) },
    );
    expect(yesterday).toMatchObject({ body: { code: "VALIDATION_ERROR" }, status: 400 });
    const renewExpired = await call<Schemas["ApiError"]>(
      "admin",
      "POST",
      `/ring-setups/${SETUP_IDS.muntanyaExpired}/renewal`,
      {},
    );
    expect(renewExpired).toMatchObject({ body: { code: "INVALID_STATE" }, status: 409 });
  });

  it("R-16-07 setups: a new one replaces the active one (replacedSetupId, DISMANTLED in the history); the source rules", async () => {
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

  it("R-16-13 without COURSES a new ring drops the hidden planned placement (patchTemplateClass, patchClass); the same ring keeps it", async () => {
    const templates = await call<Schemas["WeekTemplate"]>(
      "admin",
      "GET",
      "/week-templates/template-setmana-a",
    );
    const item = templates.body.classes.find((candidate) => candidate.ringId === "ring-muntanya");
    if (item === undefined) throw new Error("CLASS_NOT_FOUND");
    const path = `/week-templates/${templates.body.id}/classes/${item.id}`;
    const planned = await call<Schemas["WeekTemplate"]>("admin", "PATCH", path, {
      placementId: PLACEMENT_IDS.muntanyaJumping,
      version: templates.body.version,
    });
    expect(planned.status).toBe(200);
    const same = await call<Schemas["WeekTemplate"]>("adminNoCourses", "PATCH", path, {
      ringId: "ring-muntanya",
      version: planned.body.version,
    });
    expect(same.status).toBe(200);
    expect(same.body.classes.find((candidate) => candidate.id === item.id)?.placementId).toBe(
      PLACEMENT_IDS.muntanyaJumping,
    );
    const moved = await call<Schemas["WeekTemplate"]>("adminNoCourses", "PATCH", path, {
      ringId: "ring-central",
      version: same.body.version,
    });
    expect(moved.status).toBe(200);
    const template = moved.body.classes.find((candidate) => candidate.id === item.id);
    expect(template).toMatchObject({ placementId: null, ringId: "ring-central" });

    // The D4 week of the calendar world (Wednesday 12 August 2026, `calendar-handlers.test.ts`).
    vi.useFakeTimers({ now: new Date("2026-08-12T08:00:00Z"), toFake: ["Date"] });
    resetPlanningState();
    const id = "cls-2026-08-12-1850-0";
    const session = await call<Schemas["ClassSession"]>("admin", "PATCH", `/class-sessions/${id}`, {
      placementId: PLACEMENT_IDS.centralLeague,
      version: 1,
    });
    expect(session).toMatchObject({
      body: { placementId: PLACEMENT_IDS.centralLeague, ringId: "ring-central" },
      status: 200,
    });
    const sessionMoved = await call<Schemas["ClassSession"]>(
      "adminNoCourses",
      "PATCH",
      `/class-sessions/${id}`,
      { cancelBookings: true, ringId: "ring-muntanya", version: session.body.version },
    );
    expect(sessionMoved).toMatchObject({
      body: { placementId: null, ringId: "ring-muntanya" },
      status: 200,
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
