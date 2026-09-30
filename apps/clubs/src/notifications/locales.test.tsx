import {
  mockScenario,
  NOTIFICATIONS_MOCK_NOW,
  resetActivityState,
  resetBookingMockState,
  resetNotificationMockState,
} from "@agilityhub/api-client/mocks";
import { server } from "@agilityhub/api-client/mocks/server";
import { cleanup, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { canic, renderApp, without } from "../booking/test-utils";

import { PUSH_SUBSCRIPTION_STORAGE_KEY, setPushRegistration } from "./push";

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
});
afterEach(async () => {
  cleanup();
  await new Promise((resolve) => {
    setTimeout(resolve, 20);
  });
  server.resetHandlers();
  setPushRegistration(undefined);
  vi.unstubAllGlobals();
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, "serviceWorker");
  localStorage.removeItem(PUSH_SUBSCRIPTION_STORAGE_KEY);
  resetBookingMockState();
  resetActivityState();
  resetNotificationMockState();
  mockScenario("member");
});
afterAll(() => {
  server.close();
});

/** A browser with web push whose permission was refused before this visit. */
function browserThatRefused() {
  vi.stubGlobal("PushManager", {});
  vi.stubGlobal("Notification", {
    permission: "denied",
    requestPermission: vi.fn(() => Promise.resolve("denied")),
  });
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: {} });
  setPushRegistration({ pushManager: {} } as unknown as ServiceWorkerRegistration);
}

const CASES = [
  {
    changeClass: "CAMBIA DE CLASE",
    claim: "COGE LA PLAZA",
    feedTitle: "Notificaciones",
    locale: "es",
    firstMeta: "hace 2 min · y por SMS",
    firstMetaNoSms: "hace 2 min",
    never: "Nunca",
    oneHour: "1 h antes",
    operational: "Operativa (reservas y cambios que has hecho tú)",
    profileTitle: "Mi perfil",
    pushDenied: "Activa las notificaciones en el navegador para recibirlas en el móvil",
    unsubscribed: "Ya no recibirás los comunicados del club por correo.",
    unsubscribeInvalid: "Este enlace ya no es válido.",
  },
  {
    changeClass: "CHANGE CLASS",
    claim: "TAKE THE SPOT",
    feedTitle: "Notifications",
    locale: "en",
    firstMeta: "2 min ago · and by SMS",
    firstMetaNoSms: "2 min ago",
    never: "Never",
    oneHour: "1 h before",
    operational: "Operational (bookings and changes you made)",
    profileTitle: "My profile",
    pushDenied: "Allow notifications in your browser to receive them on your phone",
    unsubscribed: "You will no longer receive the club's announcements by email.",
    unsubscribeInvalid: "This link is no longer valid.",
  },
] as const;

const meta = (index: number) =>
  document.querySelectorAll(".notification-card__meta")[index]?.textContent ?? "";

describe("E7-W02 round 2 #6 · screens 11, 12 and the unsubscribe page in es and en (Definition of Done)", () => {
  it.each(CASES)(
    "E7-W02 round 2 #6 ($locale): the feed, its actions and a club without SMS",
    async (literal) => {
      await renderApp("/notificacions", { locale: literal.locale });
      expect(
        await screen.findByRole("heading", { level: 1, name: literal.feedTitle }),
      ).toBeVisible();
      await screen.findAllByRole("listitem");
      expect(meta(0)).toBe(literal.firstMeta);
      expect(screen.getAllByRole("button", { name: literal.changeClass }).length).toBeGreaterThan(
        0,
      );
      expect(screen.getAllByRole("button", { name: literal.claim }).length).toBeGreaterThan(0);
      expect(document.body.textContent).not.toMatch(/notifications:|common:|errors:/u);
      // R-11-17, module off: no SMS mark in either language.
      cleanup();
      resetNotificationMockState();
      await renderApp("/notificacions", {
        branding: { ...canic, modules: without("SMS") },
        locale: literal.locale,
      });
      await screen.findAllByRole("listitem");
      expect(meta(0)).toBe(literal.firstMetaNoSms);
    },
  );

  it.each(CASES)(
    "E7-W02 round 2 #6 ($locale): 12's «Avisos», the reminder options and a refused permission",
    async (literal) => {
      browserThatRefused();
      await renderApp("/perfil", { locale: literal.locale });
      expect(
        await screen.findByRole("heading", { level: 1, name: literal.profileTitle }),
      ).toBeVisible();
      expect(await screen.findByText(literal.operational)).toBeVisible();
      const options = [...document.querySelectorAll("#profile-reminder option")].map(
        (option) => option.textContent,
      );
      expect(options.slice(0, 2)).toEqual([literal.never, literal.oneHour]);
      expect(screen.getByText(literal.pushDenied)).toBeVisible();
      expect(document.body.textContent).not.toMatch(/auth:|profile\./u);
    },
  );

  it.each(CASES)(
    "E7-W02 round 2 #6 ($locale): the e-mail unsubscribe page, valid and expired",
    async (literal) => {
      await renderApp("/comunicats/baixa?t=mock-unsubscribe-valid", { locale: literal.locale });
      expect(await screen.findByText(literal.unsubscribed)).toBeVisible();
      cleanup();
      await renderApp("/comunicats/baixa?t=mock-unsubscribe-expired", { locale: literal.locale });
      expect(await screen.findByText(literal.unsubscribeInvalid)).toBeVisible();
    },
  );
});
