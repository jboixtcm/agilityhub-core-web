import { http, HttpResponse } from "msw";

import type { components } from "../generated/schema";

import { type ListSpec, listValues, refuse, selectItems } from "./backoffice-handlers";
import {
  countsByCategory,
  findTemplate,
  messagingLocale,
  messagingState,
  missingVariables,
  nextMessagingId,
  notificationDetail,
  notificationListItem,
  notificationLog,
  resetMessagingState,
  type StoredNotification,
  type StoredTemplate,
  syntaxError,
  templateDetail,
  templateListItem,
  templatePreview,
  unknownVariables,
} from "./fixtures/messaging";
import { fieldsProjection } from "./list-fields";
import { apiError, validationError } from "./planning-handlers";
import { currentMockScenario } from "./scenarios";

type ChannelCaps = components["schemas"]["ChannelCaps"];
type ChannelMatrix = components["schemas"]["ChannelMatrix"];
type Filter = components["schemas"]["Filter"];
type NotificationListItem = components["schemas"]["NotificationListItem"];
type MessageTemplateCreateRequest = components["schemas"]["MessageTemplateCreateRequest"];
type MessageTemplateUpdateRequest = components["schemas"]["MessageTemplateUpdateRequest"];
type NotificationCategory = components["schemas"]["NotificationCategory"];
type TemplatePreviewRequest = components["schemas"]["TemplatePreviewRequest"];

/** Resets the S11 world (tests call it between cases, like the other mock states). */
export function resetMessagingMockState(): void {
  resetMessagingState();
}

/** Every S11 back-office route (S11 §6): ADMIN; an impersonation token → 403. */
function adminOnly() {
  return refuse(currentMockScenario(), ["ADMIN"]);
}

function failure(status: number, code: string, details: Record<string, unknown> = {}) {
  return HttpResponse.json({ code, details, message: code, traceId: "mock-trace-id" }, { status });
}

const CUSTOM_CATEGORIES: readonly NotificationCategory[] = [
  "PERSONAL",
  "CLUB_NEWS",
  "CLUB_CHANGES",
];
const AUDIENCES = ["MEMBER", "INSTRUCTORS", "ADMINS"] as const;
const CHANNELS = ["APP", "EMAIL", "SMS"] as const;

/** A CUSTOM template's caps (R-11-12): its category's member cells, no staff rows. */
function customCaps(category: NotificationCategory): ChannelCaps {
  return {
    ADMINS: [],
    INSTRUCTORS: [],
    MEMBER: category === "CLUB_CHANGES" ? ["APP", "EMAIL", "SMS"] : ["APP", "EMAIL"],
  };
}

/** A cell outside the template's `caps` (R-11-12): CHANNEL_NOT_ALLOWED (422, rule 0). */
function channelOutsideCaps(template: Pick<StoredTemplate, "caps">, matrix: ChannelMatrix) {
  for (const audience of AUDIENCES) {
    for (const channel of CHANNELS) {
      if (matrix[audience][channel] && !template.caps[audience].includes(channel)) {
        return { audience, channel };
      }
    }
  }
  return undefined;
}

function smsActive(matrix: ChannelMatrix): boolean {
  return AUDIENCES.some((audience) => matrix[audience].SMS);
}

/**
 * The text checks of POST and PUT (R-11-05, R-11-06, R-11-12), in the api's order: the syntax, an
 * unknown variable, a missing required one (VALIDATION_ERROR `details.missingVariables` until the
 * catalog has TEMPLATE_MISSING_VARIABLE), the SMS text of an active SMS cell and its length.
 */
function textRefusal(
  template: Pick<StoredTemplate, "requiredVariables" | "variables">,
  texts: {
    body: Readonly<Record<string, string>>;
    smsBody: Readonly<Record<string, string>> | null | undefined;
    title: Readonly<Record<string, string>>;
  },
  matrix: ChannelMatrix,
) {
  const all = [
    ...Object.entries(texts.title).map(([locale, text]) => ({ field: `title.${locale}`, text })),
    ...Object.entries(texts.body).map(([locale, text]) => ({ field: `body.${locale}`, text })),
    ...Object.entries(texts.smsBody ?? {}).map(([locale, text]) => ({
      field: `smsBody.${locale}`,
      text,
    })),
  ];
  const broken = all.find((item) => syntaxError(item.text));
  if (broken !== undefined) {
    return failure(400, "TEMPLATE_SYNTAX_ERROR", { field: broken.field });
  }
  for (const item of all) {
    const [unknown] = unknownVariables(item.text, template.variables);
    if (unknown !== undefined) {
      return failure(400, "TEMPLATE_UNKNOWN_VARIABLE", { field: item.field, variable: unknown });
    }
  }
  const missing = missingVariables(texts.body, template.requiredVariables);
  if (missing.length > 0) {
    return failure(400, "VALIDATION_ERROR", { missingVariables: missing });
  }
  if (smsActive(matrix)) {
    const sms = Object.entries(texts.smsBody ?? {}).filter(([, text]) => text.trim() !== "");
    if (sms.length === 0) return failure(400, "SMS_BODY_REQUIRED", { field: "smsBody" });
    const long = sms.find(([, text]) => text.length > 160);
    if (long !== undefined) {
      return failure(400, "SMS_BODY_TOO_LONG", { field: `smsBody.${long[0]}`, max: 160 });
    }
  }
  return undefined;
}

function nonEmpty(texts: unknown): texts is Record<string, string> {
  return (
    typeof texts === "object" &&
    texts !== null &&
    Object.values(texts).some((value) => typeof value === "string" && value.trim() !== "")
  );
}

/** «Avisos enviats» (R-11-10): `x-fields`, `x-filterable` and `x-sortable` of `GET /notifications`. */
const NOTIFICATION_SPEC: ListSpec<StoredNotification> = {
  fields: ["id", "createdAt", "code", "category", "audience", "recipient", "channels", "readAt"],
  filterable: ["code", "category", "channel", "status", "memberId", "createdAt"],
  search: (item) => `${item.code} ${item.recipient.displayName} ${item.title}`,
  sortable: ["createdAt"],
  values: (item, field) => {
    switch (field) {
      case "channel":
        return item.channels.map((state) => state.channel);
      case "status":
        return item.channels.map((state) => state.status);
      case "memberId":
        return item.memberId === null ? [] : [item.memberId];
      default:
        return listValues((item as unknown as Record<string, unknown>)[field]);
    }
  },
};

/**
 * The export's own columns (`x-columns` of `GET /notifications/export` in the snapshot), not the
 * list's fields: the category and the audience are not exported (E7-W01 round 2 #1).
 */
export const NOTIFICATION_EXPORT_COLUMNS = [
  "createdAt",
  "code",
  "recipient",
  "channels",
  "readAt",
] as const;

/** Rows of `GET /notifications/export` (ADMIN), or the api's error (the handler is in `handlers.ts`). */
export function notificationExportRows(request: Request): number | Response {
  const refused = adminOnly();
  if (refused !== undefined) return refused;
  const url = new URL(request.url);
  const columns = (url.searchParams.get("columns") ?? "").split(",").filter((key) => key !== "");
  const exportable: readonly string[] = NOTIFICATION_EXPORT_COLUMNS;
  if (!columns.every((key) => exportable.includes(key))) {
    return apiError("INVALID_FILTER", "Invalid columns", 400);
  }
  const selected = selectItems(url, notificationLog, NOTIFICATION_SPEC);
  return selected.error ?? selected.items.length;
}

/** A filter value's label as the api sends it: codes and enums raw, members by name. */
function valueLabel(field: string, value: string): string {
  if (field !== "memberId") return value;
  return notificationLog.find((item) => item.memberId === value)?.recipient.displayName ?? value;
}

/**
 * S11 (E7-W01): D9's templates, their preview, reset and deletion, and the notification log,
 * mocks-first on the published contract. Stateful: a write shows on the next read.
 * `POST /message-templates/{id}/send` is in `handlers.ts`, next to the members it counts.
 */
export const messagingHandlers = [
  http.get("*/api/v1/message-templates", ({ request }) => {
    const refused = adminOnly();
    if (refused !== undefined) return refused;
    const url = new URL(request.url);
    const locale = messagingLocale(request.headers.get("Accept-Language"));
    const category = url.searchParams.get("category");
    const kind = url.searchParams.get("kind");
    const includeArchived = url.searchParams.get("includeArchived") === "true";
    if (
      (category !== null &&
        !["OPERATIONAL", "PERSONAL", "CLUB_CHANGES", "CLUB_NEWS", "SYSTEM"].includes(category)) ||
      (kind !== null && !["CATALOG", "CUSTOM"].includes(kind))
    ) {
      return validationError(category === null ? "kind" : "category");
    }
    const items = messagingState.templates
      .filter((template) => includeArchived || template.status !== "ARCHIVED")
      .filter((template) => category === null || template.category === category)
      .filter((template) => kind === null || template.kind === kind)
      .map((template) => templateListItem(template, locale));
    return HttpResponse.json({ countsByCategory: countsByCategory(), items });
  }),
  http.post("*/api/v1/message-templates", async ({ request }) => {
    const refused = adminOnly();
    if (refused !== undefined) return refused;
    const body = (await request.json().catch(() => null)) as MessageTemplateCreateRequest | null;
    if (body === null || !CUSTOM_CATEGORIES.includes(body.category)) {
      return failure(400, "VALIDATION_ERROR", {
        fieldErrors: [{ code: "INVALID", field: "category" }],
      });
    }
    if (!nonEmpty(body.title) || !nonEmpty(body.body)) {
      return failure(400, "VALIDATION_ERROR", {
        fieldErrors: [{ code: "REQUIRED", field: nonEmpty(body.title) ? "body" : "title" }],
      });
    }
    const draft: StoredTemplate = {
      body: body.body,
      caps: customCaps(body.category),
      category: body.category,
      code: null,
      color: body.color,
      customized: false,
      enabled: true,
      icon: body.icon,
      id: nextMessagingId("tpl-custom"),
      kind: "CUSTOM",
      lastChange: null,
      mandatory: false,
      matrix: body.matrix,
      push: [],
      requiredVariables: [],
      seed: null,
      sms: body.smsBody ?? null,
      status: "ACTIVE",
      title: body.title,
      variables: [
        "member_first_name",
        "member_last_names",
        "dog_name",
        "level_name",
        "class_date",
        "club_name",
      ],
      version: 1,
    };
    const outside = channelOutsideCaps(draft, body.matrix);
    if (outside !== undefined) return failure(422, "CHANNEL_NOT_ALLOWED", outside);
    const text = textRefusal(
      draft,
      { body: body.body, smsBody: body.smsBody, title: body.title },
      body.matrix,
    );
    if (text !== undefined) return text;
    messagingState.templates.push(draft);
    return HttpResponse.json(
      templateDetail(draft, messagingLocale(request.headers.get("Accept-Language"))),
      { status: 201 },
    );
  }),
  http.get("*/api/v1/message-templates/:id", ({ params, request }) => {
    const refused = adminOnly();
    if (refused !== undefined) return refused;
    const template = findTemplate(String(params.id));
    return template === undefined
      ? apiError("NOT_FOUND", "Template not found", 404)
      : HttpResponse.json(
          templateDetail(template, messagingLocale(request.headers.get("Accept-Language"))),
        );
  }),
  http.put("*/api/v1/message-templates/:id", async ({ params, request }) => {
    const refused = adminOnly();
    if (refused !== undefined) return refused;
    const template = findTemplate(String(params.id));
    if (template === undefined) return apiError("NOT_FOUND", "Template not found", 404);
    const body = (await request.json().catch(() => null)) as MessageTemplateUpdateRequest | null;
    if (body === null || typeof body.version !== "number") return validationError("version");
    if (!nonEmpty(body.title) || !nonEmpty(body.body)) {
      return failure(400, "VALIDATION_ERROR", {
        fieldErrors: [{ code: "REQUIRED", field: nonEmpty(body.title) ? "body" : "title" }],
      });
    }
    if (body.version !== template.version) {
      return apiError("STALE_VERSION", "Stale template version", 409);
    }
    const category =
      template.kind === "CUSTOM" ? (body.category ?? template.category) : template.category;
    if (template.kind === "CUSTOM" && !CUSTOM_CATEGORIES.includes(category)) {
      return failure(400, "VALIDATION_ERROR", {
        fieldErrors: [{ code: "INVALID", field: "category" }],
      });
    }
    const caps =
      template.kind === "CUSTOM" && category !== template.category
        ? customCaps(category)
        : template.caps;
    const outside = channelOutsideCaps({ caps }, body.matrix);
    if (outside !== undefined) return failure(422, "CHANNEL_NOT_ALLOWED", outside);
    if (template.mandatory && !body.enabled) {
      return failure(422, "TEMPLATE_MANDATORY");
    }
    const text = textRefusal(
      template,
      { body: body.body, smsBody: body.smsBody, title: body.title },
      body.matrix,
    );
    if (text !== undefined) return text;
    template.body = body.body;
    template.caps = caps;
    template.category = category;
    template.color = body.color;
    template.enabled = body.enabled;
    template.icon = body.icon;
    template.matrix = body.matrix;
    template.sms = body.smsBody ?? null;
    template.status = body.enabled ? "ACTIVE" : "DISABLED";
    template.title = body.title;
    template.version += 1;
    template.customized =
      template.seed !== null &&
      (JSON.stringify(template.seed.body) !== JSON.stringify(body.body) ||
        JSON.stringify(template.seed.title) !== JSON.stringify(body.title) ||
        JSON.stringify(template.seed.sms) !== JSON.stringify(body.smsBody ?? null));
    template.lastChange = {
      action: "CATALOG_CHANGED",
      actorName: currentMockScenario().me.account.name,
      at: new Date().toISOString().replace(/\.\d{3}Z$/u, "Z"),
    };
    return HttpResponse.json(
      templateDetail(template, messagingLocale(request.headers.get("Accept-Language"))),
    );
  }),
  http.post("*/api/v1/message-templates/:id/preview", async ({ params, request }) => {
    const refused = adminOnly();
    if (refused !== undefined) return refused;
    const template = findTemplate(String(params.id));
    if (template === undefined) return apiError("NOT_FOUND", "Template not found", 404);
    const body = (await request.json().catch(() => null)) as TemplatePreviewRequest | null;
    const scenario = currentMockScenario();
    if (body === null || !scenario.branding.locales.includes(body.locale)) {
      return validationError("locale");
    }
    const draft = body.draft ?? null;
    if (
      draft !== null &&
      [draft.title, draft.body, draft.smsBody ?? ""].some((text) => syntaxError(text))
    ) {
      return failure(400, "TEMPLATE_SYNTAX_ERROR", { field: "draft" });
    }
    if (body.sendTest === true) {
      messagingState.testSends.push({ locale: body.locale, templateId: template.id });
    }
    return HttpResponse.json(
      templatePreview(template, messagingLocale(body.locale), draft, scenario.branding.club.name),
    );
  }),
  http.post("*/api/v1/message-templates/:id/reset", ({ params, request }) => {
    const refused = adminOnly();
    if (refused !== undefined) return refused;
    const template = findTemplate(String(params.id));
    if (template === undefined) return apiError("NOT_FOUND", "Template not found", 404);
    if (template.seed === null) return failure(422, "TEMPLATE_NOT_CATALOG");
    template.body = template.seed.body;
    template.sms = template.seed.sms;
    template.title = template.seed.title;
    template.customized = false;
    template.version += 1;
    template.lastChange = {
      action: "CATALOG_CHANGED",
      actorName: currentMockScenario().me.account.name,
      at: new Date().toISOString().replace(/\.\d{3}Z$/u, "Z"),
    };
    return HttpResponse.json(
      templateDetail(template, messagingLocale(request.headers.get("Accept-Language"))),
    );
  }),
  http.delete("*/api/v1/message-templates/:id", ({ params }) => {
    const refused = adminOnly();
    if (refused !== undefined) return refused;
    const template = findTemplate(String(params.id));
    if (template === undefined) return apiError("NOT_FOUND", "Template not found", 404);
    if (template.kind !== "CUSTOM") return failure(422, "TEMPLATE_NOT_CUSTOM");
    template.status = "ARCHIVED";
    template.version += 1;
    return new HttpResponse(null, { status: 204 });
  }),
  // ── The log (R-11-10) ──
  http.get("*/api/v1/notifications", ({ request }) => {
    const refused = adminOnly();
    if (refused !== undefined) return refused;
    const url = new URL(request.url);
    // The contract's default order: createdAt desc.
    if (url.searchParams.getAll("sort").length === 0) {
      url.searchParams.append("sort", "createdAt,desc");
    }
    const page = Number(url.searchParams.get("page") ?? "0");
    const size = Number(url.searchParams.get("size") ?? "50");
    if (!Number.isInteger(page) || page < 0 || ![20, 50, 200, 1000].includes(size)) {
      return apiError("INVALID_FILTER", "Invalid page", 400);
    }
    const projection = fieldsProjection<NotificationListItem>(url, NOTIFICATION_SPEC.fields, [
      "id",
    ]);
    if (projection === undefined) return apiError("INVALID_FILTER", "Invalid fields", 400);
    const selected = selectItems(url, notificationLog, NOTIFICATION_SPEC);
    if (selected.error !== undefined) return selected.error;
    const items = selected.items.slice(page * size, (page + 1) * size).map(notificationListItem);
    return HttpResponse.json({
      // The api echoes a list (`in`, `nin`) and a range (`between`) as JSON arrays (CONVENCIONS_API
      // §4: «JSON scalar or array»), the rest as the scalar it received.
      appliedFilters: selected.filters.map((filter): Filter => ({
        field: filter.field,
        op: filter.op as Filter["op"],
        value: ["between", "in", "nin"].includes(filter.op)
          ? filter.value.split(",")
          : filter.value,
      })),
      items: projection === null ? items : items.map(projection),
      page,
      size,
      totalItems: selected.items.length,
      totalPages: Math.ceil(selected.items.length / size),
    });
  }),
  http.get("*/api/v1/notifications/filter-values", ({ request }) => {
    const refused = adminOnly();
    if (refused !== undefined) return refused;
    const url = new URL(request.url);
    const field = url.searchParams.get("field") ?? "";
    if (!NOTIFICATION_SPEC.filterable.includes(field)) {
      return apiError("INVALID_FILTER", "Invalid notification filter", 400);
    }
    // The other filters narrow the values, as the universal list's own ones do.
    const others = new URL(url);
    others.searchParams.delete("filter");
    for (const filter of url.searchParams.getAll("filter")) {
      if (!filter.startsWith(`${field}:`)) others.searchParams.append("filter", filter);
    }
    const selected = selectItems(others, notificationLog, NOTIFICATION_SPEC);
    if (selected.error !== undefined) return selected.error;
    const counts = new Map<string, number>();
    for (const item of selected.items) {
      for (const value of new Set(NOTIFICATION_SPEC.values(item, field))) {
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
    }
    return HttpResponse.json({
      field,
      values: [...counts.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([value, count]) => ({ count, label: valueLabel(field, value), value })),
    });
  }),
  http.get("*/api/v1/notifications/:id", ({ params }) => {
    const refused = adminOnly();
    if (refused !== undefined) return refused;
    const item = notificationLog.find((entry) => entry.id === String(params.id));
    return item === undefined
      ? apiError("NOT_FOUND", "Notification not found", 404)
      : HttpResponse.json(notificationDetail(item));
  }),
];
