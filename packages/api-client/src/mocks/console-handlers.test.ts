import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import openapiDocument from "../../openapi/openapi.json";
import { isApiError } from "../api-error";
import { createApiClient } from "../client";
import type { components } from "../generated/schema";

import {
  CONSOLE_CLUB_IDS,
  clubTemplates,
  consoleParameterCatalog,
  consoleState,
} from "./fixtures/console";
import { mockScenario, resetConsoleMockState, type MockScenario } from "./handlers";
import { currentMockScenario } from "./scenarios";
import { server } from "./server";

const openapiSchemaId = "https://agilityhub.local/console-openapi.json";
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(openapiDocument, openapiSchemaId);

function expectValid(name: string, value: unknown) {
  const validate = ajv.compile({ $ref: `${openapiSchemaId}#/components/schemas/${name}` });
  expect(validate(value), JSON.stringify(validate.errors, null, 2)).toBe(true);
}

const base = "https://core.example.test/api/v1";
let client = createApiClient({ baseUrl: base });

function use(scenario: MockScenario) {
  mockScenario(scenario);
  client = createApiClient({ baseUrl: base, getLocale: () => "ca" });
}

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (isApiError(error)) {
      return { code: error.code, details: error.details, status: error.status };
    }
    throw error;
  }
  throw new Error("Expected an ApiError");
}

const canic = CONSOLE_CLUB_IDS.canic;
const minim = CONSOLE_CLUB_IDS.minim;

async function club(id: string) {
  const { data } = await client.GET("/platform/clubs/{id}", { params: { path: { id } } });
  if (data === undefined) throw new TypeError("No club");
  return data;
}

function definition(
  overrides: Partial<components["schemas"]["ClubDefinition"]> = {},
): components["schemas"]["ClubDefinition"] {
  const template = consoleState.clubs.find((candidate) => candidate.template);
  if (template === undefined) throw new TypeError("No template club");
  return {
    admins: [{ email: "laia.costa@example.test", locale: "ca", name: "Laia Costa" }],
    apiVersion: "agilityhub.club/v1",
    catalogs: { fromTemplate: "club-template-default" },
    club: {
      countryProfile: "ES",
      currency: "EUR",
      defaultLocale: "ca",
      locales: ["ca", "es"],
      name: "Club Agility Serralada",
      slug: "serralada",
      status: "ONBOARDING",
      timeZone: "Europe/Madrid",
    },
    preset: "MINIM",
    theme: {
      colors: template.theme.colors,
      fontFamily: template.theme.fontFamily,
      mode: "light",
      radius: "4px",
      ringPalette: template.theme.ringPalette,
    },
    ...overrides,
  };
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  resetConsoleMockState();
  use("platform");
});
afterEach(() => {
  server.resetHandlers();
  resetConsoleMockState();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

describe("E10-W01 · the console's mock world follows the E10-T01 contract", () => {
  it("validates every club, list row, template, catalog entry, job cell and audit row", async () => {
    for (const item of consoleState.clubs) expectValid("PlatformClub", item);
    for (const item of clubTemplates()) expectValid("PlatformClubTemplate", item);
    for (const item of consoleParameterCatalog) expectValid("ParameterDefinition", item);
    expectValid("PlatformJobsOverview", consoleState.jobs);
    for (const item of consoleState.audit) expectValid("PlatformAuditEntry", item);
    for (const admins of Object.values(consoleState.admins)) {
      for (const admin of admins) expectValid("PlatformAdmin", admin);
    }
    expectValid("Me", currentMockScenario().me);
    const { data } = await client.GET("/platform/clubs", { params: { query: {} } });
    expectValid("PlatformClubPage", data);
  });

  it("a club's own account, or an impersonation, gets 403 on /platform/*", async () => {
    use("admin");
    expect(await failure(client.GET("/platform/clubs", { params: { query: {} } }))).toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    use("impersonated");
    expect(
      await failure(client.GET("/platform/clubs/{id}", { params: { path: { id: canic } } })),
    ).toMatchObject({ status: 403 });
  });

  it("lists with filters, sort, q, fields (only the asked keys plus the id) and echoes appliedFilters", async () => {
    const { data } = await client.GET("/platform/clubs", {
      params: {
        query: {
          fields: "id,name,status",
          filter: ["status:in:ACTIVE,SUSPENDED"],
          sort: ["name,desc"],
        },
      },
    });
    expect(data?.items).toEqual([
      { id: CONSOLE_CLUB_IDS.riera, name: "Club Agility Riera", status: "SUSPENDED" },
      expect.objectContaining({ id: canic, status: "ACTIVE" }),
    ]);
    expect(Object.keys(data?.items[1] ?? {}).sort()).toEqual(["id", "name", "status"]);
    expect(data?.appliedFilters).toEqual([
      { field: "status", op: "in", value: ["ACTIVE", "SUSPENDED"] },
    ]);
    const search = await client.GET("/platform/clubs", { params: { query: { q: "plantilla" } } });
    expect(search.data?.items.map((item) => item.id)).toEqual([CONSOLE_CLUB_IDS.template]);
    expect(
      await failure(
        client.GET("/platform/clubs", { params: { query: { filter: ["timeZone:eq:UTC"] } } }),
      ),
    ).toMatchObject({ code: "INVALID_FILTER", status: 400 });
  });

  it("PATCH checks the version, the fields and the time-zone rule", async () => {
    const current = await club(canic);
    expect(
      await failure(
        client.PATCH("/platform/clubs/{id}", {
          body: { name: "Nou nom", version: current.version - 1 },
          params: { path: { id: canic } },
        }),
      ),
    ).toMatchObject({ code: "STALE_VERSION", status: 409 });
    expect(
      await failure(
        client.PATCH("/platform/clubs/{id}", {
          body: { contactEmail: "no-email", version: current.version },
          params: { path: { id: canic } },
        }),
      ),
    ).toMatchObject({
      code: "VALIDATION_ERROR",
      details: { fieldErrors: [{ code: "INVALID_VALUE", field: "contactEmail" }] },
    });
    expect(
      await failure(
        client.PATCH("/platform/clubs/{id}", {
          body: { timeZone: "Atlantic/Canary", version: current.version },
          params: { path: { id: canic } },
        }),
      ),
    ).toMatchObject({ code: "TIMEZONE_CHANGE_BLOCKED", status: 422 });
    const { data } = await client.PATCH("/platform/clubs/{id}", {
      body: { displayCity: "Vilassar", version: current.version },
      params: { path: { id: canic } },
    });
    expect(data).toMatchObject({ displayCity: "Vilassar", version: current.version + 1 });
  });

  it("modules: dependencies are 422 MODULE_DEPENDENCY {module, requires}; a preset enables its list", async () => {
    const current = await club(minim);
    expect(
      await failure(
        client.PUT("/platform/clubs/{id}/modules", {
          body: { modules: ["FAQ", "PACKS"], version: current.version },
          params: { path: { id: minim } },
        }),
      ),
    ).toMatchObject({
      code: "MODULE_DEPENDENCY",
      details: { module: "PACKS", requires: "BILLING" },
      status: 422,
    });
    const { data } = await client.PUT("/platform/clubs/{id}/modules", {
      body: { preset: "COMPLET", version: current.version },
      params: { path: { id: minim } },
    });
    expect(data?.modules).toContain("PACKS");
    expect(data?.modules).not.toContain("STATS");
  });

  it("theme: AA contrast, versions, and only the club's own uploaded keys", async () => {
    const current = await club(minim);
    const request = {
      colors: current.theme.colors,
      fontFamily: current.theme.fontFamily,
      mode: current.theme.mode,
      radius: current.theme.radius,
      ringPalette: current.theme.ringPalette,
      version: current.version,
    };
    expect(
      await failure(
        client.PUT("/platform/clubs/{id}/theme", {
          body: { ...request, colors: { ...request.colors, onPrimary: request.colors.primary } },
          params: { path: { id: minim } },
        }),
      ),
    ).toMatchObject({ code: "THEME_CONTRAST", status: 422 });
    const upload = await client.POST("/platform/clubs/{id}/theme/upload-url", {
      body: { fileName: "logo.png", mimeType: "image/png", sizeBytes: 2048 },
      params: { header: { "Idempotency-Key": crypto.randomUUID() }, path: { id: minim } },
    });
    expectValid("Upload", upload.data);
    const { data } = await client.PUT("/platform/clubs/{id}/theme", {
      body: { ...request, logoFileKey: upload.data?.fileKey ?? "" },
      params: { path: { id: minim } },
    });
    expect(data?.logoUrl).toMatch(/^https:\/\/files\.example\.test\//u);
    expect((await club(minim)).onboardingChecklist.branding).toBe(true);
  });

  it("providers: write-only secrets, PROVIDER_CONFIG_INVALID, the Stripe test and PROVIDER_IN_USE", async () => {
    let current = await club(minim);
    expect(
      await failure(
        client.PUT("/platform/clubs/{id}/payment-providers/{provider}", {
          body: { mode: "test", publishableKey: "pk_test_1234", version: current.version },
          params: { path: { id: minim, provider: "STRIPE" } },
        }),
      ),
    ).toMatchObject({ code: "PROVIDER_CONFIG_INVALID", details: { field: "secretKey" } });
    const saved = await client.PUT("/platform/clubs/{id}/payment-providers/{provider}", {
      body: {
        mode: "test",
        publishableKey: "pk_test_9876",
        secretKey: "sk_test_secret",
        version: current.version,
      },
      params: { path: { id: minim, provider: "STRIPE" } },
    });
    expect(saved.data).toMatchObject({ configured: true, last4: "9876", mode: "test" });
    expect(JSON.stringify(await club(minim))).not.toContain("sk_test_secret");
    const test = await client.POST("/platform/clubs/{id}/payment-providers/stripe/test", {
      params: { path: { id: minim } },
    });
    expect(test.data).toMatchObject({ mode: "test", ok: true });
    current = await club(canic);
    expect(
      await failure(
        client.DELETE("/platform/clubs/{id}/payment-providers/{provider}", {
          params: {
            path: { id: canic, provider: "SEPA_XML" },
            query: { version: current.version },
          },
        }),
      ),
    ).toMatchObject({ code: "PROVIDER_IN_USE", details: { count: 164 }, status: 409 });
  });

  it("catalog clone, team (LAST_ADMIN), platform roles (LAST_PLATFORM_ADMIN) and status transitions", async () => {
    expect(
      await failure(
        client.POST("/platform/clubs/{id}/catalog-clone", {
          body: { fromClubId: CONSOLE_CLUB_IDS.template, parts: ["FAQ", "LEVELS"] },
          params: { header: { "Idempotency-Key": crypto.randomUUID() }, path: { id: minim } },
        }),
      ),
    ).toMatchObject({ code: "CATALOG_NOT_EMPTY", details: { part: "FAQ" }, status: 409 });
    const cloned = await client.POST("/platform/clubs/{id}/catalog-clone", {
      body: { fromClubId: CONSOLE_CLUB_IDS.template, parts: ["LEVELS", "RINGS"] },
      params: { header: { "Idempotency-Key": crypto.randomUUID() }, path: { id: minim } },
    });
    expect(cloned.data).toEqual({ copied: { LEVELS: 9, RINGS: 5 }, warnings: [] });

    const admins = await client.GET("/platform/clubs/{id}/admins", {
      params: { path: { id: minim } },
    });
    const only = admins.data?.[0]?.accountId ?? "";
    expect(
      await failure(
        client.DELETE("/platform/clubs/{id}/admins/{accountId}", {
          params: {
            header: { "Idempotency-Key": crypto.randomUUID() },
            path: { accountId: only, id: minim },
          },
        }),
      ),
    ).toMatchObject({ code: "LAST_ADMIN", status: 409 });
    expect(
      await failure(
        client.PUT("/platform/accounts/{id}/platform-roles", {
          body: { platformRoles: [] },
          params: { path: { id: "10000000-0000-4000-8000-0000000000a1" } },
        }),
      ),
    ).toMatchObject({ code: "LAST_PLATFORM_ADMIN", status: 409 });

    expect(
      await failure(
        client.PUT("/platform/clubs/{id}/status", {
          body: { status: "SUSPENDED" },
          params: { header: { "Idempotency-Key": crypto.randomUUID() }, path: { id: canic } },
        }),
      ),
    ).toMatchObject({
      code: "VALIDATION_ERROR",
      details: { fieldErrors: [{ code: "REQUIRED", field: "reason" }] },
    });
    expect(
      await failure(
        client.PUT("/platform/clubs/{id}/status", {
          body: { status: "ONBOARDING" },
          params: {
            header: { "Idempotency-Key": crypto.randomUUID() },
            path: { id: CONSOLE_CLUB_IDS.riera },
          },
        }),
      ),
    ).toMatchObject({ code: "INVALID_STATE", status: 409 });
  });

  it("POST /platform/clubs: field paths, SLUG_TAKEN, MODULE_DEPENDENCY and the 201 with its checklist", async () => {
    const post = (body: components["schemas"]["ClubDefinition"]) =>
      client.POST("/platform/clubs", {
        body,
        params: { header: { "Idempotency-Key": crypto.randomUUID() } },
      });
    const invalid = definition({
      admins: [{ email: "not-an-email", locale: "ca", name: "Laia Costa" }],
    });
    expect(await failure(post({ ...invalid, club: { ...invalid.club, slug: "A" } }))).toMatchObject(
      {
        code: "VALIDATION_ERROR",
        details: {
          fieldErrors: [
            { code: "INVALID_VALUE", field: "club.slug" },
            { code: "INVALID_VALUE", field: "admins[0].email" },
          ],
        },
        status: 400,
      },
    );
    const taken = definition();
    expect(await failure(post({ ...taken, club: { ...taken.club, slug: "canic" } }))).toMatchObject(
      {
        code: "SLUG_TAKEN",
        status: 409,
      },
    );
    const { preset, ...withoutPreset } = definition();
    expect(preset).toBe("MINIM");
    expect(await failure(post({ ...withoutPreset, modules: ["PACKS"] }))).toMatchObject({
      code: "MODULE_DEPENDENCY",
      status: 422,
    });
    const created = await post(definition());
    expectValid("PlatformClubCreated", created.data);
    expect(created.data?.club).toMatchObject({ slug: "serralada", status: "ONBOARDING" });
    expect(created.data?.checklist).toMatchObject({ firstAdmin: false, templates: true });
  });

  it("parameters: PLATFORM keys are written per club and per key version, bounds are PARAMETER_INVALID", async () => {
    const put = (key: string, value: unknown, version: number) =>
      client.PUT("/platform/clubs/{id}/parameters/{key}", {
        body: { reason: "Ajust de plataforma", value, version },
        params: { path: { id: minim, key } },
      });
    expect(await failure(put("unknown.key", 1, 0))).toMatchObject({
      code: "UNKNOWN_PARAMETER",
      status: 400,
    });
    expect(await failure(put("auth.sessionDays", 0, 0))).toMatchObject({
      code: "PARAMETER_INVALID",
      status: 400,
    });
    const saved = await put("auth.sessionDays", 45, 0);
    expectValid("Parameter", saved.data);
    expect(saved.data).toMatchObject({
      editableBy: "PLATFORM",
      isOverride: true,
      value: 45,
      version: 1,
    });
    expect(await failure(put("auth.sessionDays", 60, 0))).toMatchObject({
      code: "STALE_VERSION",
      status: 409,
    });
    expect((await put("auth.sessionDays", 60, 1)).data).toMatchObject({ value: 60, version: 2 });
    // Another club's key keeps its own version.
    const other = await client.PUT("/platform/clubs/{id}/parameters/{key}", {
      body: { value: 30, version: 0 },
      params: { path: { id: canic, key: "auth.sessionDays" } },
    });
    expect(other.data).toMatchObject({ version: 1 });
  });
});
