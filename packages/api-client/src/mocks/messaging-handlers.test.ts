import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import openapiDocument from "../../openapi/openapi.json";
import { isApiError } from "../api-error";
import { createApiClient } from "../client";

import { findParameter, replaceParameter, resetSettingsState } from "./fixtures/settings";
import {
  ERASED_MEMBER_ID,
  mockScenario,
  resetMessagingMockState,
  type MockScenario,
} from "./handlers";
import { server } from "./server";

const openapiSchemaId = "https://agilityhub.local/messaging-openapi.json";
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(openapiDocument, openapiSchemaId);

function expectValid(name: string, value: unknown) {
  const validate = ajv.compile({ $ref: `${openapiSchemaId}#/components/schemas/${name}` });
  expect(validate(value), JSON.stringify(validate.errors, null, 2)).toBe(true);
}

const base = "https://core.example.test/api/v1";
let client = createApiClient({ baseUrl: base, getLocale: () => "ca" });

function use(scenario: MockScenario, locale = "ca") {
  mockScenario(scenario);
  client = createApiClient({ baseUrl: base, getLocale: () => locale });
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

const list = (query: { category?: "CLUB_NEWS" | "PERSONAL"; includeArchived?: boolean } = {}) =>
  client.GET("/message-templates", { params: { query } });
const detail = (id: string) => client.GET("/message-templates/{id}", { params: { path: { id } } });
const send = (
  id: string,
  body: { dryRun: boolean; recipients: { filters?: string[]; memberIds?: string[] } },
  key = crypto.randomUUID(),
) =>
  client.POST("/message-templates/{id}/send", {
    body,
    params: { header: { "Idempotency-Key": key }, path: { id } },
  });

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  resetMessagingMockState();
  use("admin");
});
afterEach(() => {
  server.resetHandlers();
  resetMessagingMockState();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

describe("E6-W04 step 0 · the adopted snapshot (api e34bf04): S11's refusal details and D10's read", () => {
  async function n28Body() {
    const n28 = (await detail("tpl-n-28")).data;
    if (n28 === undefined) throw new TypeError("No N-28");
    return {
      body: n28.bodyI18n,
      color: n28.color,
      enabled: true,
      icon: n28.icon,
      matrix: n28.matrix,
      title: n28.titleI18n,
      version: n28.version,
    };
  }

  it("E6-W04 step 0: CHANNEL_NOT_ALLOWED carries ChannelNotAllowedDetails: the first refused cell and every refused cell", async () => {
    const body = await n28Body();
    const refused = await failure(
      client.PUT("/message-templates/{id}", {
        body: {
          ...body,
          matrix: {
            ...body.matrix,
            ADMINS: { ...body.matrix.ADMINS, SMS: true },
            MEMBER: { ...body.matrix.MEMBER, SMS: true },
          },
        },
        params: { path: { id: "tpl-n-28" } },
      }),
    );
    expect(refused).toMatchObject({ code: "CHANNEL_NOT_ALLOWED", status: 422 });
    expectValid("ChannelNotAllowedDetails", refused.details);
    expect(refused.details).toEqual({
      audience: "MEMBER",
      cells: [
        { audience: "MEMBER", channel: "SMS" },
        { audience: "ADMINS", channel: "SMS" },
      ],
      channel: "SMS",
    });
  });

  it("E6-W04 step 0: TEMPLATE_UNKNOWN_VARIABLE carries TemplateFieldDetails with every unknown variable of the save", async () => {
    const body = await n28Body();
    const refused = await failure(
      client.PUT("/message-templates/{id}", {
        body: {
          ...body,
          body: { ...body.body, ca: `${body.body.ca ?? ""} [[sabor]]` },
          title: { ...body.title, ca: "Baixa [[color]]" },
        },
        params: { path: { id: "tpl-n-28" } },
      }),
    );
    expect(refused).toMatchObject({ code: "TEMPLATE_UNKNOWN_VARIABLE", status: 400 });
    expectValid("TemplateFieldDetails", refused.details);
    expect(refused.details).toEqual({ field: "title.ca", variables: ["color", "sabor"] });
  });

  it("E6-W04 step 0: SMS_BODY_REQUIRED names the default language's SMS text (smsBody.ca), which another language's text does not replace", async () => {
    const n08a = (await detail("tpl-n-08a")).data;
    if (n08a === undefined) throw new TypeError("No N-08a");
    const refused = await failure(
      client.PUT("/message-templates/{id}", {
        body: {
          body: n08a.bodyI18n,
          color: n08a.color,
          enabled: true,
          icon: n08a.icon,
          matrix: n08a.matrix,
          smsBody: { es: n08a.smsBodyI18n?.es ?? "" },
          title: n08a.titleI18n,
          version: n08a.version,
        },
        params: { path: { id: "tpl-n-08a" } },
      }),
    );
    expect(refused).toMatchObject({ code: "SMS_BODY_REQUIRED", status: 400 });
    expectValid("TemplateFieldDetails", refused.details);
    expect(refused.details).toEqual({ field: "smsBody.ca" });
  });

  it("E6-W04 step 0, T-11-12 (S11 R-11-12, E76/E79): N-02 does not declare `link` (only its welcome e-mail carries it): a text without it saves, and [[link]] is an unknown variable", async () => {
    const n02 = (await detail("tpl-n-02")).data;
    if (n02 === undefined) throw new TypeError("No N-02");
    expect(n02.variables.map((variable) => variable.key)).not.toContain("link");
    expect(n02.bodyI18n.ca).not.toContain("[[link]]");
    const body = {
      body: { ca: "Ja tens accés.", es: "Ya tienes acceso." },
      color: n02.color,
      enabled: true,
      icon: n02.icon,
      matrix: n02.matrix,
      title: n02.titleI18n,
      version: n02.version,
    };
    const refused = await failure(
      client.PUT("/message-templates/{id}", {
        body: { ...body, body: { ...body.body, ca: "Entra-hi: [[link]]." } },
        params: { path: { id: "tpl-n-02" } },
      }),
    );
    expect(refused).toEqual({
      code: "TEMPLATE_UNKNOWN_VARIABLE",
      details: { field: "body.ca", variables: ["link"] },
      status: 400,
    });
    const saved = await client.PUT("/message-templates/{id}", {
      body,
      params: { path: { id: "tpl-n-02" } },
    });
    expect(saved.response.status).toBe(200);
  });

  it("E6-W04 step 0: D10's GET /members/{id}/notification-preferences carries the club's locales and SMS/PUSH modules, as the published route says", async () => {
    const read = (scenario: MockScenario) => {
      use(scenario);
      return client.GET("/members/{id}/notification-preferences", {
        params: { path: { id: "member-laura" } },
      });
    };
    const admin = (await read("admin")).data;
    expectValid("NotificationPreferences", admin);
    expect(admin?.availableLocales).toEqual(["ca", "es"]);
    expect(admin?.modules).toEqual({ push: true, sms: true });
    expect((await read("messagingNoSms")).data?.modules).toEqual({ push: true, sms: false });
    expect((await read("messagingNoPush")).data?.modules).toEqual({ push: false, sms: true });
    // The reminder options are the club's `messaging.reminderOptionsMinutes`, as on screen 12.
    const options = findParameter("messaging.reminderOptionsMinutes");
    if (options === undefined) throw new TypeError("No messaging.reminderOptionsMinutes");
    replaceParameter({ ...options, value: [120, 1440] });
    try {
      expect((await read("admin")).data?.reminderOptionsMinutes).toEqual([120, 1440]);
      expect(
        await failure(
          client.PUT("/members/{id}/notification-preferences", {
            body: { reminderMinutesBefore: 60 },
            params: { path: { id: "member-laura" } },
          }),
        ),
      ).toMatchObject({ code: "INVALID_REMINDER_OPTION", status: 422 });
    } finally {
      resetSettingsState();
    }
  });

  it("E6-W04 step 0: D10's PUT refuses an impersonation token (403 IMPERSONATION_DENIED) and a non-ADMIN (403), as its GET does", async () => {
    use("impersonated");
    expect(
      await failure(
        client.PUT("/members/{id}/notification-preferences", {
          body: { pushClubNews: false },
          params: { path: { id: "member-laura" } },
        }),
      ),
    ).toMatchObject({ code: "IMPERSONATION_DENIED", status: 403 });
    use("instructor");
    expect(
      await failure(
        client.PUT("/members/{id}/notification-preferences", {
          body: { pushClubNews: false },
          params: { path: { id: "member-laura" } },
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN", status: 403 });
  });
});

describe("E7-W01 step 10 · D9's templates follow the S11 contract (R-11-12)", () => {
  it("lists the mockup's counts per category, the catalog codes and a CUSTOM CLUB_NEWS template, with labels in the admin's language", async () => {
    const { data } = await list();
    expectValid("MessageTemplateList", data);
    expect(data?.countsByCategory).toEqual({
      CLUB_CHANGES: 8,
      CLUB_NEWS: 4,
      OPERATIONAL: 12,
      PERSONAL: 6,
    });
    const personal = (await list({ category: "PERSONAL" })).data?.items.map(
      (item) => `${item.name} (${item.code ?? "—"})`,
    );
    expect(personal?.slice(0, 4)).toEqual([
      "Benvinguda amb accés (N-02)",
      "Canvi de nivell (N-09)",
      "Comunicació de baixa com a associat (N-28)",
      "T'hem trobat a faltar (N-19)",
    ]);
    const custom = data?.items.find((item) => item.kind === "CUSTOM");
    expect(custom).toMatchObject({ category: "CLUB_NEWS", code: null });
    expect(custom?.caps).toEqual({ ADMINS: [], INSTRUCTORS: [], MEMBER: ["APP", "EMAIL"] });
    const n09 = data?.items.find((item) => item.code === "N-09");
    expect(n09?.caps.MEMBER).not.toContain("SMS");
    use("admin", "es");
    const es = (await detail("tpl-n-28")).data;
    expect(es?.variables.map((variable) => variable.label)).toContain("perro_nombre");
  });

  it("N-28 carries mockup D9's body, customized, with its seed; N-08a is mandatory with an SMS text", async () => {
    const n28 = (await detail("tpl-n-28")).data;
    expectValid("MessageTemplateDetail", n28);
    expect(n28?.bodyI18n.ca).toContain("Hola [[member_first_name]],\net comuniquem");
    expect(n28).toMatchObject({ customized: true, mandatory: false, version: 3 });
    expect(n28?.seedDefault?.bodyI18n.ca).not.toContain("\n");
    const n08a = (await detail("tpl-n-08a")).data;
    expect(n08a).toMatchObject({ mandatory: true });
    expect(n08a?.matrix.MEMBER).toEqual({ APP: true, EMAIL: true, SMS: true });
    expect(n08a?.smsBodyI18n?.ca).toContain("[[admin_text]]");
  });

  it("PUT bumps the version; a stale one is 409 STALE_VERSION; a cell outside caps is 422 CHANNEL_NOT_ALLOWED; a mandatory one cannot be disabled (422); a missing required variable is VALIDATION_ERROR with missingVariables", async () => {
    const n28 = (await detail("tpl-n-28")).data;
    if (n28 === undefined) throw new TypeError("No N-28");
    const body = {
      body: n28.bodyI18n,
      color: n28.color,
      enabled: true,
      icon: n28.icon,
      matrix: n28.matrix,
      title: n28.titleI18n,
      version: n28.version,
    };
    const saved = await client.PUT("/message-templates/{id}", {
      body,
      params: { path: { id: "tpl-n-28" } },
    });
    expectValid("MessageTemplateDetail", saved.data);
    expect(saved.data?.version).toBe(4);
    await expect(
      failure(
        client.PUT("/message-templates/{id}", { body, params: { path: { id: "tpl-n-28" } } }),
      ),
    ).resolves.toMatchObject({ code: "STALE_VERSION", status: 409 });
    const fresh = { ...body, version: 4 };
    await expect(
      failure(
        client.PUT("/message-templates/{id}", {
          body: {
            ...fresh,
            matrix: { ...fresh.matrix, MEMBER: { APP: true, EMAIL: true, SMS: true } },
          },
          params: { path: { id: "tpl-n-28" } },
        }),
      ),
    ).resolves.toMatchObject({ code: "CHANNEL_NOT_ALLOWED", status: 422 });
    const n02 = (await detail("tpl-n-02")).data;
    if (n02 === undefined) throw new TypeError("No N-02");
    const n02Body = {
      body: n02.bodyI18n,
      color: n02.color,
      enabled: false,
      icon: n02.icon,
      matrix: n02.matrix,
      title: n02.titleI18n,
      version: n02.version,
    };
    await expect(
      failure(
        client.PUT("/message-templates/{id}", {
          body: n02Body,
          params: { path: { id: "tpl-n-02" } },
        }),
      ),
    ).resolves.toMatchObject({ code: "TEMPLATE_MANDATORY", status: 422 });
    // N-08a's `admin_text` is required (R-11-12; N-02's `link` is not, E76/E79).
    const n08a = (await detail("tpl-n-08a")).data;
    if (n08a === undefined) throw new TypeError("No N-08a");
    await expect(
      failure(
        client.PUT("/message-templates/{id}", {
          body: {
            body: { ca: "La classe queda anul·lada.", es: "La clase queda anulada." },
            color: n08a.color,
            enabled: true,
            icon: n08a.icon,
            matrix: n08a.matrix,
            smsBody: n08a.smsBodyI18n ?? null,
            title: n08a.titleI18n,
            version: n08a.version,
          },
          params: { path: { id: "tpl-n-08a" } },
        }),
      ),
    ).resolves.toMatchObject({
      code: "VALIDATION_ERROR",
      details: { missingVariables: ["admin_text"] },
      status: 400,
    });
  });

  it("the preview renders the unsaved draft with the fictional data, the SMS counter after GSM-7 and the truncation; an unknown variable is a warning", async () => {
    const preview = await client.POST("/message-templates/{id}/preview", {
      body: {
        draft: {
          body: "Hola [[member_first_name]], [[sabor]]",
          smsBody: "[[club_name]]: [[admin_text]] [[admin_text]]",
          title: "Avís per a [[dog_name]]",
        },
        locale: "ca",
      },
      params: { path: { id: "tpl-n-08a" } },
    });
    expectValid("TemplatePreview", preview.data);
    expect(preview.data).toMatchObject({
      body: "Hola Laura, ",
      emailSubject: "Avís per a Duna",
      title: "Avís per a Duna",
      warnings: [{ code: "TEMPLATE_UNKNOWN_VARIABLE", variable: "sabor" }],
    });
    expect(preview.data?.sms).toMatchObject({ length: 160, segments: 1, truncated: true });
    expect(preview.data?.sms?.text.endsWith("…")).toBe(true);
    expect(preview.data?.sms?.text).not.toMatch(/[·à]/u);
  });

  it("reset restores the seed (CATALOG only: 422 TEMPLATE_NOT_CATALOG); DELETE archives a CUSTOM one (a CATALOG one is 422 TEMPLATE_NOT_CUSTOM); POST creates a CUSTOM one", async () => {
    const reset = await client.POST("/message-templates/{id}/reset", {
      params: { path: { id: "tpl-n-28" } },
    });
    expect(reset.data).toMatchObject({ customized: false, version: 4 });
    await expect(
      failure(
        client.POST("/message-templates/{id}/reset", { params: { path: { id: "tpl-custom-1" } } }),
      ),
    ).resolves.toMatchObject({ code: "TEMPLATE_NOT_CATALOG", status: 422 });
    await expect(
      failure(client.DELETE("/message-templates/{id}", { params: { path: { id: "tpl-n-09" } } })),
    ).resolves.toMatchObject({ code: "TEMPLATE_NOT_CUSTOM", status: 422 });
    await client.DELETE("/message-templates/{id}", { params: { path: { id: "tpl-custom-1" } } });
    expect((await list()).data?.countsByCategory.CLUB_NEWS).toBe(3);
    const created = await client.POST("/message-templates", {
      body: {
        body: { ca: "Portes obertes" },
        category: "CLUB_NEWS",
        color: "NEUTRAL",
        icon: "bell",
        matrix: {
          ADMINS: { APP: false, EMAIL: false, SMS: false },
          INSTRUCTORS: { APP: false, EMAIL: false, SMS: false },
          MEMBER: { APP: true, EMAIL: true, SMS: false },
        },
        title: { ca: "Portes obertes" },
      },
    });
    expect(created.response.status).toBe(201);
    expectValid("MessageTemplateDetail", created.data);
    expect(created.data).toMatchObject({ code: null, kind: "CUSTOM", version: 1 });
  });

  it("«Enviar comunicat»: dryRun counts the members of the filters like GET /members; the send is 202 with its batch, and the same key replays it; N-08a is 422 TEMPLATE_NOT_SENDABLE; nobody is 422 NO_RECIPIENTS", async () => {
    const members = (
      await client.GET("/members", { params: { query: { filter: ["status:eq:ACTIVE"] } } })
    ).data;
    const dry = await send("tpl-n-24", {
      dryRun: true,
      recipients: { filters: ["status:eq:ACTIVE"] },
    });
    expectValid("AnnouncementResult", dry.data);
    expect(dry.response.status).toBe(200);
    expect(dry.data).toEqual({ batchId: null, recipientCount: members?.totalItems });
    const key = crypto.randomUUID();
    const body = {
      dryRun: false,
      recipients: { memberIds: ["member-laura", "member-anna", "member-laura"] },
    };
    const sent = await send("tpl-custom-1", body, key);
    expect(sent.response.status).toBe(202);
    expect(sent.data).toEqual({ batchId: "batch-0001", recipientCount: 2 });
    expect((await send("tpl-custom-1", body, key)).data).toEqual(sent.data);
    await expect(
      failure(send("tpl-n-08a", { dryRun: true, recipients: { memberIds: ["member-laura"] } })),
    ).resolves.toMatchObject({ code: "TEMPLATE_NOT_SENDABLE", status: 422 });
    await expect(
      failure(send("tpl-n-24", { dryRun: true, recipients: { memberIds: ["member-nobody"] } })),
    ).resolves.toMatchObject({ code: "NO_RECIPIENTS", status: 422 });
  });

  it("the log lists every delivery status, filters by member and status, and answers a detail with its deliveries; another role gets 403", async () => {
    const page = await client.GET("/notifications", { params: { query: {} } });
    expectValid("NotificationPage", page.data);
    const statuses = new Set(
      page.data?.items.flatMap((item) => (item.channels ?? []).map((channel) => channel.status)),
    );
    expect([...statuses].sort()).toEqual([
      "DELIVERED",
      "FAILED",
      "QUEUED",
      "SENT",
      "SKIPPED_BY_PREFERENCE",
      "SKIPPED_CAP",
      "SKIPPED_MODULE_OFF",
      "SKIPPED_NOT_ALLOWED",
      "SKIPPED_NO_CONTACT",
      "SKIPPED_STALE",
    ]);
    expect(page.data?.items[0]?.createdAt).toBe("2026-08-10T15:58:00Z");
    const laura = await client.GET("/notifications", {
      params: { query: { filter: ["memberId:eq:member-laura"] } },
    });
    expect(laura.data?.items.every((item) => item.recipient?.memberId === "member-laura")).toBe(
      true,
    );
    const failed = await client.GET("/notifications", {
      params: { query: { filter: ["status:eq:FAILED"] } },
    });
    expect(failed.data?.items.map((item) => item.code)).toEqual(["N-09"]);
    const values = await client.GET("/notifications/filter-values", {
      params: { query: { field: "memberId" } },
    });
    expectValid("FilterValues", values.data);
    expect(values.data?.values.find((value) => value.value === "member-laura")?.label).toBe(
      "Laura Serra Vidal",
    );
    const first = await client.GET("/notifications/{id}", {
      params: { path: { id: "notification-1" } },
    });
    expectValid("NotificationDetail", first.data);
    expect(
      first.data?.deliveries.map((item) => `${item.channel} ${item.status} ${item.target ?? "—"}`),
    ).toEqual(["APP DELIVERED —", "EMAIL DELIVERED laura@example.test", "SMS SENT +34655100101"]);
    await expect(
      failure(client.GET("/notifications", { params: { query: { filter: ["title:eq:x"] } } })),
    ).resolves.toMatchObject({ code: "INVALID_FILTER", status: 400 });
    use("instructor");
    await expect(failure(list())).resolves.toMatchObject({ code: "FORBIDDEN", status: 403 });
    use("impersonated");
    await expect(failure(list())).resolves.toMatchObject({
      code: "IMPERSONATION_DENIED",
      status: 403,
    });
  });

  it("E7-W01 round 2 #1: the export takes its own x-columns (createdAt, code, recipient, channels, readAt), never the list's category or audience", async () => {
    const exported = (columns: string) =>
      fetch(`${base}/notifications/export?format=xlsx&columns=${encodeURIComponent(columns)}`);
    expect((await exported("createdAt,code,recipient,channels,readAt")).status).toBe(200);
    for (const columns of ["createdAt,code,category", "recipient,audience"]) {
      const refused = await exported(columns);
      expect(refused.status).toBe(400);
      expect(((await refused.json()) as { code: string }).code).toBe("INVALID_FILTER");
    }
  });

  it("E7-W01 round 2 #7: the applied filters echo a list (in, nin) and a range (between) as arrays, as the api does", async () => {
    const { data } = await client.GET("/notifications", {
      params: {
        query: {
          filter: [
            "memberId:in:member-laura,member-anna",
            "createdAt:between:2026-08-01,2026-08-31",
            "status:nin:FAILED",
          ],
        },
      },
    });
    expectValid("NotificationPage", data);
    expect(data?.appliedFilters).toEqual([
      { field: "memberId", op: "in", value: ["member-laura", "member-anna"] },
      { field: "createdAt", op: "between", value: ["2026-08-01", "2026-08-31"] },
      { field: "status", op: "nin", value: ["FAILED"] },
    ]);
  });
});

describe("E7-W06 step 5 (ruling E82, E6-W04 Q3) · SMS_BODY_TOO_LONG counts the SMS as the api does (S11 R-11-06)", () => {
  /** N-08a's saved texts with `smsCa` as its Catalan SMS (its SMS cell is on). */
  async function n08aWithSms(smsCa: string) {
    const n08a = (await detail("tpl-n-08a")).data;
    if (n08a === undefined) throw new TypeError("No N-08a");
    return client.PUT("/message-templates/{id}", {
      body: {
        body: n08a.bodyI18n,
        color: n08a.color,
        enabled: true,
        icon: n08a.icon,
        matrix: n08a.matrix,
        smsBody: { ...n08a.smsBodyI18n, ca: smsCa },
        title: n08a.titleI18n,
        version: n08a.version,
      },
      params: { path: { id: "tpl-n-08a" } },
    });
  }

  it("E7-W06 step 5: a text longer than 160 as typed but within 160 once rendered with the preview data and transliterated to GSM-7 is saved", async () => {
    // 175 characters as typed; «B+C B+C …», 31, once rendered.
    const sms = Array.from({ length: 8 }, () => "[[class_description]]").join(" ");
    expect(sms.length).toBeGreaterThan(160);
    const saved = await n08aWithSms(sms);
    expect(saved.response.status).toBe(200);
    expect(saved.data?.smsBodyI18n?.ca).toBe(sms);
  });

  it("E7-W06 step 5: a text within 160 as typed but longer once rendered (the club's name) is refused with the api's details: 400 SMS_BODY_TOO_LONG {field: smsBody.ca, max: 160}", async () => {
    const shown = await client.POST("/message-templates/{id}/preview", {
      body: { draft: { body: "[[club_name]]", title: "[[club_name]]" }, locale: "ca" },
      params: { path: { id: "tpl-n-08a" } },
    });
    const clubName = shown.data?.title ?? "";
    expect(clubName.length).toBeGreaterThan("[[club_name]]".length);
    const sms = `${"x".repeat(160 - "[[club_name]]".length)}[[club_name]]`;
    expect(sms).toHaveLength(160);
    const refused = await failure(n08aWithSms(sms));
    expect(refused).toMatchObject({ code: "SMS_BODY_TOO_LONG", status: 400 });
    expectValid("TemplateFieldDetails", refused.details);
    expect(refused.details).toEqual({ field: "smsBody.ca", max: 160 });
  });

  it("E7-W06 step 5: N-08a's own seed is saved — `admin_text`, written by the admin at each send, does not count, though the preview with its sample text is over 160", async () => {
    const n08a = (await detail("tpl-n-08a")).data;
    const seed = n08a?.smsBodyI18n?.ca ?? "";
    expect(seed).toContain("[[admin_text]]");
    const preview = await client.POST("/message-templates/{id}/preview", {
      body: { locale: "ca" },
      params: { path: { id: "tpl-n-08a" } },
    });
    expect(preview.data?.sms?.truncated).toBe(true);
    const saved = await n08aWithSms(seed);
    expect(saved.response.status).toBe(200);
  });
});

describe("E7-W06 step 5 (ruling E82, E6-W04 Q3) · an erased member on D10 (S14 §5, R-14-15)", () => {
  it("E7-W06 step 5: the erased member's overview answers pseudonymised with its erasedAt; D10's preferences read and save answer 409 MEMBER_ERASED in the api's envelope", async () => {
    const overview = await client.GET("/members/{id}/overview", {
      params: { path: { id: ERASED_MEMBER_ID } },
    });
    expectValid("MemberOverview", overview.data);
    expect(overview.data?.member).toMatchObject({
      contactEmails: [],
      displayStatus: { kind: "ERASED" },
      firstName: "Abonat suprimit",
      id: ERASED_MEMBER_ID,
      phones: [],
      status: "LEFT",
    });
    expect(overview.data?.member.erasedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
    const read = await failure(
      client.GET("/members/{id}/notification-preferences", {
        params: { path: { id: ERASED_MEMBER_ID } },
      }),
    );
    expect(read).toEqual({ code: "MEMBER_ERASED", details: {}, status: 409 });
    const saved = await failure(
      client.PUT("/members/{id}/notification-preferences", {
        body: { pushClubNews: false },
        params: { path: { id: ERASED_MEMBER_ID } },
      }),
    );
    expect(saved).toEqual({ code: "MEMBER_ERASED", details: {}, status: 409 });
    // The roles come first, as on any member: a non-ADMIN is 403.
    use("instructor");
    await expect(
      failure(
        client.GET("/members/{id}/notification-preferences", {
          params: { path: { id: ERASED_MEMBER_ID } },
        }),
      ),
    ).resolves.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });
});
