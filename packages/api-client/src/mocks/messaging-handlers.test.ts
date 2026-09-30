import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import openapiDocument from "../../openapi/openapi.json";
import { isApiError } from "../api-error";
import { createApiClient } from "../client";

import { mockScenario, resetMessagingMockState, type MockScenario } from "./handlers";
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
    await expect(
      failure(
        client.PUT("/message-templates/{id}", {
          body: {
            ...n02Body,
            body: { ca: "Ja tens accés.", es: "Ya tienes acceso." },
            enabled: true,
          },
          params: { path: { id: "tpl-n-02" } },
        }),
      ),
    ).resolves.toMatchObject({
      code: "VALIDATION_ERROR",
      details: { missingVariables: ["link"] },
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
