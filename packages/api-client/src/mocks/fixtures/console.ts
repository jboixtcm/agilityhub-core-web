import type { components } from "../../generated/schema";

import brandingCanic from "./branding-canic.json";
import brandingMinim from "./branding-minim.json";

export type PlatformClub = components["schemas"]["PlatformClub"];
export type PlatformAdmin = components["schemas"]["PlatformAdmin"];
export type PlatformClubTemplate = components["schemas"]["PlatformClubTemplate"];
export type ParameterDefinition = components["schemas"]["ParameterDefinition"];
export type PlatformJobsOverview = components["schemas"]["PlatformJobsOverview"];
export type AuditEntryListItem = components["schemas"]["AuditEntryListItem"];
type Theme = components["schemas"]["Theme"];
type OnboardingChecklist = components["schemas"]["OnboardingChecklist"];
type ProviderSummary = components["schemas"]["PlatformProviderSummary"];

/**
 * S17 D19 (E10-W01): the console's world. Thursday 15 October 2026, 11:00 in Madrid. Fictional
 * clubs and people only; the themes are the branding fixtures' (no literal colour in code).
 */
export const CONSOLE_MOCK_NOW = "2026-10-15T09:00:00Z";
export const CONSOLE_MONTH = "2026-10";

export const CONSOLE_CLUB_IDS = {
  canic: "50000000-0000-4000-8000-000000000001",
  minim: "50000000-0000-4000-8000-000000000002",
  riera: "50000000-0000-4000-8000-000000000003",
  template: "50000000-0000-4000-8000-000000000004",
} as const;

/** The console's own account (`me` of the `platform` scenario), the only platform admin. */
export const CONSOLE_PLATFORM_ACCOUNT_ID = "10000000-0000-4000-8000-0000000000a1";

const canicTheme = brandingCanic.theme as Theme;
const minimTheme = brandingMinim.theme as Theme;
/** The colours a definition leaves out (it requires four of the twelve). */
export const consoleFallbackColors: Theme["colors"] = minimTheme.colors;

const unconfigured: ProviderSummary = {
  accountIdMasked: null,
  configured: false,
  creditorId: null,
  creditorName: null,
  enabled: false,
  ibanMasked: null,
  instructions: null,
  last4: null,
  lastTestAt: null,
  masked: null,
  mode: null,
  suffix: null,
};

const allDone: OnboardingChecklist = {
  branding: true,
  dns: true,
  faq: true,
  firstAdmin: true,
  legal: true,
  sepa: true,
  templates: true,
};

function club(overrides: Partial<PlatformClub> & Pick<PlatformClub, "id" | "name" | "slug">) {
  const base: PlatformClub = {
    address: null,
    contactEmail: null,
    contactPhone: null,
    countryProfile: "ES",
    createdAt: "2026-09-01T08:00:00Z",
    currency: "EUR",
    defaultLocale: "ca",
    displayCity: null,
    domains: [],
    id: overrides.id,
    legal: null,
    legalName: null,
    locales: ["ca", "es"],
    modules: ["WAITLIST", "FAQ", "PUSH"],
    name: overrides.name,
    notes: null,
    onboardingChecklist: allDone,
    paymentProviders: {
      MANUAL: unconfigured,
      SEPA_XML: unconfigured,
      STRIPE: unconfigured,
    },
    slug: overrides.slug,
    status: "ONBOARDING",
    taxId: null,
    template: false,
    theme: minimTheme,
    timeZone: "Europe/Madrid",
    updatedAt: "2026-10-01T08:00:00Z",
    usage: { membersActive: 0, month: CONSOLE_MONTH, smsSentMonth: 0, storageBytes: 0 },
    version: 1,
    websiteUrl: null,
  };
  return { ...base, ...overrides };
}

function initialClubs(): PlatformClub[] {
  return [
    club({
      address: {
        city: brandingCanic.club.legalAddress.city,
        country: "ES",
        postalCode: brandingCanic.club.legalAddress.postalCode,
        region: "Barcelona",
        street: brandingCanic.club.legalAddress.street,
      },
      contactEmail: "info@canic.example.test",
      contactPhone: "+34 600 000 101",
      displayCity: brandingCanic.club.city,
      domains: [
        { app: "clubs", host: "app.example.test", primary: true, status: "VERIFIED" },
        { app: "clubs-admin", host: "admin.example.test", primary: false, status: "VERIFIED" },
      ],
      id: CONSOLE_CLUB_IDS.canic,
      legal: {
        imageConsentText: { ca: "Autoritzo l'ús d'imatges del meu gos a les xarxes del club." },
        legalTextsVersion: "2026-09-01",
        privacyPolicyUrl: "https://canic.example.test/privacitat",
      },
      legalName: brandingCanic.club.legalName,
      modules: [...brandingCanic.modules] as PlatformClub["modules"],
      name: brandingCanic.club.name,
      notes: "Club pilot.",
      paymentProviders: {
        MANUAL: {
          ...unconfigured,
          configured: true,
          enabled: true,
          instructions: { ca: "Paga en efectiu a la secretaria del club." },
        },
        SEPA_XML: {
          ...unconfigured,
          configured: true,
          creditorId: "ES12000G00000000",
          creditorName: brandingCanic.club.legalName,
          enabled: true,
          ibanMasked: "ES·· ···· ···· ···· ···· 4821",
          masked: "ES·· ···· ···· ···· ···· 4821",
          suffix: "000",
        },
        STRIPE: unconfigured,
      },
      slug: brandingCanic.club.slug,
      status: "ACTIVE",
      taxId: brandingCanic.club.taxId,
      theme: canicTheme,
      usage: {
        membersActive: 168,
        month: CONSOLE_MONTH,
        smsSentMonth: 312,
        storageBytes: 1_288_490_189,
      },
      version: 7,
      websiteUrl: "https://canic.example.test",
    }),
    club({
      contactEmail: "hola@minim.example.test",
      domains: [{ app: "clubs", host: "minim.example.test", primary: true, status: "PENDING" }],
      id: CONSOLE_CLUB_IDS.minim,
      locales: ["ca", "es", "en"],
      name: brandingMinim.club.name,
      onboardingChecklist: { ...allDone, dns: false, faq: false },
      slug: brandingMinim.club.slug,
      usage: { membersActive: 12, month: CONSOLE_MONTH, smsSentMonth: 0, storageBytes: 5_242_880 },
      version: 3,
    }),
    club({
      countryProfile: "GENERIC",
      currency: "EUR",
      id: CONSOLE_CLUB_IDS.riera,
      modules: ["FREE_TRAINING", "BILLING", "PACKS", "WAITLIST", "FAQ", "PUSH"],
      name: "Club Agility Riera",
      onboardingChecklist: { ...allDone, branding: false, sepa: false, templates: false },
      slug: "riera",
      status: "SUSPENDED",
      timeZone: "Atlantic/Canary",
      usage: {
        membersActive: 41,
        month: CONSOLE_MONTH,
        smsSentMonth: 18,
        storageBytes: 73_400_320,
      },
      version: 12,
    }),
    club({
      id: CONSOLE_CLUB_IDS.template,
      locales: ["ca", "es", "en"],
      modules: ["WAITLIST", "FAQ", "PUSH"],
      name: "Plantilla AgilityHub",
      onboardingChecklist: { ...allDone, dns: false, firstAdmin: false, sepa: false },
      slug: "club-template-default",
      template: true,
      version: 2,
    }),
  ];
}

function initialAdmins(): Record<string, PlatformAdmin[]> {
  return {
    [CONSOLE_CLUB_IDS.canic]: [
      {
        accountId: "10000000-0000-4000-8000-000000000001",
        email: "aina.serra@example.test",
        lastAccessAt: "2026-10-15T07:42:00Z",
        membershipStatus: "ACTIVE",
        name: "Aina Serra",
      },
      {
        accountId: "10000000-0000-4000-8000-000000000002",
        email: "jordi.soler@example.test",
        lastAccessAt: "2026-10-13T16:05:00Z",
        membershipStatus: "ACTIVE",
        name: "Jordi Soler",
      },
    ],
    [CONSOLE_CLUB_IDS.minim]: [
      {
        accountId: "10000000-0000-4000-8000-000000000031",
        email: "marta.pons@example.test",
        lastAccessAt: null,
        membershipStatus: "ACTIVE",
        name: "Marta Pons",
      },
    ],
    [CONSOLE_CLUB_IDS.riera]: [
      {
        accountId: "10000000-0000-4000-8000-000000000041",
        email: "pere.vila@example.test",
        lastAccessAt: "2026-09-02T10:00:00Z",
        membershipStatus: "ACTIVE",
        name: "Pere Vila",
      },
    ],
    [CONSOLE_CLUB_IDS.template]: [],
  };
}

/** The S02 catalog the console reads (`GET /platform/parameter-catalog`): `sistema` and two club keys. */
export const consoleParameterCatalog: ParameterDefinition[] = [
  definition("auth.sessionDays", "system", "int", 30, "PLATFORM", { min: 1, max: 365 }),
  definition("auth.magicLinkMinutes", "system", "int", 15, "PLATFORM", { min: 5, max: 120 }),
  definition("auth.impersonationMinutes", "system", "int", 60, "PLATFORM", { min: 5, max: 240 }),
  definition("auth.passwordMinLength", "system", "int", 8, "PLATFORM", { min: 8, max: 64 }),
  definition("bookings.lateCancelThresholdMinutes", "bookings", "duration", 120, "CLUB", {
    min: 0,
  }),
  definition("signup.enabled", "signup", "bool", true, "CLUB", {}),
];

function definition(
  key: string,
  block: string,
  type: string,
  value: unknown,
  editableBy: "CLUB" | "PLATFORM",
  constraints: Record<string, unknown>,
): ParameterDefinition {
  return {
    block,
    constraints,
    default: value,
    editableBy,
    help: key,
    key,
    label: key,
    modules: [],
    restartRequired: false,
    scope: "club",
    type,
  };
}

function initialJobs(): PlatformJobsOverview {
  const run = (
    status: "FAILED" | "PARTIAL" | "SUCCEEDED",
    finishedAt: string,
    counters: Record<string, number>,
  ) => ({
    counters,
    dryRun: false,
    finishedAt,
    runId: `run-${finishedAt}`,
    status,
    trigger: "SCHEDULE" as const,
  });
  return {
    clubs: [
      {
        clubId: CONSOLE_CLUB_IDS.canic,
        jobs: [
          {
            enabled: true,
            health: "OK",
            lastRun: run("SUCCEEDED", "2026-10-11T18:00:04Z", { opened: 1 }),
            name: "week-opening",
          },
          {
            enabled: true,
            health: "WARN",
            lastRun: run("PARTIAL", "2026-10-15T05:30:12Z", { reviewed: 14, atRisk: 2 }),
            name: "risk-review",
          },
          { enabled: false, health: "ALERT", lastRun: null, name: "reminders" },
        ],
        name: brandingCanic.club.name,
        timeZone: "Europe/Madrid",
      },
      {
        clubId: CONSOLE_CLUB_IDS.minim,
        jobs: [
          {
            enabled: true,
            health: "OK",
            lastRun: run("SUCCEEDED", "2026-10-15T02:00:00Z", {}),
            name: "cleanup",
          },
        ],
        name: brandingMinim.club.name,
        timeZone: "Europe/Madrid",
      },
    ],
  };
}

function initialAudit(): AuditEntryListItem[] {
  return [
    {
      action: "CLUB_STATUS_CHANGED",
      actorName: "Pol Ferrer",
      actorRole: "PLATFORM",
      at: "2026-10-02T09:12:00Z",
      changes: [{ after: "ACTIVE", before: "ONBOARDING", path: "status" }],
      clubId: CONSOLE_CLUB_IDS.canic,
      entityLabel: brandingCanic.club.name,
      entityType: "Club",
      id: "a0000000-0000-4000-8000-000000000001",
      origin: "BACKOFFICE",
    },
    {
      action: "CLUB_MODULES_CHANGED",
      actorName: "Pol Ferrer",
      actorRole: "PLATFORM",
      at: "2026-09-20T15:40:00Z",
      changes: [{ after: true, before: false, path: "modules.COURSES" }],
      clubId: CONSOLE_CLUB_IDS.canic,
      entityLabel: brandingCanic.club.name,
      entityType: "Club",
      id: "a0000000-0000-4000-8000-000000000002",
      origin: "BACKOFFICE",
    },
    {
      action: "CLUB_CREATED",
      actorName: "Pol Ferrer",
      actorRole: "PLATFORM",
      at: "2026-09-01T08:00:00Z",
      changes: [],
      clubId: CONSOLE_CLUB_IDS.minim,
      entityLabel: brandingMinim.club.name,
      entityType: "Club",
      id: "a0000000-0000-4000-8000-000000000003",
      origin: "BACKOFFICE",
    },
  ];
}

export interface ConsoleState {
  admins: Record<string, PlatformAdmin[]>;
  /**
   * The parameters the console wrote, by club and key (a key never written is the catalog's
   * default at version 0): `PUT /platform/clubs/{id}/parameters/{key}` answers the `Parameter`.
   */
  parameters: Record<string, Record<string, components["schemas"]["Parameter"]>>;
  audit: AuditEntryListItem[];
  /** Catalog parts each club already has (R-17-08: a clone only fills empty parts). */
  catalogParts: Record<string, string[]>;
  clubs: PlatformClub[];
  jobs: PlatformJobsOverview;
  platformRoles: Record<string, string[]>;
  /** File keys the upload route granted, by club (a theme only publishes its own club's). */
  uploads: Record<string, string[]>;
}

function initialState(): ConsoleState {
  return {
    admins: initialAdmins(),
    audit: initialAudit(),
    catalogParts: {
      [CONSOLE_CLUB_IDS.canic]: ["LEVELS", "RINGS", "PLANS", "FAQ", "MESSAGE_TEMPLATES"],
      [CONSOLE_CLUB_IDS.minim]: ["FAQ"],
      [CONSOLE_CLUB_IDS.riera]: ["LEVELS", "RINGS", "PLANS"],
      [CONSOLE_CLUB_IDS.template]: ["LEVELS", "RINGS", "PLANS", "FAQ", "MESSAGE_TEMPLATES"],
    },
    clubs: initialClubs(),
    jobs: initialJobs(),
    parameters: {},
    platformRoles: { [CONSOLE_PLATFORM_ACCOUNT_ID]: ["AGILITYHUB_ADMIN"] },
    uploads: {},
  };
}

export const consoleState: ConsoleState = initialState();

export function resetConsoleState(): void {
  Object.assign(consoleState, initialState());
}

export function clubTemplates(): PlatformClubTemplate[] {
  return consoleState.clubs
    .filter((candidate) => candidate.template)
    .map((candidate) => ({
      currency: candidate.currency,
      id: candidate.id,
      locales: candidate.locales,
      name: candidate.name,
    }));
}
