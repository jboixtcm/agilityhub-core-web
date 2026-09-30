import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import openapiDocument from "../../openapi/openapi.json";
import { isApiError } from "../api-error";
import { createApiClient } from "../client";

import { NOTIFICATIONS_MOCK_NOW, UNSUBSCRIBE_TOKENS } from "./fixtures/notifications";
import {
  bookingState,
  mockScenario,
  resetBookingMockState,
  resetNotificationMockState,
  type MockScenario,
} from "./handlers";
import { server } from "./server";

const openapiSchemaId = "https://agilityhub.local/notifications-openapi.json";
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(openapiDocument, openapiSchemaId);

function expectValid(name: string, value: unknown) {
  const validate = ajv.compile({ $ref: `${openapiSchemaId}#/components/schemas/${name}` });
  expect(validate(value), JSON.stringify(validate.errors, null, 2)).toBe(true);
}

const base = "https://core.example.test/api/v1";
let client = createApiClient({ baseUrl: base, getLocale: () => "ca" });

function use(scenario: MockScenario) {
  mockScenario(scenario);
  client = createApiClient({ baseUrl: base, getLocale: () => "ca" });
}

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (isApiError(error)) {
      return { code: error.code, details: error.details, status: error.status };
    }
    throw error;
  }
  throw new Error("Expected an ApiError");
}

const feed = (page = 0, size = 20) =>
  client.GET("/me/notifications", { params: { query: { page, size } } });

/** A subscription as a browser sends it: an https endpoint, a 65-byte key and a 16-byte secret. */
const subscription = {
  endpoint: "https://push.example.test/send/device-1",
  keys: { auth: "A".repeat(22), p256dh: "B".repeat(87) },
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  vi.useFakeTimers({ now: new Date(NOTIFICATIONS_MOCK_NOW), toFake: ["Date"] });
  resetNotificationMockState();
  resetBookingMockState();
  use("member");
});
afterEach(() => {
  server.resetHandlers();
  resetNotificationMockState();
  resetBookingMockState();
  mockScenario("admin");
  vi.useRealTimers();
});
afterAll(() => {
  server.close();
});

describe("E7-W02 step 8 · screen 11's feed follows the S11 contract (R-10, R-11)", () => {
  it("R-11-10 sends mockup 11's six cards newest first, 20 a page, with two unread and a second page", async () => {
    const { data } = await feed();
    expectValid("MeNotifications", data);
    expect(
      data?.items.slice(0, 6).map((item) => `${item.code} ${item.icon} ${item.color}`),
    ).toEqual([
      "N-08a x ERROR",
      "N-15 unlock ACCENT",
      "N-19 heart NEUTRAL",
      "N-16 warn WARNING",
      "N-09 up OK",
      "N-06 check OK",
    ]);
    expect(data).toMatchObject({ page: 0, size: 20, totalItems: 24, unreadCount: 2 });
    expect(data?.items).toHaveLength(20);
    const createdAt = data?.items.map((item) => item.createdAt) ?? [];
    expect([...createdAt].sort().reverse()).toEqual(createdAt);
    const second = (await feed(1)).data;
    expectValid("MeNotifications", second);
    expect(second?.items).toHaveLength(4);
    expect(
      new Set([...(data?.items ?? []), ...(second?.items ?? [])].map((item) => item.id)).size,
    ).toBe(24);
  });

  it("R-11-10 lists SMS only when it reached the member, never the e-mail, and none without the SMS module", async () => {
    const items = (await feed()).data?.items ?? [];
    expect(items.find((item) => item.code === "N-08a")?.channels).toEqual(["APP", "SMS"]);
    expect(items.every((item) => !item.channels.includes("EMAIL"))).toBe(true);
    expect(items.filter((item) => item.channels.includes("SMS"))).toHaveLength(1);
    resetNotificationMockState();
    use("memberNoSms");
    const noSms = (await feed()).data?.items ?? [];
    expect(noSms.some((item) => item.channels.includes("SMS"))).toBe(false);
  });

  it("R-11-11 computes CLAIM_SEAT's enabled on reading: the notified entry is claimable, a taken seat is not", async () => {
    const items = (await feed()).data?.items ?? [];
    const seat = items.find((item) => item.id === "notification-n15");
    expect(seat?.action).toEqual({
      enabled: true,
      params: {
        classSessionId: "class-2026-08-06-2000",
        dogId: "dog-duna",
        waitlistEntryId: "waitlist-duna-thu6",
      },
      type: "CLAIM_SEAT",
    });
    expect(bookingState.entries.find((entry) => entry.id === "waitlist-duna-thu6")?.state).toBe(
      "NOTIFIED",
    );
    // The older N-15 of an entry that is gone reads disabled.
    const older = [...items, ...((await feed(1)).data?.items ?? [])].filter(
      (item) => item.code === "N-15" && item.id !== "notification-n15",
    );
    expect(older.map((item) => item.action?.enabled)).toEqual([false, false, false]);
    expect(items.find((item) => item.code === "N-08a")?.action).toMatchObject({
      enabled: true,
      params: { dogId: "dog-duna" },
      type: "CHANGE_CLASS",
    });
    expect(items.find((item) => item.code === "N-19")?.action).toBeNull();

    resetNotificationMockState();
    resetBookingMockState();
    use("notificationsSeatTaken");
    const taken = (await feed()).data?.items.find((item) => item.id === "notification-n15");
    expect(taken?.action?.enabled).toBe(false);
  });

  it("R-11-10 read and read-all are idempotent and agree with GET /me/home's bell", async () => {
    const home = async () =>
      (await client.GET("/me/home", { params: { query: {} } })).data?.notifications.unreadCount;
    expect(await home()).toBe(2);
    const one = await client.POST("/me/notifications/{id}/read", {
      params: { path: { id: "notification-n15" } },
    });
    expectValid("ReadResult", one.data);
    expect(one.data).toEqual({ unreadCount: 1 });
    expect(
      (
        await client.POST("/me/notifications/{id}/read", {
          params: { path: { id: "notification-n15" } },
        })
      ).data,
    ).toEqual({ unreadCount: 1 });
    expect(await home()).toBe(1);
    const all = await client.POST("/me/notifications/read-all");
    expectValid("ReadResult", all.data);
    expect(all.data).toEqual({ unreadCount: 0 });
    expect((await client.POST("/me/notifications/read-all")).data).toEqual({ unreadCount: 0 });
    expect(await home()).toBe(0);
    expect((await feed()).data?.items.every((item) => item.readAt !== null)).toBe(true);
    expect(
      await failure(
        client.POST("/me/notifications/{id}/read", { params: { path: { id: "missing" } } }),
      ),
    ).toMatchObject({ code: "NOT_FOUND", status: 404 });
  });

  it("answers the empty feed and refuses an oversized page (400 VALIDATION_ERROR)", async () => {
    use("notificationsEmpty");
    const { data } = await feed();
    expectValid("MeNotifications", data);
    expect(data).toMatchObject({ items: [], totalItems: 0, unreadCount: 0 });
    expect(await failure(feed(0, 101))).toMatchObject({
      code: "VALIDATION_ERROR",
      details: { field: "size" },
      status: 400,
    });
  });
});

describe("E7-W02 step 8 · screen 12's preferences follow the S11 contract (R-11-04, T-11-20)", () => {
  it("sends the product defaults, the reminder options and the club's modules", async () => {
    const { data } = await client.GET("/me/notification-preferences");
    expectValid("NotificationPreferences", data);
    expect(data).toEqual({
      availableLocales: ["ca", "es"],
      emailByCategory: { CLUB_CHANGES: true, CLUB_NEWS: true, OPERATIONAL: false, PERSONAL: true },
      locale: "ca",
      modules: { push: true, sms: true },
      pushClubNews: true,
      reminderMinutesBefore: null,
      reminderOptionsMinutes: [60, 120, 240, 360, 720, 1440],
      smsFixed: true,
    });
    use("memberNoPush");
    expect((await client.GET("/me/notification-preferences")).data?.modules).toEqual({
      push: false,
      sms: true,
    });
  });

  it("saves partially (an absent key keeps its value) and refuses an off-list reminder (422)", async () => {
    await client.PUT("/me/notification-preferences", {
      body: { emailByCategory: { OPERATIONAL: true } },
    });
    const { data } = await client.PUT("/me/notification-preferences", {
      body: { reminderMinutesBefore: 120 },
    });
    expectValid("NotificationPreferences", data);
    expect(data).toMatchObject({
      emailByCategory: { CLUB_CHANGES: true, CLUB_NEWS: true, OPERATIONAL: true, PERSONAL: true },
      pushClubNews: true,
      reminderMinutesBefore: 120,
    });
    expect(
      (await client.PUT("/me/notification-preferences", { body: { reminderMinutesBefore: null } }))
        .data?.reminderMinutesBefore,
    ).toBeNull();
    expect(
      await failure(
        client.PUT("/me/notification-preferences", { body: { reminderMinutesBefore: 90 } }),
      ),
    ).toEqual({ code: "INVALID_REMINDER_OPTION", details: {}, status: 422 });
  });

  it("refuses staff without the MEMBER role (403) and lets the impersonation token read them", async () => {
    use("instructor");
    expect(await failure(client.GET("/me/notification-preferences"))).toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    use("impersonated");
    expectValid("NotificationPreferences", (await client.GET("/me/notification-preferences")).data);
  });
});

describe("E7-W02 step 8 · push subscriptions and the e-mail unsubscribe page (R-11-07, R-11-08)", () => {
  it("upserts by endpoint (201 with the same id) and expires it on DELETE (204)", async () => {
    const first = await client.POST("/push-subscriptions", { body: subscription });
    expectValid("PushSubscriptionCreated", first.data);
    const again = await client.POST("/push-subscriptions", {
      body: { ...subscription, deviceLabel: "iPhone · Safari" },
    });
    expect(again.data?.id).toBe(first.data?.id);
    const removed = await client.DELETE("/push-subscriptions/{id}", {
      params: { path: { id: first.data?.id ?? "" } },
    });
    expect(removed.response.status).toBe(204);
    expect(
      await failure(
        client.DELETE("/push-subscriptions/{id}", { params: { path: { id: "nope" } } }),
      ),
    ).toMatchObject({ code: "NOT_FOUND", status: 404 });
  });

  it("answers PUSH_SUBSCRIPTION_INVALID (422), MODULE_DISABLED without PUSH (404) and IMPERSONATION_DENIED (403)", async () => {
    expect(
      await failure(
        client.POST("/push-subscriptions", {
          body: { ...subscription, endpoint: "http://push.example.test/insecure" },
        }),
      ),
    ).toMatchObject({ code: "PUSH_SUBSCRIPTION_INVALID", status: 422 });
    use("memberNoPush");
    expect(await failure(client.POST("/push-subscriptions", { body: subscription }))).toMatchObject(
      { code: "MODULE_DISABLED", status: 404 },
    );
    use("impersonated");
    expect(await failure(client.POST("/push-subscriptions", { body: subscription }))).toMatchObject(
      { code: "IMPERSONATION_DENIED", status: 403 },
    );
  });

  it("turns CLUB_NEWS e-mail off with a valid token and refuses an expired one (422)", async () => {
    const done = await client.POST("/email-unsubscribes", {
      body: { token: UNSUBSCRIBE_TOKENS.valid },
    });
    expectValid("EmailUnsubscribeResult", done.data);
    expect(done.data).toEqual({ category: "CLUB_NEWS" });
    expect((await client.GET("/me/notification-preferences")).data?.emailByCategory.CLUB_NEWS).toBe(
      false,
    );
    expect(
      await failure(
        client.POST("/email-unsubscribes", { body: { token: UNSUBSCRIBE_TOKENS.expired } }),
      ),
    ).toEqual({ code: "UNSUBSCRIBE_TOKEN_INVALID", details: {}, status: 422 });
  });
});
