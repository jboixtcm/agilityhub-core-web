import { http, HttpResponse } from "msw";

import type { components } from "../generated/schema";

import {
  CONSOLE_CLUB_IDS,
  CONSOLE_MOCK_NOW,
  CONSOLE_MONTH,
  CONSOLE_PLATFORM_ACCOUNT_ID,
  clubTemplates,
  consoleFallbackColors,
  consoleParameterCatalog,
  consoleState,
  DOMAIN_CNAME_TARGETS,
  domainChallenge,
  parameterRow,
  resetConsoleState,
  type PlatformClub,
} from "./fixtures/console";
import { fieldsProjection } from "./list-fields";
import { apiError } from "./planning-handlers";
import { currentMockScenario } from "./scenarios";

type ClubDefinition = components["schemas"]["ClubDefinition"];
type PlatformClubPatch = components["schemas"]["PlatformClubPatch"];
type PlatformClubListItem = components["schemas"]["PlatformClubListItem"];
type PlatformModulesRequest = components["schemas"]["PlatformModulesRequest"];
type PlatformThemeRequest = components["schemas"]["PlatformThemeRequest"];
type PlatformProviderRequest = components["schemas"]["PlatformProviderRequest"];
type ProviderSummary = components["schemas"]["PlatformProviderSummary"];
type CatalogCloneRequest = components["schemas"]["CatalogCloneRequest"];
type CatalogCloneResult = components["schemas"]["CatalogCloneResult"];
type PlatformAdminRequest = components["schemas"]["PlatformAdminRequest"];
type PlatformRoles = components["schemas"]["PlatformRoles"];
type StatusRequest = components["schemas"]["PlatformClubStatusRequest"];
type JobRun = components["schemas"]["JobRun"];
type ClubModule = PlatformClub["modules"][number];
type Filter = components["schemas"]["Filter"];
type PlatformDomain = PlatformClub["domains"][number];
type AuditEntryListItem = components["schemas"]["AuditEntryListItem"];

/**
 * S17 R-17-10 (E10-W03): the support access token the mock grants, and the `/me` it opens. The
 * expiry follows the real clock (the support tab compares it with the browser's), 60 minutes as
 * `platform.supportAccessMinutes`.
 */
export const MOCK_SUPPORT_TOKEN = "mock-support-token";
export const SUPPORT_ACCESS_MINUTES = 60;
/** The live grant and an ended one of the `adminSupportAccess` audit (fictional ids). */
export const MOCK_SUPPORT_GRANTS = {
  ended: "70000000-0000-4000-8000-000000000002",
  live: "70000000-0000-4000-8000-000000000001",
} as const;

export function supportExpiry(from = Date.now()): string {
  return new Date(from + SUPPORT_ACCESS_MINUTES * 60_000).toISOString();
}

export function isSupportToken(request: Request): boolean {
  return request.headers.get("Authorization") === `Bearer ${MOCK_SUPPORT_TOKEN}`;
}

/**
 * The club audit's support entries (`SUPPORT_ACCESS_STARTED {reason, details.expiresAt}` and
 * `SUPPORT_ACCESS_ENDED`, entity = the grant), as the api writes them: one access still alive, one
 * the club already ended, and the end of every grant ended meanwhile.
 */
export function supportAuditEntries(now = Date.now()): AuditEntryListItem[] {
  const entry = (
    id: string,
    action: "SUPPORT_ACCESS_ENDED" | "SUPPORT_ACCESS_STARTED",
    grant: string,
    at: number,
    extra: Partial<AuditEntryListItem>,
  ): AuditEntryListItem => ({
    action,
    actorName: "Pol Ferrer",
    actorRole: action === "SUPPORT_ACCESS_STARTED" ? "PLATFORM" : "ADMIN",
    at: new Date(at).toISOString(),
    changes: [],
    clubId: CONSOLE_CLUB_IDS.canic,
    entityId: grant,
    entityLabel: "Pol Ferrer",
    entityType: "ImpersonationGrant",
    id,
    origin: action === "SUPPORT_ACCESS_STARTED" ? "PLATFORM_SUPPORT" : "BACKOFFICE",
    ...extra,
  });
  const liveStart = now - 10 * 60_000;
  const endedStart = now - 3 * 24 * 60 * 60_000;
  const entries = [
    entry(
      "a1000000-0000-4000-8000-000000000001",
      "SUPPORT_ACCESS_STARTED",
      MOCK_SUPPORT_GRANTS.live,
      liveStart,
      {
        details: { expiresAt: supportExpiry(liveStart) },
        reason: "Revisar la configuració de la remesa",
      },
    ),
    entry(
      "a1000000-0000-4000-8000-000000000002",
      "SUPPORT_ACCESS_STARTED",
      MOCK_SUPPORT_GRANTS.ended,
      endedStart,
      {
        details: { expiresAt: supportExpiry(endedStart) },
        reason: "Alta del primer administrador",
      },
    ),
    entry(
      "a1000000-0000-4000-8000-000000000003",
      "SUPPORT_ACCESS_ENDED",
      MOCK_SUPPORT_GRANTS.ended,
      endedStart + 20 * 60_000,
      {
        actorName: "Aina Serra",
        details: { actorAccountId: CONSOLE_PLATFORM_ACCOUNT_ID },
      },
    ),
  ];
  for (const grant of consoleState.supportEnded) {
    if (grant === MOCK_SUPPORT_GRANTS.ended) continue;
    entries.unshift(
      entry(`a1000000-0000-4000-8000-${grant.slice(-12)}`, "SUPPORT_ACCESS_ENDED", grant, now, {
        actorName: "Aina Serra",
        details: { actorAccountId: CONSOLE_PLATFORM_ACCOUNT_ID },
      }),
    );
  }
  return entries;
}

/** `x-fields` of `GET /platform/clubs` in the adopted snapshot (E10-T01). */
const PLATFORM_CLUB_FIELDS = [
  "id",
  "name",
  "slug",
  "status",
  "countryProfile",
  "timeZone",
  "modules",
  "template",
  "lastAdminAccessAt",
  "usage",
  "onboardingChecklist",
] as const;
const FILTERABLE = ["status", "countryProfile", "module", "template"];
const SORTABLE = ["name", "slug"];
const PAGE_SIZES = [20, 50, 200, 1000];

/** CATALEG_MODULS «Depèn de» (R-17-04), as the api validates it. */
const DEPENDENCIES: Partial<Record<ClubModule, ClubModule>> = {
  PACKS: "BILLING",
  SINGLE_CLASS: "BILLING",
  SOCIAL_LEAGUE: "STATS",
};
const ALL_MODULES: ClubModule[] = [
  "FREE_TRAINING",
  "BILLING",
  "PACKS",
  "SINGLE_CLASS",
  "ACTIVITIES",
  "FAMILY_GROUP",
  "WAITLIST",
  "TASKS",
  "FAQ",
  "SMS",
  "PUSH",
  "INACTIVITY",
  "COURSES",
  "LEARN_LINK",
  "STATS",
  "SOCIAL_LEAGUE",
];
const PRESETS: Record<"CANIC" | "COMPLET" | "MINIM", ClubModule[]> = {
  CANIC: ALL_MODULES.filter(
    (module) => !["SINGLE_CLASS", "STATS", "SOCIAL_LEAGUE"].includes(module),
  ),
  COMPLET: ALL_MODULES.filter((module) => !["STATS", "SOCIAL_LEAGUE"].includes(module)),
  MINIM: ["WAITLIST", "FAQ", "PUSH"],
};
/** The clubs with future classes: a time-zone change is `422 TIMEZONE_CHANGE_BLOCKED` (S02). */
const CLUBS_WITH_FUTURE_CLASSES: readonly string[] = [CONSOLE_CLUB_IDS.canic];
/** The members paying by direct debit: retiring their provider is `409 PROVIDER_IN_USE`. */
const PROVIDER_USERS: Readonly<Record<string, Partial<Record<string, number>>>> = {
  [CONSOLE_CLUB_IDS.canic]: { SEPA_XML: 164 },
};
const CATALOG_COUNTS: Record<string, number> = {
  FAQ: 6,
  LEVELS: 9,
  MESSAGE_TEMPLATES: 21,
  PLANS: 4,
  RINGS: 5,
};

/** The stored Stripe secrets, write-only: never in any answer (R-17-05). */
const stripeSecrets = new Map<string, string>();

/** Resets the console world (tests call it between cases, like the other mock states). */
export function resetConsoleMockState(): void {
  resetConsoleState();
  stripeSecrets.clear();
}

function now(): string {
  return CONSOLE_MOCK_NOW;
}

/** `/platform/*`: an `AGILITYHUB_ADMIN` account, never an impersonation (S17 §6, R-17-12). */
function refused(): Response | undefined {
  const me = currentMockScenario().me;
  if (me.impersonation !== undefined) {
    return apiError("IMPERSONATION_DENIED", "Impersonation cannot use the platform", 403);
  }
  if (!me.account.platformRoles.includes("AGILITYHUB_ADMIN")) {
    return apiError("FORBIDDEN", "Platform role required", 403);
  }
  return undefined;
}

function findClub(id: unknown): PlatformClub | undefined {
  return consoleState.clubs.find((candidate) => candidate.id === id);
}

function clubNotFound() {
  return apiError("CLUB_NOT_FOUND", "Club not found", 404);
}

function stale() {
  return apiError("STALE_VERSION", "The club changed meanwhile", 409);
}

function fieldError(field: string, code: "INVALID_VALUE" | "REQUIRED" = "INVALID_VALUE") {
  return apiError("VALIDATION_ERROR", "Validation failed", 400, {
    fieldErrors: [{ code, field }],
  });
}

/** R-17-06, computed on every read: the parts that follow the club's own configuration. */
function withChecklist(club: PlatformClub): PlatformClub {
  const billing = club.modules.includes("BILLING");
  const anyProvider = Object.values(club.paymentProviders).some((provider) => provider.configured);
  return {
    ...club,
    onboardingChecklist: {
      ...club.onboardingChecklist,
      dns: club.domains.length > 0 && club.domains.every((domain) => domain.status === "VERIFIED"),
      legal: (club.legal?.privacyPolicyUrl ?? "") !== "",
      sepa: !billing || anyProvider,
    },
  };
}

function touch(club: PlatformClub, changes: Partial<PlatformClub>): PlatformClub {
  const next = withChecklist({
    ...club,
    ...changes,
    updatedAt: now(),
    version: club.version + 1,
  });
  consoleState.clubs = consoleState.clubs.map((candidate) =>
    candidate.id === club.id ? next : candidate,
  );
  return next;
}

function listItem(club: PlatformClub): PlatformClubListItem {
  const admins = consoleState.admins[club.id] ?? [];
  const lastAccess = admins
    .map((admin) => admin.lastAccessAt)
    .filter((value): value is string => typeof value === "string")
    .sort()
    .at(-1);
  const current = withChecklist(club);
  return {
    countryProfile: current.countryProfile,
    id: current.id,
    lastAdminAccessAt: lastAccess ?? null,
    modules: current.modules,
    name: current.name,
    onboardingChecklist: current.onboardingChecklist,
    slug: current.slug,
    status: current.status,
    template: current.template,
    timeZone: current.timeZone,
    usage: current.usage,
  };
}

function parseFilter(raw: string): Filter | undefined {
  const [field, op, ...rest] = raw.split(":");
  const value = rest.join(":");
  if (field === undefined || op === undefined || !FILTERABLE.includes(field)) return undefined;
  if (!["eq", "ne", "in", "nin"].includes(op) || value === "") return undefined;
  const values = value.split(",");
  return {
    field,
    op: op as Filter["op"],
    value: op === "in" || op === "nin" ? values : value,
  };
}

function matches(item: PlatformClubListItem, filter: Filter): boolean {
  const values = Array.isArray(filter.value) ? (filter.value as string[]) : [String(filter.value)];
  const own: string[] =
    filter.field === "module"
      ? (item.modules ?? [])
      : filter.field === "template"
        ? [String(item.template)]
        : [String(item[filter.field as "countryProfile" | "status"])];
  const hit = values.some((value) => own.includes(value));
  return filter.op === "ne" || filter.op === "nin" ? !hit : hit;
}

function luminance(color: string): number {
  const hex = /^#([\da-f]{6})$/iu.exec(color)?.[1];
  if (hex === undefined) return 0;
  const [red = 0, green = 0, blue = 0] = [0, 2, 4].map((offset) => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

const CONTRAST_PAIRS = [
  ["onPrimary", "primary"],
  ["text", "background"],
  ["text", "surface"],
] as const;

function providerSummary(
  provider: string,
  body: PlatformProviderRequest,
  previous: ProviderSummary,
): ProviderSummary {
  const enabled = body.enabled ?? true;
  if (provider === "SEPA_XML") {
    const iban = body.iban?.replaceAll(" ", "");
    const masked =
      iban === undefined
        ? previous.ibanMasked
        : `${iban.slice(0, 2)}·· ···· ···· ···· ···· ${iban.slice(-4)}`;
    return {
      ...previous,
      configured: true,
      creditorId: body.creditorId ?? null,
      creditorName: body.creditorName ?? null,
      enabled,
      ibanMasked: masked ?? null,
      masked: masked ?? null,
      suffix: body.suffix ?? null,
    };
  }
  if (provider === "STRIPE") {
    return {
      ...previous,
      configured: true,
      enabled,
      last4: body.publishableKey?.slice(-4) ?? null,
      masked: body.publishableKey === undefined ? null : `pk_····${body.publishableKey.slice(-4)}`,
      mode: body.mode ?? null,
    };
  }
  return { ...previous, configured: true, enabled, instructions: body.instructions ?? null };
}

/**
 * A SEPA creditor identifier (`CCkkBBBnnn…`) whose check digits `kk` are the ISO 7064 mod 97-10 of
 * the national id followed by the country code and `00` (letters as 10–35; the business code `BBB`
 * is left out), as the api validates it (E147): `ES10ZZZG00000000` passes, `ES00ZZZG00000000` not.
 */
export function canonicalCreditorId(value: string): boolean {
  const id = value.replaceAll(" ", "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{3}[A-Z0-9]{1,28}$/u.test(id)) return false;
  const digits = `${id.slice(7)}${id.slice(0, 2)}00`
    .split("")
    .map((char) => String(Number.parseInt(char, 36)))
    .join("");
  let rest = 0;
  for (const digit of digits) rest = (rest * 10 + Number(digit)) % 97;
  return String(98 - rest).padStart(2, "0") === id.slice(2, 4);
}

function providerInvalid(field: string) {
  return apiError("PROVIDER_CONFIG_INVALID", "Provider configuration is invalid", 422, { field });
}

function definitionErrors(
  body: ClubDefinition,
): { code: "INVALID_VALUE" | "REQUIRED"; field: string }[] {
  const errors: { code: "INVALID_VALUE" | "REQUIRED"; field: string }[] = [];
  const required = (field: string, value: unknown) => {
    if (value === undefined || value === null || value === "")
      errors.push({ code: "REQUIRED", field });
  };
  required("club.name", body.club.name.trim());
  required("club.slug", body.club.slug);
  required("club.timeZone", body.club.timeZone);
  if (body.club.slug !== "" && !/^[a-z0-9-]{3,40}$/u.test(body.club.slug)) {
    errors.push({ code: "INVALID_VALUE", field: "club.slug" });
  }
  if (!/^[A-Z]{3}$/u.test(body.club.currency)) {
    errors.push({ code: "INVALID_VALUE", field: "club.currency" });
  }
  if (body.club.locales.length === 0) errors.push({ code: "REQUIRED", field: "club.locales" });
  if (!body.club.locales.includes(body.club.defaultLocale)) {
    errors.push({ code: "INVALID_VALUE", field: "club.defaultLocale" });
  }
  if (
    body.club.contactEmail !== undefined &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(body.club.contactEmail)
  ) {
    errors.push({ code: "INVALID_VALUE", field: "club.contactEmail" });
  }
  (body.admins ?? []).forEach((admin, index) => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(admin.email)) {
      errors.push({ code: "INVALID_VALUE", field: `admins[${String(index)}].email` });
    }
    if (admin.name.trim() === "")
      errors.push({ code: "REQUIRED", field: `admins[${String(index)}].name` });
  });
  if ((body.preset === undefined) === (body.modules === undefined)) {
    errors.push({ code: "REQUIRED", field: "modules" });
  }
  if (!/^\d+(\.\d+)?px$/u.test(body.theme.radius)) {
    errors.push({ code: "INVALID_VALUE", field: "theme.radius" });
  }
  return errors;
}

function dependencyError(modules: readonly ClubModule[]): Response | undefined {
  for (const module of modules) {
    const requires = DEPENDENCIES[module];
    if (requires !== undefined && !modules.includes(requires)) {
      return apiError("MODULE_DEPENDENCY", "Module dependency missing", 422, { module, requires });
    }
  }
  return undefined;
}

function createdClub(body: ClubDefinition): PlatformClub {
  const id = `50000000-0000-4000-8000-${String(consoleState.clubs.length + 1).padStart(12, "0")}`;
  const modules = body.modules ?? PRESETS[body.preset ?? "MINIM"];
  const providers = Array.isArray(body.paymentProviders) ? {} : (body.paymentProviders ?? {});
  const empty: ProviderSummary = {
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
  const sepa = providers.SEPA_XML;
  const stripe = providers.STRIPE;
  const manual = providers.MANUAL;
  const template = body.catalogs?.fromTemplate;
  const templateClub = consoleState.clubs.find(
    (candidate) => candidate.template && (candidate.id === template || candidate.slug === template),
  );
  consoleState.catalogParts[id] =
    templateClub === undefined ? [] : [...(consoleState.catalogParts[templateClub.id] ?? [])];
  consoleState.admins[id] = (body.admins ?? []).map((admin, index) => ({
    accountId: `10000000-0000-4000-8000-${String(900 + index).padStart(12, "0")}`,
    email: admin.email,
    lastAccessAt: null,
    membershipStatus: "ACTIVE",
    name: admin.name,
  }));
  const club: PlatformClub = {
    address:
      body.club.address === undefined
        ? null
        : {
            city: body.club.address.city ?? null,
            country: body.club.address.country ?? null,
            postalCode: body.club.address.postalCode ?? null,
            region: body.club.address.region ?? null,
            street: body.club.address.street ?? null,
          },
    contactEmail: body.club.contactEmail ?? null,
    contactPhone: body.club.contactPhone ?? null,
    countryProfile: body.club.countryProfile,
    createdAt: now(),
    currency: body.club.currency,
    defaultLocale: body.club.defaultLocale,
    displayCity: body.club.displayCity ?? null,
    domains: [],
    id,
    legal: body.legal ?? null,
    legalName: body.club.legalName ?? null,
    locales: body.club.locales,
    modules: [...modules],
    name: body.club.name,
    notes: null,
    onboardingChecklist: {
      branding: false,
      dns: false,
      faq: !modules.includes("FAQ") || templateClub !== undefined,
      firstAdmin: false,
      legal: false,
      sepa: false,
      templates: templateClub !== undefined,
    },
    paymentProviders: {
      MANUAL:
        manual?.enabled === true
          ? {
              ...empty,
              configured: manual.instructions !== undefined,
              enabled: true,
              instructions: manual.instructions ?? null,
            }
          : empty,
      SEPA_XML:
        sepa?.enabled === true
          ? {
              ...empty,
              configured: false,
              creditorId: sepa.creditorId ?? null,
              creditorName: sepa.creditorName ?? null,
              enabled: true,
              suffix: sepa.suffix ?? null,
            }
          : empty,
      STRIPE:
        stripe?.enabled === true ? { ...empty, enabled: true, mode: stripe.mode ?? null } : empty,
    },
    slug: body.club.slug,
    status: "ONBOARDING",
    taxId: body.club.taxId ?? null,
    template: body.club.template ?? false,
    theme: {
      colors: { ...consoleFallbackColors, ...body.theme.colors },
      fontFamily: body.theme.fontFamily,
      logoDarkUrl: null,
      logoUrl: null,
      markUrl: null,
      mode: body.theme.mode,
      radius: body.theme.radius,
      ringPalette: body.theme.ringPalette,
    },
    timeZone: body.club.timeZone,
    updatedAt: now(),
    usage: { membersActive: 0, month: CONSOLE_MONTH, smsSentMonth: 0, storageBytes: 0 },
    version: 1,
    websiteUrl: body.club.websiteUrl ?? null,
  };
  const created = withChecklist(club);
  consoleState.clubs = [...consoleState.clubs, created];
  return created;
}

function jobName(route: string): JobRun["job"] | undefined {
  const job = route.toUpperCase().replaceAll("-", "_");
  const known: JobRun["job"][] = [
    "WEEK_OPENING",
    "RISK_REVIEW",
    "NO_SHOW_NOTICES",
    "REMINDERS",
    "EXPIRATIONS",
    "WAITLIST_FIFO",
    "PAYMENT_TIMEOUTS",
    "CLASS_FINISHING",
    "CLEANUP",
    "BILLING_REMINDER",
  ];
  return known.find((candidate) => candidate === job);
}

/** S17 D19 (E10-W01): the platform console's endpoints, by the adopted E10-T01 snapshot. */
export const consoleHandlers = [
  http.get("*/api/v1/platform/clubs", ({ request }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? "0");
    const size = Number(url.searchParams.get("size") ?? "50");
    if (!PAGE_SIZES.includes(size) || !Number.isInteger(page) || page < 0) {
      return apiError("INVALID_FILTER", "Invalid page or size", 400);
    }
    const filters: Filter[] = [];
    for (const raw of url.searchParams.getAll("filter")) {
      const filter = parseFilter(raw);
      if (filter === undefined) return apiError("INVALID_FILTER", `Invalid filter ${raw}`, 400);
      filters.push(filter);
    }
    const sorts = url.searchParams.getAll("sort");
    for (const sort of sorts) {
      const [field, direction = "asc"] = sort.split(",");
      if (
        field === undefined ||
        !SORTABLE.includes(field) ||
        !["asc", "desc"].includes(direction)
      ) {
        return apiError("INVALID_FILTER", `Invalid sort ${sort}`, 400);
      }
    }
    const project = fieldsProjection<PlatformClubListItem>(url, PLATFORM_CLUB_FIELDS, ["id"]);
    if (project === undefined) return apiError("INVALID_FILTER", "Invalid fields", 400);
    const q = (url.searchParams.get("q") ?? "").trim().toLocaleLowerCase("ca");
    const [sortField = "name", sortDirection = "asc"] = (sorts[0] ?? "name,asc").split(",");
    const rows = consoleState.clubs
      .map(listItem)
      .filter(
        (item) =>
          q === "" ||
          (item.name ?? "").toLocaleLowerCase("ca").includes(q) ||
          (item.slug ?? "").includes(q),
      )
      .filter((item) => filters.every((filter) => matches(item, filter)))
      .sort((left, right) => {
        const order = (left[sortField as "name"] ?? "").localeCompare(
          right[sortField as "name"] ?? "",
          "ca",
        );
        return sortDirection === "desc" ? -order : order;
      });
    const items = rows.slice(page * size, page * size + size);
    return HttpResponse.json({
      appliedFilters: filters,
      items: project === null ? items : items.map(project),
      page,
      size,
      totalItems: rows.length,
      totalPages: Math.ceil(rows.length / size),
    });
  }),
  http.post("*/api/v1/platform/clubs", async ({ request }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const body = (await request.json()) as ClubDefinition;
    if ((body as { apiVersion?: unknown }).apiVersion !== "agilityhub.club/v1") {
      return fieldError("apiVersion");
    }
    const errors = definitionErrors(body);
    if (errors.length > 0) {
      return apiError("VALIDATION_ERROR", "Validation failed", 400, { fieldErrors: errors });
    }
    if (consoleState.clubs.some((candidate) => candidate.slug === body.club.slug)) {
      return apiError("SLUG_TAKEN", "Slug already used", 409, { slug: body.club.slug });
    }
    const modules = body.modules ?? PRESETS[body.preset ?? "MINIM"];
    const dependency = dependencyError(modules);
    if (dependency !== undefined) return dependency;
    const template = body.catalogs?.fromTemplate;
    if (
      template !== undefined &&
      !consoleState.clubs.some(
        (candidate) =>
          candidate.template && (candidate.id === template || candidate.slug === template),
      )
    ) {
      return apiError("TEMPLATE_CLUB_NOT_FOUND", "Template club not found", 404);
    }
    const club = createdClub(body);
    return HttpResponse.json({ checklist: club.onboardingChecklist, club }, { status: 201 });
  }),
  http.get(
    "*/api/v1/platform/club-templates",
    () => refused() ?? HttpResponse.json(clubTemplates()),
  ),
  http.get(
    "*/api/v1/platform/parameter-catalog",
    () => refused() ?? HttpResponse.json(consoleParameterCatalog),
  ),
  http.get("*/api/v1/platform/jobs/overview", ({ request }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const url = new URL(request.url);
    const clubId = url.searchParams.get("clubId");
    const status = url.searchParams.get("status");
    return HttpResponse.json({
      clubs: consoleState.jobs.clubs
        .filter((row) => clubId === null || row.clubId === clubId)
        .map((row) => ({
          ...row,
          jobs: row.jobs.filter((cell) => status === null || cell.health === status),
        })),
    });
  }),
  http.get("*/api/v1/platform/audit-entries", ({ request }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const url = new URL(request.url);
    const filters = url.searchParams.getAll("filter").map((raw) => raw.split(":"));
    const size = Number(url.searchParams.get("size") ?? "50");
    const page = Number(url.searchParams.get("page") ?? "0");
    const rows = consoleState.audit
      .filter((entry) =>
        filters.every(
          ([field, op, value]) => field !== "clubId" || op !== "eq" || entry.clubId === value,
        ),
      )
      .sort((left, right) => right.at.localeCompare(left.at));
    return HttpResponse.json({
      appliedFilters: filters.map(([field = "", op = "eq", value = ""]) => ({ field, op, value })),
      items: rows.slice(page * size, page * size + size),
      page,
      size,
      totalItems: rows.length,
      totalPages: Math.ceil(rows.length / size),
    });
  }),
  http.post("*/api/v1/platform/clubs/:clubId/jobs/:name/trigger", async ({ params, request }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const club = findClub(params.clubId);
    if (club === undefined) return apiError("NOT_FOUND", "Club not found", 404);
    const job = jobName(String(params.name));
    if (job === undefined) return apiError("JOB_UNKNOWN", "Unknown job", 404);
    const body = (await request.json()) as { dryRun: boolean };
    const run: JobRun = {
      actorAccountId: currentMockScenario().me.account.id,
      dryRun: body.dryRun,
      durationMs: 840,
      effects: { counters: body.dryRun ? { WOULD_REMIND: 3 } : { notified: 3 }, items: [] },
      errors: [],
      finishedAt: now(),
      job,
      parametersSnapshot: {},
      runId: `run-manual-${String(params.name)}`,
      scheduledFor: now(),
      scheduledForLocal: "2026-10-15T11:00",
      skipReason: null,
      startedAt: now(),
      status: "SUCCEEDED",
      timeZone: club.timeZone,
      trigger: "MANUAL",
    };
    return HttpResponse.json(run);
  }),
  http.get("*/api/v1/platform/clubs/:id", ({ params }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const club = findClub(params.id);
    return club === undefined ? clubNotFound() : HttpResponse.json(withChecklist(club));
  }),
  http.patch("*/api/v1/platform/clubs/:id", async ({ params, request }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const club = findClub(params.id);
    if (club === undefined) return clubNotFound();
    const raw = (await request.json()) as Record<string, unknown>;
    const body = raw as PlatformClubPatch;
    if (body.version !== club.version) return stale();
    // `legal: null` is refused (PlatformClubPatch: omit it to keep the current texts).
    if ("legal" in raw && raw.legal === null) return fieldError("legal");
    // E10-W02: the core refuses a `legal` whose image-consent text lacks the club's default
    // language (a LocalizedText needs its `defaultLocale`) with `details.field = "locales"`.
    if (
      body.legal !== undefined &&
      (body.legal.imageConsentText[body.defaultLocale ?? club.defaultLocale] ?? "").trim() === ""
    ) {
      return apiError("VALIDATION_ERROR", "Validation failed", 400, { field: "locales" });
    }
    if (body.name?.trim() === "") return fieldError("name", "REQUIRED");
    if (
      typeof body.contactEmail === "string" &&
      body.contactEmail !== "" &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(body.contactEmail)
    ) {
      return fieldError("contactEmail");
    }
    if (body.locales?.length === 0) return fieldError("locales", "REQUIRED");
    const locales = body.locales ?? club.locales;
    if (!locales.includes(body.defaultLocale ?? club.defaultLocale))
      return fieldError("defaultLocale");
    if (body.currency !== undefined && !/^[A-Z]{3}$/u.test(body.currency))
      return fieldError("currency");
    if (
      body.timeZone !== undefined &&
      body.timeZone !== club.timeZone &&
      CLUBS_WITH_FUTURE_CLASSES.includes(club.id)
    ) {
      return apiError("TIMEZONE_CHANGE_BLOCKED", "The club has future classes", 422);
    }
    const update = Object.fromEntries(
      Object.entries(raw).filter(([key]) => key !== "version"),
    ) as Partial<PlatformClub>;
    return HttpResponse.json(touch(club, update));
  }),
  http.put("*/api/v1/platform/clubs/:id/parameters/:key", async ({ params, request }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const club = findClub(params.id);
    if (club === undefined) return clubNotFound();
    const key = String(params.key);
    const definition = consoleParameterCatalog.find((candidate) => candidate.key === key);
    if (definition === undefined) {
      return apiError("UNKNOWN_PARAMETER", "Unknown parameter", 400, { key });
    }
    if (
      !definition.modules.every((module) => (club.modules as readonly string[]).includes(module))
    ) {
      return apiError("MODULE_DISABLED", "Module disabled", 404);
    }
    const body = (await request.json()) as components["schemas"]["ParameterUpdate"];
    const stored = consoleState.parameters[club.id]?.[key];
    if (body.version !== (stored?.version ?? 0)) return stale();
    // S02 R-02-04: the catalog's type and bounds (the platform writes `PLATFORM` keys too).
    const numeric = ["int", "duration"].includes(definition.type);
    const { max, min } = definition.constraints as { max?: number; min?: number };
    if (
      (numeric && (typeof body.value !== "number" || !Number.isInteger(body.value))) ||
      (definition.type === "bool" && typeof body.value !== "boolean") ||
      (typeof body.value === "number" &&
        ((min !== undefined && body.value < min) || (max !== undefined && body.value > max)))
    ) {
      return apiError("PARAMETER_INVALID", "Parameter value is invalid", 400, { key });
    }
    const parameter: components["schemas"]["Parameter"] = {
      block: definition.block,
      constraints: definition.constraints,
      default: definition.default,
      editableBy: definition.editableBy,
      help: definition.help,
      history: [
        ...(stored?.history ?? []),
        {
          changedAt: now(),
          changedByAccountId: currentMockScenario().me.account.id,
          ...(body.reason === undefined || body.reason === "" ? {} : { reason: body.reason }),
          value: body.value,
        },
      ],
      isOverride: true,
      key,
      label: definition.label,
      type: definition.type,
      value: body.value,
      version: (stored?.version ?? 0) + 1,
    };
    consoleState.parameters[club.id] = { ...consoleState.parameters[club.id], [key]: parameter };
    return HttpResponse.json(parameter);
  }),
  http.get("*/api/v1/platform/clubs/:id/checklist", ({ params }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const club = findClub(params.id);
    return club === undefined
      ? clubNotFound()
      : HttpResponse.json(withChecklist(club).onboardingChecklist);
  }),
  http.get("*/api/v1/platform/clubs/:id/usage", ({ params, request }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const club = findClub(params.id);
    if (club === undefined) return clubNotFound();
    const month = new URL(request.url).searchParams.get("month") ?? CONSOLE_MONTH;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(month)) return fieldError("month");
    if (month === CONSOLE_MONTH) return HttpResponse.json(club.usage);
    // An earlier month: the members active then and that month's counters (a later one: none).
    const past = month < CONSOLE_MONTH;
    return HttpResponse.json({
      membersActive: past ? Math.max(0, club.usage.membersActive - 3) : 0,
      month,
      smsSentMonth: past ? Math.round(club.usage.smsSentMonth * 0.8) : 0,
      storageBytes: past ? Math.round(club.usage.storageBytes * 0.95) : 0,
    });
  }),
  http.put("*/api/v1/platform/clubs/:id/modules", async ({ params, request }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const club = findClub(params.id);
    if (club === undefined) return clubNotFound();
    const body = (await request.json()) as PlatformModulesRequest;
    if (body.version !== club.version) return stale();
    if ((body.preset === undefined) === (body.modules === undefined))
      return fieldError("modules", "REQUIRED");
    const modules = body.modules ?? PRESETS[body.preset ?? "MINIM"];
    const dependency = dependencyError(modules);
    if (dependency !== undefined) return dependency;
    const next = touch(club, { modules: ALL_MODULES.filter((module) => modules.includes(module)) });
    return HttpResponse.json({ modules: next.modules, version: next.version });
  }),
  http.post("*/api/v1/platform/clubs/:id/theme/upload-url", async ({ params, request }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const club = findClub(params.id);
    if (club === undefined) return clubNotFound();
    const body = (await request.json()) as components["schemas"]["PlatformLogoUploadRequest"];
    if (!body.mimeType.startsWith("image/")) {
      return apiError("FILE_TYPE_NOT_ALLOWED", "Only images", 400, { allowedTypes: ["image/*"] });
    }
    if (body.sizeBytes > 25 * 1024 * 1024) {
      return apiError("FILE_TOO_LARGE", "File too large", 400, { maxSizeMb: 25 });
    }
    const fileKey = `theme/${club.id}/${String((consoleState.uploads[club.id] ?? []).length + 1)}-${body.fileName}`;
    consoleState.uploads[club.id] = [...(consoleState.uploads[club.id] ?? []), fileKey];
    return HttpResponse.json(
      {
        expiresAt: "2026-10-15T09:05:00Z",
        fileKey,
        headers: { "Content-Type": body.mimeType },
        uploadUrl: `https://uploads.example.test/${encodeURIComponent(fileKey)}`,
      },
      { status: 201 },
    );
  }),
  http.put("*/api/v1/platform/clubs/:id/theme", async ({ params, request }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const club = findClub(params.id);
    if (club === undefined) return clubNotFound();
    const body = (await request.json()) as PlatformThemeRequest;
    if (body.version !== club.version) return stale();
    if (!/^\d+(\.\d+)?px$/u.test(body.radius)) return fieldError("radius");
    for (const [foreground, background] of CONTRAST_PAIRS) {
      if (contrast(body.colors[foreground], body.colors[background]) < 4.5) {
        return apiError("THEME_CONTRAST", "Theme contrast below AA", 422, {
          field: `colors.${foreground}`,
        });
      }
    }
    const granted = consoleState.uploads[club.id] ?? [];
    const logo = (key: string | undefined, current: string | null | undefined) =>
      key === undefined
        ? (current ?? null)
        : key === ""
          ? null
          : granted.includes(key)
            ? `https://files.example.test/${encodeURIComponent(key)}`
            : undefined;
    const logoUrl = logo(body.logoFileKey, club.theme.logoUrl);
    const logoDarkUrl = logo(body.logoDarkFileKey, club.theme.logoDarkUrl);
    const markUrl = logo(body.markFileKey, club.theme.markUrl);
    if (logoUrl === undefined || logoDarkUrl === undefined || markUrl === undefined) {
      return apiError("FILE_NOT_FOUND", "Unknown file key", 400);
    }
    const next = touch(club, {
      theme: {
        colors: body.colors,
        fontFamily: body.fontFamily,
        logoDarkUrl,
        logoUrl,
        markUrl,
        mode: body.mode,
        radius: body.radius,
        ringPalette: body.ringPalette,
      },
    });
    consoleState.clubs = consoleState.clubs.map((candidate) =>
      candidate.id === next.id
        ? {
            ...next,
            onboardingChecklist: {
              ...next.onboardingChecklist,
              branding: logoUrl !== null || markUrl !== null,
            },
          }
        : candidate,
    );
    return HttpResponse.json(next.theme);
  }),
  http.post("*/api/v1/platform/clubs/:id/payment-providers/stripe/test", ({ params }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const club = findClub(params.id);
    if (club === undefined) return clubNotFound();
    const stripe = club.paymentProviders.STRIPE;
    const secret = stripeSecrets.get(club.id);
    if (stripe?.configured !== true || secret === undefined || secret.includes("fail")) {
      return apiError("STRIPE_CONNECTION_FAILED", "Stripe rejected the key", 422);
    }
    consoleState.clubs = consoleState.clubs.map((candidate) =>
      candidate.id === club.id
        ? {
            ...candidate,
            paymentProviders: {
              ...candidate.paymentProviders,
              STRIPE: { ...stripe, lastTestAt: now() },
            },
          }
        : candidate,
    );
    return HttpResponse.json({
      accountName: club.legalName ?? club.name,
      mode: stripe.mode ?? "test",
      ok: true,
    });
  }),
  http.put(
    "*/api/v1/platform/clubs/:id/payment-providers/:provider",
    async ({ params, request }) => {
      const denied = refused();
      if (denied !== undefined) return denied;
      const club = findClub(params.id);
      if (club === undefined) return clubNotFound();
      const provider = String(params.provider);
      const body = (await request.json()) as PlatformProviderRequest;
      if (body.version !== club.version) return stale();
      const previous = club.paymentProviders[provider];
      if (previous === undefined) return fieldError("provider");
      if (provider === "STRIPE") {
        if (body.publishableKey?.startsWith("pk_") !== true)
          return providerInvalid("publishableKey");
        if (body.mode === undefined) return providerInvalid("mode");
        if (body.secretKey !== undefined && !body.secretKey.startsWith("sk_")) {
          return providerInvalid("secretKey");
        }
        if (body.secretKey === undefined && !stripeSecrets.has(club.id)) {
          return providerInvalid("secretKey");
        }
        if (body.secretKey !== undefined) stripeSecrets.set(club.id, body.secretKey);
      }
      if (provider === "SEPA_XML") {
        for (const field of ["creditorName", "creditorId", "suffix"] as const) {
          if ((body[field] ?? "").trim() === "") return providerInvalid(field);
        }
        // E147 (E11-T15 F8): the creditor identifier's check digits are validated on save.
        if (!canonicalCreditorId(body.creditorId ?? "")) return providerInvalid("creditorId");
        const iban = body.iban?.replaceAll(" ", "");
        if (iban === undefined && !previous.configured) return providerInvalid("iban");
        if (iban !== undefined && !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/u.test(iban)) {
          return providerInvalid("iban");
        }
      }
      if (provider === "MANUAL" && (body.instructions?.[club.defaultLocale] ?? "").trim() === "") {
        return providerInvalid(`instructions.${club.defaultLocale}`);
      }
      const summary = providerSummary(provider, body, previous);
      touch(club, { paymentProviders: { ...club.paymentProviders, [provider]: summary } });
      return HttpResponse.json(summary);
    },
  ),
  http.delete("*/api/v1/platform/clubs/:id/payment-providers/:provider", ({ params, request }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const club = findClub(params.id);
    if (club === undefined) return clubNotFound();
    const provider = String(params.provider);
    const version = Number(new URL(request.url).searchParams.get("version"));
    if (version !== club.version) return stale();
    const count = PROVIDER_USERS[club.id]?.[provider];
    if (count !== undefined) {
      return apiError("PROVIDER_IN_USE", "Members still use this provider", 409, { count });
    }
    const summary: ProviderSummary = {
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
    if (provider === "STRIPE") stripeSecrets.delete(club.id);
    touch(club, { paymentProviders: { ...club.paymentProviders, [provider]: summary } });
    return HttpResponse.json(summary);
  }),
  http.post("*/api/v1/platform/clubs/:id/catalog-clone", async ({ params, request }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const club = findClub(params.id);
    if (club === undefined) return clubNotFound();
    const body = (await request.json()) as CatalogCloneRequest;
    const source = findClub(body.fromClubId);
    if (source?.template !== true) {
      return apiError("TEMPLATE_CLUB_NOT_FOUND", "Template club not found", 404);
    }
    if (source.currency !== club.currency && body.parts.includes("PLANS")) {
      return apiError("CURRENCY_MISMATCH", "Currencies differ", 422);
    }
    const filled = consoleState.catalogParts[club.id] ?? [];
    const busy = body.parts.find((part) => filled.includes(part));
    if (busy !== undefined) {
      return apiError("CATALOG_NOT_EMPTY", "Catalog part is not empty", 409, { part: busy });
    }
    consoleState.catalogParts[club.id] = [...filled, ...body.parts];
    const missingDefault = !source.locales.includes(club.defaultLocale);
    // The source's languages the target does not use: their texts are left out.
    const omitted = source.locales.filter((locale) => !club.locales.includes(locale));
    // R-17-08 (E10-T04 snapshot): one `CatalogCloneWarning` per code, part and source locale.
    const result: CatalogCloneResult = {
      copied: Object.fromEntries(body.parts.map((part) => [part, CATALOG_COUNTS[part] ?? 0])),
      warnings: body.parts.flatMap((part) => [
        ...omitted.map((from) => ({ code: "LOCALE_OMITTED" as const, from, part })),
        ...(missingDefault
          ? [{ code: "DEFAULT_LOCALE_COPIED" as const, from: source.defaultLocale, part }]
          : []),
      ]),
    };
    return HttpResponse.json(result);
  }),
  http.get("*/api/v1/platform/clubs/:id/admins", ({ params }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const club = findClub(params.id);
    return club === undefined
      ? clubNotFound()
      : HttpResponse.json(consoleState.admins[club.id] ?? []);
  }),
  http.post("*/api/v1/platform/clubs/:id/admins", async ({ params, request }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const club = findClub(params.id);
    if (club === undefined) return clubNotFound();
    const body = (await request.json()) as PlatformAdminRequest;
    if (body.name.trim() === "") return fieldError("name", "REQUIRED");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(body.email)) return fieldError("email");
    const admins = consoleState.admins[club.id] ?? [];
    if (
      admins.some(
        (admin) =>
          admin.email.toLocaleLowerCase() === body.email.toLocaleLowerCase() &&
          admin.membershipStatus === "ACTIVE",
      )
    ) {
      return apiError("MEMBERSHIP_EXISTS", "Already a member", 409);
    }
    const admin = {
      accountId: `10000000-0000-4000-8000-${String(700 + admins.length).padStart(12, "0")}`,
      email: body.email,
      lastAccessAt: null,
      membershipStatus: "ACTIVE",
      name: body.name,
    };
    consoleState.admins[club.id] = [...admins, admin];
    return HttpResponse.json(admin, { status: 201 });
  }),
  http.delete("*/api/v1/platform/clubs/:id/admins/:accountId", ({ params }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const club = findClub(params.id);
    if (club === undefined) return clubNotFound();
    const admins = consoleState.admins[club.id] ?? [];
    const target = admins.find((admin) => admin.accountId === params.accountId);
    if (target === undefined) return apiError("NOT_FOUND", "Administrator not found", 404);
    const active = admins.filter((admin) => admin.membershipStatus === "ACTIVE");
    if (target.membershipStatus === "ACTIVE" && active.length <= 1) {
      return apiError("LAST_ADMIN", "The club needs one administrator", 409);
    }
    consoleState.admins[club.id] = admins.map((admin) =>
      admin === target ? { ...admin, membershipStatus: "SUSPENDED" } : admin,
    );
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("*/api/v1/platform/accounts/:id/platform-roles", ({ params }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    return HttpResponse.json({
      platformRoles: consoleState.platformRoles[String(params.id)] ?? [],
    });
  }),
  http.put("*/api/v1/platform/accounts/:id/platform-roles", async ({ params, request }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const body = (await request.json()) as PlatformRoles;
    const id = String(params.id);
    const remaining = Object.entries(consoleState.platformRoles).filter(
      ([account, roles]) => account !== id && roles.includes("AGILITYHUB_ADMIN"),
    );
    if (!body.platformRoles.includes("AGILITYHUB_ADMIN") && remaining.length === 0) {
      return apiError("LAST_PLATFORM_ADMIN", "The platform needs one administrator", 409);
    }
    consoleState.platformRoles[id] = [...body.platformRoles];
    return HttpResponse.json({ platformRoles: body.platformRoles });
  }),
  http.put("*/api/v1/platform/clubs/:id/status", async ({ params, request }) => {
    const denied = refused();
    if (denied !== undefined) return denied;
    const club = findClub(params.id);
    if (club === undefined) return clubNotFound();
    const body = (await request.json()) as StatusRequest;
    const allowed: Record<string, readonly string[]> = {
      ACTIVE: ["SUSPENDED"],
      ONBOARDING: ["ACTIVE"],
      SUSPENDED: ["ACTIVE"],
    };
    if (!(allowed[club.status] ?? []).includes(body.status)) {
      return apiError("INVALID_STATE", "Transition not allowed", 409, {
        from: club.status,
        to: body.status,
      });
    }
    if (body.status === "SUSPENDED" && (body.reason ?? "").trim() === "") {
      return fieldError("reason", "REQUIRED");
    }
    return HttpResponse.json(touch(club, { status: body.status }));
  }),
  ...domainHandlers(),
  ...supportHandlers(),
];

/** R-17-02: the product hosts no club may take (`clubs.*`, `clubsadmin.*`, `id.*`, `core.*`). */
const RESERVED_HOST = /^(clubs|clubsadmin|id|core)\./u;
const HOST_PATTERN = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u;

function findDomain(club: PlatformClub, host: unknown): PlatformDomain | undefined {
  return club.domains.find((domain) => domain.host === host);
}

function domainNotFound() {
  return apiError("NOT_FOUND", "Domain not found", 404);
}

/** S17 R-17-02/03 and §5 (E10-T04 round 2): the domain routes, on the fake DNS (`consoleState.dns`). */
function domainHandlers() {
  return [
    http.post("*/api/v1/platform/clubs/:id/domains", async ({ params, request }) => {
      const denied = refused();
      if (denied !== undefined) return denied;
      const club = findClub(params.id);
      if (club === undefined) return clubNotFound();
      if (club.template) {
        return apiError("VALIDATION_ERROR", "A template club has no domains", 400, {
          field: "template",
        });
      }
      const body = (await request.json()) as components["schemas"]["PlatformDomainRequest"];
      const host = body.host.trim().toLowerCase().replace(/\.$/u, "");
      if (!HOST_PATTERN.test(host)) return fieldError("host");
      if (RESERVED_HOST.test(host))
        return apiError("HOST_RESERVED", "Reserved host", 422, { host });
      if (consoleState.clubs.some((candidate) => findDomain(candidate, host) !== undefined)) {
        return apiError("HOST_ALREADY_USED", "Host already used", 409, { host });
      }
      const domain: PlatformDomain = {
        app: body.app,
        checkedAt: null,
        failedChecks: 0,
        host,
        primary: false,
        status: "PENDING",
        verification: domainChallenge(body.app, host, `t${String(club.domains.length + 1)}x9`),
        verifiedAt: null,
      };
      touch(club, { domains: [...club.domains, domain] });
      return HttpResponse.json(domain, { status: 201 });
    }),
    http.delete("*/api/v1/platform/clubs/:id/domains/:host", ({ params }) => {
      const denied = refused();
      if (denied !== undefined) return denied;
      const club = findClub(params.id);
      if (club === undefined) return clubNotFound();
      const domain = findDomain(club, params.host);
      if (domain === undefined) return domainNotFound();
      if (domain.primary) {
        return apiError("INVALID_STATE", "The primary domain of its app", 409, {
          primary: true,
          status: domain.status,
        });
      }
      touch(club, { domains: club.domains.filter((candidate) => candidate !== domain) });
      return new HttpResponse(null, { status: 204 });
    }),
    http.put("*/api/v1/platform/clubs/:id/domains/:host/primary", ({ params }) => {
      const denied = refused();
      if (denied !== undefined) return denied;
      const club = findClub(params.id);
      if (club === undefined) return clubNotFound();
      const domain = findDomain(club, params.host);
      if (domain === undefined) return domainNotFound();
      if (domain.status !== "VERIFIED") {
        return apiError("INVALID_STATE", "Only a verified domain is primary", 409, {
          status: domain.status,
        });
      }
      const next = touch(club, {
        domains: club.domains.map((candidate) =>
          candidate.app === domain.app
            ? { ...candidate, primary: candidate === domain }
            : candidate,
        ),
      });
      return HttpResponse.json(next.domains);
    }),
    http.post("*/api/v1/platform/clubs/:id/domains/:host/verification", ({ params }) => {
      const denied = refused();
      if (denied !== undefined) return denied;
      const club = findClub(params.id);
      if (club === undefined) return clubNotFound();
      const domain = findDomain(club, params.host);
      if (domain === undefined) return domainNotFound();
      if (domain.status === "VERIFIED") {
        return apiError("INVALID_STATE", "Already verified", 409, { status: domain.status });
      }
      const method = consoleState.dns[domain.host];
      if (method === undefined) {
        // Nothing changes, and the expected records are in the refusal (the TXT pair is null
        // for a domain without a challenge left).
        return apiError("HOST_NOT_VERIFIED", "No DNS record found", 422, {
          cnameTarget: domain.verification?.cnameTarget ?? DOMAIN_CNAME_TARGETS[domain.app],
          host: domain.host,
          recordName: domain.verification?.recordName ?? null,
          recordValue: domain.verification?.recordValue ?? null,
        });
      }
      const hasPrimary = club.domains.some(
        (candidate) =>
          candidate.app === domain.app && candidate.primary && candidate.status === "VERIFIED",
      );
      touch(club, {
        domains: club.domains.map((candidate) =>
          candidate === domain
            ? {
                ...candidate,
                primary: candidate.primary || !hasPrimary,
                checkedAt: now(),
                failedChecks: 0,
                status: "VERIFIED" as const,
                verification: null,
                verifiedAt: now(),
              }
            : candidate,
        ),
      });
      const verification: components["schemas"]["DomainVerification"] = {
        checkedAt: now(),
        method,
        status: "VERIFIED",
      };
      return HttpResponse.json(verification);
    }),
    // E10-T04: the club's own values and versions, every catalog key grouped by block (`version`
    // 0 and the default for a key the club has not overridden).
    http.get("*/api/v1/platform/clubs/:id/parameters", ({ params, request }) => {
      const denied = refused();
      if (denied !== undefined) return denied;
      const club = findClub(params.id);
      if (club === undefined) return clubNotFound();
      const only = new URL(request.url).searchParams.get("block");
      const stored = consoleState.parameters[club.id] ?? {};
      const rows = consoleParameterCatalog
        .filter((definition) => only === null || definition.block === only)
        .map((definition) => stored[definition.key] ?? parameterRow(definition.key));
      const blocks = [...new Set(rows.map((row) => row.block))].map((block) => ({
        key: block,
        rows: rows.filter((row) => row.block === block),
        title: block,
      }));
      return HttpResponse.json({ blocks });
    }),
  ];
}

/** S17 R-17-10/11 (E10-T04): the support access, its end by the club, and the public key. */
function supportHandlers() {
  return [
    http.post("*/api/v1/platform/clubs/:id/support-access", async ({ params, request }) => {
      const denied = refused();
      if (denied !== undefined) return denied;
      const club = findClub(params.id);
      if (club === undefined) return clubNotFound();
      const body = (await request.json()) as components["schemas"]["SupportAccessRequest"];
      if (body.reason.trim() === "") return fieldError("reason", "REQUIRED");
      const access: components["schemas"]["SupportAccess"] = {
        expiresAt: supportExpiry(),
        token: MOCK_SUPPORT_TOKEN,
      };
      return HttpResponse.json(access, { status: 201 });
    }),
    http.post("*/api/v1/platform/clubs/:id/public-api-key", ({ params }) => {
      const denied = refused();
      if (denied !== undefined) return denied;
      const club = findClub(params.id);
      if (club === undefined) return clubNotFound();
      consoleState.publicKeys += 1;
      // `agh_pub_` + 43 URL-safe characters (R-17-11); a fictional value.
      const apiKey = `agh_pub_mock${String(consoleState.publicKeys).padStart(39, "x")}`;
      return HttpResponse.json({ apiKey }, { status: 201 });
    }),
    // The club's ADMIN ends a live support access (E123): `{id}` is the grant of the audit entry.
    http.delete("*/api/v1/support-accesses/:id", ({ params, request }) => {
      if (isSupportToken(request)) {
        return apiError("SUPPORT_RESTRICTED", "Not with a support access", 403);
      }
      const me = currentMockScenario().me;
      if (me.impersonation !== undefined) {
        return apiError("IMPERSONATION_DENIED", "Impersonation cannot end it", 403);
      }
      if (!(me.membership?.roles ?? []).includes("ADMIN")) {
        return apiError("FORBIDDEN", "ADMIN role required", 403);
      }
      const id = String(params.id);
      if (!(Object.values(MOCK_SUPPORT_GRANTS) as string[]).includes(id)) {
        return apiError("NOT_FOUND", "Support access not found", 404);
      }
      if (id === MOCK_SUPPORT_GRANTS.ended || consoleState.supportEnded.includes(id)) {
        return apiError("INVALID_STATE", "Support access already ended", 409, {
          status: "ENDED",
        });
      }
      consoleState.supportEnded = [...consoleState.supportEnded, id];
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}
