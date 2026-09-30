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

import {
  NotificationPreferencesBlock,
  PREFERENCES_OUTBOX_KEY,
} from "../messaging/NotificationPreferencesBlock";

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

/** Every `PUT` of the block, with its body and whether it outlives the page (`keepalive`). */
function recordPutRequests(): { body: unknown; keepalive: boolean }[] {
  const puts: { body: unknown; keepalive: boolean }[] = [];
  server.events.on("request:start", ({ request }) => {
    if (request.method !== "PUT") return;
    const entry = { body: undefined as unknown, keepalive: request.keepalive };
    puts.push(entry);
    void request
      .clone()
      .json()
      .then((body: unknown) => {
        entry.body = body;
      });
  });
  return puts;
}

/**
 * The block on its own, reading `GET /members/{id}/notification-preferences` (the mock's, or
 * `preferences` when given). `onSaved` stands for a successful save: the block's success feedback.
 */
async function renderBlock(preferences?: Preferences, onNavigate?: (path: string) => void) {
  mockScenario("admin");
  if (preferences !== undefined) {
    server.use(
      http.get("*/api/v1/members/:id/notification-preferences", () =>
        HttpResponse.json(preferences),
      ),
    );
  }
  const i18n = await createI18n({
    branding: canic,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-census", "errors"],
    storage: undefined,
  });
  const onSaved = vi.fn();
  const onFeedback = vi.fn((feedback: { message: string; tone: "danger" | "success" }) => {
    if (feedback.tone === "success") onSaved();
  });
  const view = render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={canic}>
        <NotificationPreferencesBlock
          client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
          memberId="member-laura"
          onFeedback={onFeedback}
          onNavigate={onNavigate}
        />
      </BrandingProvider>
    </I18nextProvider>,
  );
  await screen.findByLabelText("Recordatori de classe");
  return { onFeedback, onSaved, view };
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
  sessionStorage.removeItem(PREFERENCES_OUTBOX_KEY);
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
    const { onSaved } = await renderBlock(undefined, onNavigate);
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

  it("a full page load (how D10's links leave the record) sends the change still waiting for its 300 ms, with keepalive", async () => {
    const puts = recordPutRequests();
    await renderBlock();
    // The debounce's timer belongs to a fake clock that is dropped at once: it never fires, so
    // only the page being left can send the change.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fireEvent.click(screen.getByRole("switch", { name: "Correu: Comunicats personals" }));
    vi.useRealTimers();
    window.dispatchEvent(new Event("pagehide"));
    await waitFor(() => {
      expect(puts).toEqual([{ body: { emailByCategory: { PERSONAL: false } }, keepalive: true }]);
    });
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

  it("E7-W01 round 2 #4: the block reads its own route, GET /members/{id}/notification-preferences", async () => {
    const lines: string[] = [];
    server.events.on("request:start", ({ request }) => {
      lines.push(`${request.method} ${new URL(request.url).pathname}`);
    });
    await renderBlock();
    expect(lines).toContain("GET /api/v1/members/member-laura/notification-preferences");
    expect(screen.getByRole("switch", { name: "Correu: Comunicats personals" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("E7-W01 round 2 #4: a failed read says so with [Torna-ho a provar], and the block stays", async () => {
    let calls = 0;
    server.use(
      http.get("*/api/v1/members/:id/notification-preferences", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json(
              { code: "INTERNAL_ERROR", details: {}, message: "boom", traceId: "t" },
              { status: 500 },
            )
          : undefined;
      }),
    );
    mockScenario("admin");
    const i18n = await createI18n({
      branding: canic,
      browserLanguages: ["ca"],
      initialNamespaces: ["admin-census", "errors"],
      storage: undefined,
    });
    render(
      <I18nextProvider i18n={i18n}>
        <BrandingProvider branding={canic}>
          <NotificationPreferencesBlock
            client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
            memberId="member-laura"
            onFeedback={() => undefined}
          />
        </BrandingProvider>
      </I18nextProvider>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No s'han pogut carregar les preferències d'avisos.",
    );
    expect(
      screen.getByRole("heading", { name: "Preferències d'avisos (mantenibles aquí i al perfil)" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Torna-ho a provar" }));
    expect(await screen.findByLabelText("Recordatori de classe")).toBeVisible();
    expect(calls).toBe(2);
  });

  it("E7-W01 round 2 #5: leaving the page sends every unsaved change with keepalive — the one on its way too — and the next visit sends it again", async () => {
    let release: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held = false;
    server.use(
      http.put("*/api/v1/members/:id/notification-preferences", async ({ request }) => {
        // The page is gone before the keepalive request is answered: here it is lost.
        if (request.keepalive) return HttpResponse.error();
        if (!held) {
          held = true;
          await answered;
        }
        return undefined;
      }),
    );
    const puts = recordPutRequests();
    await renderBlock();
    fireEvent.click(
      screen.getByRole("switch", {
        name: "Correu: Operativa (reserves i canvis fets per l'abonat)",
      }),
    );
    // Its save is on its way (held); another change waits for its 300 ms.
    await waitFor(() => {
      expect(puts).toHaveLength(1);
    });
    fireEvent.click(screen.getByRole("switch", { name: "Correu: Comunicats personals" }));
    window.dispatchEvent(new Event("pagehide"));
    await waitFor(() => {
      expect(puts).toHaveLength(2);
    });
    const unsaved = { emailByCategory: { OPERATIONAL: true, PERSONAL: false } };
    await waitFor(() => {
      expect(puts[1]).toEqual({ body: unsaved, keepalive: true });
    });
    expect(JSON.parse(sessionStorage.getItem(PREFERENCES_OUTBOX_KEY) ?? "null")).toMatchObject({
      memberId: "member-laura",
      patch: unsaved,
    });
    cleanup();
    release();
    // The next visit of the record sends it again and shows it.
    await renderBlock();
    await waitFor(() => {
      expect(
        puts.some((put) => !put.keepalive && JSON.stringify(put.body) === JSON.stringify(unsaved)),
      ).toBe(true);
    });
    await waitFor(() => {
      expect(sessionStorage.getItem(PREFERENCES_OUTBOX_KEY)).toBeNull();
    });
    expect(
      screen.getByRole("switch", {
        name: "Correu: Operativa (reserves i canvis fets per l'abonat)",
      }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Correu: Comunicats personals" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("without SMS and PUSH (the api's `modules`): no «+SMS» and no push toggle", async () => {
    await renderBlock({ ...PREFERENCES, modules: { push: false, sms: false } });
    expect(screen.queryByText("+SMS")).toBeNull();
    expect(screen.queryByText("Notificacions push de comunicats del club")).toBeNull();
  });
});
