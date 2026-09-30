import { http, HttpResponse } from "msw";

import type { components } from "../generated/schema";

import { feedWaitlistEntry, notifyFeedWaitlistEntry } from "./booking-handlers";
import { findDog } from "./fixtures/bookings";
import {
  FEED_IDS,
  feedUnreadCount,
  forgetNotificationWorld,
  meNotification,
  notificationWorld,
  persistNotificationWorld,
  type StoredFeedItem,
  UNSUBSCRIBE_TOKENS,
} from "./fixtures/notifications";
import { findParameter } from "./fixtures/settings";
import { apiError } from "./planning-handlers";
import { currentMockScenario, currentMockScenarioName } from "./scenarios";

type NotificationPreferences = components["schemas"]["NotificationPreferences"];
type NotificationPreferencesRequest = components["schemas"]["NotificationPreferencesRequest"];
type PushSubscriptionRequest = components["schemas"]["PushSubscriptionRequest"];

/** Resets the S11 member world (tests call it between cases, like the other mock states). */
export function resetNotificationMockState(): void {
  forgetNotificationWorld();
}

const CATEGORIES = ["OPERATIONAL", "PERSONAL", "CLUB_CHANGES", "CLUB_NEWS"] as const;
const DEFAULT_REMINDER_OPTIONS = [60, 120, 240, 360, 720, 1440];

function world() {
  return notificationWorld(
    currentMockScenarioName(),
    currentMockScenario().notifications ?? "default",
  );
}

function nowIso(): string {
  return new Date(Date.now()).toISOString();
}

function isImpersonation(): boolean {
  return currentMockScenario().me.impersonation !== undefined;
}

function hasMemberRole(): boolean {
  return currentMockScenario().me.membership?.roles.includes("MEMBER") ?? false;
}

function moduleOn(module: string): boolean {
  return currentMockScenario().branding.modules.includes(module);
}

/** `messaging.reminderOptionsMinutes` of the club (R-11-04). */
function reminderOptions(): number[] {
  const value = findParameter("messaging.reminderOptionsMinutes")?.value;
  return Array.isArray(value) && value.every((item) => typeof item === "number")
    ? [...value]
    : [...DEFAULT_REMINDER_OPTIONS];
}

function preferencesView(): NotificationPreferences {
  const scenario = currentMockScenario();
  const stored = world().preferences;
  return {
    availableLocales: [...scenario.branding.locales],
    emailByCategory: { ...stored.emailByCategory },
    locale: scenario.me.account.locale,
    modules: { push: moduleOn("PUSH"), sms: moduleOn("SMS") },
    pushClubNews: stored.pushClubNews,
    reminderMinutesBefore: stored.reminderMinutesBefore,
    reminderOptionsMinutes: reminderOptions(),
    smsFixed: true,
  };
}

/** R-11-11: `enabled` is computed on reading, from the S08 world the action points to. */
function actionEnabled(item: StoredFeedItem, request: Request): boolean {
  const action = item.action;
  if (action === null) return false;
  if (action.type === "CLAIM_SEAT") {
    const entry = feedWaitlistEntry(request, action.params.waitlistEntryId ?? "");
    if (entry?.state !== "NOTIFIED") return false;
    const confirmBy = entry.confirmBy;
    return confirmBy === null || confirmBy === undefined || Date.parse(confirmBy) > Date.now();
  }
  if (action.type === "CHANGE_CLASS") {
    return findDog(action.params.dogId ?? "") !== undefined;
  }
  return true;
}

/**
 * The channels the api lists (R-11-10, R-11-17): SMS and PUSH only when their module was on, so a
 * club without SMS never shows «i per SMS»; without WAITLIST no N-15 exists.
 */
function visible(item: StoredFeedItem): StoredFeedItem | undefined {
  if (item.action?.type === "CLAIM_SEAT" && !moduleOn("WAITLIST")) return undefined;
  return {
    ...item,
    channels: item.channels.filter(
      (channel) =>
        (channel !== "SMS" || moduleOn("SMS")) && (channel !== "PUSH" || moduleOn("PUSH")),
    ),
  };
}

function integerParam(url: URL, name: string, fallback: number): number | undefined {
  const raw = url.searchParams.get(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) ? value : undefined;
}

const BASE64URL = /^[A-Za-z0-9_-]+$/u;

/** PUSH_SUBSCRIPTION_INVALID (422): an https endpoint and base64url keys of the right sizes. */
function invalidSubscription(body: PushSubscriptionRequest): boolean {
  let endpoint: URL;
  try {
    endpoint = new URL(body.endpoint);
  } catch {
    return true;
  }
  const { auth, p256dh } = body.keys;
  return (
    endpoint.protocol !== "https:" ||
    !BASE64URL.test(p256dh) ||
    !BASE64URL.test(auth) ||
    p256dh.length !== 87 ||
    auth.length !== 22
  );
}

/**
 * S11 (E7-W02): screen 11's feed, its reads, screen 12's preferences, the push subscriptions and
 * the e-mail unsubscribe page, mocks-first on the published contract. Stateful: a write shows on
 * the next read, and the bell of 03 (`GET /me/home`) counts the same unread notifications.
 */
export const notificationHandlers = [
  http.get("*/api/v1/me/notifications", ({ request }) => {
    const url = new URL(request.url);
    const page = integerParam(url, "page", 0);
    const size = integerParam(url, "size", 20);
    if (page === undefined || page < 0) {
      return apiError("VALIDATION_ERROR", "Invalid page", 400, { field: "page" });
    }
    if (size === undefined || size < 1 || size > 100) {
      return apiError("VALIDATION_ERROR", "Invalid size", 400, { field: "size" });
    }
    const current = world();
    if (!current.entryNotified) {
      // N-15 was sent because Duna's entry was notified (`seatTaken`: someone claimed it since).
      current.entryNotified = true;
      if (current.variant !== "seatTaken") {
        notifyFeedWaitlistEntry(request, FEED_IDS.thu6Entry, "2026-08-02T15:56:00Z");
      }
      persistNotificationWorld();
    }
    const audience = url.searchParams.get("audience");
    const all = [...current.items]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .flatMap((item) => visible(item) ?? [])
      // Every notification of this world is addressed to the member (audience MEMBER).
      .filter(() => audience === null || audience === "MEMBER");
    const items = all
      .slice(page * size, page * size + size)
      .map((item) => meNotification(item, actionEnabled(item, request)));
    return HttpResponse.json({
      items,
      page,
      size,
      totalItems: all.length,
      unreadCount: feedUnreadCount(current),
    });
  }),
  http.post("*/api/v1/me/notifications/read-all", () => {
    const current = world();
    const now = Date.now();
    for (const item of current.items) {
      if (item.readAt === null && Date.parse(item.createdAt) <= now) item.readAt = nowIso();
    }
    persistNotificationWorld();
    return HttpResponse.json({ unreadCount: feedUnreadCount(current) });
  }),
  http.post("*/api/v1/me/notifications/:id/read", ({ params }) => {
    const current = world();
    const item = current.items.find((candidate) => candidate.id === String(params.id));
    if (item === undefined) return apiError("NOT_FOUND", "Notification not found", 404);
    item.readAt ??= nowIso();
    persistNotificationWorld();
    return HttpResponse.json({ unreadCount: feedUnreadCount(current) });
  }),
  http.get("*/api/v1/me/notification-preferences", () => {
    if (!hasMemberRole() && !isImpersonation()) return apiError("FORBIDDEN", "Forbidden", 403);
    return HttpResponse.json(preferencesView());
  }),
  http.put("*/api/v1/me/notification-preferences", async ({ request }) => {
    if (!hasMemberRole() && !isImpersonation()) return apiError("FORBIDDEN", "Forbidden", 403);
    const body = (await request.json()) as NotificationPreferencesRequest;
    const reminder = body.reminderMinutesBefore;
    // A partial save (T-11-20): an absent or null key keeps its value; `reminderMinutesBefore: null`
    // is «Mai»; any other value must be one of the options (422 INVALID_REMINDER_OPTION, rule 0).
    if (reminder !== undefined && reminder !== null && !reminderOptions().includes(reminder)) {
      return apiError("INVALID_REMINDER_OPTION", "Invalid reminder option", 422);
    }
    const stored = world().preferences;
    for (const category of CATEGORIES) {
      const value = body.emailByCategory?.[category];
      if (value !== undefined && value !== null) stored.emailByCategory[category] = value;
    }
    if (body.pushClubNews !== undefined && body.pushClubNews !== null) {
      stored.pushClubNews = body.pushClubNews;
    }
    if (reminder !== undefined) stored.reminderMinutesBefore = reminder;
    persistNotificationWorld();
    return HttpResponse.json(preferencesView());
  }),
  http.post("*/api/v1/push-subscriptions", async ({ request }) => {
    if (isImpersonation()) {
      return apiError("IMPERSONATION_DENIED", "Impersonation tokens cannot subscribe", 403);
    }
    if (!moduleOn("PUSH")) return apiError("MODULE_DISABLED", "Module disabled", 404);
    const body = (await request.json()) as PushSubscriptionRequest;
    if (invalidSubscription(body)) {
      return apiError("PUSH_SUBSCRIPTION_INVALID", "Invalid push subscription", 422);
    }
    const current = world();
    // An upsert by endpoint: the same browser gets the same subscription, ACTIVE again.
    let stored = current.subscriptions.find((item) => item.endpoint === body.endpoint);
    if (stored === undefined) {
      current.sequence += 1;
      stored = {
        endpoint: body.endpoint,
        id: `push-${String(current.sequence)}`,
        status: "ACTIVE",
      };
      current.subscriptions.push(stored);
    }
    stored.status = "ACTIVE";
    persistNotificationWorld();
    return HttpResponse.json({ id: stored.id }, { status: 201 });
  }),
  http.delete("*/api/v1/push-subscriptions/:id", ({ params }) => {
    if (isImpersonation()) {
      return apiError("IMPERSONATION_DENIED", "Impersonation tokens cannot unsubscribe", 403);
    }
    if (!moduleOn("PUSH")) return apiError("MODULE_DISABLED", "Module disabled", 404);
    const stored = world().subscriptions.find((item) => item.id === String(params.id));
    if (stored === undefined) return apiError("NOT_FOUND", "Push subscription not found", 404);
    stored.status = "EXPIRED";
    persistNotificationWorld();
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("*/api/v1/email-unsubscribes", async ({ request }) => {
    const body = (await request.json()) as { token?: unknown };
    if (body.token !== UNSUBSCRIBE_TOKENS.valid) {
      return apiError("UNSUBSCRIBE_TOKEN_INVALID", "Unsubscribe token invalid", 422);
    }
    // Using the token again changes nothing (api E7-T02).
    world().preferences.emailByCategory.CLUB_NEWS = false;
    persistNotificationWorld();
    return HttpResponse.json({ category: "CLUB_NEWS" });
  }),
];
