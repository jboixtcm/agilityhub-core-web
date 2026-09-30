import {
  mockScenario,
  NOTIFICATIONS_MOCK_NOW,
  resetActivityState,
  resetBookingMockState,
  resetNotificationMockState,
} from "@agilityhub/api-client/mocks";
import { server } from "@agilityhub/api-client/mocks/server";
import { LOCALE_STORAGE_KEY } from "@agilityhub/i18n";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { canic, renderApp, without } from "../booking/test-utils";
import { PUSH_SUBSCRIPTION_STORAGE_KEY, setPushRegistration } from "../notifications/push";

interface Seen {
  body: unknown;
  method: string;
  path: string;
}

let requests: Seen[] = [];

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  vi.useFakeTimers({
    now: new Date(NOTIFICATIONS_MOCK_NOW),
    shouldAdvanceTime: true,
    toFake: ["Date"],
  });
  resetBookingMockState();
  resetActivityState();
  resetNotificationMockState();
  mockScenario("member");
  window.history.replaceState(null, "", "/");
  localStorage.removeItem(PUSH_SUBSCRIPTION_STORAGE_KEY);
  requests = [];
  server.events.on("request:start", ({ request }) => {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/v1/")) return;
    const seen: Seen = { body: undefined, method: request.method, path: url.pathname };
    requests.push(seen);
    if (request.method === "PUT" || request.method === "POST" || request.method === "PATCH") {
      void request
        .clone()
        .text()
        .then((text) => {
          seen.body = text === "" ? undefined : (JSON.parse(text) as unknown);
        });
    }
  });
});
afterEach(async () => {
  cleanup();
  await new Promise((resolve) => {
    setTimeout(resolve, 20);
  });
  server.events.removeAllListeners();
  server.resetHandlers();
  setPushRegistration(undefined);
  vi.unstubAllGlobals();
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, "serviceWorker");
  Reflect.deleteProperty(navigator, "standalone");
  Reflect.deleteProperty(navigator, "userAgent");
  localStorage.removeItem(PUSH_SUBSCRIPTION_STORAGE_KEY);
  // The language test stores its choice, as the app does.
  localStorage.removeItem(LOCALE_STORAGE_KEY);
  resetBookingMockState();
  resetActivityState();
  resetNotificationMockState();
  mockScenario("member");
});
afterAll(() => {
  server.close();
});

const PREFERENCES = "/api/v1/me/notification-preferences";

const puts = () =>
  requests
    .filter((item) => item.method === "PUT" && item.path === PREFERENCES)
    .map((item) => item.body);

/** A browser with web push: `PushManager`, `Notification` and the app's worker registration. */
function browserWithPush(permission: NotificationPermission) {
  const requestPermission = vi.fn(() => Promise.resolve(permission));
  vi.stubGlobal("PushManager", {});
  vi.stubGlobal("Notification", { permission: "default", requestPermission });
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: {} });
  const subscribe = vi.fn(() =>
    Promise.resolve({
      toJSON: () => ({
        endpoint: "https://push.example.test/send/laura-phone",
        keys: { auth: "A".repeat(22), p256dh: "B".repeat(87) },
      }),
    }),
  );
  setPushRegistration({ pushManager: { subscribe } } as unknown as ServiceWorkerRegistration);
  return { requestPermission, subscribe };
}

async function openProfile(options: Parameters<typeof renderApp>[1] = {}) {
  await renderApp("/perfil", options);
  expect(await screen.findByRole("heading", { level: 1, name: "El meu perfil" })).toBeVisible();
  await screen.findByText("Operativa (reserves i canvis que has fet tu)");
  return present(document.querySelector<HTMLElement>("#avisos"));
}

function present<Value>(value: Value | null | undefined): Value {
  if (value === null || value === undefined) throw new TypeError("Expected the element");
  return value;
}

const emailSwitch = (label: string) => screen.getByRole("switch", { name: `Correu: ${label}` });

describe("T-11-35 screen 12 «Avisos» and «Idioma» (S11 §2, R-11-04, R-11-07, R-11-15, R-11-17)", () => {
  it("the fixed green tick under «App», the four e-mail switches with the product defaults and «+SMS»", async () => {
    const card = await openProfile();
    expect(within(card).getByRole("heading", { name: "Avisos" })).toBeVisible();
    expect(within(card).getAllByRole("img", { name: "Avisos a l'app activats" })).toHaveLength(4);
    expect(within(card).queryAllByRole("button", { name: /app/iu })).toHaveLength(0);
    expect(
      [
        "Operativa (reserves i canvis que has fet tu)",
        "Comunicats personals per a tu",
        "Canvis en reserves que has fet (fets pel club)",
        "Comunicats del club",
      ].map((label) => emailSwitch(label).getAttribute("aria-checked")),
    ).toEqual(["false", "true", "true", "true"]);
    expect(within(card).getByText("+SMS")).toBeVisible();
    expect(card).not.toHaveAttribute("aria-disabled");
  });

  it("hides «+SMS» in a club without SMS (R-11-17)", async () => {
    const card = await openProfile({
      branding: { ...canic, modules: without("SMS") },
      scenario: "memberNoSms",
    });
    expect(within(card).queryByText("+SMS")).toBeNull();
  });

  it("the reminder select lists «Mai» and the club's options", async () => {
    await openProfile();
    const select = screen.getByRole("combobox", { name: "Recordatori de classe" });
    expect(select).toHaveValue("");
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual([
      "Mai",
      "1 h abans",
      "2 h abans",
      "4 h abans",
      "6 h abans",
      "12 h abans",
      "24 h abans",
    ]);
  });

  it("each change shows at once and is saved as a partial PUT after the 300 ms pause", async () => {
    await openProfile();
    fireEvent.click(emailSwitch("Operativa (reserves i canvis que has fet tu)"));
    expect(emailSwitch("Operativa (reserves i canvis que has fet tu)")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(puts()).toEqual([]);
    await waitFor(() => {
      expect(puts()).toEqual([{ emailByCategory: { OPERATIONAL: true } }]);
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Recordatori de classe" }), {
      target: { value: "120" },
    });
    await waitFor(() => {
      expect(puts()).toEqual([
        { emailByCategory: { OPERATIONAL: true } },
        { reminderMinutesBefore: 120 },
      ]);
    });
    // Two changes inside one pause travel together, each key only once.
    fireEvent.click(emailSwitch("Comunicats del club"));
    fireEvent.click(emailSwitch("Comunicats personals per a tu"));
    await waitFor(() => {
      expect(puts()).toHaveLength(3);
    });
    expect(puts()[2]).toEqual({ emailByCategory: { CLUB_NEWS: false, PERSONAL: false } });
    // «Mai» sends null.
    fireEvent.change(screen.getByRole("combobox", { name: "Recordatori de classe" }), {
      target: { value: "" },
    });
    await waitFor(() => {
      expect(puts()[3]).toEqual({ reminderMinutesBefore: null });
    });
  });

  it("rolls a refused change back with its message (422 INVALID_REMINDER_OPTION)", async () => {
    server.use(
      http.put("*/api/v1/me/notification-preferences", () =>
        HttpResponse.json(
          { code: "INVALID_REMINDER_OPTION", details: {}, message: "x", traceId: "t" },
          { status: 422 },
        ),
      ),
    );
    const card = await openProfile();
    const select = screen.getByRole("combobox", { name: "Recordatori de classe" });
    fireEvent.change(select, { target: { value: "240" } });
    expect(select).toHaveValue("240");
    expect(await within(card).findByRole("alert")).toHaveTextContent(
      "Aquesta opció de recordatori ja no és vàlida. Tria'n una altra.",
    );
    expect(select).toHaveValue("");
  });

  it("keeps a newer choice when an older save answers late (the answer rebases the member's edits)", async () => {
    let release: (() => void) | undefined;
    server.use(
      http.put("*/api/v1/me/notification-preferences", async ({ request }) => {
        const body = (await request.clone().json()) as Record<string, unknown>;
        if ("reminderMinutesBefore" in body && release === undefined) {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        return undefined;
      }),
    );
    await openProfile();
    const select = screen.getByRole("combobox", { name: "Recordatori de classe" });
    fireEvent.change(select, { target: { value: "60" } });
    await waitFor(() => {
      expect(release).toBeDefined();
    });
    fireEvent.change(select, { target: { value: "1440" } });
    release?.();
    await waitFor(() => {
      expect(puts()).toEqual([{ reminderMinutesBefore: 60 }, { reminderMinutesBefore: 1440 }]);
    });
    await waitFor(() => {
      expect(screen.queryByText("Desant…")).toBeNull();
    });
    expect(select).toHaveValue("1440");
  });

  it("asks for the browser's permission only on interaction, never on mount, and registers the subscription", async () => {
    const { requestPermission, subscribe } = browserWithPush("granted");
    await openProfile();
    const push = screen.getByRole("switch", {
      name: "Vull rebre notificacions al mòbil quan hi hagi comunicats del club",
    });
    expect(push).toHaveAttribute("aria-checked", "true");
    expect(requestPermission).not.toHaveBeenCalled();
    fireEvent.click(push);
    expect(requestPermission).not.toHaveBeenCalled();
    fireEvent.click(push);
    await waitFor(() => {
      expect(requestPermission).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(
        requests.find(
          (item) => item.method === "POST" && item.path === "/api/v1/push-subscriptions",
        )?.body,
      ).toEqual({
        endpoint: "https://push.example.test/send/laura-phone",
        keys: { auth: "A".repeat(22), p256dh: "B".repeat(87) },
      });
    });
    expect(subscribe).toHaveBeenCalledWith({
      applicationServerKey: expect.any(Uint8Array) as unknown,
      userVisibleOnly: true,
    });
    await waitFor(() => {
      expect(localStorage.getItem(PUSH_SUBSCRIPTION_STORAGE_KEY)).toBe('{"id":"push-1"}');
    });
    expect(
      screen.queryByText("Activa les notificacions al navegador per rebre-les al mòbil"),
    ).toBeNull();
    // A reminder other than «Mai» asks too (in context).
    fireEvent.change(screen.getByRole("combobox", { name: "Recordatori de classe" }), {
      target: { value: "60" },
    });
    await waitFor(() => {
      expect(requestPermission).toHaveBeenCalledTimes(2);
    });
  });

  it("a dismissed prompt (no answer) also leaves the hint under the switch", async () => {
    browserWithPush("default");
    await openProfile();
    const push = screen.getByRole("switch", {
      name: "Vull rebre notificacions al mòbil quan hi hagi comunicats del club",
    });
    fireEvent.click(push);
    fireEvent.click(push);
    expect(
      await screen.findByText("Activa les notificacions al navegador per rebre-les al mòbil"),
    ).toBeVisible();
    expect(requests.some((item) => item.path === "/api/v1/push-subscriptions")).toBe(false);
  });

  it("a denied permission still saves the preference, and the row says how to allow it", async () => {
    const { requestPermission } = browserWithPush("denied");
    // What the browser reports before any request is not shown (headless Chromium says «denied»
    // while it grants): the row explains a refusal of the member's own request only.
    vi.stubGlobal("Notification", { permission: "denied", requestPermission });
    await openProfile();
    expect(
      screen.queryByText("Activa les notificacions al navegador per rebre-les al mòbil"),
    ).toBeNull();
    const push = screen.getByRole("switch", {
      name: "Vull rebre notificacions al mòbil quan hi hagi comunicats del club",
    });
    fireEvent.click(push);
    fireEvent.click(push);
    expect(
      await screen.findByText("Activa les notificacions al navegador per rebre-les al mòbil"),
    ).toBeVisible();
    await waitFor(() => {
      expect(puts().at(-1)).toEqual({ pushClubNews: true });
    });
    expect(requests.some((item) => item.path === "/api/v1/push-subscriptions")).toBe(false);
  });

  it("an iPhone outside the installed app gets the install hint and no permission prompt", async () => {
    const { requestPermission } = browserWithPush("granted");
    Object.defineProperty(navigator, "standalone", { configurable: true, value: false });
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    });
    await openProfile();
    expect(
      screen.getByText("Afegeix l'app a la pantalla d'inici per rebre notificacions"),
    ).toBeVisible();
    expect(screen.getByText("Comparteix ▸ Afegeix a la pantalla d'inici")).toBeVisible();
    const push = screen.getByRole("switch", {
      name: "Vull rebre notificacions al mòbil quan hi hagi comunicats del club",
    });
    fireEvent.click(push);
    fireEvent.click(push);
    await waitFor(() => {
      expect(puts()).toHaveLength(1);
    });
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("no push toggle without PushManager in the browser, nor in a club without PUSH", async () => {
    await openProfile();
    expect(screen.queryByRole("switch", { name: /Vull rebre notificacions al mòbil/u })).toBeNull();
    cleanup();
    browserWithPush("granted");
    await openProfile({
      branding: { ...canic, modules: without("PUSH"), pushPublicKey: null },
      scenario: "memberNoPush",
    });
    expect(screen.queryByRole("switch", { name: /Vull rebre notificacions al mòbil/u })).toBeNull();
    expect(screen.getAllByRole("switch")).toHaveLength(4);
  });

  it("«Aprèn amb AgilityHub ›» after «Els meus gossos» only with LEARN_LINK", async () => {
    await openProfile();
    const learn = screen.getByRole("link", { name: "Aprèn amb AgilityHub" });
    expect(learn).toHaveAttribute("href", "https://learn.agilitydoghub.com");
    expect(learn).toHaveAttribute("target", "_blank");
    expect(
      screen.getByRole("link", { name: "Els meus gossos" }).compareDocumentPosition(learn),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    cleanup();
    await openProfile({
      branding: { ...canic, modules: without("LEARN_LINK") },
      scenario: "learnLinkOff",
    });
    expect(screen.queryByRole("link", { name: "Aprèn amb AgilityHub" })).toBeNull();
  });

  it("the language select writes Account.locale, switches the UI at once and says only new notices change", async () => {
    await openProfile();
    expect(screen.getByText("Els avisos nous et arribaran en aquest idioma")).toBeVisible();
    const row = present(document.querySelector<HTMLElement>(".profile-language"));
    fireEvent.change(within(row).getByRole("combobox", { name: "Idioma" }), {
      target: { value: "es" },
    });
    expect(await screen.findByRole("heading", { level: 1, name: "Mi perfil" })).toBeVisible();
    await waitFor(() => {
      expect(
        requests.find((item) => item.method === "PATCH" && item.path === "/api/v1/me")?.body,
      ).toEqual({ locale: "es" });
    });
    expect(screen.getByText("Los avisos nuevos te llegarán en este idioma")).toBeVisible();
  });

  it("staff without the MEMBER role have no «Avisos» block and no request (S11 §6)", async () => {
    await renderApp("/perfil", { scenario: "instructor" });
    expect(await screen.findByRole("heading", { level: 1, name: "El meu perfil" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Avisos" })).toBeNull();
    expect(requests.some((item) => item.path === PREFERENCES)).toBe(false);
  });

  it("an impersonated session saves the member's choice but never asks for push, and its logout keeps this device's subscription", async () => {
    const { requestPermission } = browserWithPush("granted");
    localStorage.setItem(PUSH_SUBSCRIPTION_STORAGE_KEY, JSON.stringify({ id: "push-admin" }));
    await openProfile({ scenario: "impersonated" });
    const push = screen.getByRole("switch", {
      name: "Vull rebre notificacions al mòbil quan hi hagi comunicats del club",
    });
    fireEvent.click(push);
    fireEvent.click(push);
    await waitFor(() => {
      expect(puts()).toEqual([{ pushClubNews: true }]);
    });
    expect(requestPermission).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tanca la sessió" }));
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    expect(requests.some((item) => item.method === "DELETE")).toBe(false);
    expect(localStorage.getItem(PUSH_SUBSCRIPTION_STORAGE_KEY)).toBe('{"id":"push-admin"}');
  });

  it("logout deletes this device's subscription first, and never waits on it", async () => {
    localStorage.setItem(PUSH_SUBSCRIPTION_STORAGE_KEY, JSON.stringify({ id: "push-7" }));
    await openProfile();
    fireEvent.click(screen.getByRole("button", { name: "Tanca la sessió" }));
    await waitFor(() => {
      expect(
        requests.some(
          (item) => item.method === "DELETE" && item.path === "/api/v1/push-subscriptions/push-7",
        ),
      ).toBe(true);
    });
    expect(localStorage.getItem(PUSH_SUBSCRIPTION_STORAGE_KEY)).toBeNull();
  });
});
