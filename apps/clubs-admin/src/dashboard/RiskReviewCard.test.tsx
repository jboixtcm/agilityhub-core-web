import { createApiClient } from "@agilityhub/api-client";
import {
  JOBS_MOCK_NOW,
  mockScenario,
  type MockScenario,
  resetPlanningState,
} from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CalendarPage } from "../planning/CalendarPage";

import { RiskReviewCard } from "./RiskReviewCard";

const branding: Branding = {
  ...brandingCanicFixture,
  locales: ["ca", "es", "en"],
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
// Monday 10 August 2026 at 8:12 in the club (the S15 §6 example day).
beforeEach(() => {
  vi.useFakeTimers({ now: new Date(JOBS_MOCK_NOW), shouldAdvanceTime: true, toFake: ["Date"] });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.useRealTimers();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

async function renderCard(scenario: MockScenario = "admin", language = "ca") {
  mockScenario(scenario);
  const i18n = await createI18n({
    branding,
    browserLanguages: [language],
    initialNamespaces: ["admin-dashboard", "errors"],
    storage: undefined,
  });
  const onNavigate = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <RiskReviewCard
          client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
          onNavigate={onNavigate}
        />
      </BrandingProvider>
    </I18nextProvider>,
  );
  await screen.findByRole("heading", { level: 2 });
  return onNavigate;
}

function rowTexts(): (string | null)[] {
  return [...document.querySelectorAll(".dashboard-risk__row")].map((row) => row.textContent);
}

describe("T-15-33 D1 «Revisió de classes en risc» from S15 §6 form A", () => {
  it("renders the four statuses with the mockup's exact literals and «4 avisos»", async () => {
    await renderCard();
    expect(
      screen.getByRole("heading", {
        name: /Revisió de classes en risc — 7:30, avui i 2 dies vista/u,
      }),
    ).toBeVisible();
    expect(screen.getByText("4 avisos")).toHaveClass("ah-badge");
    expect(rowTexts()).toEqual([
      "Cadells · avui 9:30 · Cadells0 inscritsanul·lada",
      "Nivell D · avui 17:40 · Petita1 inscritanul·lada · avisada Laura + Duna",
      "F i G · demà 20:00 · Carretera1 inscriten risc · avisats Pau + Blat",
      "Cadells · dc 9:30 · Cadells0 inscritss'anul·larà dc a les 7:30",
    ]);
  });

  it("WILL_REVIEW (`autoCancelSameDay = false`) reads «el club decidirà»", async () => {
    server.use(
      http.get("*/api/v1/risk-review", () =>
        HttpResponse.json({
          autoCancelSameDay: false,
          date: "2026-08-10",
          items: [
            {
              bookedCount: 1,
              cancelledAt: null,
              classId: "41000000-0000-4000-8000-000000000006",
              date: "2026-08-10",
              dayLabel: "TODAY",
              displayDescription: "B+C",
              notified: [],
              reviewAt: "2026-08-10T05:30:00Z",
              ringName: "Central",
              startTime: "18:50",
              status: "WILL_REVIEW",
            },
          ],
          lookaheadDays: 2,
          minDogs: 2,
          reviewTime: "07:30",
        }),
      ),
    );
    await renderCard();
    expect(rowTexts()).toEqual(["B+C · avui 18:50 · Central1 inscritel club decidirà"]);
  });

  it("opens D4 on the class's week with the class selected (a cancelled one under «Anul·lades»)", async () => {
    const onNavigate = await renderCard();
    const cancelled = screen.getByRole("link", { name: "Cadells · avui 9:30 · Cadells" });
    // The calendar world's classes of the example day (round 2: D4 finds and selects them).
    const target =
      "/calendari?classe=cls-2026-08-10-0930-7&estat=anul%C2%B7lades&setmana=2026-08-10";
    expect(cancelled).toHaveAttribute("href", target);
    fireEvent.click(cancelled);
    expect(onNavigate).toHaveBeenLastCalledWith(target);
    fireEvent.click(screen.getByRole("link", { name: "Cadells · dc 9:30 · Cadells" }));
    expect(onNavigate).toHaveBeenLastCalledWith(
      "/calendari?classe=cls-2026-08-12-0930-0&estat=actives&setmana=2026-08-10",
    );
  });

  it("says «Cap classe en risc» when the api lists none", async () => {
    await renderCard("riskReviewEmpty");
    expect(screen.getByText("Cap classe en risc")).toBeVisible();
    expect(screen.getByText("0 avisos")).toBeVisible();
  });

  it("an error shows its message and a retry", async () => {
    server.use(
      http.get("*/api/v1/risk-review", () =>
        HttpResponse.json(
          { code: "FORBIDDEN", details: {}, message: "Forbidden", traceId: "t" },
          { status: 403 },
        ),
      ),
    );
    mockScenario("admin");
    const i18n = await createI18n({
      branding,
      browserLanguages: ["ca"],
      initialNamespaces: ["admin-dashboard", "errors"],
      storage: undefined,
    });
    render(
      <I18nextProvider i18n={i18n}>
        <BrandingProvider branding={branding}>
          <RiskReviewCard
            client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
            onNavigate={vi.fn()}
          />
        </BrandingProvider>
      </I18nextProvider>,
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No teniu permís per fer aquesta acció.");
    server.resetHandlers();
    fireEvent.click(within(alert).getByRole("button", { name: "Torna-ho a provar" }));
    expect(await screen.findByText("4 avisos")).toBeVisible();
  });
});

describe("T-15-33 E5-W03 round 2 · review #5: a D1 row opens D4 on that class (the example day's calendar world)", () => {
  beforeEach(() => {
    // The calendar world drawn on the example day holds the review's classes.
    resetPlanningState();
  });
  afterEach(() => {
    vi.useRealTimers();
    resetPlanningState();
  });

  it.each([
    ["Cadells · avui 9:30 · Cadells", "anul·lades", /dl 10 · 9:30 · Cadells/u, null],
    ["Nivell D · avui 17:40 · Petita", "anul·lades", /dl 10 · 17:40 · Nivell D/u, "Laura + Duna"],
    ["F i G · demà 20:00 · Carretera", "actives", /dt 11 · 20:00 · F i G/u, "Pau + Blat"],
    ["Cadells · dc 9:30 · Cadells", "actives", /dc 12 · 9:30 · Cadells/u, null],
  ])("«%s» → D4 «%s», that week, that class selected", async (row, filter, card, notified) => {
    const onNavigate = await renderCard();
    fireEvent.click(screen.getByRole("link", { name: row }));
    const path: unknown = onNavigate.mock.lastCall?.[0];
    if (typeof path !== "string") throw new TypeError("No navigation");
    cleanup();

    window.history.replaceState(null, "", path);
    const i18n = await createI18n({
      branding,
      browserLanguages: ["ca"],
      initialNamespaces: ["admin-scheduling", "enums", "errors"],
      storage: undefined,
    });
    render(
      <I18nextProvider i18n={i18n}>
        <BrandingProvider branding={branding}>
          <CalendarPage
            client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
            onNavigate={vi.fn()}
            readOnly={false}
          />
        </BrandingProvider>
      </I18nextProvider>,
    );
    await screen.findByRole("table", { name: /del 10 al 16 d.agost$/u });
    expect(
      screen.getByRole("button", { name: filter === "actives" ? "Actives" : "Anul·lades" }),
    ).toHaveAttribute("aria-pressed", "true");
    const selected = await screen.findByRole("region", { name: /^Classe seleccionada/u });
    expect(selected).toHaveTextContent(card);
    // The members D1 says were notified are that class's registrants in D4.
    if (notified !== null) expect(await within(selected).findByText(notified)).toBeVisible();
  });
});

describe("T-15-34 the risk card in es and en, and in club-local time on a device in another zone", () => {
  it.each([
    [
      "es",
      "Cadells · mié 9:30 · Cadells0 inscritosse anulará mié a las 7:30",
      "F i G · mañana 20:00 · Carretera1 inscritoen riesgo · avisados Pau + Blat",
    ],
    [
      "en",
      "Cadells · Wed 9:30 · Cadells0 bookedwill be cancelled Wed at 7:30",
      "F i G · tomorrow 20:00 · Carretera1 bookedat risk · notified Pau + Blat",
    ],
  ])("renders the statuses in %s", async (language, willCancel, atRisk) => {
    await renderCard("admin", language);
    const rows = rowTexts();
    expect(rows).toContain(willCancel);
    expect(rows).toContain(atRisk);
  });

  it("reads `reviewAt` in the club's zone (Europe/Madrid), not the device's (America/Bogota)", async () => {
    const deviceZone = process.env.TZ;
    process.env.TZ = "America/Bogota";
    try {
      // 05:30Z is 00:30 in Bogotá and 7:30 in Madrid.
      expect(new Date("2026-08-12T05:30:00Z").getHours()).toBe(0);
      await renderCard();
      expect(screen.getByText("s'anul·larà dc a les 7:30")).toBeVisible();
      expect(screen.queryByText(/a les 0:30/u)).toBeNull();
    } finally {
      process.env.TZ = deviceZone;
    }
  });
});
