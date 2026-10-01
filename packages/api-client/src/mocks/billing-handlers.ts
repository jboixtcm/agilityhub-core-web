import { http, HttpResponse } from "msw";

import type { components } from "../generated/schema";

import { refuse, selectItems, type ListSpec } from "./backoffice-handlers";
import {
  BILLING_ADMIN_ACCOUNT_ID,
  billingState,
  billingUuid,
  buildSimulation,
  displayNumber,
  eur,
  generateRun,
  isPeriod,
  listItem,
  memberMethod,
  periodCounts,
  periodRun,
  remittanceListItem,
  resetBillingState,
  rollBackRun,
  rollbackBlockers,
  runResource,
  shiftPeriod,
  type BillingVariant,
  type BillingWorld,
  type StoredInvoice,
  type StoredRun,
} from "./fixtures/billing";
import { censusMembers, ERASED_MEMBER_ID } from "./fixtures/census";
import { addDays, clubLocalDate } from "./fixtures/planning";
import { fieldsProjection } from "./list-fields";
import { apiError, validationError } from "./planning-handlers";
import {
  callerClubOwnsTheWorld,
  currentMockScenario,
  type MockScenarioDefinition,
} from "./scenarios";

type BillingPeriod = components["schemas"]["BillingPeriod"];
type BillingRunRequest = components["schemas"]["BillingRunRequest"];
type BulkPaymentRequest = components["schemas"]["BulkPaymentRequest"];
type Collection = components["schemas"]["Collection"];
type Filter = components["schemas"]["Filter"];
type Invoice = components["schemas"]["Invoice"];
type InvoiceCancellationRequest = components["schemas"]["InvoiceCancellationRequest"];
type InvoiceFailureRequest = components["schemas"]["InvoiceFailureRequest"];
type InvoicePaymentRequest = components["schemas"]["InvoicePaymentRequest"];
type InvoiceRetryRequest = components["schemas"]["InvoiceRetryRequest"];
type ManualInvoiceRequest = components["schemas"]["ManualInvoiceRequest"];
type RefundRequest = components["schemas"]["RefundRequest"];
type Remittance = components["schemas"]["Remittance"];
type RollbackRequest = components["schemas"]["RollbackRequest"];
type SimulationRequest = components["schemas"]["SimulationRequest"];
type SubmissionRequest = components["schemas"]["SubmissionRequest"];

/** `billing.stripeMaxAttempts` (S12 §13 proposal, 3). */
const STRIPE_MAX_ATTEMPTS = 3;
const MANUAL_CHANNELS = ["CASH", "TRANSFER", "BIZUM"] as const;

/** Resets the S12 world (tests call it between cases, like the other mock states). */
export function resetBillingMockState(variant: BillingVariant = "default"): void {
  resetBillingState(variant);
}

/** The world of the selected scenario (its `billing` variant), rebuilt when the scenario changed. */
function world(scenario: MockScenarioDefinition = currentMockScenario()): BillingWorld {
  const variant = scenario.billing ?? "default";
  if (billingState.world.variant !== variant) resetBillingState(variant);
  return billingState.world;
}

/** S12 §6: ADMIN (an impersonation token → 403), then `BILLING` on (404 MODULE_DISABLED). */
function refused() {
  const scenario = currentMockScenario();
  return (
    refuse(scenario, ["ADMIN"]) ??
    (scenario.branding.modules.includes("BILLING")
      ? undefined
      : apiError("MODULE_DISABLED", "Module disabled", 404))
  );
}

function notFound() {
  return apiError("NOT_FOUND", "Not found", 404);
}

function json(body: unknown, status = 200) {
  return HttpResponse.json(body as Record<string, unknown>, { status });
}

function now(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/u, "Z");
}

/** The club-local day (the api compares `paidAt`, `at` and dates with it). */
function today(): string {
  return clubLocalDate(new Date());
}

/** A club-local day as an instant the api stores (`paidAt`, `submittedAt`). */
function dayInstant(date: string): string {
  return `${date}T10:00:00Z`;
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value);
}

async function body<Body>(request: Request): Promise<Partial<Body> | null> {
  return (await request.json().catch(() => null)) as Partial<Body> | null;
}

/**
 * CONVENCIONS_API §7: the same key and payload replay the first answer; the same key with another
 * payload is `409 IDEMPOTENCY_KEY_REUSED {reason: DIFFERENT_REQUEST}`; no key is `400`.
 */
function keyed(
  request: Request,
  signature: string,
  answer: () => { body: unknown; status: number } | Response,
) {
  const key = request.headers.get("Idempotency-Key");
  if (key === null || key === "") return validationError("Idempotency-Key", "REQUIRED");
  const store = world().idempotency;
  const scoped = `${new URL(request.url).pathname} ${key}`;
  const replay = store.get(scoped);
  if (replay !== undefined) {
    return replay.signature === signature
      ? json(replay.body, replay.status)
      : apiError("IDEMPOTENCY_KEY_REUSED", "Idempotency key reused", 409, {
          reason: "DIFFERENT_REQUEST",
        });
  }
  const result = answer();
  if (result instanceof Response) return result;
  // Only a success is remembered: a refused request may be sent again with the same key.
  store.set(scoped, { ...result, signature });
  return json(result.body, result.status);
}

function findInvoice(id: string): StoredInvoice | undefined {
  if (!callerClubOwnsTheWorld()) return undefined;
  return world().invoices.find((item) => item.invoice.id === id);
}

function findRun(id: string): StoredRun | undefined {
  if (!callerClubOwnsTheWorld()) return undefined;
  return world().runs.find((stored) => stored.run.id === id);
}

function findRemittance(id: string): Remittance | undefined {
  if (!callerClubOwnsTheWorld()) return undefined;
  return world().remittances.find((remittance) => remittance.id === id);
}

function invalidState(status: string) {
  return apiError("INVALID_STATE", "Invalid state", 409, { status });
}

function staleVersion() {
  return apiError("STALE_VERSION", "Stale version", 409);
}

/** Two business days after `date` (R-12-12: RCUR/CORE, weekends only — no bank holidays). */
function businessDaysAfter(date: string, days: number): string {
  let current = date;
  let left = days;
  while (left > 0) {
    current = addDays(current, 1);
    const weekday = new Date(`${current}T12:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) left -= 1;
  }
  return current;
}

function appendCollection(
  item: StoredInvoice,
  fields: Partial<Collection> & Pick<Collection, "provider" | "status">,
): Collection {
  const target = world();
  target.sequence += 1;
  const created: Collection = {
    amount: item.invoice.total,
    attempt: 1,
    createdAt: now(),
    failureCode: null,
    failureMessage: null,
    id: billingUuid(3, target.sequence),
    invoiceId: item.invoice.id,
    providerRef: null,
    refunds: [],
    remittanceId: null,
    resolvedAt: null,
    ...fields,
  };
  item.invoice.collections = [...item.invoice.collections, created];
  return created;
}

/** R-12-16: a PENDING or FAILED receipt paid by hand (MANUAL or SEPA_DD). */
function payable(item: StoredInvoice): boolean {
  return (
    (item.invoice.status === "PENDING" || item.invoice.status === "FAILED") &&
    item.invoice.paymentMethod.type !== "CARD"
  );
}

function markPaid(
  item: StoredInvoice,
  paidAt: string,
  channel: (typeof MANUAL_CHANNELS)[number],
  reference?: string,
) {
  appendCollection(item, {
    provider: "MANUAL",
    providerRef: reference === undefined || reference === "" ? channel : `${channel} ${reference}`,
    resolvedAt: now(),
    status: "SUCCEEDED",
  });
  item.invoice.status = "PAID";
  item.invoice.paidAt = dayInstant(paidAt);
  item.invoice.version += 1;
}

/** `GET /invoices` (CONVENCIONS_API §4) as the api reads it. */
const INVOICE_FIELDS = [
  "id",
  "displayNumber",
  "number",
  "issueDate",
  "period",
  "member",
  "concept",
  "total",
  "paymentMethodType",
  "status",
  "kind",
  "runId",
  "remittanceId",
  "refundedTotal",
  "paidAt",
  "failedAt",
  "rolledBack",
] as const;

const INVOICE_SPEC: ListSpec<StoredInvoice> = {
  fields: INVOICE_FIELDS,
  filterable: [
    "period",
    "status",
    "memberId",
    "paymentMethodType",
    "runId",
    "remittanceId",
    "issueDate",
    "kind",
  ],
  search: (item) => `${item.invoice.displayNumber} ${item.invoice.memberSnapshot.fullName}`,
  sortable: ["number", "issueDate", "total", "memberLastName"],
  values: (item, field) => {
    const { invoice } = item;
    switch (field) {
      case "period":
        return [invoice.period];
      case "status":
        return [invoice.status];
      case "memberId":
        return [invoice.memberId];
      case "paymentMethodType":
        return [invoice.paymentMethod.type];
      case "runId":
        return invoice.runId === null || invoice.runId === undefined ? [] : [invoice.runId];
      case "remittanceId":
        return invoice.remittanceId === null || invoice.remittanceId === undefined
          ? []
          : [invoice.remittanceId];
      case "issueDate":
        return [invoice.issueDate];
      case "kind":
        return [invoice.kind];
      // Sort keys compare as strings: numbers are padded (amounts offset past the negative ones).
      case "number":
        return [String(invoice.number).padStart(10, "0")];
      case "total":
        return [String(invoice.total.amountMinor + 1_000_000_000).padStart(12, "0")];
      case "memberLastName":
        return [item.memberLastName];
      default:
        return [];
    }
  },
};

function numberMatches(value: number, op: string, target: string): boolean {
  const [low = Number.NaN, high = Number.NaN] = target.split(",").map(Number);
  switch (op) {
    case "eq":
      return value === low;
    case "ne":
      return value !== low;
    case "lt":
      return value < low;
    case "lte":
      return value <= low;
    case "gt":
      return value > low;
    case "gte":
      return value >= low;
    case "between":
      return value >= low && value <= high;
    default:
      return false;
  }
}

/**
 * The receipts list: newest number first by default, `total` compared on `amountMinor`, and a
 * receipt cancelled by a rollback listed only when the status filter selects CANCELLED (E87).
 */
function selectInvoices(
  url: URL,
): { error: Response } | { error?: undefined; items: StoredInvoice[] } {
  const filters = url.searchParams.getAll("filter");
  const totals: { op: string; value: string }[] = [];
  const others = new URL(url);
  others.searchParams.delete("filter");
  for (const serialized of filters) {
    if (serialized.startsWith("total:")) {
      const second = serialized.indexOf(":", "total:".length);
      const op = serialized.slice("total:".length, second);
      if (second < 0 || !["eq", "ne", "lt", "lte", "gt", "gte", "between"].includes(op)) {
        return { error: apiError("INVALID_FILTER", "Invalid filter", 400) };
      }
      totals.push({ op, value: serialized.slice(second + 1) });
    } else {
      others.searchParams.append("filter", serialized);
    }
  }
  const cancelledSelected = filters.some((serialized) => {
    if (!serialized.startsWith("status:")) return false;
    const [, op = "", value = ""] = serialized.split(":");
    return (op === "eq" || op === "in") && value.split(",").includes("CANCELLED");
  });
  const owned = callerClubOwnsTheWorld() ? world().invoices : [];
  const candidates = owned
    .filter((item) => cancelledSelected || !item.rolledBack)
    .filter((item) =>
      totals.every((filter) =>
        numberMatches(item.invoice.total.amountMinor, filter.op, filter.value),
      ),
    )
    .sort((left, right) => right.invoice.number - left.invoice.number);
  const selected = selectItems(others, candidates, INVOICE_SPEC);
  return selected.error === undefined ? { items: selected.items } : { error: selected.error };
}

function invoiceList(request: Request) {
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "0");
  const size = Number(url.searchParams.get("size") ?? "50");
  if (!Number.isInteger(page) || page < 0 || ![20, 50, 200, 1000].includes(size)) {
    return apiError("INVALID_FILTER", "Invalid page", 400);
  }
  const projection = fieldsProjection<ReturnType<typeof listItem>>(url, INVOICE_FIELDS, ["id"]);
  if (projection === undefined) return apiError("INVALID_FILTER", "Invalid fields", 400);
  const selected = selectInvoices(url);
  if (selected.error !== undefined) return selected.error;
  const echoed: Filter[] = url.searchParams.getAll("filter").map((serialized) => {
    const first = serialized.indexOf(":");
    const second = serialized.indexOf(":", first + 1);
    const op = serialized.slice(first + 1, second) as Filter["op"];
    const value = serialized.slice(second + 1);
    return {
      field: serialized.slice(0, first),
      op,
      value: ["between", "in", "nin"].includes(op) ? value.split(",") : value,
    };
  });
  const items = selected.items.map(listItem);
  return HttpResponse.json({
    appliedFilters: echoed,
    items: items.slice(page * size, (page + 1) * size).map(projection ?? ((item) => item)),
    page,
    size,
    totalItems: items.length,
    totalPages: Math.ceil(items.length / size),
  });
}

/** `GET /remittances`: newest `creationAt` first, filters period and status, no `q`. */
const REMITTANCE_SPEC: ListSpec<Remittance> = {
  fields: [
    "id",
    "period",
    "messageId",
    "creationAt",
    "requestedCollectionDate",
    "count",
    "total",
    "status",
    "fileAvailable",
    "submittedAt",
  ],
  filterable: ["period", "status"],
  sortable: ["period", "creationAt"],
  values: (remittance, field) =>
    field === "period"
      ? [remittance.period]
      : field === "status"
        ? [remittance.status]
        : field === "creationAt"
          ? [remittance.creationAt]
          : [],
};

function remittanceList(request: Request) {
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "0");
  const size = Number(url.searchParams.get("size") ?? "50");
  if (!Number.isInteger(page) || page < 0 || ![20, 50, 200, 1000].includes(size)) {
    return apiError("INVALID_FILTER", "Invalid page", 400);
  }
  const projection = fieldsProjection<ReturnType<typeof remittanceListItem>>(
    url,
    REMITTANCE_SPEC.fields,
    ["id"],
  );
  if (projection === undefined) return apiError("INVALID_FILTER", "Invalid fields", 400);
  const owned = callerClubOwnsTheWorld() ? world().remittances : [];
  const candidates = [...owned].sort((left, right) =>
    right.creationAt.localeCompare(left.creationAt),
  );
  const selected = selectItems(url, candidates, REMITTANCE_SPEC);
  if (selected.error !== undefined) return selected.error;
  const items = selected.items.map(remittanceListItem);
  return HttpResponse.json({
    appliedFilters: selected.filters.map((filter) => ({
      field: filter.field,
      op: filter.op as Filter["op"],
      value: ["between", "in", "nin"].includes(filter.op) ? filter.value.split(",") : filter.value,
    })),
    items: items.slice(page * size, (page + 1) * size).map(projection ?? ((item) => item)),
    page,
    size,
    totalItems: items.length,
    totalPages: Math.ceil(items.length / size),
  });
}

/** D6's month (`GET /billing/periods/{period}`): an empty month for any other club or month. */
function billingPeriod(period: string): BillingPeriod {
  const target = world();
  const owned = callerClubOwnsTheWorld();
  const simulation = owned ? target.simulations.get(period)?.simulation : undefined;
  const stored = owned ? periodRun(target, period) : undefined;
  const remittance =
    stored === undefined
      ? undefined
      : target.remittances.find((entry) => entry.runId === stored.run.id);
  const run = stored === undefined ? undefined : runResource(target, stored);
  return {
    counts: owned
      ? periodCounts(target, period)
      : { all: 0, failed: 0, paid: 0, pending: 0, remitted: 0 },
    period,
    remittance:
      remittance === undefined
        ? null
        : { fileAvailable: remittance.fileAvailable, id: remittance.id, status: remittance.status },
    run:
      run === undefined
        ? null
        : {
            byProvider: run.byProvider,
            id: run.id,
            rollbackBlockers: run.rollbackBlockers,
            rollbackable: run.rollbackable,
            status: run.status,
          },
    simulation:
      simulation === undefined
        ? null
        : {
            at: simulation.at,
            cashMembers: simulation.cashMembers,
            id: simulation.id,
            incidents: simulation.incidents,
            kpis: simulation.kpis,
          },
  };
}

/**
 * R-12-13 and R-12-21: the cards of a CHARGING run settle by webhook. The mock settles them on the
 * second read after the charges (the first still reads CHARGING): every card paid, except the one
 * the provider declines.
 */
function settleCharges(target: BillingWorld, stored: StoredRun) {
  stored.polls += 1;
  if (stored.run.status !== "CHARGING" || stored.polls < 2) return;
  const ids = new Set(stored.run.invoiceIds);
  let charged = 0;
  let failed = 0;
  for (const item of target.invoices.filter((entry) => ids.has(entry.invoice.id))) {
    const { invoice } = item;
    const last = invoice.collections.at(-1);
    if (last?.provider !== "STRIPE") continue;
    if (last.status === "FAILED") {
      failed += 1;
      continue;
    }
    if (invoice.status !== "COLLECTING" || last.status !== "SUBMITTED") continue;
    const declined = target.members.find((member) => member.id === invoice.memberId)?.cardDeclined;
    last.status = declined === true ? "FAILED" : "SUCCEEDED";
    last.resolvedAt = now();
    if (declined === true) {
      last.failureCode = "card_declined";
      last.failureMessage = "Your card was declined.";
      invoice.status = "FAILED";
      invoice.failedAt = now();
      invoice.failureReason = "card_declined";
      failed += 1;
    } else {
      invoice.status = "PAID";
      invoice.paidAt = now();
      charged += 1;
    }
    invoice.version += 1;
  }
  const stripe = stored.run.byProvider.STRIPE;
  if (stripe !== undefined) {
    stored.run.byProvider = { ...stored.run.byProvider, STRIPE: { ...stripe, charged, failed } };
  }
  stored.run.status = "COMPLETED";
  stored.run.finishedAt = now();
}

function invoiceAnswer(item: StoredInvoice): Invoice {
  return structuredClone(item.invoice);
}

/** The receipt's PDF bytes (`GET /invoices/{id}/document`): a placeholder, never parsed. */
const MOCK_PDF = new TextEncoder().encode("%PDF-1.4\n% AgilityHub mock receipt\n%%EOF\n");

/**
 * S12 (E8-W01): D6, the receipt drawer and the remittances page on the published contract (api
 * E8-T01). Stateful: a write shows on the next read of the month, the list and the drawer.
 */
export const billingHandlers = [
  http.get("*/api/v1/billing/periods/:period", ({ params }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const period = String(params.period);
    if (!isPeriod(period)) return validationError("period", "INVALID_FORMAT");
    return json(billingPeriod(period));
  }),
  http.post("*/api/v1/billing/simulations", async ({ request }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const payload = await body<SimulationRequest>(request);
    const period = payload?.period;
    if (typeof period !== "string" || !isPeriod(period)) {
      return validationError("period", "INVALID_FORMAT");
    }
    // S12 §13: more than three months ahead of the club's current month.
    if (period > shiftPeriod(today().slice(0, 7), 3)) {
      return validationError("period", "OUT_OF_RANGE");
    }
    const target = world();
    const simulation = buildSimulation(target, period, now());
    target.simulations.set(period, { simulation, stale: false });
    return json(simulation, 201);
  }),
  http.post("*/api/v1/billing/runs", async ({ request }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const payload = await body<BillingRunRequest>(request);
    return keyed(request, JSON.stringify(payload), () => {
      const period = payload?.period;
      const simulationId = payload?.simulationId;
      if (typeof period !== "string" || !isPeriod(period)) {
        return validationError("period", "REQUIRED");
      }
      if (typeof simulationId !== "string" || simulationId === "") {
        return validationError("simulationId", "REQUIRED");
      }
      const target = world();
      const kept = callerClubOwnsTheWorld() ? target.simulations.get(period) : undefined;
      if (kept?.simulation.id !== simulationId) return notFound();
      const live = periodRun(target, period);
      if (live !== undefined && live.run.status !== "ROLLED_BACK") {
        return apiError("RUN_EXISTS", "A live run exists for this month", 409);
      }
      if (kept.stale) return apiError("SIMULATION_STALE", "Simulation is stale", 409);
      const sepa = target.providers.includes("SEPA_XML");
      const requested = payload?.collectionDate ?? `${period}-01`;
      const earliest = businessDaysAfter(today(), 2);
      if (sepa && requested < earliest) {
        return apiError("COLLECTION_DATE_TOO_SOON", "Collection date too soon", 422, {
          earliest,
          requested,
        });
      }
      if (kept.simulation.kpis.count === 0) {
        return apiError("NO_INVOICES", "Nothing to bill", 422);
      }
      const { remittance, stored } = generateRun(target, {
        at: now(),
        collectionDate: sepa ? requested : null,
        period,
        simulationId,
      });
      return {
        body: {
          remittance: remittance === null ? null : structuredClone(remittance),
          run: runResource(target, stored),
          skipped: stored.run.skipped,
        },
        status: 201,
      };
    });
  }),
  http.get("*/api/v1/billing/runs/:id", ({ params }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const stored = findRun(String(params.id));
    if (stored === undefined) return notFound();
    const target = world();
    if (stored.run.status === "CHARGING") settleCharges(target, stored);
    return json(runResource(target, stored));
  }),
  http.post("*/api/v1/billing/runs/:id/card-charges", ({ params, request }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const stored = findRun(String(params.id));
    if (stored === undefined) return notFound();
    return keyed(request, String(params.id), () => {
      const target = world();
      if (!target.providers.includes("STRIPE")) {
        return apiError("PAYMENT_PROVIDER_NOT_ENABLED", "Stripe is not enabled", 422);
      }
      if (stored.run.status !== "GENERATED") return invalidState(stored.run.status);
      const ids = new Set(stored.run.invoiceIds);
      const skipped: { invoiceId: string; reason: string }[] = [];
      let submitted = 0;
      for (const item of target.invoices.filter((entry) => ids.has(entry.invoice.id))) {
        if (item.invoice.paymentMethod.type !== "CARD" || item.invoice.status !== "PENDING") {
          continue;
        }
        const member = target.members.find((entry) => entry.id === item.invoice.memberId);
        // §5: the run's CREATED Stripe collection is this charge's attempt 1 (CREATED → SUBMITTED,
        // or FAILED without a valid card), not a new attempt.
        const created = item.invoice.collections.find(
          (entry) => entry.provider === "STRIPE" && entry.status === "CREATED",
        );
        const attempt =
          created ?? appendCollection(item, { provider: "STRIPE", status: "CREATED" });
        if (member?.cardInvalid === true) {
          Object.assign(attempt, {
            failureCode: "NO_PAYMENT_METHOD",
            resolvedAt: now(),
            status: "FAILED",
          });
          item.invoice.status = "FAILED";
          item.invoice.failedAt = now();
          item.invoice.failureReason = "NO_PAYMENT_METHOD";
          item.invoice.version += 1;
          skipped.push({ invoiceId: item.invoice.id, reason: "NO_PAYMENT_METHOD" });
          continue;
        }
        Object.assign(attempt, {
          providerRef: `pi_mock_${String(item.invoice.number)}`,
          status: "SUBMITTED",
        });
        item.invoice.status = "COLLECTING";
        item.invoice.version += 1;
        submitted += 1;
      }
      stored.run.status = "CHARGING";
      stored.polls = 0;
      return { body: { skipped, submitted }, status: 202 };
    });
  }),
  http.post("*/api/v1/billing/runs/:id/rollback", async ({ params, request }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const stored = findRun(String(params.id));
    if (stored === undefined) return notFound();
    const payload = await body<RollbackRequest>(request);
    return keyed(request, JSON.stringify({ id: params.id, payload }), () => {
      if (payload?.confirmation !== "RETROCEDIR") return validationError("confirmation");
      if (typeof payload.reason !== "string" || payload.reason.length > 500) {
        return validationError("reason");
      }
      const target = world();
      const remittance = target.remittances.find((entry) => entry.runId === stored.run.id);
      // `rollbackBlocked`: another admin marked the remittance as sent just before this request.
      if (target.rollbackRace && remittance?.status === "GENERATED") {
        remittance.status = "SUBMITTED";
        remittance.submittedAt = now();
        remittance.submittedByAccountId = BILLING_ADMIN_ACCOUNT_ID;
      }
      const reasons = rollbackBlockers(target, stored);
      if (
        reasons.length > 0 ||
        (stored.run.status !== "GENERATED" && stored.run.status !== "CHARGING")
      ) {
        return apiError("RUN_NOT_ROLLBACKABLE", "Run not rollbackable", 409, { reasons });
      }
      return { body: rollBackRun(target, stored, now(), payload.reason), status: 200 };
    });
  }),
  http.get("*/api/v1/remittances", ({ request }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    return remittanceList(request);
  }),
  http.get("*/api/v1/remittances/:id", ({ params }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const remittance = findRemittance(String(params.id));
    return remittance === undefined ? notFound() : json(structuredClone(remittance));
  }),
  http.get("*/api/v1/remittances/:id/file", ({ params }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const remittance = findRemittance(String(params.id));
    if (remittance?.fileAvailable !== true) return notFound();
    const fileName = `${remittance.messageId}.xml`;
    return json({
      downloadUrl: `https://files.example.test/remittances/${remittance.id}/${fileName}?X-Amz-Expires=300&X-Amz-Signature=mock`,
      expiresAt: new Date(Date.now() + 300_000).toISOString().replace(/\.\d{3}Z$/u, "Z"),
      fileName,
    });
  }),
  http.post("*/api/v1/remittances/:id/submission", async ({ params, request }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const remittance = findRemittance(String(params.id));
    if (remittance === undefined) return notFound();
    const payload = await body<SubmissionRequest>(request);
    return keyed(request, JSON.stringify({ id: params.id, payload }), () => {
      if (!isDate(payload?.submittedAt) || payload.submittedAt > today()) {
        return validationError("submittedAt");
      }
      if (remittance.status !== "GENERATED") return invalidState(remittance.status);
      remittance.status = "SUBMITTED";
      remittance.submittedAt = dayInstant(payload.submittedAt);
      remittance.submittedByAccountId = BILLING_ADMIN_ACCOUNT_ID;
      return { body: structuredClone(remittance), status: 200 };
    });
  }),
  http.get("*/api/v1/invoices", ({ request }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    return invoiceList(request);
  }),
  http.post("*/api/v1/invoices", async ({ request }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const payload = await body<ManualInvoiceRequest>(request);
    return keyed(request, JSON.stringify(payload), () => {
      const memberId = payload?.memberId;
      const lines = payload?.lines;
      if (typeof memberId !== "string" || memberId === "") {
        return validationError("memberId", "REQUIRED");
      }
      if (!Array.isArray(lines) || lines.length === 0) return validationError("lines", "REQUIRED");
      if (typeof payload?.note !== "string" || payload.note.length > 500) {
        return validationError("note");
      }
      const invalidLine = lines.findIndex(
        (line) =>
          typeof line.description !== "string" ||
          line.description.trim() === "" ||
          line.description.length > 140 ||
          typeof line.taxPercent !== "number" ||
          line.taxPercent < 0 ||
          line.taxPercent > 100 ||
          !Number.isInteger(line.base.amountMinor),
      );
      if (invalidLine >= 0) return validationError(`lines[${String(invalidLine)}]`);
      if (!callerClubOwnsTheWorld()) return notFound();
      if (memberId === ERASED_MEMBER_ID) return apiError("MEMBER_ERASED", "Member erased", 409);
      const target = world();
      const census = censusMembers.find((member) => member.id === memberId);
      const billed = target.members.find((member) => member.id === memberId);
      if (census === undefined && billed === undefined) return notFound();
      if (lines.some((line) => line.base.currency !== "EUR")) {
        return apiError("CURRENCY_MISMATCH", "Currency mismatch", 422);
      }
      const fullName = census?.fullName ?? billed?.fullName ?? "";
      const method =
        census?.paymentMethod?.type ??
        (billed === undefined ? "MANUAL" : memberMethod(target, billed));
      if (payload.includeInNextRun === true && method !== "SEPA_DD") {
        return validationError("includeInNextRun");
      }
      const builtLines = lines.map((line, index) => {
        // R-12-09: tax = round_half_even(base × taxPercent / 100), total = base + tax.
        const exact = (line.base.amountMinor * line.taxPercent) / 100;
        const floor = Math.floor(exact);
        const tax =
          exact - floor === 0.5 ? (floor % 2 === 0 ? floor : floor + 1) : Math.round(exact);
        return {
          base: eur(line.base.amountMinor),
          bookingId: null,
          description: line.description,
          lineNo: index + 1,
          origin: "ADJUSTMENT" as const,
          priceId: null,
          tax: eur(tax),
          taxPercent: line.taxPercent,
          total: eur(line.base.amountMinor + tax),
        };
      });
      const sum = (key: "base" | "tax" | "total") =>
        eur(builtLines.reduce((total, line) => total + line[key].amountMinor, 0));
      // R-12-19 (E89): a zero or negative receipt is never collected by direct debit.
      if (payload.includeInNextRun === true && sum("total").amountMinor <= 0) {
        return validationError("includeInNextRun");
      }
      const number = target.nextNumber;
      target.nextNumber += 1;
      target.sequence += 1;
      const issueDate = today();
      const invoice: Invoice = {
        base: sum("base"),
        cancelReason: null,
        cancelledAt: null,
        collections: [],
        createdAt: now(),
        createdByAccountId: BILLING_ADMIN_ACCOUNT_ID,
        displayNumber: displayNumber(number),
        failedAt: null,
        failureReason: null,
        id: billingUuid(2, 50_000 + target.sequence),
        includeInNextRun: payload.includeInNextRun === true,
        issueDate,
        kind: "MANUAL",
        lines: builtLines,
        memberId,
        memberSnapshot: {
          fullName,
          number: census?.memberNumber ?? billed?.memberNumber ?? null,
          taxId: null,
        },
        note: payload.note === "" ? null : payload.note,
        number,
        paidAt: null,
        paymentMethod:
          method === "SEPA_DD"
            ? {
                channel: null,
                holderName: fullName,
                last4: null,
                mandateRef: null,
                maskedAccount: census?.paymentMethod?.maskedAccount ?? null,
                type: "SEPA_DD",
              }
            : method === "CARD"
              ? {
                  channel: null,
                  holderName: fullName,
                  last4: "4242",
                  mandateRef: null,
                  maskedAccount: null,
                  type: "CARD",
                }
              : {
                  channel: "CASH",
                  holderName: null,
                  last4: null,
                  mandateRef: null,
                  maskedAccount: null,
                  type: "MANUAL",
                },
        period: issueDate.slice(0, 7),
        refundedTotal: eur(0),
        remittanceId: null,
        runId: null,
        series: displayNumber(number).slice(0, 4),
        status: "PENDING",
        tax: sum("tax"),
        total: sum("total"),
        version: 1,
      };
      const stored: StoredInvoice = {
        invoice,
        memberLastName: fullName.split(" ").slice(1).join(" "),
        memberNumber: invoice.memberSnapshot.number ?? null,
        rolledBack: false,
      };
      target.invoices.push(stored);
      appendCollection(stored, {
        provider: method === "CARD" ? "STRIPE" : method === "SEPA_DD" ? "SEPA_XML" : "MANUAL",
        status: "CREATED",
      });
      return { body: invoiceAnswer(stored), status: 201 };
    });
  }),
  http.post("*/api/v1/invoices/payments", async ({ request }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const payload = await body<BulkPaymentRequest>(request);
    return keyed(request, JSON.stringify(payload), () => {
      const ids = payload?.invoiceIds;
      if (!Array.isArray(ids) || ids.length === 0) {
        return validationError("invoiceIds", "REQUIRED");
      }
      if (!isDate(payload?.paidAt) || payload.paidAt > today()) return validationError("paidAt");
      const channel = payload.channel;
      if (channel === undefined || !MANUAL_CHANNELS.includes(channel)) {
        return validationError("channel");
      }
      const items = ids.map((id) => findInvoice(id));
      if (items.some((item) => item === undefined)) return notFound();
      const found = items as StoredInvoice[];
      // All or none (R-12-16): one receipt in another state or method refuses the whole batch.
      const blocked = found.find((item) => !payable(item));
      if (blocked !== undefined) return invalidState(blocked.invoice.status);
      for (const item of found) markPaid(item, payload.paidAt, channel);
      return {
        body: { invoices: found.map(invoiceAnswer), paid: found.length },
        status: 200,
      };
    });
  }),
  http.get("*/api/v1/invoices/:id", ({ params }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const item = findInvoice(String(params.id));
    return item === undefined ? notFound() : json(invoiceAnswer(item));
  }),
  http.get("*/api/v1/invoices/:id/document", ({ params }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const item = findInvoice(String(params.id));
    if (item === undefined) return notFound();
    return new HttpResponse(MOCK_PDF, {
      headers: {
        "Content-Disposition": `attachment; filename="${item.invoice.displayNumber}.pdf"`,
        "Content-Type": "application/pdf",
      },
    });
  }),
  http.post("*/api/v1/invoices/:id/payment", async ({ params, request }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const item = findInvoice(String(params.id));
    if (item === undefined) return notFound();
    const payload = await body<InvoicePaymentRequest>(request);
    return keyed(request, JSON.stringify({ id: params.id, payload }), () => {
      if (!isDate(payload?.paidAt) || payload.paidAt > today()) return validationError("paidAt");
      const channel = payload.channel;
      if (channel === undefined || !MANUAL_CHANNELS.includes(channel)) {
        return validationError("channel");
      }
      if (typeof payload.reference === "string" && payload.reference.length > 140) {
        return validationError("reference");
      }
      if (!payable(item)) return invalidState(item.invoice.status);
      if (payload.version !== item.invoice.version) return staleVersion();
      markPaid(item, payload.paidAt, channel, payload.reference);
      return { body: invoiceAnswer(item), status: 200 };
    });
  }),
  http.post("*/api/v1/invoices/:id/failure", async ({ params, request }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const item = findInvoice(String(params.id));
    if (item === undefined) return notFound();
    const payload = await body<InvoiceFailureRequest>(request);
    return keyed(request, JSON.stringify({ id: params.id, payload }), () => {
      if (!isDate(payload?.at) || payload.at > today()) return validationError("at");
      if (typeof payload.reason !== "string" || payload.reason.length > 500) {
        return validationError("reason");
      }
      const { invoice } = item;
      const sepa = invoice.collections.some((entry) => entry.provider === "SEPA_XML");
      const returnable =
        sepa &&
        (invoice.status === "COLLECTING" ||
          (invoice.status === "PAID" &&
            invoice.collections.some(
              (entry) => entry.provider === "SEPA_XML" && entry.status === "SUCCEEDED",
            )));
      if (!returnable) return invalidState(invoice.status);
      if (payload.version !== invoice.version) return staleVersion();
      const remitted = invoice.collections.find((entry) => entry.provider === "SEPA_XML");
      appendCollection(item, {
        failureCode: "BANK_RETURN",
        failureMessage: payload.reason,
        provider: "SEPA_XML",
        providerRef: remitted?.providerRef ?? null,
        remittanceId: remitted?.remittanceId ?? null,
        resolvedAt: now(),
        status: "FAILED",
      });
      invoice.status = "FAILED";
      invoice.failedAt = dayInstant(payload.at);
      invoice.failureReason = payload.reason;
      invoice.paidAt = null;
      invoice.version += 1;
      return { body: invoiceAnswer(item), status: 200 };
    });
  }),
  http.post("*/api/v1/invoices/:id/retry", async ({ params, request }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const item = findInvoice(String(params.id));
    if (item === undefined) return notFound();
    const payload = await body<InvoiceRetryRequest>(request);
    return keyed(request, JSON.stringify({ id: params.id, payload }), () => {
      const { invoice } = item;
      if (invoice.status !== "FAILED") return invalidState(invoice.status);
      if (payload?.version !== invoice.version) return staleVersion();
      const target = world();
      const member = target.members.find((entry) => entry.id === invoice.memberId);
      if (invoice.paymentMethod.type !== "CARD" || member?.cardInvalid === true) {
        return apiError("NO_PAYMENT_METHOD", "No valid card", 422);
      }
      const attempts = invoice.collections.filter((entry) => entry.provider === "STRIPE").length;
      if (attempts >= STRIPE_MAX_ATTEMPTS) {
        return apiError("MAX_ATTEMPTS", "Maximum attempts reached", 409, {
          attempts,
          max: STRIPE_MAX_ATTEMPTS,
        });
      }
      appendCollection(item, {
        attempt: attempts + 1,
        provider: "STRIPE",
        providerRef: `pi_mock_${String(invoice.number)}_${String(attempts + 1)}`,
        status: "SUBMITTED",
      });
      invoice.status = "COLLECTING";
      invoice.version += 1;
      return { body: invoiceAnswer(item), status: 202 };
    });
  }),
  http.post("*/api/v1/invoices/:id/refund", async ({ params, request }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const item = findInvoice(String(params.id));
    if (item === undefined) return notFound();
    const payload = await body<RefundRequest>(request);
    return keyed(request, JSON.stringify({ id: params.id, payload }), () => {
      if (typeof payload?.reason !== "string" || payload.reason.length > 500) {
        return validationError("reason");
      }
      const { invoice } = item;
      const charge = invoice.collections.find(
        (entry) => entry.provider === "STRIPE" && entry.status === "SUCCEEDED",
      );
      if (charge === undefined) {
        return invoice.status === "PAID"
          ? apiError("PAYMENT_PROVIDER_NOT_ENABLED", "No card payment to refund", 422)
          : invalidState(invoice.status);
      }
      if (invoice.status !== "PAID") return invalidState(invoice.status);
      const left = invoice.total.amountMinor - invoice.refundedTotal.amountMinor;
      const amount = payload.amount?.amountMinor ?? left;
      if (amount <= 0 || amount > left) {
        return apiError("REFUND_EXCEEDS_PAID", "Refund exceeds paid", 422);
      }
      const target = world();
      target.sequence += 1;
      // `charge.refunded` arrives at once in the mock: the refund is on the collection already.
      charge.refunds = [
        ...charge.refunds,
        {
          amount: eur(amount),
          at: now(),
          byAccountId: BILLING_ADMIN_ACCOUNT_ID,
          providerRef: `re_mock_${String(target.sequence)}`,
          reason: payload.reason,
        },
      ];
      invoice.refundedTotal = eur(invoice.refundedTotal.amountMinor + amount);
      return {
        body: { amount: eur(amount), id: billingUuid(7, target.sequence), providerRef: null },
        status: 202,
      };
    });
  }),
  http.post("*/api/v1/invoices/:id/cancellation", async ({ params, request }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const item = findInvoice(String(params.id));
    if (item === undefined) return notFound();
    const payload = await body<InvoiceCancellationRequest>(request);
    return keyed(request, JSON.stringify({ id: params.id, payload }), () => {
      if (
        typeof payload?.reason !== "string" ||
        payload.reason.length > 500 ||
        payload.reason === "ROLLBACK"
      ) {
        return validationError("reason");
      }
      const { invoice } = item;
      if (invoice.status !== "PENDING" && invoice.status !== "FAILED") {
        return invalidState(invoice.status);
      }
      if (payload.version !== invoice.version) return staleVersion();
      invoice.status = "CANCELLED";
      invoice.cancelReason = payload.reason === "" ? "ADMIN" : payload.reason;
      invoice.cancelledAt = now();
      invoice.version += 1;
      return { body: invoiceAnswer(item), status: 200 };
    });
  }),
];

/** Rows of the accounting export of a month (one per receipt line, R-12-26). */
export function accountingRows(period: string): number {
  if (!callerClubOwnsTheWorld()) return 0;
  return world()
    .invoices.filter((item) => item.invoice.period === period && !item.rolledBack)
    .reduce((rows, item) => rows + item.invoice.lines.length, 0);
}

/** The guards of `GET /billing/exports` and `GET /invoices/export` (`handlers.ts` answers them). */
export function billingExportRefusal() {
  return refused();
}

/**
 * The rows `GET /invoices/export` reads: the list's own `q`, `filter` and `sort` (its description:
 * «Same q/filter/sort and selected columns as the list»), so an undeclared one is `400` here too.
 */
export function invoiceExportRows(request: Request): Response | number {
  const selected = selectInvoices(new URL(request.url));
  return selected.error ?? selected.items.length;
}
