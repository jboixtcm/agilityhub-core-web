import {
  handlers,
  mockScenario,
  NOTIFICATIONS_MOCK_NOW,
  resetActivityState,
  resetBookingMockState,
  resetNotificationMockState,
} from "@agilityhub/api-client/mocks";
import { server } from "@agilityhub/api-client/mocks/server";
import { LOCALE_STORAGE_KEY } from "@agilityhub/i18n";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { getResponse, http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { canic, renderApp, without } from "../booking/test-utils";
import { PUSH_SUBSCRIPTION_STORAGE_KEY, setPushRegistration } from "../notifications/push";

import { NOTICES_OUTBOX_KEY } from "./preferences-saver";

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
  sessionStorage.removeItem(NOTICES_OUTBOX_KEY);
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

/** A promise the test opens when it chooses. */
function gate() {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, opened };
}

/**
 * How the api treats one `PUT` (by its order): when it lands (is applied), whether it lands at all,
 * when its answer leaves, and whether the answer is lost on the way (a network failure).
 */
interface PutPlan {
  answerAfter?: Promise<void>;
  landAfter?: Promise<void>;
  lost?: boolean;
  networkFailure?: boolean;
}

/**
 * Each `PUT /me/notification-preferences` follows its plan (a `PUT` without one lands and is
 * answered at once). `landed` lists the bodies in the order the api applied them.
 */
function planPuts(plans: PutPlan[]) {
  const landed: unknown[] = [];
  let index = 0;
  server.use(
    http.put("*/api/v1/me/notification-preferences", async ({ request }) => {
      const plan = plans[index] ?? {};
      index += 1;
      const body: unknown = await request.clone().json();
      await plan.landAfter;
      const response =
        plan.lost === true ? undefined : await getResponse(handlers, request.clone());
      if (plan.lost !== true) landed.push(body);
      await plan.answerAfter;
      return plan.networkFailure === true ? HttpResponse.error() : response;
    }),
  );
  return landed;
}

/** The reminder the api holds now. */
async function storedReminder(): Promise<number | null> {
  const stored = (await (await fetch(`${window.location.origin}${PREFERENCES}`)).json()) as {
    reminderMinutesBefore: number | null;
  };
  return stored.reminderMinutesBefore;
}

const noticesOutbox = () =>
  JSON.parse(sessionStorage.getItem(NOTICES_OUTBOX_KEY) ?? "null") as { patch: unknown } | null;

const reminderSelect = () => screen.getByRole("combobox", { name: "Recordatori de classe" });

/** Reminder 60 (its `PUT` is the first), then 120, and the member leaves 12 at once. */
async function sixtyThenTwoHoursAndLeave() {
  fireEvent.change(reminderSelect(), { target: { value: "60" } });
  await waitFor(() => {
    expect(puts()).toHaveLength(1);
  });
  fireEvent.change(reminderSelect(), { target: { value: "120" } });
  cleanup();
  await waitFor(() => {
    expect(puts()).toEqual([{ reminderMinutesBefore: 60 }, { reminderMinutesBefore: 120 }]);
  });
}

function transition(type: "pagehide" | "pageshow", persisted: boolean) {
  const event = new Event(type);
  Object.defineProperty(event, "persisted", { value: persisted });
  window.dispatchEvent(event);
}

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

  it("E7-W02 round 2 #1: leaving 12 while a PUT is on its way sends the waiting change at once, and the latest choice (120) is what the api keeps even when the older PUT answers last", async () => {
    let release: (() => void) | undefined;
    let first = true;
    server.use(
      http.put("*/api/v1/me/notification-preferences", async () => {
        if (first) {
          first = false;
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
    fireEvent.change(select, { target: { value: "120" } });
    // The member leaves at once: the page may be gone before the first PUT answers.
    cleanup();
    await waitFor(() => {
      expect(puts()).toEqual([{ reminderMinutesBefore: 60 }, { reminderMinutesBefore: 120 }]);
    });
    // The older PUT lands last at the api (60 over 120) and answers after the newer one.
    release?.();
    await waitFor(async () => {
      const stored = (await (await fetch(`${window.location.origin}${PREFERENCES}`)).json()) as {
        reminderMinutesBefore: number | null;
      };
      expect(stored.reminderMinutesBefore).toBe(120);
    });
  });

  it("E7-W02 round 2 #1: a change kept across a reload is sent again on the next visit of the same account and club only", async () => {
    const outbox = (accountId: string) =>
      JSON.stringify({
        accountId,
        at: Date.now(),
        clubId: "50000000-0000-4000-8000-000000000001",
        patch: { reminderMinutesBefore: 720 },
      });
    sessionStorage.setItem(NOTICES_OUTBOX_KEY, outbox("10000000-0000-4000-8000-000000000099"));
    await openProfile();
    await new Promise((resolve) => {
      setTimeout(resolve, 400);
    });
    expect(puts()).toEqual([]);
    expect(screen.getByRole("combobox", { name: "Recordatori de classe" })).toHaveValue("");
    cleanup();
    sessionStorage.setItem(NOTICES_OUTBOX_KEY, outbox("10000000-0000-4000-8000-000000000002"));
    await openProfile();
    await waitFor(() => {
      expect(puts()).toEqual([{ reminderMinutesBefore: 720 }]);
    });
    expect(screen.getByRole("combobox", { name: "Recordatori de classe" })).toHaveValue("720");
    await waitFor(() => {
      expect(sessionStorage.getItem(NOTICES_OUTBOX_KEY)).toBeNull();
    });
  });

  it("E7-W05 step 1, path a (R-11-04): the older PUT lands last and the resend of the latest choice is lost — the latest choice stays in the outbox, and the next visit saves it", async () => {
    const first = gate();
    const landed = planPuts([
      { landAfter: first.opened },
      {},
      { lost: true, networkFailure: true },
    ]);
    await openProfile();
    await sixtyThenTwoHoursAndLeave();
    await waitFor(() => {
      expect(landed).toEqual([{ reminderMinutesBefore: 120 }]);
    });
    first.open();
    await waitFor(() => {
      expect(puts()).toHaveLength(3);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await storedReminder()).toBe(60);
    expect(noticesOutbox()).toMatchObject({ patch: { reminderMinutesBefore: 120 } });
    await openProfile();
    await waitFor(async () => {
      expect(await storedReminder()).toBe(120);
    });
    await waitFor(() => {
      expect(noticesOutbox()).toBeNull();
    });
    expect(reminderSelect()).toHaveValue("120");
  });

  it("E7-W05 step 1, path b (R-11-04): the older PUT lands last and its answer is lost — the latest choice is sent again once it settles, and the outbox goes only after that save's 2xx", async () => {
    const first = gate();
    const resend = gate();
    const landed = planPuts([
      { landAfter: first.opened, networkFailure: true },
      {},
      { answerAfter: resend.opened },
    ]);
    await openProfile();
    await sixtyThenTwoHoursAndLeave();
    await waitFor(() => {
      expect(landed).toEqual([{ reminderMinutesBefore: 120 }]);
    });
    first.open();
    await waitFor(() => {
      expect(landed).toHaveLength(3);
    });
    expect(noticesOutbox()).toMatchObject({ patch: { reminderMinutesBefore: 120 } });
    resend.open();
    await waitFor(() => {
      expect(noticesOutbox()).toBeNull();
    });
    expect(landed).toEqual([
      { reminderMinutesBefore: 120 },
      { reminderMinutesBefore: 60 },
      { reminderMinutesBefore: 120 },
    ]);
    expect(await storedReminder()).toBe(120);
  });

  it("E7-W05 step 1, path c (R-11-04): the older PUT lands last but answers first — the latest choice is sent again and saved", async () => {
    const first = gate();
    const second = gate();
    const landed = planPuts([{ landAfter: first.opened }, { answerAfter: second.opened }, {}]);
    await openProfile();
    await sixtyThenTwoHoursAndLeave();
    await waitFor(() => {
      expect(landed).toEqual([{ reminderMinutesBefore: 120 }]);
    });
    first.open();
    await waitFor(() => {
      expect(landed.slice(0, 2)).toEqual([
        { reminderMinutesBefore: 120 },
        { reminderMinutesBefore: 60 },
      ]);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(noticesOutbox()).toMatchObject({ patch: { reminderMinutesBefore: 120 } });
    second.open();
    await waitFor(() => {
      expect(noticesOutbox()).toBeNull();
    });
    expect(landed).toEqual([
      { reminderMinutesBefore: 120 },
      { reminderMinutesBefore: 60 },
      { reminderMinutesBefore: 120 },
    ]);
    expect(await storedReminder()).toBe(120);
  });

  it("E7-W05 step 2 (R-11-04): back from the back-forward cache, 12 saves again — pagehide with a change pending, pageshow(persisted), an edit while that PUT is out, leave: the edit is saved", async () => {
    const departure = gate();
    planPuts([{ answerAfter: departure.opened }]);
    await openProfile();
    fireEvent.change(reminderSelect(), { target: { value: "60" } });
    transition("pagehide", true);
    await waitFor(() => {
      expect(puts()).toEqual([{ reminderMinutesBefore: 60 }]);
    });
    transition("pageshow", true);
    fireEvent.change(reminderSelect(), { target: { value: "120" } });
    await new Promise((resolve) => setTimeout(resolve, 400));
    transition("pagehide", false);
    expect(noticesOutbox()).toMatchObject({ patch: { reminderMinutesBefore: 120 } });
    departure.open();
    await waitFor(async () => {
      expect(await storedReminder()).toBe(120);
    });
    await waitFor(() => {
      expect(noticesOutbox()).toBeNull();
    });
    expect(puts().at(-1)).toEqual({ reminderMinutesBefore: 120 });
  });

  it("E7-W05 step 6 (E7-W02 review #4): an older visit's success never erases the entry a newer visit left in the outbox", async () => {
    const olderVisit = gate();
    planPuts([
      // The first visit's departure: answered only after the second visit has left.
      { answerAfter: olderVisit.opened },
      // The second visit saves what it took over from the outbox…
      {},
      // …and its own departure never reaches the api.
      { lost: true, networkFailure: true },
    ]);
    await openProfile();
    fireEvent.change(reminderSelect(), { target: { value: "60" } });
    cleanup();
    await waitFor(() => {
      expect(puts()).toEqual([{ reminderMinutesBefore: 60 }]);
    });
    await openProfile();
    await waitFor(() => {
      expect(puts()).toHaveLength(2);
    });
    await waitFor(() => {
      expect(screen.queryByText("Desant…")).toBeNull();
    });
    fireEvent.click(emailSwitch("Operativa (reserves i canvis que has fet tu)"));
    cleanup();
    await waitFor(() => {
      expect(puts()).toHaveLength(3);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(noticesOutbox()).toMatchObject({ patch: { emailByCategory: { OPERATIONAL: true } } });
    olderVisit.open();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(noticesOutbox()).toMatchObject({ patch: { emailByCategory: { OPERATIONAL: true } } });
  });

  it("E7-W06 (E7-W05 review #4): back from the back-forward cache with nothing unsaved, 12 saves the change a newer visit left in the outbox instead of taking it over and ignoring it", async () => {
    await openProfile();
    transition("pagehide", true);
    // Meanwhile a newer visit of 12 in this tab left reminder 60 unsaved.
    sessionStorage.setItem(
      NOTICES_OUTBOX_KEY,
      JSON.stringify({
        accountId: "10000000-0000-4000-8000-000000000002",
        at: Date.now(),
        clubId: "50000000-0000-4000-8000-000000000001",
        patch: { reminderMinutesBefore: 60 },
        visit: "a-newer-visit",
      }),
    );
    transition("pageshow", true);
    await waitFor(() => {
      expect(puts()).toEqual([{ reminderMinutesBefore: 60 }]);
    });
    expect(reminderSelect()).toHaveValue("60");
    await waitFor(() => {
      expect(noticesOutbox()).toBeNull();
    });
    expect(await storedReminder()).toBe(60);
  });

  /**
   * E7-W06 step 4's scenario: 60, then 120 and the page left, restored while both PUTs were out,
   * the older 60 landing last (the api holds 60), and the resend of 120 lost. `fourth` is the plan
   * of the PUT after that failure.
   */
  async function overlappingDepartureThenResendLost(fourth: PutPlan) {
    const older = gate();
    const departure = gate();
    const landed = planPuts([
      // 60: reaches the api only after the departure's 120.
      { landAfter: older.opened },
      // 120 with keepalive: lands at once, answers when the test says.
      { answerAfter: departure.opened },
      // The resend of 120 never reaches the api.
      { lost: true, networkFailure: true },
      fourth,
      // A departure after it (the page is gone before it lands), then the next visit's save.
      { lost: true, networkFailure: true },
    ]);
    await openProfile();
    fireEvent.change(reminderSelect(), { target: { value: "60" } });
    await waitFor(() => {
      expect(puts()).toHaveLength(1);
    });
    fireEvent.change(reminderSelect(), { target: { value: "120" } });
    transition("pagehide", true);
    await waitFor(() => {
      expect(landed).toEqual([{ reminderMinutesBefore: 120 }]);
    });
    transition("pageshow", true);
    departure.open();
    // The adopted 120 waits past its 300 ms pause for the older PUT, which lands only now.
    await new Promise((resolve) => setTimeout(resolve, 400));
    older.open();
    await waitFor(() => {
      expect(puts()).toHaveLength(4);
    });
    expect(puts()).toEqual([
      { reminderMinutesBefore: 60 },
      { reminderMinutesBefore: 120 },
      { reminderMinutesBefore: 120 },
      { reminderMinutesBefore: 120 },
    ]);
  }

  const preferenceReads = () =>
    requests.filter((item) => item.method === "GET" && item.path === PREFERENCES);

  it("E7-W07 step 2 (E7-W06 review #3, ruling E85: option a; R-11-04): overlapping PUTs and the last one lost — 12 reads GET again (the api holds 1 h), shows the member's «2 h abans» as a pending change with «Desant…», sends it again, and its 2xx saves it and frees the outbox", async () => {
    const retry = gate();
    await overlappingDepartureThenResendLost({ answerAfter: retry.opened });
    // The fourth PUT is the retry that follows the read, not a save sent before it.
    expect(preferenceReads()).toHaveLength(2);
    expect(reminderSelect()).toHaveValue("120");
    expect(
      within(present(document.querySelector<HTMLElement>("#avisos"))).getByRole("status"),
    ).toHaveTextContent("Desant…");
    expect(noticesOutbox()).toMatchObject({ patch: { reminderMinutesBefore: 120 } });
    retry.open();
    await waitFor(() => {
      expect(noticesOutbox()).toBeNull();
    });
    expect(reminderSelect()).toHaveValue("120");
    expect(screen.queryByText("Desant…")).toBeNull();
    expect(await storedReminder()).toBe(120);
  });

  it("E7-W07 step 2 (ruling E85: option a): the retry is lost too and the member leaves right after — the departure carries «2 h abans» and keeps it, so the next visit within 5 minutes of leaving shows it as a pending change before it is saved; E7-W07 round 2 #1: that visit's PUT fails too — «2 h abans» stays shown and kept, and the member's next change sends it", async () => {
    const firstDeparture = Date.now();
    await overlappingDepartureThenResendLost({ lost: true, networkFailure: true });
    // The retry failed four minutes after the first departure: 12 still shows the choice.
    vi.setSystemTime(firstDeparture + 4 * 60_000);
    await waitFor(() => {
      expect(screen.queryByText("Desant…")).toBeNull();
    });
    expect(screen.getByRole("alert")).toHaveTextContent("S'ha produït un error inesperat.");
    expect(reminderSelect()).toHaveValue("120");
    expect(preferenceReads()).toHaveLength(2);
    cleanup();
    await waitFor(() => {
      expect(puts()).toHaveLength(5);
    });
    expect(puts()[4]).toEqual({ reminderMinutesBefore: 120 });
    // Two minutes later (six after the first departure), the member comes back to 12; its save
    // answers only when the test says.
    vi.setSystemTime(firstDeparture + 6 * 60_000);
    const failNow = gate();
    planPuts([{ answerAfter: failNow.opened, lost: true, networkFailure: true }]);
    const card = await openProfile();
    await waitFor(() => {
      expect(reminderSelect()).toHaveValue("120");
    });
    expect(screen.getByText("Desant…")).toBeVisible();
    expect(await storedReminder()).toBe(60);
    await waitFor(() => {
      expect(puts()).toHaveLength(6);
    });
    // E7-W07 round 2 #1 (review #1, ruling E86): that visit's PUT fails as well. The failure is
    // said, and «2 h abans» stays shown and kept, unsent (no loop of resends).
    failNow.open();
    expect(await within(card).findByRole("alert")).toHaveTextContent(
      "S'ha produït un error inesperat.",
    );
    await waitFor(() => {
      expect(screen.queryByText("Desant…")).toBeNull();
    });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(reminderSelect()).toHaveValue("120");
    expect(noticesOutbox()).toMatchObject({ patch: { reminderMinutesBefore: 120 } });
    expect(puts()).toHaveLength(6);
    expect(await storedReminder()).toBe(60);
    // The member's next change sends it with that change, and only its 2xx frees the outbox.
    const operational = emailSwitch("Operativa (reserves i canvis que has fet tu)");
    const turnedOn = operational.getAttribute("aria-checked") !== "true";
    fireEvent.click(operational);
    await waitFor(() => {
      expect(noticesOutbox()).toBeNull();
    });
    expect(puts().at(-1)).toEqual({
      emailByCategory: { OPERATIONAL: turnedOn },
      reminderMinutesBefore: 120,
    });
    expect(await storedReminder()).toBe(120);
  });

  it("E7-W05 step 6 (E7-W02 review #5): an impersonated session never shows the browser-permission note (it never asks for push)", async () => {
    const { requestPermission } = browserWithPush("denied");
    vi.stubGlobal("Notification", { permission: "denied", requestPermission });
    await openProfile({ scenario: "impersonated" });
    const push = screen.getByRole("switch", {
      name: "Vull rebre notificacions al mòbil quan hi hagi comunicats del club",
    });
    expect(push).toHaveAttribute("aria-checked", "true");
    fireEvent.click(push);
    fireEvent.click(push);
    await waitFor(() => {
      expect(puts()).toEqual([{ pushClubNews: true }]);
    });
    expect(
      screen.queryByText("Activa les notificacions al navegador per rebre-les al mòbil"),
    ).toBeNull();
    expect(requestPermission).not.toHaveBeenCalled();
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

  it("E7-W02 round 2 #5: a permission already refused shows the explanation on arrival (read at mount, never asked), and a change still saves", async () => {
    const { requestPermission } = browserWithPush("denied");
    // A returning member whose browser refused earlier: `pushClubNews` is on (the default).
    vi.stubGlobal("Notification", { permission: "denied", requestPermission });
    await openProfile();
    expect(
      await screen.findByText("Activa les notificacions al navegador per rebre-les al mòbil"),
    ).toBeVisible();
    expect(requestPermission).not.toHaveBeenCalled();
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
