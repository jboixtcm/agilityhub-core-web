import { http, HttpResponse } from "msw";

import type { components } from "../generated/schema";

import { censusRecordState, ERASED_MEMBER_ID, erasedMemberOverview } from "./fixtures/census";
import {
  adminInactivityPeriods,
  adminLeaveRequests,
  inactivityContextFixture,
  inactivityPreviewFixture,
  leaveContextFixture,
} from "./fixtures/inactivity";
import { meInvoiceFixtures, packBalanceFixtures } from "./fixtures/member-self-service";
import { currentMockScenario } from "./scenarios";

type ApiError = components["schemas"]["ApiError"];
type InactivityPatch = components["schemas"]["InactivityPatchRequest"];
type InactivityRequest = components["schemas"]["InactivityRequest"];
type LeaveRequest = components["schemas"]["LeaveCreateRequest"];
type PackAdjustment = components["schemas"]["PackAdjustmentRequest"];
type UpfrontRequest = components["schemas"]["UpfrontPaymentRequest"];
type AdminInactivityRequest = components["schemas"]["AdminInactivityRequest"];
type AdminInactivityPatch = components["schemas"]["AdminInactivityPatchRequest"];
type DecisionRequest = components["schemas"]["DecisionRequest"];
type LeaveDecisionRequest = components["schemas"]["LeaveDecisionRequest"];
type DirectLeaveRequest = components["schemas"]["DirectLeaveRequest"];
type ReactivationRequest = components["schemas"]["ReactivationRequest"];

function normalizeOverviewInvoiceStatus(
  status: string,
): components["schemas"]["InvoiceStatus"] {
  switch (status) {
    case "FAILED":
    case "PAID":
      return status;
    case "REMITTED":
      return "COLLECTING";
    default:
      throw new TypeError(`Unexpected overview invoice status: ${status}`);
  }
}

function error(code: string, status: number, details: Record<string, unknown> = {}) {
  return HttpResponse.json<ApiError>(
    { code, details, message: code, traceId: "mock-e8-w02" },
    { status },
  );
}

function moduleOff(module: string) {
  return currentMockScenario().branding.modules.includes(module)
    ? undefined
    : error("MODULE_DISABLED", 404, { module });
}

let inactivity = structuredClone(inactivityContextFixture);
let leave = structuredClone(leaveContextFixture);
let packs = structuredClone(packBalanceFixtures);
let adminPeriods = structuredClone(adminInactivityPeriods);
let adminLeaves = structuredClone(adminLeaveRequests);
const initialUpfront: components["schemas"]["UpfrontPayment"][] = [
  {
    amountDue: { amountMinor: 3000, currency: "EUR" },
    amountPaid: { amountMinor: 3000, currency: "EUR" },
    concept: "ENTRY_FEE",
    createdAt: "2026-08-11T09:00:00Z",
    dogId: null,
    id: "54000000-0000-4000-8000-000000000001",
    memberId: "member-laura",
    note: null,
    paidAt: "2026-08-11T09:00:00Z",
    provider: { channel: "CASH", paidAt: "2026-08-11T09:00:00Z", reference: null, type: "MANUAL" },
    refunds: [],
    status: "PAID",
  },
];
let upfront = structuredClone(initialUpfront);
const checkoutReads = new Map<string, number>();

export function resetMemberBillingState(): void {
  inactivity = structuredClone(inactivityContextFixture);
  leave = structuredClone(leaveContextFixture);
  packs = structuredClone(packBalanceFixtures);
  adminPeriods = structuredClone(adminInactivityPeriods);
  adminLeaves = structuredClone(adminLeaveRequests);
  upfront = structuredClone(initialUpfront);
  checkoutReads.clear();
}

function invoices() {
  const rows = structuredClone(meInvoiceFixtures);
  if (currentMockScenario().memberBilling === "cardInvalid" && rows[0] !== undefined) {
    rows[0].paymentMethod = {
      channel: null,
      holderName: "Laura Serra Vidal",
      last4: "4242",
      mandateRef: null,
      maskedAccount: "•••• 4242",
      type: "CARD",
    };
  }
  return rows;
}

function localizedLeave(request: Request) {
  const language = (request.headers.get("Accept-Language") ?? "ca").slice(0, 2);
  const labels = {
    ca: leaveContextFixture.reasons.map((item) => item.label),
    es: [
      "Ya he aprendido todo lo que quería",
      "No encuentro tiempo para ir",
      "No es lo que esperaba",
      "Condicionantes personales ajenos al club",
      "Otros",
    ],
    en: [
      "I have learnt everything I wanted",
      "I cannot find time to attend",
      "It is not what I expected",
      "Personal circumstances unrelated to the club",
      "Other",
    ],
  } as const;
  const chosen = language === "es" ? labels.es : language === "en" ? labels.en : labels.ca;
  return {
    ...leave,
    reasons: leave.reasons.map((item, index) => ({ ...item, label: chosen[index] ?? item.label })),
  };
}

export const memberBillingHandlers = [
  http.get("*/api/v1/inactivity-periods", ({ request }) => {
    const refused = moduleOff("INACTIVITY");
    if (refused !== undefined) return refused;
    const url = new URL(request.url);
    const memberFilter = url.searchParams.getAll("filter").find((value) => value.startsWith("memberId:eq:"));
    const stateFilter = url.searchParams.getAll("filter").find((value) => value.startsWith("state:"));
    const states = stateFilter?.split(":").slice(2).join(":").split(",");
    const memberId = memberFilter?.slice("memberId:eq:".length);
    if (memberId !== undefined && currentMockScenario().lifecycle === "memberPackPlan") {
      return error("INACTIVITY_NOT_APPLICABLE", 422);
    }
    const filtered = adminPeriods.filter((item) =>
      (memberId === undefined || item.member.id === memberId) &&
      (states === undefined || states.includes(item.state)),
    );
    const page = Number(url.searchParams.get("page") ?? 0);
    const size = Number(url.searchParams.get("size") ?? 20);
    const items = filtered.slice(page * size, (page + 1) * size).map((item) => ({
      comments: item.comments,
      decision: item.decision,
      feeSnapshot: item.feeSnapshot,
      fromMonth: item.fromMonth,
      id: item.id,
      member: item.member,
      origin: item.origin,
      requestedAt: item.requestedAt,
      state: item.state,
      toMonth: item.toMonth,
    }));
    return HttpResponse.json({ appliedFilters: [], items, page, size, totalItems: filtered.length, totalPages: Math.ceil(filtered.length / size) });
  }),
  http.get("*/api/v1/inactivity-periods/:id", ({ params }) => {
    const refused = moduleOff("INACTIVITY");
    if (refused !== undefined) return refused;
    const item = adminPeriods.find((period) => period.id === String(params.id));
    return item === undefined ? error("NOT_FOUND", 404) : HttpResponse.json(item);
  }),
  http.post("*/api/v1/inactivity-periods", async ({ request }) => {
    const refused = moduleOff("INACTIVITY");
    if (refused !== undefined) return refused;
    const body = (await request.json()) as AdminInactivityRequest;
    if (currentMockScenario().lifecycle === "memberPackPlan") return error("INACTIVITY_NOT_APPLICABLE", 422);
    if (currentMockScenario().lifecycle === "inactivityDeadlinePassed" && body.overrideDeadline !== true)
      return error("INACTIVITY_DEADLINE_PASSED", 422, { earliestMonth: "2026-11" });
    const existing = adminPeriods.find((period) => period.member.id === body.memberId && ["REQUESTED", "APPROVED", "ACTIVE"].includes(period.state));
    if (existing !== undefined) return error("INACTIVITY_OVERLAP", 409, { hint: "EXTEND", periodId: existing.id });
    const member = censusRecordState.memberOverview.member;
    const created: components["schemas"]["InactivityPeriod"] = {
      cancelledBookings: [], comments: body.comments ?? null,
      decision: { at: "2026-10-05T10:00:00Z", byAccountId: "account-admin", deadlineOverridden: body.overrideDeadline === true, decision: "APPROVED", note: null },
      editable: { cancel: true, fromMonth: true, toMonth: true },
      feeSnapshot: currentMockScenario().branding.modules.includes("BILLING") ? { firstMonth: { amountMinor: 2000, currency: "EUR" }, followingMonths: { amountMinor: 1000, currency: "EUR" } } : null,
      fromMonth: body.fromMonth, history: [], id: `admin-inactivity-${String(adminPeriods.length + 1)}`,
      member: { fullName: member.fullName, id: body.memberId, ...(member.memberNumber === undefined ? {} : { memberNumber: member.memberNumber }) }, origin: "BACKOFFICE",
      requestedAt: "2026-10-05T10:00:00Z", requestedBy: { accountId: "account-admin", impersonatedMemberId: null },
      state: "APPROVED", toMonth: body.toMonth ?? null, version: 1,
    };
    adminPeriods = [created, ...adminPeriods];
    return HttpResponse.json(created, { status: 201 });
  }),
  http.patch("*/api/v1/inactivity-periods/:id", async ({ params, request }) => {
    const body = (await request.json()) as AdminInactivityPatch;
    const item = adminPeriods.find((period) => period.id === String(params.id));
    if (item === undefined) return error("NOT_FOUND", 404);
    if (item.version !== body.version) return error("STALE_VERSION", 409);
    Object.assign(item, body, { version: item.version + 1 });
    return HttpResponse.json(item);
  }),
  http.post("*/api/v1/inactivity-periods/:id/decision", async ({ params, request }) => {
    const body = (await request.json()) as DecisionRequest;
    const item = adminPeriods.find((period) => period.id === String(params.id));
    if (item === undefined) return error("NOT_FOUND", 404);
    if (item.state !== "REQUESTED") return error("INACTIVITY_INVALID_STATE", 409);
    item.state = body.decision === "APPROVED" ? "APPROVED" : "DENIED";
    item.decision = { at: "2026-10-05T10:00:00Z", byAccountId: "account-admin", deadlineOverridden: false, decision: body.decision, note: body.note ?? null };
    item.version += 1;
    return HttpResponse.json(item);
  }),
  http.post("*/api/v1/inactivity-periods/:id/termination", async ({ params, request }) => {
    const item = adminPeriods.find((period) => period.id === String(params.id));
    if (item === undefined) return error("NOT_FOUND", 404);
    const body = (await request.json()) as components["schemas"]["TerminationRequest"];
    item.toMonth = body.toMonth; item.state = "FINISHED"; item.finishReason = "ADMIN"; item.finishedAt = "2026-10-05T10:00:00Z"; item.version += 1;
    return HttpResponse.json(item);
  }),
  http.post("*/api/v1/inactivity-periods/:id/cancellation", ({ params }) => {
    const item = adminPeriods.find((period) => period.id === String(params.id));
    if (item === undefined) return error("NOT_FOUND", 404);
    item.state = "CANCELLED"; item.cancelReason = "WITHDRAWN"; item.cancelledAt = "2026-10-05T10:00:00Z"; item.cancelledBy = "ADMIN"; item.version += 1;
    return HttpResponse.json(item);
  }),
  http.get("*/api/v1/leave-requests", ({ request }) => {
    const url = new URL(request.url);
    const filters = url.searchParams.getAll("filter");
    const memberId = filters.find((value) => value.startsWith("memberId:eq:"))?.slice("memberId:eq:".length);
    const state = filters.find((value) => value.startsWith("state:eq:"))?.slice("state:eq:".length);
    const filtered = adminLeaves.filter((item) => (memberId === undefined || item.member.id === memberId) && (state === undefined || item.state === state));
    const page = Number(url.searchParams.get("page") ?? 0); const size = Number(url.searchParams.get("size") ?? 20);
    const items = filtered.slice(page * size, (page + 1) * size).map((item) => ({ comment: item.comment, effectiveDate: item.decision?.effectiveDate, id: item.id, member: item.member, nps: item.nps, reasonKey: item.reasonKey, requestedAt: item.requestedAt, requestedDate: item.requestedDate, source: item.source, state: item.state }));
    return HttpResponse.json({ appliedFilters: [], items, page, size, totalItems: filtered.length, totalPages: Math.ceil(filtered.length / size) });
  }),
  http.get("*/api/v1/leave-requests/:id", ({ params }) => {
    const item = adminLeaves.find((leaveRequest) => leaveRequest.id === String(params.id));
    return item === undefined ? error("NOT_FOUND", 404) : HttpResponse.json(item);
  }),
  http.post("*/api/v1/leave-requests/:id/decision", async ({ params, request }) => {
    const item = adminLeaves.find((leaveRequest) => leaveRequest.id === String(params.id));
    if (item === undefined) return error("NOT_FOUND", 404);
    if (item.state !== "PENDING") return error("LEAVE_INVALID_STATE", 409);
    const body = (await request.json()) as LeaveDecisionRequest;
    if (currentMockScenario().lifecycle === "leaveDateInvalid") return error("LEAVE_DATE_INVALID", 422);
    item.state = body.decision === "APPROVED" ? "APPROVED" : "DENIED";
    item.decision = { at: "2026-10-05T10:00:00Z", byAccountId: "account-admin", decision: body.decision, effectiveDate: body.decision === "APPROVED" ? body.effectiveDate ?? item.requestedDate : null, note: body.note ?? null };
    item.version += 1;
    return HttpResponse.json(item);
  }),
  http.post("*/api/v1/members/:id/leave", async ({ params, request }) => {
    const body = (await request.json()) as DirectLeaveRequest;
    if (currentMockScenario().lifecycle === "leaveDateInvalid") return error("LEAVE_DATE_INVALID", 422);
    const member = censusRecordState.memberOverview.member;
    if (member.id !== String(params.id)) return error("NOT_FOUND", 404);
    member.leaveDate = body.effectiveDate;
    member.displayStatus = { date: body.effectiveDate, kind: "LEAVE_SCHEDULED", label: `baixa prevista ${body.effectiveDate}` };
    const created = adminLeaveRequests[0];
    return HttpResponse.json({ ...created, id: `admin-leave-${String(adminLeaves.length + 1)}`, member: { fullName: member.fullName, id: member.id, leaveDate: body.effectiveDate, leftAt: null, leftReason: null, memberNumber: member.memberNumber, status: "ACTIVE" }, requestedDate: body.effectiveDate, source: "ADMIN", state: "APPROVED" }, { status: 201 });
  }),
  http.delete("*/api/v1/members/:id/planned-leave", ({ params }) => {
    const member = censusRecordState.memberOverview.member;
    if (member.id !== String(params.id)) return error("NOT_FOUND", 404);
    if (member.leaveDate == null) return error("NO_PLANNED_LEAVE", 422);
    member.leaveDate = null; member.displayStatus = { kind: "ACTIVE", label: "alta" };
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("*/api/v1/members/:id/reactivation", async ({ params, request }) => {
    const member = censusRecordState.memberOverview.member;
    if (member.id !== String(params.id)) return error("NOT_FOUND", 404);
    if (member.status !== "LEFT" && currentMockScenario().lifecycle !== "memberLeft") return error("MEMBER_NOT_LEFT", 422);
    const body = (await request.json()) as ReactivationRequest;
    Object.assign(member, body, { displayStatus: { kind: "ACTIVE", label: "alta" }, leaveDate: null, status: "ACTIVE", version: member.version + 1 });
    return HttpResponse.json(member);
  }),
  http.post("*/api/v1/members/:id/card-setup-link", ({ params }) => {
    if (String(params.id) !== censusRecordState.memberOverview.member.id) return error("NOT_FOUND", 404);
    return currentMockScenario().branding.modules.includes("BILLING")
      ? HttpResponse.json({ checkoutUrl: "https://checkout.example.test/setup/admin-card" }, { status: 201 })
      : error("PAYMENT_PROVIDER_NOT_ENABLED", 422);
  }),
  http.get("*/api/v1/invoices", ({ request }) => {
    const url = new URL(request.url);
    const filters = url.searchParams.getAll("filter");
    const memberId = filters
      .find((filter) => filter.startsWith("memberId:eq:"))
      ?.slice("memberId:eq:".length);
    if (memberId !== "member-laura" && memberId !== ERASED_MEMBER_ID) return undefined;
    const items: components["schemas"]["InvoiceListItem"][] =
      memberId === ERASED_MEMBER_ID
        ? (erasedMemberOverview().recentInvoices ?? []).map((invoice) => ({
            concept: "Quota mensual",
            displayNumber: invoice.id,
            id: invoice.id,
            issueDate: invoice.date,
            paymentMethodType: "SEPA_DD",
            status: normalizeOverviewInvoiceStatus(invoice.status),
            total: invoice.amount,
          }))
        : invoices().map((invoice) => ({
            ...(invoice.lines[0] === undefined ? {} : { concept: invoice.lines[0].description }),
            displayNumber: invoice.displayNumber,
            id: invoice.id,
            issueDate: invoice.issueDate,
            paymentMethodType: invoice.paymentMethod.type,
            period: invoice.period,
            refundedTotal: invoice.refundedTotal,
            status: invoice.status,
            total: invoice.total,
          }));
    return HttpResponse.json({
      appliedFilters: [],
      items,
      page: 0,
      size: 20,
      totalItems: items.length,
      totalPages: 1,
    });
  }),
  http.get("*/api/v1/me/invoices", ({ request }) => {
    const refused = moduleOff("BILLING");
    if (refused !== undefined) return refused;
    const url = new URL(request.url);
    const page = Math.max(0, Number(url.searchParams.get("page") ?? 0));
    const size = Math.max(1, Number(url.searchParams.get("size") ?? 20));
    const all = invoices();
    return HttpResponse.json({
      items: all.slice(page * size, (page + 1) * size),
      page,
      size,
      totalItems: all.length,
      totalPages: Math.ceil(all.length / size),
    });
  }),
  http.get("*/api/v1/me/invoices/:id/document", ({ params }) => {
    const refused = moduleOff("BILLING");
    if (refused !== undefined) return refused;
    const item = invoices().find((row) => row.id === String(params.id));
    if (item === undefined) return error("NOT_FOUND", 404);
    return new HttpResponse(new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52]), {
      headers: {
        "Content-Disposition": `inline; filename="${item.displayNumber}.pdf"`,
        "Content-Type": "application/pdf",
      },
    });
  }),
  http.get("*/api/v1/me/invoices/:id", ({ params }) => {
    const refused = moduleOff("BILLING");
    if (refused !== undefined) return refused;
    const item = invoices().find((row) => row.id === String(params.id));
    return item === undefined ? error("NOT_FOUND", 404) : HttpResponse.json(item);
  }),
  http.post("*/api/v1/me/card-setup", () => {
    const refused = moduleOff("BILLING");
    if (refused !== undefined) return refused;
    return currentMockScenario().memberBilling === "cardInvalid"
      ? HttpResponse.json(
          { checkoutUrl: "https://checkout.example.test/setup/cs_card" },
          { status: 201 },
        )
      : error("PAYMENT_PROVIDER_NOT_ENABLED", 422);
  }),
  http.get("*/api/v1/checkout-sessions/:id", ({ params }) => {
    const refused = moduleOff("BILLING");
    if (refused !== undefined) return refused;
    const id = String(params.id);
    const count = checkoutReads.get(id) ?? 0;
    checkoutReads.set(id, count + 1);
    return HttpResponse.json({
      checkoutSessionId: id,
      status: id.includes("expired") ? "EXPIRED" : count === 0 ? "PENDING" : "PAID",
    });
  }),
  http.get("*/api/v1/me/pack-balances", () => {
    const refused = moduleOff("BILLING") ?? moduleOff("PACKS");
    return refused ?? HttpResponse.json(packs);
  }),
  http.get("*/api/v1/me/inactivity-periods", () => {
    const refused = moduleOff("INACTIVITY");
    if (refused !== undefined) return refused;
    if (currentMockScenario().memberBilling === "packPlan")
      return error("INACTIVITY_NOT_APPLICABLE", 422);
    return HttpResponse.json({
      ...inactivity,
      fee: currentMockScenario().branding.modules.includes("BILLING") ? inactivity.fee : null,
      periods:
        currentMockScenario().memberBilling === "noInactivity" ? [] : inactivity.periods,
    });
  }),
  http.get("*/api/v1/me/inactivity-periods/preview", () => {
    const refused = moduleOff("INACTIVITY");
    return refused ?? HttpResponse.json(inactivityPreviewFixture);
  }),
  http.post("*/api/v1/me/inactivity-periods", async ({ request }) => {
    const body = (await request.json()) as InactivityRequest;
    if (currentMockScenario().memberBilling === "deadlinePassed")
      return error("INACTIVITY_DEADLINE_PASSED", 422, { earliestMonth: "2026-11" });
    return HttpResponse.json({ ...inactivity.periods[0], ...body }, { status: 201 });
  }),
  http.patch("*/api/v1/me/inactivity-periods/:id", async ({ params, request }) => {
    const body = (await request.json()) as InactivityPatch;
    const period = inactivity.periods.find((item) => item.id === String(params.id));
    if (period === undefined) return error("NOT_FOUND", 404);
    if (body.version !== period.version) return error("STALE_VERSION", 409);
    Object.assign(period, body, { version: period.version + 1 });
    return HttpResponse.json(period);
  }),
  http.post("*/api/v1/me/inactivity-periods/:id/cancellation", ({ params }) => {
    const period = inactivity.periods.find((item) => item.id === String(params.id));
    if (period === undefined) return error("NOT_FOUND", 404);
    period.state = "CANCELLED";
    period.editable = { cancel: false, fromMonth: false, toMonth: false };
    return HttpResponse.json(period);
  }),
  http.get("*/api/v1/me/leave-requests", ({ request }) => {
    const context = localizedLeave(request);
    if (!currentMockScenario().branding.modules.includes("BILLING")) context.fee = null;
    if (currentMockScenario().memberBilling === "plannedLeave")
      context.plannedLeave = {
        cancellable: false,
        date: "2026-10-31",
        requestId: "55000000-0000-4000-8000-000000000001",
        since: "2026-08-11T10:00:00Z",
        source: "MEMBER",
      };
    return HttpResponse.json(context);
  }),
  http.post("*/api/v1/me/leave-requests", async ({ request }) => {
    const body = (await request.json()) as LeaveRequest;
    const created = {
      ...body,
      id: "55000000-0000-4000-8000-000000000002",
      state: "PENDING" as const,
    };
    leave.requests = [created];
    return HttpResponse.json(created, { status: 201 });
  }),
  http.post("*/api/v1/me/leave-requests/:id/cancellation", ({ params }) => {
    const row = leave.requests.find((item) => item.id === String(params.id));
    if (row === undefined) return error("NOT_FOUND", 404);
    row.state = "CANCELLED";
    return HttpResponse.json(row);
  }),
  http.get("*/api/v1/upfront-payments", ({ request }) => {
    const refused = moduleOff("BILLING");
    if (refused !== undefined) return refused;
    const memberId = new URL(request.url).searchParams.get("memberId");
    return HttpResponse.json({
      items: upfront.filter((item) => memberId === null || item.memberId === memberId),
    });
  }),
  http.post("*/api/v1/upfront-payments", async ({ request }) => {
    const body = (await request.json()) as UpfrontRequest;
    if (body.amountPaid.amountMinor > body.amountDue.amountMinor)
      return error("AMOUNT_EXCEEDS_DUE", 422);
    if (body.concept === "PACK" && body.dogId === undefined) return error("PLAN_NOT_PACK", 422);
    const item: components["schemas"]["UpfrontPayment"] = {
      ...body,
      amountDue: body.amountDue,
      amountPaid: body.amountPaid,
      createdAt: `${body.paidAt}T12:00:00Z`,
      id: `54000000-0000-4000-8000-${String(upfront.length + 2).padStart(12, "0")}`,
      paidAt: `${body.paidAt}T12:00:00Z`,
      provider: {
        channel: body.channel,
        paidAt: `${body.paidAt}T12:00:00Z`,
        reference: body.reference ?? null,
        type: "MANUAL",
      },
      refunds: [],
      status: body.amountPaid.amountMinor < body.amountDue.amountMinor ? "PARTIAL" : "PAID",
    };
    upfront = [item, ...upfront];
    return HttpResponse.json(item, { status: 201 });
  }),
  http.get("*/api/v1/pack-balances", ({ request }) => {
    const refused = moduleOff("BILLING") ?? moduleOff("PACKS");
    if (refused !== undefined) return refused;
    const url = new URL(request.url);
    const memberId = url.searchParams.get("memberId");
    const dogId = url.searchParams.get("dogId");
    const effectiveMemberId =
      memberId === "member-laura" ? "20000000-0000-4000-8000-000000000002" : memberId;
    return HttpResponse.json(
      packs.filter(
        (item) =>
          (effectiveMemberId === null || item.memberId === effectiveMemberId) &&
          (dogId === null || item.dogId === dogId),
      ),
    );
  }),
  http.post("*/api/v1/pack-balances/:id/adjustments", async ({ params, request }) => {
    const body = (await request.json()) as PackAdjustment;
    const balance = packs.find((item) => item.id === String(params.id));
    if (balance === undefined) return error("NOT_FOUND", 404);
    if (balance.state === "EXPIRED" && body.expiresOn === undefined)
      return error("VALIDATION_ERROR", 400, { fields: [{ field: "expiresOn", code: "REQUIRED" }] });
    if (balance.remaining + body.delta < 0) return error("PACK_NEGATIVE", 422);
    balance.remaining += body.delta;
    balance.consumed = balance.sessionsTotal - balance.remaining;
    if (body.expiresOn !== undefined) {
      balance.expiresOn = body.expiresOn;
      balance.state = "ACTIVE";
    }
    return HttpResponse.json(balance, { status: 201 });
  }),
];
