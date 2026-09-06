import { delay, http, HttpResponse } from "msw";

import type { components } from "../generated/schema";

import {
  censusLevels,
  censusRecordState,
  censusDogs,
  censusMembers,
  initialSavedViews,
  resetCensusRecordState,
  type DogListItem,
  type DogDetail,
  type MemberListItem,
  type SavedView,
} from "./fixtures/census";
import {
  meDogsFixture,
  meProfileFixture,
  postalTownFixtures,
  type MeDog,
  type MeDogs,
  type MeProfile,
} from "./fixtures/member-self-service";
import { currentMockScenario, mockScenario, type MockScenario } from "./scenarios";

type ApiErrorResponse = components["schemas"]["ApiError"];
type MagicLinkRequest = components["schemas"]["MagicLinkRequest"];
type UpdateMeRequest = components["schemas"]["AccountPatchRequest"];
type UpdatePasswordRequest = components["schemas"]["PasswordRequest"];
type UpdateProfileRequest = components["schemas"]["ProfileRequest"];
type ListFilter = components["schemas"]["ListFilter"];
type SavedViewRequest = components["schemas"]["SavedViewRequest"];
type MemberPatchRequest = components["schemas"]["MemberPatchRequest"];
type PaymentMethodRequest = components["schemas"]["PaymentMethodRequest"];
type BookingBlockRequest = components["schemas"]["BookingBlockRequest"];
type RolesRequest = components["schemas"]["RolesRequest"];
type NotificationPreferencesPatch = components["schemas"]["NotificationPreferencesPatch"];
type DogPatchRequest = components["schemas"]["DogPatchRequest"];
type DogLevelRequest = components["schemas"]["DogLevelRequest"];
type FreeTrainingRequest = components["schemas"]["FreeTrainingRequest"];
type DogTransferRequest = components["schemas"]["DogTransferRequest"];
type PhotoRequest = components["schemas"]["PhotoRequest"];
type DogDocumentUploadRequest = components["schemas"]["DogDocumentUploadRequest"];
type DogDocumentReminderRequest = components["schemas"]["DogDocumentReminderRequest"];
type AttachmentUploadRequest = components["schemas"]["AttachmentUploadRequest"];
type InstructorNoteRequest = components["schemas"]["InstructorNoteRequest"];
type MeProfilePatch = components["schemas"]["MeProfilePatch"];
type Parameter = components["schemas"]["Parameter"];

const savedViews: SavedView[] = initialSavedViews.map((view) => ({
  ...view,
  columns: [...view.columns],
  filters: view.filters.map((filter) => ({ ...filter })),
  sort: [...view.sort],
}));

let memberDogsState: MeDogs = structuredClone(meDogsFixture);
let memberProfileState: MeProfile = structuredClone(meProfileFixture);

function resetMemberSelfServiceState(): void {
  memberDogsState = structuredClone(meDogsFixture);
  memberProfileState = structuredClone(meProfileFixture);
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
}

function memberValues(item: MemberListItem, field: string): string[] | undefined {
  switch (field) {
    case "birthDate":
      return [item.birthDate];
    case "bookingBlocked":
      return [String(item.bookingBlocked)];
    case "city":
      return [item.city];
    case "displayStatus":
      return [item.displayStatus.kind];
    case "dogLevelId":
      return item.dogs.map((dog) => `level-${dog.levelCode.toLocaleLowerCase()}`);
    case "dogName":
      return item.dogs.map((dog) => dog.name);
    case "familyGroupId":
      return item.familyGroup === undefined ? [] : [item.familyGroup];
    case "freeTrainingAllowed":
      return [String(item.freeTrainingAllowed)];
    case "fullName":
      return [item.fullName];
    case "gender":
      return [item.gender];
    case "hasPendingDocuments":
      return [String(item.pendingDocuments > 0)];
    case "imageRightsGranted":
      return [String(item.imageRightsGranted)];
    case "joinedAt":
      return [item.joinedAt];
    case "lastName":
      return [item.lastName];
    case "leaveDate":
      return item.leaveDate === undefined ? [] : [item.leaveDate];
    case "memberNumber":
      return [String(item.memberNumber)];
    case "nextInvoiceDate":
      return item.nextInvoiceDate === undefined ? [] : [item.nextInvoiceDate];
    case "paymentMethodType":
      return [item.paymentMethod?.includes("····") === true ? "SEPA_DD" : "MANUAL"];
    case "planId":
      return [item.plan.id];
    case "postalCode":
      return [item.postalCode];
    case "priceId":
      return item.priceId === undefined ? [] : [item.priceId];
    case "roles":
      return item.roles;
    case "status":
      return [item.status];
    default:
      return undefined;
  }
}

function dogValues(item: DogListItem, field: string): string[] | undefined {
  switch (field) {
    case "birthDate":
      return [item.birthDate ?? ""];
    case "breed":
      return [item.breed];
    case "chip":
      return [item.chip];
    case "freeTrainingAllowed":
      return [String(item.freeTrainingAllowed)];
    case "hasLicense":
      return [String(item.licenses.length > 0)];
    case "hasPendingDocuments":
      return [String(item.pendingDocuments > 0)];
    case "levelAssignedAt":
      return [item.levelAssignedAt];
    case "levelId":
      return [item.level.id];
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
      return [item.status];
    default:
      return undefined;
  }
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
    [item.fullName, item.idDocument, item.contact, ...item.dogs.map((dog) => dog.name)].some(
      (value) => normalized(value).includes(target),
    ),
  );
}

function filterDogsBySearch(items: readonly DogListItem[], query: string): DogListItem[] {
  const target = normalized(query);
  if (target === "") {
    return [...items];
  }
  return items.filter((item) =>
    [item.name, item.owner.fullName, item.chip].some((value) => normalized(value).includes(target)),
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
    return (member as MemberListItem).plan.name;
  }
  if (member !== undefined && field === "levelId") {
    return (member as DogListItem).level.name;
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
    city: (item) => item.city,
    firstName: (item) => item.firstName,
    joinedAt: (item) => item.joinedAt,
    lastName: (item) => item.lastName,
    leaveDate: (item) => item.leaveDate ?? "",
    memberNumber: (item) => item.memberNumber,
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
    levelAssignedAt: (item) => item.levelAssignedAt,
    levelOrder: (item) => item.level.order,
    name: (item) => item.name,
    ownerLastName: (item) => item.owner.lastName,
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

function currentMemberDog(id: string): MeDog | undefined {
  return memberDogsState.dogs.find((dog) => dog.id === id);
}

function currentDog(id: string): DogDetail | undefined {
  return censusRecordState.dogs[id];
}

function replaceDog(dog: DogDetail): DogDetail {
  censusRecordState.dogs[dog.id] = dog;
  censusRecordState.memberOverview.dogs = censusRecordState.memberOverview.dogs.map((summary) =>
    summary.id === dog.id
      ? {
          ...summary,
          breed: dog.breed,
          freeTrainingAllowed: dog.freeTraining.allowed,
          ...(dog.instructorNote === undefined ? {} : { instructorNote: dog.instructorNote }),
          ...(dog.level === undefined ? {} : { level: dog.level }),
          name: dog.name,
        }
      : summary,
  );
  return dog;
}

function mockTokens() {
  return {
    access_token: "mock-access-token",
    refresh_token: "mock-refresh-token",
    scope: "openid profile",
    token_type: "Bearer",
    expires_in: 900,
  };
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
      name: branding.club?.name ?? "AgilityHub",
      short_name: branding.club?.name ?? "AgilityHub",
      start_url: "/inici",
    });
  }),
  http.get("*/api/v1/me", ({ request }) => {
    if (request.headers.get("Authorization") === "Bearer mock-impersonation-token") {
      mockScenario("impersonated");
    }
    return HttpResponse.json(currentMockScenario().me);
  }),
  http.patch("*/api/v1/me", async ({ request }) => {
    const body = (await request.json()) as UpdateMeRequest;
    const scenario = currentMockScenario();
    if (body.locale !== undefined && scenario.branding.locales?.includes(body.locale) !== true) {
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
    if (body.contactEmails[0]?.email === "readonly@example.test") {
      return validationError([{ code: "READ_ONLY", field: "firstName" }]);
    }
    if (body.version !== memberProfileState.version) {
      return apiError("STALE_VERSION", "Stale version", 409);
    }
    memberProfileState = {
      ...memberProfileState,
      address: body.address,
      contactEmails: body.contactEmails.map((email) => ({ ...email, bounced: false })),
      phones: body.phones,
      version: memberProfileState.version + 1,
    };
    return HttpResponse.json(memberProfileState);
  }),
  http.get("*/api/v1/me/dogs", () => HttpResponse.json(memberDogsState)),
  http.put("*/api/v1/me/dogs/:id/instructor-note", async ({ params, request }) => {
    if (!currentMockScenario().branding.modules?.includes("TASKS")) {
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
  http.get<{ key: string }, never, Parameter | ApiErrorResponse>(
    "*/api/v1/parameters/:key",
    ({ params, request }) => {
      const key = params.key;
      const locale = request.headers.get("Accept-Language")?.split(/[-,]/u)[0] ?? "ca";
      const scenario = currentMockScenario();
      const base: Omit<Parameter, "key" | "label" | "type" | "value" | "version"> = {
        constraints: {},
        editableBy: "CLUB",
        help: "",
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
        const club = scenario.branding.club?.name ?? "AgilityHub";
        const contact = `contact@${scenario.branding.club?.slug ?? "club"}.example.test`;
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
    const updated = {
      ...member,
      ...body,
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
    const preferences = censusRecordState.memberOverview.notificationPreferences;
    censusRecordState.memberOverview.notificationPreferences = {
      ...preferences,
      ...body,
      emailByCategory: {
        ...preferences.emailByCategory,
        ...body.emailByCategory,
      },
    };
    return HttpResponse.json(censusRecordState.memberOverview.notificationPreferences);
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
    const dog = currentDog(String(params.id));
    if (dog === undefined) {
      return apiError("NOT_FOUND", "Dog not found", 404);
    }
    const body = (await request.json()) as DogPatchRequest;
    if (body.version !== dog.version) {
      return apiError("STALE_VERSION", "Stale version", 409);
    }
    const duplicateChip = Object.values(censusRecordState.dogs).some(
      (candidate) => candidate.id !== dog.id && candidate.chip === body.chip,
    );
    if (duplicateChip) {
      return apiError("CHIP_ALREADY_EXISTS", "Chip already exists", 409);
    }
    return HttpResponse.json(replaceDog({ ...dog, ...body, version: dog.version + 1 }));
  }),
  http.patch("*/api/v1/dogs/:id/level", async ({ params, request }) => {
    const dog = currentDog(String(params.id));
    if (dog === undefined) {
      return apiError("NOT_FOUND", "Dog not found", 404);
    }
    const body = (await request.json()) as DogLevelRequest;
    const level = censusLevels.find((candidate) => candidate.id === body.levelId);
    if (!level?.active) {
      return apiError("LEVEL_NOT_ACTIVE", "Level not active", 422);
    }
    if (level.id === dog.level?.id) {
      return apiError("LEVEL_UNCHANGED", "Level unchanged", 422);
    }
    const assignedAt = "2026-09-06T15:00:00Z";
    dog.levelHistory = [
      ...dog.levelHistory.map((entry) =>
        entry.to === undefined ? { ...entry, to: assignedAt } : entry,
      ),
      {
        byAccountId: "account-admin",
        from: assignedAt,
        levelCode: level.code,
        levelId: level.id,
      },
    ];
    dog.level = level;
    dog.levelAssignedAt = assignedAt;
    if (dog.freeTraining.override === null) {
      dog.freeTraining = {
        allowed: level.grantsFreeTraining,
        override: null,
        source: "LEVEL",
      };
    }
    replaceDog(dog);
    return HttpResponse.json({
      level,
      levelAssignedAt: assignedAt,
      warnings: { futureBookingsOutsideLevel: dog.id === "dog-duna" ? 1 : 0 },
    });
  }),
  http.patch("*/api/v1/dogs/:id/free-training", async ({ params, request }) => {
    const dog = currentDog(String(params.id));
    if (dog === undefined) {
      return apiError("NOT_FOUND", "Dog not found", 404);
    }
    const body = (await request.json()) as FreeTrainingRequest;
    const allowed = body.override ?? dog.level?.grantsFreeTraining ?? false;
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
      (member) => member.id === body.toMemberId && member.status === "ACTIVE",
    );
    if (target === undefined) {
      return apiError("TARGET_MEMBER_NOT_ACTIVE", "Target member not active", 409);
    }
    dog.owner = {
      fullName: target.fullName,
      id: target.id,
      memberNumber: target.memberNumber,
      status: target.status,
    };
    return HttpResponse.json(replaceDog(dog));
  }),
  http.post("*/api/v1/dogs/:id/deactivation", ({ params }) => {
    const dog = currentDog(String(params.id));
    if (dog === undefined) {
      return apiError("NOT_FOUND", "Dog not found", 404);
    }
    if (dog.status !== "ACTIVE") {
      return apiError("DOG_NOT_ACTIVE", "Dog not active", 409);
    }
    dog.status = "INACTIVE";
    dog.deactivatedAt = "2026-09-06T15:00:00Z";
    dog.deactivationReason = "CLUB";
    return HttpResponse.json(replaceDog(dog));
  }),
  http.post("*/api/v1/dogs/:id/reactivation", ({ params }) => {
    const dog = currentDog(String(params.id));
    if (dog === undefined) {
      return apiError("NOT_FOUND", "Dog not found", 404);
    }
    if (dog.owner.status !== "ACTIVE") {
      return apiError("TARGET_MEMBER_NOT_ACTIVE", "Target member not active", 409);
    }
    dog.status = "ACTIVE";
    delete dog.deactivatedAt;
    delete dog.deactivationReason;
    return HttpResponse.json(replaceDog(dog));
  }),
  http.put("*/api/v1/dogs/:id/photo", async ({ params, request }) => {
    const dog = currentDog(String(params.id));
    if (dog === undefined) {
      return apiError("NOT_FOUND", "Dog not found", 404);
    }
    const body = (await request.json()) as PhotoRequest;
    dog.photoUrl = `https://files.example.test/${body.fileKey}`;
    return HttpResponse.json({ photoUrl: dog.photoUrl });
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
      id: `file-${String(document.files.length + 1)}-${dog.id}`,
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
      { fileKey, uploadUrl: `https://uploads.example.test/${fileKey}` },
      { status: 201 },
    );
  }),
  http.put("https://uploads.example.test/:fileKey", () => new HttpResponse(null, { status: 200 })),
  http.get("*/api/v1/levels", () =>
    HttpResponse.json({ items: censusLevels, totalItems: censusLevels.length }),
  ),
  http.get("*/api/v1/saved-views", ({ request }) => {
    const listKey = new URL(request.url).searchParams.get("listKey");
    return HttpResponse.json(savedViews.filter((view) => view.listKey === listKey));
  }),
  http.post("*/api/v1/saved-views", async ({ request }) => {
    const body = (await request.json()) as SavedViewRequest;
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
    };
    savedViews.push(view);
    return HttpResponse.json(view, { status: 201 });
  }),
  http.put("*/api/v1/saved-views/:id", async ({ params, request }) => {
    const body = (await request.json()) as SavedViewRequest;
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

export { mockScenario, resetCensusRecordState, resetMemberSelfServiceState, type MockScenario };
