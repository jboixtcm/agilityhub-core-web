import type { components } from "../../generated/schema";

export type Parameter = components["schemas"]["Parameter"];
export type Parameters = components["schemas"]["Parameters"];

const actorId = "00000000-0000-4000-8000-000000000001";
const changedAt = "2026-08-11T09:30:00Z";

function parameter(
  key: string,
  block: string,
  type: string,
  value: unknown,
  options: {
    constraints?: Record<string, unknown>;
    editableBy?: "CLUB" | "PLATFORM";
    module?: string;
  } = {},
): Parameter {
  return {
    block,
    constraints: options.constraints ?? {},
    default: structuredClone(value),
    editableBy: options.editableBy ?? "CLUB",
    help: key,
    history: [
      {
        changedAt,
        changedByAccountId: actorId,
        reason: "Initial configuration",
        value: structuredClone(value),
      },
    ],
    isOverride: false,
    key,
    label: key,
    lastChange: { action: key, actorName: "Jordi", at: changedAt },
    ...(options.module === undefined ? {} : { module: options.module }),
    type,
    value: structuredClone(value),
    version: 1,
  };
}

const initialParameters: Parameters = {
  blocks: [
    {
      key: "classes",
      rows: [
        parameter("bookings.maxCurrentWeek", "classes", "int", 2, {
          constraints: { max: 14, min: 0 },
        }),
        parameter("bookings.maxNextWeek", "classes", "int", 1, {
          constraints: { max: 14, min: 0 },
        }),
        parameter("bookings.weekOpensAt", "classes", "json", {
          dayOfWeek: "SUNDAY",
          time: "20:00",
        }),
        parameter("bookings.lateCancelThresholdMinutes", "classes", "duration", 240, {
          constraints: { before: true, min: 0, step: 5 },
        }),
        parameter("classes.defaultCapacity", "classes", "int", 5, {
          constraints: { max: 99, min: 1 },
        }),
        parameter("classes.riskReviewTime", "classes", "time", "07:30"),
        parameter("classes.riskLookaheadDays", "classes", "int", 2, {
          constraints: { max: 30, min: 0 },
        }),
        parameter("bookings.showInstructorHoursBefore", "classes", "int", 24, {
          constraints: { min: 0 },
        }),
        parameter("coverage.thresholds", "classes", "json", {
          ok: 240,
          short: 150,
          tight: 190,
        }),
      ],
      title: "admin-settings:block.classes.title",
    },
    {
      key: "training",
      rows: [
        parameter("training.bookingWindowDays", "training", "int", 3, {
          constraints: { min: 0 },
          module: "FREE_TRAINING",
        }),
        parameter("training.maxPerWeek", "training", "int", 3, {
          constraints: { min: 0 },
          module: "FREE_TRAINING",
        }),
        parameter("training.cancelThresholdMinutes", "training", "duration", 120, {
          constraints: { before: true, min: 0, step: 5 },
          module: "FREE_TRAINING",
        }),
        parameter("training.slotMinutes", "training", "duration", 30, {
          constraints: { min: 5, step: 5 },
          module: "FREE_TRAINING",
        }),
        parameter("training.capacityPerRingSlot", "training", "int", 1, {
          constraints: { min: 1 },
          module: "FREE_TRAINING",
        }),
      ],
      title: "admin-settings:block.training.title",
    },
    {
      key: "waitlist",
      rows: [
        parameter("waitlist.notifyThresholdMinutes", "waitlist", "duration", 30, {
          constraints: { before: true, min: 0, step: 5 },
          module: "WAITLIST",
        }),
        parameter("waitlist.maxPerClass", "waitlist", "int", 3, {
          constraints: { min: 0 },
          module: "WAITLIST",
        }),
        parameter("waitlist.maxPerDogPerWeek", "waitlist", "int", 2, {
          constraints: { min: 0 },
          module: "WAITLIST",
        }),
        parameter("waitlist.maxPerDogPerWeekIfAttended", "waitlist", "int", 1, {
          constraints: { min: 0 },
          module: "WAITLIST",
        }),
        parameter("waitlist.mode", "waitlist", "enum", "ALL_AT_ONCE", {
          constraints: { values: ["ALL_AT_ONCE", "FIFO"] },
          module: "WAITLIST",
        }),
      ],
      title: "admin-settings:block.waitlist.title",
    },
    {
      key: "billing",
      rows: [
        parameter(
          "billing.entryFeePerDog",
          "billing",
          "money",
          { amountMinor: 10000, currency: "EUR" },
          { module: "BILLING" },
        ),
        parameter(
          "billing.inactivityFeeFirstMonth",
          "billing",
          "money",
          { amountMinor: 2000, currency: "EUR" },
          { module: "BILLING" },
        ),
        parameter(
          "billing.inactivityFeeFollowingMonths",
          "billing",
          "money",
          { amountMinor: 1000, currency: "EUR" },
          { module: "BILLING" },
        ),
        parameter("billing.cashInvoicing", "billing", "enum", "SEMESTER", {
          constraints: { values: ["MONTHLY", "SEMESTER"] },
          module: "BILLING",
        }),
        parameter("billing.invoiceSeriesPattern", "billing", "string", "{YYYY}", {
          module: "BILLING",
        }),
      ],
      title: "admin-settings:block.billing.title",
    },
    {
      key: "club",
      rows: [
        parameter("club.openingHours", "club", "json", {
          FRIDAY: { close: "22:00", open: "07:00" },
          MONDAY: { close: "22:00", open: "07:00" },
          SATURDAY: { close: "22:00", open: "07:00" },
          SUNDAY: { close: "22:00", open: "07:00" },
          THURSDAY: { close: "22:00", open: "07:00" },
          TUESDAY: { close: "22:00", open: "07:00" },
          WEDNESDAY: { close: "22:00", open: "07:00" },
        }),
        parameter("club.holidays", "club", "list", []),
        parameter("census.bookingBlockReasons", "club", "list", [
          {
            key: "UNPAID_INVOICE",
            label: { ca: "Rebut impagat", en: "Unpaid receipt", es: "Recibo impagado" },
          },
          {
            key: "PENDING_DOCUMENT",
            label: { ca: "Cartilla pendent", en: "Pending record", es: "Cartilla pendiente" },
          },
          {
            key: "CLUB_DECISION",
            label: { ca: "Decisió del club", en: "Club decision", es: "Decisión del club" },
          },
        ]),
        parameter(
          "activities.publicUrlTemplate",
          "club",
          "string",
          "{websiteUrl}/activitat/{slug}",
          { module: "ACTIVITIES" },
        ),
      ],
      title: "admin-settings:block.club.title",
    },
    {
      key: "messaging",
      rows: [
        parameter("messaging.noShowNoticeTime", "messaging", "time", "08:00"),
        parameter(
          "messaging.reminderOptionsMinutes",
          "messaging",
          "list",
          [60, 120, 240, 360, 720, 1440],
        ),
        parameter("messaging.notifyWeekOpening", "messaging", "bool", false),
        parameter("messaging.notifyNewRingSetup", "messaging", "bool", false, {
          module: "COURSES",
        }),
        parameter("messaging.sms.monthlyCap", "messaging", "int", 1000, {
          constraints: { min: 0 },
          module: "SMS",
        }),
      ],
      title: "admin-settings:block.messaging.title",
    },
    {
      key: "signup",
      rows: [
        parameter("signup.enabled", "signup", "bool", true),
        parameter("signup.pendingExpiryDays", "signup", "int", 30, {
          constraints: { min: 1 },
        }),
        parameter("signup.requireDogDocumentAtSignup", "signup", "bool", false),
        parameter("signup.text.imageConsent", "signup", "localizedText", {
          ca: "Autoritzo la publicació d'imatges dins les activitats del club.",
          en: "I authorize images to be published as part of club activities.",
          es: "Autorizo la publicación de imágenes en las actividades del club.",
        }),
        // Api E5-T20: the core sends both here, in «Alta i consentiments» (CATALEG_PARAMETRES).
        parameter("signup.onboardingFields", "signup", "json", [
          { key: "name", required: true },
          { key: "locale", required: true },
          { key: "phone", required: false },
        ]),
        parameter("legal.maxPostpones", "signup", "int", 3),
      ],
      title: "admin-settings:block.signup.title",
    },
    {
      key: "courses",
      rows: [
        parameter("courses.setupAutoExpireDays", "courses", "int", 7, {
          constraints: { min: 1 },
          module: "COURSES",
        }),
        parameter("courses.placementMarginMeters", "courses", "decimal", 1.5, {
          constraints: { min: 0, step: 0.1 },
          module: "COURSES",
        }),
        parameter("courses.showSetupToMembers", "courses", "bool", true, {
          module: "COURSES",
        }),
        parameter("courses.allowInstructorPublish", "courses", "bool", true, {
          module: "COURSES",
        }),
      ],
      title: "admin-settings:block.courses.title",
    },
    {
      key: "privacy",
      rows: [
        parameter("audit.retentionYears", "privacy", "int", 6, {
          constraints: { min: 1 },
        }),
        parameter("rgpd.retentionYearsAfterLeave", "privacy", "int", 6, {
          constraints: { min: 1 },
        }),
        parameter("rgpd.erasureMinDaysAfterLeave", "privacy", "int", 30, {
          constraints: { min: 0 },
        }),
      ],
      title: "admin-settings:block.privacy.title",
    },
    {
      // S15 §9, as the published core sends it: one switch per process, then the daily time.
      key: "jobs",
      rows: [
        parameter("jobs.weekOpening.enabled", "jobs", "bool", true),
        parameter("jobs.riskReview.enabled", "jobs", "bool", true),
        parameter("jobs.noShowNotices.enabled", "jobs", "bool", true),
        parameter("jobs.reminders.enabled", "jobs", "bool", true),
        parameter("jobs.expirations.enabled", "jobs", "bool", true),
        parameter("jobs.waitlistFifo.enabled", "jobs", "bool", true),
        parameter("jobs.paymentTimeouts.enabled", "jobs", "bool", true),
        parameter("jobs.classFinishing.enabled", "jobs", "bool", true),
        parameter("jobs.cleanup.enabled", "jobs", "bool", true),
        parameter("jobs.billingReminder.enabled", "jobs", "bool", true),
        parameter("jobs.dailyTime", "jobs", "time", "06:00"),
        parameter("jobs.alertAdminsOnFailure", "jobs", "bool", true),
      ],
      title: "admin-settings:block.jobs.title",
    },
  ],
  lastChange: { action: "bookings.lateCancelThresholdMinutes", actorName: "Jordi", at: changedAt },
};

export const settingsState: { parameters: Parameters } = {
  parameters: structuredClone(initialParameters),
};

export function findParameter(key: string): Parameter | undefined {
  return settingsState.parameters.blocks
    .flatMap((block) => block.rows)
    .find((item) => item.key === key);
}

export function replaceParameter(next: Parameter): void {
  for (const block of settingsState.parameters.blocks) {
    const index = block.rows.findIndex((item) => item.key === next.key);
    if (index >= 0) {
      block.rows[index] = next;
      if (next.lastChange === undefined) {
        delete settingsState.parameters.lastChange;
      } else {
        settingsState.parameters.lastChange = next.lastChange;
      }
      return;
    }
  }
}

export function resetSettingsState(): void {
  settingsState.parameters = structuredClone(initialParameters);
}
