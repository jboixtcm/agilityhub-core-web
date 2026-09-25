import { http, HttpResponse } from "msw";

import type { components } from "../generated/schema";

import {
  activityListItem,
  activityResource,
  activityRow,
  activityState,
  cancellationPreview,
  counters,
  endsAt,
  liveRegistrations,
  localized,
  MEMBER_ID,
  memberActivityDetail,
  MOCK_ACTIVITY_ACCOUNT,
  nextActivityId,
  registrationListItem,
  registrationOpen,
  registrationResource,
  registrationWindow,
  ringConflicts,
  slugFor,
  startsAt,
  type StoredActivity,
  type StoredRegistration,
  typeDisplay,
} from "./fixtures/activities";
import { catalogState } from "./fixtures/catalogs";
import { clubLocalDate } from "./fixtures/planning";
import { apiError, levelsEnabled, readerLocale, validationError } from "./planning-handlers";
import { currentMockScenario } from "./scenarios";

type ActivityCreateRequest = components["schemas"]["ActivityCreateRequest"];
type ActivityPatchRequest = components["schemas"]["ActivityPatchRequest"];
type ActivityImageRequest = components["schemas"]["ActivityImageRequest"];
type ActivityDocumentRequest = components["schemas"]["ActivityDocumentRequest"];
type ActivityCancellationRequest = components["schemas"]["ActivityCancellationRequest"];
type ActivityRegistrationRequest = components["schemas"]["ActivityRegistrationRequest"];
type RegistrationCancellationRequest = components["schemas"]["RegistrationCancellationRequest"];
type ActivityRegistrationListItem = components["schemas"]["ActivityRegistrationListItem"];
type ActivityListItem = components["schemas"]["ActivityListItem"];
interface PublicationRequest {
  adminText?: string | null;
  cancelBookings?: boolean;
  cancelClasses?: boolean;
  notifyEmail?: boolean;
}
interface ListFilter {
  field: string;
  op: string;
  value: string;
}

const MAX_DOCUMENTS = 10;
const SLOT_MINUTES = 10;
const FILTER_OPERATORS = [
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
];

function hasModule(module: string): boolean {
  return currentMockScenario().branding.modules.includes(module);
}

function roles(): readonly string[] {
  return currentMockScenario().me.membership?.roles ?? [];
}

function isAdmin(): boolean {
  return roles().includes("ADMIN");
}

function currentMemberId(): string {
  return currentMockScenario().me.membership?.memberId ?? MEMBER_ID;
}

function moduleDisabled() {
  return hasModule("ACTIVITIES") ? undefined : apiError("MODULE_DISABLED", "Module disabled", 404);
}

function forbidden() {
  return apiError("FORBIDDEN", "Forbidden", 403);
}

function findActivity(id: string): StoredActivity | undefined {
  return activityState.activities.find((activity) => activity.id === id);
}

function notFound() {
  return apiError("NOT_FOUND", "Activity not found", 404);
}

function resource(activity: StoredActivity, request: Request) {
  return activityResource(activity, readerLocale(request), isAdmin(), hasModule("WAITLIST"));
}

function normalized(value: string): string {
  return value
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();
}

function parseFilters(url: URL): ListFilter[] | undefined {
  const filters: ListFilter[] = [];
  for (const serialized of url.searchParams.getAll("filter")) {
    const first = serialized.indexOf(":");
    const second = serialized.indexOf(":", first + 1);
    const op = serialized.slice(first + 1, second);
    if (first <= 0 || second <= first + 1 || !FILTER_OPERATORS.includes(op)) return undefined;
    filters.push({ field: serialized.slice(0, first), op, value: serialized.slice(second + 1) });
  }
  return filters;
}

function matches(values: readonly string[], filter: ListFilter): boolean {
  const targets = filter.value.split(",");
  switch (filter.op) {
    case "eq":
      return values.includes(filter.value);
    case "ne":
      return !values.includes(filter.value);
    case "in":
      return values.some((value) => targets.includes(value));
    case "nin":
      return values.every((value) => !targets.includes(value));
    case "contains":
      return values.some((value) => normalized(value).includes(normalized(filter.value)));
    case "startsWith":
      return values.some((value) => normalized(value).startsWith(normalized(filter.value)));
    case "exists":
      return filter.value === "true" ? values.some((value) => value !== "") : values.length === 0;
    case "lt":
      return values.some((value) => value < filter.value);
    case "lte":
      return values.some((value) => value <= filter.value);
    case "gt":
      return values.some((value) => value > filter.value);
    case "gte":
      return values.some((value) => value >= filter.value);
    case "between": {
      const [start = "", end = ""] = targets;
      return values.some((value) => value >= start && value <= end);
    }
    default:
      return false;
  }
}

function activityValues(activity: StoredActivity, field: string): string[] | undefined {
  switch (field) {
    case "state":
      return [activity.state];
    case "type":
      return [activity.type];
    case "date":
      return [activity.date];
    case "ringId":
      return activity.ringIds;
    case "levelId":
      return activity.levelIds;
    case "deleted":
      return [String(activity.cancellation?.reason === "DELETED")];
    case "registrationOpen":
      return [String(registrationOpen(activity))];
    default:
      return undefined;
  }
}

function registrationValues(registration: StoredRegistration, field: string): string[] | undefined {
  switch (field) {
    case "activityId":
      return [registration.activityId];
    case "state":
      return [registration.state];
    case "origin":
      return [registration.origin];
    case "registeredAt":
      return [registration.registeredAt];
    case "memberId":
      return [registration.member.id];
    default:
      return undefined;
  }
}

function filterBy<Item>(
  items: readonly Item[],
  filters: readonly ListFilter[],
  values: (item: Item, field: string) => string[] | undefined,
): Item[] | undefined {
  if (
    filters.some(
      (filter) => items.length > 0 && values(items[0] as Item, filter.field) === undefined,
    )
  ) {
    return undefined;
  }
  return items.filter((item) =>
    filters.every((filter) => {
      const itemValues = values(item, filter.field);
      return itemValues !== undefined && matches(itemValues, filter);
    }),
  );
}

function knownFields(filters: readonly ListFilter[], known: readonly string[]): boolean {
  return filters.every((filter) => known.includes(filter.field));
}

function page<Item>(url: URL, items: readonly Item[], filters: readonly ListFilter[]) {
  const requestedSize = Number(url.searchParams.get("size") ?? 50);
  const size = [20, 50, 200, 1000].includes(requestedSize) ? requestedSize : 50;
  const requestedPage = Number(url.searchParams.get("page") ?? 0);
  const pageIndex = Number.isInteger(requestedPage) && requestedPage >= 0 ? requestedPage : 0;
  return {
    appliedFilters: filters.map((filter) => ({
      field: filter.field,
      op: filter.op,
      value: filter.value,
    })),
    items: items.slice(pageIndex * size, pageIndex * size + size),
    page: pageIndex,
    size,
    totalItems: items.length,
    totalPages: Math.ceil(items.length / size),
  };
}

function sorted<Item>(
  items: readonly Item[],
  sort: readonly string[],
  key: (item: Item, field: string) => string | number,
): Item[] {
  return [...items].sort((left, right) => {
    for (const entry of sort) {
      const [field = "", direction = "asc"] = entry.split(",");
      const a = key(left, field);
      const b = key(right, field);
      const order =
        typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
      if (order !== 0) return direction === "desc" ? -order : order;
    }
    return 0;
  });
}

const ACTIVITY_FIELDS = [
  "state",
  "type",
  "date",
  "ringId",
  "levelId",
  "deleted",
  "registrationOpen",
];
const REGISTRATION_FIELDS = ["state", "origin", "registeredAt", "memberId"];
// `GET /activity-registrations/export` also takes `activityId` (the activity's registrants).
const REGISTRATION_EXPORT_FIELDS = ["activityId", ...REGISTRATION_FIELDS];
/** The response keys of `ActivityRegistrationListItem`: the only values `fields` accepts. */
const REGISTRATION_ITEM_KEYS = [
  "cancelReason",
  "cancelledAt",
  "member",
  "origin",
  "position",
  "registeredAt",
  "registrationId",
  "state",
];
/** The response keys of `ActivityListItem`; the core always sends `id`. */
const ACTIVITY_ITEM_KEYS = [
  "allRings",
  "createdAt",
  "date",
  "endTime",
  "id",
  "location",
  "maxPlaces",
  "registrationTo",
  "registrations",
  "rings",
  "slug",
  "startTime",
  "state",
  "title",
  "type",
  "typeDisplay",
];

/**
 * A list's `fields` as the core applies it (seen on the published core, E4-W05): a key that is not
 * a response key is `400 INVALID_FILTER`, and every key that was not asked for comes back empty —
 * `null`, or `false` for a flag — except the ones the core always sends (`always`). `null` = no
 * `fields`: whole items.
 */
function fieldsProjection<Item extends object>(
  url: URL,
  itemKeys: readonly string[],
  always: readonly string[],
): ((item: Item) => Item) | null | undefined {
  const raw = url.searchParams.get("fields");
  if (raw === null || raw.trim() === "") return null;
  const keys = raw
    .split(",")
    .map((key) => key.trim())
    .filter((key) => key !== "");
  if (!keys.every((key) => itemKeys.includes(key))) return undefined;
  const kept = new Set([...always, ...keys]);
  return (item) =>
    Object.fromEntries(
      Object.entries(item).map(([key, value]) => [
        key,
        kept.has(key) ? value : typeof value === "boolean" ? false : null,
      ]),
    ) as Item;
}

/** The list's `q` over the activity titles in the reader's locale. */
function searchActivities(
  activities: readonly StoredActivity[],
  url: URL,
  locale: string,
): StoredActivity[] {
  const query = normalized(url.searchParams.get("q") ?? "");
  return activities.filter(
    (activity) =>
      query === "" || normalized(localized(activity.titleI18n, locale) ?? "").includes(query),
  );
}

/** The list's `q` over the registrants' names. */
function searchRegistrations(
  registrations: readonly StoredRegistration[],
  url: URL,
): StoredRegistration[] {
  const query = normalized(url.searchParams.get("q") ?? "");
  return registrations.filter(
    (registration) => query === "" || normalized(registration.member.fullName).includes(query),
  );
}

/** Rows of `GET /activities/export` (ADMIN): the list's `q` and filters, or the api's error. */
export function activityExportRows(request: Request): number | Response {
  const disabled = moduleDisabled();
  if (disabled !== undefined) return disabled;
  if (!isAdmin()) return forbidden();
  const url = new URL(request.url);
  const filters = parseFilters(url);
  if (filters === undefined || !knownFields(filters, ACTIVITY_FIELDS)) {
    return apiError("INVALID_FILTER", "Invalid activity filter", 400);
  }
  return searchActivities(
    filterBy(activityState.activities, filters, activityValues) ?? [],
    url,
    readerLocale(request),
  ).length;
}

/** Rows of `GET /activity-registrations/export` (ADMIN): `q` and filters, or the api's error. */
export function registrationExportRows(request: Request): number | Response {
  const disabled = moduleDisabled();
  if (disabled !== undefined) return disabled;
  if (!isAdmin()) return forbidden();
  const url = new URL(request.url);
  const filters = parseFilters(url);
  if (filters === undefined || !knownFields(filters, REGISTRATION_EXPORT_FIELDS)) {
    return apiError("INVALID_FILTER", "Invalid registration filter", 400);
  }
  return searchRegistrations(
    filterBy(activityState.registrations, filters, registrationValues) ?? [],
    url,
  ).length;
}

const stateLabels: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  ca: {
    CANCELLED: "cancel·lada",
    DRAFT: "esborrany",
    FINISHED: "finalitzada",
    PUBLISHED: "publicada",
  },
  en: { CANCELLED: "cancelled", DRAFT: "draft", FINISHED: "finished", PUBLISHED: "published" },
  es: { CANCELLED: "cancelada", DRAFT: "borrador", FINISHED: "finalizada", PUBLISHED: "publicada" },
};

function filterValueLabel(field: string, value: string, locale: string): string {
  if (field === "state") return (stateLabels[locale] ?? stateLabels.ca)?.[value] ?? value;
  if (field === "type") {
    const sample = activityState.activities.find((activity) => activity.type === value);
    return sample === undefined ? value : typeDisplay({ ...sample, typeLabel: null }, locale);
  }
  if (field === "ringId")
    return catalogState.rings.find((ring) => ring.id === value)?.name ?? value;
  if (field === "levelId")
    return catalogState.levels.find((level) => level.id === value)?.name ?? value;
  return value;
}

/** HH:mm of a time aligned to `classes.slotMinutes`. */
function alignedTime(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  const [hours = "0", minutes = "0"] = value.split(":");
  return (Number(hours) * 60 + Number(minutes)) % SLOT_MINUTES === 0;
}

function replay(request: Request): { body: unknown; status: number } | undefined {
  const key = request.headers.get("Idempotency-Key");
  return key === null
    ? undefined
    : activityState.replays.get(`${new URL(request.url).pathname}|${key}`);
}

function remember(request: Request, body: unknown, status: number) {
  const key = request.headers.get("Idempotency-Key");
  if (key !== null) {
    activityState.replays.set(`${new URL(request.url).pathname}|${key}`, { body, status });
  }
  return HttpResponse.json(body as Record<string, unknown>, { status });
}

/**
 * R-07-05, all or nothing: another ring block (`type: RING_BLOCK`) is never forceable; classes
 * yield only to `cancelClasses` (+ `adminText` when they have registrants), training bookings
 * only to `cancelBookings`.
 */
function conflictResponse(activity: StoredActivity, options: PublicationRequest) {
  const preview = ringConflicts(activity);
  const unresolved = preview.conflicts.filter(
    (conflict) => conflict.type === "RING_BLOCK" || options.cancelClasses !== true,
  );
  if (unresolved.length > 0) {
    return apiError("RING_BLOCK_CONFLICT", "Ring block conflict", 409, {
      conflicts: unresolved,
    });
  }
  if (
    preview.conflicts.some(
      (conflict) => conflict.type === "CLASS" && (conflict.bookedCount ?? 0) > 0,
    ) &&
    (options.adminText ?? "").trim() === ""
  ) {
    return apiError("ADMIN_TEXT_REQUIRED", "Admin text required", 422);
  }
  if (preview.trainingBookings.length > 0 && options.cancelBookings !== true) {
    return apiError("RING_HAS_BOOKINGS", "Ring has bookings", 422, {
      bookings: preview.trainingBookings,
    });
  }
  return undefined;
}

function incompleteFields(activity: StoredActivity): { code: string; field: string }[] {
  const fields: { code: string; field: string }[] = [];
  const defaultLocale = currentMockScenario().branding.defaultLocale;
  if ((activity.titleI18n[defaultLocale] ?? "").trim() === "")
    fields.push({ code: "REQUIRED", field: "title" });
  if (activity.registrationFrom === null)
    fields.push({ code: "REQUIRED", field: "registrationFrom" });
  if (activity.registrationTo === null) fields.push({ code: "REQUIRED", field: "registrationTo" });
  if (!activity.location.atClub && (activity.location.name ?? "").trim() === "") {
    fields.push({ code: "REQUIRED", field: "location.name" });
  }
  if (activity.ringIds.length > 0 && (activity.startTime === null || activity.endTime === null)) {
    fields.push({ code: "REQUIRED", field: activity.startTime === null ? "startTime" : "endTime" });
  }
  return fields;
}

function applyPatch(activity: StoredActivity, body: ActivityPatchRequest): StoredActivity {
  const next: StoredActivity = { ...activity };
  if (body.title !== undefined) next.titleI18n = body.title;
  if (body.type !== undefined) next.type = body.type;
  if (body.typeLabel !== undefined) next.typeLabel = body.typeLabel;
  if (body.shortDescription !== undefined) next.shortDescriptionI18n = body.shortDescription;
  if (body.longDescription !== undefined) next.longDescriptionI18n = body.longDescription;
  if (body.location !== undefined) {
    next.location = {
      address: body.location.address ?? null,
      atClub: body.location.atClub,
      name: body.location.name ?? null,
      url: body.location.url ?? null,
    };
  }
  if (body.ringIds !== undefined) next.ringIds = body.ringIds;
  if (body.date !== undefined) next.date = body.date;
  if (body.startTime !== undefined) next.startTime = body.startTime;
  if (body.endTime !== undefined) next.endTime = body.endTime;
  if (body.ringBlockWindow !== undefined) next.ringBlockWindow = body.ringBlockWindow;
  if (body.registrationFrom !== undefined) next.registrationFrom = body.registrationFrom;
  if (body.registrationTo !== undefined) next.registrationTo = body.registrationTo;
  if (body.minPlaces !== undefined) next.minPlaces = body.minPlaces;
  if (body.maxPlaces !== undefined) next.maxPlaces = body.maxPlaces;
  if (body.levelIds !== undefined) next.levelIds = levelsEnabled() ? body.levelIds : [];
  if (body.waitlistEnabled !== undefined) {
    next.waitlistEnabled = hasModule("WAITLIST") && body.waitlistEnabled;
  }
  if (body.slug !== undefined) next.slug = body.slug;
  if (body.internalNotes !== undefined) next.internalNotes = body.internalNotes;
  return next;
}

/** R-07-08: the lowest waitlist position takes each free place, in order. */
function promote(activity: StoredActivity) {
  if (activity.maxPlaces === null) return;
  let free = activity.maxPlaces - counters(activity.id).active;
  const waiting = liveRegistrations(activity.id)
    .filter((registration) => registration.state === "WAITLISTED")
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0));
  for (const registration of waiting) {
    if (free <= 0) break;
    registration.state = "ACTIVE";
    registration.position = null;
    registration.promotedAt = new Date().toISOString();
    free -= 1;
  }
}

export const activityHandlers = [
  http.get("*/api/v1/activities", ({ request }) => {
    const disabled = moduleDisabled();
    if (disabled !== undefined) return disabled;
    if (!roles().some((role) => role === "ADMIN" || role === "INSTRUCTOR")) return forbidden();
    const url = new URL(request.url);
    const filters = parseFilters(url);
    const projection = fieldsProjection<ActivityListItem>(url, ACTIVITY_ITEM_KEYS, ["id"]);
    if (
      filters === undefined ||
      !knownFields(filters, ACTIVITY_FIELDS) ||
      projection === undefined
    ) {
      return apiError("INVALID_FILTER", "Invalid activity filter", 400);
    }
    const locale = readerLocale(request);
    const matching = searchActivities(
      filterBy(activityState.activities, filters, activityValues) ?? [],
      url,
      locale,
    );
    const sort = url.searchParams.getAll("sort");
    const ordered = sorted(matching, sort.length === 0 ? ["date,desc"] : sort, (activity, field) =>
      field === "title"
        ? normalized(localized(activity.titleI18n, locale) ?? "")
        : field === "state"
          ? activity.state
          : field === "createdAt"
            ? activity.createdAt
            : `${activity.date}T${activity.startTime ?? "00:00"}`,
    );
    const items = ordered.map((activity) => activityListItem(activity, locale));
    return HttpResponse.json(
      page(url, projection === null ? items : items.map(projection), filters),
    );
  }),
  http.get("*/api/v1/activities/filter-values", ({ request }) => {
    const disabled = moduleDisabled();
    if (disabled !== undefined) return disabled;
    const url = new URL(request.url);
    const field = url.searchParams.get("field") ?? "";
    const filters = parseFilters(url);
    if (
      filters === undefined ||
      !ACTIVITY_FIELDS.includes(field) ||
      !knownFields(filters, ACTIVITY_FIELDS)
    ) {
      return apiError("INVALID_FILTER", "Invalid activity filter", 400);
    }
    const locale = readerLocale(request);
    const counts = new Map<string, number>();
    for (const activity of filterBy(activityState.activities, filters, activityValues) ?? []) {
      for (const value of activityValues(activity, field) ?? []) {
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
    }
    return HttpResponse.json({
      field,
      values: [...counts].map(([value, count]) => ({
        count,
        label: filterValueLabel(field, value, locale),
        value,
      })),
    });
  }),
  http.post("*/api/v1/activities", async ({ request }) => {
    const disabled = moduleDisabled();
    if (disabled !== undefined) return disabled;
    if (!isAdmin()) return forbidden();
    const body = (await request.json()) as ActivityCreateRequest;
    const defaultLocale = currentMockScenario().branding.defaultLocale;
    const title = Object.fromEntries(
      Object.entries(body.title).filter(([, value]) => value.trim() !== ""),
    );
    if ((title[defaultLocale] ?? "") === "") return validationError("title", "REQUIRED");
    if (
      Object.keys(title).some((locale) => !currentMockScenario().branding.locales.includes(locale))
    ) {
      return apiError("LOCALE_NOT_ENABLED", "Locale not enabled", 422);
    }
    const activity: StoredActivity = {
      cancellation: null,
      createdAt: new Date().toISOString(),
      date: clubLocalDate(),
      documents: [],
      endTime: null,
      id: nextActivityId("activity"),
      image: null,
      internalNotes: null,
      levelIds: [],
      location: { address: null, atClub: true, name: null, url: null },
      longDescriptionI18n: null,
      maxPlaces: null,
      minPlaces: null,
      publishedAt: null,
      registrationFrom: null,
      registrationTo: null,
      ringBlockWindow: null,
      ringIds: [],
      shortDescriptionI18n: null,
      slug: slugFor(title[defaultLocale] ?? ""),
      startTime: null,
      state: "DRAFT",
      titleI18n: title,
      type: body.type,
      typeLabel: null,
      version: 1,
      waitlistEnabled: false,
    };
    activityState.activities.push(activity);
    return HttpResponse.json(resource(activity, request), { status: 201 });
  }),
  http.get("*/api/v1/activities/:id", ({ params, request }) => {
    const disabled = moduleDisabled();
    if (disabled !== undefined) return disabled;
    if (!roles().some((role) => role === "ADMIN" || role === "INSTRUCTOR")) return forbidden();
    const activity = findActivity(String(params.id));
    return activity === undefined ? notFound() : HttpResponse.json(resource(activity, request));
  }),
  http.patch("*/api/v1/activities/:id", async ({ params, request }) => {
    const disabled = moduleDisabled();
    if (disabled !== undefined) return disabled;
    if (!isAdmin()) return forbidden();
    const activity = findActivity(String(params.id));
    if (activity === undefined) return notFound();
    const body = (await request.json()) as ActivityPatchRequest;
    if (body.version !== activity.version) {
      return apiError("STALE_VERSION", "Stale activity version", 409);
    }
    const changed = Object.keys(body).filter(
      (key) => !["version", "cancelBookings", "cancelClasses", "adminText"].includes(key),
    );
    if (
      (activity.state === "FINISHED" || activity.state === "CANCELLED") &&
      changed.some((key) => key !== "internalNotes")
    ) {
      return apiError("INVALID_STATE", "Only internal notes can change", 409);
    }
    if (body.slug !== undefined && body.slug !== activity.slug) {
      if (activity.publishedAt !== null) return apiError("SLUG_LOCKED", "Slug locked", 409);
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/u.test(body.slug) || body.slug.length < 3) {
        return validationError("slug", "PATTERN");
      }
      if (
        activityState.activities.some((item) => item.id !== activity.id && item.slug === body.slug)
      ) {
        return apiError("DUPLICATE_SLUG", "Duplicate slug", 409);
      }
    }
    const next = applyPatch(activity, body);
    if (next.startTime !== null && next.endTime !== null && next.startTime >= next.endTime) {
      return apiError("INVALID_TIME_RANGE", "Invalid time range", 400, {
        fieldErrors: [{ code: "INVALID_TIME_RANGE", field: "endTime" }],
      });
    }
    if (!alignedTime(next.startTime) || !alignedTime(next.endTime)) {
      return apiError("INVALID_SLOT_GRANULARITY", "Invalid slot granularity", 400, {
        fieldErrors: [
          {
            code: "INVALID_SLOT_GRANULARITY",
            field: alignedTime(next.startTime) ? "endTime" : "startTime",
          },
        ],
      });
    }
    if (
      next.registrationFrom !== null &&
      next.registrationTo !== null &&
      (next.registrationFrom > next.registrationTo || next.registrationTo > next.date)
    ) {
      return apiError("INVALID_TIME_RANGE", "Invalid registration period", 400, {
        fieldErrors: [{ code: "INVALID_TIME_RANGE", field: "registrationTo" }],
      });
    }
    if (!next.location.atClub && next.ringIds.length > 0)
      return validationError("ringIds", "NOT_AT_CLUB");
    if (next.maxPlaces !== null && next.maxPlaces < counters(activity.id).active) {
      return apiError("CAPACITY_BELOW_REGISTRATIONS", "Capacity below registrations", 422);
    }
    const resync =
      activity.state === "PUBLISHED" &&
      ["date", "startTime", "endTime", "ringIds", "ringBlockWindow", "location"].some(
        (key) => key in body,
      );
    if (resync) {
      const conflict = conflictResponse(next, body);
      if (conflict !== undefined) return conflict;
    }
    next.version = activity.version + 1;
    Object.assign(activity, next);
    promote(activity);
    return HttpResponse.json(resource(activity, request));
  }),
  http.put("*/api/v1/activities/:id/image", async ({ params, request }) => {
    const disabled = moduleDisabled();
    if (disabled !== undefined) return disabled;
    if (!isAdmin()) return forbidden();
    const activity = findActivity(String(params.id));
    if (activity === undefined) return notFound();
    const body = (await request.json()) as ActivityImageRequest;
    activity.image = {
      fileId: `file-${body.fileKey}`,
      name: body.name,
      url: `https://files.example.test/${body.fileKey}`,
    };
    activity.version += 1;
    return HttpResponse.json({ image: activity.image });
  }),
  http.delete("*/api/v1/activities/:id/image", ({ params }) => {
    const disabled = moduleDisabled();
    if (disabled !== undefined) return disabled;
    if (!isAdmin()) return forbidden();
    const activity = findActivity(String(params.id));
    if (activity === undefined) return notFound();
    activity.image = null;
    activity.version += 1;
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("*/api/v1/activities/:id/documents", async ({ params, request }) => {
    const disabled = moduleDisabled();
    if (disabled !== undefined) return disabled;
    if (!isAdmin()) return forbidden();
    const activity = findActivity(String(params.id));
    if (activity === undefined) return notFound();
    if (activity.documents.length >= MAX_DOCUMENTS) {
      return apiError("TOO_MANY_DOCUMENTS", "Too many documents", 422, { max: MAX_DOCUMENTS });
    }
    const body = (await request.json()) as ActivityDocumentRequest;
    const document = {
      id: nextActivityId("file"),
      name: body.name,
      url: `https://files.example.test/${body.fileKey}`,
    };
    activity.documents = [...activity.documents, document];
    activity.version += 1;
    return HttpResponse.json(document, { status: 201 });
  }),
  http.delete("*/api/v1/activities/:id/documents/:docId", ({ params }) => {
    const disabled = moduleDisabled();
    if (disabled !== undefined) return disabled;
    if (!isAdmin()) return forbidden();
    const activity = findActivity(String(params.id));
    if (activity === undefined) return notFound();
    activity.documents = activity.documents.filter(
      (document) => document.id !== String(params.docId),
    );
    activity.version += 1;
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("*/api/v1/activities/:id/ring-conflicts", ({ params }) => {
    const disabled = moduleDisabled();
    if (disabled !== undefined) return disabled;
    if (!isAdmin()) return forbidden();
    const activity = findActivity(String(params.id));
    return activity === undefined ? notFound() : HttpResponse.json(ringConflicts(activity));
  }),
  http.post("*/api/v1/activities/:id/publication", async ({ params, request }) => {
    const disabled = moduleDisabled();
    if (disabled !== undefined) return disabled;
    if (!isAdmin()) return forbidden();
    const replayed = replay(request);
    if (replayed !== undefined)
      return HttpResponse.json(replayed.body as Record<string, unknown>, {
        status: replayed.status,
      });
    const activity = findActivity(String(params.id));
    if (activity === undefined) return notFound();
    if (activity.state !== "DRAFT") return apiError("INVALID_STATE", "Not a draft", 409);
    const fieldErrors = incompleteFields(activity);
    if (fieldErrors.length > 0) {
      return apiError("ACTIVITY_INCOMPLETE", "Activity incomplete", 422, { fieldErrors });
    }
    if (activity.date < clubLocalDate())
      return apiError("ACTIVITY_IN_PAST", "Activity in the past", 422);
    const body = (await request.json()) as PublicationRequest;
    const conflict = conflictResponse(activity, body);
    if (conflict !== undefined) return conflict;
    activity.state = "PUBLISHED";
    activity.publishedAt = new Date().toISOString();
    activity.version += 1;
    return remember(request, resource(activity, request), 200);
  }),
  http.delete("*/api/v1/activities/:id/publication", ({ params, request }) => {
    const disabled = moduleDisabled();
    if (disabled !== undefined) return disabled;
    if (!isAdmin()) return forbidden();
    const activity = findActivity(String(params.id));
    if (activity === undefined) return notFound();
    if (activity.state !== "PUBLISHED") return apiError("INVALID_STATE", "Not published", 409);
    const current = counters(activity.id);
    if (current.active + current.waiting > 0) {
      return apiError("ACTIVITY_HAS_REGISTRATIONS", "Activity has registrations", 422);
    }
    activity.state = "DRAFT";
    activity.version += 1;
    return HttpResponse.json(resource(activity, request));
  }),
  http.get("*/api/v1/activities/:id/cancellation-preview", ({ params }) => {
    const disabled = moduleDisabled();
    if (disabled !== undefined) return disabled;
    if (!isAdmin()) return forbidden();
    const activity = findActivity(String(params.id));
    return activity === undefined
      ? notFound()
      : HttpResponse.json(cancellationPreview(activity.id, hasModule("SMS")));
  }),
  http.post("*/api/v1/activities/:id/cancellation", async ({ params, request }) => {
    const disabled = moduleDisabled();
    if (disabled !== undefined) return disabled;
    if (!isAdmin()) return forbidden();
    const replayed = replay(request);
    if (replayed !== undefined)
      return HttpResponse.json(replayed.body as Record<string, unknown>, {
        status: replayed.status,
      });
    const activity = findActivity(String(params.id));
    if (activity === undefined) return notFound();
    if (activity.state !== "DRAFT" && activity.state !== "PUBLISHED") {
      return apiError("INVALID_STATE", "Activity cannot be cancelled", 409);
    }
    const body = (await request.json()) as ActivityCancellationRequest;
    const live = liveRegistrations(activity.id);
    const text = (body.adminText ?? "").trim();
    if (live.length > 0 && (text === "" || text.length > 500)) {
      return apiError("ADMIN_TEXT_REQUIRED", "Admin text required", 422);
    }
    const now = new Date().toISOString();
    for (const registration of live) {
      registration.state = "CANCELLED";
      registration.cancelReason = "ACTIVITY_CANCELLED";
      registration.cancelledAt = now;
      registration.cancelledBy = "SYSTEM";
      // A waitlisted registration keeps its position once cancelled (E5-T15).
    }
    activity.state = "CANCELLED";
    activity.cancellation = {
      adminText: text === "" ? null : text,
      affectedCount: live.length,
      at: now,
      byAccountId: MOCK_ACTIVITY_ACCOUNT,
      reason: body.reason,
    };
    activity.version += 1;
    return remember(request, resource(activity, request), 200);
  }),
  http.get("*/api/v1/activities/:id/registrations", ({ params, request }) => {
    const disabled = moduleDisabled();
    if (disabled !== undefined) return disabled;
    if (!roles().some((role) => role === "ADMIN" || role === "INSTRUCTOR")) return forbidden();
    const activity = findActivity(String(params.id));
    if (activity === undefined) return notFound();
    const url = new URL(request.url);
    const filters = parseFilters(url);
    const projection = fieldsProjection<ActivityRegistrationListItem>(
      url,
      REGISTRATION_ITEM_KEYS,
      [],
    );
    if (
      filters === undefined ||
      !knownFields(filters, REGISTRATION_FIELDS) ||
      projection === undefined
    ) {
      return apiError("INVALID_FILTER", "Invalid registration filter", 400);
    }
    const rows = activityState.registrations.filter(
      (registration) => registration.activityId === activity.id,
    );
    const matching = searchRegistrations(filterBy(rows, filters, registrationValues) ?? [], url);
    const sort = url.searchParams.getAll("sort");
    const ordered = sorted(
      matching,
      sort.length === 0 ? ["registeredAt,asc"] : sort,
      (registration, field) =>
        field === "position"
          ? (registration.position ?? Number.MAX_SAFE_INTEGER)
          : field === "memberLastName"
            ? normalized(registration.member.fullName.split(" ").slice(1).join(" "))
            : registration.registeredAt,
    );
    const items = ordered.map(registrationListItem);
    // As the core: the path's activity comes back last among the applied filters.
    const applied = [...filters, { field: "activityId", op: "eq", value: activity.id }];
    return HttpResponse.json(
      page(url, projection === null ? items : items.map(projection), applied),
    );
  }),
  http.post("*/api/v1/activity-registrations", async ({ request }) => {
    const disabled = moduleDisabled();
    if (disabled !== undefined) return disabled;
    if (!roles().includes("MEMBER")) return forbidden();
    const replayed = replay(request);
    if (replayed !== undefined)
      return HttpResponse.json(replayed.body as Record<string, unknown>, {
        status: replayed.status,
      });
    const body = (await request.json()) as ActivityRegistrationRequest;
    const activity = findActivity(body.activityId);
    if (activity === undefined || activity.state === "DRAFT") return notFound();
    if (activity.state !== "PUBLISHED") {
      return apiError("ACTIVITY_NOT_PUBLISHED", "Activity not published", 422);
    }
    const window = registrationWindow(activity);
    const now = Date.now();
    if (window === undefined || now < window.opensAt || now >= window.closesAt) {
      return apiError("REGISTRATION_CLOSED", "Registration closed", 422, {
        closesAt: window === undefined ? null : new Date(window.closesAt).toISOString(),
        opensAt: window === undefined ? null : new Date(window.opensAt).toISOString(),
        reason: window !== undefined && now < window.opensAt ? "NOT_YET_OPEN" : "CLOSED",
      });
    }
    const memberId = currentMemberId();
    if (
      liveRegistrations(activity.id).some((registration) => registration.member.id === memberId)
    ) {
      return apiError("ALREADY_REGISTERED", "Already registered", 409);
    }
    const current = counters(activity.id);
    const full = activity.maxPlaces !== null && current.active >= activity.maxPlaces;
    const waitlistAvailable = hasModule("WAITLIST") && activity.waitlistEnabled;
    if (full && (!waitlistAvailable || body.joinWaitlist !== true)) {
      return apiError("ACTIVITY_FULL", "Activity full", 409, {
        waitlistAvailable,
        ...(waitlistAvailable ? { waiting: current.waiting } : {}),
      });
    }
    const positions = liveRegistrations(activity.id).map(
      (registration) => registration.position ?? 0,
    );
    const me = currentMockScenario().me;
    const registration: StoredRegistration = {
      activityId: activity.id,
      cancelReason: null,
      cancelledAt: null,
      cancelledBy: null,
      id: nextActivityId("registration"),
      member: {
        emails: [me.account.email],
        fullName: me.account.name,
        id: memberId,
        memberNumber: "118",
        phones: [{ label: null, number: "600000118", prefix: "+34" }],
      },
      origin: me.impersonation === undefined ? "APP" : "BACKOFFICE",
      position: full ? Math.max(0, ...positions) + 1 : null,
      promotedAt: null,
      registeredAt: new Date(now).toISOString(),
      state: full ? "WAITLISTED" : "ACTIVE",
    };
    activityState.registrations.push(registration);
    return remember(
      request,
      registrationResource(registration, activity, readerLocale(request)),
      201,
    );
  }),
  http.get("*/api/v1/activity-registrations/:id", ({ params, request }) => {
    const disabled = moduleDisabled();
    if (disabled !== undefined) return disabled;
    const registration = activityState.registrations.find((item) => item.id === String(params.id));
    const activity = registration === undefined ? undefined : findActivity(registration.activityId);
    if (
      registration === undefined ||
      activity === undefined ||
      (!isAdmin() &&
        !roles().includes("INSTRUCTOR") &&
        registration.member.id !== currentMemberId())
    ) {
      return apiError("NOT_FOUND", "Registration not found", 404);
    }
    return HttpResponse.json(registrationResource(registration, activity, readerLocale(request)));
  }),
  http.post("*/api/v1/activity-registrations/:id/cancellation", async ({ params, request }) => {
    const disabled = moduleDisabled();
    if (disabled !== undefined) return disabled;
    const registration = activityState.registrations.find((item) => item.id === String(params.id));
    const activity = registration === undefined ? undefined : findActivity(registration.activityId);
    if (
      registration === undefined ||
      activity === undefined ||
      registration.member.id !== currentMemberId()
    ) {
      return apiError("NOT_FOUND", "Registration not found", 404);
    }
    if (registration.state === "CANCELLED")
      return apiError("INVALID_STATE", "Already cancelled", 409);
    // R-07-09/10: under impersonation the admin cancels «as the member» with a required reason
    // (the api's `CancellationDeadline.check`: 400 VALIDATION_ERROR with `details.field`).
    const impersonated = currentMockScenario().me.impersonation !== undefined;
    const body = (await request.json().catch(() => ({}))) as RegistrationCancellationRequest;
    if (impersonated && (body.reason ?? "").trim() === "") {
      return apiError("VALIDATION_ERROR", "Reason required", 400, { field: "reason" });
    }
    if (Date.now() >= Date.parse(startsAt(activity))) {
      return apiError("REGISTRATION_NOT_CANCELLABLE", "Registration not cancellable", 422, {
        deadline: startsAt(activity),
      });
    }
    const wasActive = registration.state === "ACTIVE";
    registration.state = "CANCELLED";
    registration.cancelReason = impersonated ? "ADMIN" : "MEMBER";
    registration.cancelledAt = new Date().toISOString();
    registration.cancelledBy = impersonated ? "ADMIN" : "MEMBER";
    // A waitlisted registration keeps its position once cancelled (E5-T15); an active one has none.
    if (wasActive) promote(activity);
    return HttpResponse.json(registrationResource(registration, activity, readerLocale(request)));
  }),
  http.get("*/api/v1/me/activities", ({ request }) => {
    const disabled = moduleDisabled();
    if (disabled !== undefined) return disabled;
    const locale = readerLocale(request);
    const memberId = currentMemberId();
    const waitlist = hasModule("WAITLIST");
    const mine = activityState.registrations.filter(
      (registration) =>
        registration.member.id === memberId &&
        (registration.state === "ACTIVE" || registration.state === "WAITLISTED"),
    );
    const bookable = activityState.activities
      .filter(
        (activity) =>
          registrationOpen(activity) &&
          !mine.some((registration) => registration.activityId === activity.id),
      )
      .sort((left, right) => startsAt(left).localeCompare(startsAt(right)))
      .map((activity) => activityRow(activity, locale, waitlist));
    return HttpResponse.json({
      bookable,
      mine: mine.flatMap((registration) => {
        const activity = findActivity(registration.activityId);
        if (activity === undefined || Date.parse(endsAt(activity)) <= Date.now()) return [];
        const resource = registrationResource(registration, activity, locale);
        return [
          {
            activity: resource.activity,
            activityId: resource.activityId,
            cancellableUntil: resource.cancellableUntil,
            cancellation: resource.cancellation ?? null,
            id: resource.id,
            origin: resource.origin,
            position: resource.position ?? null,
            registeredAt: resource.registeredAt,
            state: resource.state,
          },
        ];
      }),
    });
  }),
  http.get("*/api/v1/me/activities/:activityId", ({ params, request }) => {
    const disabled = moduleDisabled();
    if (disabled !== undefined) return disabled;
    const activity = findActivity(String(params.activityId));
    if (
      activity === undefined ||
      (activity.state !== "PUBLISHED" && activity.state !== "FINISHED")
    ) {
      return apiError("NOT_FOUND", "Activity not available", 404);
    }
    return HttpResponse.json(
      memberActivityDetail(
        activity,
        readerLocale(request),
        currentMemberId(),
        hasModule("WAITLIST"),
      ),
    );
  }),
];
