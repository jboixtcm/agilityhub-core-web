import { delay, http, HttpResponse } from "msw";

import type { components } from "../generated/schema";

import {
  censusDogs,
  censusMembers,
  initialSavedViews,
  type DogListItem,
  type MemberListItem,
  type SavedView,
} from "./fixtures/census";
import { currentMockScenario, mockScenario, type MockScenario } from "./scenarios";

type ApiErrorResponse = components["schemas"]["ApiErrorResponse"];
type MagicLinkRequest = components["schemas"]["MagicLinkRequest"];
type UpdateMeRequest = components["schemas"]["UpdateMeRequest"];
type UpdatePasswordRequest = components["schemas"]["UpdatePasswordRequest"];
type UpdateProfileRequest = components["schemas"]["UpdateProfileRequest"];
type ListFilter = components["schemas"]["ListFilter"];
type SavedViewRequest = components["schemas"]["SavedViewRequest"];

const savedViews: SavedView[] = initialSavedViews.map((view) => ({
  ...view,
  columns: [...view.columns],
  filters: view.filters.map((filter) => ({ ...filter })),
  sort: [...view.sort],
}));

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
    { code, message },
    { status, ...(headers === undefined ? {} : { headers }) },
  );
}

function mockTokens() {
  return {
    access_token: "mock-access-token",
    refresh_token: "mock-refresh-token",
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
      name: branding.club.name,
      short_name: branding.club.name,
      start_url: "/inici",
    });
  }),
  http.get("*/api/v1/me", () => HttpResponse.json(currentMockScenario().me)),
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
    if (!currentMockScenario().me.membership.roles.includes(body.activeProfile)) {
      return apiError("PROFILE_NOT_AVAILABLE", "Profile not available", 422);
    }
    return HttpResponse.json({ access_token: `mock-${body.activeProfile.toLowerCase()}-token` });
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
      return form.get("code") === "invalid"
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

export { mockScenario, type MockScenario };
