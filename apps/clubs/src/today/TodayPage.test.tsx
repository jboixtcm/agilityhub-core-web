import { createApiClient } from "@agilityhub/api-client";
import { mockScenario, resetPlanningState } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { TodayPage } from "./TodayPage";
import { clubToday, useDayGrid } from "./useDayGrid";

const branding: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};
const riskText =
  "Aquesta classe només té un alumne: si ningú més s'hi apunta abans de les 7:30 de dimarts, s'anul·larà.";

const requestedDates: string[] = [];

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  server.events.on("request:start", ({ request }) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/day-grid")) {
      requestedDates.push(
        `${url.searchParams.get("date") ?? ""}|${url.searchParams.get("view") ?? ""}`,
      );
    }
  });
});
beforeEach(() => {
  mockScenario("member");
  resetPlanningState();
  requestedDates.length = 0;
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.useRealTimers();
  window.history.replaceState(null, "", "/");
});
afterAll(() => {
  server.close();
});

async function renderToday(path = "/avui?date=2026-08-04", runtimeBranding: Branding = branding) {
  window.history.replaceState(null, "", path);
  const i18n = await createI18n({
    branding: runtimeBranding,
    browserLanguages: ["ca"],
    initialNamespaces: ["home", "enums", "instructor", "errors"],
    storage: undefined,
  });
  const client = createApiClient({
    baseUrl: `${window.location.origin}/api/v1`,
    getLocale: () => "ca",
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={runtimeBranding}>
        <TodayPage client={client} />
      </BrandingProvider>
    </I18nextProvider>,
  );
}

describe("T-06-29 screen 10 «Classes del dia»", () => {
  it("draws the mockup grid with identical ring columns, the date header and the week chips", async () => {
    await renderToday();

    const grid = await screen.findByRole("table", { name: "Quadre del dia" });
    expect(getComputedStyle(grid).gridTemplateColumns).toBe(
      "var(--ah-day-grid-time, 2.25rem) repeat(5, minmax(0, 1fr))",
    );
    expect(
      within(grid)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Hora", "MUN", "CEN", "CAR", "CAD", "PET"]);
    expect(
      within(grid)
        .getAllByRole("rowheader")
        .map((row) => row.textContent),
    ).toEqual(["8:30", "9:30", "17:40", "18:50", "20:00"]);
    expect(screen.getByRole("heading", { level: 1, name: "Classes del dia" })).toBeVisible();
    expect(screen.getByText("dt 4 d’agost")).toBeVisible();
    expect(
      within(screen.getByRole("group", { name: "Dies de la setmana" }))
        .getAllByRole("button")
        .map((chip) => chip.textContent),
    ).toEqual(["dl 3", "dt 4", "dc 5", "dj 6", "dv 7", "ds 8"]);
    expect(screen.getByRole("button", { name: "dt 4" })).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByText("Ocupada = pista reservada per a entrenament o bloquejada"),
    ).toBeVisible();
  });

  it("renders «Ocupada» + generic reason in grey without background and never a count", async () => {
    await renderToday();
    await screen.findByRole("table", { name: "Quadre del dia" });

    const occupied = screen
      .getAllByText("Ocupada")
      .map((node) => node.closest(".ah-schedule-cell"));
    expect(occupied).toHaveLength(3);
    for (const cell of occupied) {
      expect(cell).toHaveClass("ah-schedule-cell--plain");
      expect((cell as HTMLElement).style.getPropertyValue("--schedule-color")).toBe("");
    }
    expect(screen.getByText("manteniment").closest(".ah-schedule-cell")).toHaveClass(
      "ah-schedule-cell--dashed",
    );
    expect(screen.getAllByText("entren.")).toHaveLength(2);
    expect(screen.getByText("Teràpia").closest(".ah-schedule-cell")).toHaveTextContent(
      /^TeràpiaEstel$/u,
    );
    expect(screen.queryByText(/\d+\/\d+/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/1 g/u)).not.toBeInTheDocument();
    expect(screen.queryByText("Pau + Blat")).not.toBeInTheDocument();
  });

  it("opens the risk balloon with the api riskText on tap and closes it on a second tap or elsewhere", async () => {
    await renderToday();
    const risky = await screen.findByRole("button", { name: /D i sup\./u });
    expect(risky).toHaveClass("ah-schedule-cell--warning");
    expect(within(risky).getByText("en risc ⚠")).toBeVisible();
    expect(screen.getAllByRole("button", { name: /i sup\.|B\+C|A\+B|Cadells/u })).toHaveLength(1);

    fireEvent.click(risky);
    expect(screen.getByRole("status")).toHaveTextContent(riskText);
    fireEvent.pointerDown(risky);
    fireEvent.click(risky);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    fireEvent.click(risky);
    expect(screen.getByRole("status")).toHaveTextContent(riskText);
    fireEvent.pointerDown(screen.getByRole("heading", { name: "Classes del dia" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("uses the club's today (Europe/Madrid) whatever the device time zone", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-03T23:30:00Z"));
    expect(clubToday("Europe/Madrid")).toBe("2026-08-04");
    expect(clubToday("America/Bogota")).toBe("2026-08-03");
    const deviceZone = process.env.TZ;
    process.env.TZ = "America/Bogota";
    try {
      expect(new Date().getDate()).toBe(3);
      await renderToday("/avui");
      await screen.findByRole("table", { name: "Quadre del dia" });
      expect(requestedDates).toEqual(["2026-08-04|member"]);
      expect(screen.getByText("dt 4 d’agost")).toBeVisible();
    } finally {
      process.env.TZ = deviceZone;
    }
  });

  it("never shows a count in the member view even when a cell carries occupancy", async () => {
    server.use(
      http.get("*/api/v1/day-grid", () =>
        HttpResponse.json({
          columns: [
            {
              color: "var(--ah-color-info)",
              name: "Petita",
              ringId: "ring-petita",
              shortName: "PET",
            },
          ],
          date: "2026-08-04",
          dayOfWeek: "TUESDAY",
          rows: [
            {
              cells: [
                {
                  classId: "cls-therapy",
                  description: "Teràpia",
                  endTime: "18:40",
                  instructorName: "Estel",
                  kind: "CLASS",
                  occupancy: { booked: 1, capacity: 1, waiting: 3 },
                  ringId: "ring-petita",
                  state: "ACTIVE",
                },
              ],
              time: "17:40",
            },
          ],
          timeZone: "Europe/Madrid",
          view: "MEMBER",
        }),
      ),
    );
    await renderToday();
    await screen.findByText("Teràpia");

    expect(screen.getByText("Estel")).toBeVisible();
    expect(screen.queryByText(/1\/1/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/\+3/u)).not.toBeInTheDocument();
  });

  it("moves by chips and arrows (Sunday only by the arrows) and keeps ?date in the address", async () => {
    await renderToday("/avui?date=2026-08-08");
    await screen.findByText("ds 8 d’agost");
    await screen.findByText("Cap classe aquest dia");

    fireEvent.click(screen.getByRole("button", { name: "Dia següent" }));
    expect(await screen.findByText("dg 9 d’agost")).toBeVisible();
    expect(
      within(screen.getByRole("group", { name: "Dies de la setmana" }))
        .getAllByRole("button")
        .map((chip) => chip.textContent),
    ).toEqual(["dl 3", "dt 4", "dc 5", "dj 6", "dv 7", "ds 8"]);
    expect(
      screen.queryByRole("button", { name: /^d[a-z] \d$/u, pressed: true }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "dc 5" }));
    expect(await screen.findByText("Cap classe aquest dia")).toBeVisible();
    expect(window.location.search).toBe("?date=2026-08-05");
    fireEvent.click(screen.getByRole("button", { name: "Dia anterior" }));
    await screen.findByText("dt 4 d’agost");
    expect(requestedDates).toEqual([
      "2026-08-08|member",
      "2026-08-09|member",
      "2026-08-05|member",
      "2026-08-04|member",
    ]);
  });

  it("shows the api «Sense» column as delivered and the activity cell", async () => {
    await renderToday("/avui?date=2026-08-06");
    const grid = await screen.findByRole("table", { name: "Quadre del dia" });

    expect(
      within(grid)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Hora", "MUN", "CEN", "CAR", "CAD", "PET", "Sense"]);
    expect(within(grid).getByText("Activitat · Taller d'iniciació")).toBeVisible();
    expect(within(grid).getByText("Obediència")).toBeVisible();
  });

  it("never adds a «Sense» column of its own when the api does not send one", async () => {
    server.use(
      http.get("*/api/v1/day-grid", () =>
        HttpResponse.json({
          columns: [
            {
              color: "var(--ah-color-info)",
              name: "Petita",
              ringId: "ring-petita",
              shortName: "PET",
            },
          ],
          date: "2026-08-04",
          dayOfWeek: "TUESDAY",
          rows: [
            {
              cells: [
                {
                  classId: "cls-a",
                  description: "A+B",
                  endTime: "11:00",
                  kind: "CLASS",
                  ringId: "ring-petita",
                },
                {
                  classId: "cls-b",
                  description: "Obediència",
                  endTime: "11:00",
                  kind: "CLASS",
                  ringId: null,
                },
              ],
              time: "10:00",
            },
          ],
          timeZone: "Europe/Madrid",
          view: "MEMBER",
        }),
      ),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await renderToday();
    const grid = await screen.findByRole("table", { name: "Quadre del dia" });

    expect(
      within(grid)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Hora", "PET"]);
    expect(within(grid).getByText("A+B")).toBeVisible();
    expect(screen.queryByText("Sense")).not.toBeInTheDocument();
    // Intended: a cell whose ring matches no column («Obediència», `ringId: null` without the
    // api's «Sense» column) has nowhere to go, so it is not drawn — never silently: development
    // builds log it (E4-W03 review #2).
    expect(screen.queryByText("Obediència")).not.toBeInTheDocument();
    expect(warn).toHaveBeenCalledWith(
      "[DayGrid] cells without a matching column are not drawn: cls-b (ringId null)",
    );
    warn.mockRestore();
  });

  it.each(["2026-13-01", "2026-08-32", "2026-02-30", "hola"])(
    "falls back to the club-local today and rewrites the address for ?date=%s",
    async (invalid) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-08-03T23:30:00Z"));
      await renderToday(`/avui?date=${invalid}`);

      await screen.findByRole("table", { name: "Quadre del dia" });
      expect(window.location.search).toBe("?date=2026-08-04");
      expect(requestedDates).toEqual(["2026-08-04|member"]);
      expect(screen.getByText("dt 4 d’agost")).toBeVisible();
      expect(screen.getByRole("button", { name: "dt 4" })).toHaveAttribute("aria-pressed", "true");
    },
  );

  it("rewrites an invalid ?date= after mounting, never during render (E4-W03 review #4)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-03T23:30:00Z"));
    window.history.replaceState(null, "", "/avui?date=hola");
    const client = createApiClient({
      baseUrl: `${window.location.origin}/api/v1`,
      getLocale: () => "ca",
    });
    const addressDuringRender: string[] = [];
    function Probe() {
      const grid = useDayGrid(client, "member");
      addressDuringRender.push(window.location.search);
      return <output>{grid.date}</output>;
    }
    render(
      <BrandingProvider branding={branding}>
        <Probe />
      </BrandingProvider>,
    );

    expect(addressDuringRender[0]).toBe("?date=hola");
    expect(await screen.findByText("2026-08-04")).toBeVisible();
    await waitFor(() => {
      expect(window.location.search).toBe("?date=2026-08-04");
    });
  });

  it.each([
    ["Pacific/Auckland", "2026-08-04", "dt 4 d’agost", "dt 4"],
    ["Pacific/Kiritimati", "2026-08-04", "dt 4 d’agost", "dt 4"],
    ["Europe/Madrid", "2026-08-04", "dt 4 d’agost", "dt 4"],
    ["America/Bogota", "2026-08-03", "dl 3 d’agost", "dl 3"],
  ])(
    "R-06-14 in %s: requested date, header and chips name the club's calendar day",
    async (timeZone, today, header, chip) => {
      const zoned: Branding = { ...branding, timeZone };
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-08-03T23:30:00Z"));
      await renderToday("/avui", zoned);

      await screen.findByRole("table", { name: "Quadre del dia" });
      expect(requestedDates).toEqual([`${today}|member`]);
      expect(screen.getByText(header)).toBeVisible();
      expect(screen.getByRole("button", { name: chip })).toHaveAttribute("aria-pressed", "true");
      expect(
        within(screen.getByRole("group", { name: "Dies de la setmana" }))
          .getAllByRole("button")
          .map((button) => button.textContent),
      ).toEqual(["dl 3", "dt 4", "dc 5", "dj 6", "dv 7", "ds 8"]);
      cleanup();

      requestedDates.length = 0;
      await renderToday("/avui?date=2026-08-04", zoned);
      await screen.findByRole("table", { name: "Quadre del dia" });
      expect(requestedDates).toEqual(["2026-08-04|member"]);
      expect(screen.getByText("dt 4 d’agost")).toBeVisible();
    },
  );

  it("shows the empty state (dayGridEmpty) and the error toast with retry", async () => {
    mockScenario("dayGridEmpty");
    await renderToday();
    expect(await screen.findByText("Cap classe aquest dia")).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    cleanup();

    mockScenario("member");
    let failures = 1;
    server.use(
      http.get("*/api/v1/day-grid", () => {
        if (failures === 0) return undefined;
        failures -= 1;
        return HttpResponse.json(
          { code: "INTERNAL_ERROR", details: {}, message: "boom", traceId: "trace-1" },
          { status: 500 },
        );
      }),
    );
    await renderToday();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No s'ha pogut carregar el quadre del dia.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Torna-ho a provar" }));
    expect(await screen.findByRole("table", { name: "Quadre del dia" })).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
