import type { components } from "../../generated/schema";

export const inactivityContextFixture: components["schemas"]["MeInactivityContext"] = {
  deadlineDay: 25,
  earliestFromMonth: "2026-10",
  proposedFromMonth: "2026-10",
  fee: {
    firstMonth: { amountMinor: 2000, currency: "EUR" },
    followingMonths: { amountMinor: 1000, currency: "EUR" },
  },
  periods: [
    {
      comments: "Descans de la Duna",
      editable: { cancel: true, fromMonth: true, toMonth: true },
      fee: {
        firstMonth: { amountMinor: 2000, currency: "EUR" },
        followingMonths: { amountMinor: 1000, currency: "EUR" },
      },
      fromMonth: "2026-10",
      id: "52000000-0000-4000-8000-000000000001",
      state: "REQUESTED",
      toMonth: null,
      version: 1,
    },
  ],
};

export const inactivityPreviewFixture: components["schemas"]["InactivityPreview"] = {
  bookingsInside: { activities: 0, classes: 1, total: 1, trainings: 0, waitlist: 0 },
  earliestMonthViolation: false,
  feeSchedule: [{ amount: { amountMinor: 2000, currency: "EUR" }, month: "2026-10" }],
};

export const leaveContextFixture: components["schemas"]["MeLeaveContext"] = {
  defaultDate: "2026-08-11",
  fee: {
    firstMonth: { amountMinor: 2000, currency: "EUR" },
    followingMonths: { amountMinor: 1000, currency: "EUR" },
  },
  fullMonthIfLater: true,
  npsEnabled: true,
  offerInactivity: true,
  plannedLeave: null,
  reasons: [
    { key: "LEARNED_ENOUGH", label: "Ja he après tot el que volia" },
    { key: "NO_TIME", label: "No trobo temps per anar-hi" },
    { key: "NOT_EXPECTED", label: "No és el que esperava" },
    { key: "EXTERNAL", label: "Condicionants meus aliens al club" },
    { key: "OTHER", label: "Altres" },
  ],
  requests: [],
};

export const lifecycleMembers = [
  { alias: "member-laura", fullName: "Laura Serra Vidal", id: "61000000-0000-4000-8000-000000000001", memberNumber: 87 },
  { alias: "member-eva", fullName: "Eva Perez Prunell", id: "61000000-0000-4000-8000-000000000002", memberNumber: 90 },
  { alias: "member-montse", fullName: "Montse Tresserra Casas", id: "61000000-0000-4000-8000-000000000003", memberNumber: 92 },
  { alias: "member-joan", fullName: "Joan Antoni Serra", id: "61000000-0000-4000-8000-000000000004", memberNumber: 112 },
  { alias: "member-marc", fullName: "Marc Prats García", id: "61000000-0000-4000-8000-000000000005", memberNumber: 88 },
  { alias: "member-anna", fullName: "Anna Ballart Consul", id: "61000000-0000-4000-8000-000000000006", memberNumber: 89 },
  { alias: "member-aina", fullName: "Aina Roca Soler", id: "61000000-0000-4000-8000-000000000007", memberNumber: 93 },
  { alias: "member-biel", fullName: "Biel Puig Miró", id: "61000000-0000-4000-8000-000000000008", memberNumber: 94 },
  { alias: "member-clara", fullName: "Clara Font Pons", id: "61000000-0000-4000-8000-000000000009", memberNumber: 95 },
  { alias: "member-didac", fullName: "Dídac Vila Costa", id: "61000000-0000-4000-8000-000000000010", memberNumber: 96 },
] as const;

export function lifecycleMemberId(value: string): string {
  return lifecycleMembers.find((member) => member.alias === value || member.id === value)?.id ?? value;
}

function adminPeriod(index: number): components["schemas"]["InactivityPeriod"] {
  const member = lifecycleMembers[index] ?? lifecycleMembers[0];
  const active = index === 1;
  return {
    bookingsInside: index === 0 ? 2 : 0,
    cancelledBookings: [],
    comments: index === 0 ? "Descans de la Duna" : active ? "Període obert" : null,
    decision: active
      ? { at: "2026-08-25T10:00:00Z", byAccountId: "63000000-0000-4000-8000-000000000099", deadlineOverridden: false, decision: "APPROVED", note: null }
      : null,
    editable: active
      ? { cancel: false, fromMonth: false, toMonth: true }
      : { cancel: true, fromMonth: true, toMonth: true },
    feeSnapshot: active
      ? { firstMonth: { amountMinor: 2000, currency: "EUR" }, followingMonths: { amountMinor: 1000, currency: "EUR" } }
      : null,
    fromMonth: index === 0 ? "2026-10" : active ? "2026-08" : `2027-${String((index % 9) + 1).padStart(2, "0")}`,
    history: [],
    id: `62000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    member: { fullName: member.fullName, id: member.id, memberNumber: member.memberNumber },
    origin: index % 2 === 0 ? "APP" : "BACKOFFICE",
    requestedAt: `2026-08-${String(index + 1).padStart(2, "0")}T09:00:00Z`,
    requestedBy: { accountId: `63000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, impersonatedMemberId: null },
    startedAt: active ? "2026-08-01T00:00:00Z" : null,
    state: index === 0 ? "REQUESTED" : active ? "ACTIVE" : "FINISHED",
    toMonth: index === 0 ? "2026-12" : active ? null : "2027-03",
    version: 1,
  };
}

export const adminInactivityPeriods: components["schemas"]["InactivityPeriod"][] =
  Array.from({ length: 10 }, (_, index) => adminPeriod(index));

function adminLeave(index: number): components["schemas"]["LeaveRequest"] {
  const member = lifecycleMembers[index] ?? lifecycleMembers[0];
  return {
    cancelledBookings: [],
    comment: index === 2 ? "Canvi de ciutat" : null,
    decision: null,
    id: `65000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    member: {
      fullName: member.fullName,
      id: member.id,
      memberNumber: member.memberNumber,
      leaveDate: index === 3 ? "2026-12-12" : null,
      leftAt: null,
      leftReason: null,
      status: "ACTIVE",
    },
    nps: index === 2 ? 8 : null,
    origin: index % 2 === 0 ? "APP" : "BACKOFFICE",
    packBalanceId: index === 3 ? "66000000-0000-4000-8000-000000000001" : null,
    reason: index === 2 ? "Motius externs" : null,
    reasonKey: index === 2 ? "EXTERNAL" : null,
    requestedAt: `2026-08-${String(index + 1).padStart(2, "0")}T11:00:00Z`,
    requestedBy: { accountId: `63000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, impersonatedMemberId: null },
    requestedDate: index === 2 ? "2026-08-31" : index === 3 ? "2026-12-12" : "2026-11-30",
    source: index === 3 ? "PACK_EXPIRED" : index % 2 === 0 ? "MEMBER" : "ADMIN",
    state: index === 2 ? "PENDING" : index === 3 ? "APPROVED" : "DENIED",
    version: 1,
  };
}

export const adminLeaveRequests: components["schemas"]["LeaveRequest"][] =
  Array.from({ length: 10 }, (_, index) => adminLeave(index));
