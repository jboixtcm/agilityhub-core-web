import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import openapiDocument from "../../openapi/openapi.json";
import pendingDocument from "../../openapi/pending.json";
import { isApiError } from "../api-error";
import { createApiClient } from "../client";

import { ACTIVITY_IDS, activityState, MEMBER_ID } from "./fixtures/activities";
import { mockScenario, resetActivityState, resetSettingsState } from "./handlers";
import { server } from "./server";

type SchemaMap = Record<string, { properties?: Record<string, unknown> }>;

/** Same merge as `scripts/generate.mjs`: pending schemas, then the `x-schema-overlays`. */
function withOverlays(schemas: SchemaMap): SchemaMap {
  const overlays = (pendingDocument as { "x-schema-overlays"?: SchemaMap })["x-schema-overlays"];
  const merged: SchemaMap = { ...schemas };
  for (const [name, overlay] of Object.entries(overlays ?? {})) {
    const published = merged[name] ?? {};
    merged[name] = { ...published, properties: { ...published.properties, ...overlay.properties } };
  }
  return merged;
}

const openapiSchemaId = "https://agilityhub.local/activities-openapi.json";
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(
  {
    ...openapiDocument,
    components: {
      ...openapiDocument.components,
      schemas: withOverlays({
        ...(openapiDocument.components.schemas as SchemaMap),
        ...(pendingDocument.components.schemas as SchemaMap),
      }),
    },
  },
  openapiSchemaId,
);
const schema = (name: string) =>
  ajv.compile({ $ref: `${openapiSchemaId}#/components/schemas/${name}` });

function expectValid(name: string, value: unknown) {
  const validate = schema(name);
  expect(validate(value), JSON.stringify(validate.errors, null, 2)).toBe(true);
}

let client = createApiClient({ baseUrl: "https://core.example.test/api/v1" });
// The D7 and 04 mockups are read on Tuesday 4 August 2026 (club-local).
const mockupNow = new Date("2026-08-04T08:00:00Z");

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  vi.useFakeTimers({ now: mockupNow, toFake: ["Date"] });
  resetActivityState();
  mockScenario("admin");
  client = createApiClient({ baseUrl: "https://core.example.test/api/v1", getLocale: () => "ca" });
});
afterEach(() => {
  server.resetHandlers();
  vi.useRealTimers();
  resetActivityState();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (isApiError(error))
      return { code: error.code, details: error.details, status: error.status };
    throw error;
  }
  throw new Error("Expected an ApiError");
}

describe("E4-W04 activity MSW handlers follow the S07 contract (forms A, B and the D7 list)", () => {
  it("lists the D7 activities by date desc without the deleted ones (ListPage + overlay)", async () => {
    const { data } = await client.GET("/activities", {
      params: { query: { filter: ["deleted:eq:false"] } },
    });
    expectValid("ListPageActivityListItem", data);
    expect(data?.items.map((item) => [item.title, item.typeDisplay, item.state])).toEqual([
      ["Demostració Festa Major", "demostració", "DRAFT"],
      ["Lliga social — 3a jornada", "lliga social", "PUBLISHED"],
      ["Seminari de handling", "seminari", "PUBLISHED"],
      ["Taller de contactes", "seminari", "PUBLISHED"],
      ["Torneig d'Estiu 2026", "competició", "PUBLISHED"],
    ]);
    const tournament = data?.items.at(-1);
    expect(tournament).toMatchObject({
      allRings: true,
      endTime: "20:30",
      maxPlaces: 40,
      registrationTo: "2026-08-06",
      registrations: { active: 22, waiting: 0 },
      startTime: "18:30",
    });
    await expect(
      failure(client.GET("/activities", { params: { query: { filter: ["title:eq:x"] } } })),
    ).resolves.toMatchObject({ code: "INVALID_FILTER", status: 400 });
  });

  it("serves form A, the member forms, the conflicts and the cancellation preview", async () => {
    const tournament = await client.GET("/activities/{id}", {
      params: { path: { id: ACTIVITY_IDS.tournament } },
    });
    expectValid("Activity", tournament.data);
    expect(tournament.data).toMatchObject({
      counters: { active: 22, waiting: 0 },
      freeSeats: 18,
      publicUrl: "https://agilitycanic.cat/activitat/torneig-estiu-2026",
      startsAt: "2026-08-07T16:30:00Z",
      typeDisplay: "competició",
    });
    const preview = await client.GET("/activities/{id}/cancellation-preview", {
      params: { path: { id: ACTIVITY_IDS.tournament } },
    });
    expectValid("ActivityCancellationPreview", preview.data);
    expect(preview.data?.registrations).toHaveLength(22);
    expect(preview.data?.activeCount).toBe(22);

    const registrants = await client.GET("/activities/{id}/registrations", {
      params: { path: { id: ACTIVITY_IDS.workshop } },
    });
    expectValid("ListPageActivityRegistrationListItem", registrants.data);
    expect(
      registrants.data?.items
        .filter((item) => item.state === "WAITLISTED")
        .map((item) => item.position),
    ).toEqual([1, 2]);

    mockScenario("member");
    const mine = await client.GET("/me/activities");
    expectValid("MeActivities", mine.data);
    expect(
      mine.data?.bookable.map((row) => [row.title, row.rowState, row.freeSeats, row.waiting]),
    ).toEqual([
      ["Taller de contactes", "FULL_WAITLIST", 0, 2],
      ["Seminari de handling", "OPEN", 6, 0],
    ]);
    expect(mine.data?.mine.map((item) => [item.activity.title, item.state])).toEqual([
      ["Torneig d'Estiu 2026", "ACTIVE"],
    ]);
    const detail = await client.GET("/me/activities/{activityId}", {
      params: { path: { activityId: ACTIVITY_IDS.tournament } },
    });
    expectValid("MemberActivityDetail", detail.data);
    expect(detail.data?.myRegistration).toMatchObject({
      activity: { placeLabel: "totes les pistes", startsAtLocal: "2026-08-07T18:30" },
      state: "ACTIVE",
    });
    await expect(
      failure(
        client.GET("/me/activities/{activityId}", {
          params: { path: { activityId: ACTIVITY_IDS.demonstration } },
        }),
      ),
    ).resolves.toMatchObject({ code: "NOT_FOUND", status: 404 });
  });

  it("R-07-05 publishes the draft only after the conflict options (409 → 422 → 200)", async () => {
    const draft = await client.GET("/activities/{id}", {
      params: { path: { id: ACTIVITY_IDS.demonstration } },
    });
    const patched = await client.PATCH("/activities/{id}", {
      body: {
        endTime: "20:30",
        location: { atClub: true },
        registrationFrom: "2026-09-01",
        registrationTo: "2026-10-01",
        ringIds: ["ring-central", "ring-muntanya"],
        startTime: "18:30",
        version: draft.data?.version ?? 0,
      },
      params: { path: { id: ACTIVITY_IDS.demonstration } },
    });
    expect(patched.data?.version).toBe(2);
    const conflicts = await client.GET("/activities/{id}/ring-conflicts", {
      params: { path: { id: ACTIVITY_IDS.demonstration } },
    });
    expectValid("RingConflicts", conflicts.data);
    expect(conflicts.data?.conflicts.map((item) => [item.label, item.bookedCount])).toEqual([
      ["B+C", 3],
    ]);
    expect(conflicts.data?.trainingBookings).toHaveLength(1);

    const publish = (body: Record<string, unknown>) =>
      client.POST("/activities/{id}/publication", {
        body,
        params: {
          header: { "Idempotency-Key": crypto.randomUUID() },
          path: { id: ACTIVITY_IDS.demonstration },
        },
      });
    await expect(failure(publish({ notifyEmail: false }))).resolves.toMatchObject({
      code: "RING_BLOCK_CONFLICT",
      status: 409,
    });
    await expect(failure(publish({ cancelClasses: true }))).resolves.toMatchObject({
      code: "ADMIN_TEXT_REQUIRED",
      status: 422,
    });
    await expect(
      failure(publish({ adminText: "Classe anul·lada", cancelClasses: true })),
    ).resolves.toMatchObject({ code: "RING_HAS_BOOKINGS", status: 422 });
    const published = await publish({
      adminText: "Classe anul·lada",
      cancelBookings: true,
      cancelClasses: true,
    });
    expect(published.data?.state).toBe("PUBLISHED");
  });

  it("R-07-06 cancels with registrants only with the notice text", async () => {
    const cancel = (adminText?: string) =>
      client.POST("/activities/{id}/cancellation", {
        body: { reason: "CLUB_MANUAL", ...(adminText === undefined ? {} : { adminText }) },
        params: {
          header: { "Idempotency-Key": crypto.randomUUID() },
          path: { id: ACTIVITY_IDS.tournament },
        },
      });
    await expect(failure(cancel())).resolves.toMatchObject({
      code: "ADMIN_TEXT_REQUIRED",
      status: 422,
    });
    const cancelled = await cancel("Pluja forta: pistes tancades");
    expect(cancelled.data).toMatchObject({
      cancellation: { adminText: "Pluja forta: pistes tancades", affectedCount: 22 },
      counters: { active: 0, waiting: 0 },
      state: "CANCELLED",
    });
  });

  it("R-07-08/09 registers, answers ACTIVITY_FULL, joins the waitlist and promotes FIFO", async () => {
    mockScenario("member");
    const full = await failure(
      client.POST("/activity-registrations", {
        body: { activityId: ACTIVITY_IDS.workshop },
        params: { header: { "Idempotency-Key": crypto.randomUUID() } },
      }),
    );
    expect(full).toMatchObject({
      code: "ACTIVITY_FULL",
      details: { waitlistAvailable: true, waiting: 2 },
      status: 409,
    });
    const waiting = await client.POST("/activity-registrations", {
      body: { activityId: ACTIVITY_IDS.workshop, joinWaitlist: true },
      params: { header: { "Idempotency-Key": crypto.randomUUID() } },
    });
    expectValid("ActivityRegistration", waiting.data);
    expect(waiting.data).toMatchObject({ position: 3, state: "WAITLISTED" });

    const seminar = await client.POST("/activity-registrations", {
      body: { activityId: ACTIVITY_IDS.seminar },
      params: { header: { "Idempotency-Key": crypto.randomUUID() } },
    });
    expect(seminar.data?.state).toBe("ACTIVE");
    await expect(
      failure(
        client.POST("/activity-registrations", {
          body: { activityId: ACTIVITY_IDS.seminar },
          params: { header: { "Idempotency-Key": crypto.randomUUID() } },
        }),
      ),
    ).resolves.toMatchObject({ code: "ALREADY_REGISTERED", status: 409 });

    // One more place (admin PATCH) promotes waitlist position 1; the member keeps position 3.
    mockScenario("admin");
    const workshop = await client.GET("/activities/{id}", {
      params: { path: { id: ACTIVITY_IDS.workshop } },
    });
    await client.PATCH("/activities/{id}", {
      body: { maxPlaces: 11, version: workshop.data?.version ?? 0 },
      params: { path: { id: ACTIVITY_IDS.workshop } },
    });
    const registrants = await client.GET("/activities/{id}/registrations", {
      params: { path: { id: ACTIVITY_IDS.workshop } },
    });
    expect(
      registrants.data?.items
        .filter(
          (item) => item.registrationId === "registration-taller-11" || item.state === "WAITLISTED",
        )
        .map((item) => [item.registrationId, item.state, item.position ?? null]),
    ).toEqual([
      ["registration-taller-11", "ACTIVE", null],
      ["registration-taller-12", "WAITLISTED", 2],
      [waiting.data?.id, "WAITLISTED", 3],
    ]);
  });

  it("R-07-14 without WAITLIST a full activity answers ACTIVITY_FULL {waitlistAvailable: false}", async () => {
    mockScenario("activitiesNoWaitlist");
    await expect(
      failure(
        client.POST("/activity-registrations", {
          body: { activityId: ACTIVITY_IDS.workshop, joinWaitlist: true },
          params: { header: { "Idempotency-Key": crypto.randomUUID() } },
        }),
      ),
    ).resolves.toMatchObject({ details: { waitlistAvailable: false } });
  });

  it("R-07-09 refuses to cancel after the start (EVENT_START)", async () => {
    mockScenario("member");
    vi.setSystemTime(new Date("2026-08-07T16:31:00Z"));
    await expect(
      failure(
        client.POST("/activity-registrations/{id}/cancellation", {
          body: {},
          params: { path: { id: "registration-torneig-03" } },
        }),
      ),
    ).resolves.toMatchObject({ code: "REGISTRATION_NOT_CANCELLABLE", status: 422 });
  });

  it("R-07-14 answers MODULE_DISABLED without ACTIVITIES and 403 to an instructor's mutation", async () => {
    mockScenario("instructor");
    const read = await client.GET("/activities/{id}", {
      params: { path: { id: ACTIVITY_IDS.tournament } },
    });
    expect(read.data?.internalNotes).toBeUndefined();
    await expect(
      failure(client.POST("/activities", { body: { title: { ca: "Nova" }, type: "OTHER" } })),
    ).resolves.toMatchObject({ status: 403 });
    // R-07-02: the slug of a repeated title gets «-2».
    mockScenario("catalogsNoFaq");
    const created = await client.POST("/activities", {
      body: { title: { ca: "Torneig d'Estiu 2026" }, type: "COMPETITION" },
    });
    expect(created.data).toMatchObject({ slug: "torneig-estiu-2026-2", state: "DRAFT" });

    // A club without ACTIVITIES (the minimal branding) answers 404 MODULE_DISABLED.
    mockScenario("minimalAdmin");
    await expect(failure(client.GET("/activities"))).resolves.toMatchObject({
      code: "MODULE_DISABLED",
      status: 404,
    });
    await expect(failure(client.GET("/me/activities"))).resolves.toMatchObject({
      code: "MODULE_DISABLED",
      status: 404,
    });
  });

  it("R-07-05 another ring block (type RING_BLOCK) is never forced, not even with every option", async () => {
    const demonstration = await client.GET("/activities/{id}", {
      params: { path: { id: ACTIVITY_IDS.demonstration } },
    });
    await client.PATCH("/activities/{id}", {
      body: {
        endTime: "20:30",
        location: { atClub: true },
        registrationFrom: "2026-09-01",
        registrationTo: "2026-10-01",
        ringIds: ["ring-central", "ring-petita"],
        startTime: "18:30",
        version: demonstration.data?.version ?? 0,
      },
      params: { path: { id: ACTIVITY_IDS.demonstration } },
    });
    const preview = await client.GET("/activities/{id}/ring-conflicts", {
      params: { path: { id: ACTIVITY_IDS.demonstration } },
    });
    expectValid("RingConflicts", preview.data);
    expect(preview.data?.conflicts.map((conflict) => [conflict.type, conflict.ringId])).toEqual([
      ["CLASS", "ring-central"],
      ["RING_BLOCK", "ring-petita"],
    ]);
    const forced = await failure(
      client.POST("/activities/{id}/publication", {
        body: { adminText: "Avís", cancelBookings: true, cancelClasses: true, notifyEmail: false },
        params: {
          header: { "Idempotency-Key": crypto.randomUUID() },
          path: { id: ACTIVITY_IDS.demonstration },
        },
      }),
    );
    expect(forced).toMatchObject({ code: "RING_BLOCK_CONFLICT", status: 409 });
    expect(
      (forced.details as { conflicts: { type: string }[] }).conflicts.map(
        (conflict) => conflict.type,
      ),
    ).toEqual(["RING_BLOCK"]);
  });

  it("R-07-08 a member's cancellation promotes waitlist position 1 (FIFO)", async () => {
    // Biel Roca holds the first place of the full «Taller de contactes» (10/10 + 2 waiting).
    const first = activityState.registrations.find(
      (registration) => registration.id === "registration-taller-01",
    );
    if (first === undefined) throw new TypeError("Missing registration-taller-01");
    first.member = {
      emails: ["biel.roca@example.test"],
      fullName: "Biel Roca",
      id: MEMBER_ID,
      memberNumber: "118",
      phones: [],
    };
    mockScenario("member");
    const cancelled = await client.POST("/activity-registrations/{id}/cancellation", {
      body: {},
      params: { path: { id: "registration-taller-01" } },
    });
    expectValid("ActivityRegistration", cancelled.data);
    expect(cancelled.data).toMatchObject({ state: "CANCELLED" });

    mockScenario("admin");
    const registrants = await client.GET("/activities/{id}/registrations", {
      params: { path: { id: ACTIVITY_IDS.workshop } },
    });
    expect(
      registrants.data?.items
        .filter((item) =>
          ["registration-taller-11", "registration-taller-12"].includes(item.registrationId),
        )
        .map((item) => [item.registrationId, item.state, item.position ?? null]),
    ).toEqual([
      ["registration-taller-11", "ACTIVE", null],
      ["registration-taller-12", "WAITLISTED", 2],
    ]);
    const workshop = await client.GET("/activities/{id}", {
      params: { path: { id: ACTIVITY_IDS.workshop } },
    });
    expect(workshop.data?.counters).toEqual({ active: 10, waiting: 1 });
  });

  it("CONVENCIONS_API §4 registrants `fields` as the published core: a column key is 400 INVALID_FILTER, keys not asked for come back null", async () => {
    await expect(
      client.GET("/activities/{id}/registrations", {
        params: { path: { id: ACTIVITY_IDS.workshop }, query: { fields: "member,contact" } },
      }),
    ).rejects.toMatchObject({ code: "INVALID_FILTER", status: 400 });
    const projected = await client.GET("/activities/{id}/registrations", {
      params: { path: { id: ACTIVITY_IDS.workshop }, query: { fields: "state" } },
    });
    expect(projected.data?.items[0]).toMatchObject({
      member: null,
      registrationId: null,
      state: "ACTIVE",
    });
    const whole = await client.GET("/activities/{id}/registrations", {
      params: { path: { id: ACTIVITY_IDS.workshop } },
    });
    expect(whole.data?.items[0]?.registrationId).toEqual(expect.any(String));

    // The activities list: `id` always travels; a flag not asked for reads `false`.
    const activities = await client.GET("/activities", { params: { query: { fields: "title" } } });
    const tournament = activities.data?.items.find((item) => item.title === "Torneig d'Estiu 2026");
    expect(tournament).toMatchObject({
      allRings: false,
      id: ACTIVITY_IDS.tournament,
      startTime: null,
      typeDisplay: null,
    });
    await expect(
      client.GET("/activities", { params: { query: { fields: "title,contact" } } }),
    ).rejects.toMatchObject({ code: "INVALID_FILTER", status: 400 });
  });

  it("E5-T15 a cancelled waitlisted registration keeps its position; a promoted one has none", async () => {
    // registration-taller-12 waits at position 2 of the full «Taller de contactes».
    const waiting = activityState.registrations.find(
      (registration) => registration.id === "registration-taller-12",
    );
    if (waiting === undefined) throw new TypeError("Missing registration-taller-12");
    waiting.member = {
      emails: ["biel.roca@example.test"],
      fullName: "Biel Roca",
      id: MEMBER_ID,
      memberNumber: "118",
      phones: [],
    };
    mockScenario("member");
    const cancelled = await client.POST("/activity-registrations/{id}/cancellation", {
      body: {},
      params: { path: { id: "registration-taller-12" } },
    });
    expectValid("ActivityRegistration", cancelled.data);
    expect(cancelled.data).toMatchObject({ position: 2, state: "CANCELLED" });

    mockScenario("admin");
    const registrants = await client.GET("/activities/{id}/registrations", {
      params: { path: { id: ACTIVITY_IDS.workshop } },
    });
    expect(
      registrants.data?.items
        .filter((item) =>
          ["registration-taller-11", "registration-taller-12"].includes(item.registrationId),
        )
        .map((item) => [item.registrationId, item.state, item.position ?? null]),
    ).toEqual([
      ["registration-taller-11", "WAITLISTED", 1],
      ["registration-taller-12", "CANCELLED", 2],
    ]);
  });

  it("R-07-04 requires the title in the club's default locale, not in ca", async () => {
    const titleOnly = async (title: Record<string, string>) => {
      const current = await client.GET("/activities/{id}", {
        params: { path: { id: ACTIVITY_IDS.demonstration } },
      });
      await client.PATCH("/activities/{id}", {
        body: {
          registrationFrom: "2026-09-01",
          registrationTo: "2026-10-01",
          title,
          version: current.data?.version ?? 0,
        },
        params: { path: { id: ACTIVITY_IDS.demonstration } },
      });
      return client.POST("/activities/{id}/publication", {
        body: { notifyEmail: false },
        params: {
          header: { "Idempotency-Key": crypto.randomUUID() },
          path: { id: ACTIVITY_IDS.demonstration },
        },
      });
    };
    await expect(failure(titleOnly({ es: "Demostración Fiesta Mayor" }))).resolves.toMatchObject({
      code: "ACTIVITY_INCOMPLETE",
      details: { fieldErrors: [{ code: "REQUIRED", field: "title" }] },
    });
    resetActivityState();
    mockScenario("activitiesDefaultEs");
    const published = await titleOnly({ es: "Demostración Fiesta Mayor" });
    expect(published.data?.state).toBe("PUBLISHED");
  });

  it("S07 §3 an activity without an end time has endsAtLocal null, as the api (S07 «Canvis» 24-09, E3-T16 round-2 snapshot)", async () => {
    mockScenario("member");
    vi.setSystemTime(new Date("2026-09-02T08:00:00Z"));
    const { data } = await client.GET("/me/activities");
    expectValid("MeActivities", data);
    const league = data?.bookable.find((row) => row.id === ACTIVITY_IDS.league);
    expect(league).toMatchObject({
      endsAtLocal: null,
      startsAtLocal: "2026-09-19T09:00",
    });
  });
});

describe("E4-W08 activity mocks answer like the api (impersonation, parameters)", () => {
  it("R-07-09/10 E4-W10 an impersonated cancellation without a reason is 400 VALIDATION_ERROR with details.field = reason, as the core's CancellationDeadline answers; with it, ADMIN", async () => {
    mockScenario("impersonated");
    const registered = await client.POST("/activity-registrations", {
      body: { activityId: ACTIVITY_IDS.tournament },
      params: { header: { "Idempotency-Key": crypto.randomUUID() } },
    });
    expect(registered.data).toMatchObject({ origin: "BACKOFFICE", state: "ACTIVE" });
    const id = registered.data?.id ?? "";

    for (const body of [{}, { reason: "   " }]) {
      await expect(
        failure(
          client.POST("/activity-registrations/{id}/cancellation", {
            body,
            params: { path: { id } },
          }),
        ),
      ).resolves.toEqual({
        code: "VALIDATION_ERROR",
        details: { field: "reason" },
        status: 400,
      });
    }
    const cancelled = await client.POST("/activity-registrations/{id}/cancellation", {
      body: { reason: "Ho demana per telèfon" },
      params: { path: { id } },
    });
    expectValid("ActivityRegistration", cancelled.data);
    expect(cancelled.data).toMatchObject({
      cancellation: { byRole: "ADMIN", reason: "ADMIN" },
      state: "CANCELLED",
    });
  });

  it("R-07-09 a member's own cancellation keeps sending {} and is recorded as MEMBER", async () => {
    mockScenario("member");
    const cancelled = await client.POST("/activity-registrations/{id}/cancellation", {
      body: {},
      params: { path: { id: "registration-torneig-03" } },
    });
    expect(cancelled.data).toMatchObject({
      cancellation: { byRole: "MEMBER", reason: "MEMBER" },
      state: "CANCELLED",
    });
  });

  it("MATRIU_PERMISOS `/parameters/{key}` answers 403 FORBIDDEN to an INSTRUCTOR, the value to an ADMIN", async () => {
    mockScenario("instructor");
    await expect(
      failure(client.GET("/parameters/{key}", { params: { path: { key: "levels.enabled" } } })),
    ).resolves.toMatchObject({ code: "FORBIDDEN", status: 403 });
    mockScenario("activitiesInstructorNoLevels");
    await expect(
      failure(client.GET("/parameters/{key}", { params: { path: { key: "levels.enabled" } } })),
    ).resolves.toMatchObject({ code: "FORBIDDEN", status: 403 });
    mockScenario("activitiesNoLevels");
    const admin = await client.GET("/parameters/{key}", {
      params: { path: { key: "levels.enabled" } },
    });
    expect(admin.data?.value).toBe(false);
  });
});

describe("E4-W11 T-07-04 R-07-05 the ring-block window must fit club.openingHours, as the api answers", () => {
  const weekdays = [
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
    "SUNDAY",
  ] as const;

  afterEach(() => {
    resetSettingsState();
  });

  /** `club.openingHours` through the api: the listed days open `open`–`close`, the rest closed. */
  async function putOpeningHours(days: readonly string[], open = "07:00", close = "22:00") {
    const current = await client.GET("/club/opening-hours");
    await client.PUT("/club/opening-hours", {
      body: {
        value: Object.fromEntries(days.map((day) => [day, { close, open }])),
        version: current.data?.version ?? 1,
      },
    });
  }

  const publish = () =>
    client.POST("/activities/{id}/publication", {
      body: { notifyEmail: false },
      params: {
        header: { "Idempotency-Key": crypto.randomUUID() },
        path: { id: ACTIVITY_IDS.demonstration },
      },
    });

  async function patchDemonstration(body: Record<string, unknown>) {
    const current = await client.GET("/activities/{id}", {
      params: { path: { id: ACTIVITY_IDS.demonstration } },
    });
    return client.PATCH("/activities/{id}", {
      body: { ...body, version: current.data?.version ?? 0 },
      params: { path: { id: ACTIVITY_IDS.demonstration } },
    });
  }

  it("publication: a closed Sunday is 422 OUTSIDE_OPENING_HOURS without a field; 06:00 with a 07:00 opening too; 10:00 publishes", async () => {
    // The Demostració (Sunday 4/10) moved to the club on Cadells, where nothing else is booked.
    await patchDemonstration({
      endTime: "12:00",
      location: { atClub: true },
      registrationFrom: "2026-09-01",
      registrationTo: "2026-10-01",
      ringIds: ["ring-cadells"],
      startTime: "10:00",
    });
    await putOpeningHours(weekdays.filter((day) => day !== "SUNDAY"));
    await expect(failure(publish())).resolves.toEqual({
      code: "OUTSIDE_OPENING_HOURS",
      details: {},
      status: 422,
    });
    expect(
      activityState.activities.find((item) => item.id === ACTIVITY_IDS.demonstration)?.state,
    ).toBe("DRAFT");

    // Open again, but the draft starts at 6:00: a draft never blocks, so the PATCH is accepted and
    // the publication is refused.
    await putOpeningHours(weekdays);
    expect((await patchDemonstration({ startTime: "06:00" })).data?.startTime).toBe("06:00");
    await expect(failure(publish())).resolves.toMatchObject({
      code: "OUTSIDE_OPENING_HOURS",
      status: 422,
    });
    await patchDemonstration({ startTime: "10:00" });
    expect((await publish()).data?.state).toBe("PUBLISHED");
  });

  it("PATCH of a published activity: a resync on a closed Friday is 422 and changes nothing; notes alone are saved; a wider ringBlockWindow is checked too", async () => {
    const tournament = () =>
      client.GET("/activities/{id}", { params: { path: { id: ACTIVITY_IDS.tournament } } });
    const patch = (body: Record<string, unknown>, version: number) =>
      client.PATCH("/activities/{id}", {
        body: { ...body, version },
        params: { path: { id: ACTIVITY_IDS.tournament } },
      });
    const before = (await tournament()).data;
    if (before === undefined) throw new TypeError("Missing the Torneig");
    // The Torneig is on Friday 7/08, which the club no longer opens.
    await putOpeningHours(weekdays.filter((day) => day !== "FRIDAY"));
    await expect(failure(patch({ endTime: "21:00" }, before.version))).resolves.toEqual({
      code: "OUTSIDE_OPENING_HOURS",
      details: {},
      status: 422,
    });
    await expect(
      failure(patch({ ringIds: ["ring-central"] }, before.version)),
    ).resolves.toMatchObject({ code: "OUTSIDE_OPENING_HOURS", status: 422 });
    expect((await tournament()).data).toMatchObject({
      endTime: "20:30",
      ringIds: before.ringIds,
      version: before.version,
    });
    // No resync without date, hours, rings, window or place: the notes are saved.
    const noted = await patch({ internalNotes: "Revisar l'horari" }, before.version);
    expect(noted.data?.version).toBe(before.version + 1);

    // Friday open 18:00–22:00: 18:30–20:30 fits, a set-up window from 17:30 does not (checked
    // before the ring conflicts, which the options would resolve).
    await putOpeningHours(weekdays, "18:00", "22:00");
    const force = { adminText: "Muntatge del Torneig", cancelBookings: true, cancelClasses: true };
    await expect(
      failure(
        patch(
          { ...force, ringBlockWindow: { fromTime: "17:30", toTime: "21:00" } },
          before.version + 1,
        ),
      ),
    ).resolves.toMatchObject({ code: "OUTSIDE_OPENING_HOURS", status: 422 });
    const widened = await patch(
      { ...force, ringBlockWindow: { fromTime: "18:00", toTime: "21:00" } },
      before.version + 1,
    );
    expect(widened.data?.ringBlockWindow).toEqual({ fromTime: "18:00", toTime: "21:00" });
  });

  it("E4-W14 S07 §6 the ring-conflicts preview refuses the window the publication would: 422 OUTSIDE_OPENING_HOURS and 400 INVALID_TIME_RANGE, without a field", async () => {
    const preview = () =>
      client.GET("/activities/{id}/ring-conflicts", {
        params: { path: { id: ACTIVITY_IDS.demonstration } },
      });
    const stored = () => {
      const activity = activityState.activities.find(
        (item) => item.id === ACTIVITY_IDS.demonstration,
      );
      if (activity === undefined) throw new TypeError("Missing the Demostració");
      return activity;
    };
    // The Demostració (Sunday 4/10) at the club on Cadells, 10:00–12:00.
    await patchDemonstration({
      endTime: "12:00",
      location: { atClub: true },
      registrationFrom: "2026-09-01",
      registrationTo: "2026-10-01",
      ringIds: ["ring-cadells"],
      startTime: "10:00",
    });
    expect((await preview()).data).toEqual({ conflicts: [], trainingBookings: [] });

    // A closed Sunday: the preview answers like the publication.
    await putOpeningHours(weekdays.filter((day) => day !== "SUNDAY"));
    await expect(failure(preview())).resolves.toEqual({
      code: "OUTSIDE_OPENING_HOURS",
      details: {},
      status: 422,
    });
    await expect(failure(publish())).resolves.toMatchObject({ code: "OUTSIDE_OPENING_HOURS" });

    // Open again, but a draft saved at 6:00 against a 7:00 opening.
    await putOpeningHours(weekdays);
    await patchDemonstration({ startTime: "06:00" });
    await expect(failure(preview())).resolves.toMatchObject({
      code: "OUTSIDE_OPENING_HOURS",
      status: 422,
    });

    // A set-up window that ends before it starts: 400 for the preview and the publication alike.
    await patchDemonstration({ startTime: "10:00" });
    stored().ringBlockWindow = { fromTime: "12:00", toTime: "10:00" };
    await expect(failure(preview())).resolves.toEqual({
      code: "INVALID_TIME_RANGE",
      details: {},
      status: 400,
    });
    await expect(failure(publish())).resolves.toMatchObject({
      code: "INVALID_TIME_RANGE",
      status: 400,
    });
    // Shorter than `training.slotMinutes` (30 in the mock club): refused alike (R-07-05).
    stored().ringBlockWindow = { fromTime: "10:00", toTime: "10:20" };
    await expect(failure(preview())).resolves.toMatchObject({
      code: "INVALID_TIME_RANGE",
      status: 400,
    });
    stored().ringBlockWindow = { fromTime: "10:00", toTime: "10:30" };
    expect((await preview()).data).toEqual({ conflicts: [], trainingBookings: [] });
    expect(stored().state).toBe("DRAFT");

    // Away from the club nothing blocks: the preview is empty whatever the hours.
    stored().ringBlockWindow = null;
    await patchDemonstration({ location: { atClub: false, name: "Plaça Major" }, ringIds: [] });
    await putOpeningHours(weekdays.filter((day) => day !== "SUNDAY"));
    expect((await preview()).data).toEqual({ conflicts: [], trainingBookings: [] });
  });
});
