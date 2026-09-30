import { createApiClient, type components } from "@agilityhub/api-client";
import { mockScenario, resetCensusRecordState } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { NotificationPreferencesBlock } from "../messaging/NotificationPreferencesBlock";

type Preferences = components["schemas"]["NotificationPreferences"];

const canic: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

const PREFERENCES: Preferences = {
  availableLocales: ["ca", "es"],
  emailByCategory: { CLUB_CHANGES: true, CLUB_NEWS: true, OPERATIONAL: false, PERSONAL: true },
  locale: "ca",
  modules: { push: true, sms: true },
  pushClubNews: true,
  reminderMinutesBefore: null,
  reminderOptionsMinutes: [60, 120, 240, 360, 720, 1440],
  smsFixed: true,
};

/** Every `PUT` of the block, with its body. */
function recordPuts(): unknown[] {
  const bodies: unknown[] = [];
  server.events.on("request:start", ({ request }) => {
    if (request.method !== "PUT") return;
    void request
      .clone()
      .json()
      .then((body: unknown) => bodies.push(body));
  });
  return bodies;
}

async function renderBlock(
  preferences: Preferences = PREFERENCES,
  onNavigate?: (path: string) => void,
) {
  mockScenario("admin");
  const i18n = await createI18n({
    branding: canic,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-census", "errors"],
    storage: undefined,
  });
  const onFeedback = vi.fn();
  const onSaved = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={canic}>
        <NotificationPreferencesBlock
          client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
          memberId="member-laura"
          onFeedback={onFeedback}
          onNavigate={onNavigate}
          onSaved={onSaved}
          preferences={preferences}
        />
      </BrandingProvider>
    </I18nextProvider>,
  );
  return { onFeedback, onSaved };
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  server.events.removeAllListeners();
  server.resetHandlers();
  resetCensusRecordState();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

describe("T-11-38 D10 «Preferències d'avisos» (S11 §2, R-11-04)", () => {
  it("renders D10's wording: the four categories (the fourth CLUB_NEWS row), the App tick always on, «+SMS», the reminder «Mai» with the six options, the push toggle and «Avisos enviats ›»", async () => {
    await renderBlock();
    expect(
      screen.getByRole("heading", { name: "Preferències d'avisos (mantenibles aquí i al perfil)" }),
    ).toBeVisible();
    expect(
      [
        ...document.querySelectorAll(
          ".census-record__preference-row > span:first-child, .census-record__preference-row > label",
        ),
      ].map((row) => row.textContent),
    ).toEqual([
      "Operativa (reserves i canvis fets per l'abonat)",
      "Comunicats personals",
      "Canvis en reserves (fets pel club)",
      "Comunicats del club",
      "Recordatori de classe",
      "Notificacions push de comunicats del club",
    ]);
    expect(screen.getAllByRole("img", { name: "Sempre actiu a l'app" })).toHaveLength(4);
    expect(screen.getByText("+SMS")).toBeVisible();
    expect(screen.getByRole("switch", { name: "Correu: Comunicats del club" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    const reminder = screen.getByLabelText<HTMLSelectElement>("Recordatori de classe");
    expect([...reminder.options].map((option) => option.textContent)).toEqual([
      "Mai",
      "1 h abans",
      "2 h abans",
      "4 h abans",
      "6 h abans",
      "12 h abans",
      "24 h abans",
    ]);
    expect(screen.getByRole("link", { name: "Avisos enviats ›" })).toHaveAttribute(
      "href",
      "/notificacions?filter=memberId%3Aeq%3Amember-laura",
    );
  });

  it("each change shows at once and the changes of 300 ms travel as one partial PUT", async () => {
    const puts = recordPuts();
    const { onSaved } = await renderBlock();
    fireEvent.click(
      screen.getByRole("switch", {
        name: "Correu: Operativa (reserves i canvis fets per l'abonat)",
      }),
    );
    fireEvent.change(screen.getByLabelText("Recordatori de classe"), { target: { value: "120" } });
    expect(
      screen.getByRole("switch", {
        name: "Correu: Operativa (reserves i canvis fets per l'abonat)",
      }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Recordatori de classe")).toHaveValue("120");
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(1);
    });
    expect(puts).toEqual([{ emailByCategory: { OPERATIONAL: true }, reminderMinutesBefore: 120 }]);
    expect(screen.getByLabelText("Recordatori de classe")).toHaveValue("120");
  });

  it("«Avisos enviats ›» right after a change: the change is saved (and answered) before the log opens", async () => {
    const puts = recordPuts();
    const order: string[] = [];
    const onNavigate = vi.fn((path: string) => {
      order.push(`navigate ${path}`);
    });
    const { onSaved } = await renderBlock(PREFERENCES, onNavigate);
    onSaved.mockImplementation(() => {
      order.push("saved");
    });
    fireEvent.click(screen.getByRole("switch", { name: "Correu: Comunicats personals" }));
    fireEvent.click(screen.getByRole("link", { name: "Avisos enviats ›" }));
    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledTimes(1);
    });
    expect(order).toEqual(["saved", "navigate /notificacions?filter=memberId%3Aeq%3Amember-laura"]);
    expect(puts).toEqual([{ emailByCategory: { PERSONAL: false } }]);
  });

  it("a full page load (how D10's links leave the record) sends the change still waiting for its 300 ms", async () => {
    const puts = recordPuts();
    const { onSaved } = await renderBlock();
    // The debounce's timer belongs to a fake clock that is dropped at once: it never fires, so
    // only the page being left can send the change.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fireEvent.click(screen.getByRole("switch", { name: "Correu: Comunicats personals" }));
    vi.useRealTimers();
    window.dispatchEvent(new Event("pagehide"));
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(1);
    });
    expect(puts).toEqual([{ emailByCategory: { PERSONAL: false } }]);
  });

  it("a refused save (422 INVALID_REMINDER_OPTION) puts back what the api holds and says why", async () => {
    server.use(
      http.put("*/api/v1/members/:id/notification-preferences", () =>
        HttpResponse.json(
          { code: "INVALID_REMINDER_OPTION", details: {}, message: "Invalid", traceId: "t" },
          { status: 422 },
        ),
      ),
    );
    const { onFeedback } = await renderBlock();
    fireEvent.change(screen.getByLabelText("Recordatori de classe"), { target: { value: "240" } });
    expect(screen.getByLabelText("Recordatori de classe")).toHaveValue("240");
    await waitFor(() => {
      expect(onFeedback).toHaveBeenCalledWith({
        message: "L'opció de recordatori no és vàlida.",
        tone: "danger",
      });
    });
    expect(screen.getByLabelText("Recordatori de classe")).toHaveValue("");
  });

  it("without SMS and PUSH (the api's `modules`): no «+SMS» and no push toggle", async () => {
    await renderBlock({ ...PREFERENCES, modules: { push: false, sms: false } });
    expect(screen.queryByText("+SMS")).toBeNull();
    expect(screen.queryByText("Notificacions push de comunicats del club")).toBeNull();
  });
});
