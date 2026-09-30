import { createApiClient } from "@agilityhub/api-client";
import {
  JOBS_MOCK_NOW,
  mockScenario,
  resetDashboardMockState,
  resetPlanningState,
} from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardPage } from "./DashboardPage";

const branding: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
// Monday 10 August 2026, 8:12 in the club: the D1 fixture's day and the S15 §6 form A example. The
// risk card reads the calendar world (E5-W05 step 15), built for that day rather than the import's.
beforeEach(() => {
  vi.useFakeTimers({ now: new Date(JOBS_MOCK_NOW), shouldAdvanceTime: true, toFake: ["Date"] });
  resetPlanningState();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  server.resetHandlers();
  resetDashboardMockState();
  mockScenario("admin");
  window.history.pushState(null, "", "/tauler");
});
afterAll(() => {
  server.close();
});

type DashboardBody = Record<string, unknown> & {
  dogsByLevel: Record<string, unknown> & {
    activeDogWeeks: number;
    levels: Record<string, unknown>[];
  };
  kpis: { activeMembers: { deltaThisMonth: number }; pendingSignups: { warnDays: number } };
};

type RiskBody = Record<string, unknown> & {
  items: (Record<string, unknown> & { classId: string })[];
};

// Rewrites the answer of the `GET` whose path ends with `suffix`.
function rewriteFetch(suffix: string, mutate: (body: unknown) => void): typeof fetch {
  return async (input, init) => {
    const response = await fetch(input, init);
    const request = input instanceof Request ? input : new Request(input, init);
    if (!new URL(request.url).pathname.endsWith(suffix)) return response;
    const body: unknown = await response.json();
    mutate(body);
    return Response.json(body, { status: response.status });
  };
}

const dashboardFetch = (mutate: (body: DashboardBody) => void) =>
  rewriteFetch("/dashboard", (body) => {
    mutate(body as DashboardBody);
  });
// The card's rows are S15's form A (`GET /risk-review`, E5-W03).
const riskFetch = (mutate: (body: RiskBody) => void) =>
  rewriteFetch("/risk-review", (body) => {
    mutate(body as RiskBody);
  });

async function renderDashboard(
  onNavigate = vi.fn(),
  fetchOverride?: typeof fetch,
  client = createApiClient({
    baseUrl: `${window.location.origin}/api/v1`,
    ...(fetchOverride === undefined ? {} : { fetch: fetchOverride }),
  }),
) {
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-dashboard"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <DashboardPage client={client} onNavigate={onNavigate} />
      </BrandingProvider>
    </I18nextProvider>,
  );
  await screen.findByRole("heading", { level: 1 });
  return { client, navigate: onNavigate };
}

function signupRow(name: RegExp): HTMLElement {
  const row = screen.getByText(name).closest("article");
  if (row === null) throw new TypeError("No signup row");
  return row;
}

describe("T-14-25 D1 dashboard", () => {
  it("renders the server aggregate, all risk rows, pending signups, and accessible chart", async () => {
    const { navigate } = await renderDashboard();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Bon dia! Dilluns 10 d’agost",
    );
    expect(screen.getByText("184")).toBeVisible();
    expect(screen.getByText("87%")).toBeVisible();
    expect(screen.getByText("56")).toBeVisible();
    expect(screen.getByText(/142\/163 places/u)).toBeVisible();
    expect(screen.getByText("1 de fa més de 2 dies")).toBeVisible();
    // The mockup's literals (form A carries no gender, E5-W03): «avisada» / «avisats».
    expect(await screen.findByText(/anul·lada · avisada Laura \+ Duna/u)).toBeVisible();
    expect(screen.getByText(/en risc · avisats Pau \+ Blat/u)).toBeVisible();
    expect(screen.getAllByText("1 inscrit").length).toBeGreaterThan(0);
    expect(screen.getByText("Compte no informat")).toBeVisible();

    const chart = screen.getByRole("figure", { name: "Gossos per nivell — 242 actius" });
    expect(
      within(chart).getByRole("table", { name: "Gossos per nivell — 242 actius" }),
    ).toBeInTheDocument();
    expect(within(chart).getByRole("row", { name: /CAD 24 19/u })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "VALIDA: Marta R. + Kiwi (whippet)" }));
    expect(navigate).toHaveBeenCalledWith("/preinscripcions/42000000-0000-4000-8000-000000000001");
  });

  it("hides nullable module blocks and refetches when the window regains the focus", async () => {
    mockScenario("adminDashboardNulls");
    const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
    const get = vi.spyOn(client, "GET");
    await renderDashboard(vi.fn(), undefined, client);

    expect(await screen.findByText("184")).toBeVisible();
    const calls = (path: string) =>
      (get.mock.calls as unknown[][]).filter((call) => call[0] === path).length;
    expect(calls("/dashboard")).toBe(1);
    expect(screen.queryByText("Entrenaments reservats")).not.toBeInTheDocument();
    expect(screen.queryByRole("figure")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(calls("/risk-review")).toBe(1);
    });

    fireEvent.focus(window);
    await waitFor(() => {
      expect(calls("/dashboard")).toBe(2);
    });
    await waitFor(() => {
      expect(calls("/risk-review")).toBe(2);
    });
  });

  it("S14 R-14-06: a null `riskReview` block shows no risk card and never asks for GET /risk-review", async () => {
    const client = createApiClient({
      baseUrl: `${window.location.origin}/api/v1`,
      fetch: dashboardFetch((body) => {
        body.riskReview = null;
      }),
    });
    const get = vi.spyOn(client, "GET");
    await renderDashboard(vi.fn(), undefined, client);
    expect(await screen.findByText("184")).toBeVisible();
    expect(screen.queryByRole("heading", { name: /Revisió de classes en risc/u })).toBeNull();
    expect((get.mock.calls as unknown[][]).some((call) => call[0] === "/risk-review")).toBe(false);
  });

  it("uses the same ICU day plural as D2 in the pending signups card", async () => {
    await renderDashboard(
      vi.fn(),
      dashboardFetch((body) => {
        body.kpis.pendingSignups.warnDays = 1;
      }),
    );
    expect(await screen.findByText("1 de fa més de 1 dia")).toBeVisible();
  });
});

describe("E3-W07 step 9 · the D1 minors (S14 R-14-05…07, T-14-25)", () => {
  it("gives each VALIDA its own accessible name", async () => {
    await renderDashboard();
    expect(
      screen
        .getAllByRole("button", { name: /^VALIDA: /u })
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "VALIDA: Marta R. + Kiwi (whippet)",
      "VALIDA: Pol C. + Bruc (border)",
      "VALIDA: Núria T. + Lua (mestís)",
    ]);
  });

  it("marks an add-dog row «(nou gos)»", async () => {
    mockScenario("adminSignupReviewAddDog");
    await renderDashboard();
    expect(screen.getByText("Marta R. + Nit (nou gos)")).toBeVisible();
    expect(screen.queryByText(/Nit \(border\)/u)).toBeNull();
  });

  it("R-14-05 paints the submission date red only when pendingDays > warnDays", async () => {
    await renderDashboard();
    const late = within(signupRow(/^Núria T\./u)).getByText(/^enviada el /u);
    const onTime = within(signupRow(/^Marta R\./u)).getByText(/^enviada el /u);
    expect(late).toHaveClass("dashboard-signups__date--overdue");
    expect(onTime).not.toHaveClass("dashboard-signups__date--overdue");
  });

  it.each([
    [3, "+3 aquest mes"],
    [-2, "−2 aquest mes"],
    [0, "0 aquest mes"],
  ])("signs the members delta %i as «%s»", async (delta, text) => {
    await renderDashboard(
      vi.fn(),
      dashboardFetch((body) => {
        body.kpis.activeMembers.deltaThisMonth = delta;
      }),
    );
    expect(screen.getByText(text)).toBeVisible();
    expect(screen.queryByText(/\+-|\+0/u)).toBeNull();
  });

  it.each([
    [1, "1 avís"],
    [4, "4 avisos"],
  ])("counts %i risk alert(s) with an ICU plural", async (count, text) => {
    await renderDashboard(
      vi.fn(),
      riskFetch((body) => {
        body.items = body.items.slice(0, count);
      }),
    );
    expect(await screen.findByText(text)).toHaveClass("ah-badge");
  });

  it("writes times as «7:30» and links each risk row to D4 on its class", async () => {
    const { navigate } = await renderDashboard();
    expect(
      await screen.findByRole("heading", {
        name: /Revisió de classes en risc — 7:30, avui i 2 dies vista/u,
      }),
    ).toBeVisible();
    expect(screen.getByText(/s'anul·larà dc a les 7:30/u)).toBeVisible();
    const row = screen.getByRole("link", { name: "Cadells · avui 9:30 · Cadells" });
    const expected =
      "/calendari?classe=cls-2026-08-10-0930-7&estat=anul%C2%B7lades&setmana=2026-08-10";
    expect(row).toHaveAttribute("href", expected);
    fireEvent.click(row);
    expect(navigate).toHaveBeenCalledWith(expected);
  });

  it("shows at most 6 risk rows, then «+{n} més» to D4 on the first hidden one", async () => {
    const { navigate } = await renderDashboard(
      vi.fn(),
      riskFetch((body) => {
        const template = body.items[2];
        if (template === undefined) return;
        body.items = Array.from({ length: 8 }, (_, index) => ({
          ...template,
          classId: `41000000-0000-4000-8000-0000000001${String(index).padStart(2, "0")}`,
          date: "2026-08-11",
          displayDescription: `Classe ${String(index + 1)}`,
        }));
      }),
    );
    await screen.findByRole("link", { name: "+2 més" });
    expect(document.querySelectorAll(".dashboard-risk__row")).toHaveLength(6);
    const more = screen.getByRole("link", { name: "+2 més" });
    fireEvent.click(more);
    expect(navigate).toHaveBeenCalledWith(
      "/calendari?classe=41000000-0000-4000-8000-000000000106&estat=actives&setmana=2026-08-10",
    );
  });

  it("puts the warning icon on the risk card title", async () => {
    await renderDashboard();
    const title = await screen.findByRole("heading", { name: /Revisió de classes en risc/u });
    expect(title.querySelector(".ah-icon")).not.toBeNull();
  });

  it("E35 paints one column per progression level with the level name as tooltip, never `others`", async () => {
    await renderDashboard(
      vi.fn(),
      dashboardFetch((body) => {
        body.dogsByLevel.others = 999;
      }),
    );
    const chart = screen.getByRole("figure", { name: "Gossos per nivell — 242 actius" });
    expect(within(chart).getByRole("row", { name: /CAD 24 19/u })).toHaveAttribute(
      "title",
      "Cadells",
    );
    expect(within(chart).getAllByRole("row")).toHaveLength(1 + 8);
    expect(within(chart).queryByText("999")).toBeNull();
  });

  it.each([
    [1, "amb reserva (setm. en curs) · total actius"],
    [2, "amb reserva (setm. en curs o anterior) · total actius"],
    [3, "amb reserva (setm. en curs o les 2 anteriors) · total actius"],
  ])("follows coverage.activeDogWeeks = %i in the chart legend", async (weeks, text) => {
    await renderDashboard(
      vi.fn(),
      dashboardFetch((body) => {
        body.dogsByLevel.activeDogWeeks = weeks;
      }),
    );
    expect(screen.getByText(text)).toBeVisible();
  });

  it("R-04-23 keeps the refund notice after a rejection with a collected payment", async () => {
    window.history.pushState(null, "", "/tauler?signup=rejected-refund");
    await renderDashboard();
    expect(
      screen.getByText("Hi ha un pagament cobrat: caldrà retornar-lo des de Facturació"),
    ).toBeVisible();
  });
});
