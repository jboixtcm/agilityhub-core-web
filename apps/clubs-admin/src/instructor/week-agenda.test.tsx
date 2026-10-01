import { createApiClient } from "@agilityhub/api-client";
import {
  AGENDA_MOCK_NOW,
  AGENDA_SELECTED_CLASS_ID,
  handlers,
  mockScenario,
  type MockScenario,
  resetAttendanceMockState,
  resetFollowupMockState,
  resetTrainingMockState,
} from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { AuthClient, MemoryRefreshTokenStore, SessionProvider } from "@agilityhub/auth";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { getResponse, http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { WeekAgendaPage } from "./WeekAgendaPage";

const canic: Branding = {
  ...brandingCanicFixture,
  locales: ["ca", "es", "en"],
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/gu, " ").trim();

interface Recorded {
  body?: unknown;
  headers: Headers;
  key: string | null;
  line: string;
}

/** Every request (`METHOD path?query`), with the PUT bodies, the keys and the headers. */
function recordRequests(): Recorded[] {
  const list: Recorded[] = [];
  server.events.on("request:start", ({ request }) => {
    const url = new URL(request.url);
    const entry: Recorded = {
      headers: request.headers,
      key: request.headers.get("Idempotency-Key"),
      line: `${request.method} ${url.pathname.replace(/^\/api\/v1/u, "")}${url.search}`,
    };
    list.push(entry);
    if (request.method === "PUT") {
      void request
        .clone()
        .json()
        .then((body: unknown) => {
          entry.body = body;
        });
    }
  });
  return list;
}

const weekReads = (requests: Recorded[]) =>
  requests
    .filter(
      (request) =>
        request.line.startsWith("GET /instructor/week?") || request.line === "GET /instructor/week",
    )
    .map((request) => decodeURIComponent(request.line.replace("GET /instructor/week", "")));

async function renderAgenda({
  locale = "ca",
  modules = canic.modules,
  path = "/agenda",
  scenario = "instructor",
}: {
  locale?: "ca" | "en" | "es";
  modules?: readonly string[];
  path?: string;
  scenario?: MockScenario;
} = {}) {
  mockScenario(scenario);
  if (`${window.location.pathname}${window.location.search}` !== path) {
    window.history.replaceState(window.history.state, "", path);
  }
  const branding: Branding = { ...canic, modules: [...modules] };
  const i18n = await createI18n({
    branding,
    browserLanguages: [locale],
    initialNamespaces: ["instructor", "enums", "errors", "common", "admin-scheduling", "training"],
    storage: undefined,
  });
  const auth = new AuthClient({
    apiBaseUrl: `${window.location.origin}/api/v1`,
    clientId: "clubs-admin",
    identityBaseUrl: window.location.origin,
    mockMode: true,
    mockRefreshTokenStore: new MemoryRefreshTokenStore(),
  });
  await auth.login("ivet.puig@example.test", "secret-password");
  const onNavigate = vi.fn();
  const client = createApiClient({
    baseUrl: `${window.location.origin}/api/v1`,
    getLocale: () => locale,
  });
  const view = render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <SessionProvider client={auth}>
          <WeekAgendaPage client={client} onNavigate={onNavigate} />
        </SessionProvider>
      </BrandingProvider>
    </I18nextProvider>,
  );
  return { onNavigate, view };
}

/** The grid once the week is on screen. */
async function grid(): Promise<HTMLElement> {
  const table = await screen.findByRole("table");
  return table;
}

/** A cell of the grid by its first line («B i C» …) on a day column («dl 10»). */
function classCell(title: string, meta: string, subtitle: string): HTMLElement {
  const found = [
    ...document.querySelectorAll<HTMLElement>(".week-agenda button.ah-schedule-cell"),
  ].find(
    (cell) =>
      cell.querySelector(".ah-schedule-cell__title")?.textContent.startsWith(`${title}${meta}`) ===
        true && clean(cell.querySelector(".ah-schedule-cell__subtitle")?.textContent) === subtitle,
  );
  if (found === undefined) throw new TypeError(`Missing the class ${title} ${meta} ${subtitle}`);
  return found;
}

/** A row of the attendance panel by the student's name. */
async function panelRow(name: string): Promise<HTMLElement> {
  const link = await screen.findByRole("link", { name });
  const row = link.closest("li");
  if (row === null) throw new TypeError(`Missing the row of ${name}`);
  return row;
}

async function openSelectedClass() {
  await grid();
  fireEvent.click(classCell("B i C", "4/5", "Central · Marc · 2 espera"));
  await panelRow("Laura + Duna");
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  vi.useFakeTimers({ now: new Date(AGENDA_MOCK_NOW), shouldAdvanceTime: true, toFake: ["Date"] });
  resetAttendanceMockState();
  resetTrainingMockState();
  resetFollowupMockState();
  window.history.replaceState(null, "", "/agenda");
});
afterEach(() => {
  cleanup();
  server.events.removeAllListeners();
  server.resetHandlers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetAttendanceMockState();
  resetTrainingMockState();
  resetFollowupMockState();
  mockScenario("admin");
  window.history.replaceState(null, "", "/");
});
afterAll(() => {
  server.close();
});

describe("T-10-29 D12 «Agenda de la setmana» (S10 §2, R-10-15)", () => {
  it("mockup D12: «‹ Setmana actual › del 10 al 15 d'agost», dl–ds, the rows at their hour lines, a training at half height, the block with its reason and note, the classes as delivered", async () => {
    const requests = recordRequests();
    await renderAgenda();
    const table = await grid();
    expect(screen.getByText("Setmana actual")).toBeVisible();
    // The club formatter's month («d’agost», with the typographic apostrophe of Intl).
    expect(screen.getByText(/^del 10 al 15 d.agost$/u)).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 1, name: "Agenda de la setmana" }),
    ).toBeInTheDocument();
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["dl 10", "dt 11", "dc 12", "dj 13", "dv 14", "ds 15"]);
    expect(
      within(table)
        .getAllByRole("rowheader")
        .map((cell) => cell.textContent),
    ).toEqual(["8:00", "8:30", "16:00", "18:50", "19:00"]);
    // Thin lines at the hour boundaries only: 8:00 and 8:30 share one band (mockup V6).
    expect(
      [...table.querySelectorAll("tbody tr")].map((row) =>
        row.classList.contains("week-agenda__hour"),
      ),
    ).toEqual([false, false, true, true, true]);
    // The api was asked for the ISO week of today (no date: the page never computes one).
    expect(weekReads(requests)).toEqual([""]);

    const training = screen.getByText("8:00 Reserva").closest<HTMLElement>(".week-agenda__half");
    expect(training?.style.getPropertyValue("--week-agenda-span")).toBe("0.5");
    expect(within(training ?? document.body).getByText("Muntanya — Pau + Blat")).toBeVisible();
    // Round 2 #4 (review #6): the half height may clip the pair; the whole text is the cell's
    // name and tooltip, and a press keeps it open (the browser test checks the clipping).
    const trainingButton = screen.getByRole("button", {
      name: "8:00 Reserva · Muntanya — Pau + Blat",
    });
    expect(training).toContainElement(trainingButton);
    expect(training).toHaveAttribute("title", "8:00 Reserva · Muntanya — Pau + Blat");
    expect(trainingButton).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(trainingButton);
    expect(trainingButton).toHaveAttribute("aria-pressed", "true");
    expect(training).toHaveClass("week-agenda__half--open");
    fireEvent.click(trainingButton);
    expect(training).not.toHaveClass("week-agenda__half--open");
    expect(screen.getByText("8:30 Reserva")).toBeVisible();
    expect(screen.getByText("Carretera — Júlia + Kira")).toBeVisible();
    const block = screen
      .getByText("16:00–18:00 Bloqueig")
      .closest<HTMLElement>(".week-agenda__block");
    expect(block).toHaveAttribute("title", "regar i repassar el terra");
    expect(within(block ?? document.body).getByText("Carretera — manteniment")).toBeVisible();

    expect(classCell("A i B", "4/5", "Central · Estel")).toBeVisible();
    expect(classCell("A i B", "5/5", "Central · Estel · 1 espera")).toBeVisible();
    expect(classCell("B i C", "5/5", "Central · Marc · 3 espera")).toBeVisible();
    expect(classCell("Teràpia", "1/1", "Petita · Núria")).toBeVisible();
    // The ring colour travels as a custom property, never as a literal colour.
    expect(
      classCell("Cadells", "2/5", "Cadells · Núria").style.getPropertyValue("--schedule-color"),
    ).not.toBe("");
    // A cancelled class is dimmed and says so; a class whose list is pending carries the mark.
    const cancelled = classCell("C i sup.", "0/5", "Muntanya · Marc · anul·lada");
    expect(cancelled).toHaveClass("ah-schedule-cell--muted", "ah-schedule-cell--struck");
    const pending = classCell("C i sup.", "3/5", "Muntanya · Marc");
    expect(pending.querySelector(".ah-schedule-cell__marker")).toHaveAttribute(
      "title",
      "passar llista pendent",
    );
    expect(
      classCell("A i B", "4/5", "Central · Estel").querySelector(".ah-schedule-cell__marker"),
    ).toBeNull();
    expect(screen.getByText(/^Reserva = pista reservada per a entrenament/u)).toHaveTextContent(
      "Reserva = pista reservada per a entrenament (mitja alçada: 30 min) · Bloqueig = pista tancada, amb el motiu · clic en una classe: inscrits i passar llista",
    );
    expect(
      screen.getByRole("heading", { name: "Reservar o bloquejar pista (sense alumne)" }),
    ).toBeVisible();
  });

  it("the filters change the query without hiding trainings or blocks; the arrows move ±7 days through ?setmana=", async () => {
    const requests = recordRequests();
    await renderAgenda();
    await grid();
    fireEvent.change(screen.getByRole("combobox", { name: "Instructor" }), {
      target: { value: "me" },
    });
    await waitFor(() => {
      expect(weekReads(requests).at(-1)).toBe("?instructorId=me");
    });
    await waitFor(() => {
      expect(screen.queryByText("Muntanya · Marc")).toBeNull();
    });
    expect(window.location.search).toBe("?instructor=me");
    expect(screen.getByRole("combobox", { name: "Instructor" })).toHaveDisplayValue(
      "Instructor: Els meus",
    );
    // Trainings and blocks stay (R-10-15): the filter is on the classes only.
    expect(screen.getByText("8:00 Reserva")).toBeVisible();
    expect(screen.getByText("16:00–18:00 Bloqueig")).toBeVisible();

    fireEvent.change(screen.getByRole("combobox", { name: "Filtre de pista" }), {
      target: { value: "ring-carretera" },
    });
    await waitFor(() => {
      expect(weekReads(requests).at(-1)).toBe("?instructorId=me&ringId=ring-carretera");
    });
    await waitFor(() => {
      expect(screen.queryByText("8:00 Reserva")).toBeNull();
    });
    expect(screen.getByText("16:00–18:00 Bloqueig")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Setmana anterior" }));
    await waitFor(() => {
      expect(weekReads(requests).at(-1)).toBe(
        "?date=2026-08-03&instructorId=me&ringId=ring-carretera",
      );
    });
    expect(window.location.search).toBe("?setmana=2026-08-03&instructor=me&pista=ring-carretera");
    // A past week shows its range only.
    expect(await screen.findByText(/^del 3 al 8 d.agost$/u)).toBeVisible();
    expect(screen.queryByText("Setmana actual")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Setmana següent" }));
    await waitFor(() => {
      expect(weekReads(requests).at(-1)).toBe(
        "?date=2026-08-10&instructorId=me&ringId=ring-carretera",
      );
    });
  });

  it("a click on a class opens its list under the grid: the header, the names linked to D13, the level, the tasks, the status lines and the waiting list", async () => {
    await renderAgenda();
    await openSelectedClass();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "dl 10 · 18:50 · B i C · Central · Marc — 4/5 · 2 en espera",
      }),
    ).toBeVisible();
    expect(window.location.search).toBe(`?classe=${AGENDA_SELECTED_CLASS_ID}`);
    expect(classCell("B i C", "4/5", "Central · Marc · 2 espera")).toHaveClass(
      "ah-schedule-cell--selected",
    );
    expect(screen.getByText(/seleccionada: dl 18:50$/u)).toBeVisible();
    const list = document.querySelector<HTMLElement>(".week-agenda__rows");
    const names = within(list ?? document.body).getAllByRole("link");
    expect(names.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Laura + Duna", "/alumnes/dog-duna"],
      ["Marc + Chun-li", "/alumnes/dog-chun-li"],
      ["Anna + Nass", "/alumnes/dog-nass"],
      ["Eva + Fish", "/alumnes/dog-fish"],
      ["Pau + Blat", "/alumnes/dog-blat"],
    ]);
    const laura = await panelRow("Laura + Duna");
    expect(within(laura).getByText("C")).toBeVisible();
    expect(within(laura).getByText("2 tasques pendents")).toBeVisible();
    expect(
      within(await panelRow("Anna + Nass")).getByText("ha avisat — plaça alliberada"),
    ).toBeVisible();
    expect(within(await panelRow("Eva + Fish")).getByText("avís demà a les 8:00")).toBeVisible();
    expect(
      within(await panelRow("Pau + Blat")).getByRole("button", {
        name: "Assistència de Pau + Blat: pendent",
      }),
    ).toHaveTextContent("—");
    expect(screen.getByText("En espera: Júlia + Kira · Roser + Lluna")).toBeVisible();
  });

  it("the badge cycles «— → present → avisat → no presentat → —» and stops on a final row; [DESA LA LLISTA] sends only the changed rows with the current version and a new key", async () => {
    const requests = recordRequests();
    await renderAgenda();
    await openSelectedClass();
    const pau = within(await panelRow("Pau + Blat")).getByRole("button", {
      name: /^Assistència de Pau \+ Blat/u,
    });
    const seen: string[] = [];
    for (let click = 0; click < 4; click += 1) {
      fireEvent.click(pau);
      seen.push(pau.textContent);
    }
    expect(seen).toEqual(["present", "avisat", "no presentat", "—"]);
    const anna = within(await panelRow("Anna + Nass")).getByRole("button", {
      name: /^Assistència de Anna/u,
    });
    expect(anna).toBeDisabled();
    expect(anna).toHaveTextContent("avisat");
    expect(screen.getByRole("button", { name: "Desa la llista" })).toBeDisabled();

    fireEvent.click(pau);
    const eva = within(await panelRow("Eva + Fish")).getByRole("button", {
      name: /^Assistència de Eva/u,
    });
    fireEvent.click(eva);
    expect(eva).toHaveTextContent("—");
    fireEvent.click(screen.getByRole("button", { name: "Desa la llista" }));
    expect(await screen.findByText("Llista desada")).toBeVisible();
    const puts = requests.filter((request) => request.line.startsWith("PUT"));
    await waitFor(() => {
      expect(puts.map((request) => request.body)).toEqual([
        {
          items: [
            { bookingId: "b-d12-4", state: "PENDING" },
            { bookingId: "b-d12-5", state: "PRESENT" },
          ],
          version: 3,
        },
      ]);
    });
    expect(puts[0]?.line).toBe(`PUT /class-sessions/${AGENDA_SELECTED_CLASS_ID}/attendance`);
    expect(puts[0]?.key).toMatch(/^[0-9a-f-]{36}$/u);
    // Repainted from the answer: Pau present, Eva back to pending (no notice line any more).
    expect(pau).toHaveTextContent("present");
    expect(within(await panelRow("Eva + Fish")).queryByText("avís demà a les 8:00")).toBeNull();
    expect(screen.getByRole("button", { name: "Desa la llista" })).toBeDisabled();
  });

  it("409 STALE_VERSION: the toast, the other person's change kept, and only the caller's edit sent again with the new version", async () => {
    const requests = recordRequests();
    await renderAgenda({ scenario: "attendanceStale" });
    await openSelectedClass();
    fireEvent.click(
      within(await panelRow("Laura + Duna")).getByRole("button", {
        name: /^Assistència de Laura/u,
      }),
    );
    fireEvent.click(
      within(await panelRow("Pau + Blat")).getByRole("button", { name: /^Assistència de Pau/u }),
    );
    fireEvent.click(
      within(await panelRow("Pau + Blat")).getByRole("button", { name: /^Assistència de Pau/u }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Desa la llista" }));
    expect(
      await screen.findByText("Algú ha desat la llista fa un moment: revisa-la"),
    ).toBeVisible();
    // Núria marked Pau present meanwhile: Pau is hers now; Laura stays the caller's edit.
    await waitFor(async () => {
      expect(
        within(await panelRow("Pau + Blat")).getByRole("button", { name: /^Assistència de Pau/u }),
      ).toHaveTextContent("present");
    });
    expect(
      within(await panelRow("Laura + Duna")).getByRole("button", {
        name: /^Assistència de Laura/u,
      }),
    ).toHaveTextContent("avisat");
    fireEvent.click(screen.getByRole("button", { name: "Desa la llista" }));
    expect(await screen.findByText("Llista desada")).toBeVisible();
    const puts = requests.filter((request) => request.line.startsWith("PUT"));
    await waitFor(() => {
      expect(puts.map((request) => request.body)).toEqual([
        {
          items: [
            { bookingId: "b-d12-1", state: "NOTIFIED" },
            { bookingId: "b-d12-5", state: "NOTIFIED" },
          ],
          version: 3,
        },
        { items: [{ bookingId: "b-d12-1", state: "NOTIFIED" }], version: 4 },
      ]);
    });
    expect(puts[1]?.key).not.toBe(puts[0]?.key);
  });

  it("the PDF asks for the same query with format=pdf and Accept: application/pdf, downloads agenda-{startDate}.pdf, and is busy meanwhile", async () => {
    const requests = recordRequests();
    const created: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      created.push(blob as Blob);
      return "blob:agenda";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push(this.download);
    });
    await renderAgenda({ path: "/agenda?instructor=me&pista=ring-central" });
    await grid();
    const button = screen.getByRole("button", { name: "PDF" });
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-busy", "true");
    await waitFor(() => {
      expect(downloads).toEqual(["agenda-2026-08-10.pdf"]);
    });
    const exported = requests.filter((request) =>
      request.line.startsWith("GET /instructor/week/export"),
    );
    expect(exported.map((request) => decodeURIComponent(request.line))).toEqual([
      "GET /instructor/week/export?date=2026-08-10&instructorId=me&ringId=ring-central&format=pdf",
    ]);
    expect(exported[0]?.headers.get("Accept")).toBe("application/pdf");
    expect(created[0]?.type).toBe("application/pdf");
    expect(await created[0]?.text()).toMatch(/^%PDF-1\.4/u);
    await waitFor(() => {
      expect(button).not.toHaveAttribute("aria-busy");
    });
  });

  it("a failed PDF says why by its code, and the page stays as it was", async () => {
    server.use(
      http.get("*/api/v1/instructor/week/export", () =>
        HttpResponse.json(
          { code: "INTERNAL_ERROR", details: {}, message: "boom", traceId: "t" },
          { status: 500 },
        ),
      ),
    );
    await renderAgenda();
    await grid();
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    expect(
      await screen.findByText(
        "S'ha produït un error inesperat. Torneu-ho a provar; si persisteix, indiqueu el codi de referència al club.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("table")).toBeVisible();
  });
});

describe("E6-W03 step 11 on D12 (E6-W01 round-2 review #1, R-10-03, R-10-04): the draft after a refusal", () => {
  it("a PUT refused with 422 ATTENDANCE_WINDOW_CLOSED whose re-read is closed leaves no choice behind, the badges inert and [DESA LA LLISTA] disabled", async () => {
    const requests = recordRequests();
    await renderAgenda();
    await openSelectedClass();
    const pau = () => within(document.body).getByRole("button", { name: /^Assistència de Pau/u });
    fireEvent.click(pau());
    expect(pau()).toHaveTextContent("present");
    mockScenario("attendanceClosed");
    fireEvent.click(screen.getByRole("button", { name: "Desa la llista" }));
    expect(await screen.findByText("El període per passar llista està tancat.")).toBeVisible();
    await waitFor(() => {
      expect(
        requests.filter(
          (request) =>
            request.line === `GET /class-sessions/${AGENDA_SELECTED_CLASS_ID}/attendance`,
        ),
      ).toHaveLength(2);
    });
    await waitFor(() => {
      expect(pau()).toHaveTextContent("—");
    });
    expect(pau()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Desa la llista" })).toBeDisabled();
  });
});

describe("E6-W03 step 4 the panel survives the way to D13 and back (?setmana= and the choices)", () => {
  it("a name opens D13 with a normal navigation; back on /agenda the week, the class and the unsaved choice are there, rebased on the list read again", async () => {
    const { onNavigate } = await renderAgenda({ path: "/agenda?setmana=2026-08-12" });
    await openSelectedClass();
    fireEvent.click(
      within(await panelRow("Pau + Blat")).getByRole("button", { name: /^Assistència de Pau/u }),
    );
    fireEvent.click(screen.getByRole("link", { name: "Laura + Duna" }));
    expect(onNavigate).toHaveBeenCalledWith("/alumnes/dog-duna");
    // The history entry keeps booking ids and states only (no names).
    expect(JSON.stringify(window.history.state)).not.toMatch(/Laura|Duna|Pau|Blat/u);
    const search = window.location.search;
    expect(search).toBe(`?setmana=2026-08-12&classe=${AGENDA_SELECTED_CLASS_ID}`);

    // D13 replaces the page; back restores this history entry and the page mounts again.
    const state: unknown = window.history.state;
    cleanup();
    window.history.replaceState(state, "", `/agenda${search}`);
    await renderAgenda({ path: `/agenda${search}` });
    const pau = within(await panelRow("Pau + Blat")).getByRole("button", {
      name: /^Assistència de Pau/u,
    });
    expect(pau).toHaveTextContent("present");
    expect(screen.getByRole("button", { name: "Desa la llista" })).toBeEnabled();
  });
});

describe("E6-W03 D12 after a write: what the grid shows and what the panel keeps", () => {
  it("a save reads the week again: the class's «passar llista pendent» mark goes, and the panel stays with «Llista desada»", async () => {
    const requests = recordRequests();
    await renderAgenda();
    await openSelectedClass();
    const cell = () => classCell("B i C", "4/5", "Central · Marc · 2 espera");
    expect(cell().querySelector(".ah-schedule-cell__marker")).not.toBeNull();
    const reads = weekReads(requests).length;
    fireEvent.click(
      within(await panelRow("Pau + Blat")).getByRole("button", { name: /^Assistència de Pau/u }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Desa la llista" }));
    expect(await screen.findByText("Llista desada")).toBeVisible();
    await waitFor(() => {
      expect(weekReads(requests).length).toBe(reads + 1);
    });
    await waitFor(() => {
      expect(cell().querySelector(".ah-schedule-cell__marker")).toBeNull();
    });
    expect(screen.getByText("Llista desada")).toBeVisible();
  });

  it("an unsaved choice survives opening another class and coming back", async () => {
    await renderAgenda();
    await openSelectedClass();
    fireEvent.click(
      within(await panelRow("Pau + Blat")).getByRole("button", { name: /^Assistència de Pau/u }),
    );
    fireEvent.click(classCell("A i B", "4/5", "Central · Estel"));
    await waitFor(() => {
      expect(screen.queryByRole("link", { name: "Pau + Blat" })).toBeNull();
    });
    fireEvent.click(classCell("B i C", "4/5", "Central · Marc · 2 espera"));
    expect(
      within(await panelRow("Pau + Blat")).getByRole("button", { name: /^Assistència de Pau/u }),
    ).toHaveTextContent("present");
    expect(screen.getByRole("button", { name: "Desa la llista" })).toBeEnabled();
  });

  it("a reservation made with the ring card reads the week again and shows in the grid", async () => {
    await renderAgenda();
    await grid();
    const card = within(
      screen
        .getByRole("heading", { name: "Reservar o bloquejar pista (sense alumne)" })
        .closest<HTMLElement>(".ring-block-card") ?? document.body,
    );
    await waitFor(() => {
      expect(card.getByRole("button", { name: "Reserva" })).toBeEnabled();
    });
    const blocks = () => document.querySelectorAll(".week-agenda__block").length;
    expect(blocks()).toBe(1);
    fireEvent.click(card.getByRole("button", { name: "Reserva" }));
    expect(await card.findByText("Pista reservada")).toBeVisible();
    await waitFor(() => {
      expect(blocks()).toBe(2);
    });
    // The card's first free half hour today on its first ring, «classe particular» by default.
    expect(screen.getByText("Muntanya — classe particular")).toBeVisible();
  });
});

describe("E6-W03 step 7 modules and impersonation on D12 (S10 §9)", () => {
  it("FREE_TRAINING off: no training cells and no «Reserva = …» in the legend; WAITLIST off: no «espera» and no «En espera:»", async () => {
    await renderAgenda({
      modules: canic.modules.filter((module) => module !== "FREE_TRAINING"),
      scenario: "agendaNoTraining",
    });
    await grid();
    expect(screen.queryByText(/Reserva$/u)).toBeNull();
    expect(screen.getByText(/^Bloqueig = pista tancada/u)).toBeVisible();
    cleanup();
    await renderAgenda({
      modules: canic.modules.filter((module) => module !== "WAITLIST"),
      scenario: "instructorNoWaitlist",
    });
    await grid();
    expect(screen.queryByText(/espera/u)).toBeNull();
    fireEvent.click(classCell("B i C", "4/5", "Central · Marc"));
    await panelRow("Laura + Duna");
    expect(screen.queryByText(/En espera/u)).toBeNull();
  });

  it("an impersonated session reaching /agenda reads «No es permet la suplantació.»; an empty week reads its empty state", async () => {
    // What the api answers an impersonation token on `/instructor/*` (E6-T01).
    server.use(
      http.get("*/api/v1/instructor/week", () =>
        HttpResponse.json(
          { code: "IMPERSONATION_DENIED", details: {}, message: "denied", traceId: "t" },
          { status: 403 },
        ),
      ),
    );
    await renderAgenda();
    expect(await screen.findByText("No es permet la suplantació.")).toBeVisible();
    server.resetHandlers();
    expect(screen.queryByRole("button", { name: "Torna-ho a provar" })).toBeNull();
    cleanup();
    await renderAgenda({ path: "/agenda?setmana=2026-09-07" });
    expect(await screen.findByText("Aquesta setmana no hi ha res a l'agenda")).toBeVisible();
  });
});

describe("E6-W04 step 0c: D12's legend reads the half height's minutes from the api (InstructorWeek.trainingSlotMinutes, api E6-T06, ruling E75)", () => {
  /** The mock's own week, with the api's `trainingSlotMinutes` replaced by `value`. */
  function weekWithSlotMinutes(value: number | null) {
    server.use(
      http.get("*/api/v1/instructor/week", async ({ request }) => {
        const original = await getResponse(handlers, request);
        if (original === undefined) throw new TypeError("The week mock did not answer");
        const week = (await original.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...week, trainingSlotMinutes: value });
      }),
    );
  }

  const legend = () => document.querySelector(".week-agenda__legend")?.textContent;

  it("E6-W04 step 0c: the club's 30 minutes as the mock answers them, and 45 when the api says 45 — «(mitja alçada: 45 min)», never the mockup's literal", async () => {
    const requests = recordRequests();
    const answers: unknown[] = [];
    server.events.on("response:mocked", ({ request, response }) => {
      if (new URL(request.url).pathname.endsWith("/instructor/week")) {
        void response
          .clone()
          .json()
          .then((body: { trainingSlotMinutes?: unknown }) => {
            answers.push(body.trainingSlotMinutes);
          });
      }
    });
    await renderAgenda();
    await grid();
    await waitFor(() => {
      expect(answers).toEqual([30]);
    });
    expect(legend()).toContain("(mitja alçada: 30 min)");
    expect(weekReads(requests)).toEqual([""]);
    cleanup();
    weekWithSlotMinutes(45);
    await renderAgenda();
    await grid();
    await waitFor(() => {
      expect(legend()).toBe(
        "Reserva = pista reservada per a entrenament (mitja alçada: 45 min) · Bloqueig = pista tancada, amb el motiu · clic en una classe: inscrits i passar llista",
      );
    });
  });

  it("E6-W04 step 0c: trainingSlotMinutes null leaves the minutes out — «(mitja alçada)» — in ca, es and en", async () => {
    weekWithSlotMinutes(null);
    for (const [locale, text] of [
      [
        "ca",
        "Reserva = pista reservada per a entrenament (mitja alçada) · Bloqueig = pista tancada, amb el motiu · clic en una classe: inscrits i passar llista",
      ],
      [
        "es",
        "Reserva = pista reservada para entrenamiento (media altura) · Bloqueo = pista cerrada, con el motivo · clic en una clase: inscritos y pasar lista",
      ],
      [
        "en",
        "Booking = ring booked for training (half height) · Block = ring closed, with the reason · click a class: registrants and attendance",
      ],
    ] as const) {
      cleanup();
      await renderAgenda({ locale });
      await grid();
      await waitFor(() => {
        expect(legend()).toBe(text);
      });
      expect(legend()).not.toMatch(/\d+ min|null|undefined/u);
    }
  });
});

describe("E6-W04 step 3e · D12 dims a FINISHED class (R-10-15: ACTIVE, FINISHED and CANCELLED, the last two dimmed)", () => {
  it("E6-W04 step 3e: a class that P8 finished is drawn dimmed, never struck through as a cancelled one", async () => {
    server.use(
      http.get("*/api/v1/instructor/week", async ({ request }) => {
        const original = await getResponse(handlers, request);
        if (original === undefined) throw new TypeError("The week mock did not answer");
        const week = (await original.json()) as { cells: { kind?: string; state?: string }[] };
        return HttpResponse.json({
          ...week,
          cells: week.cells.map((cell) =>
            cell.kind === "CLASS" && cell.state === "ACTIVE"
              ? { ...cell, state: "FINISHED" }
              : cell,
          ),
        });
      }),
    );
    await renderAgenda();
    await grid();
    const finished = await waitFor(() => {
      const cells = [
        ...document.querySelectorAll<HTMLElement>(
          ".week-agenda button.ah-schedule-cell:not(.ah-schedule-cell--struck)",
        ),
        // A class cell carries its occupancy («4/5»); trainings and blocks have none.
      ].filter((cell) => cell.querySelector(".ah-schedule-cell__meta") !== null);
      expect(cells.length).toBeGreaterThan(0);
      return cells;
    });
    for (const cell of finished) expect(cell).toHaveClass("ah-schedule-cell--muted");
  });
});

describe("T-10-32 (D12) the three locales, with no missing key", () => {
  it.each([
    [
      "es",
      "Semana actual",
      "del 10 al 15 de agosto",
      "Guarda la lista",
      "ha avisado — plaza liberada",
      "aviso mañana a las 8:00",
    ],
    [
      "en",
      "This week",
      "August 10–15",
      "Save the list",
      "notified — seat released",
      "notice tomorrow at 8:00",
    ],
  ] as const)("%s", async (locale, current, range, save, notice, noShow) => {
    await renderAgenda({ locale, path: `/agenda?classe=${AGENDA_SELECTED_CLASS_ID}` });
    await grid();
    expect(screen.getByText(current)).toBeVisible();
    expect(screen.getByText(range)).toBeVisible();
    await screen.findByRole("link", { name: "Laura + Duna" });
    expect(screen.getByRole("button", { name: save })).toBeVisible();
    expect(screen.getByText(notice)).toBeVisible();
    expect(screen.getByText(noShow)).toBeVisible();
    expect(document.body.textContent).not.toMatch(/instructor:|enums:|errors:/u);
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

describe("E7-W06 step 1 (CONVENCIONS_API §7, E79, E80): D12's sheet keeps its key on IN_PROGRESS", () => {
  it("E7-W06 step 1: D12's attendance save keeps its Idempotency-Key and the choice on IN_PROGRESS, says «L'operació encara està en curs…» without reading the list again, the retry sends the same key, and the same save after the api's answer takes a new key", async () => {
    const requests = recordRequests();
    let calls = 0;
    server.use(
      http.put("*/api/v1/class-sessions/:id/attendance", () => {
        calls += 1;
        if (calls === 1) return HttpResponse.json(IN_PROGRESS_BODY, { status: 409 });
        if (calls === 2) {
          return HttpResponse.json(
            { code: "ATTENDANCE_NOT_OPEN", details: {}, message: "not open", traceId: "t" },
            { status: 422 },
          );
        }
        return undefined;
      }),
    );
    await renderAgenda();
    await openSelectedClass();
    const pau = () => within(document.body).getByRole("button", { name: /^Assistència de Pau/u });
    const save = () => screen.getByRole("button", { name: "Desa la llista" });
    const reads = () =>
      requests.filter(
        (request) => request.line === `GET /class-sessions/${AGENDA_SELECTED_CLASS_ID}/attendance`,
      );
    fireEvent.click(pau());
    expect(pau()).toHaveTextContent("present");
    fireEvent.click(save());
    expect(await screen.findByText(IN_PROGRESS_TEXT)).toBeVisible();
    // Not the save's answer: the list is not read again, and the choice stays to be sent again.
    expect(reads()).toHaveLength(1);
    expect(pau()).toHaveTextContent("present");
    await waitFor(() => {
      expect(save()).toBeEnabled();
    });
    fireEvent.click(save());
    expect(await screen.findByText("Encara no es pot passar llista.")).toBeVisible();
    await waitFor(() => {
      expect(reads()).toHaveLength(2);
    });
    // The api answered: the same save sent again is a new submission.
    await waitFor(() => {
      expect(save()).toBeEnabled();
    });
    expect(pau()).toHaveTextContent("present");
    fireEvent.click(save());
    expect(await screen.findByText("Llista desada")).toBeVisible();
    const puts = requests.filter((request) => request.line.startsWith("PUT"));
    await waitFor(() => {
      expect(puts.map((request) => request.body)).toEqual([
        { items: [{ bookingId: "b-d12-5", state: "PRESENT" }], version: 3 },
        { items: [{ bookingId: "b-d12-5", state: "PRESENT" }], version: 3 },
        { items: [{ bookingId: "b-d12-5", state: "PRESENT" }], version: 3 },
      ]);
    });
    expect(puts[0]?.key).toMatch(/^[0-9a-f-]{36}$/u);
    expect(puts[1]?.key).toBe(puts[0]?.key);
    expect(puts[2]?.key).not.toBe(puts[0]?.key);
  });
});
