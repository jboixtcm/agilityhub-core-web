import { createApiClient } from "@agilityhub/api-client";
import {
  mockScenario,
  type MockScenario,
  resetFollowupMockState,
} from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminNavigation } from "../App";

import { FollowUpPage } from "./FollowUpPage";
import { FOLLOWUP_UNREAD_POLL_MS, useUnreadFollowUp } from "./unread";

const canic: Branding = {
  ...brandingCanicFixture,
  locales: ["ca", "es", "en"],
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};
/** After every row of the D14 world (the last note is of 19-08 at 19:02 club-local). */
const INBOX_NOW = "2026-08-20T10:00:00+02:00";

const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/gu, " ").trim();

interface Recorded {
  key: string | null;
  line: string;
}

function recordRequests(): Recorded[] {
  const list: Recorded[] = [];
  server.events.on("request:start", ({ request }) => {
    const url = new URL(request.url);
    list.push({
      key: request.headers.get("Idempotency-Key"),
      line: decodeURIComponent(
        `${request.method} ${url.pathname.replace(/^\/api\/v1/u, "")}${url.search}`,
      ),
    });
  });
  return list;
}

function client(locale = "ca") {
  return createApiClient({ baseUrl: `${window.location.origin}/api/v1`, getLocale: () => locale });
}

async function renderFollowUp({
  locale = "ca",
  path = "/seguiment",
  scenario = "admin",
}: { locale?: "ca" | "en" | "es"; path?: string; scenario?: MockScenario } = {}) {
  mockScenario(scenario);
  window.history.replaceState(null, "", path);
  const i18n = await createI18n({
    branding: canic,
    browserLanguages: [locale],
    initialNamespaces: ["admin-census", "census", "enums", "errors", "common"],
    storage: undefined,
  });
  const onNavigate = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={canic}>
        <FollowUpPage client={client(locale)} onNavigate={onNavigate} />
      </BrandingProvider>
    </I18nextProvider>,
  );
  await screen.findByRole("heading", { level: 1 });
  return { onNavigate };
}

/** The table's rows as text, one cell per column, with «*» on the highlighted ones. */
async function tableRows(): Promise<string[]> {
  await waitFor(() => {
    expect(
      document.querySelectorAll(".ah-universal-list tbody tr .followup__member"),
    ).not.toHaveLength(0);
  });
  return [...document.querySelectorAll<HTMLElement>(".ah-universal-list tbody tr")].map((row) => {
    const cells = [...row.querySelectorAll("td")]
      .map((cell) => clean(cell.textContent))
      .filter((text) => text !== "");
    return `${row.classList.contains("followup__row--unread") ? "* " : ""}${cells.join(" | ")}`;
  });
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  vi.useFakeTimers({ now: new Date(INBOX_NOW), shouldAdvanceTime: true, toFake: ["Date"] });
  resetFollowupMockState();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  server.events.removeAllListeners();
  server.resetHandlers();
  vi.useRealTimers();
  resetFollowupMockState();
  mockScenario("admin");
  window.history.replaceState(null, "", "/");
});
afterAll(() => {
  server.close();
});

describe("T-10-30 D14 «Seguiment alumnes» (S10 §2, R-10-13)", () => {
  it("mockup D14 for an ADMIN: «5 pendents de llegir», the columns, the five rows highlighted and in the api's order, the authors by gender and the completed task", async () => {
    await renderFollowUp();
    expect(screen.getByRole("heading", { level: 1, name: "Seguiment alumnes" })).toBeVisible();
    expect(await screen.findByText("5 pendents de llegir")).toBeVisible();
    expect(
      [...document.querySelectorAll(".ah-universal-list thead th")]
        .map((cell) => clean(cell.textContent))
        .filter((text) => text !== ""),
    ).toEqual(["Abonat", "Gos", "Nivell", "Data↓", "Creador", "Text", "Creació", "Finalització"]);
    // The last cell is the row's link to D13, named for screen readers.
    expect(await tableRows()).toEqual([
      "* Laura Serra · no llegit | Duna | C | 19-08 | Laura (alumna) | A veure si treballem una mica el doble a classe. El gos s'atura molt aviat al balancí | 19-08 | — | Obre la fitxa de Duna",
      "* Pau Riera · no llegit | Blat | B | 19-08 | Pau (alumne) | Aquesta setmana no podrem venir dijous | 19-08 | — | Obre la fitxa de Blat",
      "* Laura Serra · no llegit | Duna | C | 12-08 | Estel (tasca) | Practiqueu el balancí amb calma: sessions curtes | 12-08 | — | Obre la fitxa de Duna",
      "* Anna Ballart · no llegit | Nass | B | 10-08 | Marc (tasca) | Repasseu la taula de contactes al jardí | 10-08 | — | Obre la fitxa de Nass",
      "* Laura Serra · no llegit | Duna | C | 28-07 | Estel (tasca) | Treballar l'«espera» a la sortida | 28-07 | 02-08 | Obre la fitxa de Duna",
    ]);
    const done = screen.getByText("Treballar l'«espera» a la sortida");
    expect(done).toHaveClass("followup__text--done");
    expect(
      within(done.closest("tr") ?? document.body)
        .getByText("02-08")
        .closest(".ah-badge"),
    ).toHaveClass("ah-tone--success");
  });

  it("for the instructor the api's order puts the three unread rows first (her own tasks are not unread) and the counter reads 3", async () => {
    await renderFollowUp({ scenario: "instructor" });
    expect(await screen.findByText("3 pendents de llegir")).toBeVisible();
    const rows = await tableRows();
    expect(rows.map((row) => row.startsWith("* "))).toEqual([true, true, true, false, false]);
    expect(rows.map((row) => row.split(" | ")[4])).toEqual([
      "Laura (alumna)",
      "Pau (alumne)",
      "Marc (tasca)",
      "Estel (tasca)",
      "Estel (tasca)",
    ]);
  });

  it("the three chips map to filter=kind:eq:TASK, kind:eq:MEMBER_NOTE and no kind filter", async () => {
    const requests = recordRequests();
    await renderFollowUp();
    await tableRows();
    const chips = within(screen.getByRole("group", { name: "Què es mostra" }));
    expect(chips.getByRole("button", { name: "Tot" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chips.getByRole("button", { name: "Tasques" }));
    await waitFor(() => {
      expect(
        requests.filter((request) => request.line.startsWith("GET /followup?")).at(-1)?.line,
      ).toContain("filter=kind:eq:TASK");
    });
    expect(chips.getByRole("button", { name: "Tasques" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(async () => {
      expect(await tableRows()).toHaveLength(3);
    });
    fireEvent.click(chips.getByRole("button", { name: "Notes d'alumnes" }));
    await waitFor(() => {
      expect(
        requests.filter((request) => request.line.startsWith("GET /followup?")).at(-1)?.line,
      ).toContain("filter=kind:eq:MEMBER_NOTE");
    });
    await waitFor(async () => {
      expect(await tableRows()).toHaveLength(2);
    });
    fireEvent.click(chips.getByRole("button", { name: "Tot" }));
    await waitFor(() => {
      expect(
        requests.filter((request) => request.line.startsWith("GET /followup?")).at(-1)?.line,
      ).not.toContain("kind:");
    });
    expect(window.location.search).not.toContain("kind");
  });

  it("«Marcar-ho tot com a llegit» calls read-all with its key, puts the counter at 0 and reads the list again", async () => {
    const requests = recordRequests();
    await renderFollowUp();
    await tableRows();
    const listReads = () =>
      requests.filter((request) => request.line.startsWith("GET /followup?")).length;
    const before = listReads();
    fireEvent.click(screen.getByRole("button", { name: "Marcar-ho tot com a llegit" }));
    expect(await screen.findByText("0 pendents de llegir")).toBeVisible();
    await waitFor(async () => {
      expect((await tableRows()).some((row) => row.startsWith("* "))).toBe(false);
    });
    const readAll = requests.filter((request) => request.line === "POST /followup/read-all");
    expect(readAll).toHaveLength(1);
    expect(readAll[0]?.key).toMatch(/^[0-9a-f-]{36}$/u);
    expect(listReads()).toBe(before + 1);
  });

  it("a row click calls read for that row, drops its highlight and the counter at once, and opens D13 (the dog's record)", async () => {
    const requests = recordRequests();
    const { onNavigate } = await renderFollowUp();
    await tableRows();
    fireEvent.click(screen.getByRole("link", { name: "Aquesta setmana no podrem venir dijous" }));
    expect(onNavigate).toHaveBeenCalledWith("/alumnes/dog-blat");
    expect(await screen.findByText("4 pendents de llegir")).toBeVisible();
    expect((await tableRows())[1]?.startsWith("* ")).toBe(false);
    await waitFor(() => {
      expect(
        requests.filter((request) => request.line === "POST /followup/f-note-blat/read"),
      ).toHaveLength(1);
    });
    expect(
      requests.find((request) => request.line === "POST /followup/f-note-blat/read")?.key,
    ).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it("400 INVALID_FILTER shows the list's own message; levels.enabled off drops the «Nivell» column", async () => {
    await renderFollowUp({ path: "/seguiment?filter=text:eq:x" });
    expect(await screen.findByText("El filtre no és vàlid.")).toBeVisible();
    cleanup();
    await renderFollowUp({ scenario: "planningNoLevels" });
    await tableRows();
    expect(screen.queryByRole("columnheader", { name: "Nivell" })).toBeNull();
  });

  it("the pages hold at most 50 rows: only 20 and 50 are offered, and a size of 200 in the address becomes 50", async () => {
    const requests = recordRequests();
    await renderFollowUp({ path: "/seguiment?size=200" });
    await tableRows();
    expect(requests.find((request) => request.line.startsWith("GET /followup?"))?.line).toContain(
      "size=50",
    );
    expect(
      [
        ...screen.getByRole("combobox", { name: "files per pàgina" }).querySelectorAll("option"),
      ].map((option) => option.value),
    ).toEqual(["20", "50"]);
  });
});

describe("T-10-30 the menu counter (S10 §2 row D14, step 6)", () => {
  it("reads unread-count on mount, every 60 s and on focus; never when disabled", async () => {
    vi.useRealTimers();
    vi.useFakeTimers({
      now: new Date(INBOX_NOW),
      shouldAdvanceTime: true,
      toFake: ["Date", "setInterval", "clearInterval"],
    });
    const requests = recordRequests();
    mockScenario("admin");
    const api = client();
    const { result } = renderHook(() => useUnreadFollowUp(api, true));
    await waitFor(() => {
      expect(result.current.count).toBe(5);
    });
    const counts = () =>
      requests.filter((request) => request.line === "GET /followup/unread-count").length;
    expect(counts()).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FOLLOWUP_UNREAD_POLL_MS);
    });
    await waitFor(() => {
      expect(counts()).toBe(2);
    });
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => {
      expect(counts()).toBe(3);
    });
    const before = counts();
    const disabled = renderHook(() => useUnreadFollowUp(api, false));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FOLLOWUP_UNREAD_POLL_MS);
    });
    expect(disabled.result.current.count).toBeUndefined();
    // Only the enabled hook read again (one more for its own timer).
    expect(counts()).toBe(before + 1);
  });

  it("a local change wins over an answer requested before it (a row read while the count is in flight)", async () => {
    mockScenario("admin");
    const api = client();
    const { result } = renderHook(() => useUnreadFollowUp(api, true));
    await waitFor(() => {
      expect(result.current.count).toBe(5);
    });
    act(() => {
      window.dispatchEvent(new Event("focus"));
      result.current.markOneRead();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(result.current.count).toBe(4);
  });
});

describe("E6-W03 step 5 the D14 entry for instructors (S10 §2) and the D12 entry", () => {
  async function renderNavigation(
    roles: ("ADMIN" | "INSTRUCTOR")[],
    modules = canic.modules,
    unread?: number,
  ) {
    const i18n = await createI18n({
      branding: canic,
      browserLanguages: ["ca"],
      initialNamespaces: ["shell"],
      storage: undefined,
    });
    render(
      <I18nextProvider i18n={i18n}>
        <BrandingProvider branding={canic}>
          <AdminNavigation
            followUpUnread={unread}
            modules={modules}
            pathname="/agenda"
            roles={roles}
          />
        </BrandingProvider>
      </I18nextProvider>,
    );
  }

  it("an instructor sees «Persones» with «Seguiment alumnes» and its counter only, and «Agenda de la setmana» (current) once, on /agenda", async () => {
    await renderNavigation(["INSTRUCTOR"], canic.modules, 3);
    expect(screen.getByRole("heading", { name: "Persones" })).toBeVisible();
    expect(screen.getByRole("link", { name: /Seguiment alumnes\s*3/u })).toHaveAttribute(
      "href",
      "/seguiment",
    );
    expect(screen.queryByRole("link", { name: "Abonats" })).toBeNull();
    expect(screen.queryByRole("link", { name: /Preinscripcions/u })).toBeNull();
    const agenda = screen.getAllByRole("link", { name: "Agenda de la setmana" });
    expect(agenda).toHaveLength(1);
    expect(agenda[0]).toHaveAttribute("href", "/agenda");
    expect(document.querySelectorAll('a[href="/agenda"]')).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Entrenaments" })).toHaveAttribute(
      "href",
      "/entrenaments",
    );
    // Mockups D12 and D13 (organizer 30-09): «Agenda de la setmana» and «Alumnes» in «Instructor»,
    // the first group an instructor sees.
    const groups = [...document.querySelectorAll(".ah-sidebar__group")];
    expect(groups.map((group) => group.querySelector("h2")?.textContent)).toEqual([
      "Instructor",
      "Persones",
      "Camp",
    ]);
    expect(
      [...(groups[0]?.querySelectorAll("a") ?? [])].map((link) => link.getAttribute("href")),
    ).toEqual(["/agenda", "/alumnes"]);
  });

  it("TASKS off: no «Seguiment alumnes» and no counter; an instructor then has no «Persones» group", async () => {
    await renderNavigation(
      ["INSTRUCTOR"],
      canic.modules.filter((module) => module !== "TASKS"),
      3,
    );
    expect(screen.queryByRole("link", { name: /Seguiment alumnes/u })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Persones" })).toBeNull();
    cleanup();
    await renderNavigation(["ADMIN"], canic.modules, 0);
    expect(screen.getByRole("link", { name: "Seguiment alumnes" })).toBeVisible();
  });
});

describe("T-10-32 (D14) the three locales, with no missing key", () => {
  it.each([
    [
      "es",
      "Seguimiento de alumnos",
      "5 pendientes de leer",
      "Laura (alumna)",
      "Pau (alumno)",
      "Estel (tarea)",
    ],
    ["en", "Student follow-up", "5 unread", "Laura (student)", "Pau (student)", "Estel (task)"],
  ] as const)("%s", async (locale, title, unread, laura, pau, estel) => {
    await renderFollowUp({ locale });
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeVisible();
    expect(await screen.findByText(unread)).toBeVisible();
    await tableRows();
    expect(screen.getAllByText(laura).length).toBeGreaterThan(0);
    expect(screen.getByText(pau)).toBeVisible();
    expect(screen.getAllByText(estel).length).toBeGreaterThan(0);
  });
});
