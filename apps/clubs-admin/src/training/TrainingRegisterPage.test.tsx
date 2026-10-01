import { createApiClient } from "@agilityhub/api-client";
import {
  catalogState,
  mockScenario,
  type MockScenario,
  resetBackofficeMockState,
  resetCatalogState,
  resetPlanningState,
  resetTrainingMockState,
  TRAINING_MOCK_NOW,
  trainingState,
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
  resetCatalogState();
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
    await screen.findAllByText("dl 3 · 7:00–7:30");
    const list = requests.find(
      (url) => url.pathname.endsWith("/training-bookings") && url.searchParams.get("size") === "50",
    );
    expect(list?.searchParams.getAll("filter")).toEqual(["date:between:2026-08-03,2026-08-09"]);
    expect(list?.searchParams.getAll("sort")).toEqual(["startsAt,desc"]);
    expect(list?.searchParams.get("fields")).toBe(
      "id,date,startsAtLocal,endsAtLocal,ringId,ringName,memberId,memberName,memberNumber,dogName,state,origin",
    );
    // Rock's Monday 7:00, booked by the club for Laura (R-09-16 `origin: BACKOFFICE`).
    const rock = screen
      .getAllByRole("row")
      .find((row) => row.textContent.includes("dl 3 · 7:00") && row.textContent.includes("Rock"));
    if (rock === undefined) throw new TypeError("No row for Rock's Monday 7:00");
    const link = within(rock).getByRole("link", { name: "Laura Serra Vidal · 87" });
    expect(link).toHaveAttribute("href", "/abonats/member-laura");
    fireEvent.click(link);
    expect(onNavigate).toHaveBeenCalledWith("/abonats/member-laura");
    // The api's origin and state, as labelled by the enums (BACKOFFICE → «club»).
    expect(within(rock).getByText("club")).toBeVisible();
    expect(within(rock).getByText("confirmada")).toBeVisible();
  });

  it("offers the api's values with their counts in the universal filter (E5-W05: GET /training-bookings/filter-values)", async () => {
    await renderPage();
    await screen.findAllByText("dl 3 · 7:00–7:30");
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
    await screen.findAllByText("dl 3 · 7:00–7:30");
    fireEvent.click(screen.getByText("Excel · PDF"));
    fireEvent.click(screen.getByRole("button", { name: "Excel" }));
    await waitFor(() => {
      expect(requests.some((url) => url.pathname.endsWith("/training-bookings/export"))).toBe(true);
    });
    const exported = requests.find((url) => url.pathname.endsWith("/training-bookings/export"));
    expect(exported?.searchParams.get("format")).toBe("xlsx");
    expect(exported?.searchParams.get("columns")).toBe(
      "date,startsAtLocal,endsAtLocal,ringName,memberName,memberNumber,dogName,state,origin",
    );
    expect(exported?.searchParams.getAll("filter")).toEqual(["date:between:2026-08-03,2026-08-09"]);

    cleanup();
    await renderPage("instructor");
    await screen.findAllByText("dl 3 · 7:00–7:30");
    expect(screen.queryByText("Excel · PDF")).toBeNull();
    // D10 is ADMIN's: the INSTRUCTOR reads the name only.
    expect(screen.queryByRole("link", { name: /^Laura/u })).toBeNull();
    expect(screen.getAllByText("Laura Serra Vidal · 87").length).toBeGreaterThan(0);
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

  it("E5-W03 round 2 · review #9: the date and relation filters offer only operators that take one value, and the query says so", async () => {
    const requests = recordRequests();
    await renderPage();
    await screen.findAllByText("dl 3 · 7:00–7:30");
    fireEvent.click(screen.getByText(/^Filtre \(1\):/u));
    const field = screen.getByRole("combobox", { name: "Columna" });
    const operator = screen.getByRole("combobox", { name: "Operador" });
    const operators = () =>
      within(operator)
        .getAllByRole("option")
        .map((option) => option.getAttribute("value"));
    fireEvent.change(field, { target: { value: "date" } });
    expect(operators()).toEqual(["eq", "ne", "lt", "lte", "gt", "gte"]);
    for (const key of ["ringId", "memberId", "dogId"]) {
      fireEvent.change(field, { target: { value: key } });
      expect(operators()).toEqual(["eq", "ne", "in", "nin"]);
    }
    fireEvent.change(field, { target: { value: "date" } });
    fireEvent.change(operator, { target: { value: "gte" } });
    const value = screen.getByRole("combobox", { name: "Valor" });
    await waitFor(() => {
      expect(
        within(value)
          .getAllByRole("option")
          .map((option) => option.getAttribute("value")),
      ).toContain("2026-08-04");
    });
    fireEvent.change(value, { target: { value: "2026-08-04" } });
    fireEvent.click(screen.getByRole("button", { name: "Afegeix el filtre" }));
    await waitFor(() => {
      const last = requests
        .filter(
          (url) =>
            url.pathname.endsWith("/training-bookings") && url.searchParams.get("size") === "50",
        )
        .at(-1);
      expect(last?.searchParams.getAll("filter")).toEqual(["date:gte:2026-08-04"]);
    });

    // The blocks' day: whole club-local days (ruling E80: a range of dates), so only `between`.
    fireEvent.click(screen.getByRole("tab", { name: "Bloquejos i reserves de pista" }));
    await screen.findByText("Reg de la sorra");
    fireEvent.click(screen.getByText(/^Filtre \(1\):/u));
    const blockField = screen.getByRole("combobox", { name: "Columna" });
    fireEvent.change(blockField, { target: { value: "ringId" } });
    expect(
      within(screen.getByRole("combobox", { name: "Operador" }))
        .getAllByRole("option")
        .map((option) => option.getAttribute("value")),
    ).toEqual(["eq", "ne", "in", "nin"]);
    fireEvent.change(blockField, { target: { value: "from" } });
    expect(
      within(screen.getByRole("combobox", { name: "Operador" }))
        .getAllByRole("option")
        .map((option) => option.getAttribute("value")),
    ).toEqual(["between"]);
    fireEvent.change(screen.getByLabelText("Des del"), { target: { value: "2026-08-03" } });
    fireEvent.change(screen.getByLabelText("Fins al"), { target: { value: "2026-08-03" } });
    fireEvent.click(screen.getByRole("button", { name: "Afegeix el filtre" }));
    await waitFor(() => {
      const last = requests.filter((url) => url.pathname.endsWith("/ring-blocks")).at(-1);
      expect(last?.searchParams.getAll("filter")).toEqual([
        "from:between:2026-08-02T22:00:00Z,2026-08-03T22:00:00Z",
      ]);
    });
  });

  it("E5-W03 round 2 · review #8: a past block on a deactivated ring names its ring, never its id", async () => {
    // «Antiga» was deactivated after its Monday-morning block (S05: the catalog keeps it).
    const template = catalogState.rings[0];
    if (template === undefined) throw new TypeError("No ring in the catalog");
    catalogState.rings.push({
      ...template,
      active: false,
      id: "ring-antiga",
      name: "Antiga",
      order: 90,
      shortName: "ANT",
    });
    trainingState.blocks.push({
      activityId: null,
      activityTitle: null,
      createdByName: "Marc",
      date: "2026-08-03",
      from: "2026-08-03T04:00:00Z",
      fromLocal: "06:00",
      id: "rb-2026-08-03-0600-antiga",
      kind: "BLOCK",
      note: "Retirada de la tanca",
      reason: "MAINTENANCE",
      ringId: "ring-antiga",
      state: "ACTIVE",
      to: "2026-08-03T05:00:00Z",
      toLocal: "07:00",
      version: 1,
    });
    const requests = recordRequests();
    await renderPage("admin", "?vista=bloquejos");
    await screen.findByText("Retirada de la tanca");
    await waitFor(() => {
      expect(within(rowOf("Retirada de la tanca")).getByText("Antiga")).toBeVisible();
    });
    expect(screen.queryByText("ring-antiga")).toBeNull();
    // Only the ADMIN may ask for the deactivated rings (S05 §6 `includeInactive`).
    expect(
      requests.some(
        (url) =>
          url.pathname.endsWith("/rings") && url.searchParams.get("includeInactive") === "true",
      ),
    ).toBe(true);

    cleanup();
    const instructorRequests = recordRequests();
    await renderPage("instructor", "?vista=bloquejos");
    await screen.findByText("Retirada de la tanca");
    await screen.findAllByText("Carretera");
    // E5-W05 step 3: the row names its own ring (E5-T29 `ringName`), for an INSTRUCTOR too.
    expect(within(rowOf("Retirada de la tanca")).getByText("Antiga")).toBeVisible();
    expect(screen.queryByText("ring-antiga")).toBeNull();
    expect(
      instructorRequests.some(
        (url) => url.pathname.endsWith("/rings") && url.searchParams.has("includeInactive"),
      ),
    ).toBe(false);
  });
});

/** The values the universal filter offers for `field`, as «{label} ({count})». */
async function filterOptions(field: string): Promise<string[]> {
  fireEvent.click(screen.getByText(/^Filtre \(1\):/u));
  fireEvent.change(screen.getByRole("combobox", { name: "Columna" }), {
    target: { value: field },
  });
  const value = screen.getByRole("combobox", { name: "Valor" });
  await waitFor(() => {
    expect(value).not.toBeDisabled();
    expect(within(value).getAllByRole("option").length).toBeGreaterThan(1);
  });
  return within(value)
    .getAllByRole("option")
    .map((option) => option.textContent);
}

describe("E5-W05 steps 3 and 5 · the register reads E5-T29's fields and the complete filter values", () => {
  it("E5-W05 step 3: «Dia i hora» reads «dl 3 · 7:00–7:30» with endsAtLocal, and «Abonat» «{nom complet} · {número}»", async () => {
    const requests = recordRequests();
    await renderPage();
    const rock = await waitFor(() => {
      const found = screen
        .getAllByRole("row")
        .find(
          (row) => row.textContent.includes("dl 3 · 7:00–7:30") && row.textContent.includes("Rock"),
        );
      if (found === undefined) throw new TypeError("No row for Rock's Monday 7:00–7:30");
      return found;
    });
    expect(within(rock).getByRole("link", { name: "Laura Serra Vidal · 87" })).toHaveAttribute(
      "href",
      "/abonats/member-laura",
    );
    const list = requests.find(
      (url) => url.pathname.endsWith("/training-bookings") && url.searchParams.get("size") === "50",
    );
    expect(list?.searchParams.get("fields")).toBe(
      "id,date,startsAtLocal,endsAtLocal,ringId,ringName,memberId,memberName,memberNumber,dogName,state,origin",
    );
  });

  it("E5-W05 step 3: a member without a number reads the name alone, without « · »", async () => {
    await renderPage("registerMany");
    const rows = await screen.findAllByRole("link", { name: /^Pau Fictici Mas/u });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((link) => link.textContent === "Pau Fictici Mas")).toBe(true);
  });

  it("E5-W05 step 3: every block names its ring from the row (ringName, ringColor), a deactivated ring's included, for an INSTRUCTOR too", async () => {
    const template = catalogState.rings[0];
    // The deactivated ring keeps a colour of its own (the last ring's, from the catalog fixture).
    const color = catalogState.rings.at(-1)?.color;
    if (template === undefined || color === undefined) {
      throw new TypeError("No coloured ring in the catalog");
    }
    catalogState.rings.push({
      ...template,
      active: false,
      color,
      id: "ring-antiga",
      name: "Antiga",
      order: 90,
      shortName: "ANT",
    });
    trainingState.blocks.push({
      activityId: null,
      activityTitle: null,
      createdByName: "Marc",
      date: "2026-08-03",
      from: "2026-08-03T04:00:00Z",
      fromLocal: "06:00",
      id: "rb-2026-08-03-0600-antiga",
      kind: "BLOCK",
      note: "Retirada de la tanca",
      reason: "MAINTENANCE",
      ringId: "ring-antiga",
      state: "ACTIVE",
      to: "2026-08-03T05:00:00Z",
      toLocal: "07:00",
      version: 1,
    });
    const requests = recordRequests();
    await renderPage("instructor", "?vista=bloquejos");
    const antiga = await waitFor(() => within(rowOf("Retirada de la tanca")).getByText("Antiga"));
    expect(screen.queryByText("pista desactivada")).toBeNull();
    const dot = antiga
      .closest(".training-register__ring")
      ?.querySelector(".training-register__dot");
    expect(dot?.getAttribute("style")).toContain(`--ah-ring-color: ${color}`);
    const list = requests.find((url) => url.pathname.endsWith("/ring-blocks"));
    expect(list?.searchParams.get("fields")?.split(",")).toEqual(
      expect.arrayContaining(["ringId", "ringName", "ringColor"]),
    );
  });

  it("E5-W05 step 5: with more than 1000 rows, the member filter offers «Nil Fictici Soler», who appears only after row 1000, from GET /training-bookings/filter-values", async () => {
    const requests = recordRequests();
    await renderPage("registerMany");
    // Newest first: the first page is Saturday's, all of them Pau's.
    await screen.findAllByRole("link", { name: /^Pau Fictici Mas/u });
    const options = await filterOptions("memberId");
    expect(options).toContain("Nil Fictici Soler (5)");
    const values = requests.find(
      (url) =>
        url.pathname.endsWith("/training-bookings/filter-values") &&
        url.searchParams.get("field") === "memberId",
    );
    expect(values).toBeDefined();
    // The other filters narrow the values (the week the list starts with).
    expect(values?.searchParams.getAll("filter")).toEqual(["date:between:2026-08-03,2026-08-09"]);
    expect(
      requests.some(
        (url) =>
          url.pathname.endsWith("/training-bookings") && url.searchParams.get("size") === "1000",
      ),
    ).toBe(false);
  });

  it("E5-W05 step 5: the week filter the api echoes as a JSON array (`between`) reads «Dia i hora = «3 al 9 d’agost»», never «»", async () => {
    const requests: Promise<unknown>[] = [];
    server.events.on("response:mocked", ({ request, response }) => {
      if (new URL(request.url).pathname.endsWith("/training-bookings")) {
        requests.push(response.clone().json());
      }
    });
    await renderPage();
    await screen.findAllByText("dl 3 · 7:00–7:30");
    const answer = (await requests[0]) as { appliedFilters: { value: unknown }[] };
    expect(answer.appliedFilters[0]?.value).toEqual(["2026-08-03", "2026-08-09"]);
    expect(screen.getByText(/^Filtre \(1\): Dia i hora = «3 al 9 d.agost»$/u)).toBeVisible();
  });

  it("E5-W05 round 2 #1: the blocks tab asks GET /ring-blocks/filter-values once when it settles, and a second ring picked in «Valor» stays selected", async () => {
    const requests = recordRequests();
    await renderPage("admin", "?vista=bloquejos");
    await screen.findByText("Reg de la sorra");
    const valueRequests = () =>
      requests.filter((url) => url.pathname.endsWith("/ring-blocks/filter-values"));
    // Let the page settle: a loop would keep asking (and re-render) meanwhile.
    await new Promise((resolve) => {
      setTimeout(resolve, 600);
    });
    expect(valueRequests().map((url) => url.searchParams.get("field"))).toEqual(["ringId"]);

    fireEvent.click(screen.getByText(/^Filtre \(1\):/u));
    const value = screen.getByRole("combobox", { name: "Valor" });
    await waitFor(() => {
      expect(within(value).getAllByRole("option").length).toBeGreaterThan(1);
    });
    const second = within(value).getAllByRole("option")[1]?.getAttribute("value") ?? "";
    expect(second).not.toBe("");
    fireEvent.change(value, { target: { value: second } });
    await new Promise((resolve) => {
      setTimeout(resolve, 600);
    });
    expect(screen.getByRole("combobox", { name: "Valor" })).toHaveValue(second);
    expect(valueRequests()).toHaveLength(1);
  });

  it("E5-W05 round 2 #2 (ruling E80): the blocks' «Dia i hora» filter is a range of club dates sent as `between` with the club's day bounds, with no suggested values", async () => {
    const requests = recordRequests();
    await renderPage("admin", "?vista=bloquejos");
    await screen.findByText("Reg de la sorra");
    fireEvent.click(screen.getByText(/^Filtre \(1\):/u));
    fireEvent.change(screen.getByRole("combobox", { name: "Columna" }), {
      target: { value: "from" },
    });
    expect(
      within(screen.getByRole("combobox", { name: "Operador" }))
        .getAllByRole("option")
        .map((option) => option.getAttribute("value")),
    ).toEqual(["between"]);
    // Two club dates instead of the value list.
    expect(screen.queryByRole("combobox", { name: "Valor" })).toBeNull();
    const add = screen.getByRole("button", { name: "Afegeix el filtre" });
    expect(add).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Des del"), { target: { value: "2026-08-04" } });
    expect(add).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Fins al"), { target: { value: "2026-08-05" } });
    fireEvent.click(add);
    await waitFor(() => {
      const last = requests.filter((url) => url.pathname.endsWith("/ring-blocks")).at(-1);
      // Europe/Madrid (CEST): dt 4 at 00:00 is 22:00Z of the 3rd; the range ends when dj 6 starts.
      expect(last?.searchParams.getAll("filter")).toEqual([
        "from:between:2026-08-03T22:00:00Z,2026-08-05T22:00:00Z",
      ]);
    });
    await waitFor(() => {
      expect(screen.getByText(/^Filtre \(1\): Dia i hora = «4 al 5 d.agost»$/u)).toBeVisible();
    });
    // The day summer time ends (dg 25-10): 24 hours from 00:00 CEST to the next 00:00 CET.
    fireEvent.change(screen.getByLabelText("Des del"), { target: { value: "2026-10-25" } });
    fireEvent.change(screen.getByLabelText("Fins al"), { target: { value: "2026-10-25" } });
    fireEvent.click(add);
    await waitFor(() => {
      const last = requests.filter((url) => url.pathname.endsWith("/ring-blocks")).at(-1);
      expect(last?.searchParams.getAll("filter")).toEqual([
        "from:between:2026-10-24T22:00:00Z,2026-10-25T23:00:00Z",
      ]);
    });
    expect(await screen.findByText(/^Filtre \(1\): Dia i hora = «25 d.octubre»$/u)).toBeVisible();
    // Over two years the chip names both.
    fireEvent.change(screen.getByLabelText("Des del"), { target: { value: "2026-12-28" } });
    fireEvent.change(screen.getByLabelText("Fins al"), { target: { value: "2027-01-03" } });
    fireEvent.click(add);
    expect(
      await screen.findByText(
        /^Filtre \(1\): Dia i hora = «28 de desembre del? 2026 – 3 de gener del? 2027»$/u,
      ),
    ).toBeVisible();
    expect(
      requests.some(
        (url) =>
          url.pathname.endsWith("/ring-blocks/filter-values") &&
          url.searchParams.get("field") === "from",
      ),
    ).toBe(false);
  });

  it("E5-W05 step 5: with more than 1000 blocks, the ring filter offers «Cadells», which appears only after row 1000, from GET /ring-blocks/filter-values", async () => {
    const requests = recordRequests();
    await renderPage("registerMany", "?vista=bloquejos");
    await screen.findAllByText(/^Revisió \d+$/u);
    const options = await filterOptions("ringId");
    expect(options).toContain("Cadells (5)");
    expect(
      requests.some(
        (url) =>
          url.pathname.endsWith("/ring-blocks/filter-values") &&
          url.searchParams.get("field") === "ringId",
      ),
    ).toBe(true);
    expect(
      requests.some(
        (url) => url.pathname.endsWith("/ring-blocks") && url.searchParams.get("size") === "1000",
      ),
    ).toBe(false);
  });
});
