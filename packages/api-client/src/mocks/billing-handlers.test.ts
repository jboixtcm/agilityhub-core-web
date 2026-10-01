import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import openapiDocument from "../../openapi/openapi.json";
import { isApiError } from "../api-error";
import { createApiClient } from "../client";
import type { components } from "../generated/schema";

import {
  BILLING_MOCK_NOW,
  ERASED_MEMBER_ID,
  mockScenario,
  resetBillingMockState,
  type MockScenario,
} from "./handlers";
import { server } from "./server";

type BillingRunRequest = components["schemas"]["BillingRunRequest"];
type Invoice = components["schemas"]["Invoice"];
type ManualInvoiceRequest = components["schemas"]["ManualInvoiceRequest"];
type Money = components["schemas"]["Money"];

const openapiSchemaId = "https://agilityhub.local/billing-openapi.json";
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(openapiDocument, openapiSchemaId);

function expectValid(name: string, value: unknown) {
  const validate = ajv.compile({ $ref: `${openapiSchemaId}#/components/schemas/${name}` });
  expect(validate(value), JSON.stringify(validate.errors, null, 2)).toBe(true);
}

const base = "https://core.example.test/api/v1";
let client = createApiClient({ baseUrl: base, getLocale: () => "ca" });

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

const eur = (amountMinor: number): Money => ({ amountMinor, currency: "EUR" });
const newKey = () => crypto.randomUUID();
/** The club-local day of `BILLING_MOCK_NOW` (Wednesday 26/08/2026). */
const TODAY = "2026-08-26";
const SEPTEMBER = "2026-09";
const UNKNOWN_ID = "b9000000-0000-4000-8000-000000000999";

const readPeriod = (period: string) =>
  client.GET("/billing/periods/{period}", { params: { path: { period } } });

async function month(period = SEPTEMBER) {
  const { data } = await readPeriod(period);
  if (data === undefined) throw new TypeError(`No month ${period}`);
  return data;
}

async function liveRunId(period = SEPTEMBER) {
  const id = (await month(period)).run?.id;
  if (id === undefined) throw new TypeError(`No run in ${period}`);
  return id;
}

const simulate = (period: string) => client.POST("/billing/simulations", { body: { period } });

async function simulationId(period = SEPTEMBER) {
  const { data } = await simulate(period);
  if (data === undefined) throw new TypeError(`No simulation of ${period}`);
  return data.id;
}

const generate = (body: BillingRunRequest, key = newKey()) =>
  client.POST("/billing/runs", { body, params: { header: { "Idempotency-Key": key } } });
const readRun = (id: string) => client.GET("/billing/runs/{id}", { params: { path: { id } } });
const rollback = (id: string, confirmation = "RETROCEDIR") =>
  client.POST("/billing/runs/{id}/rollback", {
    body: { confirmation, reason: "Preu de la quota equivocat" },
    params: { header: { "Idempotency-Key": newKey() }, path: { id } },
  });
const chargeCards = (id: string) =>
  client.POST("/billing/runs/{id}/card-charges", {
    params: { header: { "Idempotency-Key": newKey() }, path: { id } },
  });

interface InvoiceQuery {
  fields?: string;
  filter?: string[];
  q?: string;
  size?: 20 | 50 | 200 | 1000;
  sort?: string[];
}

const list = (query: InvoiceQuery) => client.GET("/invoices", { params: { query } });

async function total(filter: string[]) {
  return (await list({ filter, size: 20 })).data?.totalItems;
}

const readInvoice = (id: string) => client.GET("/invoices/{id}", { params: { path: { id } } });

/** The live receipt with that number (a rolled-back one is listed only under CANCELLED). */
async function receipt(displayNumber: string): Promise<Invoice> {
  const row = (await list({ q: displayNumber })).data?.items.find(
    (item) => item.displayNumber === displayNumber,
  );
  if (row === undefined) throw new TypeError(`No receipt ${displayNumber}`);
  const { data } = await readInvoice(row.id);
  if (data === undefined) throw new TypeError(`No receipt ${displayNumber}`);
  return data;
}

const pay = (
  invoice: Pick<Invoice, "id" | "version">,
  paidAt = TODAY,
  key = newKey(),
  channel: "BIZUM" | "CASH" | "TRANSFER" = "CASH",
) =>
  client.POST("/invoices/{id}/payment", {
    body: { channel, paidAt, version: invoice.version },
    params: { header: { "Idempotency-Key": key }, path: { id: invoice.id } },
  });
const markFailed = (invoice: Pick<Invoice, "id" | "version">, at = TODAY) =>
  client.POST("/invoices/{id}/failure", {
    body: { at, reason: "Compte tancat", version: invoice.version },
    params: { header: { "Idempotency-Key": newKey() }, path: { id: invoice.id } },
  });
const cancel = (invoice: Pick<Invoice, "id" | "version">, reason = "Baixa del club") =>
  client.POST("/invoices/{id}/cancellation", {
    body: { reason, version: invoice.version },
    params: { header: { "Idempotency-Key": newKey() }, path: { id: invoice.id } },
  });
const retry = (invoice: Pick<Invoice, "id" | "version">) =>
  client.POST("/invoices/{id}/retry", {
    body: { version: invoice.version },
    params: { header: { "Idempotency-Key": newKey() }, path: { id: invoice.id } },
  });
const refund = (id: string, amount?: Money) =>
  client.POST("/invoices/{id}/refund", {
    body: { reason: "Cobrament duplicat", ...(amount === undefined ? {} : { amount }) },
    params: { header: { "Idempotency-Key": newKey() }, path: { id } },
  });
const createManual = (body: ManualInvoiceRequest) =>
  client.POST("/invoices", { body, params: { header: { "Idempotency-Key": newKey() } } });
const adjustment = (memberId: string, amountMinor = -3000, currency = "EUR") =>
  createManual({
    lines: [{ base: { amountMinor, currency }, description: "Ajust de la quota", taxPercent: 0 }],
    memberId,
    note: "",
  });

const readRemittances = () => client.GET("/remittances", { params: { query: {} } });
const submit = (id: string, submittedAt = TODAY) =>
  client.POST("/remittances/{id}/submission", {
    body: { submittedAt },
    params: { header: { "Idempotency-Key": newKey() }, path: { id } },
  });

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  vi.useFakeTimers({ now: new Date(BILLING_MOCK_NOW), shouldAdvanceTime: true, toFake: ["Date"] });
  resetBillingMockState();
  use("admin");
});
afterEach(() => {
  server.resetHandlers();
  vi.useRealTimers();
  resetBillingMockState();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

describe("S12 R-12-07 · D6's month (GET /billing/periods/{period})", () => {
  it("T-12-25 reads September as the mockup: the 25/08 simulation, the generated run (rollbackable, no blockers), its GENERATED remittance and the chips", async () => {
    const { data, response } = await readPeriod(SEPTEMBER);
    expect(response.status).toBe(200);
    expectValid("BillingPeriod", data);
    expect(data?.counts).toEqual({ all: 168, failed: 2, paid: 0, pending: 4, remitted: 162 });
    expect(data?.run).toMatchObject({
      byProvider: {
        MANUAL: { count: 4, total: eur(24000) },
        SEPA_XML: { count: 164, total: eur(624000) },
      },
      rollbackBlockers: [],
      rollbackable: true,
      status: "GENERATED",
    });
    expect(data?.remittance).toMatchObject({ fileAvailable: true, status: "GENERATED" });
    expect(data?.run?.byProvider.SEPA_XML?.remittanceId).toBe(data?.remittance?.id);
    expect(data?.simulation).toMatchObject({
      at: "2026-08-25T07:12:00Z",
      kpis: {
        cashPending: 4,
        count: 168,
        inactivityFees: { count: 2, firstMonth: eur(2000), following: eur(1000) },
        total: eur(648000),
      },
    });
    expect(data?.simulation?.incidents.map((incident) => incident.code)).toEqual([
      "NO_BANK_ACCOUNT",
      "NO_PRICE",
    ]);
    expect(data?.simulation?.cashMembers.map((member) => member.memberName)).toEqual([
      "Joan Vila",
      "Roser Camps",
    ]);
  });

  it("reads August as collected (COMPLETED, its remittance SUBMITTED) and a month without anything (2026-11) with null parts and zero chips", async () => {
    const august = await month("2026-08");
    expectValid("BillingPeriod", august);
    expect(august.run).toMatchObject({ rollbackable: false, status: "COMPLETED" });
    expect(august.run?.rollbackBlockers).toContain("REMITTANCE_SUBMITTED");
    expect(august.remittance?.status).toBe("SUBMITTED");
    expect(august.counts).toEqual({ all: 168, failed: 1, paid: 167, pending: 0, remitted: 0 });

    const empty = await month("2026-11");
    expectValid("BillingPeriod", empty);
    expect(empty).toEqual({
      counts: { all: 0, failed: 0, paid: 0, pending: 0, remitted: 0 },
      period: "2026-11",
      remittance: null,
      run: null,
      simulation: null,
    });
  });

  it("refuses a period that is not YYYY-MM with 400 VALIDATION_ERROR on period", async () => {
    expect(await failure(readPeriod("2026-13"))).toEqual({
      code: "VALIDATION_ERROR",
      details: { fieldErrors: [{ code: "INVALID_FORMAT", field: "period" }] },
      status: 400,
    });
  });
});

describe("T-12-21 / T-12-22 · S12 §6 guards: ADMIN only, no impersonation, BILLING on, the caller's club", () => {
  it("T-12-21 an INSTRUCTOR and a MEMBER get 403 FORBIDDEN and an impersonation token 403 IMPERSONATION_DENIED on /billing/*, /invoices and /remittances", async () => {
    const runId = await liveRunId();
    const refusals = async (scenario: MockScenario) => {
      use(scenario);
      return [
        await failure(readPeriod(SEPTEMBER)),
        await failure(readRun(runId)),
        await failure(generate({ period: SEPTEMBER, simulationId: UNKNOWN_ID })),
        await failure(list({})),
        await failure(readRemittances()),
      ];
    };
    for (const scenario of ["instructor", "member"] as const) {
      for (const refusal of await refusals(scenario)) {
        expect(refusal, scenario).toEqual({ code: "FORBIDDEN", details: {}, status: 403 });
      }
    }
    for (const refusal of await refusals("impersonated")) {
      expect(refusal).toEqual({ code: "IMPERSONATION_DENIED", details: {}, status: 403 });
    }
  });

  it("T-12-22 BILLING off → 404 MODULE_DISABLED on the month, the run, the receipts, the remittances and both exports", async () => {
    const runId = await liveRunId();
    use("adminNoBilling");
    const disabled = { code: "MODULE_DISABLED", details: {}, status: 404 };
    expect(await failure(readPeriod(SEPTEMBER))).toEqual(disabled);
    expect(await failure(simulate(SEPTEMBER))).toEqual(disabled);
    expect(await failure(readRun(runId))).toEqual(disabled);
    expect(await failure(list({}))).toEqual(disabled);
    expect(await failure(readRemittances())).toEqual(disabled);
    expect(
      await failure(
        client.GET("/billing/exports", {
          params: { query: { period: SEPTEMBER } },
          parseAs: "text",
        }),
      ),
    ).toEqual(disabled);
    expect(
      await failure(
        client.GET("/invoices/export", { params: { query: { format: "xlsx" } }, parseAs: "blob" }),
      ),
    ).toEqual(disabled);
  });

  it("T-12-21 the admin of another club (adminOtherClub: the club mínim, without BILLING) gets 404 before any of the Cànic's records is read", async () => {
    const runId = await liveRunId();
    const laura = await receipt("2026-0912");
    use("adminOtherClub");
    const disabled = { code: "MODULE_DISABLED", details: {}, status: 404 };
    expect(await failure(readRun(runId))).toEqual(disabled);
    expect(await failure(readInvoice(laura.id))).toEqual(disabled);
    expect(await failure(list({}))).toEqual(disabled);
    expect(await failure(readPeriod(SEPTEMBER))).toEqual(disabled);
  });

  it("T-12-21 the admin of another club with BILLING (billingOtherClub) finds none of the Cànic's records: 404 by id, an empty month and an empty list", async () => {
    const runId = await liveRunId();
    const laura = await receipt("2026-0912");
    use("billingOtherClub");
    const notFound = { code: "NOT_FOUND", details: {}, status: 404 };
    expect(await failure(readRun(runId))).toEqual(notFound);
    expect(await failure(readInvoice(laura.id))).toEqual(notFound);
    const month = (await readPeriod(SEPTEMBER)).data;
    expect(month).toMatchObject({
      counts: { all: 0, failed: 0, paid: 0, pending: 0, remitted: 0 },
      remittance: null,
      run: null,
      simulation: null,
    });
    expect((await list({})).data?.totalItems).toBe(0);
  });
});

describe("S12 R-12-07 · POST /billing/simulations («1 · SIMULA EL MES»)", () => {
  it("simulates a month: 201 BillingSimulation with the 168 previews, kept as the month's only simulation", async () => {
    const before = (await month()).simulation?.id;
    const { data, response } = await simulate(SEPTEMBER);
    expect(response.status).toBe(201);
    expectValid("BillingSimulation", data);
    expect(data?.period).toBe(SEPTEMBER);
    expect(data?.invoicesPreview).toHaveLength(168);
    expect(data?.invoicesPreview[0]).toMatchObject({
      lines: [{ description: "Quota Abonat 2 gossos — Setembre 2026", total: eur(9000) }],
      memberName: "Laura Serra",
      paymentMethodType: "SEPA_DD",
      total: eur(9000),
    });
    expect(data?.kpis.total).toEqual(eur(648000));
    const after = (await month()).simulation?.id;
    expect(after).toBe(data?.id);
    expect(after).not.toBe(before);

    const november = await simulate("2026-11");
    expect(november.response.status).toBe(201);
    expect(november.data?.invoicesPreview[0]?.lines[0]?.description).toBe(
      "Quota Abonat 2 gossos — Novembre 2026",
    );
  });

  it("refuses a month more than three months ahead of the club's current month (2026-12 on 26/08) with 400 VALIDATION_ERROR on period", async () => {
    const refused = await failure(simulate("2026-12"));
    expect(refused).toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    expect(refused.details).toEqual({ fieldErrors: [{ code: "OUT_OF_RANGE", field: "period" }] });
  });
});

describe("S12 R-12-11 / R-12-12 · POST /billing/runs («2 · GENERA REMESA SEPA (XML)», T-12-09, T-12-10, T-12-29b, T-12-32)", () => {
  it("T-12-10 one live run per month: September's simulation answers 409 RUN_EXISTS", async () => {
    const simulation = (await month()).simulation?.id ?? "";
    expect(await failure(generate({ period: SEPTEMBER, simulationId: simulation }))).toEqual({
      code: "RUN_EXISTS",
      details: {},
      status: 409,
    });
  });

  it("T-12-09 / T-12-13 after a rollback the old simulation is stale (409 SIMULATION_STALE); a new one generates the same numbers 2026-0912…2026-1079 (R-12-14)", async () => {
    const before = await month();
    const oldSimulation = before.simulation?.id ?? "";
    expect((await rollback(before.run?.id ?? "")).response.status).toBe(200);
    expect(await failure(generate({ period: SEPTEMBER, simulationId: oldSimulation }))).toEqual({
      code: "SIMULATION_STALE",
      details: {},
      status: 409,
    });

    const { data, response } = await generate({
      period: SEPTEMBER,
      simulationId: await simulationId(),
    });
    expect(response.status).toBe(201);
    expectValid("BillingRunResult", data);
    expect(data?.run).toMatchObject({
      collectionDate: "2026-09-01",
      period: SEPTEMBER,
      rollbackBlockers: [],
      rollbackable: true,
      status: "GENERATED",
    });
    expect(data?.run.id).not.toBe(before.run?.id);
    expect(data?.run.invoiceIds).toHaveLength(168);
    expect(data?.skipped.map((incident) => incident.code)).toEqual(["NO_BANK_ACCOUNT", "NO_PRICE"]);
    expect(data?.remittance).toMatchObject({
      count: 164,
      requestedCollectionDate: "2026-09-01",
      status: "GENERATED",
      total: eur(624000),
    });
    const numbers = await list({
      filter: [`runId:eq:${data?.run.id ?? ""}`],
      size: 200,
      sort: ["number,asc"],
    });
    expect(numbers.data?.totalItems).toBe(168);
    expect(numbers.data?.items[0]?.displayNumber).toBe("2026-0912");
    expect(numbers.data?.items.at(-1)?.displayNumber).toBe("2026-1079");
    expect((await month()).counts).toEqual({
      all: 168,
      failed: 0,
      paid: 0,
      pending: 4,
      remitted: 164,
    });
  });

  it("an unknown simulation (or none for the month) → 404 NOT_FOUND", async () => {
    const notFound = { code: "NOT_FOUND", details: {}, status: 404 };
    expect(await failure(generate({ period: SEPTEMBER, simulationId: UNKNOWN_ID }))).toEqual(
      notFound,
    );
    expect(await failure(generate({ period: "2026-10", simulationId: UNKNOWN_ID }))).toEqual(
      notFound,
    );
  });

  it("T-12-10 the same Idempotency-Key and body replay the same run; the same key with another body is 409 IDEMPOTENCY_KEY_REUSED", async () => {
    const simulation = await simulationId("2026-10");
    const key = newKey();
    const first = await generate({ period: "2026-10", simulationId: simulation }, key);
    expect(first.response.status).toBe(201);
    const replay = await generate({ period: "2026-10", simulationId: simulation }, key);
    expect(replay.response.status).toBe(201);
    expect(replay.data?.run.id).toBe(first.data?.run.id);
    expect(await total(["period:eq:2026-10"])).toBe(168);
    expect(
      await failure(
        generate(
          { collectionDate: "2026-10-02", period: "2026-10", simulationId: simulation },
          key,
        ),
      ),
    ).toEqual({
      code: "IDEMPOTENCY_KEY_REUSED",
      details: { reason: "DIFFERENT_REQUEST" },
      status: 409,
    });
  });

  it("T-12-09 billingStale: the simulation older than the last change → 409 SIMULATION_STALE; simulating again lets the run through", async () => {
    use("billingStale");
    const stale = await month();
    expect(stale.run).toBeNull();
    expect(
      await failure(generate({ period: SEPTEMBER, simulationId: stale.simulation?.id ?? "" })),
    ).toEqual({ code: "SIMULATION_STALE", details: {}, status: 409 });
    const { data, response } = await generate({
      period: SEPTEMBER,
      simulationId: await simulationId(),
    });
    expect(response.status).toBe(201);
    expectValid("BillingRunResult", data);
    expect(data?.remittance?.status).toBe("GENERATED");
    expect((await month()).counts.all).toBe(168);
  });

  it("T-12-29b on Monday 31/08 the 01/09 collection leaves less than two business days → 422 COLLECTION_DATE_TOO_SOON {requested, earliest}", async () => {
    vi.setSystemTime(new Date("2026-08-31T08:00:00Z"));
    expect((await rollback(await liveRunId())).response.status).toBe(200);
    const simulation = await simulationId();
    expect(await failure(generate({ period: SEPTEMBER, simulationId: simulation }))).toEqual({
      code: "COLLECTION_DATE_TOO_SOON",
      details: { earliest: "2026-09-02", requested: "2026-09-01" },
      status: 422,
    });
    const later = await generate({
      collectionDate: "2026-09-02",
      period: SEPTEMBER,
      simulationId: simulation,
    });
    expect(later.response.status).toBe(201);
    expect(later.data?.run.collectionDate).toBe("2026-09-02");
    expect(later.data?.remittance?.requestedCollectionDate).toBe("2026-09-02");
  });

  it("T-12-32 billingManualOnly: the run issues every receipt PENDING by hand and no remittance", async () => {
    use("billingManualOnly");
    const before = await month();
    expect(before.run).toBeNull();
    expect(before.simulation?.kpis.byProvider).toEqual({
      MANUAL: { count: 168, total: eur(648000) },
    });
    const { data, response } = await generate({
      period: SEPTEMBER,
      simulationId: before.simulation?.id ?? "",
    });
    expect(response.status).toBe(201);
    expectValid("BillingRunResult", data);
    expect(data?.remittance).toBeNull();
    expect(data?.run).toMatchObject({
      byProvider: { MANUAL: { count: 168, total: eur(648000) } },
      collectionDate: null,
      status: "GENERATED",
    });
    expect(data?.skipped.map((incident) => incident.code)).toEqual([
      "NO_PRICE",
      "PROVIDER_DISABLED",
    ]);
    const runFilter = `runId:eq:${data?.run.id ?? ""}`;
    expect(await total([runFilter])).toBe(168);
    expect(await total([runFilter, "status:eq:PENDING", "paymentMethodType:eq:MANUAL"])).toBe(168);
    expect((await readRemittances()).data?.totalItems).toBe(0);
    expect((await month()).remittance).toBeNull();
  });
});

describe("S12 R-12-14 · GET /billing/runs/{id} and POST /billing/runs/{id}/rollback (T-12-13, T-12-25)", () => {
  it("reads September's run with rollbackable computed now, August's COMPLETED one not rollbackable, an unknown id 404", async () => {
    const runId = await liveRunId();
    const { data } = await readRun(runId);
    expectValid("BillingRun", data);
    expect(data).toMatchObject({
      collectionDate: "2026-09-01",
      finishedAt: null,
      period: SEPTEMBER,
      rollbackBlockers: [],
      rollbackable: true,
      startedAt: "2026-08-25T07:20:00Z",
      status: "GENERATED",
    });
    expect(data?.invoiceIds).toHaveLength(168);
    const august = (await readRun(await liveRunId("2026-08"))).data;
    expectValid("BillingRun", august);
    expect(august).toMatchObject({ rollbackable: false, status: "COMPLETED" });
    expect(await failure(readRun(UNKNOWN_ID))).toEqual({
      code: "NOT_FOUND",
      details: {},
      status: 404,
    });
  });

  it("T-12-25 the typed confirmation must be exactly RETROCEDIR (400 VALIDATION_ERROR on confirmation)", async () => {
    expect(await failure(rollback(await liveRunId(), "retrocedir"))).toEqual({
      code: "VALIDATION_ERROR",
      details: { fieldErrors: [{ code: "INVALID", field: "confirmation" }] },
      status: 400,
    });
    expect((await month()).run?.status).toBe("GENERATED");
  });

  it("T-12-13 RETROCEDIR cancels the 168 receipts {ROLLBACK}: the month reads zero chips, they list only under CANCELLED with rolledBack, a second rollback is 409 {reasons: []}", async () => {
    const runId = await liveRunId();
    const { data, response } = await rollback(runId);
    expect(response.status).toBe(200);
    expectValid("RollbackResult", data);
    expect(data).toEqual({ cancelledInvoices: 168, restoredMembers: 168 });

    const after = await month();
    expect(after.counts).toEqual({ all: 0, failed: 0, paid: 0, pending: 0, remitted: 0 });
    expect(after.run).toMatchObject({
      id: runId,
      rollbackBlockers: [],
      rollbackable: false,
      status: "ROLLED_BACK",
    });
    expect(after.remittance?.status).toBe("ROLLED_BACK");
    expect((await readRun(runId)).data).toMatchObject({
      rollbackReason: "Preu de la quota equivocat",
      status: "ROLLED_BACK",
    });

    expect(await total([`period:eq:${SEPTEMBER}`])).toBe(0);
    expect((await list({ q: "2026-0912" })).data?.totalItems).toBe(0);
    const cancelled = (
      await list({ filter: [`period:eq:${SEPTEMBER}`, "status:eq:CANCELLED"], size: 200 })
    ).data;
    expectValid("InvoicePage", cancelled);
    expect(cancelled?.totalItems).toBe(168);
    expect(
      cancelled?.items.every((item) => item.rolledBack === true && item.status === "CANCELLED"),
    ).toBe(true);
    const drawer = (await readInvoice(cancelled?.items[0]?.id ?? "")).data;
    expect(drawer).toMatchObject({ cancelReason: "ROLLBACK", status: "CANCELLED" });
    expect(drawer?.collections.at(-1)).toMatchObject({ failureCode: "ROLLBACK", status: "FAILED" });

    expect(await failure(rollback(runId))).toEqual({
      code: "RUN_NOT_ROLLBACKABLE",
      details: { reasons: [] },
      status: 409,
    });
  });

  it("T-12-13 E89 (R-12-14): the rollback takes the whole run, also a receipt the admin cancelled meanwhile: it leaves «Tots», lists under CANCELLED as rolled back and keeps its own reason", async () => {
    const joan = await receipt("2026-0915");
    expect((await cancel(joan)).response.status).toBe(200);
    // Cancelled by the admin, before any rollback: still one of the month's receipts.
    expect((await month()).counts.all).toBe(168);
    expect((await rollback(await liveRunId())).response.status).toBe(200);
    expect((await month()).counts.all).toBe(0);
    const rows = (
      await list({
        filter: [`period:eq:${SEPTEMBER}`, "status:eq:CANCELLED", `memberId:eq:${joan.memberId}`],
      })
    ).data;
    expectValid("InvoicePage", rows);
    expect(rows?.items.find((item) => item.id === joan.id)).toMatchObject({
      rolledBack: true,
      status: "CANCELLED",
    });
    expect((await readInvoice(joan.id)).data).toMatchObject({
      cancelReason: "Baixa del club",
      status: "CANCELLED",
    });
  });

  it("T-12-13 E87 (R-12-19): a manual SEPA receipt with includeInNextRun goes into the next run's remittance (COLLECTING); the run's rollback returns it to PENDING, still waiting", async () => {
    const marc = await receipt("2026-0913");
    const created = await createManual({
      includeInNextRun: true,
      lines: [{ base: eur(1500), description: "Material", taxPercent: 0 }],
      memberId: marc.memberId,
      note: "",
    });
    const id = created.data?.id ?? "";
    expect(created.data).toMatchObject({
      includeInNextRun: true,
      remittanceId: null,
      status: "PENDING",
    });
    const generated = await generate({
      period: "2026-10",
      simulationId: await simulationId("2026-10"),
    });
    expect(generated.response.status).toBe(201);
    const remittance = generated.data?.remittance;
    // October's 164 direct debits (6.240,00 €) and the waiting 15,00 €.
    expect(remittance).toMatchObject({ count: 165, total: eur(625500) });
    const carried = (await readInvoice(id)).data;
    expectValid("Invoice", carried);
    expect(carried).toMatchObject({ remittanceId: remittance?.id, status: "COLLECTING" });
    expect(carried?.collections).toHaveLength(1);
    expect(carried?.collections[0]).toMatchObject({
      provider: "SEPA_XML",
      remittanceId: remittance?.id,
      status: "SUBMITTED",
    });
    expect(remittance?.collectionIds).toContain(carried?.collections[0]?.id);
    // It was issued before the run: no MANUAL_INVOICE_AFTER.
    expect(generated.data?.run).toMatchObject({ rollbackBlockers: [], rollbackable: true });

    expect((await rollback(generated.data?.run.id ?? "")).response.status).toBe(200);
    const back = (await readInvoice(id)).data;
    expectValid("Invoice", back);
    expect(back).toMatchObject({ includeInNextRun: true, remittanceId: null, status: "PENDING" });
    expect(back?.collections.map((entry) => [entry.status, entry.failureCode])).toEqual([
      ["FAILED", "ROLLBACK"],
      ["CREATED", null],
    ]);
    const row = (await list({ q: back?.displayNumber ?? "" })).data?.items.find(
      (item) => item.id === id,
    );
    expect(row).toMatchObject({ rolledBack: false, status: "PENDING" });
  });

  it("T-12-13 billingRollbackBlocked: another admin submits the remittance just before → 409 RUN_NOT_ROLLBACKABLE {REMITTANCE_SUBMITTED}, and the month reads it", async () => {
    use("billingRollbackBlocked");
    const before = await month();
    expect(before.run).toMatchObject({ rollbackBlockers: [], rollbackable: true });
    expect(await failure(rollback(before.run?.id ?? ""))).toEqual({
      code: "RUN_NOT_ROLLBACKABLE",
      details: { reasons: ["REMITTANCE_SUBMITTED"] },
      status: 409,
    });
    const after = await month();
    expect(after.run).toMatchObject({
      rollbackBlockers: ["REMITTANCE_SUBMITTED"],
      rollbackable: false,
      status: "GENERATED",
    });
    expect(after.remittance?.status).toBe("SUBMITTED");
    expect(after.counts.all).toBe(168);
  });

  it("T-12-13 a manual receipt numbered after the run → rollbackable false {MANUAL_INVOICE_AFTER}", async () => {
    const runId = await liveRunId();
    expect((await adjustment("member-laura")).response.status).toBe(201);
    expect((await month()).run).toMatchObject({
      rollbackBlockers: ["MANUAL_INVOICE_AFTER"],
      rollbackable: false,
    });
    expect(await failure(rollback(runId))).toEqual({
      code: "RUN_NOT_ROLLBACKABLE",
      details: { reasons: ["MANUAL_INVOICE_AFTER"] },
      status: 409,
    });
  });

  it("T-12-13 a cash receipt already PAID → rollbackable false {INVOICE_PAID}", async () => {
    const runId = await liveRunId();
    expect((await pay(await receipt("2026-0915"))).response.status).toBe(200);
    expect((await month()).run).toMatchObject({
      rollbackBlockers: ["INVOICE_PAID"],
      rollbackable: false,
    });
    expect(await failure(rollback(runId))).toEqual({
      code: "RUN_NOT_ROLLBACKABLE",
      details: { reasons: ["INVOICE_PAID"] },
      status: 409,
    });
  });
});

describe("S12 D6's receipts · GET /invoices (CONVENCIONS_API §4, T-12-25)", () => {
  it("lists the newest number first, 50 a page, a receipt cancelled by a rollback left out of «Tots»", async () => {
    const { data } = await list({});
    expectValid("InvoicePage", data);
    expect(data).toMatchObject({
      appliedFilters: [],
      page: 0,
      size: 50,
      totalItems: 336,
      totalPages: 7,
    });
    expect(data?.items.slice(0, 2).map((item) => item.displayNumber)).toEqual([
      "2026-1079",
      "2026-1078",
    ]);
  });

  it("sorts by number ascending within September (2026-0912 first) and the month adds up to the simulation", async () => {
    const { data } = await list({
      filter: [`period:eq:${SEPTEMBER}`],
      size: 200,
      sort: ["number,asc"],
    });
    expectValid("InvoicePage", data);
    expect(data?.appliedFilters).toEqual([{ field: "period", op: "eq", value: SEPTEMBER }]);
    expect(data?.items[0]).toEqual({
      concept: "Quota Abonat 2 gossos — Setembre 2026",
      displayNumber: "2026-0912",
      failedAt: null,
      id: data?.items[0]?.id,
      issueDate: "2026-08-25",
      kind: "PERIODIC",
      member: { fullName: "Laura Serra", id: data?.items[0]?.member?.id, memberNumber: 87 },
      number: 912,
      paidAt: null,
      paymentMethodType: "SEPA_DD",
      period: SEPTEMBER,
      refundedTotal: eur(0),
      remittanceId: (await month()).remittance?.id,
      rolledBack: false,
      runId: await liveRunId(),
      status: "COLLECTING",
      total: eur(9000),
    });
    expect(data?.items.reduce((sum, item) => sum + (item.total?.amountMinor ?? 0), 0)).toBe(648000);
  });

  it("T-12-25 the chips are status filters: 4 pending, 162 remitted, 2 failed, 0 paid in September", async () => {
    const chip = (status: string) => total([`period:eq:${SEPTEMBER}`, `status:eq:${status}`]);
    expect(await chip("PENDING")).toBe(4);
    expect(await chip("COLLECTING")).toBe(162);
    expect(await chip("FAILED")).toBe(2);
    expect(await chip("PAID")).toBe(0);
  });

  it("q searches the number and the member's name; total filters on amountMinor", async () => {
    expect((await list({ q: "Laura" })).data?.items.map((item) => item.displayNumber)).toEqual([
      "2026-0912",
      "2026-0744",
    ]);
    expect(
      (await list({ q: "2026-0912" })).data?.items.map((item) => item.member?.fullName),
    ).toEqual(["Laura Serra"]);
    const rich = (await list({ filter: [`period:eq:${SEPTEMBER}`, "total:gte:9000"] })).data;
    expect(rich?.items.map((item) => item.displayNumber)).toEqual(["2026-0912"]);
    expect(rich?.appliedFilters).toEqual([
      { field: "period", op: "eq", value: SEPTEMBER },
      { field: "total", op: "gte", value: "9000" },
    ]);
    const inactivity = (
      await list({ filter: [`period:eq:${SEPTEMBER}`, "total:between:1000,2000"] })
    ).data;
    expect(inactivity?.items.map((item) => item.member?.fullName)).toEqual([
      "Sílvia Roca",
      "Eva Perez",
    ]);
    expect(inactivity?.appliedFilters[1]).toEqual({
      field: "total",
      op: "between",
      value: ["1000", "2000"],
    });
  });

  it("an undeclared filter, sort or fields key → 400 INVALID_FILTER; fields= sends the row id and the requested keys only", async () => {
    const invalid = { code: "INVALID_FILTER", details: {}, status: 400 };
    expect(await failure(list({ filter: ["concept:eq:Quota"] }))).toEqual(invalid);
    expect(await failure(list({ sort: ["status,asc"] }))).toEqual(invalid);
    expect(await failure(list({ fields: "iban" }))).toEqual(invalid);
    const { data } = await list({ fields: "displayNumber,status", size: 20 });
    expectValid("InvoicePage", data);
    expect(Object.keys(data?.items[0] ?? {}).sort()).toEqual(["displayNumber", "id", "status"]);
  });
});

describe("S12 R-12-16 · POST /invoices/{id}/payment and POST /invoices/payments (T-12-14, T-12-32)", () => {
  it("marks Joan Vila's cash receipt 2026-0915 paid: 200 PAID with a MANUAL SUCCEEDED collection", async () => {
    const joan = await receipt("2026-0915");
    expect(joan).toMatchObject({
      memberSnapshot: { fullName: "Joan Vila" },
      paymentMethod: { channel: "CASH", type: "MANUAL" },
      status: "PENDING",
      version: 1,
    });
    const { data, response } = await pay(joan);
    expect(response.status).toBe(200);
    expectValid("Invoice", data);
    expect(data).toMatchObject({ paidAt: "2026-08-26T10:00:00Z", status: "PAID", version: 2 });
    expect(data?.collections.at(-1)).toMatchObject({
      provider: "MANUAL",
      providerRef: "CASH",
      status: "SUCCEEDED",
    });
    expect((await month()).counts).toMatchObject({ paid: 1, pending: 3 });
  });

  it("a FAILED direct debit (Pere Soler's bank return, 2026-1039) can be paid by transfer", async () => {
    const pere = await receipt("2026-1039");
    expect(pere).toMatchObject({ paymentMethod: { type: "SEPA_DD" }, status: "FAILED" });
    const { data } = await pay(pere, TODAY, newKey(), "TRANSFER");
    expect(data).toMatchObject({ status: "PAID" });
    expect(data?.collections.at(-1)).toMatchObject({ provider: "MANUAL", providerRef: "TRANSFER" });
  });

  it("an old version → 409 STALE_VERSION; a COLLECTING receipt → 409 INVALID_STATE {status}; paidAt after today → 400 on paidAt", async () => {
    const roser = await receipt("2026-0916");
    expect(roser.memberSnapshot.fullName).toBe("Roser Camps");
    expect(await failure(pay({ id: roser.id, version: 0 }))).toEqual({
      code: "STALE_VERSION",
      details: {},
      status: 409,
    });
    expect(await failure(pay(await receipt("2026-0912")))).toEqual({
      code: "INVALID_STATE",
      details: { status: "COLLECTING" },
      status: 409,
    });
    expect(await failure(pay(roser, "2026-08-27"))).toEqual({
      code: "VALIDATION_ERROR",
      details: { fieldErrors: [{ code: "INVALID", field: "paidAt" }] },
      status: 400,
    });
    expect((await readInvoice(roser.id)).data).toMatchObject({ status: "PENDING", version: 1 });
  });

  it("T-12-32 two payments with the same key → one PAID (the second replays the first answer)", async () => {
    const roser = await receipt("2026-0916");
    const key = newKey();
    const first = await pay(roser, TODAY, key);
    const second = await pay(roser, TODAY, key);
    expect(second.response.status).toBe(200);
    expect(second.data).toEqual(first.data);
    const after = (await readInvoice(roser.id)).data;
    expect(after?.version).toBe(2);
    expect(after?.collections.filter((entry) => entry.status === "SUCCEEDED")).toHaveLength(1);
  });

  it("T-12-14 [Marcar cobrat (selecció)] is all or none: one COLLECTING among them → 409 INVALID_STATE and nothing changes; the 4 pending → 200 {paid: 4}", async () => {
    const pending =
      (await list({ filter: [`period:eq:${SEPTEMBER}`, "status:eq:PENDING"] })).data?.items.map(
        (item) => item.id,
      ) ?? [];
    expect(pending).toHaveLength(4);
    const laura = await receipt("2026-0912");
    const bulk = (invoiceIds: string[]) =>
      client.POST("/invoices/payments", {
        body: { channel: "CASH", invoiceIds, paidAt: TODAY },
        params: { header: { "Idempotency-Key": newKey() } },
      });
    expect(await failure(bulk([...pending, laura.id]))).toEqual({
      code: "INVALID_STATE",
      details: { status: "COLLECTING" },
      status: 409,
    });
    expect(await total([`period:eq:${SEPTEMBER}`, "status:eq:PENDING"])).toBe(4);
    const { data, response } = await bulk(pending);
    expect(response.status).toBe(200);
    expectValid("BulkPaymentResult", data);
    expect(data?.paid).toBe(4);
    expect(data?.invoices.map((item) => item.status)).toEqual(["PAID", "PAID", "PAID", "PAID"]);
    expect((await month()).counts).toEqual({
      all: 168,
      failed: 2,
      paid: 4,
      pending: 0,
      remitted: 162,
    });
  });
});

describe("S12 R-12-17 · POST /invoices/{id}/failure «impagat (manual)» (T-12-14, T-12-30)", () => {
  it("a COLLECTING direct debit → 200 FAILED with a SEPA FAILED{BANK_RETURN} collection appended", async () => {
    const laura = await receipt("2026-0912");
    const { data, response } = await markFailed(laura);
    expect(response.status).toBe(200);
    expectValid("Invoice", data);
    expect(data).toMatchObject({
      failedAt: "2026-08-26T10:00:00Z",
      failureReason: "Compte tancat",
      status: "FAILED",
      version: laura.version + 1,
    });
    expect(data?.collections).toHaveLength(laura.collections.length + 1);
    expect(data?.collections.at(-1)).toMatchObject({
      failureCode: "BANK_RETURN",
      failureMessage: "Compte tancat",
      provider: "SEPA_XML",
      providerRef: laura.collections[0]?.providerRef,
      remittanceId: laura.remittanceId,
      status: "FAILED",
    });
    expect((await month()).counts).toMatchObject({ failed: 3, remitted: 161 });
  });

  it("a PAID direct debit (a later bank return, August's 2026-0744) → 200 FAILED, paidAt cleared", async () => {
    const august = await receipt("2026-0744");
    expect(august).toMatchObject({ paymentMethod: { type: "SEPA_DD" }, status: "PAID" });
    const { data } = await markFailed(august);
    expect(data).toMatchObject({ paidAt: null, status: "FAILED" });
    expect(data?.collections.at(-1)).toMatchObject({
      failureCode: "BANK_RETURN",
      status: "FAILED",
    });
  });

  it("a cash receipt → 409 INVALID_STATE {status}; at after today → 400 on at", async () => {
    expect(await failure(markFailed(await receipt("2026-0915")))).toEqual({
      code: "INVALID_STATE",
      details: { status: "PENDING" },
      status: 409,
    });
    expect(await failure(markFailed(await receipt("2026-0913"), "2026-08-27"))).toEqual({
      code: "VALIDATION_ERROR",
      details: { fieldErrors: [{ code: "INVALID", field: "at" }] },
      status: 400,
    });
  });
});

describe("S12 R-12-19 · POST /invoices/{id}/cancellation and the manual receipt POST /invoices (T-12-05, T-12-18)", () => {
  it("cancels a PENDING receipt with the admin's reason; COLLECTING → 409 INVALID_STATE; the reason ROLLBACK → 400", async () => {
    const joan = await receipt("2026-0915");
    const { data, response } = await cancel(joan);
    expect(response.status).toBe(200);
    expectValid("Invoice", data);
    expect(data).toMatchObject({ cancelReason: "Baixa del club", status: "CANCELLED", version: 2 });
    expect(data?.cancelledAt).not.toBeNull();
    expect(await failure(cancel(await receipt("2026-0912")))).toEqual({
      code: "INVALID_STATE",
      details: { status: "COLLECTING" },
      status: 409,
    });
    expect(await failure(cancel(await receipt("2026-0916"), "ROLLBACK"))).toEqual({
      code: "VALIDATION_ERROR",
      details: { fieldErrors: [{ code: "INVALID", field: "reason" }] },
      status: 400,
    });
  });

  it("T-12-18 an adjustment of −30 € for Laura (census member) is the next number 2026-1080, MANUAL, PENDING, its line ADJUSTMENT", async () => {
    const { data, response } = await adjustment("member-laura");
    expect(response.status).toBe(201);
    // Not validated as Invoice: the census world's member ids are slugs, not uuids (the next case
    // validates a manual receipt of a billing-world member).
    expect(data).toMatchObject({
      base: eur(-3000),
      displayNumber: "2026-1080",
      includeInNextRun: false,
      kind: "MANUAL",
      memberSnapshot: { fullName: "Laura Serra Vidal", number: 87 },
      note: null,
      number: 1080,
      paymentMethod: { type: "SEPA_DD" },
      period: "2026-08",
      runId: null,
      status: "PENDING",
      tax: eur(0),
      total: eur(-3000),
    });
    expect(data?.lines).toEqual([
      {
        base: eur(-3000),
        bookingId: null,
        description: "Ajust de la quota",
        lineNo: 1,
        origin: "ADJUSTMENT",
        priceId: null,
        tax: eur(0),
        taxPercent: 0,
        total: eur(-3000),
      },
    ]);
  });

  it("T-12-05 taxes round half-even per line (4959 × 21 % → 1041, 50 × 21 % → 10) and the receipt validates as Invoice", async () => {
    const marc = await receipt("2026-0913");
    const { data } = await createManual({
      includeInNextRun: true,
      lines: [
        { base: eur(4959), description: "Material", taxPercent: 21 },
        { base: eur(50), description: "Enviament", taxPercent: 21 },
      ],
      memberId: marc.memberId,
      note: "Comanda de setembre",
    });
    expectValid("Invoice", data);
    expect(data?.lines.map((line) => line.tax.amountMinor)).toEqual([1041, 10]);
    expect(data).toMatchObject({
      base: eur(5009),
      includeInNextRun: true,
      note: "Comanda de setembre",
      number: 1080,
      tax: eur(1051),
      total: eur(6060),
    });
  });

  it("T-12-05 a line in another currency → 422 CURRENCY_MISMATCH; an erased member → 409 MEMBER_ERASED; an unknown one → 404; includeInNextRun for a MANUAL member → 400", async () => {
    expect(await failure(adjustment("member-laura", -3000, "USD"))).toEqual({
      code: "CURRENCY_MISMATCH",
      details: {},
      status: 422,
    });
    expect(await failure(adjustment(ERASED_MEMBER_ID))).toEqual({
      code: "MEMBER_ERASED",
      details: {},
      status: 409,
    });
    expect(await failure(adjustment(UNKNOWN_ID))).toEqual({
      code: "NOT_FOUND",
      details: {},
      status: 404,
    });
    expect(
      await failure(
        createManual({
          includeInNextRun: true,
          lines: [{ base: eur(1500), description: "Material", taxPercent: 0 }],
          memberId: "member-anna",
          note: "",
        }),
      ),
    ).toEqual({
      code: "VALIDATION_ERROR",
      details: { fieldErrors: [{ code: "INVALID", field: "includeInNextRun" }] },
      status: 400,
    });
    // None of the refusals took a number.
    expect((await adjustment("member-laura")).data?.number).toBe(1080);
  });
});

describe("S12 R-12-13 / R-12-18 / R-12-20 · cards (billingStripe: T-12-15, T-12-17, T-12-30)", () => {
  it("T-12-15 [COBRA LES TARGETES] → 202 {submitted, skipped: Marc's withdrawn card}; the run reads CHARGING, then COMPLETED with STRIPE charged/failed", async () => {
    use("billingStripe");
    const before = await month();
    expect(before.remittance).toBeNull();
    expect(before.run).toMatchObject({
      byProvider: { STRIPE: { charged: 0, count: 164, failed: 0, total: eur(624000) } },
      rollbackable: true,
      status: "GENERATED",
    });
    const runId = before.run?.id ?? "";
    const marc = await receipt("2026-0913");
    expect(marc).toMatchObject({
      paymentMethod: { last4: "0002", type: "CARD" },
      status: "PENDING",
    });

    const { data, response } = await chargeCards(runId);
    expect(response.status).toBe(202);
    expectValid("CardChargesResult", data);
    expect(data).toEqual({
      skipped: [{ invoiceId: marc.id, reason: "NO_PAYMENT_METHOD" }],
      submitted: 163,
    });

    const charging = (await readRun(runId)).data;
    expectValid("BillingRun", charging);
    expect(charging).toMatchObject({
      rollbackBlockers: ["COLLECTION_SUBMITTED"],
      rollbackable: false,
      status: "CHARGING",
    });
    const completed = (await readRun(runId)).data;
    expectValid("BillingRun", completed);
    expect(completed?.status).toBe("COMPLETED");
    expect(completed?.finishedAt).not.toBeNull();
    expect(completed?.byProvider.STRIPE).toEqual({
      charged: 162,
      count: 164,
      failed: 2,
      total: eur(624000),
    });
    expect((await month()).counts).toEqual({
      all: 168,
      failed: 2,
      paid: 162,
      pending: 4,
      remitted: 0,
    });

    expect(await failure(chargeCards(runId))).toEqual({
      code: "INVALID_STATE",
      details: { status: "COMPLETED" },
      status: 409,
    });
  });

  it("T-12-30 retry: Laura's declined card → 202 COLLECTING with a new STRIPE attempt; Marc's withdrawn card → 422 NO_PAYMENT_METHOD", async () => {
    use("billingStripe");
    const runId = await liveRunId();
    await chargeCards(runId);
    await readRun(runId);
    await readRun(runId);

    const laura = await receipt("2026-0912");
    expect(laura).toMatchObject({ failureReason: "card_declined", status: "FAILED" });
    expect(laura.collections.at(-1)).toMatchObject({
      failureCode: "card_declined",
      provider: "STRIPE",
      status: "FAILED",
    });
    const { data, response } = await retry(laura);
    expect(response.status).toBe(202);
    expectValid("Invoice", data);
    expect(data).toMatchObject({ status: "COLLECTING", version: laura.version + 1 });
    expect(data?.collections.at(-1)).toMatchObject({ provider: "STRIPE", status: "SUBMITTED" });
    // T-12-15 / T-12-30: the run's charge was attempt 1, so the first retry is attempt 2 (§5: the
    // CREATED collection is the one the charge submits, not an attempt of its own).
    expect(data?.collections.map((entry) => [entry.provider, entry.attempt])).toEqual([
      ["STRIPE", 1],
      ["STRIPE", 2],
    ]);
    expect(await failure(retry({ id: laura.id, version: laura.version }))).toEqual({
      code: "INVALID_STATE",
      details: { status: "COLLECTING" },
      status: 409,
    });

    expect(await failure(retry(await receipt("2026-0913")))).toEqual({
      code: "NO_PAYMENT_METHOD",
      details: {},
      status: 422,
    });
  });

  it("T-12-17 refund of a PAID card receipt → 202 RefundAccepted and refundedTotal = total; partial refunds add up; more than paid → 422", async () => {
    use("billingStripe");
    const runId = await liveRunId();
    await chargeCards(runId);
    await readRun(runId);
    await readRun(runId);

    const eva = await receipt("2026-0914");
    expect(eva).toMatchObject({
      paymentMethod: { type: "CARD" },
      status: "PAID",
      total: eur(1000),
    });
    const { data, response } = await refund(eva.id);
    expect(response.status).toBe(202);
    expectValid("RefundAccepted", data);
    expect(data).toMatchObject({ amount: eur(1000), providerRef: null });
    const refunded = (await readInvoice(eva.id)).data;
    expect(refunded).toMatchObject({ refundedTotal: eur(1000), status: "PAID" });
    expect(refunded?.collections.find((entry) => entry.status === "SUCCEEDED")?.refunds).toEqual([
      expect.objectContaining({ amount: eur(1000), reason: "Cobrament duplicat" }),
    ]);
    expect(await failure(refund(eva.id))).toEqual({
      code: "REFUND_EXCEEDS_PAID",
      details: {},
      status: 422,
    });

    const silvia = await receipt("2026-0917");
    expect((await refund(silvia.id, eur(500))).data?.amount).toEqual(eur(500));
    expect((await readInvoice(silvia.id)).data?.refundedTotal).toEqual(eur(500));
  });

  it("T-12-17 without Stripe: refund of a SEPA PAID receipt → 422 PAYMENT_PROVIDER_NOT_ENABLED, of a COLLECTING one → 409; card charges → 422", async () => {
    expect(await failure(refund((await receipt("2026-0744")).id))).toEqual({
      code: "PAYMENT_PROVIDER_NOT_ENABLED",
      details: {},
      status: 422,
    });
    expect(await failure(refund((await receipt("2026-0912")).id))).toEqual({
      code: "INVALID_STATE",
      details: { status: "COLLECTING" },
      status: 409,
    });
    expect(await failure(chargeCards(await liveRunId()))).toEqual({
      code: "PAYMENT_PROVIDER_NOT_ENABLED",
      details: {},
      status: 422,
    });
  });
});

describe("S12 R-12-15 · the remittances page (GET /remittances, file, submission; T-12-30)", () => {
  it("lists the newest creationAt first (September GENERATED, August SUBMITTED, August's first try ROLLED_BACK) and filters by status", async () => {
    const { data } = await readRemittances();
    expectValid("RemittancePage", data);
    expect(data?.items.map((item) => [item.period, item.status, item.creationAt])).toEqual([
      [SEPTEMBER, "GENERATED", "2026-08-25T07:20:00Z"],
      ["2026-08", "SUBMITTED", "2026-07-27T07:05:00Z"],
      ["2026-08", "ROLLED_BACK", "2026-07-24T08:10:00Z"],
    ]);
    const submitted = (
      await client.GET("/remittances", { params: { query: { filter: ["status:eq:SUBMITTED"] } } })
    ).data;
    expect(submitted?.items.map((item) => item.period)).toEqual(["2026-08"]);
    expect(submitted?.appliedFilters).toEqual([{ field: "status", op: "eq", value: "SUBMITTED" }]);
  });

  it("has no free-text search: a q → 400 INVALID_FILTER", async () => {
    const response = await fetch(`${base}/remittances?q=agost`);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_FILTER" });
  });

  it("reads a remittance with its masked creditor and a signed link to its XML (also of a ROLLED_BACK one)", async () => {
    const items = (await readRemittances()).data?.items ?? [];
    const september = items[0]?.id ?? "";
    const { data } = await client.GET("/remittances/{id}", { params: { path: { id: september } } });
    expectValid("Remittance", data);
    expect(data).toMatchObject({
      count: 164,
      requestedCollectionDate: "2026-09-01",
      runId: await liveRunId(),
      status: "GENERATED",
      total: eur(624000),
    });
    expect(data?.creditor.maskedIban).toContain("****");
    for (const item of [items[0], items[2]]) {
      const file = await client.GET("/remittances/{id}/file", {
        params: { path: { id: item?.id ?? "" } },
      });
      expectValid("RemittanceFile", file.data);
      // The snapshot's attachment name (b67a07b): `remesa-{period}.xml`.
      expect(file.data?.fileName).toBe(`remesa-${item?.period ?? ""}.xml`);
      expect(file.data?.downloadUrl).toMatch(/\/remesa-2026-0[89]\.xml\?/u);
    }
    expect(
      await failure(client.GET("/remittances/{id}", { params: { path: { id: UNKNOWN_ID } } })),
    ).toEqual({ code: "NOT_FOUND", details: {}, status: 404 });
  });

  it("T-12-30 [Marca com a enviada al banc] → 200 SUBMITTED; again → 409 INVALID_STATE; the run is no longer rollbackable {REMITTANCE_SUBMITTED}", async () => {
    const remittanceId = (await month()).remittance?.id ?? "";
    // submittedAt is a club-local day from the remittance's day (25-08, created 09:20 local) to
    // today (26-08): after today or before that day → 400 VALIDATION_ERROR on the field (b67a07b).
    for (const outside of ["2026-08-27", "2026-08-24"]) {
      expect(await failure(submit(remittanceId, outside))).toEqual({
        code: "VALIDATION_ERROR",
        details: { fieldErrors: [{ code: "INVALID", field: "submittedAt" }] },
        status: 400,
      });
    }
    const { data, response } = await submit(remittanceId);
    expect(response.status).toBe(200);
    expectValid("Remittance", data);
    expect(data).toMatchObject({ status: "SUBMITTED", submittedAt: "2026-08-26T10:00:00Z" });
    expect(await failure(submit(remittanceId))).toEqual({
      code: "INVALID_STATE",
      details: { status: "SUBMITTED" },
      status: 409,
    });
    const after = await month();
    expect(after.remittance?.status).toBe("SUBMITTED");
    expect(after.run).toMatchObject({
      rollbackBlockers: ["REMITTANCE_SUBMITTED"],
      rollbackable: false,
    });
    expect(await failure(rollback(after.run?.id ?? ""))).toEqual({
      code: "RUN_NOT_ROLLBACKABLE",
      details: { reasons: ["REMITTANCE_SUBMITTED"] },
      status: 409,
    });
  });
});

describe("S12 the receipt PDF and the accounting export (T-12-19, T-12-20)", () => {
  it("T-12-20 GET /invoices/{id}/document → 200 application/pdf, attachment «2026-0912.pdf»", async () => {
    const laura = await receipt("2026-0912");
    const { data, response } = await client.GET("/invoices/{id}/document", {
      params: { path: { id: laura.id } },
      parseAs: "blob",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="2026-0912.pdf"',
    );
    expect((await data?.text())?.startsWith("%PDF-")).toBe(true);
    expect(
      await failure(
        client.GET("/invoices/{id}/document", {
          params: { path: { id: UNKNOWN_ID } },
          parseAs: "blob",
        }),
      ),
    ).toEqual({ code: "NOT_FOUND", details: {}, status: 404 });
  });

  it("T-12-19 «Exporta per a comptabilitat» → 200 text/csv with a BOM, «facturacio-2026-09.csv»", async () => {
    const { data, response } = await client.GET("/billing/exports", {
      params: { query: { format: "csv", period: SEPTEMBER } },
      parseAs: "arrayBuffer",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="facturacio-2026-09.csv"',
    );
    const bytes = new Uint8Array(data ?? new ArrayBuffer(0));
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toContain("número;data;mes;");
    expect(
      await failure(
        client.GET("/billing/exports", {
          params: { query: { period: "setembre" } },
          parseAs: "text",
        }),
      ),
    ).toEqual({
      code: "VALIDATION_ERROR",
      details: { fieldErrors: [{ code: "INVALID_FORMAT", field: "period" }] },
      status: 400,
    });
  });

  it("T-12-19 adminExportsQueued: the XLSX export is queued → 202 {jobId, statusUrl}; an INSTRUCTOR → 403", async () => {
    use("adminExportsQueued");
    const { data, response } = await client.GET("/billing/exports", {
      params: { query: { format: "xlsx", period: SEPTEMBER } },
    });
    expect(response.status).toBe(202);
    expect(data).toEqual({
      jobId: "00000000-0000-4000-8000-000000000e81",
      statusUrl: "/api/v1/exports/00000000-0000-4000-8000-000000000e81",
    });
    use("instructor");
    expect(
      await failure(
        client.GET("/billing/exports", {
          params: { query: { format: "csv", period: SEPTEMBER } },
          parseAs: "text",
        }),
      ),
    ).toEqual({ code: "FORBIDDEN", details: {}, status: 403 });
  });

  it("S14 R-14-12 the receipts' list export (GET /invoices/export) answers the XLSX file inline", async () => {
    const { response } = await client.GET("/invoices/export", {
      params: { query: { format: "xlsx" } },
      parseAs: "blob",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toContain("_invoices_");
  });
});
