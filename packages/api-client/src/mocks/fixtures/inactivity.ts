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
