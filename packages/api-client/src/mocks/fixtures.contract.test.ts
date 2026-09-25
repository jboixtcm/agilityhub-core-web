import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import Ajv2020, { type AnySchema } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

import openapiDocument from "../../openapi/openapi.json";
import pendingDocument from "../../openapi/pending.json";

import {
  cancellationPreviewFor,
  clubInstant,
  initialClassSessions,
  initialRingBlocks,
} from "./fixtures/calendar";
import { catalogState } from "./fixtures/catalogs";
import {
  DAY_GRID_ACTIVITY_DATE,
  DAY_GRID_EMPTY_DATE,
  DAY_GRID_INSTRUCTOR_DATE,
  DAY_GRID_MEMBER_DATE,
  dayGridClassSessions,
  dayGridFixture,
  dayGridMemberSession,
  dayGridState,
  memberBlockView,
} from "./fixtures/day-grid";
import {
  coverageFixture,
  initialWeeks,
  initialWeekTemplates,
  mockDisplayDescription,
  mockWeek,
} from "./fixtures/planning";
import { signupConfig, signupMemberFixture, signupResultUpfront } from "./fixtures/signup";
import {
  addDogSignupReview,
  derivedSignupReview,
  signupReviewBaseline,
  signupReviewDryRun,
  signupReviewVariant,
} from "./fixtures/signup-review";
import { planningLevels } from "./planning-handlers";

const fixturesDirectory = fileURLToPath(new URL("./fixtures", import.meta.url));
const openapiSchemaId = "https://agilityhub.local/openapi.json";

const schemasByFixture: Readonly<Record<string, AnySchema>> = {
  "audit-entries.json": {
    items: { $ref: `${openapiSchemaId}#/components/schemas/AuditEntryListItem` },
    type: "array",
  },
  "branding-canic.json": {
    $ref: `${openapiSchemaId}#/components/schemas/BrandingResponse`,
  },
  "branding-minim.json": {
    $ref: `${openapiSchemaId}#/components/schemas/BrandingResponse`,
  },
  "club-pages.json": {
    items: { $ref: `${openapiSchemaId}#/components/schemas/ClubPage` },
    type: "array",
  },
  "dashboard.json": { $ref: `${openapiSchemaId}#/components/schemas/Dashboard` },
  "export-jobs.json": {
    items: { $ref: `${openapiSchemaId}#/components/schemas/ExportJob` },
    type: "array",
  },
  "me-admin.json": { $ref: `${openapiSchemaId}#/components/schemas/Me` },
  "me-impersonated.json": { $ref: `${openapiSchemaId}#/components/schemas/Me` },
  "me-instructor.json": { $ref: `${openapiSchemaId}#/components/schemas/Me` },
  "me-member.json": { $ref: `${openapiSchemaId}#/components/schemas/Me` },
  "me-multi-profile.json": { $ref: `${openapiSchemaId}#/components/schemas/Me` },
  "member-signup-review.json": {
    $ref: `${openapiSchemaId}#/components/schemas/MemberSignupView`,
  },
  "sessions.json": {
    items: { $ref: `${openapiSchemaId}#/components/schemas/Session` },
    type: "array",
  },
  "signup-config-canic.json": {
    $ref: `${openapiSchemaId}#/components/schemas/SignupConfig`,
  },
};

type SchemaMap = Record<string, { properties?: Record<string, unknown> }>;

/** Same merge as `scripts/generate.mjs`: pending schemas, then the `x-schema-overlays` properties. */
function withOverlays(schemas: SchemaMap): SchemaMap {
  const overlays = (pendingDocument as { "x-schema-overlays"?: SchemaMap })["x-schema-overlays"];
  const merged: SchemaMap = { ...schemas };
  for (const [name, overlay] of Object.entries(overlays ?? {})) {
    const published = merged[name] ?? {};
    merged[name] = {
      ...published,
      properties: { ...published.properties, ...overlay.properties },
    };
  }
  return merged;
}

const mergedDocument = {
  ...openapiDocument,
  paths: { ...openapiDocument.paths, ...pendingDocument.paths },
  components: {
    ...openapiDocument.components,
    schemas: withOverlays({
      ...(openapiDocument.components.schemas as SchemaMap),
      ...(pendingDocument.components.schemas as SchemaMap),
    }),
  },
};

describe("T-01-25 OpenAPI mock fixture contract", () => {
  const fixtureFiles = readdirSync(fixturesDirectory)
    .filter((name) => name.endsWith(".json"))
    .sort();

  it("maps every JSON fixture to an authoritative component schema", () => {
    expect(fixtureFiles).toEqual(Object.keys(schemasByFixture).sort());
  });

  it.each(fixtureFiles)("validates %s", (fixtureFile) => {
    const fixtureSchema = schemasByFixture[fixtureFile];
    if (fixtureSchema === undefined) {
      throw new TypeError(`No component schema is mapped for ${fixtureFile}`);
    }
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    ajv.addSchema(mergedDocument, openapiSchemaId);
    const validate = ajv.compile(fixtureSchema);
    const fixture: unknown = JSON.parse(
      readFileSync(new URL(`./fixtures/${fixtureFile}`, import.meta.url), "utf8"),
    );

    expect(validate(fixture), JSON.stringify(validate.errors, null, 2)).toBe(true);
  });
});

describe("E4-W01 planning fixtures follow the S06 contract (WeekTemplate, Coverage, WeekListItem)", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(mergedDocument, openapiSchemaId);
  const schema = (name: string) =>
    ajv.compile({ $ref: `${openapiSchemaId}#/components/schemas/${name}` });

  it.each(initialWeekTemplates.map((template) => [template.name, template] as const))(
    "validates the %s template",
    (_name, template) => {
      const validate = schema("WeekTemplate");
      expect(validate(template), JSON.stringify(validate.errors, null, 2)).toBe(true);
    },
  );

  it("validates the E29 level catalog (Level.progression overlay of pending.json)", () => {
    // Only the overlay property: the catalog mock ids are readable slugs, not the contract's uuids.
    const validate = ajv.compile({
      $ref: `${openapiSchemaId}#/components/schemas/Level/properties/progression`,
    });
    for (const level of catalogState.levels) {
      expect(validate(level.progression), `${level.name}: ${JSON.stringify(validate.errors)}`).toBe(
        true,
      );
    }
    expect(validate("yes")).toBe(false);
    expect(
      catalogState.levels.filter((level) => !level.progression).map((level) => level.name),
    ).toEqual(["Teràpia"]);
  });

  it("keeps every fixture description equal to the mock resolver, so an edit never flips «D i sup.»", () => {
    const levels = planningLevels();
    for (const template of initialWeekTemplates) {
      for (const item of template.classes) {
        expect(
          mockDisplayDescription(levels, item.levelIds, item.description),
          `${template.name} ${item.id}`,
        ).toBe(item.displayDescription);
      }
    }
    const aboveD = ["level-d", "level-e", "level-f", "level-g"];
    expect(mockDisplayDescription(levels, aboveD, null)).toBe("D i sup.");
    expect(mockDisplayDescription(levels, aboveD, null, "es")).toBe("D y sup.");
    expect(mockDisplayDescription(levels, aboveD, null, "en")).toBe("D and up");
    expect(mockDisplayDescription(levels, ["level-g", "level-t"], null)).toBe("G+Teràpia");
    expect(mockDisplayDescription(levels, ["level-p"], null, "es")).toBe("Cachorros");
  });

  it("validates the coverage table and the week list items", () => {
    const coverage = schema("Coverage");
    expect(coverage(coverageFixture), JSON.stringify(coverage.errors, null, 2)).toBe(true);
    const week = schema("WeekListItem");
    for (const item of [...initialWeeks("2026-08-19"), mockWeek("2026-08-31")]) {
      expect(week(item), JSON.stringify(week.errors, null, 2)).toBe(true);
    }
    expect(
      initialWeeks("2026-08-19").map((item) => [item.isoYear, item.isoWeek, item.startDate]),
    ).toEqual([
      [2026, 34, "2026-08-17"],
      [2026, 35, "2026-08-24"],
      [2026, 36, "2026-08-31"],
    ]);
  });
});

describe("E4-W02 calendar fixtures follow the S06 contract (ClassSession, RingBlock, CancellationPreview)", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(mergedDocument, openapiSchemaId);
  const schema = (name: string) =>
    ajv.compile({ $ref: `${openapiSchemaId}#/components/schemas/${name}` });
  const sessions = initialClassSessions("2026-08-10");

  it("validates every class session of the D4, D4b and inconsistent weeks", () => {
    const validate = schema("ClassSession");
    for (const session of sessions) {
      expect(validate(session), JSON.stringify(validate.errors, null, 2)).toBe(true);
    }
    const count = (weekId: string, state: string) =>
      sessions.filter((session) => session.weekId === weekId && session.state === state).length;
    expect(count("week-2026-08-17", "DRAFT")).toBe(28);
    expect(count("week-2026-08-24", "DRAFT")).toBe(6);
    expect(sessions.find((session) => session.id === "cls-2026-08-12-1850-0")).toMatchObject({
      counters: { booked: 4, waiting: 2 },
      displayDescription: "B+C",
      ringId: "ring-central",
      startTime: "18:50",
      state: "ACTIVE",
    });
  });

  it("keeps every calendar fixture description equal to the mock resolver (E29: {F,G} = «F i sup.»)", () => {
    const levels = planningLevels();
    for (const session of sessions) {
      expect(
        mockDisplayDescription(levels, session.levelIds, session.description),
        session.id,
      ).toBe(session.displayDescription);
    }
    expect(
      sessions
        .filter((session) => session.levelIds.join() === "level-f,level-g")
        .map((session) => session.displayDescription),
    ).toEqual(["F i sup.", "F i sup.", "F i sup."]);
  });

  it("validates the ring block and the cancellation preview of the Wednesday 18:50 class", () => {
    const block = schema("RingBlock");
    for (const item of initialRingBlocks("2026-08-10")) {
      expect(block(item), JSON.stringify(block.errors, null, 2)).toBe(true);
      expect(item).toMatchObject({ from: "2026-08-12T14:00:00Z", to: "2026-08-12T16:00:00Z" });
    }
    const preview = schema("CancellationPreview");
    const wednesday = sessions.find((session) => session.id === "cls-2026-08-12-1850-0");
    if (wednesday === undefined) throw new TypeError("Missing the Wednesday 18:50 class");
    const value = cancellationPreviewFor(wednesday);
    expect(preview(value), JSON.stringify(preview.errors, null, 2)).toBe(true);
    expect(
      value.bookings.map((item) => [item.memberName, item.levelName, item.phoneCount]),
    ).toEqual([
      ["Laura Serra", "C", 2],
      ["Marc Prats", "B", 1],
      ["Aina Roca", "B", 1],
      ["Biel Puig", "C", 1],
    ]);
    expect(value.waitlistCount).toBe(2);
  });

  it("R-06-14 derives UTC instants from the club-local time across the DST change", () => {
    expect(clubInstant("2026-10-24", "08:30")).toBe("2026-10-24T06:30:00Z");
    expect(clubInstant("2026-10-26", "08:30")).toBe("2026-10-26T07:30:00Z");
    expect(clubInstant("2026-03-28", "08:30")).toBe("2026-03-28T07:30:00Z");
    expect(clubInstant("2026-03-30", "08:30")).toBe("2026-03-30T06:30:00Z");
    // Ambiguous 02:30 (autumn overlap): first occurrence; 02:30 in the spring gap → 03:30 local.
    expect(clubInstant("2026-10-25", "02:30")).toBe("2026-10-25T00:30:00Z");
    expect(clubInstant("2026-03-29", "02:30")).toBe("2026-03-29T01:30:00Z");
    // A transition more than 12 h away from wall-time-as-UTC (NZDT → NZST at 03:00 local).
    expect(clubInstant("2026-04-05", "02:30", "Pacific/Auckland")).toBe("2026-04-04T13:30:00Z");
    expect(clubInstant("2026-09-27", "02:30", "Pacific/Auckland")).toBe("2026-09-26T14:30:00Z");
  });
});

describe("E4-W03 day-grid fixtures follow the S06 contract (DayGrid form D, ClassSession, RingBlock)", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(mergedDocument, openapiSchemaId);
  const schema = (name: string) =>
    ajv.compile({ $ref: `${openapiSchemaId}#/components/schemas/${name}` });
  const allModules = {
    locale: "ca" as const,
    modules: ["FREE_TRAINING", "WAITLIST", "ACTIVITIES", "COURSES"],
    timeZone: "Europe/Madrid",
  };
  const dates = [
    DAY_GRID_INSTRUCTOR_DATE,
    DAY_GRID_MEMBER_DATE,
    DAY_GRID_EMPTY_DATE,
    DAY_GRID_ACTIVITY_DATE,
  ];

  it.each(dates.flatMap((date) => [[date, "member"] as const, [date, "instructor"] as const]))(
    "validates the %s %s grid",
    (date, view) => {
      const validate = schema("DayGrid");
      const grid = dayGridFixture(date, view, allModules);
      expect(validate(grid), JSON.stringify(validate.errors, null, 2)).toBe(true);
    },
  );

  it("projects the member view as the api does (R-06-12): no counts, names, notes nor staff kinds", () => {
    for (const date of dates) {
      for (const cell of dayGridFixture(date, "member", allModules).rows.flatMap(
        (row) => row.cells,
      )) {
        expect(["CLASS", "OCCUPIED", "ACTIVITY"]).toContain(cell.kind);
        for (const hidden of [
          "occupancy",
          "who",
          "trainingBookingIds",
          "note",
          "createdByName",
          "blockId",
        ]) {
          expect(cell).not.toHaveProperty(hidden);
        }
        expect(cell.state).not.toBe("CANCELLED");
      }
    }
    const member = dayGridFixture(DAY_GRID_MEMBER_DATE, "member", allModules);
    expect(member.rows.map((row) => row.time)).toEqual([
      "08:30",
      "09:30",
      "17:40",
      "18:50",
      "20:00",
    ]);
    const risky = member.rows.at(-1)?.cells.find((cell) => cell.atRisk === true);
    expect(risky).toMatchObject({
      description: "D i sup.",
      instructorName: null,
      riskText:
        "Aquesta classe només té un alumne: si ningú més s'hi apunta abans de les 7:30 de dimarts, s'anul·larà.",
    });
    expect(dayGridFixture(DAY_GRID_EMPTY_DATE, "member", allModules).rows).toEqual([]);
  });

  it("carries the screen 23 counts, trainings, block and cancelled class in the instructor view", () => {
    const grid = dayGridFixture(DAY_GRID_INSTRUCTOR_DATE, "instructor", allModules);
    expect(grid.rows.map((row) => row.time)).toEqual([
      "08:00",
      "08:30",
      "09:30",
      "16:00",
      "17:40",
      "18:50",
      "19:00",
    ]);
    const cells = grid.rows.flatMap((row) => row.cells);
    expect(cells.find((cell) => cell.description === "B+C")).toMatchObject({
      instructorName: "Marc",
      occupancy: { booked: 5, capacity: 5, waiting: 2 },
    });
    expect(cells.filter((cell) => cell.kind === "TRAINING").map((cell) => cell.who)).toEqual([
      ["Pau + Blat"],
      ["Júlia + Kira"],
      ["Sergio + Thai"],
    ]);
    expect(cells.filter((cell) => cell.state === "CANCELLED")).toHaveLength(1);
    const noWaitlist = dayGridFixture(DAY_GRID_INSTRUCTOR_DATE, "instructor", {
      ...allModules,
      modules: ["FREE_TRAINING"],
    });
    expect(
      noWaitlist.rows
        .flatMap((row) => row.cells)
        .some((cell) => cell.occupancy?.waiting !== undefined),
    ).toBe(false);
    const activity = dayGridFixture(DAY_GRID_ACTIVITY_DATE, "member", allModules);
    expect(
      activity.rows.flatMap((row) => row.cells).map((cell) => [cell.kind, cell.ringId]),
    ).toEqual([
      ["ACTIVITY", "ring-muntanya"],
      ["CLASS", "ring-carretera"],
      ["CLASS", null],
    ]);
  });

  it("validates the class sessions and ring blocks behind the screen 23 drawers", () => {
    const session = schema("ClassSession");
    for (const item of dayGridClassSessions()) {
      expect(session(item), JSON.stringify(session.errors, null, 2)).toBe(true);
      expect(item).not.toHaveProperty("notes");
    }
    const block = schema("RingBlock");
    for (const item of dayGridState.blocks) {
      expect(block(item), JSON.stringify(block.errors, null, 2)).toBe(true);
    }
    expect(dayGridState.blocks.map((item) => [item.date, item.fromLocal, item.toLocal])).toEqual([
      [DAY_GRID_INSTRUCTOR_DATE, "16:00", "18:00"],
      [DAY_GRID_MEMBER_DATE, "08:30", "09:30"],
    ]);
  });

  it("sends the «Sense» column last, translated, only when a class has no ring", () => {
    const columns = (locale: "ca" | "en" | "es") =>
      dayGridFixture(DAY_GRID_ACTIVITY_DATE, "member", { ...allModules, locale }).columns;
    expect(columns("ca").at(-1)).toMatchObject({ name: "Sense pista", ringId: null, shortName: "Sense" });
    expect(columns("es").at(-1)).toMatchObject({ ringId: null, shortName: "Sin" });
    expect(columns("en").at(-1)).toMatchObject({ ringId: null, shortName: "None" });
    expect(columns("ca").filter((column) => column.ringId === null)).toHaveLength(1);
    for (const date of [DAY_GRID_INSTRUCTOR_DATE, DAY_GRID_MEMBER_DATE, DAY_GRID_EMPTY_DATE]) {
      expect(
        dayGridFixture(date, "instructor", allModules).columns.some((column) => column.ringId === null),
      ).toBe(false);
    }
  });

  it("validates the member projections of the class and the block (S06 §6 «Altres formes»)", () => {
    const session = schema("ClassSessionMemberView");
    const staffOnly = ["counters", "instructorIds", "atRisk", "notes", "cancellation", "version"];
    for (const item of dayGridClassSessions().filter((candidate) => candidate.state !== "CANCELLED")) {
      const view = dayGridMemberSession(item.id, allModules.modules);
      expect(session(view), JSON.stringify(session.errors, null, 2)).toBe(true);
      for (const hidden of staffOnly) expect(view).not.toHaveProperty(hidden);
    }
    const cancelled = dayGridClassSessions().find((item) => item.state === "CANCELLED");
    expect(dayGridMemberSession(cancelled?.id ?? "", allModules.modules)).toBeUndefined();
    const risky = dayGridClassSessions().find(
      (item) => item.date === DAY_GRID_MEMBER_DATE && item.displayDescription === "D i sup.",
    );
    expect(dayGridMemberSession(risky?.id ?? "", ["FREE_TRAINING"])).toMatchObject({
      freeSeats: 4,
      instructorName: null,
      ring: { id: "ring-carretera", name: "Carretera" },
    });
    expect(dayGridMemberSession(risky?.id ?? "", ["FREE_TRAINING"])).not.toHaveProperty("waiting");
    const block = schema("RingBlockMemberView");
    for (const item of dayGridState.blocks) {
      const view = memberBlockView(item);
      expect(block(view), JSON.stringify(block.errors, null, 2)).toBe(true);
      expect(view).not.toHaveProperty("note");
      expect(view).not.toHaveProperty("createdByName");
    }
  });
});

describe("E3-W08 the computed signup configuration and results follow SignupConfig and SignupUpfront", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(mergedDocument, openapiSchemaId);
  const schema = (name: string) =>
    ajv.compile({ $ref: `${openapiSchemaId}#/components/schemas/${name}` });

  it.each([
    ["2026-08-05", false],
    ["2026-08-17", false],
    ["2026-12-31", false],
    ["2026-08-17", true],
    ["2026-08-26", true],
  ] as const)("validates GET /signup on %s (add-dog: %s) and each submission upfront", (today, member) => {
    const config = signupConfig({
      acceptLanguage: "ca",
      billing: true,
      enabled: true,
      familyGroup: true,
      packs: true,
      privacyPolicyUrl: "https://canic.example.test/privacitat",
      stripe: false,
      today,
      ...(member ? { member: signupMemberFixture } : {}),
    });
    const validateConfig = schema("SignupConfig");
    expect(validateConfig(config), JSON.stringify(validateConfig.errors, null, 2)).toBe(true);
    const validateUpfront = schema("SignupUpfront");
    for (const quote of config.upfront?.planQuotes ?? []) {
      for (const option of [undefined, "TODAY", "ALTERNATIVE"] as const) {
        const upfront = signupResultUpfront(quote, option, { addDog: member });
        expect(validateUpfront(upfront), JSON.stringify(validateUpfront.errors, null, 2)).toBe(true);
      }
    }
  });
});

describe("E3-W07 D2 signup review fixtures follow the S04 contract (MemberSignupView, ValidationDryRun)", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(mergedDocument, openapiSchemaId);
  const schema = (name: string) =>
    ajv.compile({ $ref: `${openapiSchemaId}#/components/schemas/${name}` });
  const pendingRow = {
    dogs: [{ breed: "border", isAddDog: false, name: "Bruc" }],
    memberId: "42000000-0000-4000-8000-000000000002",
    paymentMethodType: "MANUAL" as const,
    pendingDays: 1,
    planName: "Pack 6",
    shortName: "Pol C.",
    submittedAt: "2026-08-09T10:02:00Z",
    warnings: [],
  };

  it.each([
    ["the mockup", signupReviewBaseline],
    ["manual", signupReviewVariant(signupReviewBaseline, "manual")],
    ["family pending", signupReviewVariant(signupReviewBaseline, "familyPending")],
    ["add-dog", addDogSignupReview(signupReviewBaseline)],
    ["a derived D1 row", derivedSignupReview(signupReviewBaseline, pendingRow)],
    ["readmission (E38)", signupReviewVariant(signupReviewBaseline, "readmission")],
  ])("validates the %s view, each dog with its own version", (_name, view) => {
    const validate = schema("MemberSignupView");
    expect(validate(view), JSON.stringify(validate.errors, null, 2)).toBe(true);
    for (const dog of view.dogs) expect(typeof dog.version).toBe("number");
  });

  it("validates every plan's dry run and deducts what was paid (S04 §5, E39)", () => {
    const validate = schema("ValidationDryRun");
    const manual = signupReviewVariant(signupReviewBaseline, "manual");
    for (const view of [signupReviewBaseline, manual]) {
      for (const plan of view.planOptions) {
        const body = {
          dogs: [{ dogId: "44000000-0000-4000-8000-000000000001" }],
          planId: plan.planId,
          version: view.version,
        };
        const dryRun = signupReviewDryRun(view, body);
        expect(validate(dryRun), `${plan.name}: ${JSON.stringify(validate.errors)}`).toBe(true);
      }
    }
    const pack = signupReviewDryRun(manual, {
      dogs: [{ dogId: "44000000-0000-4000-8000-000000000001" }],
      planId: "10000000-0000-4000-8000-000000000002",
      version: manual.version,
    });
    expect(pack.upfront?.lines.map((line) => [line.concept, line.amount.amountMinor, line.status])).toEqual([
      ["PACK", 13500, "DUE"],
    ]);
    expect(pack).not.toHaveProperty("nextInvoiceDate");
    const therapy = signupReviewDryRun(signupReviewBaseline, {
      dogs: [{ dogId: "44000000-0000-4000-8000-000000000001" }],
      planId: "10000000-0000-4000-8000-000000000004",
      version: signupReviewBaseline.version,
    });
    expect(therapy.warnings).toContain("PAID_EXCEEDS_QUOTE");
    expect(therapy.upfront?.paidExceedsQuote).toEqual({ amountMinor: 8000, currency: "EUR" });
  });

  describe("E39b: a plan change closes a PARTIAL line (S04 §5)", () => {
    const eur = (amountMinor: number) => ({ amountMinor, currency: "EUR" });
    // 50 € collected of a 100 € entry fee; the club offers a 60 € and a 40 € pack.
    const partial = (): typeof signupReviewBaseline => {
      const view = signupReviewVariant(signupReviewBaseline, "manual");
      view.upfront = {
        lines: [
          {
            amount: eur(10000),
            concept: "ENTRY_FEE",
            id: "45000000-0000-4000-8000-000000000001",
            paidAmount: eur(5000),
            provider: "MANUAL",
            status: "PARTIAL",
          },
        ],
        totalDue: eur(10000),
        totalPaid: eur(5000),
      };
      view.planOptions = [
        ...view.planOptions,
        ...[6000, 4000].map((amountMinor, index) => ({
          name: `Pack ${String(amountMinor / 100)}`,
          planId: `10000000-0000-4000-8000-00000000009${String(index)}`,
          prices: [
            {
              amount: eur(amountMinor),
              concept: "PACK" as const,
              periodicity: "ONE_OFF" as const,
              priceId: `20000000-0000-4000-8000-00000000009${String(index)}`,
            },
          ],
          type: "PACK" as const,
        })),
      ];
      return view;
    };
    const dryRun = (planId: string) => {
      const view = partial();
      return signupReviewDryRun(view, {
        dogs: [{ dogId: "44000000-0000-4000-8000-000000000001" }],
        planId,
        version: view.version,
      });
    };

    it("a 60 € quote leaves 10 € to pay: the PARTIAL line is CANCELLED and a PAID line records the 50 €", () => {
      const quote = dryRun("10000000-0000-4000-8000-000000000090");
      const validate = schema("ValidationDryRun");
      expect(validate(quote), JSON.stringify(validate.errors)).toBe(true);
      expect(
        quote.upfront?.lines.map((line) => [
          line.concept,
          line.amount.amountMinor,
          line.paidAmount?.amountMinor ?? null,
          line.status,
        ]),
      ).toEqual([
        ["ENTRY_FEE", 10000, 5000, "CANCELLED"],
        ["ENTRY_FEE", 5000, 5000, "PAID"],
        ["PACK", 1000, null, "DUE"],
      ]);
      expect(quote.upfront?.totalDue).toEqual(eur(6000));
      expect(quote.upfront?.totalPaid).toEqual(eur(5000));
      expect(
        (quote.upfront?.totalDue.amountMinor ?? 0) - (quote.upfront?.totalPaid.amountMinor ?? 0),
      ).toBe(1000);
      expect(quote.warnings).not.toContain("PAID_EXCEEDS_QUOTE");
    });

    it("a 40 € quote adds no line to pay and warns PAID_EXCEEDS_QUOTE for the 10 € to refund", () => {
      const quote = dryRun("10000000-0000-4000-8000-000000000091");
      expect(quote.upfront?.lines.map((line) => line.status)).toEqual(["CANCELLED", "PAID"]);
      expect(quote.upfront?.paidExceedsQuote).toEqual(eur(1000));
      expect(quote.warnings).toContain("PAID_EXCEEDS_QUOTE");
    });

    it("the requested plan keeps the PARTIAL line open (no plan change)", () => {
      const quote = dryRun("10000000-0000-4000-8000-000000000001");
      expect(quote.upfront?.lines[0]?.status).toBe("PARTIAL");
      expect(quote.upfront?.lines.some((line) => line.status === "CANCELLED")).toBe(false);
    });
  });
});
