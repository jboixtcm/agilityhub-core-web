import { createApiClient } from "@agilityhub/api-client";
import {
  mockScenario,
  type MockScenario,
  resetBackofficeMockState,
  resetPlanningState,
  resetTrainingMockState,
  TRAINING_MOCK_NOW,
} from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { AuthClient, MemoryRefreshTokenStore, SessionProvider } from "@agilityhub/auth";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { TrainingRegisterPage } from "./TrainingRegisterPage";

const branding: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
// Monday 3 August 2026 at 7:10 in the club: the S09 world's week (dl 3 – dg 9).
beforeEach(() => {
  vi.useFakeTimers({ now: new Date(TRAINING_MOCK_NOW), shouldAdvanceTime: true, toFake: ["Date"] });
  resetPlanningState();
  resetTrainingMockState();
  resetBackofficeMockState();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.events.removeAllListeners();
  vi.useRealTimers();
  localStorage.clear();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

function recordRequests(): URL[] {
  const urls: URL[] = [];
  server.events.on("request:start", ({ request }) => {
    urls.push(new URL(request.url));
  });
  return urls;
}

async function renderPage(scenario: MockScenario = "admin", search = "") {
  mockScenario(scenario);
  window.history.replaceState(null, "", `/entrenaments${search}`);
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-training", "census", "enums", "errors"],
    storage: undefined,
  });
  const auth = new AuthClient({
    apiBaseUrl: `${window.location.origin}/api/v1`,
    clientId: "clubs-admin",
    identityBaseUrl: window.location.origin,
    mockMode: true,
    mockRefreshTokenStore: new MemoryRefreshTokenStore(),
  });
  await auth.login(
    scenario === "instructor" ? "ivet.puig@example.test" : "aina.serra@example.test",
    "secret-password",
  );
  const onNavigate = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <SessionProvider client={auth}>
          <TrainingRegisterPage
            client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
            onNavigate={onNavigate}
          />
        </SessionProvider>
      </BrandingProvider>
    </I18nextProvider>,
  );
  await screen.findByRole("heading", { level: 1, name: "Entrenaments" });
  return onNavigate;
}

function rowOf(text: string): HTMLElement {
  const row = screen.getByText(text).closest("tr");
  if (row === null) throw new TypeError(`No row for ${text}`);
  return row;
}

describe("E5-W03 step 2 · «Entrenaments», the ring-usage register (S09 §2 and §13-8)", () => {
  it("tab 1 reads GET /training-bookings with the current week and startsAt,desc, and links the member to D10 (ADMIN)", async () => {
    const requests = recordRequests();
    const onNavigate = await renderPage();
    expect(screen.getByRole("tab", { name: "Reserves d'entrenament" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await screen.findAllByText("dl 3 · 7:00");
    const list = requests.find(
      (url) => url.pathname.endsWith("/training-bookings") && url.searchParams.get("size") === "50",
    );
    expect(list?.searchParams.getAll("filter")).toEqual(["date:between:2026-08-03,2026-08-09"]);
    expect(list?.searchParams.getAll("sort")).toEqual(["startsAt,desc"]);
    expect(list?.searchParams.get("fields")).toBe(
      "id,date,startsAtLocal,ringId,ringName,memberId,memberName,dogName,state,origin",
    );
    // Rock's Monday 7:00, booked by the club for Laura (R-09-16 `origin: BACKOFFICE`).
    const rock = screen
      .getAllByRole("row")
      .find((row) => row.textContent.includes("dl 3 · 7:00") && row.textContent.includes("Rock"));
    if (rock === undefined) throw new TypeError("No row for Rock's Monday 7:00");
    const link = within(rock).getByRole("link", { name: "Laura" });
    expect(link).toHaveAttribute("href", "/abonats/member-laura");
    fireEvent.click(link);
    expect(onNavigate).toHaveBeenCalledWith("/abonats/member-laura");
    // The api's origin and state, as labelled by the enums (BACKOFFICE → «club»).
    expect(within(rock).getByText("club")).toBeVisible();
    expect(within(rock).getByText("confirmada")).toBeVisible();
  });

  it("offers the api's values with their counts in the universal filter (no filter-values route: counted from the list)", async () => {
    await renderPage();
    await screen.findAllByText("dl 3 · 7:00");
    // The week the list starts with is an applied filter, labelled in the club's words.
    fireEvent.click(screen.getByText(/^Filtre \(1\): Dia i hora = «3 .*agost»$/u));
    const value = screen.getByRole("combobox", { name: "Valor" });
    await waitFor(() => {
      expect(value).not.toBeDisabled();
    });
    const options = within(value)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toContain("Central (4)");
    fireEvent.change(value, { target: { value: "ring-central" } });
    fireEvent.click(screen.getByRole("button", { name: "Afegeix el filtre" }));
    await waitFor(() => {
      expect(window.location.search).toContain("filter=ringId%3Aeq%3Aring-central");
    });
    await waitFor(() => {
      expect(screen.queryByText("Muntanya")).toBeNull();
    });
  });

  it("S14 R-14-12 exports the list's filters and columns (ADMIN) and never for an INSTRUCTOR", async () => {
    const requests = recordRequests();
    await renderPage();
    await screen.findAllByText("dl 3 · 7:00");
    fireEvent.click(screen.getByText("Excel · PDF"));
    fireEvent.click(screen.getByRole("button", { name: "Excel" }));
    await waitFor(() => {
      expect(requests.some((url) => url.pathname.endsWith("/training-bookings/export"))).toBe(true);
    });
    const exported = requests.find((url) => url.pathname.endsWith("/training-bookings/export"));
    expect(exported?.searchParams.get("format")).toBe("xlsx");
    expect(exported?.searchParams.get("columns")).toBe(
      "date,startsAtLocal,ringName,memberName,dogName,state,origin",
    );
    expect(exported?.searchParams.getAll("filter")).toEqual(["date:between:2026-08-03,2026-08-09"]);

    cleanup();
    await renderPage("instructor");
    await screen.findAllByText("dl 3 · 7:00");
    expect(screen.queryByText("Excel · PDF")).toBeNull();
    // D10 is ADMIN's: the INSTRUCTOR reads the name only.
    expect(screen.queryByRole("link", { name: "Laura" })).toBeNull();
  });

  it("T-08-47/T-09-24 pattern: an undeclared filter shows the list's own INVALID_FILTER message", async () => {
    await renderPage("admin", "?vista=reserves&filter=ringName:eq:Central");
    expect(await screen.findByText("El filtre no és vàlid.")).toBeVisible();
  });

  it("tab 2 lists the blocks and ring reservations; [Anul·la el bloqueig] is hidden for an activity's block and cancels the others", async () => {
    const requests = recordRequests();
    await renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "Bloquejos i reserves de pista" }));
    await screen.findByText("Reg de la sorra");
    const list = requests.find((url) => url.pathname.endsWith("/ring-blocks"));
    expect(list?.searchParams.getAll("filter")).toEqual([
      "from:between:2026-08-02T22:00:00Z,2026-08-09T22:00:00Z",
    ]);
    expect(window.location.search).toContain("vista=bloquejos");

    const activity = rowOf("activitat · Taller d'iniciació");
    expect(within(activity).queryByRole("button", { name: /Anul·la el bloqueig/u })).toBeNull();

    const maintenance = rowOf("Reg de la sorra");
    expect(within(maintenance).getByText("manteniment")).toBeVisible();
    expect(within(maintenance).getByText("Bloqueig")).toBeVisible();
    fireEvent.click(
      within(maintenance).getByRole("button", { name: /Anul·la el bloqueig de dl 3/u }),
    );
    expect(await screen.findByText("Bloqueig anul·lat.")).toBeVisible();
    await waitFor(() => {
      expect(
        within(rowOf("Reg de la sorra")).queryByRole("button", { name: /Anul·la el bloqueig/u }),
      ).toBeNull();
    });
  });

  it("409 INVALID_STATE on a cancellation shows why and reads the list again; an INSTRUCTOR has no row action", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "Bloquejos i reserves de pista" }));
    await screen.findByText("Reg de la sorra");
    // Someone else cancelled it meanwhile.
    await createApiClient({ baseUrl: `${window.location.origin}/api/v1` }).POST(
      "/ring-blocks/{id}/cancellation",
      { body: {}, params: { path: { id: "rb-2026-08-03-1600-carretera" } } },
    );
    fireEvent.click(
      within(rowOf("Reg de la sorra")).getByRole("button", { name: /Anul·la el bloqueig/u }),
    );
    expect(
      await screen.findByText("Aquest element no està en un estat vàlid per a aquesta operació."),
    ).toBeVisible();
    await waitFor(() => {
      expect(
        within(rowOf("Reg de la sorra")).queryByRole("button", { name: /Anul·la el bloqueig/u }),
      ).toBeNull();
    });

    cleanup();
    await renderPage("instructor", "?vista=bloquejos");
    await screen.findByText("Reg de la sorra");
    expect(screen.queryByRole("button", { name: /Anul·la el bloqueig/u })).toBeNull();
  });
});
