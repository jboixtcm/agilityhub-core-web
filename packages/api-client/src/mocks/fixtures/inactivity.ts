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
    { key: "LEARNT_ENOUGH", label: "Ja he après tot el que volia" },
    { key: "NO_TIME", label: "No trobo temps per anar-hi" },
    { key: "NOT_EXPECTED", label: "No és el que esperava" },
    { key: "PERSONAL", label: "Condicionants meus aliens al club" },
    { key: "OTHER", label: "Altres" },
  ],
  requests: [],
};

const lifecycleMembers = [
  { fullName: "Laura Serra Vidal", id: "member-laura", memberNumber: 87 },
  { fullName: "Eva Perez Prunell", id: "member-eva", memberNumber: 90 },
  { fullName: "Montse Tresserra Casas", id: "member-montse", memberNumber: 92 },
  { fullName: "Joan Antoni Serra", id: "member-joan", memberNumber: 112 },
  { fullName: "Marc Prats García", id: "member-marc", memberNumber: 88 },
  { fullName: "Anna Ballart Consul", id: "member-anna", memberNumber: 89 },
  { fullName: "Aina Roca Soler", id: "member-aina", memberNumber: 93 },
  { fullName: "Biel Puig Miró", id: "member-biel", memberNumber: 94 },
  { fullName: "Clara Font Pons", id: "member-clara", memberNumber: 95 },
  { fullName: "Dídac Vila Costa", id: "member-didac", memberNumber: 96 },
] as const;

function adminPeriod(index: number): components["schemas"]["InactivityPeriod"] {
  const member = lifecycleMembers[index] ?? lifecycleMembers[0];
  const active = index === 1;
  return {
    cancelledBookings: [],
    comments: index === 0 ? "Descans de la Duna" : active ? "Període obert" : null,
    decision: active
      ? { at: "2026-08-25T10:00:00Z", byAccountId: "account-admin", deadlineOverridden: false, decision: "APPROVED", note: null }
      : null,
    editable: { cancel: true, fromMonth: true, toMonth: true },
    feeSnapshot: active
      ? { firstMonth: { amountMinor: 2000, currency: "EUR" }, followingMonths: { amountMinor: 1000, currency: "EUR" } }
      : null,
    fromMonth: index === 0 ? "2026-10" : active ? "2026-08" : `2027-${String((index % 9) + 1).padStart(2, "0")}`,
    history: [],
    id: `admin-inactivity-${String(index + 1)}`,
    member,
    origin: index % 2 === 0 ? "APP" : "BACKOFFICE",
    requestedAt: `2026-08-${String(index + 1).padStart(2, "0")}T09:00:00Z`,
    requestedBy: { accountId: index % 2 === 0 ? `account-${member.id}` : "account-admin", impersonatedMemberId: null },
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
    id: `admin-leave-${String(index + 1)}`,
    member: {
      ...member,
      leaveDate: index === 3 ? "2026-12-12" : null,
      leftAt: null,
      leftReason: null,
      status: "ACTIVE",
    },
    nps: index === 2 ? 8 : null,
    origin: index % 2 === 0 ? "APP" : "BACKOFFICE",
    packBalanceId: index === 3 ? "pack-joan" : null,
    reason: index === 2 ? "Motius externs" : null,
    reasonKey: index === 2 ? "EXTERNAL" : null,
    requestedAt: `2026-08-${String(index + 1).padStart(2, "0")}T11:00:00Z`,
    requestedBy: { accountId: `account-${member.id}`, impersonatedMemberId: null },
    requestedDate: index === 2 ? "2026-08-31" : index === 3 ? "2026-12-12" : "2026-11-30",
    source: index === 3 ? "PACK_EXPIRED" : index % 2 === 0 ? "MEMBER" : "ADMIN",
    state: index === 2 ? "PENDING" : index === 3 ? "APPROVED" : "DENIED",
    version: 1,
  };
}

export const adminLeaveRequests: components["schemas"]["LeaveRequest"][] =
  Array.from({ length: 10 }, (_, index) => adminLeave(index));
