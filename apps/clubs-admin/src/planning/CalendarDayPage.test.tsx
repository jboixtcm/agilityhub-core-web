import { createApiClient } from "@agilityhub/api-client";
import {
  mockScenario,
  planningState,
  resetCatalogState,
  resetPlanningState,
} from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, render, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { DayGrid } from "./calendar-shared";
import { CalendarDayPage } from "./CalendarDayPage";

const branding: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};
const DATE = "2026-08-12";

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  vi.useFakeTimers({
    now: new Date("2026-08-12T08:00:00Z"),
    shouldAdvanceTime: true,
    toFake: ["Date"],
  });
  resetCatalogState();
  resetPlanningState();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.useRealTimers();
  resetPlanningState();
  resetCatalogState();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

async function renderDay() {
  window.history.replaceState(null, "", `/calendari/dia/${DATE}?estat=actives`);
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-scheduling", "enums", "errors"],
    storage: undefined,
  });
  const client = createApiClient({
    baseUrl: `${window.location.origin}/api/v1`,
    getLocale: () => "ca",
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <CalendarDayPage client={client} date={DATE} onNavigate={vi.fn()} />
      </BrandingProvider>
    </I18nextProvider>,
  );
}

async function columnHeaders(): Promise<string[]> {
  const table = await screen.findByRole("table");
  return within(table)
    .getAllByRole("columnheader")
    .map((header) => header.textContent);
}

/** Form D as the api sends it: the ring columns in catalog order, then its «Sense» column. */
const formD: DayGrid = {
  columns: [
    {
      activeSetupId: null,
      color: "var(--ah-color-primary)",
      name: "Central",
      ringId: "ring-central",
      shortName: "Central",
    },
    { color: "var(--ah-color-border)", name: "Sense pista", ringId: null, shortName: "Sense" },
  ],
  date: DATE,
  dayOfWeek: "WEDNESDAY",
  rows: [
    {
      cells: [
        {
          classId: "cls-day-1",
          description: "B+C",
          endTime: "19:50",
          instructorName: "Marc",
          kind: "CLASS",
          occupancy: { booked: 4, capacity: 5 },
          ringId: "ring-central",
          state: "ACTIVE",
        },
        {
          classId: "cls-day-2",
          description: "Cadells",
          endTime: "19:50",
          instructorName: "Laura",
          kind: "CLASS",
          occupancy: { booked: 2, capacity: 5 },
          ringId: null,
          state: "ACTIVE",
        },
      ],
      time: "18:50",
    },
  ],
  timeZone: "Europe/Madrid",
  view: "INSTRUCTOR",
};

describe("T-06-28 D4 day view (/calendari/dia/:date, form D)", () => {
  it("takes the api's «Sense» column as delivered and never adds its own", async () => {
    server.use(http.get("*/api/v1/day-grid", () => HttpResponse.json(formD)));
    await renderDay();

    expect(await columnHeaders()).toEqual(["Central", "Sense"]);
    const table = screen.getByRole("table");
    expect(within(table).getByText("Cadells")).toBeVisible();
    expect(within(table).getByText("B+C")).toBeVisible();
  });

  it("shows exactly one «Sense» column for a ringless class of the stateful mock", async () => {
    planningState.sessions = planningState.sessions.map((session) =>
      session.id === "cls-2026-08-12-1850-0" ? { ...session, ringId: null } : session,
    );
    await renderDay();

    // The mock answers like the api: its «Sense» column goes last, in the reader's language.
    expect(await columnHeaders()).toEqual([
      "Muntanya",
      "Central",
      "Carretera",
      "Cadells",
      "Petita",
      "Sense",
    ]);
  });
});
