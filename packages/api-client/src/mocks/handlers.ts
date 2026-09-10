import { delay, http, HttpResponse } from "msw";

import type { components } from "../generated/schema";

import auditEntriesFixture from "./fixtures/audit-entries.json";
import {
  catalogState,
  type Administrator,
  type ClubPage,
  type FaqEntry,
  type Instructor,
  type Level,
  type Plan,
  type Price,
  type Ring,
  resetCatalogState,
} from "./fixtures/catalogs";
import {
  censusRecordState,
  censusDogs,
  censusLevels,
  censusMembers,
  initialSavedViews,
  resetCensusRecordState,
  type DogListItem,
  type DogDetail,
  type MemberListItem,
  type SavedView,
} from "./fixtures/census";
import dashboardFixture from "./fixtures/dashboard.json";
import exportJobsFixture from "./fixtures/export-jobs.json";
import {
  meDogsFixture,
  meProfileFixture,
  postalTownFixtures,
  type MeDog,
  type MeDogs,
  type MeProfile,
} from "./fixtures/member-self-service";
import memberSignupReviewFixture from "./fixtures/member-signup-review.json";
import {
  findParameter,
  replaceParameter,
  resetSettingsState,
  settingsState,
} from "./fixtures/settings";
import {
  signupConfig,
  signupMemberFixture,
  signupTownFixtures,
  signupUpfrontFixture,
  type MemberDogSignupRequest,
  type SignupRequest,
} from "./fixtures/signup";
import {
  currentMockScenario,
  currentMockScenarioName,
  mockScenario,
  type MockScenario,
  type MockScenarioDefinition,
} from "./scenarios";

type ApiErrorResponse = components["schemas"]["ApiError"];
type MagicLinkRequest = components["schemas"]["MagicLinkRequest"];
type UpdateMeRequest = components["schemas"]["AccountPatchRequest"];
type UpdatePasswordRequest = components["schemas"]["PasswordRequest"];
type UpdateProfileRequest = components["schemas"]["ProfileRequest"];
type OnboardingRequest = components["schemas"]["OnboardingRequest"];
type OnboardingState = components["schemas"]["OnboardingState"];
type ListFilter = components["schemas"]["Filter"] & { value: string };
type SavedViewCreate = components["schemas"]["SavedViewCreate"];
type SavedViewUpdate = components["schemas"]["SavedViewUpdate"];
type MemberPatchRequest = components["schemas"]["MemberPatch"];
type PaymentMethodRequest = components["schemas"]["PaymentMethodPatch"];
type BookingBlockRequest = components["schemas"]["BookingBlockRequest"];
type RolesRequest = components["schemas"]["RolesRequest"];
type NotificationPreferences = components["schemas"]["NotificationPreferences"];
type NotificationPreferencesPatch = components["schemas"]["NotificationPreferencesPatch"];
type DogPatchRequest = components["schemas"]["DogPatch"] &
  components["schemas"]["DogPatchPendingFields"];
type DogLevelRequest = components["schemas"]["DogLevelRequest"];
type FreeTrainingRequest = components["schemas"]["FreeTrainingRequest"];
type DogTransferRequest = components["schemas"]["DogTransferRequest"];
type PhotoRequest = components["schemas"]["FileKeyRequest"];
type DogDocumentUploadRequest = components["schemas"]["DogDocumentRequest"];
type DogDocumentReminderRequest = components["schemas"]["DocumentReminderRequest"];
type AttachmentUploadRequest = components["schemas"]["UploadRequest"];
type InstructorNoteRequest = components["schemas"]["InstructorNoteRequest"];
type MeProfilePatch = components["schemas"]["MeProfilePatch"];
type ClubSettings = components["schemas"]["ClubSettings"];
type Parameter = components["schemas"]["Parameter"];
type ParameterUpdate = components["schemas"]["ParameterUpdate"];
type OpeningHoursUpdate = components["schemas"]["OpeningHoursUpdate"];
type HolidaysUpdate = components["schemas"]["HolidaysUpdate"];
type ModuleUpdate = components["schemas"]["ModuleUpdate"];
type AdministratorCreate = components["schemas"]["AdministratorCreate"];
type AdministratorPatch = components["schemas"]["AdministratorPatch"];
type ClubPageCreate = components["schemas"]["ClubPageCreate"];
type ClubPagePatch = components["schemas"]["ClubPagePatch"];
type FaqCreate = components["schemas"]["FaqCreate"];
type FaqOrder = components["schemas"]["FaqOrder"];
type FaqPatch = components["schemas"]["FaqPatch"];
type InstructorCreate = components["schemas"]["InstructorCreate"];
type InstructorPatch = components["schemas"]["InstructorPatch"];
type LevelCreate = components["schemas"]["LevelCreate"];
type LevelOrder = components["schemas"]["LevelOrder"];
type LevelPatch = components["schemas"]["LevelPatch"];
type PlanCreate = components["schemas"]["PlanCreate"] & {
  billingMode?: components["schemas"]["PlanBillingMode"];
};
type PlanPatch = components["schemas"]["PlanPatch"] & {
  billingMode?: components["schemas"]["PlanBillingMode"];
};
type PriceCreate = components["schemas"]["PriceCreate"];
type RingCreate = components["schemas"]["RingCreate"];
type RingOrder = components["schemas"]["RingOrder"];
type RingPatch = components["schemas"]["RingPatch"];
type AuditEntry = components["schemas"]["AuditEntry"];
type AuditEntryListItem = components["schemas"]["AuditEntryListItem"];
type AuditListResponse = components["schemas"]["ListPageAuditEntryListItem"];
type ExportJob = components["schemas"]["ExportJob"];
type SignupIdentityCheckRequest = components["schemas"]["IdentityCheckRequest"];
type SignupUploadRequest = components["schemas"]["UploadUrlRequest"];
type SignupFamilyLookupRequest = components["schemas"]["FamilyGroupLookupRequest"];
type CheckoutSessionRequest = components["schemas"]["CheckoutSessionRequest"];
type Dashboard = components["schemas"]["Dashboard"];
type DashboardCounters = components["schemas"]["DashboardCounters"];
type MemberSignupView = components["schemas"]["MemberSignupView"];
type RejectionRequest = components["schemas"]["RejectionRequest"];
type ValidationRequest = components["schemas"]["ValidationRequest"];

type NullableDashboard = Omit<Dashboard, "dogsByLevel" | "kpis" | "pendingSignups" | "riskReview"> & {
  dogsByLevel: Dashboard["dogsByLevel"] | null;
  kpis: Omit<Dashboard["kpis"], "activeMembers" | "classOccupancy" | "pendingSignups" | "trainingBookings"> & {
    activeMembers: Dashboard["kpis"]["activeMembers"] | null;
    classOccupancy: Dashboard["kpis"]["classOccupancy"] | null;
    pendingSignups: Dashboard["kpis"]["pendingSignups"] | null;
    trainingBookings: Dashboard["kpis"]["trainingBookings"] | null;
  };
  pendingSignups: Dashboard["pendingSignups"] | null;
  riskReview: Dashboard["riskReview"] | null;
};

const initialDashboard = dashboardFixture as NullableDashboard;
const initialMemberSignupReview = memberSignupReviewFixture as MemberSignupView;
let dashboardState = structuredClone(initialDashboard);
let memberSignupReviewState = structuredClone(initialMemberSignupReview);

function resetDashboardMockState(): void {
  dashboardState = structuredClone(initialDashboard);
  memberSignupReviewState = structuredClone(initialMemberSignupReview);
}

function pageText(source: Record<string, string>, locale: string): string {
  const normalized = locale.split("-")[0] ?? locale;
  return source[normalized] ?? source.ca ?? Object.values(source)[0] ?? "";
}

function invalidClubPageBody(body: Record<string, string> | undefined) {
  if (body === undefined) return undefined;
  const entry = Object.entries(body).find(
    ([, value]) => value.length > 20_000 || /<[^>]+>|!\[[^\]]*\]\([^)]+\)/u.test(value),
  );
  return entry === undefined ? undefined : `body.${entry[0]}`;
}

const savedViews: SavedView[] = initialSavedViews.map((view) => ({
  ...view,
  columns: [...view.columns],
  filters: view.filters.map((filter) => ({ ...filter })),
  sort: [...view.sort],
}));
const auditEntries = structuredClone(auditEntriesFixture) as AuditEntryListItem[];
const initialExportJobs = structuredClone(exportJobsFixture) as ExportJob[];
let exportJobsState = structuredClone(initialExportJobs);
let exportPolls = 0;

let memberDogsState: MeDogs = structuredClone(meDogsFixture);
let memberProfileState: MeProfile = structuredClone(meProfileFixture);
let activeOnboardingScenario: MockScenarioDefinition | undefined;
let activeOnboardingScenarioName: MockScenario | undefined;
const completedOnboardingState: OnboardingState = {
  fields: [],
  pending: false,
  postponeRemaining: 0,
  requiredConsent: null,
};
let onboardingState: OnboardingState = completedOnboardingState;
let outdatedConsentReturned = false;

function onboardingStorageKey(name: MockScenario): string {
  return `agilityhub.mockOnboarding:${name}`;
}

function mockStorage(): Storage | undefined {
  const storage: unknown = Reflect.get(globalThis, "localStorage");
  return typeof storage === "object" && storage !== null ? (storage as Storage) : undefined;
}

function readStoredOnboarding(name: MockScenario): OnboardingState | undefined {
  try {
    const serialized = mockStorage()?.getItem(onboardingStorageKey(name));
    return serialized === null || serialized === undefined
      ? undefined
      : (JSON.parse(serialized) as OnboardingState);
  } catch {
    return undefined;
  }
}

function persistOnboarding(state: OnboardingState): void {
  if (activeOnboardingScenarioName === undefined) {
    return;
  }
  try {
    mockStorage()?.setItem(
      onboardingStorageKey(activeOnboardingScenarioName),
      JSON.stringify(state),
    );
  } catch {
    // Node tests and privacy-restricted browsers can run without persistent mock state.
  }
}

function currentOnboardingState(): OnboardingState {
  const scenario = currentMockScenario();
  if (scenario !== activeOnboardingScenario) {
    const scenarioName = currentMockScenarioName();
    activeOnboardingScenario = scenario;
    activeOnboardingScenarioName = scenarioName;
    onboardingState =
      readStoredOnboarding(scenarioName) ??
      structuredClone(scenario.onboarding ?? completedOnboardingState);
    outdatedConsentReturned = onboardingState.requiredConsent?.version === "2026-09-02";
  }
  return onboardingState;
}

function resetOnboardingMockState(): void {
  for (const scenario of [
    "onboarding",
    "onboardingAdmin",
    "policyReconsent",
    "policyReconsentOutdated",
  ] as const satisfies readonly MockScenario[]) {
    try {
      mockStorage()?.removeItem(onboardingStorageKey(scenario));
    } catch {
      // Node tests can run without local storage.
    }
  }
  activeOnboardingScenario = undefined;
  activeOnboardingScenarioName = undefined;
  onboardingState = completedOnboardingState;
  outdatedConsentReturned = false;
}

function resetMemberSelfServiceState(): void {
  memberDogsState = structuredClone(meDogsFixture);
  memberProfileState = structuredClone(meProfileFixture);
}

function resetAuditMockState(): void {
  exportJobsState = structuredClone(initialExportJobs);
  exportPolls = 0;
}

function changedParameter(current: Parameter, value: unknown, reason?: string): Parameter {
  const changedAt = "2026-09-09T17:00:00Z";
  return {
    ...current,
    history: [
      ...current.history,
      {
        changedAt,
        changedByAccountId: "00000000-0000-4000-8000-000000000001",
        ...(reason === undefined || reason === "" ? {} : { reason }),
        value: structuredClone(value),
      },
    ],
    isOverride: true,
    lastChange: { action: current.key, actorName: "Jordi", at: changedAt },
    value: structuredClone(value),
    version: current.version + 1,
  };
}

function visibleParameters(): components["schemas"]["Parameters"] {
  const modules = currentMockScenario().branding.modules;
  return {
    ...settingsState.parameters,
    blocks: settingsState.parameters.blocks
      .map((block) => ({
        ...block,
        rows: block.rows.filter(
          (item) => item.module === undefined || modules.includes(item.module),
        ),
      }))
      .filter((block) => block.rows.length > 0),
  };
}

const memberFilterLabels: Readonly<Record<string, string>> = {
  birthDate: "Data de naixement",
  bookingBlocked: "Reserves bloquejades",
  city: "Població",
  displayStatus: "Estat",
  dogLevelId: "Nivell del gos",
  dogName: "Gos",
  familyGroupId: "Grup familiar",
  freeTrainingAllowed: "Entrenament lliure",
  fullName: "Abonat",
  gender: "Gènere",
  hasPendingDocuments: "Documents pendents",
  imageRightsGranted: "Drets d'imatge",
  joinedAt: "Data d'alta",
  lastName: "Cognoms",
  leaveDate: "Data de baixa",
  memberNumber: "Número",
  nextInvoiceDate: "Proper rebut",
  paymentMethodType: "Pagament",
  planId: "Modalitat",
  postalCode: "CP",
  priceId: "Tarifa",
  roles: "Rols",
  status: "Estat",
};

const dogFilterLabels: Readonly<Record<string, string>> = {
  birthDate: "Data de naixement",
  breed: "Raça",
  chip: "Xip",
  freeTrainingAllowed: "Entrenament lliure",
  handlerName: "Guia",
  hasLicense: "Llicència",
  hasPendingDocuments: "Documents pendents",
  levelAssignedAt: "Al nivell des de",
  levelId: "Nivell",
  licenseOrganisation: "Organisme de llicència",
  memberId: "Abonat",
  name: "Gos",
  ownerName: "Abonat",
  registeredAt: "Data d'alta",
  sex: "Sexe",
  status: "Estat",
};

const auditFilterLabels: Readonly<Record<string, string>> = {
  action: "Acció",
  actorAccountId: "Actor",
  actorRole: "Rol de l'actor",
  at: "Data",
  entityId: "Identificador de l'entitat",
  entityType: "Tipus d'entitat",
  impersonatedMemberId: "Abonat suplantat",
  memberId: "Abonat",
  origin: "Origen",
};

function parseFilters(url: URL): ListFilter[] | undefined {
  const filters: ListFilter[] = [];
  for (const serialized of url.searchParams.getAll("filter")) {
    const first = serialized.indexOf(":");
    const second = serialized.indexOf(":", first + 1);
    const op = serialized.slice(first + 1, second);
    if (
      first <= 0 ||
      second <= first + 1 ||
      ![
        "between",
        "contains",
        "eq",
        "exists",
        "gt",
        "gte",
        "in",
        "lt",
        "lte",
        "ne",
        "nin",
        "startsWith",
      ].includes(op)
    ) {
      return undefined;
    }
    filters.push({
      field: serialized.slice(0, first),
      op: op as ListFilter["op"],
      value: serialized.slice(second + 1),
    });
  }
  return filters;
}

function normalized(value: string): string {
  return value
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();
}

function compareValue(left: string, right: string): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return left.localeCompare(right);
}

function matchesValues(values: readonly string[], filter: ListFilter): boolean {
  const target = filter.value;
  const targets = target.split(",");
  switch (filter.op) {
    case "eq":
      return values.some((value) => value === target);
    case "ne":
      return values.every((value) => value !== target);
    case "in":
      return values.some((value) => targets.includes(value));
    case "nin":
      return values.every((value) => !targets.includes(value));
    case "contains":
      return values.some((value) => normalized(value).includes(normalized(target)));
    case "startsWith":
      return values.some((value) => normalized(value).startsWith(normalized(target)));
    case "exists":
      return target === "true" ? values.some((value) => value !== "") : values.length === 0;
    case "lt":
      return values.some((value) => compareValue(value, target) < 0);
    case "lte":
      return values.some((value) => compareValue(value, target) <= 0);
    case "gt":
      return values.some((value) => compareValue(value, target) > 0);
    case "gte":
      return values.some((value) => compareValue(value, target) >= 0);
    case "between": {
      const [start, end] = targets;
      return (
        start !== undefined &&
        end !== undefined &&
        values.some((value) => compareValue(value, start) >= 0 && compareValue(value, end) <= 0)
      );
    }
  }
  return false;
}

function memberValues(item: MemberListItem, field: string): string[] | undefined {
  switch (field) {
    case "birthDate":
      return item.birthDate === undefined ? [] : [item.birthDate];
    case "bookingBlocked":
      return [String(item.bookingBlocked)];
    case "city":
      return item.city === undefined ? [] : [item.city];
    case "displayStatus":
      return [item.displayStatus.kind];
    case "dogLevelId":
      return item.dogs.flatMap((dog) => (dog.level === undefined ? [] : [dog.level.id]));
    case "dogName":
      return item.dogs.map((dog) => dog.name);
    case "familyGroupId":
      return item.familyGroup === undefined ? [] : [item.familyGroup.id];
    case "freeTrainingAllowed":
      return [String(item.freeTraining)];
    case "fullName":
      return [item.fullName];
    case "gender":
      return item.gender === undefined ? [] : [item.gender];
    case "hasPendingDocuments":
      return [String((item.pendingDocuments?.length ?? 0) > 0)];
    case "imageRightsGranted":
      return [String(item.imageRights?.granted ?? false)];
    case "joinedAt":
      return item.joinedAt === undefined ? [] : [item.joinedAt];
    case "lastName":
      return [item.fullName.split(" ").slice(1).join(" ")];
    case "leaveDate":
      return item.leaveDate === undefined ? [] : [item.leaveDate];
    case "memberNumber":
      return item.memberNumber === undefined ? [] : [String(item.memberNumber)];
    case "nextInvoiceDate":
      return item.nextInvoiceDate === undefined ? [] : [item.nextInvoiceDate];
    case "paymentMethodType":
      return item.paymentMethod === undefined ? [] : [item.paymentMethod.type];
    case "planId":
      return item.plan === undefined ? [] : [item.plan.id];
    case "postalCode":
      return item.postalCode === undefined ? [] : [item.postalCode];
    case "priceId":
      return [];
    case "roles":
      return item.roles ?? [];
    case "status":
      return [item.displayStatus.kind === "LEFT" ? "LEFT" : "ACTIVE"];
    default:
      return undefined;
  }
}

function dogValues(item: DogListItem, field: string): string[] | undefined {
  switch (field) {
    case "birthDate":
      return [];
    case "breed":
      return [item.breed];
    case "chip":
      return item.chip === undefined ? [] : [item.chip];
    case "freeTrainingAllowed":
      return [String(item.freeTraining?.allowed ?? false)];
    case "handlerName":
      return item.handlerName === undefined ? [] : [item.handlerName];
    case "hasLicense":
      return [String(item.licenses.length > 0)];
    case "hasPendingDocuments":
      return [String(item.pendingDocuments.length > 0)];
    case "levelAssignedAt":
      return item.levelAssignedAt === undefined ? [] : [item.levelAssignedAt];
    case "levelId":
      return item.level === undefined ? [] : [item.level.id];
    case "licenseOrganisation":
      return item.licenses.map((license) => license.organisation);
    case "memberId":
      return [item.owner.id];
    case "name":
      return [item.name];
    case "ownerName":
      return [item.owner.fullName];
    case "registeredAt":
      return [item.registeredAt];
    case "sex":
      return [item.sex];
    case "status":
      return [item.displayStatus.kind === "INACTIVE" ? "INACTIVE" : "ACTIVE"];
    default:
      return undefined;
  }
}

function auditValues(item: AuditEntryListItem, field: string): string[] | undefined {
  switch (field) {
    case "action":
      return [item.action];
    case "actorAccountId":
      return item.actorAccountId === undefined ? [] : [item.actorAccountId];
    case "actorRole":
      return [item.actorRole];
    case "at":
      return [item.at];
    case "entityId":
      return [item.entityId];
    case "entityType":
      return [item.entityType];
    case "impersonatedMemberId":
      return item.impersonatedMemberId === undefined ? [] : [item.impersonatedMemberId];
    case "memberId":
      return item.memberId === undefined ? [] : [item.memberId];
    case "origin":
      return [item.origin];
    default:
      return undefined;
  }
}

function auditPage(
  request: Request,
  source: readonly AuditEntryListItem[],
): AuditListResponse | undefined {
  const url = new URL(request.url);
  const filters = parseFilters(url);
  if (
    filters === undefined ||
    filters.some((filter) => auditFilterLabels[filter.field] === undefined)
  ) {
    return undefined;
  }
  const query = normalized(url.searchParams.get("q") ?? "");
  const searched =
    query === ""
      ? [...source]
      : source.filter((entry) =>
          [entry.action, entry.actorName ?? "", entry.entityLabel ?? "", entry.entityType].some(
            (value) => normalized(value).includes(query),
          ),
        );
  const filtered = filterItems(searched, filters, auditValues);
  if (filtered === undefined) return undefined;
  const direction = url.searchParams.getAll("sort")[0]?.endsWith(",asc") === true ? 1 : -1;
  const sorted = [...filtered].sort((left, right) => left.at.localeCompare(right.at) * direction);
  const { page, size } = pagination(url);
  return {
    appliedFilters: filters,
    items: sorted.slice(page * size, (page + 1) * size),
    page,
    size,
    totalItems: sorted.length,
    totalPages: Math.ceil(sorted.length / size),
  };
}

function filterItems<Item>(
  items: readonly Item[],
  filters: readonly ListFilter[],
  values: (item: Item, field: string) => string[] | undefined,
): Item[] | undefined {
  const first = items[0];
  if (first !== undefined && filters.some((filter) => values(first, filter.field) === undefined)) {
    return undefined;
  }
  return items.filter((item) =>
    filters.every((filter) => matchesValues(values(item, filter.field) ?? [], filter)),
  );
}

function filterMembersBySearch(items: readonly MemberListItem[], query: string): MemberListItem[] {
  const target = normalized(query);
  if (target === "") {
    return [...items];
  }
  return items.filter((item) =>
    [
      item.fullName,
      item.idDocument ?? "",
      ...(item.contact?.emails.map((entry) => entry.email) ?? []),
      ...(item.contact?.phones.map((entry) => `${entry.prefix}${entry.number}`) ?? []),
      ...item.dogs.map((dog) => dog.name),
    ].some((value) => normalized(value).includes(target)),
  );
}

function filterDogsBySearch(items: readonly DogListItem[], query: string): DogListItem[] {
  const target = normalized(query);
  if (target === "") {
    return [...items];
  }
  return items.filter((item) =>
    [item.name, item.owner.fullName, item.handlerName ?? "", item.chip ?? ""].some((value) =>
      normalized(value).includes(target),
    ),
  );
}

function labelForValue<Item>(
  items: readonly Item[],
  field: string,
  value: string,
  values: (item: Item, field: string) => string[] | undefined,
): string {
  if (value === "true") {
    return "Sí";
  }
  if (value === "false") {
    return "No";
  }
  const member = items.find((item) => values(item, field)?.includes(value));
  if (member !== undefined && field === "planId") {
    return (member as MemberListItem).plan?.name ?? value;
  }
  if (member !== undefined && field === "levelId") {
    return (member as unknown as DogListItem).level?.name ?? value;
  }
  return value;
}

function facetValues<Item>(
  items: readonly Item[],
  field: string,
  values: (item: Item, field: string) => string[] | undefined,
) {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    values(item, field)?.forEach((value) => {
      if (value !== "") {
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
    });
  });
  return [...counts.entries()]
    .map(([value, count]) => ({ count, label: labelForValue(items, field, value, values), value }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function sortMembers(items: MemberListItem[], values: readonly string[]): MemberListItem[] {
  const sort = values[0]?.split(",");
  const field = sort?.[0] ?? "";
  const direction = sort?.[1] === "desc" ? -1 : 1;
  const getters: Readonly<Record<string, (item: MemberListItem) => string | number>> = {
    city: (item) => item.city ?? "",
    firstName: (item) => item.fullName.split(" ")[0] ?? "",
    joinedAt: (item) => item.joinedAt ?? "",
    lastName: (item) => item.fullName.split(" ").slice(1).join(" "),
    leaveDate: (item) => item.leaveDate ?? "",
    memberNumber: (item) => item.memberNumber ?? 0,
    nextInvoiceDate: (item) => item.nextInvoiceDate ?? "",
  };
  const getter = getters[field];
  return getter === undefined
    ? items
    : [...items].sort(
        (left, right) =>
          String(getter(left)).localeCompare(String(getter(right)), undefined, { numeric: true }) *
          direction,
      );
}

function sortDogs(items: DogListItem[], values: readonly string[]): DogListItem[] {
  const sort = values[0]?.split(",");
  const field = sort?.[0] ?? "";
  const direction = sort?.[1] === "desc" ? -1 : 1;
  const getters: Readonly<Record<string, (item: DogListItem) => string | number>> = {
    breed: (item) => item.breed,
    levelAssignedAt: (item) => item.levelAssignedAt ?? "",
    levelOrder: (item) => item.level?.code ?? "",
    name: (item) => item.name,
    ownerLastName: (item) => item.owner.fullName.split(" ").slice(1).join(" "),
    registeredAt: (item) => item.registeredAt,
  };
  const getter = getters[field];
  return getter === undefined
    ? items
    : [...items].sort(
        (left, right) =>
          String(getter(left)).localeCompare(String(getter(right)), undefined, { numeric: true }) *
          direction,
      );
}

function appliedFilters(
  filters: readonly ListFilter[],
  labels: Readonly<Record<string, string>>,
  valueLabel: (filter: ListFilter) => string,
) {
  return filters.map((filter) => ({
    ...filter,
    label: labels[filter.field] ?? filter.field,
    valueLabel: valueLabel(filter),
  }));
}

function pagination(url: URL) {
  const requestedSize = Number(url.searchParams.get("size") ?? 50);
  const size = [20, 50, 200, 1000].includes(requestedSize) ? requestedSize : 50;
  const requestedPage = Number(url.searchParams.get("page") ?? 0);
  const page = Number.isInteger(requestedPage) && requestedPage >= 0 ? requestedPage : 0;
  return { page, size };
}

function apiError(code: string, message: string, status: number, headers?: HeadersInit) {
  return HttpResponse.json<ApiErrorResponse>(
    { code, details: {}, message, traceId: "mock-trace-id" },
    { status, ...(headers === undefined ? {} : { headers }) },
  );
}

function validationError(fieldErrors: { code: string; field: string }[]) {
  return HttpResponse.json<ApiErrorResponse>(
    {
      code: "VALIDATION_ERROR",
      details: { fieldErrors },
      message: "Validation failed",
      traceId: "mock-trace-id",
    },
    { status: 400 },
  );
}

function signupConfiguration(request: Request) {
  const scenario = currentMockScenario();
  const modules = scenario.branding.modules;
  const config = signupConfig({
    acceptLanguage: request.headers.get("Accept-Language"),
    billing: modules.includes("BILLING"),
    enabled: scenario.branding.signup.enabled && scenario.branding.status === "ACTIVE",
    familyGroup: modules.includes("FAMILY_GROUP"),
    packs: modules.includes("PACKS"),
    privacyPolicyUrl: scenario.branding.legal.privacyPolicyUrl,
    stripe: scenario.signupStripe === true,
    ...(request.headers.has("Authorization") ? { member: signupMemberFixture } : {}),
  });
  return config;
}

function signupUpfront(addDog = false) {
  return signupUpfrontFixture({
    addDog,
    currency: currentMockScenario().branding.currency,
  });
}

function currentMemberDog(id: string): MeDog | undefined {
  return memberDogsState.dogs.find((dog) => dog.id === id);
}

function currentDog(id: string): DogDetail | undefined {
  return censusRecordState.dogs[id];
}

function replaceDog(dog: DogDetail): DogDetail {
  censusRecordState.dogs[dog.dog.id] = dog;
  censusRecordState.memberOverview.dogs = censusRecordState.memberOverview.dogs.map((summary) =>
    summary.id === dog.dog.id
      ? {
          ...summary,
          breed: dog.dog.breed,
          freeTrainingAllowed: dog.freeTraining?.allowed ?? false,
          ...(dog.level === undefined ? {} : { level: dog.level }),
          name: dog.dog.name,
        }
      : summary,
  );
  return dog;
}

function mockTokens() {
  // MSW cannot issue the production HttpOnly cookie. Browser mock builds keep this
  // token only in the AuthClient's guarded, memory-only mock store.
  return {
    access_token: "mock-access-token",
    refresh_token: "mock-refresh-token",
    scope: "openid profile",
    token_type: "Bearer",
    expires_in: 900,
  };
}

function orderedCatalog<Item extends { active: boolean; order: number }>(items: readonly Item[]) {
  return [...items].sort(
    (left, right) => Number(right.active) - Number(left.active) || left.order - right.order,
  );
}

function catalogResponse<Item>(items: readonly Item[]) {
  return { items, totalItems: items.length };
}

function localizedDefault(values: Record<string, string> | undefined, fallback: string): string {
  return values?.ca ?? Object.values(values ?? {})[0] ?? fallback;
}

function replaceCatalogItem<Item extends { id: string }>(items: Item[], item: Item): Item {
  const index = items.findIndex((candidate) => candidate.id === item.id);
  if (index >= 0) {
    items[index] = item;
  }
  return item;
}

function orderedIds<Item extends { id: string; order: number }>(
  items: Item[],
  ids: readonly string[],
): Item[] | undefined {
  if (ids.length !== items.length || new Set(ids).size !== items.length) {
    return undefined;
  }
  const existing = new Set(items.map((item) => item.id));
  if (ids.some((id) => !existing.has(id))) {
    return undefined;
  }
  const byId = new Map(items.map((item) => [item.id, item]));
  return ids.flatMap((id, index) => {
    const item = byId.get(id);
    return item === undefined ? [] : [{ ...item, order: index * 10 }];
  });
}

export const handlers = [
  http.get("*/api/v1/branding", () =>
    HttpResponse.json(currentMockScenario().branding, {
      headers: { ETag: '"mock-branding-v1"' },
    }),
  ),
  http.get("*/api/v1/manifest.webmanifest", () => {
    const branding = currentMockScenario().branding;
    return HttpResponse.json({
      display: "standalone",
      name: branding.club.name,
      short_name: branding.club.name,
      start_url: "/inici",
    });
  }),
  http.get("*/api/v1/me", ({ request }) => {
    if (request.headers.get("Authorization") === "Bearer mock-impersonation-token") {
      mockScenario("impersonated");
    }
    return HttpResponse.json(currentMockScenario().me);
  }),
  http.get("*/api/v1/dashboard", () => {
    const scenario = currentMockScenario();
    const modules = scenario.branding.modules;
    const response = structuredClone(dashboardState);
    if (!modules.includes("FREE_TRAINING")) response.kpis.trainingBookings = null;
    if (scenario.dashboardNulls === true) {
      response.dogsByLevel = null;
      response.kpis.trainingBookings = null;
    }
    if (!modules.includes("BILLING")) {
      response.pendingSignups = response.pendingSignups === null
        ? null
        : {
            ...response.pendingSignups,
            items: response.pendingSignups.items.map((item) => {
              const sanitized = {
                ...item,
                warnings: item.warnings.filter((warning) => warning !== "ACCOUNT_NOT_PROVIDED"),
              };
              delete sanitized.paymentMethodType;
              return sanitized;
            }),
          };
    }
    return HttpResponse.json(response);
  }),
  http.get("*/api/v1/dashboard/counters", () => {
    const modules = currentMockScenario().branding.modules;
    const counters: DashboardCounters = {
      followUpUnread: modules.includes("TASKS") ? 5 : 0,
      pendingRequests: modules.includes("INACTIVITY") ? 1 : 0,
      pendingSignups: dashboardState.pendingSignups?.count ?? 0,
    };
    return HttpResponse.json(counters);
  }),
  http.get("*/api/v1/members/:id/signup", ({ params }) => {
    const id = String(params.id);
    const pending = dashboardState.pendingSignups?.items.find((item) => item.memberId === id);
    if (pending === undefined) return apiError("NOT_FOUND", "Signup not found", 404);
    if (id === memberSignupReviewState.member.id) {
      if (currentMockScenario().signupReviewManual === true) {
        const response = structuredClone(memberSignupReviewState);
        if (response.upfront !== undefined) {
          response.upfront.lines = response.upfront.lines.map((line) => {
            const dueLine = { ...line, provider: "MANUAL" as const, status: "DUE" as const };
            delete dueLine.paidAmount;
            return dueLine;
          });
          response.upfront.totalPaid.amountMinor = 0;
        }
        response.warnings = [...response.warnings, "UPFRONT_UNPAID"];
        return HttpResponse.json(response);
      }
      return HttpResponse.json(memberSignupReviewState);
    }
    const response = structuredClone(memberSignupReviewState);
    response.member.id = id;
    response.member.firstName = pending.shortName.split(" ")[0] ?? pending.shortName;
    response.member.fullName = pending.shortName;
    response.member.accountMissing = pending.warnings.includes("ACCOUNT_NOT_PROVIDED");
    if (response.member.accountMissing) {
      response.member.paymentMethod = { type: "SEPA_DD" };
    }
    response.signup.pendingDays = pending.pendingDays;
    response.signup.source = pending.dogs.some((dog) => dog.isAddDog) ? "APP_ADD_DOG" : "PUBLIC";
    response.warnings = [...pending.warnings];
    const dogTemplate = response.dogs[0];
    if (dogTemplate === undefined) return apiError("NOT_FOUND", "Signup dog not found", 404);
    response.dogs = pending.dogs.map((dog, index) => ({
      ...dogTemplate,
      breed: dog.breed,
      id: `44000000-0000-4000-8000-00000000000${String(index + 2)}`,
      name: dog.name,
    }));
    return HttpResponse.json(response);
  }),
  http.post("*/api/v1/members/:id/validation", async ({ params, request }) => {
    if (String(params.id) !== memberSignupReviewState.member.id) {
      return apiError("NOT_FOUND", "Signup not found", 404);
    }
    const body = (await request.json()) as ValidationRequest;
    if (body.version !== memberSignupReviewState.version) {
      return apiError("STALE_VERSION", "Stale signup version", 409);
    }
    const missingLevel = body.dogs.findIndex((dog) => dog.levelId === undefined);
    if (missingLevel >= 0) {
      return HttpResponse.json<ApiErrorResponse>(
        {
          code: "LEVEL_REQUIRED",
          details: { fieldErrors: [{ code: "LEVEL_REQUIRED", field: `dogs.${String(missingLevel)}.levelId` }] },
          message: "Initial level is required",
          traceId: "mock-trace-id",
        },
        { status: 422 },
      );
    }
    if (
      currentMockScenario().branding.modules.includes("BILLING") &&
      body.planId === "10000000-0000-4000-8000-000000000001" &&
      body.nextInvoiceDate === undefined
    ) {
      return HttpResponse.json<ApiErrorResponse>(
        {
          code: "NEXT_INVOICE_DATE_REQUIRED",
          details: { fieldErrors: [{ code: "NEXT_INVOICE_DATE_REQUIRED", field: "nextInvoiceDate" }] },
          message: "Next invoice date is required",
          traceId: "mock-trace-id",
        },
        { status: 422 },
      );
    }
    const dryRun = new URL(request.url).searchParams.get("dryRun") === "true";
    if (dryRun) {
      return HttpResponse.json({
        nextInvoiceDate: body.nextInvoiceDate ?? memberSignupReviewState.proposals.nextInvoiceDate,
        price: {
          amount: { amountMinor: 6000, currency: "EUR" },
          id: body.priceId ?? "20000000-0000-4000-8000-000000000001",
          periodicity: "MONTHLY" as const,
        },
        upfront: memberSignupReviewState.upfront,
        warnings: memberSignupReviewState.warnings,
      });
    }
    const pendingSignups = dashboardState.pendingSignups;
    if (pendingSignups !== null) {
      pendingSignups.items = pendingSignups.items.filter((item) => item.memberId !== String(params.id));
      pendingSignups.count = pendingSignups.items.length;
      if (dashboardState.kpis.pendingSignups !== null) {
        dashboardState.kpis.pendingSignups.value = pendingSignups.count;
      }
    }
    return HttpResponse.json({
      accountId: "46000000-0000-4000-8000-000000000001",
      dogIds: body.dogs.map((dog) => dog.dogId),
      memberId: memberSignupReviewState.member.id,
      number: 1042,
    });
  }),
  http.post("*/api/v1/members/:id/rejection", async ({ params, request }) => {
    if (String(params.id) !== memberSignupReviewState.member.id) {
      return apiError("NOT_FOUND", "Signup not found", 404);
    }
    const body = (await request.json()) as RejectionRequest;
    if (body.version !== memberSignupReviewState.version) {
      return apiError("STALE_VERSION", "Stale signup version", 409);
    }
    if (body.reason.trim().length < 3 || body.reason.length > 500) {
      return validationError([{ code: "INVALID_LENGTH", field: "reason" }]);
    }
    return HttpResponse.json({
      dogIds: memberSignupReviewState.dogs.map((dog) => dog.id),
      memberId: memberSignupReviewState.member.id,
      status: "LEFT" as const,
    });
  }),
  http.get("*/api/v1/me/onboarding", () => HttpResponse.json(currentOnboardingState())),
  http.put("*/api/v1/me/onboarding", async ({ request }) => {
    const body = (await request.json()) as OnboardingRequest;
    const state = currentOnboardingState();
    if (!body.consentAccepted) {
      return validationError([{ code: "REQUIRED", field: "consentAccepted" }]);
    }
    if (currentMockScenario().outdatedConsentOnce === true && !outdatedConsentReturned) {
      outdatedConsentReturned = true;
      onboardingState = {
        ...state,
        requiredConsent:
          state.requiredConsent == null
            ? null
            : { ...state.requiredConsent, version: "2026-09-02" },
      };
      persistOnboarding(onboardingState);
      return apiError("CONSENT_VERSION_OUTDATED", "Consent version is outdated", 422);
    }
    if (state.requiredConsent?.version !== body.consentVersion) {
      return apiError("CONSENT_VERSION_OUTDATED", "Consent version is outdated", 422);
    }
    if (body.fields?.locale !== undefined && !["ca", "es", "en"].includes(body.fields.locale)) {
      return apiError("LOCALE_NOT_SUPPORTED", "Locale not supported", 400);
    }
    onboardingState = { ...state, pending: false, requiredConsent: null };
    persistOnboarding(onboardingState);
    return HttpResponse.json(onboardingState);
  }),
  http.post("*/api/v1/me/onboarding/postpone", () => {
    const state = currentOnboardingState();
    onboardingState = {
      ...state,
      postponeRemaining: Math.max(0, state.postponeRemaining - 1),
    };
    persistOnboarding(onboardingState);
    return HttpResponse.json(onboardingState);
  }),
  http.patch("*/api/v1/me", async ({ request }) => {
    const body = (await request.json()) as UpdateMeRequest;
    const scenario = currentMockScenario();
    if (body.locale !== undefined && !scenario.branding.locales.includes(body.locale)) {
      return apiError("LOCALE_NOT_SUPPORTED", "Locale not supported", 400);
    }
    return HttpResponse.json({
      ...scenario.me,
      account: {
        ...scenario.me.account,
        ...(body.locale === undefined ? {} : { locale: body.locale }),
        ...(body.name === undefined ? {} : { name: body.name }),
      },
    });
  }),
  http.put("*/api/v1/me/password", async ({ request }) => {
    const body = (await request.json()) as UpdatePasswordRequest;
    if (body.new !== body.repeat) {
      return apiError("PASSWORD_MISMATCH", "Passwords do not match", 400);
    }
    if (body.new.length < 8) {
      return apiError("PASSWORD_TOO_SHORT", "Password is too short", 400);
    }
    if (currentMockScenario().me.account.hasPassword && body.current !== "secret-password") {
      return apiError("INVALID_CREDENTIALS", "Invalid current password", 401);
    }
    return new HttpResponse(null, { status: 200 });
  }),
  http.put("*/api/v1/me/profile", async ({ request }) => {
    const body = (await request.json()) as UpdateProfileRequest;
    if (currentMockScenario().me.membership?.roles.includes(body.activeProfile) !== true) {
      return apiError("PROFILE_NOT_AVAILABLE", "Profile not available", 422);
    }
    return HttpResponse.json({ access_token: `mock-${body.activeProfile.toLowerCase()}-token` });
  }),
  http.get("*/api/v1/me/profile", () => HttpResponse.json(memberProfileState)),
  http.patch("*/api/v1/me/profile", async ({ request }) => {
    const body = (await request.json()) as MeProfilePatch;
    if (body.contactEmails?.[0]?.email === "readonly@example.test") {
      return validationError([{ code: "READ_ONLY", field: "firstName" }]);
    }
    if (body.version !== memberProfileState.version) {
      return apiError("STALE_VERSION", "Stale version", 409);
    }
    memberProfileState = {
      ...memberProfileState,
      ...(body.address === undefined ? {} : { address: body.address }),
      ...(body.contactEmails === undefined
        ? {}
        : { contactEmails: body.contactEmails.map((email) => ({ ...email, bounced: false })) }),
      ...(body.phones === undefined ? {} : { phones: body.phones }),
      version: memberProfileState.version + 1,
    };
    return HttpResponse.json(memberProfileState);
  }),
  http.get("*/api/v1/me/dogs", () => HttpResponse.json(memberDogsState)),
  http.get("*/api/v1/signup", ({ request }) =>
    HttpResponse.json(signupConfiguration(request)),
  ),
  http.post("*/api/v1/signup/identity-checks", async ({ request }) => {
    const body = (await request.json()) as SignupIdentityCheckRequest;
    const email = body.emails[0]?.toLocaleLowerCase() ?? "";
    if (email.startsWith("limit")) {
      return apiError("RATE_LIMITED", "Rate limited", 429, { "Retry-After": "120" });
    }
    if (body.idDocument.value.trim() === "" || body.idDocument.value === "12345678A") {
      return validationError([{ code: "INVALID_ID_DOCUMENT", field: "idDocument.value" }]);
    }
    if (email === "existing@example.test") {
      return HttpResponse.json({ maskedEmail: "e••••••g@e••••••.test", result: "VERIFICATION_SENT" });
    }
    if (email === "pending@example.test") {
      return HttpResponse.json({ result: "SIGNUP_ALREADY_PENDING" });
    }
    if (email === "contact@example.test") {
      return HttpResponse.json({ result: "CONTACT_CLUB" });
    }
    return HttpResponse.json({ result: "NEW" });
  }),
  http.get("*/api/v1/signup/towns", ({ request }) => {
    const postalCode = new URL(request.url).searchParams.get("postalCode") ?? "";
    if (postalCode === "limit") {
      return apiError("RATE_LIMITED", "Rate limited", 429, { "Retry-After": "60" });
    }
    return HttpResponse.json(signupTownFixtures[postalCode] ?? []);
  }),
  http.post("*/api/v1/signup/upload-urls", async ({ request }) => {
    const body = (await request.json()) as SignupUploadRequest;
    if (!body.contentType.startsWith("image/") && body.contentType !== "application/pdf") {
      return apiError("FILE_TYPE_NOT_ALLOWED", "File type not allowed", 400);
    }
    if (body.sizeBytes > 25 * 1024 * 1024) {
      return apiError("FILE_TOO_LARGE", "File too large", 400);
    }
    const fileKey = `signup/mock/202609/mock-upload/${encodeURIComponent(body.fileName)}`;
    return HttpResponse.json({
      expiresAt: "2026-09-09T18:15:00Z",
      fileKey,
      uploadUrl: `https://uploads.example.test/${fileKey}`,
    });
  }),
  http.put("https://uploads.example.test/*", () => new HttpResponse(null, { status: 200 })),
  http.post("*/api/v1/signup/family-group-lookups", async ({ request }) => {
    if (!currentMockScenario().branding.modules.includes("FAMILY_GROUP")) {
      return apiError("MODULE_DISABLED", "Module disabled", 404);
    }
    const body = (await request.json()) as SignupFamilyLookupRequest;
    const holder = normalized(body.holderName).trim().replaceAll(/\s+/gu, " ");
    const dog = normalized(body.dogName).trim();
    return holder === "marta roca" && dog === "kiwi"
      ? HttpResponse.json({ holderDisplayName: "Marta R.", result: "FOUND" })
      : HttpResponse.json({ result: "NOT_FOUND" });
  }),
  http.post("*/api/v1/signup", async ({ request }) => {
    const body = (await request.json()) as SignupRequest;
    if ((body.website ?? "").trim() !== "") {
      return new HttpResponse(null, { status: 202 });
    }
    const scenario = currentMockScenario();
    if (!scenario.branding.signup.enabled || scenario.branding.status !== "ACTIVE") {
      return apiError("SIGNUP_CLOSED", "Signup closed", 409);
    }
    if (body.person.emails[0]?.startsWith("limit") === true) {
      return apiError("RATE_LIMITED", "Rate limited", 429, { "Retry-After": "120" });
    }
    if (!body.consents.privacyPolicy.accepted) {
      return validationError([{ code: "REQUIRED", field: "consents.privacyPolicy.accepted" }]);
    }
    if (body.consents.privacyPolicy.version !== "2026-09") {
      return apiError("CONSENT_VERSION_OUTDATED", "Consent version outdated", 422);
    }
    if (body.dog.chip === "registered") {
      return apiError("DOG_CHIP_ALREADY_REGISTERED", "Dog chip already registered", 422);
    }
    if (body.person.emails[0] === "pending@example.test") {
      return apiError("SIGNUP_ALREADY_PENDING", "Signup already pending", 409);
    }
    const checkoutRequired = scenario.signupStripe === true;
    return HttpResponse.json(
      {
        checkout: { required: checkoutRequired },
        memberId: "member-signup-357",
        signupToken: "mock-signup-token",
        upfront: signupUpfront(),
      },
      { status: 201 },
    );
  }),
  http.post("*/api/v1/me/dogs/signup", async ({ request }) => {
    if (!request.headers.has("Authorization")) {
      return apiError("UNAUTHENTICATED", "Authentication required", 401);
    }
    const body = (await request.json()) as MemberDogSignupRequest;
    if (body.dog.chip === "registered") {
      return apiError("DOG_CHIP_ALREADY_REGISTERED", "Dog chip already registered", 422);
    }
    return HttpResponse.json(
      {
        checkout: { required: false },
        dogId: "dog-pending-new",
        upfront: signupUpfront(true),
      },
      { status: 201 },
    );
  }),
  http.post("*/api/v1/checkout-sessions", async ({ request }) => {
    await request.json() as CheckoutSessionRequest;
    if (currentMockScenario().signupStripe !== true) {
      return apiError("PAYMENT_PROVIDER_NOT_ENABLED", "Payment provider not enabled", 422);
    }
    return HttpResponse.json(
      {
        checkoutSessionId: "cs_mock_signup",
        checkoutUrl: "https://checkout.test/cs_mock_signup",
      },
      { status: 201 },
    );
  }),
  http.put("*/api/v1/me/dogs/:id/instructor-note", async ({ params, request }) => {
    if (!currentMockScenario().branding.modules.includes("TASKS")) {
      return apiError("MODULE_DISABLED", "Module disabled", 404);
    }
    const dog = currentMemberDog(String(params.id));
    if (dog === undefined) {
      return apiError("NOT_FOUND", "Dog not found", 404);
    }
    const body = (await request.json()) as InstructorNoteRequest;
    if (body.text.length > 2000) {
      return validationError([{ code: "TOO_LONG", field: "text" }]);
    }
    const instructorNote = { text: body.text, updatedAt: "2026-09-06T16:00:00Z" };
    dog.instructorNote = instructorNote;
    return HttpResponse.json(instructorNote);
  }),
  http.put("*/api/v1/me/dogs/:id/photo", async ({ params, request }) => {
    const dog = currentMemberDog(String(params.id));
    if (dog === undefined) {
      return apiError("NOT_FOUND", "Dog not found", 404);
    }
    const body = (await request.json()) as PhotoRequest;
    dog.photoUrl = `https://files.example.test/${body.fileKey}`;
    return HttpResponse.json({ photoUrl: dog.photoUrl });
  }),
  http.post("*/api/v1/me/dogs/:id/documents", async ({ params, request }) => {
    const dog = currentMemberDog(String(params.id));
    if (dog === undefined) {
      return apiError("NOT_FOUND", "Dog not found", 404);
    }
    const body = (await request.json()) as DogDocumentUploadRequest;
    if (!["INSURANCE", "VACCINATION_CARD"].includes(body.type)) {
      return apiError("DOCUMENT_TYPE_UNKNOWN", "Document type unknown", 400);
    }
    const existing = dog.documents.find((document) => document.type === body.type);
    const file = {
      id: `file-member-${String(existing?.files.length ?? 0)}-${dog.id}`,
      name: body.name,
      uploadedAt: "2026-09-06T16:00:00Z",
      url: `https://files.example.test/${body.fileKey}`,
    };
    const document: components["schemas"]["DogDocument"] = existing ?? {
      files: [],
      id: `document-member-${body.type.toLocaleLowerCase()}-${dog.id}`,
      state: "PENDING",
      type: body.type,
      typeLabel: body.type === "VACCINATION_CARD" ? "Cartilla de vacunes" : "Assegurança",
    };
    document.files = [...document.files, file];
    document.state = "RECEIVED";
    if (existing === undefined) {
      dog.documents = [...dog.documents, document];
    }
    return HttpResponse.json(document, { status: 201 });
  }),
  http.get("*/api/v1/country-profile/postal-codes/:code", ({ params }) => {
    const code = String(params.code);
    return HttpResponse.json(postalTownFixtures[code] ?? []);
  }),
  http.get("*/api/v1/parameters", ({ request }) => {
    const block = new URL(request.url).searchParams.get("block");
    const response = visibleParameters();
    return HttpResponse.json({
      ...response,
      blocks:
        block === null ? response.blocks : response.blocks.filter((item) => item.key === block),
    });
  }),
  http.get<{ key: string }, never, Parameter | ApiErrorResponse>(
    "*/api/v1/parameters/:key",
    ({ params, request }) => {
      const key = params.key;
      const locale = request.headers.get("Accept-Language")?.split(/[-,]/u)[0] ?? "ca";
      const scenario = currentMockScenario();
      const configured = findParameter(key);
      if (configured !== undefined) {
        if (
          configured.module !== undefined &&
          !scenario.branding.modules.includes(configured.module)
        ) {
          return apiError("MODULE_DISABLED", "Module disabled", 404);
        }
        return HttpResponse.json(configured);
      }
      const base: Omit<Parameter, "key" | "label" | "type" | "value" | "version"> = {
        block: "general",
        constraints: {},
        default: null,
        editableBy: "CLUB",
        help: "",
        history: [],
        isOverride: true,
      };
      if (key === "levels.enabled") {
        return HttpResponse.json<Parameter>({
          ...base,
          key,
          label: "Nivells",
          type: "BOOLEAN",
          value: true,
          version: 1,
        });
      }
      if (key === "billing.entryFeePerDog") {
        return HttpResponse.json<Parameter>({
          ...base,
          key,
          label: "Entrada per gos",
          type: "MONEY",
          value: { amountMinor: 10000, currency: "EUR" },
          version: 1,
        });
      }
      if (key === "census.dogDocumentTypes") {
        const labels =
          locale === "es"
            ? ["Cartilla de vacunas", "Seguro"]
            : locale === "en"
              ? ["Vaccination record", "Insurance"]
              : ["Cartilla de vacunes", "Assegurança"];
        return HttpResponse.json<Parameter>({
          ...base,
          key,
          label: "Documents",
          type: "LIST",
          value: [
            { code: "VACCINATION_CARD", label: labels[0], required: true },
            { code: "INSURANCE", label: labels[1], required: false },
          ],
          version: 2,
        });
      }
      if (key === "signup.text.imageConsent") {
        const club = scenario.branding.club.name;
        const contact = `contact@${scenario.branding.club.slug}.example.test`;
        const text =
          locale === "es"
            ? `Autorizo a ${club} a tomar fotografías y vídeos en los que aparezcamos mi perro o yo durante las clases, entrenamientos y actividades del club, y a publicarlos en los canales del club con la única finalidad de dar a conocer su actividad. Puedo retirar esta autorización en cualquier momento desde mi perfil o escribiendo a ${contact}; la retirada no afecta a publicaciones anteriores.`
            : locale === "en"
              ? `I authorize ${club} to take photographs and videos showing me or my dog during club classes, training sessions and activities, and to publish them on club channels solely to explain the club's activity. I can withdraw this authorization at any time from my profile or by writing to ${contact}; withdrawal does not affect earlier publications.`
              : `Autoritzo ${club} a fer fotografies i vídeos on aparegui jo i/o el meu gos durant les classes, entrenaments i activitats del club, i a publicar-los als canals del club amb l'única finalitat de donar a conèixer l'activitat del club. Puc retirar aquesta autorització en qualsevol moment des del meu perfil o escrivint a ${contact}; la retirada no afecta les publicacions fetes abans.`;
        return HttpResponse.json<Parameter>({
          ...base,
          key,
          label: "Autorització d'imatge",
          type: "TEXT",
          value: text,
          version: 3,
        });
      }
      return apiError("UNKNOWN_PARAMETER", "Unknown parameter", 400);
    },
  ),
  http.put("*/api/v1/parameters/:key", async ({ params, request }) => {
    const current = findParameter(String(params.key));
    if (current === undefined) {
      return apiError("UNKNOWN_PARAMETER", "Unknown parameter", 400);
    }
    if (current.editableBy !== "CLUB") {
      return apiError("PLATFORM_ONLY", "Platform-only parameter", 403);
    }
    if (
      current.module !== undefined &&
      !currentMockScenario().branding.modules.includes(current.module)
    ) {
      return apiError("MODULE_DISABLED", "Module disabled", 404);
    }
    const body = (await request.json()) as ParameterUpdate;
    if (body.version !== current.version) {
      return apiError("STALE_VERSION", "Stale parameter version", 409);
    }
    const next = changedParameter(current, body.value, body.reason);
    replaceParameter(next);
    return HttpResponse.json(next);
  }),
  http.delete("*/api/v1/parameters/:key", ({ params }) => {
    const current = findParameter(String(params.key));
    if (current === undefined) {
      return apiError("UNKNOWN_PARAMETER", "Unknown parameter", 400);
    }
    if (current.editableBy !== "CLUB") {
      return apiError("PLATFORM_ONLY", "Platform-only parameter", 403);
    }
    const next = changedParameter(current, current.default);
    next.isOverride = false;
    replaceParameter(next);
    return HttpResponse.json(next);
  }),
  http.get("*/api/v1/parameters/:key/history", ({ params }) => {
    const current = findParameter(String(params.key));
    return current === undefined
      ? apiError("UNKNOWN_PARAMETER", "Unknown parameter", 400)
      : HttpResponse.json(current.history);
  }),
  http.get("*/api/v1/club", () => {
    const branding = currentMockScenario().branding;
    const settings: ClubSettings = {
      countryProfile: branding.countryProfile.code,
      currency: branding.currency,
      defaultLocale: branding.defaultLocale,
      domains: [],
      id: "00000000-0000-4000-8000-000000000002",
      locales: branding.locales,
      modules: branding.modules,
      name: branding.club.name,
      paymentProviders: {
        SEPA_XML: { configured: true, enabled: true },
      },
      slug: branding.club.slug,
      status: branding.status,
      theme: branding.theme,
      timeZone: branding.timeZone,
      version: 1,
    };
    return HttpResponse.json(settings);
  }),
  http.get("*/api/v1/club/opening-hours", () => {
    const current = findParameter("club.openingHours");
    return current === undefined
      ? apiError("UNKNOWN_PARAMETER", "Unknown parameter", 400)
      : HttpResponse.json(current);
  }),
  http.put("*/api/v1/club/opening-hours", async ({ request }) => {
    const current = findParameter("club.openingHours");
    if (current === undefined) {
      return apiError("UNKNOWN_PARAMETER", "Unknown parameter", 400);
    }
    const body = (await request.json()) as OpeningHoursUpdate;
    if (body.version !== current.version) {
      return apiError("STALE_VERSION", "Stale opening-hours version", 409);
    }
    const next = changedParameter(current, body.value, body.reason);
    replaceParameter(next);
    return HttpResponse.json(next);
  }),
  http.get("*/api/v1/club/holidays", () => {
    const current = findParameter("club.holidays");
    return current === undefined
      ? apiError("UNKNOWN_PARAMETER", "Unknown parameter", 400)
      : HttpResponse.json(current);
  }),
  http.put("*/api/v1/club/holidays", async ({ request }) => {
    const current = findParameter("club.holidays");
    if (current === undefined) {
      return apiError("UNKNOWN_PARAMETER", "Unknown parameter", 400);
    }
    const body = (await request.json()) as HolidaysUpdate;
    if (body.version !== current.version) {
      return apiError("STALE_VERSION", "Stale holidays version", 409);
    }
    const next = changedParameter(current, body.value, body.reason);
    replaceParameter(next);
    return HttpResponse.json(next);
  }),
  http.put("*/api/v1/club/modules/:module", async ({ params, request }) => {
    const module = String(params.module);
    if (!["FAQ", "PUSH", "LEARN_LINK"].includes(module)) {
      return apiError("PLATFORM_ONLY", "Platform-only module", 403);
    }
    const body = (await request.json()) as ModuleUpdate;
    const modules = currentMockScenario().branding.modules;
    return HttpResponse.json({
      modules: body.enabled
        ? [...new Set([...modules, module])]
        : modules.filter((candidate) => candidate !== module),
    });
  }),
  http.get("*/api/v1/me/sessions", () => HttpResponse.json(currentMockScenario().sessions)),
  http.delete("*/api/v1/me/sessions/:id", () => new HttpResponse(null, { status: 200 })),
  http.post("*/auth/magic-link", async ({ request }) => {
    const body = (await request.json()) as MagicLinkRequest;
    if (currentMockScenario().rateLimited === true || body.email.startsWith("limit")) {
      return apiError("RATE_LIMITED", "Rate limited", 429, { "Retry-After": "120" });
    }
    return new HttpResponse(null, { status: 202 });
  }),
  http.post("*/auth/handoff", () =>
    HttpResponse.json(
      {
        code: "mock-handoff-code",
        url: "http://127.0.0.1:4174/entrar?handoff=mock-handoff-code",
      },
      { status: 201 },
    ),
  ),
  http.post("*/oauth2/session", () =>
    HttpResponse.json({ redirectUrl: "/products?authorization=complete" }),
  ),
  http.post("*/oauth2/revoke", () => new HttpResponse(null, { status: 200 })),
  http.get("*/oauth2/authorize", ({ request }) =>
    HttpResponse.redirect(new URL("/products?authorization=complete", request.url), 302),
  ),
  http.get("*/connect/logout", ({ request }) => {
    const requested = new URL(request.url).searchParams.get("post_logout_redirect_uri");
    const destination = requested === null ? new URL("/login", request.url) : new URL(requested);
    return HttpResponse.redirect(destination, 302);
  }),
  http.post("*/oauth2/token", async ({ request }) => {
    const form = new URLSearchParams(await request.text());
    const grant = form.get("grant_type");
    const scenario = currentMockScenario();
    if (grant === "urn:agilityhub:grant:magic-link") {
      if (scenario.invalidMagicLink === true || form.get("token") === "invalid") {
        return apiError("MAGIC_LINK_INVALID", "Magic link invalid", 400);
      }
      return HttpResponse.json(mockTokens());
    }
    if (grant === "urn:agilityhub:grant:handoff") {
      return form.get("token") === "invalid"
        ? apiError("HANDOFF_INVALID", "Handoff invalid", 400)
        : HttpResponse.json(mockTokens());
    }
    if (grant === "password") {
      if (scenario.rateLimited === true) {
        return apiError("LOGIN_LOCKED", "Login locked", 429, { "Retry-After": "120" });
      }
      if (form.get("password") === "wrong-password") {
        return apiError("INVALID_CREDENTIALS", "Invalid credentials", 401);
      }
    }
    return HttpResponse.json(mockTokens());
  }),
  http.get("*/api/v1/audit-entries", async ({ request }) => {
    await delay(80);
    const page = auditPage(request, auditEntries);
    return page === undefined
      ? apiError("INVALID_FILTER", "Invalid audit filter", 400)
      : HttpResponse.json(page);
  }),
  http.get("*/api/v1/audit-entries/filter-values", ({ request }) => {
    const url = new URL(request.url);
    const field = url.searchParams.get("field") ?? "";
    const filters = parseFilters(url);
    if (
      auditFilterLabels[field] === undefined ||
      filters === undefined ||
      filters.some((filter) => auditFilterLabels[filter.field] === undefined)
    ) {
      return apiError("INVALID_FILTER", "Invalid audit filter", 400);
    }
    const filtered = filterItems(
      auditEntries,
      filters.filter((filter) => filter.field !== field),
      auditValues,
    );
    return filtered === undefined
      ? apiError("INVALID_FILTER", "Invalid audit filter", 400)
      : HttpResponse.json({ field, values: facetValues(filtered, field, auditValues) });
  }),
  http.get("*/api/v1/audit-entries/export", ({ request }) => {
    const requestedFormat = new URL(request.url).searchParams.get("format");
    const format = requestedFormat === "pdf" ? "PDF" : "XLSX";
    const job: ExportJob = {
      createdAt: "2026-08-03T10:25:00Z",
      format,
      id: "00000000-0000-4000-8000-000000000402",
      kind: "LIST",
      listKey: "audit-entries",
      progressPct: 0,
      status: "QUEUED",
    };
    exportPolls = 0;
    exportJobsState = [job, ...exportJobsState.filter((item) => item.id !== job.id)];
    return HttpResponse.json(
      { jobId: job.id, statusUrl: `/api/v1/exports/${job.id}` },
      { status: 202 },
    );
  }),
  http.get("*/api/v1/audit-entries/:id", ({ params }) => {
    const item = auditEntries.find((entry) => entry.id === String(params.id));
    if (item === undefined) return apiError("NOT_FOUND", "Audit entry not found", 404);
    const detail: AuditEntry = {
      ...item,
      eventIds: ["00000000-0000-4000-8000-000000000501"],
      traceId: "00000000-0000-4000-8000-000000000601",
    };
    return HttpResponse.json(detail);
  }),
  http.get("*/api/v1/members/:id/audit-entries", async ({ request }) => {
    await delay(80);
    const memberEntries = auditEntries.filter(
      (entry) =>
        entry.memberId === "00000000-0000-4000-8000-000000000087" ||
        entry.impersonatedMemberId === "00000000-0000-4000-8000-000000000087",
    );
    const page = auditPage(request, memberEntries);
    return page === undefined
      ? apiError("INVALID_FILTER", "Invalid audit filter", 400)
      : HttpResponse.json(page);
  }),
  http.get("*/api/v1/exports", () => {
    exportPolls += 1;
    if (exportPolls >= 2) {
      exportJobsState = exportJobsState.map((job) =>
        job.status === "QUEUED" || job.status === "RUNNING"
          ? {
              ...job,
              downloadUrl: `/api/v1/exports/${job.id}/download`,
              expiresAt: "2026-08-10T10:25:00Z",
              fileName: `auditoria_20260803-1025.${job.format === "PDF" ? "pdf" : "xlsx"}`,
              progressPct: 100,
              rows: auditEntries.length,
              status: "READY",
            }
          : job,
      );
    }
    return HttpResponse.json(exportJobsState);
  }),
  http.get("*/api/v1/exports/:id/download", ({ params }) => {
    const job = exportJobsState.find((item) => item.id === String(params.id));
    const pdf = job?.format === "PDF";
    const fileName = `auditoria_20260803-1025.${pdf ? "pdf" : "xlsx"}`;
    return new HttpResponse("mock audit export", {
      headers: {
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Type": pdf
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  }),
  http.get("*/api/v1/exports/:id", ({ params }) => {
    const job = exportJobsState.find((item) => item.id === String(params.id));
    return job === undefined
      ? apiError("NOT_FOUND", "Export not found", 404)
      : HttpResponse.json(job);
  }),
  http.get("*/api/v1/members", async ({ request }) => {
    await delay(120);
    const url = new URL(request.url);
    const filters = parseFilters(url);
    if (
      filters === undefined ||
      filters.some((filter) => memberFilterLabels[filter.field] === undefined)
    ) {
      return apiError("INVALID_FILTER", "Invalid member filter", 400);
    }
    const searched = filterMembersBySearch(censusMembers, url.searchParams.get("q") ?? "");
    const filtered = filterItems(searched, filters, memberValues);
    if (filtered === undefined) {
      return apiError("INVALID_FILTER", "Invalid member filter", 400);
    }
    const sorted = sortMembers(filtered, url.searchParams.getAll("sort"));
    const { page, size } = pagination(url);
    return HttpResponse.json({
      appliedFilters: appliedFilters(filters, memberFilterLabels, (filter) =>
        labelForValue(censusMembers, filter.field, filter.value, memberValues),
      ),
      items: sorted.slice(page * size, (page + 1) * size),
      page,
      size,
      totalItems: sorted.length,
      totalPages: Math.ceil(sorted.length / size),
    });
  }),
  http.get("*/api/v1/members/filter-values", ({ request }) => {
    const url = new URL(request.url);
    const field = url.searchParams.get("field") ?? "";
    const filters = parseFilters(url);
    if (
      memberFilterLabels[field] === undefined ||
      filters === undefined ||
      filters.some((filter) => memberFilterLabels[filter.field] === undefined)
    ) {
      return apiError("INVALID_FILTER", "Invalid member filter", 400);
    }
    const searched = filterMembersBySearch(censusMembers, url.searchParams.get("q") ?? "");
    const filtered = filterItems(
      searched,
      filters.filter((filter) => filter.field !== field),
      memberValues,
    );
    return filtered === undefined
      ? apiError("INVALID_FILTER", "Invalid member filter", 400)
      : HttpResponse.json({ field, values: facetValues(filtered, field, memberValues) });
  }),
  http.get(
    "*/api/v1/members/export",
    () =>
      new HttpResponse("mock member export", {
        headers: { "Content-Disposition": 'attachment; filename="members.mock"' },
        status: 200,
      }),
  ),
  http.get("*/api/v1/members/:id/overview", ({ params }) =>
    String(params.id) === censusRecordState.memberOverview.member.id
      ? HttpResponse.json(censusRecordState.memberOverview)
      : apiError("NOT_FOUND", "Member not found", 404),
  ),
  http.get("*/api/v1/members/:id", ({ params }) =>
    String(params.id) === censusRecordState.memberOverview.member.id
      ? HttpResponse.json(censusRecordState.memberOverview.member)
      : apiError("NOT_FOUND", "Member not found", 404),
  ),
  http.patch("*/api/v1/members/:id", async ({ params, request }) => {
    if (String(params.id) === memberSignupReviewState.member.id) {
      const body = (await request.json()) as MemberPatchRequest;
      const member = memberSignupReviewState.member;
      if (body.version !== member.version) {
        return apiError("STALE_VERSION", "Stale version", 409);
      }
      const { consents, contactEmails, ...memberPatch } = body;
      const updated = {
        ...member,
        ...memberPatch,
        ...(contactEmails === undefined
          ? {}
          : { contactEmails: contactEmails.map((entry) => ({ ...entry, bounced: false })) }),
        ...(consents?.imageRights === undefined
          ? {}
          : {
              consents: {
                imageRights: {
                  ...member.consents?.imageRights,
                  granted: consents.imageRights.granted,
                },
                privacyPolicy: member.consents?.privacyPolicy ?? {
                  acceptedAt: "2026-08-09T10:02:00Z",
                  version: "2026-09",
                },
              },
            }),
        fullName: [
          body.firstName ?? member.firstName,
          body.lastName1 ?? member.lastName1,
          body.lastName2 ?? member.lastName2,
        ].filter(Boolean).join(" "),
        version: member.version + 1,
      };
      memberSignupReviewState.member = updated;
      memberSignupReviewState.version = updated.version;
      return HttpResponse.json(updated);
    }
    if (String(params.id) !== censusRecordState.memberOverview.member.id) {
      return apiError("NOT_FOUND", "Member not found", 404);
    }
    const body = (await request.json()) as MemberPatchRequest;
    const member = censusRecordState.memberOverview.member;
    if (body.version !== member.version) {
      return apiError("STALE_VERSION", "Stale version", 409);
    }
    const fullName = [
      body.firstName ?? member.firstName,
      body.lastName1 ?? member.lastName1,
      body.lastName2 ?? member.lastName2,
    ]
      .filter((part): part is string => part !== undefined && part !== "")
      .join(" ");
    const { consents, contactEmails, ...memberPatch } = body;
    const updated: components["schemas"]["Member"] = {
      ...member,
      ...memberPatch,
      ...(contactEmails === undefined
        ? {}
        : { contactEmails: contactEmails.map((entry) => ({ ...entry, bounced: false })) }),
      ...(consents?.imageRights === undefined
        ? {}
        : {
            consents: {
              imageRights: {
                ...member.consents?.imageRights,
                granted: consents.imageRights.granted,
              },
              privacyPolicy: member.consents?.privacyPolicy ?? {
                acceptedAt: "2026-02-03T09:00:00Z",
                version: "2026-01",
              },
            },
          }),
      fullName,
      version: member.version + 1,
    };
    censusRecordState.memberOverview.member = updated;
    return HttpResponse.json(updated);
  }),
  http.patch("*/api/v1/members/:id/payment-method", async ({ params, request }) => {
    if (String(params.id) !== censusRecordState.memberOverview.member.id) {
      return apiError("NOT_FOUND", "Member not found", 404);
    }
    const body = (await request.json()) as PaymentMethodRequest;
    const iban = body.sepa?.iban?.replaceAll(" ", "");
    if (body.type === "SEPA_DD" && (iban === undefined || !/^ES\d{22}$/u.test(iban))) {
      return apiError("INVALID_IBAN", "Invalid IBAN", 400);
    }
    const paymentMethod = {
      ...(body.sepa?.holderName === undefined ? {} : { holderName: body.sepa.holderName }),
      ...(body.type === "SEPA_DD" && iban !== undefined
        ? { maskedAccount: `···· ···· ···· ···· ${iban.slice(-4)}` }
        : {}),
      type: body.type,
    };
    censusRecordState.memberOverview.member.paymentMethod = paymentMethod;
    censusRecordState.memberOverview.member.accountMissing = false;
    return HttpResponse.json(paymentMethod);
  }),
  http.post("*/api/v1/members/:id/booking-block", async ({ params, request }) => {
    if (String(params.id) !== censusRecordState.memberOverview.member.id) {
      return apiError("NOT_FOUND", "Member not found", 404);
    }
    const body = (await request.json()) as BookingBlockRequest;
    const member = censusRecordState.memberOverview.member;
    if (body.reason.trim() === "") {
      return apiError("VALIDATION_ERROR", "Reason is required", 400);
    }
    if (member.bookingBlock.active) {
      return apiError("BOOKING_BLOCK_ALREADY_ACTIVE", "Booking block already active", 409);
    }
    const bookingBlock = {
      active: true,
      byAccountId: "account-admin",
      reason: body.reason,
      since: "2026-09-06T15:00:00Z",
    };
    member.bookingBlock = bookingBlock;
    return HttpResponse.json(bookingBlock, { status: 201 });
  }),
  http.delete("*/api/v1/members/:id/booking-block", ({ params }) => {
    const member = censusRecordState.memberOverview.member;
    if (String(params.id) !== member.id) {
      return apiError("NOT_FOUND", "Member not found", 404);
    }
    if (!member.bookingBlock.active) {
      return apiError("BOOKING_BLOCK_NOT_ACTIVE", "Booking block not active", 409);
    }
    member.bookingBlock = { active: false };
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("*/api/v1/members/:id/access-resend", ({ params }) => {
    const member = censusRecordState.memberOverview.member;
    if (String(params.id) !== member.id) {
      return apiError("NOT_FOUND", "Member not found", 404);
    }
    if (member.status !== "ACTIVE" || member.accountId === undefined) {
      return apiError("MEMBER_NOT_ACTIVE", "Member not active", 409);
    }
    return HttpResponse.json({ sentTo: member.contactEmails[0]?.email ?? "" }, { status: 202 });
  }),
  http.post("*/api/v1/members/:id/impersonation-token", async ({ params, request }) => {
    if (String(params.id) !== censusRecordState.memberOverview.member.id) {
      return apiError("NOT_FOUND", "Member not found", 404);
    }
    await request.json();
    return HttpResponse.json(
      {
        expiresAt: "2026-09-06T16:00:00Z",
        launchUrl: "http://127.0.0.1:4173/perfil",
        token: "mock-impersonation-token",
      },
      { status: 201 },
    );
  }),
  http.put("*/api/v1/members/:id/roles", async ({ params, request }) => {
    const member = censusRecordState.memberOverview.member;
    if (String(params.id) !== member.id) {
      return apiError("NOT_FOUND", "Member not found", 404);
    }
    const body = (await request.json()) as RolesRequest;
    if (!body.roles.includes("MEMBER")) {
      return apiError("ROLE_MEMBER_REQUIRED", "Member role required", 422);
    }
    member.roles = body.roles;
    return HttpResponse.json({ roles: body.roles });
  }),
  http.put("*/api/v1/members/:id/notification-preferences", async ({ params, request }) => {
    if (String(params.id) !== censusRecordState.memberOverview.member.id) {
      return apiError("NOT_FOUND", "Member not found", 404);
    }
    const body = (await request.json()) as NotificationPreferencesPatch;
    const preferences = censusRecordState.memberOverview
      .notificationPreferences as NotificationPreferences;
    const updatedPreferences: NotificationPreferences = {
      ...preferences,
      ...body,
      emailByCategory: {
        ...preferences.emailByCategory,
        ...body.emailByCategory,
      },
    };
    censusRecordState.memberOverview.notificationPreferences = updatedPreferences;
    return HttpResponse.json(updatedPreferences);
  }),
  http.get("*/api/v1/dogs", async ({ request }) => {
    await delay(120);
    const url = new URL(request.url);
    const filters = parseFilters(url);
    if (
      filters === undefined ||
      filters.some((filter) => dogFilterLabels[filter.field] === undefined)
    ) {
      return apiError("INVALID_FILTER", "Invalid dog filter", 400);
    }
    const searched = filterDogsBySearch(censusDogs, url.searchParams.get("q") ?? "");
    const filtered = filterItems(searched, filters, dogValues);
    if (filtered === undefined) {
      return apiError("INVALID_FILTER", "Invalid dog filter", 400);
    }
    const sorted = sortDogs(filtered, url.searchParams.getAll("sort"));
    const { page, size } = pagination(url);
    return HttpResponse.json({
      appliedFilters: appliedFilters(filters, dogFilterLabels, (filter) =>
        labelForValue(censusDogs, filter.field, filter.value, dogValues),
      ),
      items: sorted.slice(page * size, (page + 1) * size),
      page,
      size,
      totalItems: sorted.length,
      totalPages: Math.ceil(sorted.length / size),
    });
  }),
  http.get("*/api/v1/dogs/filter-values", ({ request }) => {
    const url = new URL(request.url);
    const field = url.searchParams.get("field") ?? "";
    const filters = parseFilters(url);
    if (
      dogFilterLabels[field] === undefined ||
      filters === undefined ||
      filters.some((filter) => dogFilterLabels[filter.field] === undefined)
    ) {
      return apiError("INVALID_FILTER", "Invalid dog filter", 400);
    }
    const searched = filterDogsBySearch(censusDogs, url.searchParams.get("q") ?? "");
    const filtered = filterItems(
      searched,
      filters.filter((filter) => filter.field !== field),
      dogValues,
    );
    return filtered === undefined
      ? apiError("INVALID_FILTER", "Invalid dog filter", 400)
      : HttpResponse.json({ field, values: facetValues(filtered, field, dogValues) });
  }),
  http.get(
    "*/api/v1/dogs/export",
    () =>
      new HttpResponse("mock dog export", {
        headers: { "Content-Disposition": 'attachment; filename="dogs.mock"' },
        status: 200,
      }),
  ),
  http.get("*/api/v1/dogs/:id", ({ params }) => {
    const dog = currentDog(String(params.id));
    return dog === undefined ? apiError("NOT_FOUND", "Dog not found", 404) : HttpResponse.json(dog);
  }),
  http.patch("*/api/v1/dogs/:id", async ({ params, request }) => {
    const signupDog = memberSignupReviewState.dogs.find((candidate) => candidate.id === String(params.id));
    if (signupDog !== undefined) {
      const body = (await request.json()) as DogPatchRequest;
      if (body.version !== memberSignupReviewState.version) {
        return apiError("STALE_VERSION", "Stale version", 409);
      }
      signupDog.name = body.name ?? signupDog.name;
      signupDog.breed = body.breed ?? signupDog.breed;
      signupDog.chip = body.chip ?? signupDog.chip;
      signupDog.sex = body.sex ?? signupDog.sex;
      if (body.birthDate !== undefined) signupDog.birthMonth = body.birthDate.slice(0, 7);
      memberSignupReviewState.version += 1;
      return HttpResponse.json({
        birthDate: `${signupDog.birthMonth}-01`,
        breed: signupDog.breed,
        chip: signupDog.chip,
        id: signupDog.id,
        licenses: [],
        memberId: memberSignupReviewState.member.id,
        name: signupDog.name,
        registeredAt: memberSignupReviewState.signup.submittedAt,
        sex: signupDog.sex,
        status: signupDog.status,
        version: memberSignupReviewState.version,
      });
    }
    const dog = currentDog(String(params.id));
    if (dog === undefined) {
      return apiError("NOT_FOUND", "Dog not found", 404);
    }
    const body = (await request.json()) as DogPatchRequest;
    if (body.version !== dog.version) {
      return apiError("STALE_VERSION", "Stale version", 409);
    }
    const duplicateChip = Object.values(censusRecordState.dogs).some(
      (candidate) => candidate.dog.id !== dog.dog.id && candidate.dog.chip === body.chip,
    );
    if (duplicateChip) {
      return apiError("CHIP_ALREADY_EXISTS", "Chip already exists", 409);
    }
    dog.dog = { ...dog.dog, ...body, version: dog.dog.version + 1 };
    dog.version = dog.dog.version;
    return HttpResponse.json(replaceDog(dog).dog);
  }),
  http.patch("*/api/v1/dogs/:id/level", async ({ params, request }) => {
    const dog = currentDog(String(params.id));
    if (dog === undefined) {
      return apiError("NOT_FOUND", "Dog not found", 404);
    }
    const body = (await request.json()) as DogLevelRequest;
    const level = censusLevels.find((candidate) => candidate.id === body.levelId);
    const levelDefinition = catalogState.levels.find((candidate) => candidate.id === body.levelId);
    if (level === undefined || levelDefinition?.active !== true) {
      return apiError("LEVEL_NOT_ACTIVE", "Level not active", 422);
    }
    if (level.id === dog.level?.id) {
      return apiError("LEVEL_UNCHANGED", "Level unchanged", 422);
    }
    const assignedAt = "2026-09-06T15:00:00Z";
    dog.levelHistory = [
      ...(dog.levelHistory ?? []).map((entry) =>
        entry.to === undefined ? { ...entry, to: assignedAt } : entry,
      ),
      {
        byAccountId: "account-admin",
        from: assignedAt,
        levelId: level.id,
      },
    ];
    dog.level = level;
    dog.dog.levelAssignedAt = assignedAt;
    dog.dog.levelId = level.id;
    if (dog.freeTraining?.override == null) {
      dog.freeTraining = {
        allowed: levelDefinition.grantsFreeTraining,
        override: null,
        source: "LEVEL",
      };
    }
    replaceDog(dog);
    return HttpResponse.json({
      level,
      levelAssignedAt: assignedAt,
      warnings: { futureBookingsOutsideLevel: 0 },
    });
  }),
  http.patch("*/api/v1/dogs/:id/free-training", async ({ params, request }) => {
    const dog = currentDog(String(params.id));
    if (dog === undefined) {
      return apiError("NOT_FOUND", "Dog not found", 404);
    }
    const body = (await request.json()) as FreeTrainingRequest;
    const levelDefinition = catalogState.levels.find((candidate) => candidate.id === dog.level?.id);
    const allowed = body.override ?? levelDefinition?.grantsFreeTraining ?? false;
    dog.freeTraining = {
      allowed,
      override: body.override,
      source: body.override === null ? "LEVEL" : "MANUAL",
    };
    replaceDog(dog);
    return HttpResponse.json(dog.freeTraining);
  }),
  http.post("*/api/v1/dogs/:id/transfer", async ({ params, request }) => {
    const dog = currentDog(String(params.id));
    if (dog === undefined) {
      return apiError("NOT_FOUND", "Dog not found", 404);
    }
    const body = (await request.json()) as DogTransferRequest;
    if (body.toMemberId === dog.owner.id) {
      return apiError("SAME_MEMBER", "Same member", 422);
    }
    const target = censusMembers.find(
      (member) => member.id === body.toMemberId && member.displayStatus.kind !== "LEFT",
    );
    if (target === undefined) {
      return apiError("TARGET_MEMBER_NOT_ACTIVE", "Target member not active", 409);
    }
    dog.owner = {
      fullName: target.fullName,
      id: target.id,
      ...(target.memberNumber === undefined ? {} : { memberNumber: target.memberNumber }),
      status: "ACTIVE",
    };
    dog.dog.memberId = target.id;
    return HttpResponse.json(replaceDog(dog).dog);
  }),
  http.post("*/api/v1/dogs/:id/deactivation", ({ params }) => {
    const dog = currentDog(String(params.id));
    if (dog === undefined) {
      return apiError("NOT_FOUND", "Dog not found", 404);
    }
    if (dog.dog.status !== "ACTIVE") {
      return apiError("DOG_NOT_ACTIVE", "Dog not active", 409);
    }
    dog.dog.status = "INACTIVE";
    dog.dog.deactivatedAt = "2026-09-06T15:00:00Z";
    dog.dog.deactivationReason = "CLUB";
    return HttpResponse.json(replaceDog(dog).dog);
  }),
  http.post("*/api/v1/dogs/:id/reactivation", ({ params }) => {
    const dog = currentDog(String(params.id));
    if (dog === undefined) {
      return apiError("NOT_FOUND", "Dog not found", 404);
    }
    if (dog.owner.status !== "ACTIVE") {
      return apiError("TARGET_MEMBER_NOT_ACTIVE", "Target member not active", 409);
    }
    dog.dog.status = "ACTIVE";
    delete dog.dog.deactivatedAt;
    delete dog.dog.deactivationReason;
    return HttpResponse.json(replaceDog(dog).dog);
  }),
  http.put("*/api/v1/dogs/:id/photo", async ({ params, request }) => {
    const dog = currentDog(String(params.id));
    if (dog === undefined) {
      return apiError("NOT_FOUND", "Dog not found", 404);
    }
    const body = (await request.json()) as PhotoRequest;
    dog.dog.photoUrl = `https://files.example.test/${body.fileKey}`;
    return HttpResponse.json({ photoUrl: dog.dog.photoUrl });
  }),
  http.get("*/api/v1/dogs/:id/documents", ({ params }) => {
    const dog = currentDog(String(params.id));
    return dog === undefined
      ? apiError("NOT_FOUND", "Dog not found", 404)
      : HttpResponse.json(dog.documents);
  }),
  http.post("*/api/v1/dogs/:id/documents", async ({ params, request }) => {
    const dog = currentDog(String(params.id));
    if (dog === undefined) {
      return apiError("NOT_FOUND", "Dog not found", 404);
    }
    const body = (await request.json()) as DogDocumentUploadRequest;
    const document = dog.documents.find((candidate) => candidate.type === body.type);
    if (document === undefined) {
      return apiError("DOCUMENT_TYPE_UNKNOWN", "Document type unknown", 400);
    }
    const file = {
      id: `file-${String(document.files.length + 1)}-${dog.dog.id}`,
      name: body.name,
      uploadedAt: "2026-09-06T15:00:00Z",
      url: `https://files.example.test/${body.fileKey}`,
    };
    document.files = [...document.files, file];
    document.state = "RECEIVED";
    return HttpResponse.json(document, { status: 201 });
  }),
  http.delete("*/api/v1/dogs/:id/documents/:docId/files/:fileId", ({ params }) => {
    const dog = currentDog(String(params.id));
    if (dog === undefined) {
      return apiError("NOT_FOUND", "Dog not found", 404);
    }
    const document = dog.documents.find((candidate) => candidate.id === String(params.docId));
    if (document === undefined) {
      return apiError("NOT_FOUND", "Document not found", 404);
    }
    document.files = document.files.filter((file) => file.id !== String(params.fileId));
    document.state = document.files.length === 0 ? "PENDING" : "RECEIVED";
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("*/api/v1/dogs/:id/documents/reminder", async ({ params, request }) => {
    const dog = currentDog(String(params.id));
    if (dog === undefined) {
      return apiError("NOT_FOUND", "Dog not found", 404);
    }
    const body = (await request.json()) as DogDocumentReminderRequest;
    const document = dog.documents.find((candidate) => candidate.type === body.type);
    if (document?.state !== "PENDING") {
      return apiError("DOCUMENT_NOT_PENDING", "Document not pending", 422);
    }
    if (document.lastReminderAt !== undefined) {
      return apiError("DOCUMENT_REMINDER_TOO_SOON", "Document reminder too soon", 409);
    }
    document.lastReminderAt = "2026-09-06T15:00:00Z";
    return new HttpResponse(null, { status: 202 });
  }),
  http.post("*/api/v1/attachments/upload-url", async ({ request }) => {
    const body = (await request.json()) as AttachmentUploadRequest;
    if (body.sizeBytes > 25 * 1024 * 1024) {
      return apiError("FILE_TOO_LARGE", "File too large", 400);
    }
    if (!body.mimeType.startsWith("image/") && body.mimeType !== "application/pdf") {
      return apiError("FILE_TYPE_NOT_ALLOWED", "File type not allowed", 400);
    }
    const fileKey = `mock-${body.purpose.toLocaleLowerCase()}-${body.fileName}`;
    return HttpResponse.json(
      {
        expiresAt: "2026-09-09T22:00:00Z",
        fileKey,
        headers: { "Content-Type": body.mimeType },
        uploadUrl: `https://uploads.example.test/${fileKey}`,
      },
      { status: 201 },
    );
  }),
  http.put("https://uploads.example.test/:fileKey", () => new HttpResponse(null, { status: 200 })),
  http.get("*/api/v1/rings", ({ request }) => {
    const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "true";
    const rings = orderedCatalog(
      includeInactive ? catalogState.rings : catalogState.rings.filter((ring) => ring.active),
    );
    return HttpResponse.json(catalogResponse(rings));
  }),
  http.post("*/api/v1/rings", async ({ request }) => {
    const body = (await request.json()) as RingCreate;
    const duplicate = catalogState.rings.some(
      (ring) => ring.shortName.toLocaleUpperCase() === body.shortName.toLocaleUpperCase(),
    );
    if (duplicate) {
      return apiError("DUPLICATE_NAME", "Duplicate ring short name", 409);
    }
    const item: Ring = {
      active: body.active ?? true,
      allowsFreeTraining: body.allowsFreeTraining ?? false,
      color: body.color ?? catalogState.rings[0]?.color ?? "currentColor",
      effectiveTrainingCapacity: body.trainingCapacity ?? 1,
      id: `ring-${String(Date.now())}`,
      name: body.name,
      order: body.order ?? catalogState.rings.length * 10,
      shortName: body.shortName,
      ...(body.trainingCapacity === undefined ? {} : { trainingCapacity: body.trainingCapacity }),
      version: 1,
    };
    catalogState.rings.push(item);
    return HttpResponse.json(item, { status: 201 });
  }),
  http.put("*/api/v1/rings/order", async ({ request }) => {
    const body = (await request.json()) as RingOrder;
    const ordered = orderedIds(catalogState.rings, body.ringIds);
    if (ordered === undefined) {
      return apiError("ORDER_INCOMPLETE", "Ring order is incomplete", 422);
    }
    catalogState.rings = ordered;
    return HttpResponse.json(catalogResponse(orderedCatalog(catalogState.rings)));
  }),
  http.patch("*/api/v1/rings/:id", async ({ params, request }) => {
    const ring = catalogState.rings.find((candidate) => candidate.id === String(params.id));
    if (ring === undefined) {
      return apiError("NOT_FOUND", "Ring not found", 404);
    }
    const body = (await request.json()) as RingPatch;
    if (body.version !== ring.version) {
      return apiError("STALE_VERSION", "Stale ring version", 409);
    }
    if (
      (body.active === false && (ring.usage?.futureClassSessions ?? 0) > 0) ||
      (body.allowsFreeTraining === false && (ring.usage?.futureTrainingBookings ?? 0) > 0)
    ) {
      return apiError("RING_IN_USE", "Ring in use", 409);
    }
    const { trainingCapacity: requestedCapacity, ...bodyWithoutCapacity } = body;
    const { trainingCapacity: currentCapacity, ...ringWithoutCapacity } = ring;
    const updated: Ring = {
      ...ringWithoutCapacity,
      ...bodyWithoutCapacity,
      ...(requestedCapacity === undefined || requestedCapacity === null
        ? {}
        : { trainingCapacity: requestedCapacity }),
      effectiveTrainingCapacity:
        requestedCapacity ?? currentCapacity ?? ring.effectiveTrainingCapacity,
      version: ring.version + 1,
    };
    return HttpResponse.json(replaceCatalogItem(catalogState.rings, updated));
  }),
  http.delete("*/api/v1/rings/:id", ({ params }) => {
    const ring = catalogState.rings.find((candidate) => candidate.id === String(params.id));
    if (ring === undefined) {
      return apiError("NOT_FOUND", "Ring not found", 404);
    }
    if (
      (ring.usage?.futureClassSessions ?? 0) > 0 ||
      (ring.usage?.futureTrainingBookings ?? 0) > 0
    ) {
      return apiError("RING_IN_USE", "Ring in use", 409);
    }
    catalogState.rings = catalogState.rings.filter((candidate) => candidate.id !== ring.id);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("*/api/v1/levels", ({ request }) => {
    const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "true";
    const levels = orderedCatalog(
      includeInactive ? catalogState.levels : catalogState.levels.filter((level) => level.active),
    );
    return HttpResponse.json(catalogResponse(levels));
  }),
  http.post("*/api/v1/levels", async ({ request }) => {
    const body = (await request.json()) as LevelCreate;
    const item: Level = {
      active: body.active ?? true,
      capacity: body.capacity ?? 1,
      code: body.code,
      color: body.color ?? catalogState.levels[0]?.color ?? "currentColor",
      grantsFreeTraining: body.grantsFreeTraining ?? false,
      id: `level-${String(Date.now())}`,
      name: localizedDefault(body.name, body.code),
      nameI18n: body.name,
      order: body.order ?? catalogState.levels.length * 10,
      version: 1,
    };
    catalogState.levels.push(item);
    return HttpResponse.json(item, { status: 201 });
  }),
  http.put("*/api/v1/levels/order", async ({ request }) => {
    const body = (await request.json()) as LevelOrder;
    const ordered = orderedIds(catalogState.levels, body.levelIds);
    if (ordered === undefined) {
      return apiError("ORDER_INCOMPLETE", "Level order is incomplete", 422);
    }
    catalogState.levels = ordered;
    return HttpResponse.json(catalogResponse(orderedCatalog(catalogState.levels)));
  }),
  http.patch("*/api/v1/levels/:id", async ({ params, request }) => {
    const level = catalogState.levels.find((candidate) => candidate.id === String(params.id));
    if (level === undefined) {
      return apiError("NOT_FOUND", "Level not found", 404);
    }
    const body = (await request.json()) as LevelPatch;
    if (body.version !== level.version) {
      return apiError("STALE_VERSION", "Stale level version", 409);
    }
    const updated: Level = {
      ...level,
      ...body,
      name: localizedDefault(body.name, level.name),
      ...(body.name === undefined ? {} : { nameI18n: body.name }),
      version: level.version + 1,
    };
    return HttpResponse.json(replaceCatalogItem(catalogState.levels, updated));
  }),
  http.delete("*/api/v1/levels/:id", ({ params }) => {
    const level = catalogState.levels.find((candidate) => candidate.id === String(params.id));
    if (level === undefined) {
      return apiError("NOT_FOUND", "Level not found", 404);
    }
    if ((level.usage?.activeDogs ?? 0) > 0) {
      return apiError("LEVEL_IN_USE", "Level in use", 409);
    }
    catalogState.levels = catalogState.levels.filter((candidate) => candidate.id !== level.id);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("*/api/v1/instructors", ({ request }) => {
    const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "true";
    const items = includeInactive
      ? catalogState.instructors
      : catalogState.instructors.filter((instructor) => instructor.active);
    return HttpResponse.json(catalogResponse(items));
  }),
  http.post("*/api/v1/instructors", async ({ request }) => {
    const body = (await request.json()) as InstructorCreate;
    const existing = catalogState.instructors.find(
      (instructor) => instructor.memberId === body.memberId,
    );
    if (existing !== undefined) {
      existing.active = true;
      existing.shortName = body.shortName;
      existing.color = body.color;
      existing.version += 1;
      return HttpResponse.json(existing);
    }
    const item: Instructor = {
      active: true,
      color: body.color,
      id: `instructor-${String(Date.now())}`,
      memberId: body.memberId,
      shortName: body.shortName,
      version: 1,
    };
    catalogState.instructors.push(item);
    return HttpResponse.json(item, { status: 201 });
  }),
  http.patch("*/api/v1/instructors/:id", async ({ params, request }) => {
    const instructor = catalogState.instructors.find(
      (candidate) => candidate.id === String(params.id),
    );
    if (instructor === undefined) {
      return apiError("NOT_FOUND", "Instructor not found", 404);
    }
    const body = (await request.json()) as InstructorPatch;
    if (body.version !== instructor.version) {
      return apiError("STALE_VERSION", "Stale instructor version", 409);
    }
    if (body.active === false && (instructor.usage?.futureClassSessions ?? 0) > 0) {
      return apiError("INSTRUCTOR_IN_USE", "Instructor in use", 409);
    }
    const updated = { ...instructor, ...body, version: instructor.version + 1 };
    return HttpResponse.json(replaceCatalogItem(catalogState.instructors, updated));
  }),
  http.delete("*/api/v1/instructors/:id", ({ params }) => {
    const instructor = catalogState.instructors.find(
      (candidate) => candidate.id === String(params.id),
    );
    if (instructor === undefined) {
      return apiError("NOT_FOUND", "Instructor not found", 404);
    }
    if ((instructor.usage?.futureClassSessions ?? 0) > 0) {
      return apiError("INSTRUCTOR_IN_USE", "Instructor in use", 409);
    }
    catalogState.instructors = catalogState.instructors.filter(
      (candidate) => candidate.id !== instructor.id,
    );
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("*/api/v1/administrators", ({ request }) => {
    const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "true";
    const items = includeInactive
      ? catalogState.administrators
      : catalogState.administrators.filter((administrator) => administrator.active);
    return HttpResponse.json(catalogResponse(items));
  }),
  http.post("*/api/v1/administrators", async ({ request }) => {
    const body = (await request.json()) as AdministratorCreate;
    const existing = catalogState.administrators.find(
      (administrator) => administrator.memberId === body.memberId,
    );
    if (existing !== undefined) {
      existing.active = true;
      existing.shortName = body.shortName;
      existing.since = body.since;
      existing.version += 1;
      return HttpResponse.json(existing);
    }
    const item: Administrator = {
      active: true,
      memberId: body.memberId,
      membershipId: `membership-${String(Date.now())}`,
      shortName: body.shortName,
      since: body.since,
      version: 1,
    };
    catalogState.administrators.push(item);
    return HttpResponse.json(item, { status: 201 });
  }),
  http.patch("*/api/v1/administrators/:membershipId", async ({ params, request }) => {
    const administrator = catalogState.administrators.find(
      (candidate) => candidate.membershipId === String(params.membershipId),
    );
    if (administrator === undefined) {
      return apiError("NOT_FOUND", "Administrator not found", 404);
    }
    const body = (await request.json()) as AdministratorPatch;
    if (body.version !== administrator.version) {
      return apiError("STALE_VERSION", "Stale administrator version", 409);
    }
    const activeCount = catalogState.administrators.filter((candidate) => candidate.active).length;
    if (body.active === false && administrator.active && activeCount <= 1) {
      return apiError("LAST_ADMIN", "Last administrator", 409);
    }
    const updated = { ...administrator, ...body, version: administrator.version + 1 };
    const index = catalogState.administrators.findIndex(
      (candidate) => candidate.membershipId === administrator.membershipId,
    );
    catalogState.administrators[index] = updated;
    return HttpResponse.json(updated);
  }),
  http.delete("*/api/v1/administrators/:membershipId", ({ params }) => {
    const administrator = catalogState.administrators.find(
      (candidate) => candidate.membershipId === String(params.membershipId),
    );
    if (administrator === undefined) {
      return apiError("NOT_FOUND", "Administrator not found", 404);
    }
    const activeCount = catalogState.administrators.filter((candidate) => candidate.active).length;
    if (administrator.active && activeCount <= 1) {
      return apiError("LAST_ADMIN", "Last administrator", 409);
    }
    catalogState.administrators = catalogState.administrators.filter(
      (candidate) => candidate.membershipId !== administrator.membershipId,
    );
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("*/api/v1/plans", ({ request }) => {
    const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "true";
    const plans = orderedCatalog(
      includeInactive ? catalogState.plans : catalogState.plans.filter((plan) => plan.active),
    );
    return HttpResponse.json(catalogResponse(plans));
  }),
  http.post("*/api/v1/plans", async ({ request }) => {
    const body = (await request.json()) as PlanCreate;
    const item: Plan = {
      active: body.active ?? true,
      ...(body.billingMode === undefined ? {} : { billingMode: body.billingMode }),
      code: body.code,
      conditions: localizedDefault(body.conditions, ""),
      ...(body.conditions === undefined ? {} : { conditionsI18n: body.conditions }),
      dogsIncluded: body.dogsIncluded ?? 1,
      entryFee: body.entryFee ?? { mode: "STANDARD" },
      id: `plan-${String(Date.now())}`,
      name: localizedDefault(body.name, body.code),
      nameI18n: body.name,
      order: body.order ?? catalogState.plans.length * 10,
      prices: [],
      showOnSignup: body.showOnSignup ?? false,
      showOnWeb: body.showOnWeb ?? false,
      ...(body.pack === undefined ? {} : { pack: body.pack }),
      ...(body.singleClass === undefined ? {} : { singleClass: body.singleClass }),
      type: body.type,
      version: 1,
    };
    catalogState.plans.push(item);
    return HttpResponse.json(item, { status: 201 });
  }),
  http.patch("*/api/v1/plans/:id", async ({ params, request }) => {
    const plan = catalogState.plans.find((candidate) => candidate.id === String(params.id));
    if (plan === undefined) {
      return apiError("NOT_FOUND", "Plan not found", 404);
    }
    const body = (await request.json()) as PlanPatch;
    if (body.version !== plan.version) {
      return apiError("STALE_VERSION", "Stale plan version", 409);
    }
    const { texts: inputTexts, ...planPatch } = body;
    const updated: Plan = {
      ...plan,
      ...planPatch,
      conditions: localizedDefault(body.conditions, plan.conditions ?? ""),
      ...(body.conditions === undefined ? {} : { conditionsI18n: body.conditions }),
      name: localizedDefault(body.name, plan.name),
      ...(body.name === undefined ? {} : { nameI18n: body.name }),
      ...(inputTexts === undefined
        ? plan.texts === undefined
          ? {}
          : { texts: plan.texts }
        : {
            texts: {
              ...(inputTexts.description === undefined
                ? {}
                : {
                    description: localizedDefault(
                      inputTexts.description,
                      plan.texts?.description ?? "",
                    ),
                    descriptionI18n: inputTexts.description,
                  }),
              ...(inputTexts.offerLabel === undefined
                ? {}
                : {
                    offerLabel: localizedDefault(
                      inputTexts.offerLabel,
                      plan.texts?.offerLabel ?? "",
                    ),
                    offerLabelI18n: inputTexts.offerLabel,
                  }),
              ...(inputTexts.priceLabel === undefined
                ? {}
                : {
                    priceLabel: localizedDefault(
                      inputTexts.priceLabel,
                      plan.texts?.priceLabel ?? "",
                    ),
                    priceLabelI18n: inputTexts.priceLabel,
                  }),
            },
          }),
      version: plan.version + 1,
    };
    return HttpResponse.json(replaceCatalogItem(catalogState.plans, updated));
  }),
  http.post("*/api/v1/prices", async ({ request }) => {
    const body = (await request.json()) as PriceCreate;
    const now = new Date();
    const monthStart = `${String(now.getUTCFullYear())}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
    if (body.validFrom < monthStart) {
      return apiError("PRICE_LOCKED", "Price date is locked", 409);
    }
    const plan = catalogState.plans.find((candidate) => candidate.id === body.planId);
    if (plan === undefined) {
      return apiError("NOT_FOUND", "Plan not found", 404);
    }
    const price: Price = {
      ...body,
      id: `price-${String(Date.now())}`,
      locked: false,
      periodicity:
        body.concept === "MONTHLY_FEE" || body.concept === "MAINTENANCE_FEE"
          ? "MONTHLY"
          : "ONE_OFF",
      status: body.validFrom > monthStart ? "SCHEDULED" : "CURRENT",
      version: 1,
    };
    plan.prices = [...(plan.prices ?? []), price];
    if (price.status === "CURRENT") {
      plan.currentPrices = [price];
    }
    return HttpResponse.json({ price }, { status: 201 });
  }),
  http.get("*/api/v1/faq-entries", ({ request }) => {
    const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "true";
    const entries = orderedCatalog(
      includeInactive
        ? catalogState.faqEntries
        : catalogState.faqEntries.filter((entry) => entry.active),
    );
    return HttpResponse.json(catalogResponse(entries));
  }),
  http.get("*/api/v1/faq-entries/filter-values", ({ request }) => {
    const field = new URL(request.url).searchParams.get("field");
    if (field !== "category") {
      return apiError("INVALID_FILTER", "Invalid FAQ filter", 400);
    }
    return HttpResponse.json([...new Set(catalogState.faqEntries.map((entry) => entry.category))]);
  }),
  http.post("*/api/v1/faq-entries", async ({ request }) => {
    const body = (await request.json()) as FaqCreate;
    const item: FaqEntry = {
      active: body.active ?? true,
      answer: localizedDefault(body.answer, ""),
      answerI18n: body.answer,
      category: localizedDefault(body.category, ""),
      categoryI18n: body.category,
      id: `faq-${String(Date.now())}`,
      order: body.order ?? catalogState.faqEntries.length * 10,
      question: localizedDefault(body.question, ""),
      questionI18n: body.question,
      version: 1,
    };
    catalogState.faqEntries.push(item);
    return HttpResponse.json(item, { status: 201 });
  }),
  http.put("*/api/v1/faq-entries/order", async ({ request }) => {
    const body = (await request.json()) as FaqOrder;
    const ordered = orderedIds(catalogState.faqEntries, body.faqEntryIds);
    if (ordered === undefined) {
      return apiError("ORDER_INCOMPLETE", "FAQ order is incomplete", 422);
    }
    catalogState.faqEntries = ordered;
    return HttpResponse.json(catalogResponse(orderedCatalog(catalogState.faqEntries)));
  }),
  http.patch("*/api/v1/faq-entries/:id", async ({ params, request }) => {
    const entry = catalogState.faqEntries.find((candidate) => candidate.id === String(params.id));
    if (entry === undefined) {
      return apiError("NOT_FOUND", "FAQ entry not found", 404);
    }
    const body = (await request.json()) as FaqPatch;
    if (body.version !== entry.version) {
      return apiError("STALE_VERSION", "Stale FAQ version", 409);
    }
    const updated: FaqEntry = {
      ...entry,
      ...body,
      answer: localizedDefault(body.answer, entry.answer),
      ...(body.answer === undefined ? {} : { answerI18n: body.answer }),
      category: localizedDefault(body.category, entry.category),
      ...(body.category === undefined ? {} : { categoryI18n: body.category }),
      question: localizedDefault(body.question, entry.question),
      ...(body.question === undefined ? {} : { questionI18n: body.question }),
      version: entry.version + 1,
    };
    return HttpResponse.json(replaceCatalogItem(catalogState.faqEntries, updated));
  }),
  http.delete("*/api/v1/faq-entries/:id", ({ params }) => {
    const id = String(params.id);
    if (!catalogState.faqEntries.some((entry) => entry.id === id)) {
      return apiError("NOT_FOUND", "FAQ entry not found", 404);
    }
    catalogState.faqEntries = catalogState.faqEntries.filter((entry) => entry.id !== id);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("*/api/v1/club-pages", ({ request }) => {
    const active = new URL(request.url).searchParams.get("active");
    const pages =
      active === null
        ? catalogState.clubPages
        : catalogState.clubPages.filter((page) => page.active === (active === "true"));
    return HttpResponse.json(catalogResponse(pages));
  }),
  http.get("*/api/v1/club-pages/:key", ({ params }) => {
    const page = catalogState.clubPages.find((candidate) => candidate.key === String(params.key));
    return page === undefined
      ? apiError("NOT_FOUND", "Club page not found", 404)
      : HttpResponse.json(page);
  }),
  http.post("*/api/v1/club-pages", async ({ request }) => {
    const body = (await request.json()) as ClubPageCreate;
    if (!/^(?:RULES|PRIVACY|IMAGE_CONSENT|WELCOME_GUIDE|[a-z0-9-]{2,40})$/u.test(body.key)) {
      return validationError([{ code: "INVALID", field: "key" }]);
    }
    if (catalogState.clubPages.some((page) => page.key === body.key)) {
      return apiError("DUPLICATE_NAME", "Club page key already exists", 409);
    }
    const invalidBody = invalidClubPageBody(body.body);
    if (invalidBody !== undefined) {
      return validationError([{ code: "INVALID", field: invalidBody }]);
    }
    const now = "2026-09-09T19:00:00Z";
    const page: ClubPage = {
      ...body,
      history: [],
      lastChange: { at: now, by: "account-admin" },
      publishedAt: body.active ? now : null,
      version: 1,
    };
    catalogState.clubPages.push(page);
    return HttpResponse.json(page, { status: 201 });
  }),
  http.patch("*/api/v1/club-pages/:key", async ({ params, request }) => {
    const page = catalogState.clubPages.find((candidate) => candidate.key === String(params.key));
    if (page === undefined) {
      return apiError("NOT_FOUND", "Club page not found", 404);
    }
    const body = (await request.json()) as ClubPagePatch;
    if (body.version !== page.version) {
      return apiError("STALE_VERSION", "Stale club page version", 409);
    }
    const invalidBody = invalidClubPageBody(body.body);
    if (invalidBody !== undefined) {
      return validationError([{ code: "INVALID", field: invalidBody }]);
    }
    const now = "2026-09-09T19:10:00Z";
    const bodyChanged =
      body.body !== undefined && JSON.stringify(body.body) !== JSON.stringify(page.body);
    const publishes = (body.active === true && !page.active) || (page.active && bodyChanged);
    const history =
      publishes && page.active && page.publishedAt !== null
        ? [
            {
              body: page.body,
              by: page.lastChange.by,
              publishedAt: page.publishedAt,
              title: page.title,
              version: page.version,
            },
            ...(page.history ?? []),
          ].slice(0, 10)
        : page.history;
    const updated: ClubPage = {
      ...page,
      ...body,
      ...(history === undefined ? {} : { history }),
      lastChange: { at: now, by: "account-admin" },
      publishedAt: publishes ? now : page.publishedAt,
      version: publishes ? page.version + 1 : page.version,
    };
    catalogState.clubPages = catalogState.clubPages.map((candidate) =>
      candidate.key === updated.key ? updated : candidate,
    );
    return HttpResponse.json(updated);
  }),
  http.get("*/api/v1/public/:clubSlug/pages/:key", ({ params, request }) => {
    const page = catalogState.clubPages.find(
      (candidate) => candidate.key === String(params.key) && candidate.active,
    );
    if (page?.publishedAt == null) {
      return apiError("NOT_FOUND", "Club page not found", 404);
    }
    const locale = request.headers.get("Accept-Language") ?? "ca";
    return HttpResponse.json({
      active: true,
      body: pageText(page.body, locale),
      key: page.key,
      publishedAt: page.publishedAt,
      title: pageText(page.title, locale),
      version: page.version,
    });
  }),
  http.get("*/api/v1/saved-views", ({ request }) => {
    const listKey = new URL(request.url).searchParams.get("listKey");
    return HttpResponse.json(savedViews.filter((view) => view.listKey === listKey));
  }),
  http.post("*/api/v1/saved-views", async ({ request }) => {
    const body = (await request.json()) as SavedViewCreate;
    if (
      savedViews.some(
        (view) => view.listKey === body.listKey && normalized(view.name) === normalized(body.name),
      )
    ) {
      return apiError("SAVED_VIEW_NAME_TAKEN", "Saved view name taken", 409);
    }
    const view: SavedView = {
      ...body,
      id: `view-${body.listKey}-${String(savedViews.length + 1)}`,
      ownerAccountId: "account-admin",
      version: 1,
    };
    savedViews.push(view);
    return HttpResponse.json(view, { status: 201 });
  }),
  http.put("*/api/v1/saved-views/:id", async ({ params, request }) => {
    const body = (await request.json()) as SavedViewUpdate;
    const id = String(params.id);
    const index = savedViews.findIndex((view) => view.id === id);
    if (index < 0) {
      return apiError("NOT_FOUND", "Saved view not found", 404);
    }
    if (
      savedViews.some(
        (view) =>
          view.id !== id &&
          view.listKey === body.listKey &&
          normalized(view.name) === normalized(body.name),
      )
    ) {
      return apiError("SAVED_VIEW_NAME_TAKEN", "Saved view name taken", 409);
    }
    const current = savedViews[index];
    if (current === undefined) {
      return apiError("NOT_FOUND", "Saved view not found", 404);
    }
    const updated: SavedView = { ...body, id, ownerAccountId: current.ownerAccountId };
    savedViews[index] = updated;
    return HttpResponse.json(updated);
  }),
  http.delete("*/api/v1/saved-views/:id", ({ params }) => {
    const index = savedViews.findIndex((view) => view.id === String(params.id));
    if (index < 0) {
      return apiError("NOT_FOUND", "Saved view not found", 404);
    }
    savedViews.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("*/api/v1/health", () =>
    HttpResponse.json({
      status: "UP",
      version: "0.0.0-mock",
      builtAt: "2026-09-05T00:00:00Z",
    }),
  ),
];

export {
  mockScenario,
  resetAuditMockState,
  resetCatalogState,
  resetCensusRecordState,
  resetDashboardMockState,
  resetMemberSelfServiceState,
  resetOnboardingMockState,
  resetSettingsState,
  type MockScenario,
};
