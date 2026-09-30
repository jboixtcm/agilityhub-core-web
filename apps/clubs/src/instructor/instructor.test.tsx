import { createApiClient } from "@agilityhub/api-client";
import {
  ATTENDANCE_MOCK_NOW,
  mockScenario,
  resetAttendanceMockState,
  resetTrainingMockState,
  type MockScenario,
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
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { renderApp } from "../booking/test-utils";

import { AttendancePage } from "./AttendancePage";
import { DayPage } from "./DayPage";
import { StudentCardPage } from "./StudentCardPage";
import { StudentSearchPage } from "./StudentSearchPage";
import { type AttendanceSheet, useAttendanceSheet } from "./useAttendanceSheet";

const canic: Branding = {
  ...brandingCanicFixture,
  locales: ["ca", "es", "en"],
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};
const without = (module: string): Branding => ({
  ...canic,
  modules: canic.modules.filter((item) => item !== module),
});

interface Recorded {
  body?: unknown;
  key: string | null;
  line: string;
}

/** Every request the page made (`METHOD path?query`), with the PUT bodies and keys. */
function recordRequests(): Recorded[] {
  const list: Recorded[] = [];
  server.events.on("request:start", ({ request }) => {
    const url = new URL(request.url);
    const entry: Recorded = {
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

async function renderScreen(
  node: ReactNode,
  {
    branding = canic,
    locale = "ca",
    scenario = "instructor",
    path,
  }: {
    branding?: Branding;
    locale?: "ca" | "en" | "es";
    path: string;
    scenario?: MockScenario;
  },
) {
  mockScenario(scenario);
  window.history.replaceState(null, "", path);
  const i18n = await createI18n({
    branding,
    browserLanguages: [locale],
    initialNamespaces: ["instructor", "enums", "errors", "home", "common"],
    storage: undefined,
  });
  return render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>{node}</BrandingProvider>
    </I18nextProvider>,
  );
}

function client(locale = "ca") {
  return createApiClient({ baseUrl: `${window.location.origin}/api/v1`, getLocale: () => locale });
}

const dayPage = (options: Parameters<typeof renderScreen>[1] = { path: "/instructor/dia" }) =>
  renderScreen(<DayPage client={client(options.locale)} />, options);
const sheetPage = (classId = "c1", options: Partial<Parameters<typeof renderScreen>[1]> = {}) =>
  renderScreen(<AttendancePage classId={classId} client={client(options.locale)} />, {
    path: `/instructor/classes/${classId}`,
    ...options,
  });
const cardPage = (dogId = "dog-duna", options: Partial<Parameters<typeof renderScreen>[1]> = {}) =>
  renderScreen(<StudentCardPage client={client(options.locale)} dogId={dogId} />, {
    path: `/instructor/alumnes/${dogId}`,
    ...options,
  });

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  vi.useFakeTimers({
    now: new Date(ATTENDANCE_MOCK_NOW),
    shouldAdvanceTime: true,
    toFake: ["Date"],
  });
  resetAttendanceMockState();
  resetTrainingMockState();
});
afterEach(() => {
  cleanup();
  server.events.removeAllListeners();
  server.resetHandlers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  resetAttendanceMockState();
  resetTrainingMockState();
  mockScenario("member");
  window.history.replaceState(null, "", "/");
});
afterAll(() => {
  server.close();
});

/** The card of one class on 20, by its first line. */
async function classCard(line: string): Promise<HTMLElement> {
  const title = await screen.findByText(line);
  const card = title.closest("a");
  if (card === null) throw new TypeError(`Missing the card of ${line}`);
  return card;
}

/** The row of one student on 21. */
async function sheetRow(name: string): Promise<HTMLElement> {
  const label = await screen.findByText(name, { selector: "strong" });
  const row = label.closest("li");
  if (row === null) throw new TypeError(`Missing the row of ${name}`);
  return row;
}

describe("T-10-27 screen 20 «Grups del dia» (S10 §2, R-10-01)", () => {
  it("mockup 20: the day chips, each class with n/n, the hourglass and its second line, the legend and the block with its reason and note", async () => {
    await dayPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Grups del dia" })).toBeVisible();
    expect(screen.getByLabelText("Instructor")).toHaveValue("instructor-estel");
    const chips = within(screen.getByRole("group", { name: "Dies" })).getAllByRole("button");
    expect(chips.map((chip) => chip.textContent)).toEqual([
      "dl 3",
      "dt 4",
      "dc 5",
      "dj 6",
      "dv 7",
      "ds 8",
      "dg 9",
    ]);
    expect(chips[0]).toHaveAttribute("aria-pressed", "true");
    expect(chips[2]).toHaveClass("instructor-day__chip--empty");

    const first = await classCard("8:30–9:30 · A+B · Central");
    expect(within(first).getByText("3/5")).toBeVisible();
    expect(within(first).getByText("1 en llista d'espera")).toHaveClass("ah-sr-only");
    expect(within(first).getByText("passar llista pendent")).toBeVisible();
    expect(first).toHaveAttribute("href", "/instructor/classes/c1");
    const therapy = await classCard("17:40–18:40 · Teràpia · Petita");
    expect(within(therapy).getByText("1/1")).toBeVisible();
    expect(within(therapy).getByText("individual")).toBeVisible();
    expect(within(therapy).queryByText("passar llista pendent")).toBeNull();
    const evening = await classCard("18:50–19:50 · A+B · Central");
    expect(within(evening).getByText("5/5")).toBeVisible();
    expect(within(evening).getByText("2 en llista d'espera")).toBeInTheDocument();

    expect(screen.getByText("n/n = inscrits/places")).toBeVisible();
    expect(screen.getByText(/= en llista d'espera/u)).toBeVisible();
    const block = screen.getByRole("button", { name: /16:00–17:30 · Pista Carretera/u });
    expect(within(block).getByText("bloquejada")).toBeVisible();
    expect(within(block).getByText("Manteniment — regar i repassar el terra")).toBeVisible();
    expect(within(block).queryByText("Creat per Marc")).toBeNull();
    fireEvent.click(block);
    expect(block).toHaveAttribute("aria-expanded", "true");
    expect(within(block).getByText("Creat per Marc")).toBeVisible();
    expect(screen.getByRole("button", { name: "Reservar o bloquejar pista" })).toBeVisible();
  });

  it("a chip changes the day (?date=); an empty day reads «Cap classe aquest dia»; the instructor chip offers no «Tot el club» and shows another's day", async () => {
    const requests = recordRequests();
    await dayPage();
    const select = await screen.findByLabelText("Instructor");
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Estel", "Marc", "Núria"]);
    fireEvent.click(screen.getByRole("button", { name: "dc 5" }));
    expect(await screen.findByText("Cap classe aquest dia")).toBeVisible();
    expect(window.location.search).toBe("?date=2026-08-05");
    fireEvent.click(screen.getByRole("button", { name: "dl 3" }));
    fireEvent.change(await screen.findByLabelText("Instructor"), {
      target: { value: "instructor-marc" },
    });
    expect(await screen.findByText("10:00–11:00 · C+D · Carretera")).toBeVisible();
    expect(window.location.search).toBe("?date=2026-08-03&instructorId=instructor-marc");
    // The block is every instructor's (R-10-01).
    expect(screen.getByRole("button", { name: /16:00–17:30 · Pista Carretera/u })).toBeVisible();
    expect(requests.map((request) => request.line)).toEqual([
      "GET /instructor/day?date=2026-08-03",
      "GET /instructor/day?date=2026-08-05",
      "GET /instructor/day?date=2026-08-03",
      "GET /instructor/day?date=2026-08-03&instructorId=instructor-marc",
    ]);
  });

  it("a tap on a class opens 21; [RESERVAR O BLOQUEJAR PISTA] opens 24 on the day's first ring", async () => {
    await dayPage();
    fireEvent.click(await classCard("8:30–9:30 · A+B · Central"));
    expect(window.location.pathname).toBe("/instructor/classes/c1");
    cleanup();
    await dayPage();
    fireEvent.click(await screen.findByRole("button", { name: "Reservar o bloquejar pista" }));
    expect(window.location.pathname).toBe("/instructor/pistes/ring-central/reservar");
  });

  it("a cancelled class reads «anul·lada»; a closed day shows no «passar llista pendent»", async () => {
    await dayPage({ path: "/instructor/dia?date=2026-08-04" });
    const cancelled = await classCard("8:30–9:30 · A+B · Central");
    expect(within(cancelled).getByText("anul·lada")).toBeVisible();
    cleanup();
    await dayPage({ path: "/instructor/dia?date=2026-07-27" });
    const closed = await classCard("8:30–9:30 · A+B · Central");
    expect(within(closed).queryByText("passar llista pendent")).toBeNull();
    expect(within(closed).queryByText("llista passada")).toBeNull();
  });

  it("WAITLIST off: no hourglass on the cards and no waiting part in the legend", async () => {
    await dayPage({
      branding: without("WAITLIST"),
      path: "/instructor/dia",
      scenario: "instructorNoWaitlist",
    });
    const first = await classCard("8:30–9:30 · A+B · Central");
    expect(within(first).queryByText(/en llista d'espera/u)).toBeNull();
    expect(screen.getByText("n/n = inscrits/places")).toBeVisible();
    expect(screen.queryByText(/= en llista d'espera/u)).toBeNull();
  });

  it("T-10-32 a viewer in America/Bogota at 0:30 club-local still asks for the club's day (Europe/Madrid)", async () => {
    vi.stubEnv("TZ", "America/Bogota");
    vi.setSystemTime(new Date("2026-08-02T22:30:00Z"));
    const requests = recordRequests();
    await dayPage();
    expect(await screen.findByText("8:30–9:30 · A+B · Central")).toBeVisible();
    expect(requests[0]?.line).toBe("GET /instructor/day?date=2026-08-03");
    expect(screen.getByRole("button", { name: "dl 3" })).toHaveAttribute("aria-pressed", "true");
  });

  it("a failed read shows the error with a retry, which reads the day again", async () => {
    let refuse = true;
    server.use(
      http.get("*/api/v1/instructor/day", () =>
        refuse
          ? HttpResponse.json(
              { code: "INTERNAL_ERROR", details: {}, message: "boom", traceId: "t" },
              { status: 500 },
            )
          : undefined,
      ),
    );
    await dayPage();
    // Round 2 #4: the catalog message of the answer's code (INTERNAL_ERROR).
    expect(
      await screen.findByText(
        "S'ha produït un error inesperat. Torneu-ho a provar; si persisteix, indiqueu el codi de referència al club.",
      ),
    ).toBeVisible();
    refuse = false;
    fireEvent.click(screen.getByRole("button", { name: "Torna-ho a provar" }));
    expect(await screen.findByText("8:30–9:30 · A+B · Central")).toBeVisible();
  });
});

describe("T-10-27 screen 21 «Detall de classe i passar llista» (S10 R-10-02…R-10-06)", () => {
  it("mockup 21: the title, n/n, «1 en espera», the instructor, the rows in the api's order, the status lines and the waiting list with its rule", async () => {
    await sheetPage();
    expect(
      await screen.findByRole("heading", { level: 1, name: "dl 3 · 8:30 · A+B · Central" }),
    ).toBeVisible();
    expect(screen.getByText("3/5")).toBeVisible();
    expect(screen.getByText(/1 en espera/u)).toBeVisible();
    expect(screen.getByText("Estel")).toBeVisible();
    expect(
      screen.getAllByRole("radiogroup").map((group) => group.getAttribute("aria-label")),
    ).toEqual([
      "Assistència de Laura + Duna",
      "Assistència de Marc + Chun-li",
      "Assistència de Anna + Nass",
      "Assistència de Eva + Fish",
    ]);
    const anna = await sheetRow("Anna + Nass");
    expect(within(anna).getByText("ha avisat (12:40)")).toBeVisible();
    expect(within(anna).getByText("plaça alliberada")).toBeVisible();
    expect(within(anna).getByText("espera avisada")).toBeVisible();
    expect(anna.querySelector(".instructor-sheet__status")?.textContent).toBe(
      "ha avisat (12:40)plaça alliberadaespera avisada",
    );
    const eva = await sheetRow("Eva + Fish");
    expect(within(eva).getByText("no presentat → avís demà a les 8:00")).toBeVisible();
    expect(
      within(await sheetRow("Laura + Duna")).getByRole("radio", { name: "present" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Un toc a la rodona per canviar l'estat")).toBeVisible();
    expect(
      within(screen.getByRole("list", { name: "Llegenda" }))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["pendent", "present", "ha avisat", "no presentat"]);
    expect(screen.getByRole("heading", { name: "Llista d'espera (1)" })).toBeVisible();
    expect(screen.getByText("Pau + Blat", { selector: "strong" })).toBeVisible();
    expect(screen.getByText("des d'ahir 21:04")).toBeVisible();
    expect(
      screen.getByText("Si s'allibera una plaça, s'avisa alhora tothom qui espera."),
    ).toBeVisible();
  });

  it("a tap changes the circle locally with no request; [DESA] sends only the changed items with the current version and a UUID key", async () => {
    const requests = recordRequests();
    await sheetPage();
    const save = await screen.findByRole("button", { name: "Desa" });
    expect(save).toBeDisabled();
    const marc = await sheetRow("Marc + Chun-li");
    fireEvent.click(within(marc).getByRole("radio", { name: "present" }));
    const eva = await sheetRow("Eva + Fish");
    fireEvent.click(within(eva).getByRole("radio", { name: "pendent" }));
    // Laura: chosen again as she was, so no change.
    fireEvent.click(
      within(await sheetRow("Laura + Duna")).getByRole("radio", { name: "no presentat" }),
    );
    fireEvent.click(within(await sheetRow("Laura + Duna")).getByRole("radio", { name: "present" }));
    expect(within(marc).getByRole("radio", { name: "present" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(requests.map((request) => request.line)).toEqual(["GET /class-sessions/c1/attendance"]);
    expect(save).toBeEnabled();

    fireEvent.click(save);
    expect(await screen.findByText("Llista desada")).toBeVisible();
    const put = requests.find((request) => request.line.startsWith("PUT"));
    expect(put?.line).toBe("PUT /class-sessions/c1/attendance");
    expect(put?.key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    await waitFor(() => {
      expect(put?.body).toEqual({
        items: [
          { bookingId: "b2", state: "PRESENT" },
          { bookingId: "b4", state: "PENDING" },
        ],
        version: 4,
      });
    });
    // Repainted from the answer: Eva's no-show line is gone, nothing left to save.
    await waitFor(() => {
      expect(screen.queryByText("no presentat → avís demà a les 8:00")).toBeNull();
    });
    expect(screen.getByRole("button", { name: "Desa" })).toBeDisabled();
  });

  it("a saved «ha avisat» row is inert; «ha avisat» saved now shows its line from the answer", async () => {
    await sheetPage();
    const anna = await sheetRow("Anna + Nass");
    for (const radio of within(anna).getAllByRole("radio")) expect(radio).toBeDisabled();
    const marc = await sheetRow("Marc + Chun-li");
    fireEvent.click(within(marc).getByRole("radio", { name: "ha avisat" }));
    fireEvent.click(screen.getByRole("button", { name: "Desa" }));
    // 8:50, 20 min after the start: late, the seat released, nobody notified (R-10-05).
    expect(await within(marc).findByText("ha avisat (8:50)")).toBeVisible();
    expect(within(marc).getByText("plaça alliberada")).toBeVisible();
    expect(within(marc).queryByText("espera avisada")).toBeNull();
    for (const radio of within(marc).getAllByRole("radio")) expect(radio).toBeDisabled();
    expect(screen.getByText("2/5")).toBeVisible();
  });

  it("the circles are inert when canMarkPresence and canMarkNotice are false (window closed) and the yellow one alone without the notice", async () => {
    await sheetPage("c1", { scenario: "attendanceClosed" });
    for (const radio of within(await sheetRow("Marc + Chun-li")).getAllByRole("radio")) {
      expect(radio).toBeDisabled();
    }
    cleanup();
    resetAttendanceMockState();
    await sheetPage("c1", { scenario: "attendanceNoticeDisabled" });
    const marc = await sheetRow("Marc + Chun-li");
    expect(within(marc).getByRole("radio", { name: "ha avisat" })).toBeDisabled();
    expect(within(marc).getByRole("radio", { name: "present" })).toBeEnabled();
  });

  it("the dog's photo opens full screen; a tap closes it and the screen is as before", async () => {
    await sheetPage();
    const open = await screen.findByRole("button", {
      name: "Mostra la foto de Duna a pantalla completa",
    });
    const before = document.body.innerHTML;
    open.focus();
    fireEvent.click(open);
    const dialog = screen.getByRole("dialog", { name: "Tanca la foto de Duna" });
    expect(dialog.querySelector("img")?.getAttribute("src")).toMatch(/^data:image\/svg\+xml,/u);
    fireEvent.click(within(dialog).getByRole("button", { name: "Tanca la foto de Duna" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.innerHTML).toBe(before);
    expect(open).toHaveFocus();
  });

  it("round 2 #5 (review #6, AGENTS rule 6): the photo is a modal: Tab and Shift+Tab stay inside, the page behind is inert and does not scroll, Escape restores everything", async () => {
    const { container } = await sheetPage();
    const open = await screen.findByRole("button", {
      name: "Mostra la foto de Duna a pantalla completa",
    });
    const before = document.body.innerHTML;
    open.focus();
    fireEvent.click(open);
    const dialog = screen.getByRole("dialog", { name: "Tanca la foto de Duna" });
    const close = within(dialog).getByRole("button", { name: "Tanca la foto de Duna" });
    expect(close).toHaveFocus();
    // The page behind leaves the focus order and the accessibility tree, and does not scroll.
    expect(container).toHaveAttribute("inert");
    expect(dialog.closest("[inert]")).toBeNull();
    expect(document.body.style.overflow).toBe("hidden");
    // Tab and Shift+Tab are kept on the dialog's control (the browser's move is prevented).
    expect(fireEvent.keyDown(close, { key: "Tab" })).toBe(false);
    expect(close).toHaveFocus();
    expect(fireEvent.keyDown(close, { key: "Tab", shiftKey: true })).toBe(false);
    expect(close).toHaveFocus();
    // A focus that escaped (a script, an old reference) is brought back by the next Tab.
    open.focus();
    expect(fireEvent.keyDown(document, { key: "Tab" })).toBe(false);
    expect(close).toHaveFocus();

    fireEvent.keyDown(close, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(container).not.toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("");
    expect(document.body.innerHTML).toBe(before);
    expect(open).toHaveFocus();
  });

  it("409 STALE_VERSION: the toast, the other's change kept, and only the caller's own edit sent again with the new version", async () => {
    const requests = recordRequests();
    await sheetPage("c1", { scenario: "attendanceStale" });
    fireEvent.click(within(await sheetRow("Eva + Fish")).getByRole("radio", { name: "pendent" }));
    fireEvent.click(screen.getByRole("button", { name: "Desa" }));
    expect(
      await screen.findByText("Algú ha desat la llista fa un moment: revisa-la"),
    ).toBeVisible();
    // Marc (the other instructor) marked Chun-li present meanwhile; Eva stays the caller's edit.
    expect(
      within(await sheetRow("Marc + Chun-li")).getByRole("radio", { name: "present" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      within(await sheetRow("Eva + Fish")).getByRole("radio", { name: "pendent" }),
    ).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("button", { name: "Desa" }));
    expect(await screen.findByText("Llista desada")).toBeVisible();
    const puts = requests.filter((request) => request.line.startsWith("PUT"));
    await waitFor(() => {
      expect(puts.map((request) => request.body)).toEqual([
        { items: [{ bookingId: "b4", state: "PENDING" }], version: 4 },
        { items: [{ bookingId: "b4", state: "PENDING" }], version: 5 },
      ]);
    });
    expect(puts[0]?.key).not.toBe(puts[1]?.key);
  });

  it("a refusal is shown by its code and nothing is lost: ATTENDANCE_NOT_OPEN reads the list again", async () => {
    const requests = recordRequests();
    // The class before T0 (§6 `NONE`): its circles are inert, so an ADMIN world forces the save.
    server.use(
      http.put("*/api/v1/class-sessions/:id/attendance", () =>
        HttpResponse.json(
          { code: "ATTENDANCE_NOT_OPEN", details: {}, message: "not open", traceId: "t" },
          { status: 422 },
        ),
      ),
    );
    await sheetPage();
    fireEvent.click(
      within(await sheetRow("Marc + Chun-li")).getByRole("radio", { name: "present" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Desa" }));
    expect(await screen.findByText("Encara no es pot passar llista.")).toBeVisible();
    await waitFor(() => {
      expect(
        requests.filter((request) => request.line === "GET /class-sessions/c1/attendance"),
      ).toHaveLength(2);
    });
    // The caller's choice stays on screen and can be saved again.
    expect(
      within(await sheetRow("Marc + Chun-li")).getByRole("radio", { name: "present" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "Desa" })).toBeEnabled();
  });

  it("after a refusal the list is read again and the caller's choices are rebased: a row someone else changed meanwhile is theirs", async () => {
    const requests = recordRequests();
    let calls = 0;
    server.use(
      http.put("*/api/v1/class-sessions/:id/attendance", async () => {
        calls += 1;
        if (calls !== 1) return undefined;
        // Meanwhile another instructor marks Eva present (version 4 → 5)…
        await fetch(`${window.location.origin}/api/v1/class-sessions/c1/attendance`, {
          body: JSON.stringify({ items: [{ bookingId: "b4", state: "PRESENT" }], version: 4 }),
          headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
          method: "PUT",
        });
        // …and the caller's save is refused, as the api answers a refused item.
        return HttpResponse.json(
          { code: "ATTENDANCE_NOT_OPEN", details: {}, message: "not open", traceId: "t" },
          { status: 422 },
        );
      }),
    );
    await sheetPage();
    fireEvent.click(
      within(await sheetRow("Marc + Chun-li")).getByRole("radio", { name: "present" }),
    );
    fireEvent.click(within(await sheetRow("Eva + Fish")).getByRole("radio", { name: "pendent" }));
    fireEvent.click(screen.getByRole("button", { name: "Desa" }));
    expect(await screen.findByText("Encara no es pot passar llista.")).toBeVisible();
    await waitFor(async () => {
      expect(
        within(await sheetRow("Eva + Fish")).getByRole("radio", { name: "present" }),
      ).toHaveAttribute("aria-checked", "true");
    });
    expect(
      within(await sheetRow("Marc + Chun-li")).getByRole("radio", { name: "present" }),
    ).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("button", { name: "Desa" }));
    expect(await screen.findByText("Llista desada")).toBeVisible();
    const last = requests.filter((request) => request.line.startsWith("PUT")).at(-1);
    await waitFor(() => {
      expect(last?.body).toEqual({ items: [{ bookingId: "b2", state: "PRESENT" }], version: 5 });
    });
  });

  it("a network failure keeps the choice and a retry sends the same payload with the same key", async () => {
    const requests = recordRequests();
    let fail = true;
    server.use(
      http.put("*/api/v1/class-sessions/:id/attendance", () =>
        fail ? HttpResponse.error() : undefined,
      ),
    );
    await sheetPage();
    fireEvent.click(
      within(await sheetRow("Marc + Chun-li")).getByRole("radio", { name: "present" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Desa" }));
    expect(
      await screen.findByText(
        "S'ha produït un error inesperat. Torneu-ho a provar; si persisteix, indiqueu el codi de referència al club.",
      ),
    ).toBeVisible();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Desa" }));
    expect(await screen.findByText("Llista desada")).toBeVisible();
    const keys = requests
      .filter((request) => request.line.startsWith("PUT"))
      .map((request) => request.key);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it("R-10-05 FIFO: the rule sentence with the confirmation minutes", async () => {
    await sheetPage("c1", { scenario: "attendanceFifo" });
    expect(
      await screen.findByText(
        "Si s'allibera una plaça, s'avisa per ordre d'arribada: cadascú té 30 min per confirmar.",
      ),
    ).toBeVisible();
  });

  it("a class cancelled by the club: the banner, every circle inert and no [DESA]", async () => {
    await sheetPage("c4");
    expect(await screen.findByText("Classe anul·lada pel club")).toBeVisible();
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Desa" })).toBeNull();
  });

  it("«avís ja enviat» after the 8:00 batch; «2 tasques pendents» with TASKS, none without", async () => {
    await sheetPage("c0");
    expect(await screen.findByText("avís ja enviat")).toBeVisible();
    cleanup();
    await sheetPage();
    expect(within(await sheetRow("Laura + Duna")).getByText("2 tasques pendents")).toBeVisible();
    cleanup();
    await sheetPage("c1", { branding: without("TASKS"), scenario: "instructorNoTasks" });
    await sheetRow("Laura + Duna");
    expect(screen.queryByText(/tasques pendents/u)).toBeNull();
  });

  it("R-10-00: a dog led by its guide reads «Júlia Roca + Rock» with «(abonat: Laura Serra Vidal)»", async () => {
    await sheetPage("c3");
    const rock = await sheetRow("Júlia Roca + Rock");
    expect(within(rock).getByText("(abonat: Laura Serra Vidal)")).toBeVisible();
    expect(screen.queryByText(/\(abonat: .*Thai/u)).toBeNull();
  });
});

describe("E6-W01 round 2 #1 (review #1, R-10-04): a recovery read never overwrites a newer save", () => {
  const notOpen = () =>
    HttpResponse.json(
      { code: "ATTENDANCE_NOT_OPEN", details: {}, message: "not open", traceId: "t" },
      { status: 422 },
    );

  /** The `nth` read of the sheet waits for `release()`; `answer` (if any) replaces the mock's. */
  function holdRead(nth: number, answer?: () => AttendanceSheet | undefined) {
    let reads = 0;
    let answered = false;
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get("*/api/v1/class-sessions/:id/attendance", async () => {
        reads += 1;
        if (reads !== nth) return undefined;
        await held;
        answered = true;
        const body = answer?.();
        return body === undefined ? undefined : HttpResponse.json(body);
      }),
    );
    return {
      answered: () => answered,
      reads: () => reads,
      release: () => {
        release?.();
      },
    };
  }

  it("after a refused PUT every circle and [DESA] stay locked until the list is read again; a tap or [DESA] meanwhile sends nothing", async () => {
    const requests = recordRequests();
    let puts = 0;
    server.use(
      http.put("*/api/v1/class-sessions/:id/attendance", () => {
        puts += 1;
        return puts === 1 ? notOpen() : undefined;
      }),
    );
    const read = holdRead(2);
    await sheetPage();
    const marc = await sheetRow("Marc + Chun-li");
    fireEvent.click(within(marc).getByRole("radio", { name: "present" }));
    fireEvent.click(screen.getByRole("button", { name: "Desa" }));
    expect(await screen.findByText("Encara no es pot passar llista.")).toBeVisible();
    await waitFor(() => {
      expect(read.reads()).toBe(2);
    });
    // The recovery read is in flight.
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
    const save = screen.getByRole("button", { name: /^Desa/u });
    expect(save).toBeDisabled();
    expect(save).toHaveAttribute("aria-busy", "true");
    fireEvent.click(within(await sheetRow("Eva + Fish")).getByRole("radio", { name: "pendent" }));
    fireEvent.click(save);
    expect(puts).toBe(1);

    read.release();
    await waitFor(() => {
      expect(within(marc).getByRole("radio", { name: "present" })).toBeEnabled();
    });
    // The caller's choice is rebased on the list read again, and nothing else was chosen.
    expect(within(marc).getByRole("radio", { name: "present" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(
      within(await sheetRow("Eva + Fish")).getByRole("radio", { name: "no presentat" }),
    ).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("button", { name: "Desa" }));
    expect(await screen.findByText("Llista desada")).toBeVisible();
    const last = requests.filter((request) => request.line.startsWith("PUT")).at(-1);
    await waitFor(() => {
      expect(last?.body).toEqual({ items: [{ bookingId: "b2", state: "PRESENT" }], version: 4 });
    });
  });

  it("the hook refuses a save captured before the refusal while that read is in flight", async () => {
    let puts = 0;
    server.use(
      http.put("*/api/v1/class-sessions/:id/attendance", () => {
        puts += 1;
        return puts === 1 ? notOpen() : undefined;
      }),
    );
    const read = holdRead(2);
    mockScenario("instructor");
    const api = client();
    const { result } = renderHook(() => useAttendanceSheet(api, "c1"));
    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });
    act(() => {
      result.current.choose("b2", "NO_SHOW");
    });
    await waitFor(() => {
      expect(result.current.changes).toHaveLength(1);
    });
    // A save from the render before the refusal (a second click that raced the re-render).
    const earlierSave = result.current.save;
    let first: Promise<void> | undefined;
    act(() => {
      first = result.current.save();
    });
    await waitFor(() => {
      expect(read.reads()).toBe(2);
    });
    expect(result.current.saving).toBe(true);
    await act(async () => {
      await earlierSave();
      await result.current.save();
    });
    act(() => {
      result.current.choose("b1", "PENDING");
    });
    expect(puts).toBe(1);
    expect(result.current.draft).toEqual({ b2: "NO_SHOW" });

    read.release();
    await act(async () => {
      await first;
    });
    expect(result.current.saving).toBe(false);
    expect(result.current.notice).toEqual({ code: "ATTENDANCE_NOT_OPEN", kind: "error" });
    expect(result.current.draft).toEqual({ b2: "NO_SHOW" });
  });

  it("a read answered after a newer save is dropped: the sheet stays at version 5 with its draft and «Llista desada»", async () => {
    const held: { sheet: AttendanceSheet | undefined } = { sheet: undefined };
    const read = holdRead(2, () => held.sheet);
    mockScenario("instructor");
    const api = client();
    const { result } = renderHook(() => useAttendanceSheet(api, "c1"));
    const shown = () => (result.current.status === "ready" ? result.current.sheet : undefined);
    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });
    // The list as it is now (version 4), which the held read will answer late.
    held.sheet = structuredClone(shown());
    expect(held.sheet?.sheet.version).toBe(4);
    act(() => {
      result.current.refetch();
    });
    await waitFor(() => {
      expect(read.reads()).toBe(2);
    });
    act(() => {
      result.current.choose("b2", "NO_SHOW");
    });
    await act(async () => {
      await result.current.save();
    });
    expect(shown()?.sheet.version).toBe(5);
    expect(result.current.notice).toEqual({ kind: "saved" });

    read.release();
    await waitFor(() => {
      expect(read.answered()).toBe(true);
    });
    // Let the held answer reach the hook and be judged.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(shown()?.sheet.version).toBe(5);
    expect(shown()?.rows.find((row) => row.bookingId === "b2")?.state).toBe("NO_SHOW");
    expect(result.current.draft).toEqual({});
    expect(result.current.notice).toEqual({ kind: "saved" });
  });
});

describe("T-10-28 (22) screen 22 «Fitxa d'alumne» (S10 R-10-08, R-10-09)", () => {
  it("mockup 22: the header, «C · fa 8 mesos», the three metrics, the five badges, the three blocks and the manage button", async () => {
    await cardPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Fitxa d'alumne" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Laura + Duna" })).toBeVisible();
    expect(screen.getByText("Border collie · 4 anys")).toBeVisible();
    expect(screen.getByText("C · fa 8 mesos")).toBeVisible();
    const metrics = [...document.querySelectorAll(".instructor-card__metrics div")].map(
      (item) => item.textContent,
    );
    expect(metrics).toEqual([
      "assistència 30 dies86%",
      "classes 30 dies7",
      "entren./setm. 30 dies2,3",
    ]);
    const rows = [...document.querySelectorAll(".instructor-card__classes li")].map(
      (item) => item.textContent,
    );
    expect(rows).toEqual([
      "dl 03/08A+B · Estelpresent",
      "dj 30/07B+C · Marcpresent",
      "dl 27/07A+B · Estelpresent",
      "dj 23/07B+C · Marcavisat",
      "dl 20/07B+C · Estelno presentat",
    ]);
    expect(screen.getByText("avisat")).toHaveClass("ah-tone--warning");
    expect(screen.getByText("no presentat")).toHaveClass("ah-tone--danger");
    expect(
      screen.getByRole("heading", { name: "Notes als instructors (de l'alumne)" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "foto_balancí.jpg" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
    expect(screen.getByText("2 pendents")).toBeVisible();
    expect(screen.getByText("1 feta")).toBeVisible();
    expect(screen.getByText("31-07 · Estel")).toBeVisible();
    expect(screen.getByText("Només instructors i administració")).toBeVisible();
    fireEvent.click(screen.getByRole("link", { name: "Gestionar tasques i notes" }));
    expect(window.location.pathname).toBe("/instructor/alumnes/dog-duna/tasques");
  });

  it("no classes in the window reads «—»; TASKS off drops the three blocks and the button; FREE_TRAINING off drops the training tile", async () => {
    await cardPage("dog-thai");
    expect(await screen.findByText("Encara no hi ha classes")).toBeVisible();
    expect(document.querySelector(".instructor-card__metrics dd")?.textContent).toBe("—");
    cleanup();
    await cardPage("dog-duna", { branding: without("TASKS"), scenario: "instructorNoTasks" });
    await screen.findByRole("heading", { level: 2, name: "Laura + Duna" });
    expect(
      screen.queryByRole("heading", { name: "Notes als instructors (de l'alumne)" }),
    ).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Tasques (les veu i marca l'alumne)" }),
    ).toBeNull();
    expect(screen.queryByRole("heading", { name: "Observacions (privades)" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Gestionar tasques i notes" })).toBeNull();
    cleanup();
    await cardPage("dog-duna", {
      branding: without("FREE_TRAINING"),
      scenario: "trainingModuleOffInstructor",
    });
    await screen.findByRole("heading", { level: 2, name: "Laura + Duna" });
    expect(screen.queryByText("entren./setm. 30 dies")).toBeNull();
  });

  it("a dog that left shows «baixa»; levels off shows no level chip; the search icon opens the student search", async () => {
    // An INACTIVE dog of a club with `levels.enabled = false` (no `level`), as the api sends it.
    server.use(
      http.get("*/api/v1/dogs/dog-left/instructor-card", () =>
        HttpResponse.json({
          dog: {
            ageYears: 9,
            breed: "Mestís",
            handlerName: null,
            id: "dog-left",
            name: "Lua",
            photoUrl: null,
            sex: "FEMALE",
            status: "INACTIVE",
          },
          lastClasses: [],
          member: {
            displayStatus: { kind: "LEFT" },
            firstName: "Clara",
            fullName: "Clara Font Pons",
            gender: "FEMALE",
            id: "member-clara",
          },
          metrics: {
            attendancePct: null,
            cancelledLate: 0,
            classesCounted: 0,
            noShow: 0,
            notified: 0,
            present: 0,
            windowDays: 30,
          },
        }),
      ),
    );
    await cardPage("dog-left");
    expect(await screen.findByText("baixa")).toBeVisible();
    expect(screen.queryByText(/fa 8 mesos/u)).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Cerca un alumne" }));
    expect(window.location.pathname).toBe("/instructor/alumnes");
  });
});

describe("E6-W01 step 6 the instructor's student search (S10 §2, §13-9)", () => {
  it("lists the active dogs as «{guia} + {gos} · {nivell}», asks the api for the typed text after 300 ms and opens 22", async () => {
    const requests = recordRequests();
    await renderScreen(<StudentSearchPage client={client()} />, { path: "/instructor/alumnes" });
    expect(await screen.findByRole("link", { name: "Laura + Duna · C" })).toBeVisible();
    fireEvent.change(screen.getByLabelText("Cerca un alumne"), { target: { value: "Rock" } });
    expect(await screen.findByRole("link", { name: "Júlia Roca + Rock · D" })).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByRole("link", { name: "Laura + Duna · C" })).toBeNull();
    });
    const searches = requests.filter((request) => request.line.startsWith("GET /dogs"));
    expect(searches).toHaveLength(2);
    expect(decodeURIComponent(searches[1]?.line ?? "")).toContain("q=Rock");
    expect(decodeURIComponent(searches[1]?.line ?? "")).toContain("filter=status:eq:ACTIVE");
    fireEvent.click(screen.getByRole("link", { name: "Júlia Roca + Rock · D" }));
    expect(window.location.pathname).toBe("/instructor/alumnes/dog-rock");
  });

  /** 51 active dogs that match, paged by `page` and `size` as the api pages `GET /dogs`. */
  function fiftyOneDogs(refusePage?: () => boolean) {
    const dogs = Array.from({ length: 51 }, (_, index) => {
      const number = String(index + 1).padStart(2, "0");
      return {
        handlerName: null,
        id: `00000000-0000-4000-8000-0000000000${number}`,
        level: { code: "C", color: null, id: "00000000-0000-4000-8000-00000000000c", name: "C" },
        name: `Gos ${number}`,
        owner: {
          fullName: "Clara Font Pons",
          id: "00000000-0000-4000-8000-000000000c1a",
          status: "ACTIVE",
        },
      };
    });
    server.use(
      http.get("*/api/v1/dogs", ({ request }) => {
        const url = new URL(request.url);
        const page = Number(url.searchParams.get("page") ?? "0");
        const size = Number(url.searchParams.get("size") ?? "20");
        if (page > 0 && refusePage?.() === true) {
          return HttpResponse.json(
            { code: "INTERNAL_ERROR", details: {}, message: "boom", traceId: "t" },
            { status: 500 },
          );
        }
        return HttpResponse.json({
          appliedFilters: [{ field: "status", label: "Actiu", operator: "eq", value: "ACTIVE" }],
          items: dogs.slice(page * size, (page + 1) * size),
          page,
          size,
          totalItems: dogs.length,
          totalPages: Math.ceil(dogs.length / size),
        });
      }),
    );
  }

  it("round 2 #2 (review #2): with 51 matching dogs the first page shows 50 and «Mostra'n més» appends the 51st from the next page", async () => {
    const requests = recordRequests();
    fiftyOneDogs();
    await renderScreen(<StudentSearchPage client={client()} />, { path: "/instructor/alumnes" });
    expect(await screen.findByRole("link", { name: "Clara + Gos 01 · C" })).toBeVisible();
    const list = () => within(screen.getByRole("list")).getAllByRole("link");
    expect(list()).toHaveLength(50);
    expect(screen.queryByRole("link", { name: "Clara + Gos 51 · C" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mostra'n més" }));
    expect(await screen.findByRole("link", { name: "Clara + Gos 51 · C" })).toBeVisible();
    expect(list()).toHaveLength(51);
    expect(screen.queryByRole("button", { name: /Mostra'n més/u })).toBeNull();
    const pages = requests
      .filter((request) => request.line.startsWith("GET /dogs"))
      .map((request) => {
        const query = new URLSearchParams(request.line.split("?")[1] ?? "");
        return `${query.get("page") ?? ""}/${query.get("size") ?? ""}`;
      });
    expect(pages).toEqual(["0/50", "1/50"]);
  });

  it("round 2 #2 and #4: a failed next page keeps the 50 rows, says why by its code, and «Mostra'n més» asks it again", async () => {
    let refuse = true;
    fiftyOneDogs(() => refuse);
    await renderScreen(<StudentSearchPage client={client()} />, { path: "/instructor/alumnes" });
    expect(await screen.findByRole("link", { name: "Clara + Gos 50 · C" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Mostra'n més" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "S'ha produït un error inesperat. Torneu-ho a provar; si persisteix, indiqueu el codi de referència al club.",
    );
    expect(within(screen.getByRole("list")).getAllByRole("link")).toHaveLength(50);
    refuse = false;
    fireEvent.click(screen.getByRole("button", { name: "Mostra'n més" }));
    expect(await screen.findByRole("link", { name: "Clara + Gos 51 · C" })).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("E6-W01 round 2 #4 (review #5, AGENTS rule 4): a failed read says why, by its code", () => {
  const refusal = (code: string, status: number) => () =>
    HttpResponse.json({ code, details: {}, message: "refused", traceId: "t" }, { status });

  it("20, 21, 22 and the search show the catalog message of NOT_FOUND and FORBIDDEN", async () => {
    server.use(
      http.get("*/api/v1/instructor/day", refusal("FORBIDDEN", 403)),
      http.get("*/api/v1/class-sessions/:id/attendance", refusal("NOT_FOUND", 404)),
      http.get("*/api/v1/dogs/:id/instructor-card", refusal("NOT_FOUND", 404)),
      http.get("*/api/v1/dogs", refusal("FORBIDDEN", 403)),
    );
    await dayPage();
    expect(await screen.findByText("No teniu permís per fer aquesta acció.")).toBeVisible();
    expect(screen.queryByText("No s'ha pogut carregar el dia.")).toBeNull();
    cleanup();
    await sheetPage("c-unknown");
    expect(await screen.findByText("No s'ha trobat l'element sol·licitat.")).toBeVisible();
    cleanup();
    await cardPage("dog-unknown");
    expect(await screen.findByText("No s'ha trobat l'element sol·licitat.")).toBeVisible();
    cleanup();
    await renderScreen(<StudentSearchPage client={client()} />, { path: "/instructor/alumnes" });
    expect(await screen.findByText("No teniu permís per fer aquesta acció.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Torna-ho a provar" })).toBeVisible();
  });

  it("without an answer from the api (offline) each screen keeps its own «No s'ha pogut carregar…»", async () => {
    server.use(
      http.get("*/api/v1/instructor/day", () => HttpResponse.error()),
      http.get("*/api/v1/class-sessions/:id/attendance", () => HttpResponse.error()),
      http.get("*/api/v1/dogs/:id/instructor-card", () => HttpResponse.error()),
      http.get("*/api/v1/dogs", () => HttpResponse.error()),
    );
    await dayPage();
    expect(await screen.findByText("No s'ha pogut carregar el dia.")).toBeVisible();
    cleanup();
    await sheetPage();
    expect(await screen.findByText("No s'ha pogut carregar la llista.")).toBeVisible();
    cleanup();
    await cardPage();
    expect(await screen.findByText("No s'ha pogut carregar la fitxa.")).toBeVisible();
    cleanup();
    await renderScreen(<StudentSearchPage client={client()} />, { path: "/instructor/alumnes" });
    expect(await screen.findByText("No s'han pogut carregar els alumnes.")).toBeVisible();
  });
});

describe("T-10-32 (20/21/22) the three locales, with no missing key", () => {
  it.each([
    [
      "es",
      "Grupos del día",
      "pasar lista pendiente",
      "Un toque en el círculo para cambiar el estado",
      "Ficha de alumno",
      "C · hace 8 meses",
    ],
    [
      "en",
      "Today's groups",
      "attendance pending",
      "One tap on a circle changes the state",
      "Student card",
      "C · 8 months ago",
    ],
  ] as const)("%s", async (locale, dayTitle, pending, hint, cardTitle, level) => {
    await dayPage({ locale, path: "/instructor/dia" });
    expect(await screen.findByRole("heading", { level: 1, name: dayTitle })).toBeVisible();
    expect(screen.getByText(pending)).toBeVisible();
    expect(document.body.textContent).not.toMatch(/instructor:|enums:|errors:/u);
    cleanup();
    await sheetPage("c1", { locale });
    expect(await screen.findByText(hint)).toBeVisible();
    expect(document.body.textContent).not.toMatch(/instructor:|enums:|errors:/u);
    cleanup();
    await cardPage("dog-duna", { locale });
    expect(await screen.findByRole("heading", { level: 1, name: cardTitle })).toBeVisible();
    expect(screen.getByText(level)).toBeVisible();
    expect(document.body.textContent).not.toMatch(/instructor:|enums:|errors:/u);
  });
});

describe("E6-W01 steps 1 and 7 the routes in the app: roles, tabs and impersonation", () => {
  it("an instructor opens 20 at /instructor/dia with «El meu dia» current in the mockup's four tabs", async () => {
    await renderApp("/instructor/dia", { scenario: "instructor" });
    expect(await screen.findByRole("heading", { level: 1, name: "Grups del dia" })).toBeVisible();
    const tabs = screen.getByRole("navigation", { name: "Navegació principal" });
    expect(
      within(tabs)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["El meu dia", "Visió global", "Alumnes", "Perfil"]);
    expect(within(tabs).getByRole("link", { name: "El meu dia" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("an impersonated session reaching 21 directly reads «No es permet la suplantació.» and asks nothing", async () => {
    const requests = recordRequests();
    await renderApp("/instructor/classes/c1", { scenario: "impersonated" });
    expect(await screen.findByText("No es permet la suplantació.")).toBeVisible();
    expect(requests.some((request) => request.line.includes("/attendance"))).toBe(false);
    expect(screen.queryByRole("link", { name: "El meu dia" })).toBeNull();
  });

  it("a member cannot open 22 (RequireRole); screen 26 is E6-W02's page under «Alumnes»", async () => {
    const requests = recordRequests();
    await renderApp("/instructor/alumnes/dog-duna", { scenario: "member" });
    await screen.findByRole("navigation", { name: "Navegació principal" });
    expect(screen.queryByRole("heading", { level: 1, name: "Fitxa d'alumne" })).toBeNull();
    expect(requests.some((request) => request.line.includes("/instructor-card"))).toBe(false);
    cleanup();
    await renderApp("/instructor/alumnes/dog-duna/tasques", { scenario: "instructor" });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Tasques i notes — Laura + Duna" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Alumnes" })).toHaveAttribute("aria-current", "page");
  });

  it("round 2 #3 (review #4, S10 §9) with E6-W02 step 5: TASKS off sends screen 26's route back to 22 with the MODULE_DISABLED note", async () => {
    const requests = recordRequests();
    await renderApp("/instructor/alumnes/dog-duna/tasques", {
      branding: without("TASKS"),
      scenario: "instructorNoTasks",
    });
    expect(await screen.findByRole("heading", { level: 1, name: "Fitxa d'alumne" })).toBeVisible();
    expect(window.location.pathname).toBe("/instructor/alumnes/dog-duna");
    expect(screen.getByText("Aquest mòdul està desactivat.")).toBeVisible();
    expect(requests.some((request) => request.line.startsWith("GET /tasks"))).toBe(false);
  });
});
