import { http, HttpResponse } from "msw";

import type { components } from "../generated/schema";

import { censusMembers, censusRecordState, ERASED_MEMBER_ID, erasedMemberOverview, resetCensusRecordState } from "./fixtures/census";
import { adminInactivityPeriods, adminLeaveRequests, inactivityContextFixture, inactivityPreviewFixture, leaveContextFixture, lifecycleMemberId, lifecycleMembers } from "./fixtures/inactivity";
import { meInvoiceFixtures, packBalanceFixtures } from "./fixtures/member-self-service";
import { findParameter } from "./fixtures/settings";
import { currentMockScenario, currentMockScenarioName } from "./scenarios";

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
type PlanChangeRequest = components["schemas"]["MemberPlanChangeRequest"];

const MOCK_NOW = "2026-10-05T10:00:00Z";
const MOCK_CURRENT_MONTH = "2026-10";

function monthEnd(month: string): string {
  const match = /^(\d{4})-(\d{2})$/u.exec(month);
  if (match === null) throw new TypeError(`Invalid lifecycle month: ${month}`);
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(lastDay).padStart(2, "0")}`;
}

function normalizeOverviewInvoiceStatus(status: string): components["schemas"]["InvoiceStatus"] {
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
  return HttpResponse.json<ApiError>({ code, details, message: code, traceId: "mock-e8-w02" }, { status });
}

function moduleOff(module: string) {
  return currentMockScenario().branding.modules.includes(module) ? undefined : error("MODULE_DISABLED", 404, { module });
}

function normalized(value: string): string {
  return value
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();
}

let inactivity = structuredClone(inactivityContextFixture);
let leave = structuredClone(leaveContextFixture);
let packs = structuredClone(packBalanceFixtures);
let adminPeriods = structuredClone(adminInactivityPeriods);
let adminLeaves = structuredClone(adminLeaveRequests);
let memberCreatedInactivity = false;
let lifecycleOverviews = createLifecycleOverviews();
let memberLeftScenarioInitialized = false;
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

interface PersistedMemberLifecycle {
  inactivityCreated: boolean;
  inactivityPeriods: ContextPeriods;
  leaveRequests: LeaveRequests;
}

type ContextPeriods = components["schemas"]["MeInactivityContext"]["periods"];
type LeaveRequests = components["schemas"]["MeLeaveContext"]["requests"];

function memberLifecycleStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function memberLifecycleStorageKey(): string {
  const clubId = currentMockScenario().me.membership?.clubId ?? "anonymous";
  return `agilityhub.mock.member-lifecycle:${clubId}:${currentMockScenarioName()}`;
}

function memberLeftScenarioStorageKey(): string {
  return `${memberLifecycleStorageKey()}:member-left-status`;
}

function restoreMemberLifecycle(): void {
  const stored = memberLifecycleStorage()?.getItem(memberLifecycleStorageKey());
  if (stored === null || stored === undefined) return;
  try {
    const parsed = JSON.parse(stored) as Partial<PersistedMemberLifecycle>;
    if (Array.isArray(parsed.inactivityPeriods)) {
      inactivity.periods = structuredClone(parsed.inactivityPeriods);
      memberCreatedInactivity =
        typeof parsed.inactivityCreated === "boolean"
          ? parsed.inactivityCreated
          : inactivity.periods.length > 0;
    }
    if (Array.isArray(parsed.leaveRequests)) {
      leave.requests = structuredClone(parsed.leaveRequests);
    }
  } catch {
    memberLifecycleStorage()?.removeItem(memberLifecycleStorageKey());
  }
}

function persistMemberLifecycle(): void {
  memberLifecycleStorage()?.setItem(
    memberLifecycleStorageKey(),
    JSON.stringify({
      inactivityCreated: memberCreatedInactivity,
      inactivityPeriods: inactivity.periods,
      leaveRequests: leave.requests,
    } satisfies PersistedMemberLifecycle),
  );
}

function pdfText(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function receiptPdf(invoice: components["schemas"]["MeInvoice"]): Uint8Array {
  const encoder = new TextEncoder();
  const concept = invoice.lines[0]?.description ?? invoice.displayNumber;
  const stream = [
    "BT",
    "/F1 18 Tf",
    "72 760 Td",
    `(Rebut ${pdfText(invoice.displayNumber)}) Tj`,
    "0 -30 Td",
    `(${pdfText(concept)}) Tj`,
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${String(encoder.encode(stream).length)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let document = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(encoder.encode(document).length);
    document += `${String(index + 1)} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = encoder.encode(document).length;
  document += `xref\n0 ${String(objects.length + 1)}\n`;
  document += "0000000000 65535 f \n";
  document += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  document += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\n`;
  document += `startxref\n${String(xrefOffset)}\n%%EOF\n`;
  return encoder.encode(document);
}

function createLifecycleOverviews(): Map<string, components["schemas"]["MemberOverview"]> {
  return new Map(lifecycleMembers.map((lifecycleMember) => {
    const overview = structuredClone(censusRecordState.memberOverview);
    const activePeriod = adminPeriods.find((period) => period.member.id === lifecycleMember.id && period.state === "ACTIVE");
    const plannedLeave = adminLeaves.find((request) => request.member.id === lifecycleMember.id && request.state === "APPROVED");
    const leaveDate = plannedLeave?.member.leaveDate ?? plannedLeave?.decision?.effectiveDate ?? null;
    Object.assign(overview.member, {
      displayStatus: activePeriod === undefined
        ? leaveDate === null
          ? { kind: "ACTIVE", label: "alta" }
          : { date: leaveDate, kind: "LEAVE_SCHEDULED", label: `baixa prevista ${leaveDate}` }
        : { date: activePeriod.toMonth == null ? null : monthEnd(activePeriod.toMonth), kind: "INACTIVE_PERIOD", label: "inactiva" },
      fullName: lifecycleMember.fullName,
      id: lifecycleMember.id,
      leaveDate,
      memberNumber: lifecycleMember.memberNumber,
      status: activePeriod === undefined ? "ACTIVE" : "INACTIVE",
    });
    return [lifecycleMember.id, overview];
  }));
}

function initializeMemberLeftScenario(): void {
  if (currentMockScenario().lifecycle !== "memberLeft" || memberLeftScenarioInitialized) return;
  memberLeftScenarioInitialized = true;
  if (memberLifecycleStorage()?.getItem(memberLeftScenarioStorageKey()) === "ACTIVE") return;
  const lifecycle = lifecycleOverviews.get(lifecycleMembers[0].id);
  for (const member of [lifecycle?.member, censusRecordState.memberOverview.member]) {
    if (member === undefined) continue;
    member.displayStatus = { kind: "LEFT", label: "baixa" };
    member.leaveDate = null;
    member.status = "LEFT";
  }
  syncLifecycleProjections(lifecycleMembers[0].id);
  memberLifecycleStorage()?.setItem(memberLeftScenarioStorageKey(), "LEFT");
}

export function lifecycleMemberOverview(value: string): components["schemas"]["MemberOverview"] | undefined {
  initializeMemberLeftScenario();
  if (value === censusRecordState.memberOverview.member.id) return censusRecordState.memberOverview;
  return lifecycleOverviews.get(lifecycleMemberId(value));
}

function syncLifecycleProjections(value: string): void {
  const id = lifecycleMemberId(value);
  const lifecycleMember = lifecycleMembers.find((item) => item.id === id);
  const member = id === lifecycleMembers[0].id
    ? censusRecordState.memberOverview.member
    : lifecycleOverviews.get(id)?.member;
  if (lifecycleMember === undefined || member === undefined) return;
  const listMember = censusMembers.find((item) => item.id === lifecycleMember.alias);
  if (listMember !== undefined) {
    listMember.displayStatus = structuredClone(member.displayStatus);
    if (typeof member.leaveDate === "string") {
      listMember.leaveDate = member.leaveDate;
    } else {
      delete listMember.leaveDate;
    }
    if (member.displayStatus.kind === "INACTIVE_PERIOD" && typeof member.displayStatus.date === "string") {
      listMember.inactivityUntil = member.displayStatus.date;
    } else {
      delete listMember.inactivityUntil;
    }
    listMember.leaveSource = adminLeaves.find((request) => request.member.id === id && request.state === "APPROVED")?.source ?? null;
    listMember.hasPendingRequest =
      adminPeriods.some((period) => period.member.id === id && period.state === "REQUESTED") ||
      adminLeaves.some((request) => request.member.id === id && request.state === "PENDING");
  }
  for (const request of adminLeaves.filter((item) => item.member.id === id)) {
    request.member.leaveDate = member.leaveDate ?? null;
    request.member.status = member.status;
  }
}

function recomputeLifecycleMember(value: string): void {
  const id = lifecycleMemberId(value);
  const activePeriod = adminPeriods.find(
    (period) => period.member.id === id && period.state === "ACTIVE",
  );
  const plannedLeave = adminLeaves.find(
    (request) => request.member.id === id && request.state === "APPROVED",
  );
  const leaveDate = plannedLeave?.decision?.effectiveDate ?? plannedLeave?.member.leaveDate ?? null;
  const lifecycle = lifecycleOverviews.get(id);
  const targets = [lifecycle?.member];
  if (id === lifecycleMembers[0].id) targets.push(censusRecordState.memberOverview.member);
  for (const member of targets) {
    if (member === undefined || member.status === "LEFT") continue;
    member.leaveDate = leaveDate;
    if (leaveDate !== null) {
      member.displayStatus = {
        date: leaveDate,
        kind: "LEAVE_SCHEDULED",
        label: `baixa prevista ${leaveDate}`,
      };
      member.status = "ACTIVE";
    } else if (activePeriod !== undefined) {
      member.displayStatus = {
        date: activePeriod.toMonth == null ? null : monthEnd(activePeriod.toMonth),
        kind: "INACTIVE_PERIOD",
        label: "inactiva",
      };
      member.status = "INACTIVE";
    } else {
      member.displayStatus = { kind: "ACTIVE", label: "alta" };
      member.status = "ACTIVE";
    }
  }
  syncLifecycleProjections(id);
}

function updateLifecycleMember(value: string, update: (member: components["schemas"]["Member"]) => void): void {
  const id = lifecycleMemberId(value);
  const lifecycle = lifecycleOverviews.get(id);
  if (lifecycle !== undefined) update(lifecycle.member);
  if (id === lifecycleMembers[0].id || value === censusRecordState.memberOverview.member.id) {
    update(censusRecordState.memberOverview.member);
  }
  syncLifecycleProjections(id);
}

export function resetMemberBillingState(): void {
  resetCensusRecordState();
  memberLifecycleStorage()?.removeItem(memberLifecycleStorageKey());
  memberLifecycleStorage()?.removeItem(memberLeftScenarioStorageKey());
  inactivity = structuredClone(inactivityContextFixture);
  leave = structuredClone(leaveContextFixture);
  packs = structuredClone(packBalanceFixtures);
  adminPeriods = structuredClone(adminInactivityPeriods);
  adminLeaves = structuredClone(adminLeaveRequests);
  lifecycleOverviews = createLifecycleOverviews();
  memberLeftScenarioInitialized = false;
  lifecycleMembers.forEach((member) => { syncLifecycleProjections(member.id); });
  memberCreatedInactivity = false;
  upfront = structuredClone(initialUpfront);
  checkoutReads.clear();
}

function invoices() {
  const rows = structuredClone(meInvoiceFixtures);
  return rows;
}

function localizedLeave(request: Request) {
  const scenario = currentMockScenario();
  const language = (request.headers.get("Accept-Language") ?? "ca").slice(0, 2);
  const labels = {
    ca: leaveContextFixture.reasons.map((item) => item.label),
    es: ["Ya he aprendido todo lo que quería", "No encuentro tiempo para ir", "No es lo que esperaba", "Condicionantes personales ajenos al club", "Otros"],
    en: ["I have learnt everything I wanted", "I cannot find time to attend", "It is not what I expected", "Personal circumstances unrelated to the club", "Other"],
  } as const;
  const chosen = language === "es" ? labels.es : language === "en" ? labels.en : labels.ca;
  return {
    ...leave,
    offerInactivity:
      scenario.branding.modules.includes("INACTIVITY") &&
      scenario.memberBilling !== "packPlan" &&
      scenario.lifecycle !== "memberPackPlan",
    reasons: leave.reasons.map((item, index) => ({ ...item, label: chosen[index] ?? item.label })),
  };
}

interface QueueFilter {
  field: string;
  op: string;
  value: string;
}

function queueFilters(url: URL): QueueFilter[] | undefined {
  const filters: QueueFilter[] = [];
  for (const raw of url.searchParams.getAll("filter")) {
    const [field, op, ...valueParts] = raw.split(":");
    if (field === undefined || op === undefined || valueParts.length === 0) return undefined;
    filters.push({ field, op, value: valueParts.join(":") });
  }
  return filters;
}

function queueFilterMatches(rawValue: string | number | null | undefined, filter: QueueFilter): boolean {
  if (filter.op === "exists") return rawValue !== null && rawValue !== undefined;
  if (rawValue === null || rawValue === undefined) return false;
  const choices = filter.value.split(",");
  if (typeof rawValue === "number") {
    const compared = choices.map(Number);
    if (compared.some((choice) => !Number.isFinite(choice))) return false;
    switch (filter.op) {
      case "eq": return rawValue === compared[0];
      case "ne": return rawValue !== compared[0];
      case "in": return compared.includes(rawValue);
      case "nin": return !compared.includes(rawValue);
      case "lt": return compared[0] !== undefined && rawValue < compared[0];
      case "lte": return compared[0] !== undefined && rawValue <= compared[0];
      case "gt": return compared[0] !== undefined && rawValue > compared[0];
      case "gte": return compared[0] !== undefined && rawValue >= compared[0];
      case "between": return compared[0] !== undefined && compared[1] !== undefined && rawValue >= compared[0] && rawValue <= compared[1];
      default: return false;
    }
  }
  const value = rawValue;
  switch (filter.op) {
    case "eq": return value === choices[0];
    case "ne": return value !== choices[0];
    case "in": return choices.includes(value);
    case "nin": return !choices.includes(value);
    case "lt": return choices[0] !== undefined && value < choices[0];
    case "lte": return choices[0] !== undefined && value <= choices[0];
    case "gt": return choices[0] !== undefined && value > choices[0];
    case "gte": return choices[0] !== undefined && value >= choices[0];
    case "between": return choices[0] !== undefined && choices[1] !== undefined && value >= choices[0] && value <= choices[1];
    default: return false;
  }
}

function inactivityFilterValue(item: components["schemas"]["InactivityPeriod"], field: string): string | number | null | undefined {
  switch (field) {
    case "memberId": return item.member.id;
    case "state": return item.state;
    case "fromMonth": return item.fromMonth;
    case "toMonth": return item.toMonth;
    case "origin": return item.origin;
    case "requestedAt": return item.requestedAt;
    default: return undefined;
  }
}

function leaveFilterValue(item: components["schemas"]["LeaveRequest"], field: string): string | number | null | undefined {
  switch (field) {
    case "memberId": return item.member.id;
    case "state": return item.state;
    case "source": return item.source;
    case "requestedDate": return item.requestedDate;
    case "effectiveDate": return item.decision?.effectiveDate;
    case "reasonKey": return item.reasonKey;
    case "nps": return item.nps;
    case "requestedAt": return item.requestedAt;
    default: return undefined;
  }
}

function filterQueue<Row>(items: readonly Row[], filters: readonly QueueFilter[], valueOf: (item: Row, field: string) => string | number | null | undefined, allowedFields: readonly string[]): Row[] | undefined {
  if (filters.some((filter) => !allowedFields.includes(filter.field))) return undefined;
  return items.filter((item) => filters.every((filter) => queueFilterMatches(valueOf(item, filter.field), filter)));
}

function sortQueue<Row>(
  items: readonly Row[],
  sorts: readonly string[],
  valueOf: (item: Row, field: string) => string | number | null | undefined,
  allowedFields: readonly string[],
): Row[] | undefined {
  const parsed = sorts.map((sort) => {
    const [field, direction, ...rest] = sort.split(",");
    return field === undefined || direction === undefined || rest.length > 0 ||
      !allowedFields.includes(field) || (direction !== "asc" && direction !== "desc")
      ? undefined
      : { direction, field };
  });
  if (parsed.some((sort) => sort === undefined)) return undefined;
  return [...items].sort((left, right) => {
    for (const sort of parsed) {
      if (sort === undefined) continue;
      const leftValue = valueOf(left, sort.field);
      const rightValue = valueOf(right, sort.field);
      const compared = leftValue == null
        ? rightValue == null ? 0 : 1
        : rightValue == null
          ? -1
          : typeof leftValue === "number" && typeof rightValue === "number"
            ? leftValue - rightValue
            : String(leftValue).localeCompare(String(rightValue));
      if (compared !== 0) return sort.direction === "asc" ? compared : -compared;
    }
    return 0;
  });
}

function inactivitySortValue(item: components["schemas"]["InactivityPeriod"], field: string) {
  return field === "memberLastName" ? item.member.fullName : inactivityFilterValue(item, field);
}

function leaveSortValue(item: components["schemas"]["LeaveRequest"], field: string) {
  return leaveFilterValue(item, field);
}

function cancelBookingsOnApproval(): boolean {
  return currentMockScenario().lifecycle !== "inactivityNoCancelBookings" &&
    findParameter("inactivity.cancelBookingsOnApproval")?.value !== false;
}

export const memberBillingHandlers = [
  http.get("*/api/v1/inactivity-periods", ({ request }) => {
    const refused = moduleOff("INACTIVITY");
    if (refused !== undefined) return refused;
    const url = new URL(request.url);
    const filters = queueFilters(url);
    if (filters === undefined) return error("INVALID_FILTER", 400);
    const memberFilter = filters.find((filter) => filter.field === "memberId" && filter.op === "eq");
    const memberId = memberFilter === undefined ? undefined : lifecycleMemberId(memberFilter.value);
    if (memberId !== undefined && currentMockScenario().lifecycle === "memberPackPlan") {
      return error("INACTIVITY_NOT_APPLICABLE", 422);
    }
    const normalizedFilters = filters.map((filter) => filter.field === "memberId" ? { ...filter, value: filter.value.split(",").map(lifecycleMemberId).join(",") } : filter);
    const query = normalized((url.searchParams.get("q") ?? "").trim());
    const searched = query === ""
      ? adminPeriods
      : adminPeriods.filter((item) => normalized(item.member.fullName).includes(query));
    const filtered = filterQueue(searched, normalizedFilters, inactivityFilterValue, ["memberId", "state", "fromMonth", "toMonth", "origin", "requestedAt"]);
    if (filtered === undefined) return error("INVALID_FILTER", 400);
    const sorted = sortQueue(filtered, url.searchParams.getAll("sort"), inactivitySortValue, ["fromMonth", "requestedAt", "memberLastName"]);
    if (sorted === undefined) return error("INVALID_FILTER", 400);
    const page = Number(url.searchParams.get("page") ?? 0);
    const size = Number(url.searchParams.get("size") ?? 20);
    const items = sorted.slice(page * size, (page + 1) * size).map((item) => ({
      comments: item.comments,
      decision: item.decision,
      feeSnapshot: item.feeSnapshot,
      fromMonth: item.fromMonth,
      id: item.id,
      member: item.member,
      origin: item.origin,
      requestedAt: item.requestedAt,
      state: item.state,
      toMonth: item.toMonth ?? null,
    }));
    return HttpResponse.json({
      appliedFilters: filters.map((filter) => ({ field: filter.field, op: filter.op, value: filter.value })),
      items,
      page,
      size,
      totalItems: sorted.length,
      totalPages: Math.ceil(sorted.length / size),
    });
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
    if (currentMockScenario().lifecycle === "inactivityDeadlinePassed" && body.overrideDeadline !== true) return error("INACTIVITY_DEADLINE_PASSED", 422, { earliestMonth: "2026-11" });
    const normalizedMemberId = lifecycleMemberId(body.memberId);
    const existing = adminPeriods.find((period) => period.member.id === normalizedMemberId && ["REQUESTED", "APPROVED", "ACTIVE"].includes(period.state));
    if (existing !== undefined) return error("INACTIVITY_OVERLAP", 409, { hint: "EXTEND", periodId: existing.id });
    const member = lifecycleMemberOverview(body.memberId)?.member;
    if (member === undefined) return error("NOT_FOUND", 404);
    const created: components["schemas"]["InactivityPeriod"] = {
      cancelledBookings: [],
      comments: body.comments ?? null,
      decision: {
        at: MOCK_NOW,
        byAccountId: "63000000-0000-4000-8000-000000000099",
        deadlineOverridden: body.overrideDeadline === true,
        decision: "APPROVED",
        note: null,
      },
      editable: { cancel: true, fromMonth: true, toMonth: true },
      feeSnapshot: currentMockScenario().branding.modules.includes("BILLING")
        ? {
            firstMonth: { amountMinor: 2000, currency: "EUR" },
            followingMonths: { amountMinor: 1000, currency: "EUR" },
          }
        : null,
      fromMonth: body.fromMonth,
      history: [],
      id: `62000000-0000-4000-8000-${String(adminPeriods.length + 1).padStart(12, "0")}`,
      member: {
        fullName: member.fullName,
        id: normalizedMemberId,
        ...(member.memberNumber === undefined ? {} : { memberNumber: member.memberNumber }),
      },
      origin: "BACKOFFICE",
      requestedAt: MOCK_NOW,
      requestedBy: { accountId: "63000000-0000-4000-8000-000000000099", impersonatedMemberId: null },
      ...(body.fromMonth <= MOCK_CURRENT_MONTH ? { startedAt: MOCK_NOW } : {}),
      state: body.fromMonth <= MOCK_CURRENT_MONTH ? "ACTIVE" : "APPROVED",
      toMonth: body.toMonth ?? null,
      version: 1,
    };
    adminPeriods = [created, ...adminPeriods];
    recomputeLifecycleMember(normalizedMemberId);
    return HttpResponse.json(created, { status: 201 });
  }),
  http.patch("*/api/v1/inactivity-periods/:id", async ({ params, request }) => {
    const body = (await request.json()) as AdminInactivityPatch;
    const item = adminPeriods.find((period) => period.id === String(params.id));
    if (item === undefined) return error("NOT_FOUND", 404);
    if (item.version !== body.version) return error("STALE_VERSION", 409);
    if (body.fromMonth !== undefined) item.fromMonth = body.fromMonth;
    if ("toMonth" in body) item.toMonth = body.toMonth ?? null;
    if ("comments" in body) item.comments = body.comments ?? null;
    if (body.overrideDeadline === true && item.decision !== null && item.decision !== undefined) {
      item.decision.deadlineOverridden = true;
    }
    item.history.push({
      at: MOCK_NOW,
      byAccountId: "63000000-0000-4000-8000-000000000099",
      fromMonth: item.fromMonth,
      source: "ADMIN",
      toMonth: item.toMonth ?? null,
    });
    item.version += 1;
    recomputeLifecycleMember(item.member.id);
    return HttpResponse.json(item);
  }),
  http.post("*/api/v1/inactivity-periods/:id/decision", async ({ params, request }) => {
    const body = (await request.json()) as DecisionRequest;
    const item = adminPeriods.find((period) => period.id === String(params.id));
    if (item === undefined) return error("NOT_FOUND", 404);
    if (item.state !== "REQUESTED") return error("INACTIVITY_INVALID_STATE", 409);
    item.state = body.decision === "APPROVED" ? (item.fromMonth <= MOCK_CURRENT_MONTH ? "ACTIVE" : "APPROVED") : "DENIED";
    item.decision = {
      at: MOCK_NOW,
      byAccountId: "63000000-0000-4000-8000-000000000099",
      deadlineOverridden: false,
      decision: body.decision,
      note: body.note ?? null,
    };
    if (body.decision === "APPROVED") {
      item.feeSnapshot = currentMockScenario().branding.modules.includes("BILLING")
        ? { firstMonth: { amountMinor: 2000, currency: "EUR" }, followingMonths: { amountMinor: 1000, currency: "EUR" } }
        : null;
      item.bookingsInside ??= 2;
      item.cancelledBookings = cancelBookingsOnApproval()
        ? [
            { id: "64000000-0000-4000-8000-000000000001", sessionDate: "2026-10-12", type: "CLASS" },
            { id: "64000000-0000-4000-8000-000000000002", sessionDate: "2026-10-14", type: "TRAINING" },
          ]
        : [];
      if (item.state === "ACTIVE") item.startedAt = MOCK_NOW;
    }
    item.version += 1;
    recomputeLifecycleMember(item.member.id);
    return HttpResponse.json(item);
  }),
  http.post("*/api/v1/inactivity-periods/:id/termination", async ({ params, request }) => {
    const item = adminPeriods.find((period) => period.id === String(params.id));
    if (item === undefined) return error("NOT_FOUND", 404);
    const body = (await request.json()) as components["schemas"]["TerminationRequest"];
    item.toMonth = body.toMonth;
    if (body.toMonth < MOCK_CURRENT_MONTH) {
      item.state = "FINISHED";
      item.finishReason = "ADMIN";
      item.finishedAt = MOCK_NOW;
    } else {
      item.state = "ACTIVE";
      item.finishReason = null;
      item.finishedAt = null;
    }
    item.version += 1;
    recomputeLifecycleMember(item.member.id);
    return HttpResponse.json(item);
  }),
  http.post("*/api/v1/inactivity-periods/:id/cancellation", ({ params }) => {
    const item = adminPeriods.find((period) => period.id === String(params.id));
    if (item === undefined) return error("NOT_FOUND", 404);
    item.state = "CANCELLED";
    item.cancelReason = "WITHDRAWN";
    item.cancelledAt = MOCK_NOW;
    item.cancelledBy = "ADMIN";
    item.version += 1;
    recomputeLifecycleMember(item.member.id);
    return HttpResponse.json(item);
  }),
  http.get("*/api/v1/leave-requests", ({ request }) => {
    const url = new URL(request.url);
    const filters = queueFilters(url);
    if (filters === undefined) return error("INVALID_FILTER", 400);
    const normalizedFilters = filters.map((filter) => filter.field === "memberId" ? { ...filter, value: filter.value.split(",").map(lifecycleMemberId).join(",") } : filter);
    const query = normalized((url.searchParams.get("q") ?? "").trim());
    const searched = query === ""
      ? adminLeaves
      : adminLeaves.filter((item) => normalized(item.member.fullName).includes(query));
    const filtered = filterQueue(searched, normalizedFilters, leaveFilterValue, ["memberId", "state", "source", "requestedAt", "requestedDate", "effectiveDate", "reasonKey", "nps"]);
    if (filtered === undefined) return error("INVALID_FILTER", 400);
    const sorted = sortQueue(filtered, url.searchParams.getAll("sort"), leaveSortValue, ["requestedAt", "requestedDate", "effectiveDate"]);
    if (sorted === undefined) return error("INVALID_FILTER", 400);
    const page = Number(url.searchParams.get("page") ?? 0);
    const size = Number(url.searchParams.get("size") ?? 20);
    const items = sorted.slice(page * size, (page + 1) * size).map((item) => ({
      comment: item.comment,
      effectiveDate: item.decision?.effectiveDate,
      id: item.id,
      member: item.member,
      nps: item.nps,
      reasonKey: item.reasonKey,
      requestedAt: item.requestedAt,
      requestedDate: item.requestedDate,
      source: item.source,
      state: item.state,
    }));
    return HttpResponse.json({
      appliedFilters: filters.map((filter) => ({ field: filter.field, op: filter.op, value: filter.value })),
      items,
      page,
      size,
      totalItems: sorted.length,
      totalPages: Math.ceil(sorted.length / size),
    });
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
    item.decision = {
      at: "2026-10-05T10:00:00Z",
      byAccountId: "63000000-0000-4000-8000-000000000099",
      decision: body.decision,
      effectiveDate: body.decision === "APPROVED" ? (body.effectiveDate ?? item.requestedDate) : null,
      note: body.note ?? null,
    };
    if (body.decision === "APPROVED") {
      const effectiveDate = body.effectiveDate ?? item.requestedDate;
      item.cancelledBookings = [
        { id: "64000000-0000-4000-8000-000000000003", sessionDate: effectiveDate, type: "CLASS" },
      ];
      item.member.leaveDate = effectiveDate;
      updateLifecycleMember(item.member.id, (member) => {
        member.leaveDate = effectiveDate;
        member.displayStatus = { date: effectiveDate, kind: "LEAVE_SCHEDULED", label: `baixa prevista ${effectiveDate}` };
      });
    }
    item.version += 1;
    return HttpResponse.json(item);
  }),
  http.post("*/api/v1/members/:id/leave", async ({ params, request }) => {
    const body = (await request.json()) as DirectLeaveRequest;
    if (currentMockScenario().lifecycle === "leaveDateInvalid") return error("LEAVE_DATE_INVALID", 422);
    const requestedId = String(params.id);
    if (requestedId === ERASED_MEMBER_ID) return error("MEMBER_ERASED", 409);
    const overview = lifecycleMemberOverview(requestedId);
    if (overview === undefined) return error("NOT_FOUND", 404);
    const normalizedId = lifecycleMemberId(requestedId);
    const member = overview.member;
    for (const pendingRequest of adminLeaves.filter((item) => item.member.id === normalizedId && item.state === "PENDING")) {
      pendingRequest.state = "CANCELLED";
      pendingRequest.version += 1;
    }
    const seed = adminLeaveRequests[0];
    if (seed === undefined) throw new TypeError("The leave fixture requires a seed row");
    const created: components["schemas"]["LeaveRequest"] = {
      ...seed,
      comment: body.note ?? null,
      decision: { at: "2026-10-05T10:00:00Z", byAccountId: "63000000-0000-4000-8000-000000000099", decision: "APPROVED", effectiveDate: body.effectiveDate, note: body.note ?? null },
      cancelledBookings: [{ id: "64000000-0000-4000-8000-000000000004", sessionDate: body.effectiveDate, type: "CLASS" }],
      id: `65000000-0000-4000-8000-${String(adminLeaves.length + 1).padStart(12, "0")}`,
      member: { fullName: member.fullName, id: normalizedId, leaveDate: body.effectiveDate, leftAt: null, leftReason: null, ...(member.memberNumber === undefined ? {} : { memberNumber: member.memberNumber }), status: "ACTIVE" },
      origin: "BACKOFFICE",
      reasonKey: body.reasonKey ?? null,
      requestedAt: "2026-10-05T10:00:00Z",
      requestedBy: { accountId: "63000000-0000-4000-8000-000000000099", impersonatedMemberId: null },
      requestedDate: body.effectiveDate,
      source: "ADMIN",
      state: "APPROVED",
      version: 1,
    };
    adminLeaves = [created, ...adminLeaves];
    recomputeLifecycleMember(requestedId);
    return HttpResponse.json(created, { status: 201 });
  }),
  http.delete("*/api/v1/members/:id/planned-leave", ({ params }) => {
    const requestedId = String(params.id);
    if (requestedId === ERASED_MEMBER_ID) return error("MEMBER_ERASED", 409);
    const member = lifecycleMemberOverview(requestedId)?.member;
    if (member === undefined) return error("NOT_FOUND", 404);
    if (member.leaveDate == null) return error("NO_PLANNED_LEAVE", 409);
    const leaveDate = member.leaveDate;
    const normalizedId = lifecycleMemberId(requestedId);
    for (const request of adminLeaves.filter((item) =>
      item.member.id === normalizedId &&
      item.state === "APPROVED" &&
      (item.decision?.effectiveDate ?? item.member.leaveDate ?? item.requestedDate) === leaveDate
    )) {
      request.state = "CANCELLED";
      request.cancelledAt = "2026-10-05T10:00:00Z";
      request.cancelledBy = "ADMIN";
      request.cancelReason = "ADMIN";
      request.member.leaveDate = null;
      request.version += 1;
    }
    updateLifecycleMember(requestedId, (updated) => {
      updated.leaveDate = null;
      updated.displayStatus = { kind: "ACTIVE", label: "alta" };
    });
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("*/api/v1/members/:id/reactivation", async ({ params, request }) => {
    const requestedId = String(params.id);
    if (requestedId === ERASED_MEMBER_ID) return error("MEMBER_ERASED", 409);
    const member = lifecycleMemberOverview(requestedId)?.member;
    if (member === undefined) return error("NOT_FOUND", 404);
    if (member.status !== "LEFT") return error("MEMBER_NOT_LEFT", 409);
    const body = (await request.json()) as ReactivationRequest;
    updateLifecycleMember(requestedId, (updated) => {
      Object.assign(updated, body, {
        displayStatus: { kind: "ACTIVE", label: "alta" },
        leaveDate: null,
        status: "ACTIVE",
        version: updated.version + 1,
      });
    });
    if (currentMockScenario().lifecycle === "memberLeft" && lifecycleMemberId(requestedId) === lifecycleMembers[0].id) {
      memberLifecycleStorage()?.setItem(memberLeftScenarioStorageKey(), "ACTIVE");
    }
    return HttpResponse.json(member);
  }),
  http.post("*/api/v1/members/:id/plan-change", async ({ params, request }) => {
    const requestedId = String(params.id);
    if (requestedId === ERASED_MEMBER_ID) return error("MEMBER_ERASED", 409);
    const member = lifecycleMemberOverview(requestedId)?.member;
    if (member === undefined) return error("NOT_FOUND", 404);
    const body = (await request.json()) as PlanChangeRequest;
    updateLifecycleMember(requestedId, (updated) => {
      updated.planId = body.planId;
      updated.priceId = body.priceId;
      updated.version += 1;
    });
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("*/api/v1/members/:id/card-setup-link", ({ params }) => {
    if (String(params.id) !== censusRecordState.memberOverview.member.id) return error("NOT_FOUND", 404);
    return currentMockScenario().branding.modules.includes("BILLING") ? HttpResponse.json({ checkoutUrl: "https://checkout.example.test/setup/admin-card" }, { status: 201 }) : error("PAYMENT_PROVIDER_NOT_ENABLED", 422);
  }),
  http.get("*/api/v1/invoices", ({ request }) => {
    const url = new URL(request.url);
    const filters = url.searchParams.getAll("filter");
    const memberId = filters.find((filter) => filter.startsWith("memberId:eq:"))?.slice("memberId:eq:".length);
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
    return new HttpResponse(receiptPdf(item), {
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
    return currentMockScenario().memberBilling === "cardInvalid" ? HttpResponse.json({ checkoutUrl: "https://checkout.example.test/setup/cs_card" }, { status: 201 }) : error("PAYMENT_PROVIDER_NOT_ENABLED", 422);
  }),
  http.get("*/api/v1/checkout-sessions/:id", ({ params, request }) => {
    const refused = moduleOff("BILLING");
    if (refused !== undefined) return refused;
    const id = String(params.id);
    if (
      id.includes("signup") &&
      request.headers.get("Authorization") === null &&
      request.headers.get("X-Signup-Token") !== "mock-signup-token"
    ) {
      return error("UNAUTHENTICATED", 401);
    }
    const count = checkoutReads.get(id) ?? 0;
    checkoutReads.set(id, count + 1);
    return HttpResponse.json({
      checkoutSessionId: id,
      status: id.includes("expired") ? "EXPIRED" : count < 2 ? "PENDING" : "PAID",
    });
  }),
  http.get("*/api/v1/me/pack-balances", () => {
    const refused = moduleOff("BILLING") ?? moduleOff("PACKS");
    return refused ?? HttpResponse.json(packs);
  }),
  http.get("*/api/v1/me/inactivity-periods", () => {
    const refused = moduleOff("INACTIVITY");
    if (refused !== undefined) return refused;
    if (currentMockScenario().memberBilling === "packPlan") return error("INACTIVITY_NOT_APPLICABLE", 422);
    restoreMemberLifecycle();
    const billingEnabled = currentMockScenario().branding.modules.includes("BILLING");
    return HttpResponse.json({
      ...inactivity,
      fee: billingEnabled ? inactivity.fee : null,
      periods: (
        currentMockScenario().memberBilling === "noInactivity" && !memberCreatedInactivity
          ? []
          : inactivity.periods
      ).map((period) => (billingEnabled ? period : { ...period, fee: null })),
    });
  }),
  http.get("*/api/v1/me/inactivity-periods/preview", () => {
    const refused = moduleOff("INACTIVITY");
    return refused ?? HttpResponse.json(inactivityPreviewFixture);
  }),
  http.post("*/api/v1/me/inactivity-periods", async ({ request }) => {
    restoreMemberLifecycle();
    const body = (await request.json()) as InactivityRequest;
    if (currentMockScenario().memberBilling === "deadlinePassed") return error("INACTIVITY_DEADLINE_PASSED", 422, { earliestMonth: "2026-11" });
    const seed = inactivityContextFixture.periods[0];
    if (seed === undefined) throw new TypeError("The inactivity fixture requires a seed period");
    const created = {
      ...seed,
      comments: body.comments ?? null,
      fromMonth: body.fromMonth,
      id: "52000000-0000-4000-8000-000000000099",
      state: "REQUESTED" as const,
      toMonth: body.toMonth ?? null,
      version: 1,
    };
    inactivity.periods = [created];
    memberCreatedInactivity = true;
    persistMemberLifecycle();
    return HttpResponse.json(created, { status: 201 });
  }),
  http.patch("*/api/v1/me/inactivity-periods/:id", async ({ params, request }) => {
    restoreMemberLifecycle();
    const body = (await request.json()) as InactivityPatch;
    const period = inactivity.periods.find((item) => item.id === String(params.id));
    if (period === undefined) return error("NOT_FOUND", 404);
    if (body.version !== period.version) return error("STALE_VERSION", 409);
    Object.assign(period, body, { version: period.version + 1 });
    persistMemberLifecycle();
    return HttpResponse.json(period);
  }),
  http.post("*/api/v1/me/inactivity-periods/:id/cancellation", ({ params }) => {
    restoreMemberLifecycle();
    const period = inactivity.periods.find((item) => item.id === String(params.id));
    if (period === undefined) return error("NOT_FOUND", 404);
    period.state = "CANCELLED";
    period.editable = { cancel: false, fromMonth: false, toMonth: false };
    persistMemberLifecycle();
    return HttpResponse.json(period);
  }),
  http.get("*/api/v1/me/leave-requests", ({ request }) => {
    restoreMemberLifecycle();
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
    restoreMemberLifecycle();
    const body = (await request.json()) as LeaveRequest;
    if (!leave.reasons.some((reason) => reason.key === body.reasonKey)) {
      return error("LEAVE_REASON_UNKNOWN", 400);
    }
    const created = {
      ...body,
      id: "55000000-0000-4000-8000-000000000002",
      state: "PENDING" as const,
    };
    leave.requests = [created];
    persistMemberLifecycle();
    return HttpResponse.json(created, { status: 201 });
  }),
  http.post("*/api/v1/me/leave-requests/:id/cancellation", ({ params }) => {
    restoreMemberLifecycle();
    const row = leave.requests.find((item) => item.id === String(params.id));
    if (row === undefined) return error("NOT_FOUND", 404);
    row.state = "CANCELLED";
    persistMemberLifecycle();
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
    if (body.amountPaid.amountMinor > body.amountDue.amountMinor) return error("AMOUNT_EXCEEDS_DUE", 422);
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
    const effectiveMemberId = memberId === "member-laura" ? "20000000-0000-4000-8000-000000000002" : memberId;
    const rows = packs
      .filter(
        (item) =>
          (effectiveMemberId === null || item.memberId === effectiveMemberId) &&
          (dogId === null || item.dogId === dogId),
      )
      .map((item) =>
        memberId === "member-laura" &&
        item.dogId === "31000000-0000-4000-8000-000000000002"
          ? { ...item, dogId: "dog-rock" }
          : item,
      );
    return HttpResponse.json(rows);
  }),
  http.post("*/api/v1/pack-balances/:id/adjustments", async ({ params, request }) => {
    const body = (await request.json()) as PackAdjustment;
    const balance = packs.find((item) => item.id === String(params.id));
    if (balance === undefined) return error("NOT_FOUND", 404);
    if (balance.state === "EXPIRED" && body.expiresOn === undefined) return error("VALIDATION_ERROR", 400, { fields: [{ field: "expiresOn", code: "REQUIRED" }] });
    if (balance.remaining + body.delta < 0) return error("PACK_NEGATIVE", 422);
    balance.remaining += body.delta;
    balance.consumed = balance.sessionsTotal - balance.remaining;
    if (body.expiresOn !== undefined) {
      balance.expiresOn = body.expiresOn;
      balance.state = "ACTIVE";
    }
    const overviewDogId =
      balance.dogId === "31000000-0000-4000-8000-000000000002"
        ? "dog-rock"
        : balance.dogId;
    const overviewDog = censusRecordState.memberOverview.dogs.find(
      (dog) => dog.id === overviewDogId,
    );
    if (overviewDog !== undefined) {
      overviewDog.pack = {
        expiresOn: balance.expiresOn,
        id: balance.id,
        remaining: balance.remaining,
        total: balance.sessionsTotal,
      };
    }
    return HttpResponse.json(balance, { status: 201 });
  }),
];
