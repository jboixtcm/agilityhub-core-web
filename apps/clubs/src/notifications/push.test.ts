import { createApiClient } from "@agilityhub/api-client";
import { mockScenario, resetNotificationMockState } from "@agilityhub/api-client/mocks";
import brandingCanic from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { delay, http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applicationServerKey,
  deviceLabel,
  logoutWithPush,
  PUSH_SUBSCRIPTION_STORAGE_KEY,
  pushSupport,
  setPushRegistration,
  subscribeToPush,
  unsubscribeFromPush,
} from "./push";

// Created after `server.listen()`: a client keeps the `fetch` it was created with.
let client = createApiClient();
const publicKey = brandingCanic.pushPublicKey;

function browserWithPush(permission: NotificationPermission) {
  const requestPermission = vi.fn(() => Promise.resolve(permission));
  vi.stubGlobal("PushManager", {});
  vi.stubGlobal("Notification", { permission: "default", requestPermission });
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: {} });
  const subscribe = vi.fn(() =>
    Promise.resolve({
      toJSON: () => ({
        endpoint: "https://push.example.test/send/device",
        keys: { auth: "A".repeat(22), p256dh: "B".repeat(87) },
      }),
    }),
  );
  setPushRegistration({ pushManager: { subscribe } } as unknown as ServiceWorkerRegistration);
  return { requestPermission, subscribe };
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  client = createApiClient({ baseUrl: `${window.location.origin}/api/v1`, getLocale: () => "ca" });
  resetNotificationMockState();
  mockScenario("member");
  localStorage.removeItem(PUSH_SUBSCRIPTION_STORAGE_KEY);
});
afterEach(() => {
  server.resetHandlers();
  server.events.removeAllListeners();
  setPushRegistration(undefined);
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "serviceWorker");
  Reflect.deleteProperty(navigator, "standalone");
  Reflect.deleteProperty(navigator, "userAgent");
  localStorage.removeItem(PUSH_SUBSCRIPTION_STORAGE_KEY);
  resetNotificationMockState();
});
afterAll(() => {
  server.close();
});

describe("E7-W02 step 5 · web push in context (S11 R-11-07)", () => {
  it.each([
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      "iPhone · Safari",
    ],
    [
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36",
      "Android · Chrome",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0",
      "Windows · Edge",
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:130.0) Gecko/20100101 Firefox/130.0",
      "Mac · Firefox",
    ],
  ])("the device label of %s is «%s»", (userAgent, label) => {
    expect(deviceLabel(userAgent)).toBe(label);
  });

  it("turns the club's base64url VAPID key into the 65 bytes PushManager takes", () => {
    const key = applicationServerKey(publicKey);
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key).toHaveLength(65);
    expect(key[0]).toBe(4);
  });

  it("tells an iPhone outside the installed app from a browser without push", () => {
    expect(pushSupport()).toBe("unsupported");
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1",
    });
    expect(pushSupport()).toBe("ios-install");
    Object.defineProperty(navigator, "standalone", { configurable: true, value: true });
    browserWithPush("granted");
    expect(pushSupport()).toBe("supported");
  });

  it("never asks without the app's worker registration (mock mode: only MSW's worker exists)", async () => {
    const { requestPermission } = browserWithPush("granted");
    setPushRegistration(undefined);
    expect(await subscribeToPush(client, publicKey)).toBe("unavailable");
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("subscribes with the key, upserts POST /push-subscriptions and keeps only the id", async () => {
    const { subscribe } = browserWithPush("granted");
    expect(await subscribeToPush(client, publicKey)).toBe("subscribed");
    expect(subscribe).toHaveBeenCalledWith({
      applicationServerKey: applicationServerKey(publicKey),
      userVisibleOnly: true,
    });
    expect(localStorage.getItem(PUSH_SUBSCRIPTION_STORAGE_KEY)).toBe('{"id":"push-1"}');
  });

  it("a denied permission is an outcome, and a 404 MODULE_DISABLED from a stale client is swallowed", async () => {
    browserWithPush("denied");
    expect(await subscribeToPush(client, publicKey)).toBe("denied");
    browserWithPush("granted");
    mockScenario("memberNoPush");
    expect(await subscribeToPush(client, publicKey)).toBe("failed");
    expect(localStorage.getItem(PUSH_SUBSCRIPTION_STORAGE_KEY)).toBeNull();
  });

  it("logout sends the DELETE of this device's subscription, then logs out", async () => {
    browserWithPush("granted");
    await subscribeToPush(client, publicKey);
    const deletes: string[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.method === "DELETE") deletes.push(new URL(request.url).pathname);
    });
    const logout = vi.fn(() => Promise.resolve());
    await logoutWithPush(client, logout);
    expect(deletes).toEqual(["/api/v1/push-subscriptions/push-1"]);
    expect(logout).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(PUSH_SUBSCRIPTION_STORAGE_KEY)).toBeNull();
    // Nothing stored: nothing to delete.
    await unsubscribeFromPush(client);
    expect(deletes).toHaveLength(1);
  });

  it("a DELETE that never answers never blocks the logout", async () => {
    localStorage.setItem(PUSH_SUBSCRIPTION_STORAGE_KEY, JSON.stringify({ id: "push-9" }));
    server.use(
      http.delete("*/api/v1/push-subscriptions/:id", async () => {
        await delay("infinite");
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const logout = vi.fn(() => Promise.resolve());
    await logoutWithPush(client, logout, 30);
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
