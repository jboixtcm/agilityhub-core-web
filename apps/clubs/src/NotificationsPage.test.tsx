import {
  mockScenario,
  NOTIFICATIONS_MOCK_NOW,
  resetActivityState,
  resetBookingMockState,
  resetNotificationMockState,
} from "@agilityhub/api-client/mocks";
import { server } from "@agilityhub/api-client/mocks/server";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { canic, renderApp, without } from "./booking/test-utils";
import { publishUnreadCount, READ_ALL_PENDING_KEY } from "./notifications/unread";

interface Seen {
  body: unknown;
  method: string;
  path: string;
  search: string;
}

let requests: Seen[] = [];
let observers: { callback: IntersectionObserverCallback; node: Element | undefined }[] = [];

/** jsdom has no IntersectionObserver: the tests say when the list end shows. */
class FakeIntersectionObserver {
  readonly entry: { callback: IntersectionObserverCallback; node: Element | undefined };
  constructor(callback: IntersectionObserverCallback) {
    this.entry = { callback, node: undefined };
    observers.push(this.entry);
  }
  observe(node: Element) {
    this.entry.node = node;
  }
  disconnect() {
    observers = observers.filter((item) => item !== this.entry);
  }
}

function showListEnd() {
  for (const { callback, node } of observers) {
    if (node === undefined) continue;
    callback(
      [{ isIntersecting: true, target: node } as unknown as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
  }
}

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
  requests = [];
  observers = [];
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  server.events.on("request:start", ({ request }) => {
    const url = new URL(request.url);
    const seen: Seen = {
      body: undefined,
      method: request.method,
      path: url.pathname,
      search: url.search,
    };
    requests.push(seen);
    if (request.method === "POST" || request.method === "PUT") {
      void request
        .clone()
        .text()
        .then((text) => {
          // The api's JSON bodies (the identity routes send forms).
          if (url.pathname.startsWith("/api/v1/") && text !== "") {
            seen.body = JSON.parse(text) as unknown;
          }
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
  vi.unstubAllGlobals();
  vi.useRealTimers();
  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith(READ_ALL_PENDING_KEY)) sessionStorage.removeItem(key);
  }
  resetBookingMockState();
  resetActivityState();
  resetNotificationMockState();
  mockScenario("member");
});
afterAll(() => {
  server.close();
});

const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/gu, " ").trim();

/** Each card as a reader sees it: icon · tone · title · meta line · button (or «—»). */
function cards(): string[] {
  return [...document.querySelectorAll<HTMLElement>(".notification-card")].map((card) => {
    const icon = card.querySelector(".notification-card__icon use")?.getAttribute("href") ?? "";
    const tone = [...card.classList]
      .find(
        (name) =>
          name.startsWith("notification-card--") &&
          !["notification-card--unread", "notification-card--link"].includes(name),
      )
      ?.replace("notification-card--", "");
    const button = card.querySelector("button");
    return [
      icon.slice(icon.indexOf("#i-") + 3),
      tone,
      clean(card.querySelector(".notification-card__title")?.textContent),
      clean(card.querySelector(".notification-card__meta")?.textContent),
      button === null ? "—" : `${clean(button.textContent)}${button.disabled ? " (disabled)" : ""}`,
    ].join(" | ");
  });
}

async function openFeed(options: Parameters<typeof renderApp>[1] = {}) {
  await renderApp("/notificacions", options);
  expect(await screen.findByRole("heading", { level: 1, name: "Notificacions" })).toBeVisible();
  await screen.findAllByRole("listitem");
}

function present<Value>(value: Value | null | undefined): Value {
  if (value === null || value === undefined) throw new TypeError("Expected the element");
  return value;
}

/** The first (newest) card's button or link of that name: N-15 is the newest [AGAFA LA PLAÇA]. */
const newest = (role: "button" | "link", name: string) =>
  present(screen.getAllByRole(role, { name })[0]);

const count = (method: string, path: string) =>
  requests.filter((item) => item.method === method && item.path === `/api/v1${path}`).length;

describe("T-11-34 screen 11 «Notificacions» (S11 §2, R-11-10, R-11-11)", () => {
  it("renders mockup 11's six cards as delivered: icon, tone, texts, relative time, «i per SMS», the buttons", async () => {
    await openFeed();
    expect(cards().slice(0, 6)).toEqual([
      "x | error | Classe anul·lada pel club | fa 2 min · i per SMS | CANVIA DE CLASSE",
      "unlock | accent | S'ha alliberat una plaça! | fa 4 min | AGAFA LA PLAÇA",
      "heart | neutral | T'hem trobat a faltar | avui 8:00 | —",
      "warn | warning | Possible anul·lació de classe | avui 7:00 | CANVIA DE CLASSE",
      "up | ok | En Rock puja de nivell! | ahir 19:12 | —",
      "check | ok | Reserva confirmada | ahir 18:40 | —",
    ]);
    // E7-W03: each card carries the api's code and id (the real-core spec selects by them).
    const shown = [...document.querySelectorAll<HTMLElement>(".notification-card")].slice(0, 6);
    expect(shown.map((card) => card.dataset.code)).toEqual([
      "N-08a",
      "N-15",
      "N-19",
      "N-16",
      "N-09",
      "N-06",
    ]);
    expect(shown.map((card) => card.dataset.notificationId)).toEqual([
      "notification-n08a",
      "notification-n15",
      "notification-n19",
      "notification-n16",
      "notification-n09",
      "notification-n06",
    ]);
    // The rendered, frozen bodies are printed verbatim (never re-cased nor re-formatted).
    expect(
      screen.getByText(
        "Dimecres 12 · 18:50 · B+C · Central, amb Duna. «La classe queda anul·lada per la pluja. Podeu reservar-ne una altra des de l'app. Disculpeu les molèsties!» — Cànic Agility. Aquesta sessió no compta al teu còmput.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText("Entrenament lliure · dt 4 · 8:00–8:30 · Muntanya · amb Rock."),
    ).toBeVisible();
    // «i per SMS» only on the SMS one; the two unread cards carry the unread mark.
    expect(screen.getAllByText(/i per SMS/u)).toHaveLength(1);
    const unread = [...document.querySelectorAll(".notification-card--unread")].map((card) =>
      clean(card.querySelector(".notification-card__title")?.textContent),
    );
    expect(unread).toEqual(["Classe anul·lada pel club", "S'ha alliberat una plaça!"]);
    expect(
      within(present(document.querySelector<HTMLElement>(".notification-card--unread"))).getByText(
        "Nova",
      ),
    ).toBeInTheDocument();
  });

  it("never prints «i per SMS» without the SMS module, even for an SMS the api lists", async () => {
    await openFeed({ branding: { ...canic, modules: without("SMS") } });
    expect(screen.queryByText(/i per SMS/u)).toBeNull();
    expect(cards()[0]).toBe("x | error | Classe anul·lada pel club | fa 2 min | CANVIA DE CLASSE");
    cleanup();
    resetNotificationMockState();
    await openFeed({ branding: { ...canic, modules: without("SMS") }, scenario: "memberNoSms" });
    expect(screen.queryByText(/i per SMS/u)).toBeNull();
  });

  it("[CANVIA DE CLASSE] opens 04 with the notification's dog", async () => {
    await openFeed();
    fireEvent.click(newest("button", "CANVIA DE CLASSE"));
    expect(await screen.findByRole("heading", { level: 1, name: "Reservar" })).toBeVisible();
    expect(`${window.location.pathname}${window.location.search}`).toBe("/reservar?dogId=dog-duna");
    await waitFor(() => {
      expect(
        requests.some(
          (item) =>
            item.path === "/api/v1/me/bookable-classes" && item.search === "?dogId=dog-duna",
        ),
      ).toBe(true);
    });
  });

  it("[AGAFA LA PLAÇA] reuses E5-W01's claim: the entry's seat hold, then the confirmation (06/29)", async () => {
    await openFeed();
    fireEvent.click(newest("button", "AGAFA LA PLAÇA"));
    expect(await screen.findByRole("heading", { name: "Confirmar reserva" })).toBeVisible();
    expect(window.location.pathname).toBe("/reservar/confirmar");
    const hold = requests.find(
      (item) => item.method === "POST" && item.path === "/api/v1/seat-holds",
    );
    expect(hold?.body).toEqual({
      classSessionId: "class-2026-08-06-2000",
      dogId: "dog-duna",
      waitlistEntryId: "waitlist-duna-thu6",
    });
  });

  it("[AGAFA LA PLAÇA] reads disabled, with its hint, once the seat is gone (enabled: false)", async () => {
    await openFeed({ scenario: "notificationsSeatTaken" });
    const button = newest("button", "AGAFA LA PLAÇA");
    expect(cards()[1]).toBe(
      "unlock | accent | S'ha alliberat una plaça! | fa 4 min | AGAFA LA PLAÇA (disabled)",
    );
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("Aquesta plaça ja no està disponible");
    expect(count("POST", "/seat-holds")).toBe(0);
  });

  it("E7-W02 round 2 #4 (AGENTS rule 3): with WAITLIST off, a historical N-15 the api still lists is an informative card with no [AGAFA LA PLAÇA]", async () => {
    await openFeed({ branding: { ...canic, modules: without("WAITLIST") } });
    expect(cards()[1]).toBe("unlock | accent | S'ha alliberat una plaça! | fa 4 min | —");
    expect(screen.queryByRole("button", { name: "AGAFA LA PLAÇA" })).toBeNull();
    expect(screen.queryByText("Aquesta plaça ja no està disponible")).toBeNull();
    // Inert: the claim is the waiting list's, and there is no other page to open.
    expect(screen.queryByRole("link", { name: "S'ha alliberat una plaça!" })).toBeNull();
    expect(count("POST", "/seat-holds")).toBe(0);
    // The mock world of a club whose WAITLIST is off lists the historical N-15 as the api does.
    cleanup();
    resetNotificationMockState();
    await openFeed({
      branding: { ...canic, modules: without("WAITLIST") },
      scenario: "bookingNoWaitlist",
    });
    expect(cards()[1]).toBe("unlock | accent | S'ha alliberat una plaça! | fa 4 min | —");
  });

  it("a hold refused with 409 SEAT_TAKEN shows E5-W01's message in the card", async () => {
    server.use(
      http.post("*/api/v1/seat-holds", () =>
        HttpResponse.json(
          { code: "SEAT_TAKEN", details: {}, message: "Seat taken", traceId: "t" },
          { status: 409 },
        ),
      ),
    );
    await openFeed();
    const card = present(
      newest("button", "AGAFA LA PLAÇA").closest<HTMLElement>(".notification-card"),
    );
    fireEvent.click(within(card).getByRole("button", { name: "AGAFA LA PLAÇA" }));
    expect(await within(card).findByRole("alert")).toHaveTextContent(
      "Aquesta plaça s'acaba d'ocupar.",
    );
    expect(window.location.pathname).toBe("/notificacions");
  });

  it("an informative card opens its route on tap, without a button; one without an action is inert", async () => {
    await openFeed();
    const level = screen.getByRole("link", { name: "En Rock puja de nivell!" });
    expect(level).toHaveAttribute("href", "/gossos");
    expect(newest("link", "Reserva confirmada")).toHaveAttribute(
      "href",
      "/entrenaments/training-rock-tue4",
    );
    expect(screen.queryByRole("link", { name: "T'hem trobat a faltar" })).toBeNull();
    fireEvent.click(level);
    await waitFor(() => {
      expect(window.location.pathname).toBe("/gossos");
    });
  });

  it("entering calls read-all once, and 03's bell goes quiet", async () => {
    await openFeed();
    await waitFor(() => {
      expect(count("POST", "/me/notifications/read-all")).toBe(1);
    });
    expect(count("POST", "/me/notifications/notification-n08a/read")).toBe(0);
    cleanup();
    await renderApp("/inici");
    const bell = await screen.findByRole("link", { name: "Avisos" });
    expect(bell.querySelector("svg")).not.toHaveClass("home-header__bell-icon--ringing");
    expect(bell.querySelector(".home-header__dot")).toBeNull();
  });

  it("back on 03 from the browser's page cache, the bell reads GET /me/home again", async () => {
    await renderApp("/inici");
    expect(await screen.findByRole("link", { name: "Avisos: 2 sense llegir" })).toBeVisible();
    // Screen 11 was read in another document meanwhile (the bell is a full-page link).
    await fetch(`${window.location.origin}/api/v1/me/notifications/read-all`, { method: "POST" });
    const shown = new Event("pageshow");
    Object.defineProperty(shown, "persisted", { value: true });
    window.dispatchEvent(shown);
    expect(await screen.findByRole("link", { name: "Avisos" })).toBeVisible();
  });

  it("E7-W02 round 2 #3: a failed read-all is sent again (bounded retry), and its answer silences the bell", async () => {
    let calls = 0;
    server.use(
      http.post("*/api/v1/me/notifications/read-all", () => {
        calls += 1;
        if (calls > 1) return undefined;
        return HttpResponse.json(
          { code: "INTERNAL_ERROR", details: {}, message: "boom", traceId: "t" },
          { status: 500 },
        );
      }),
    );
    await openFeed();
    await waitFor(
      () => {
        expect(count("POST", "/me/notifications/read-all")).toBe(2);
      },
      { timeout: 4000 },
    );
    cleanup();
    await renderApp("/inici");
    expect(await screen.findByRole("link", { name: "Avisos" })).toBeVisible();
  });

  it("E7-W02 round 2 #3: inside one document (the module store survives, as in an in-app return), a read-all answered after 03 mounted updates the bell (03 reads GET /me/home again)", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post("*/api/v1/me/notifications/read-all", async () => {
        await gate;
        return undefined;
      }),
    );
    await openFeed();
    await waitFor(() => {
      expect(count("POST", "/me/notifications/read-all")).toBe(1);
    });
    cleanup();
    await renderApp("/inici");
    // The api has not read everything yet, and 03 has read GET /me/home (it still counts two); the
    // read-all is still pending, so 03 sends it again and keeps the bell quiet meanwhile — never
    // the two it is marking read (E7-W06, E7-W05 review #5).
    expect(await screen.findByRole("heading", { name: "Les meves reserves" })).toBeVisible();
    expect(count("GET", "/me/home")).toBe(1);
    expect(screen.getByRole("link", { name: "Avisos" })).toBeVisible();
    const homeReads = count("GET", "/me/home");
    release();
    await waitFor(() => {
      expect(count("GET", "/me/home")).toBeGreaterThan(homeReads);
    });
    expect(await screen.findByRole("link", { name: "Avisos" })).toBeVisible();
  });

  it("E7-W05 step 3 (S11 §13-8): a read-all left without an answer stays pending in the tab's sessionStorage for this account and club, and a fresh 03 sends it again before it reads GET /me/home — the bell goes quiet", async () => {
    server.use(
      // Screen 11's read-all never gets its answer (the page is gone first).
      http.post("*/api/v1/me/notifications/read-all", () => new Promise<never>(() => undefined)),
    );
    await openFeed();
    await waitFor(() => {
      expect(count("POST", "/me/notifications/read-all")).toBe(1);
    });
    expect(
      Object.keys(sessionStorage).filter((key) => key.startsWith(READ_ALL_PENDING_KEY)),
    ).toEqual([
      `${READ_ALL_PENDING_KEY}:10000000-0000-4000-8000-000000000002:50000000-0000-4000-8000-000000000001`,
    ]);
    cleanup();
    server.resetHandlers();
    await renderApp("/inici");
    expect(await screen.findByRole("link", { name: "Avisos" })).toBeVisible();
    expect(count("POST", "/me/notifications/read-all")).toBe(2);
    const order = requests
      .filter(
        (item) =>
          item.path === "/api/v1/me/notifications/read-all" || item.path === "/api/v1/me/home",
      )
      .map((item) => `${item.method} ${item.path}`);
    // After the second read-all, 03 read /me/home again.
    expect(order.slice(order.lastIndexOf("POST /api/v1/me/notifications/read-all"))).toContain(
      "GET /api/v1/me/home",
    );
    await waitFor(() => {
      expect(
        Object.keys(sessionStorage).filter((key) => key.startsWith(READ_ALL_PENDING_KEY)),
      ).toEqual([]);
    });
  });

  it("E7-W05 step 3: another account's or club's pending read-all is not sent from 03", async () => {
    sessionStorage.setItem(
      `${READ_ALL_PENDING_KEY}:10000000-0000-4000-8000-000000000099:50000000-0000-4000-8000-000000000001`,
      JSON.stringify({ at: Date.now() }),
    );
    await renderApp("/inici");
    expect(await screen.findByRole("link", { name: "Avisos: 2 sense llegir" })).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(count("POST", "/me/notifications/read-all")).toBe(0);
  });

  it("E7-W05 step 6 (E7-W02 review #3): a quiet refetch of 03 that fails keeps the last rows on screen", async () => {
    await renderApp("/inici");
    expect(await screen.findByRole("link", { name: "Avisos: 2 sense llegir" })).toBeVisible();
    const rows = () => document.querySelectorAll(".reservation-row, .activity-row").length;
    const shown = rows();
    expect(shown).toBeGreaterThan(0);
    let failed = 0;
    server.use(
      http.get("*/api/v1/me/home", () => {
        failed += 1;
        return HttpResponse.json(
          { code: "INTERNAL_ERROR", details: {}, message: "boom", traceId: "t" },
          { status: 500 },
        );
      }),
    );
    const restored = new Event("pageshow");
    Object.defineProperty(restored, "persisted", { value: true });
    window.dispatchEvent(restored);
    await waitFor(() => {
      expect(failed).toBe(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText("No s'han pogut carregar les teves reserves.")).toBeNull();
    expect(rows()).toBe(shown);
    expect(screen.getByRole("link", { name: "Avisos: 2 sense llegir" })).toBeVisible();
  });

  it("E7-W06 step 3 (E7-W05 review #2): 03's other quiet reload — a read-all answered while 03 is shown — keeps the rows when its GET /me/home fails", async () => {
    await renderApp("/inici");
    expect(await screen.findByRole("link", { name: "Avisos: 2 sense llegir" })).toBeVisible();
    const rows = () => document.querySelectorAll(".reservation-row, .activity-row").length;
    await waitFor(() => {
      expect(rows()).toBeGreaterThan(0);
    });
    const shown = rows();
    let failed = 0;
    server.use(
      http.get("*/api/v1/me/home", () => {
        failed += 1;
        return HttpResponse.json(
          { code: "INTERNAL_ERROR", details: {}, message: "boom", traceId: "t" },
          { status: 500 },
        );
      }),
    );
    act(() => {
      publishUnreadCount(0);
    });
    await waitFor(() => {
      expect(failed).toBe(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText("No s'han pogut carregar les teves reserves.")).toBeNull();
    expect(rows()).toBe(shown);
  });

  it("E7-W06 (E7-W05 review #5): while 03 sends a pending read-all again, the bell never shows the stale unread count — neither before the resend's answer nor before the GET /me/home read that follows it", async () => {
    sessionStorage.setItem(
      `${READ_ALL_PENDING_KEY}:10000000-0000-4000-8000-000000000002:50000000-0000-4000-8000-000000000001`,
      JSON.stringify({ at: Date.now() }),
    );
    let answer: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => {
      answer = resolve;
    });
    let reread: () => void = () => undefined;
    const rereadOpened = new Promise<void>((resolve) => {
      reread = resolve;
    });
    let homeReads = 0;
    server.use(
      http.post("*/api/v1/me/notifications/read-all", async () => {
        await answered;
        return undefined;
      }),
      http.get("*/api/v1/me/home", async () => {
        homeReads += 1;
        if (homeReads > 1) await rereadOpened;
        return undefined;
      }),
    );
    // Every state of the bell the page ever shows.
    const seen = new Set<string>();
    const observer = new MutationObserver(() => {
      const bell = document.querySelector(".home-header__bell");
      if (bell !== null) seen.add(bell.getAttribute("aria-label") ?? "");
      if (document.querySelector(".home-header__dot") !== null) seen.add("dot");
    });
    observer.observe(document.body, { attributes: true, childList: true, subtree: true });
    await renderApp("/inici");
    // The first read has landed (the rows show) while the resend is out: the bell stays quiet.
    await waitFor(() => {
      expect(document.querySelectorAll(".reservation-row, .activity-row").length).toBeGreaterThan(
        0,
      );
    });
    expect(count("POST", "/me/notifications/read-all")).toBe(1);
    expect(screen.getByRole("link", { name: "Avisos" })).toBeVisible();
    answer();
    // The resend answered (the marker is gone); the read that follows has not landed yet.
    await waitFor(() => {
      expect(homeReads).toBe(2);
    });
    await waitFor(() => {
      expect(
        Object.keys(sessionStorage).filter((key) => key.startsWith(READ_ALL_PENDING_KEY)),
      ).toEqual([]);
    });
    expect(screen.getByRole("link", { name: "Avisos" })).toBeVisible();
    reread();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByRole("link", { name: "Avisos" })).toBeVisible();
    observer.disconnect();
    expect([...seen].filter((label) => label !== "Avisos")).toEqual([]);
  });

  it("a card tapped before read-all has landed is marked read on its own", async () => {
    server.use(
      http.post("*/api/v1/me/notifications/read-all", async () => {
        await delay("infinite");
        return HttpResponse.json({ unreadCount: 0 });
      }),
    );
    await openFeed();
    fireEvent.click(newest("button", "CANVIA DE CLASSE"));
    await waitFor(() => {
      expect(count("POST", "/me/notifications/notification-n08a/read")).toBe(1);
    });
  });

  it("the empty state: «Encara no tens cap avís»", async () => {
    await renderApp("/notificacions", { scenario: "notificationsEmpty" });
    expect(await screen.findByText("Encara no tens cap avís")).toBeVisible();
    expect(screen.queryByRole("listitem")).toBeNull();
  });

  it("loads the second page when the list end shows (no page buttons)", async () => {
    await openFeed();
    expect(document.querySelectorAll(".notification-card")).toHaveLength(20);
    expect(screen.queryByRole("button", { name: /pàgina|següent/iu })).toBeNull();
    showListEnd();
    await waitFor(() => {
      expect(document.querySelectorAll(".notification-card")).toHaveLength(24);
    });
    expect(
      requests
        .filter((item) => item.path === "/api/v1/me/notifications")
        .map((item) => item.search),
    ).toEqual(["?page=0&size=20", "?page=1&size=20"]);
    expect(document.querySelector(".notifications-page__more")).toBeNull();
  });

  it("a failed read shows the error by its code, and [Torna-ho a provar] reads again", async () => {
    let calls = 0;
    server.use(
      http.get("*/api/v1/me/notifications", () => {
        calls += 1;
        if (calls > 1) return undefined;
        return HttpResponse.json(
          { code: "INTERNAL_ERROR", details: {}, message: "boom", traceId: "t" },
          { status: 500 },
        );
      }),
    );
    await renderApp("/notificacions");
    expect(await screen.findByRole("alert")).toHaveTextContent("S'ha produït un error inesperat.");
    expect(count("POST", "/me/notifications/read-all")).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Torna-ho a provar" }));
    expect(await screen.findByRole("link", { name: "En Rock puja de nivell!" })).toBeVisible();
    await waitFor(() => {
      expect(count("POST", "/me/notifications/read-all")).toBe(1);
    });
  });
});
