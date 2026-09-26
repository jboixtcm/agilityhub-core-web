import { createApiClient } from "@agilityhub/api-client";
import { catalogState, mockScenario, resetPlanningState } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { OverviewPage } from "./OverviewPage";

const branding: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};
const blockId = "dg-block-2026-08-03-1600-ring-carretera";

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  mockScenario("instructor");
  resetPlanningState();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  window.history.replaceState(null, "", "/");
});
afterAll(() => {
  server.close();
});

async function renderPage(runtimeBranding: Branding) {
  window.history.replaceState(null, "", "/instructor/avui?date=2026-08-03");
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
        <OverviewPage client={client} />
      </BrandingProvider>
    </I18nextProvider>,
  );
}

async function renderOverview(runtimeBranding: Branding = branding) {
  await renderPage(runtimeBranding);
  return screen.findByRole("table", { name: "Quadre del dia" });
}

describe("T-06-29 screen 23 «Visió global»", () => {
  it("shows n/n +e with the planned instructor, training names, the block and the cancelled class", async () => {
    const grid = await renderOverview();

    expect(screen.getByRole("heading", { level: 1, name: "Visió global" })).toBeVisible();
    expect(screen.getByText("dl 3 d’agost")).toBeVisible();
    expect(getComputedStyle(grid).gridTemplateColumns).toBe(
      "var(--ah-day-grid-time, 2.25rem) repeat(5, minmax(0, 1fr))",
    );
    expect(
      within(grid)
        .getAllByRole("rowheader")
        .map((row) => row.textContent),
    ).toEqual(["8:00", "8:30", "9:30", "16:00", "17:40", "18:50", "19:00"]);
    expect(within(grid).getByText("5/5 +2 · Marc")).toBeVisible();
    expect(within(grid).getByText("3/5 · Marc")).toBeVisible();
    expect(within(grid).getByText("1/1 · Estel")).toBeVisible();
    for (const names of ["Pau + Blat", "Júlia + Kira", "Sergio + Thai"]) {
      expect(within(grid).getByText(names).closest(".ah-schedule-cell")).toHaveClass(
        "ah-schedule-cell--plain",
      );
    }
    expect(within(grid).getAllByText("Entren.")).toHaveLength(3);
    expect(within(grid).getByText("Bloq.").closest(".ah-schedule-cell")).toHaveClass(
      "ah-schedule-cell--dashed",
    );
    expect(within(grid).getByText("anul·lada · Estel").closest(".ah-schedule-cell")).toHaveClass(
      "ah-schedule-cell--muted",
    );
    expect(
      screen.getByText(
        "n/n +e = inscrits/places + llista d'espera · l'instructor previst es mostra sempre",
      ),
    ).toBeVisible();
  });

  it("drops «+e» when the club has no WAITLIST module", async () => {
    const grid = await renderOverview({
      ...branding,
      modules: branding.modules.filter((module) => module !== "WAITLIST"),
    });
    expect(within(grid).getByText("5/5 · Marc")).toBeVisible();
    expect(within(grid).queryByText(/\+2/u)).not.toBeInTheDocument();
  });

  it("opens the class drawer with the instructor projection of the tapped class", async () => {
    await renderOverview();
    fireEvent.click(screen.getByRole("button", { name: /B\+C/u }));

    const drawer = await screen.findByRole("dialog", { name: "B+C" });
    expect(await within(drawer).findByText("dl 3 d’agost · 18:50–19:50")).toBeVisible();
    expect(within(drawer).getByText("Central")).toBeVisible();
    expect(within(drawer).getByText("Marc")).toBeVisible();
    expect(within(drawer).getByText("5/5 +2")).toBeVisible();
    expect(within(drawer).getByText("activa")).toBeVisible();
    fireEvent.click(within(drawer).getByRole("button", { name: "Tanca" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the block drawer and cancels the block (POST /ring-blocks/{id}/cancellation)", async () => {
    const posted: string[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.method === "POST") posted.push(new URL(request.url).pathname);
    });
    await renderOverview();
    fireEvent.click(screen.getByRole("button", { name: /Bloq\./u }));

    const drawer = await screen.findByRole("dialog", { name: "Bloqueig de pista" });
    expect(await within(drawer).findByText("Carretera · 16:00–18:00")).toBeVisible();
    expect(within(drawer).getByText("manteniment")).toBeVisible();
    expect(within(drawer).getByText("Reg i anivellament de la sorra")).toBeVisible();
    expect(within(drawer).getByText("Creat per")).toBeVisible();
    fireEvent.click(within(drawer).getByRole("button", { name: "Anul·la el bloqueig" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    const grid = await screen.findByRole("table", { name: "Quadre del dia" });
    await waitFor(() => {
      expect(within(grid).queryByText("Bloq.")).not.toBeInTheDocument();
    });
    expect(posted).toEqual([`/api/v1/ring-blocks/${blockId}/cancellation`]);
    server.events.removeAllListeners("request:start");
  });

  it("maps 409 INVALID_STATE and 422 RING_BLOCK_MANAGED_BY_ACTIVITY on the block cancellation", async () => {
    const answers = [
      { code: "INVALID_STATE", status: 409 },
      { code: "RING_BLOCK_MANAGED_BY_ACTIVITY", status: 422 },
    ];
    server.use(
      http.post("*/api/v1/ring-blocks/:id/cancellation", () => {
        const answer = answers.shift() ?? { code: "INTERNAL_ERROR", status: 500 };
        return HttpResponse.json(
          { code: answer.code, details: {}, message: answer.code, traceId: "trace-1" },
          { status: answer.status },
        );
      }),
    );
    await renderOverview();
    fireEvent.click(screen.getByRole("button", { name: /Bloq\./u }));
    const drawer = await screen.findByRole("dialog", { name: "Bloqueig de pista" });
    fireEvent.click(await within(drawer).findByRole("button", { name: "Anul·la el bloqueig" }));
    expect(await within(drawer).findByRole("alert")).toHaveTextContent(
      "Aquest element no està en un estat vàlid per a aquesta operació.",
    );

    fireEvent.click(within(drawer).getByRole("button", { name: "Anul·la el bloqueig" }));
    await waitFor(() => {
      expect(within(drawer).getByRole("alert")).toHaveTextContent(
        "Aquest bloqueig de pista es gestiona des de l'activitat.",
      );
    });
    expect(
      within(drawer).queryByRole("button", { name: "Anul·la el bloqueig" }),
    ).not.toBeInTheDocument();
  });

  it("answers 403 to a member asking for the instructor view", async () => {
    mockScenario("member");
    await renderPage(branding);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No s'ha pogut carregar el quadre del dia.",
    );
  });
});

/**
 * The staff `GET /class-sessions/{id}` of the «B+C» class of 3/08 as the mock api sends it, and a
 * handler that answers `changes` on top of it from now on.
 */
async function classDetailWith(changes: Record<string, unknown>) {
  const api = createApiClient({
    baseUrl: `${window.location.origin}/api/v1`,
    getLocale: () => "ca",
  });
  const grid = await api.GET("/day-grid", {
    params: { query: { date: "2026-08-03", view: "instructor" } },
  });
  const id = grid.data?.rows
    .flatMap((row) => row.cells)
    .find((cell) => cell.kind === "CLASS" && cell.description === "B+C")?.classId;
  if (id === undefined) throw new TypeError("Missing the B+C class");
  const detail = await api.GET("/class-sessions/{id}", { params: { path: { id } } });
  server.use(
    http.get("*/api/v1/class-sessions/:id", ({ params }) =>
      String(params.id) === id
        ? HttpResponse.json({ ...(detail.data as object), ...changes })
        : undefined,
    ),
  );
}

describe("T-06-29 E4-W11 screen 23's class drawer reads the class detail (api E5-T15)", () => {
  it("names the instructors (instructorNames[]) and the ring (ring.name) of GET /class-sessions/{id}, not of the tapped cell", async () => {
    const muntanya = catalogState.rings.find((ring) => ring.id === "ring-muntanya");
    if (muntanya === undefined) throw new TypeError("Missing Muntanya");
    await classDetailWith({
      instructorNames: ["Marc", "Núria"],
      ring: { color: muntanya.color, id: muntanya.id, name: muntanya.name },
    });
    await renderOverview();
    fireEvent.click(screen.getByRole("button", { name: /B\+C/u }));

    const drawer = await screen.findByRole("dialog", { name: "B+C" });
    expect(await within(drawer).findByText("Marc, Núria")).toBeVisible();
    expect(within(drawer).getByText("Muntanya")).toBeVisible();
    // The tapped cell says Central and Marc: neither is read any more.
    expect(within(drawer).queryByText("Central")).not.toBeInTheDocument();
  });

  it("a class without a ring (ring: null) has no «Pista» row; without names, no «Instructor» row", async () => {
    await classDetailWith({ instructorNames: [], ring: null });
    await renderOverview();
    fireEvent.click(screen.getByRole("button", { name: /B\+C/u }));

    const drawer = await screen.findByRole("dialog", { name: "B+C" });
    expect(await within(drawer).findByText("dl 3 d’agost · 18:50–19:50")).toBeVisible();
    expect(within(drawer).queryByText("Pista")).not.toBeInTheDocument();
    expect(within(drawer).queryByText("Central")).not.toBeInTheDocument();
    expect(within(drawer).queryByText("Instructor")).not.toBeInTheDocument();
    expect(within(drawer).queryByText("Marc")).not.toBeInTheDocument();
    expect(within(drawer).getByText("5/5 +2")).toBeVisible();
  });
});
