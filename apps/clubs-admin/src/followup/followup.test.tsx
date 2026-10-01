import { type ApiClient, createApiClient } from "@agilityhub/api-client";
import {
  handlers,
  mockScenario,
  type MockScenario,
  resetFollowupMockState,
  updateFollowupNoteMock,
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
import { delay, getResponse, http, HttpResponse } from "msw";
import { useState } from "react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminNavigation } from "../App";

import { FollowUpPage } from "./FollowUpPage";
import {
  FOLLOWUP_UNREAD_POLL_MS,
  FollowUpReadFailureNotice,
  UnreadFollowUpContext,
  useUnreadFollowUp,
} from "./unread";

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

  it("E7-W06 step 5 (E6-W04 question 6): each row carries data-followup-id and data-unread, the api's id and its unread mark", async () => {
    let answered: { id: string; unread?: boolean }[] = [];
    server.events.on("response:mocked", ({ request, response }) => {
      if (new URL(request.url).pathname !== "/api/v1/followup") return;
      void response
        .clone()
        .json()
        .then((body: { items?: { id: string; unread?: boolean }[] }) => {
          answered = body.items ?? [];
        });
    });
    await renderFollowUp({ scenario: "instructor" });
    await tableRows();
    const rows = [...document.querySelectorAll<HTMLElement>(".ah-universal-list tbody tr")];
    expect(answered.length).toBeGreaterThan(0);
    expect(rows.map((row) => [row.dataset.followupId, row.dataset.unread])).toEqual(
      answered.map((item) => [item.id, String(item.unread === true)]),
    );
    expect(rows.filter((row) => row.dataset.unread === "true")).toHaveLength(3);
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
    // The list's own read (sorted); the filter menu's counts ask with a filter of their own.
    expect(
      requests.find(
        (request) => request.line.startsWith("GET /followup?") && request.line.includes("sort="),
      )?.line,
    ).toContain("size=50");
    expect(
      [
        ...screen.getByRole("combobox", { name: "files per pàgina" }).querySelectorAll("option"),
      ].map((option) => option.value),
    ).toEqual(["20", "50"]);
  });
});

/** `POST /followup/{id}/read` answered 404 NOT_FOUND (a row hidden meanwhile, S10 §6) while `refuse` says so. */
function refuseReads(refuse: () => boolean, wait = 0) {
  server.use(
    http.post("*/api/v1/followup/:id/read", async () => {
      if (wait > 0) await delay(wait);
      if (!refuse()) return undefined;
      return HttpResponse.json(
        { code: "NOT_FOUND", details: {}, message: "Not found", traceId: "t-read" },
        { status: 404 },
      );
    }),
  );
}

/** The shell of the back office, reduced to what owns the reads: the counter and its notice. */
function Shell({ api }: { api: ApiClient }) {
  const unread = useUnreadFollowUp(api, true);
  const [page, setPage] = useState("/seguiment");
  return (
    <UnreadFollowUpContext.Provider value={unread}>
      <FollowUpReadFailureNotice unread={unread} />
      {page === "/seguiment" ? (
        <FollowUpPage client={api} onNavigate={setPage} />
      ) : (
        <>
          <p>{`D13 ${page}`}</p>
          <button
            onClick={() => {
              setPage("/seguiment");
            }}
            type="button"
          >
            D14
          </button>
        </>
      )}
    </UnreadFollowUpContext.Provider>
  );
}

describe("E6-W03 round 2: D14's reads (R-10-13) and its filter values", () => {
  it("#1 (review #2): a refused read puts the row back unread and the counter back, and says why with a retry that sends it again", async () => {
    const requests = recordRequests();
    let refuse = true;
    refuseReads(() => refuse);
    await renderFollowUp();
    await tableRows();
    fireEvent.click(screen.getByRole("link", { name: "Aquesta setmana no podrem venir dijous" }));
    const alert = await screen.findByText(
      /^No s'ha pogut marcar com a llegit el seguiment de Blat\. No s'ha trobat l'element sol·licitat\./u,
    );
    await waitFor(async () => {
      expect((await tableRows())[1]?.startsWith("* Pau Riera")).toBe(true);
    });
    expect(await screen.findByText("5 pendents de llegir")).toBeVisible();
    const reads = () =>
      requests.filter((request) => request.line === "POST /followup/f-note-blat/read");
    expect(reads()).toHaveLength(1);
    refuse = false;
    fireEvent.click(
      within(alert.closest<HTMLElement>(".ah-toast") ?? document.body).getByRole("button", {
        name: "Torna-ho a provar",
      }),
    );
    await waitFor(() => {
      expect(screen.queryByText(/^No s'ha pogut marcar com a llegit/u)).toBeNull();
    });
    expect(await screen.findByText("4 pendents de llegir")).toBeVisible();
    expect(reads()).toHaveLength(2);
    // The api answered the first one: the retry is a new submission, with its own key.
    expect(reads()[1]?.key).not.toBe(reads()[0]?.key);
  });

  it("#1: the read belongs to the shell, so its failure is said on D13, where the user already is", async () => {
    let refuse = true;
    refuseReads(() => refuse, 80);
    mockScenario("admin");
    window.history.replaceState(null, "", "/seguiment");
    const i18n = await createI18n({
      branding: canic,
      browserLanguages: ["ca"],
      initialNamespaces: ["admin-census", "census", "enums", "errors", "common"],
      storage: undefined,
    });
    render(
      <I18nextProvider i18n={i18n}>
        <BrandingProvider branding={canic}>
          <Shell api={client()} />
        </BrandingProvider>
      </I18nextProvider>,
    );
    await tableRows();
    fireEvent.click(screen.getByRole("link", { name: "Aquesta setmana no podrem venir dijous" }));
    expect(screen.getByText("D13 /alumnes/dog-blat")).toBeVisible();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "No s'ha pogut marcar com a llegit el seguiment de Blat. No s'ha trobat l'element sol·licitat.",
    );
    refuse = false;
    fireEvent.click(within(alert).getByRole("button", { name: "Torna-ho a provar" }));
    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
    expect(screen.getByText("D13 /alumnes/dog-blat")).toBeVisible();
  });

  it("#1: a read that got no answer says so, and its retry keeps the key", async () => {
    const requests = recordRequests();
    let offline = true;
    server.use(
      http.post("*/api/v1/followup/:id/read", () => (offline ? HttpResponse.error() : undefined)),
    );
    await renderFollowUp();
    await tableRows();
    fireEvent.click(screen.getByRole("link", { name: "Aquesta setmana no podrem venir dijous" }));
    const alert = await screen.findByText(
      "No s'ha pogut marcar com a llegit el seguiment de Blat. No hi ha connexió amb el servidor.",
    );
    offline = false;
    fireEvent.click(
      within(alert.closest<HTMLElement>(".ah-toast") ?? document.body).getByRole("button", {
        name: "Torna-ho a provar",
      }),
    );
    await waitFor(() => {
      expect(screen.queryByText(/^No s'ha pogut marcar com a llegit/u)).toBeNull();
    });
    const reads = requests.filter((request) => request.line === "POST /followup/f-note-blat/read");
    expect(reads).toHaveLength(2);
    expect(reads[1]?.key).toBe(reads[0]?.key);
  });

  it("#3 (review #4): a note updated while D14 is open still shows «llegit»; a click on its row sends the read", async () => {
    const requests = recordRequests();
    const { onNavigate } = await renderFollowUp({ scenario: "followupAllRead" });
    expect(await screen.findByText("0 pendents de llegir")).toBeVisible();
    expect((await tableRows()).some((row) => row.startsWith("* "))).toBe(false);
    // Meanwhile Laura edits her note: unread again for the instructor, not yet on this screen.
    expect(updateFollowupNoteMock("f-note-duna", "2026-08-20T07:30:00Z")).toBe(true);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(await screen.findByText("1 pendent de llegir")).toBeVisible();
    expect((await tableRows())[0]?.startsWith("* ")).toBe(false);
    fireEvent.click(
      screen.getByRole("link", {
        name: "A veure si treballem una mica el doble a classe. El gos s'atura molt aviat al balancí",
      }),
    );
    expect(onNavigate).toHaveBeenCalledWith("/alumnes/dog-duna");
    await waitFor(() => {
      expect(
        requests.filter((request) => request.line === "POST /followup/f-note-duna/read"),
      ).toHaveLength(1);
    });
    expect(await screen.findByText("0 pendents de llegir")).toBeVisible();
  });

  it("#5 (review #1): «Tipus» and «Pendent de llegir» offer the contract's values with the api's counts, also when the first page holds only unread notes", async () => {
    const requests = recordRequests();
    await renderFollowUp({ scenario: "followupMany" });
    const rows = await tableRows();
    expect(rows).toHaveLength(50);
    expect(rows.every((row) => row.startsWith("* ") && row.includes("(alumna)"))).toBe(true);
    const summary = [...document.querySelectorAll("summary")].find((element) =>
      element.textContent.trim().startsWith("Filtre"),
    );
    if (summary === undefined) throw new TypeError("No filter menu");
    fireEvent.click(summary);
    const filters = summary.parentElement ?? document.body;
    const field = within(filters).getByLabelText("Columna");
    const options = () =>
      within(within(filters).getByLabelText("Valor"))
        .getAllByRole("option")
        .map((option) => option.textContent);
    // «Tipus» is the first column, chosen when the menu opens.
    expect(field).toHaveValue("kind");
    await waitFor(() => {
      expect(options()).toEqual(["tasca (3)", "nota d'alumne (54)"]);
    });
    fireEvent.change(field, { target: { value: "unread" } });
    await waitFor(() => {
      expect(options()).toEqual(["no llegit (54)", "llegit (3)"]);
    });
    expect(
      requests
        .filter((request) => request.line.startsWith("GET /followup?"))
        .map((request) => request.line),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("filter=kind:eq:TASK"),
        expect.stringContaining("filter=kind:eq:MEMBER_NOTE"),
        expect.stringContaining("filter=unread:eq:true"),
        expect.stringContaining("filter=unread:eq:false"),
      ]),
    );
  });
});

describe("E6-W04 step 0c: D14's relation filters and search (GET /followup/filter-values and q, api E6-T06, ruling E75)", () => {
  /** Opens the list's filter menu; `pick` chooses a «Columna» and reads its «Valor» options. */
  function filterMenu() {
    const summary = [...document.querySelectorAll("summary")].find((element) =>
      element.textContent.trim().startsWith("Filtre"),
    );
    if (summary === undefined) throw new TypeError("No filter menu");
    fireEvent.click(summary);
    const menu = summary.parentElement ?? document.body;
    const options = () =>
      within(within(menu).getByLabelText("Valor"))
        .getAllByRole("option")
        .map((option) => option.textContent);
    const pick = async (field: string, expected: readonly string[]) => {
      fireEvent.change(within(menu).getByLabelText("Columna"), { target: { value: field } });
      await waitFor(() => {
        expect(options()).toEqual(expected);
      });
    };
    return { menu, pick };
  }

  const valueReads = (requests: Recorded[]) =>
    requests
      .filter((request) => request.line.startsWith("GET /followup/filter-values?"))
      .map((request) => new URL(request.line.slice(4), window.location.origin).searchParams);

  it("E6-W04 step 0c: «Abonat», «Gos» and «Creador» offer the api's values with their counts over the whole set — also the members, dogs and authors only rows beyond the first page have — and a creator picked is named in the chip", async () => {
    const requests = recordRequests();
    await renderFollowUp({ scenario: "followupMany" });
    const rows = await tableRows();
    // The first page (50) holds only Laura's notes on Duna.
    expect(rows).toHaveLength(50);
    expect(rows.every((row) => row.includes("Laura Serra") && row.includes("| Duna |"))).toBe(true);
    const { menu, pick } = filterMenu();
    await pick("memberId", ["Anna Ballart (1)", "Laura Serra (55)", "Pau Riera (1)"]);
    await pick("dogId", ["Blat (1)", "Duna (55)", "Nass (1)"]);
    await pick("authorAccountId", ["Estel (2)", "Laura (53)", "Marc (1)", "Pau (1)"]);
    expect(
      within(within(menu).getByLabelText("Columna"))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toContain("Creador");
    expect(valueReads(requests).map((query) => query.get("field"))).toEqual(
      expect.arrayContaining(["memberId", "dogId", "authorAccountId"]),
    );
    // Never from the rows on screen: no list read of 50 rows serves the relation values.
    expect(
      requests.filter(
        (request) => request.line.startsWith("GET /followup?") && !request.line.includes("filter="),
      ),
    ).toHaveLength(1);

    const value = within(menu).getByLabelText("Valor");
    const marc = within(value)
      .getAllByRole("option")
      .find((option) => option.textContent === "Marc (1)");
    fireEvent.change(value, { target: { value: marc?.getAttribute("value") ?? "" } });
    fireEvent.click(within(menu).getByRole("button", { name: "Afegeix el filtre" }));
    await waitFor(async () => {
      expect(await tableRows()).toEqual([
        "Anna Ballart | Nass | B | 10-08 | Marc (tasca) | Repasseu la taula de contactes al jardí | 10-08 | — | Obre la fitxa de Nass",
      ]);
    });
    const last = requests.filter((request) => request.line.startsWith("GET /followup?")).at(-1);
    expect(last?.line).toMatch(/filter=authorAccountId:eq:[0-9a-f-]{36}/u);
    expect(await screen.findByText("Filtre (1): Creador = «Marc»")).toBeVisible();
  });

  it("E6-W04 step 0c (its review): a «Creador» filter that comes with the address is named from the api's labels, never shown as its account id", async () => {
    mockScenario("followupMany");
    const values = await createApiClient({ baseUrl: `${window.location.origin}/api/v1` }).GET(
      "/followup/filter-values",
      { params: { query: { field: "authorAccountId" } } },
    );
    const marc = values.data?.values.find((item) => item.label === "Marc");
    if (marc === undefined) throw new TypeError("No «Marc» among the authors");
    const id = String(marc.value);
    await renderFollowUp({
      path: `/seguiment?filter=${encodeURIComponent(`authorAccountId:eq:${id}`)}`,
      scenario: "followupMany",
    });
    expect(await screen.findByText("Filtre (1): Creador = «Marc»")).toBeVisible();
    expect(screen.queryByText(new RegExp(id, "u"))).toBeNull();
  });

  it("E6-W04 step 0c: the search box sends q to GET /followup and the rows narrow to what the api finds in the member, the dog, the author and the task's whole text; the filter values follow the search", async () => {
    const requests = recordRequests();
    await renderFollowUp();
    expect(await tableRows()).toHaveLength(5);
    const search = screen.getByRole("searchbox", { name: "Cerca al seguiment" });
    const listReads = () =>
      requests
        .filter((request) => request.line.startsWith("GET /followup?"))
        .map((request) => request.line);
    // A word of the task's whole text, beyond its excerpt («… sessions curtes i moltes recompenses»).
    fireEvent.change(search, { target: { value: "recompenses" } });
    await waitFor(async () => {
      expect(await tableRows()).toEqual([
        "* Laura Serra · no llegit | Duna | C | 12-08 | Estel (tasca) | Practiqueu el balancí amb calma: sessions curtes | 12-08 | — | Obre la fitxa de Duna",
      ]);
    });
    expect(listReads().at(-1)).toContain("q=recompenses");
    // The author («Marc», who wrote a task) and the dog («Blat»).
    fireEvent.change(search, { target: { value: "marc" } });
    await waitFor(async () => {
      expect((await tableRows()).map((row) => row.split(" | ")[0])).toEqual([
        "* Anna Ballart · no llegit",
      ]);
    });
    expect(listReads().at(-1)).toContain("q=marc");
    fireEvent.change(search, { target: { value: "Blat" } });
    await waitFor(async () => {
      expect((await tableRows()).map((row) => row.split(" | ")[1])).toEqual(["Blat"]);
    });
    const { pick } = filterMenu();
    await pick("memberId", ["Pau Riera (1)"]);
    expect(valueReads(requests).at(-1)?.get("q")).toBe("Blat");
  });
});

describe("E6-W05 (review of E6-W03's round 2): D14's counter and rows after a failed read", () => {
  const blat = () => screen.getByRole("link", { name: "Aquesta setmana no podrem venir dijous" });
  const failureText =
    "No s'ha pogut marcar com a llegit el seguiment de Blat. No hi ha connexió amb el servidor.";
  const retryIn = (alert: HTMLElement) =>
    within(alert.closest<HTMLElement>(".ah-toast") ?? document.body).getByRole("button", {
      name: "Torna-ho a provar",
    });

  it("step 5 (R-10-13): offline, a failed read whose counter refresh fails too puts the counter back at its value, a failed retry does not lower it, and the api's count wins when it answers (E6-W04 step 0d: a count other than the restored one)", async () => {
    const requests = recordRequests();
    await renderFollowUp();
    await tableRows();
    expect(await screen.findByText("5 pendents de llegir")).toBeVisible();
    let offline = true;
    server.use(
      http.post("*/api/v1/followup/:id/read", () => (offline ? HttpResponse.error() : undefined)),
      http.get("*/api/v1/followup/unread-count", () =>
        offline ? HttpResponse.error() : undefined,
      ),
    );
    const counts = () =>
      requests.filter((request) => request.line === "GET /followup/unread-count").length;
    const before = counts();
    fireEvent.click(blat());
    expect(await screen.findByText("4 pendents de llegir")).toBeVisible();
    const alert = await screen.findByText(failureText);
    // The counter's refresh was asked for, and it failed too.
    await waitFor(() => {
      expect(counts()).toBe(before + 1);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(screen.getByText("5 pendents de llegir")).toBeVisible();
    await waitFor(async () => {
      expect((await tableRows())[1]?.startsWith("* Pau Riera")).toBe(true);
    });
    fireEvent.click(retryIn(alert));
    await screen.findByText(failureText);
    await waitFor(() => {
      expect(counts()).toBe(before + 2);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(screen.getByText("5 pendents de llegir")).toBeVisible();
    expect(
      requests.filter((request) => request.line === "POST /followup/f-note-blat/read"),
    ).toHaveLength(2);
    // E6-W04 step 0d: meanwhile the same account reads Duna's note elsewhere, so the api counts 4,
    // not the 5 restored here.
    const elsewhere = await getResponse(
      handlers,
      new Request(`${window.location.origin}/api/v1/followup/f-note-duna/read`, {
        headers: { "Idempotency-Key": crypto.randomUUID() },
        method: "POST",
      }),
    );
    expect(elsewhere?.status).toBe(204);
    // Back online, the api's own count is what shows.
    offline = false;
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => {
      expect(counts()).toBe(before + 3);
    });
    expect(await screen.findByText("4 pendents de llegir")).toBeVisible();
    expect(screen.queryByText("5 pendents de llegir")).toBeNull();
  });

  it("step 6 (R-10-13): a failed read, back to D14, a successful retry — the row loses its highlight and the counter drops", async () => {
    let offline = true;
    server.use(
      http.post("*/api/v1/followup/:id/read", () => (offline ? HttpResponse.error() : undefined)),
    );
    mockScenario("admin");
    window.history.replaceState(null, "", "/seguiment");
    const i18n = await createI18n({
      branding: canic,
      browserLanguages: ["ca"],
      initialNamespaces: ["admin-census", "census", "enums", "errors", "common"],
      storage: undefined,
    });
    render(
      <I18nextProvider i18n={i18n}>
        <BrandingProvider branding={canic}>
          <Shell api={client()} />
        </BrandingProvider>
      </I18nextProvider>,
    );
    await tableRows();
    fireEvent.click(blat());
    expect(screen.getByText("D13 /alumnes/dog-blat")).toBeVisible();
    await screen.findByText(failureText);
    fireEvent.click(screen.getByRole("button", { name: "D14" }));
    await waitFor(async () => {
      expect((await tableRows())[1]?.startsWith("* Pau Riera")).toBe(true);
    });
    expect(await screen.findByText("5 pendents de llegir")).toBeVisible();
    offline = false;
    fireEvent.click(retryIn(screen.getByText(failureText)));
    await waitFor(() => {
      expect(screen.queryByText(failureText)).toBeNull();
    });
    // Read now, the row is no longer highlighted (and the api lists it after the unread ones).
    await waitFor(async () => {
      expect((await tableRows()).find((row) => row.includes("Pau Riera"))).toMatch(/^Pau Riera/u);
    });
    expect(await screen.findByText("4 pendents de llegir")).toBeVisible();
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

/** `409 IDEMPOTENCY_KEY_REUSED {reason: IN_PROGRESS}` as the api answers it (CONVENCIONS_API §6, §7). */
const IN_PROGRESS_BODY = {
  code: "IDEMPOTENCY_KEY_REUSED",
  details: { reason: "IN_PROGRESS" },
  message: "The first request with this Idempotency-Key is still in progress",
  traceId: "t-in-progress",
};
/** `common:inProgress` in ca (E80); never `errors:IDEMPOTENCY_KEY_REUSED`'s text. */
const IN_PROGRESS_TEXT = "L'operació encara està en curs. Torna-ho a provar d'aquí a un moment.";
const KEY_REUSED_TEXT = "La clau d'idempotència ja s'ha utilitzat per a una altra petició.";

describe("E7-W06 step 1 (CONVENCIONS_API §7, E79, E80): D14's keyed writes keep their key on IN_PROGRESS", () => {
  it("E7-W06 step 1: D14's read-all keeps its Idempotency-Key on IN_PROGRESS, says «L'operació encara està en curs…», the retry sends the same key, and a new read-all after the api's answer takes a new key", async () => {
    const requests = recordRequests();
    let answers = 0;
    server.use(
      http.post("*/api/v1/followup/read-all", () => {
        answers += 1;
        return answers === 1 ? HttpResponse.json(IN_PROGRESS_BODY, { status: 409 }) : undefined;
      }),
    );
    await renderFollowUp();
    await tableRows();
    const readAll = () => screen.getByRole("button", { name: "Marcar-ho tot com a llegit" });
    const posts = () => requests.filter((request) => request.line === "POST /followup/read-all");
    fireEvent.click(readAll());
    expect(await screen.findByText(IN_PROGRESS_TEXT)).toBeVisible();
    expect(screen.queryByText(KEY_REUSED_TEXT)).toBeNull();
    // Not the read-all's answer: nothing is marked read yet.
    expect(screen.getByText("5 pendents de llegir")).toBeVisible();
    fireEvent.click(readAll());
    expect(await screen.findByText("0 pendents de llegir")).toBeVisible();
    expect(screen.queryByText(IN_PROGRESS_TEXT)).toBeNull();
    // The api answered it: the next read-all is a new submission.
    fireEvent.click(readAll());
    await waitFor(() => {
      expect(posts()).toHaveLength(3);
    });
    const keys = posts().map((request) => request.key);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/u);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("E7-W06 review #5: an unanswered read-all keeps its key for 5 minutes only — a read-all asked for later is a new one, which moves readAllAt on instead of replaying the old answer", async () => {
    const requests = recordRequests();
    let answers = 0;
    server.use(
      http.post("*/api/v1/followup/read-all", () => {
        answers += 1;
        return answers === 1 ? HttpResponse.json(IN_PROGRESS_BODY, { status: 409 }) : undefined;
      }),
    );
    await renderFollowUp();
    await tableRows();
    const readAll = () => screen.getByRole("button", { name: "Marcar-ho tot com a llegit" });
    const posts = () => requests.filter((request) => request.line === "POST /followup/read-all");
    fireEvent.click(readAll());
    expect(await screen.findByText(IN_PROGRESS_TEXT)).toBeVisible();
    vi.setSystemTime(Date.now() + 5 * 60_000 + 1_000);
    await waitFor(() => {
      expect(readAll()).toBeEnabled();
    });
    fireEvent.click(readAll());
    expect(await screen.findByText("0 pendents de llegir")).toBeVisible();
    const keys = posts().map((request) => request.key);
    expect(keys).toHaveLength(2);
    expect(keys[1]).not.toBe(keys[0]);
  });

  it("E7-W06 step 1: D14's row read keeps its Idempotency-Key on IN_PROGRESS, says «L'operació encara està en curs…» with its retry, the retry sends the same key, and the next read of that row after the api's answer takes a new key", async () => {
    const requests = recordRequests();
    let answers = 0;
    server.use(
      http.post("*/api/v1/followup/:id/read", () => {
        answers += 1;
        return answers === 1 ? HttpResponse.json(IN_PROGRESS_BODY, { status: 409 }) : undefined;
      }),
    );
    await renderFollowUp();
    await tableRows();
    const blat = () => screen.getByRole("link", { name: "Aquesta setmana no podrem venir dijous" });
    const reads = () =>
      requests.filter((request) => request.line === "POST /followup/f-note-blat/read");
    fireEvent.click(blat());
    const alert = await screen.findByText(
      `No s'ha pogut marcar com a llegit el seguiment de Blat. ${IN_PROGRESS_TEXT}`,
    );
    expect(screen.queryByText(new RegExp(KEY_REUSED_TEXT, "u"))).toBeNull();
    fireEvent.click(
      within(alert.closest<HTMLElement>(".ah-toast") ?? document.body).getByRole("button", {
        name: "Torna-ho a provar",
      }),
    );
    await waitFor(() => {
      expect(screen.queryByText(/^No s'ha pogut marcar com a llegit/u)).toBeNull();
    });
    expect(reads()).toHaveLength(2);
    // The api answered the retry: opening the row again (once the list is read again) is a new
    // read, with a new key.
    await tableRows();
    fireEvent.click(blat());
    await waitFor(() => {
      expect(reads()).toHaveLength(3);
    });
    const keys = reads().map((request) => request.key);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/u);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });
});
