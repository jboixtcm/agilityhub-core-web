import { createApiClient } from "@agilityhub/api-client";
import {
  ATTENDANCE_MOCK_NOW,
  mockScenario,
  type MockScenario,
  resetAttendanceMockState,
  resetFollowupMockState,
} from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminNavigation } from "../App";

import { StudentRecordPage } from "./StudentRecordPage";
import { StudentsPage } from "./StudentsPage";

const canic: Branding = {
  ...brandingCanicFixture,
  locales: ["ca", "es", "en"],
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/gu, " ").trim();

function present<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new TypeError("Expected an element");
  return value;
}

/** The card around a block's heading (`h2` → its head row or the card). */
function blockOf(name: string): HTMLElement {
  return present(
    screen.getByRole("heading", { name }).closest<HTMLElement>(".student-record__block"),
  );
}

function requestLines(): string[] {
  const lines: string[] = [];
  server.events.on("request:start", ({ request }) => {
    const url = new URL(request.url);
    lines.push(`${request.method} ${url.pathname.replace(/^\/api\/v1/u, "")}${url.search}`);
  });
  return lines;
}

async function renderRecord({
  dogId = "dog-duna",
  locale = "ca",
  modules = canic.modules,
  scenario = "instructor",
}: {
  dogId?: string;
  locale?: "ca" | "en" | "es";
  modules?: readonly string[];
  scenario?: MockScenario;
} = {}) {
  mockScenario(scenario);
  window.history.replaceState(null, "", `/alumnes/${dogId}`);
  const branding: Branding = { ...canic, modules: [...modules] };
  const i18n = await createI18n({
    branding,
    browserLanguages: [locale],
    initialNamespaces: ["instructor", "enums", "errors", "common"],
    storage: undefined,
  });
  const client = createApiClient({
    baseUrl: `${window.location.origin}/api/v1`,
    getLocale: () => locale,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <StudentRecordPage client={client} dogId={dogId} />
      </BrandingProvider>
    </I18nextProvider>,
  );
  await screen.findByRole("heading", { level: 1 });
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  vi.useFakeTimers({
    now: new Date(ATTENDANCE_MOCK_NOW),
    shouldAdvanceTime: true,
    toFake: ["Date"],
  });
  resetFollowupMockState();
  resetAttendanceMockState();
});
afterEach(() => {
  cleanup();
  server.events.removeAllListeners();
  server.resetHandlers();
  vi.useRealTimers();
  resetFollowupMockState();
  resetAttendanceMockState();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

describe("T-10-28 (D13) the desktop student record (S10 §2, R-10-08, R-10-09)", () => {
  it("D13 as the mockup: the header chips, four metric cards with their subtitles, the three blocks with the api's tasks, and the «5 darreres classes» table", async () => {
    await renderRecord();
    expect(screen.getByRole("heading", { level: 1, name: "Laura + Duna" })).toBeVisible();
    const header = present(document.querySelector<HTMLElement>(".student-record__header"));
    expect([...header.querySelectorAll(".ah-chip")].map((chip) => chip.textContent)).toEqual([
      "Nivell C · fa 8 mesos",
      "Abonada",
      "Border collie · 4 anys",
    ]);
    expect(within(header).getByRole("button", { name: "Gestionar tasques i notes" })).toBeVisible();
    expect(
      [...document.querySelectorAll(".student-record__metric")].map((card) =>
        [...card.children].map((part) => clean(part.textContent)).join(" | "),
      ),
    ).toEqual([
      "86% | Assistència · darrers 30 dies | 1 no presentat · 1 avisat",
      "7 | Classes · darrers 30 dies | mes mòbil",
      "2,3 | Entrenaments / setmana | mitjana 30 dies",
      "dl 03/08 | Darrera classe | A+B · Central · Estel",
    ]);
    expect(
      screen.getByRole("heading", { name: "Notes als instructors — de l'alumne" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "foto_balancí.jpg" })).toBeVisible();
    const tasks = blockOf("Tasques — les veu i marca l'alumne");
    await waitFor(() => {
      expect(tasks.querySelectorAll("li")).toHaveLength(3);
    });
    expect(within(tasks).getByText("2 pendents")).toBeVisible();
    expect(within(tasks).getByText("1 feta")).toBeVisible();
    expect(
      [...tasks.querySelectorAll("li")].map((row) =>
        [...row.children].map((part) => clean(part.textContent)).join(" | "),
      ),
    ).toEqual([
      "31-07 · Estel | Aquesta setmana practiqueu el balancí amb calma: sessions curtes i moltes recompenses | pendent",
      "30-07 · Marc | Repasseu la taula de contactes al jardí, 5 minuts al dia | pendent",
      "28-07 · Estel | Treballar l'«espera» a la línia de sortida | feta el 02-08",
    ]);
    expect(
      screen.getByRole("heading", {
        name: "Observacions — privades (instructors i administració)",
      }),
    ).toBeVisible();
    const table = screen.getByRole("table", { name: "5 darreres classes" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["Data", "Nivells", "Pista", "Instructor", "Assistència"]);
    expect(
      within(table)
        .getAllByRole("row")
        .slice(1)
        .map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent).join(" | ")),
    ).toEqual([
      "dl 03/08 | A+B | Central | Estel | present",
      "dj 30/07 | B+C | Central | Marc | present",
      "dl 27/07 | A+B | Central | Estel | present",
      "dj 23/07 | B+C | Central | Marc | avisat",
      "dl 20/07 | B+C | Central | Estel | no presentat",
    ]);
    expect(within(table).getByText("avisat")).toHaveClass("ah-tone--warning");
    expect(within(table).getByText("no presentat")).toHaveClass("ah-tone--danger");
  });

  it("no classes in the window reads «—»; TASKS off drops the three blocks, the button and every task read; FREE_TRAINING off drops the training card", async () => {
    await renderRecord({ dogId: "dog-thai" });
    const first = document.querySelector(".student-record__metric strong");
    expect(first?.textContent).toBe("—");
    expect(screen.getByText("Encara no hi ha classes")).toBeVisible();
    cleanup();
    const lines = requestLines();
    await renderRecord({
      modules: canic.modules.filter((module) => module !== "TASKS" && module !== "FREE_TRAINING"),
      scenario: "instructorNoTasks",
    });
    expect(screen.queryByRole("button", { name: "Gestionar tasques i notes" })).toBeNull();
    expect(screen.queryByRole("heading", { name: /Tasques —/u })).toBeNull();
    expect(screen.queryByRole("heading", { name: /Observacions —/u })).toBeNull();
    expect(screen.queryByText("Entrenaments / setmana")).toBeNull();
    expect(lines.some((line) => line.startsWith("GET /tasks"))).toBe(false);
    expect(lines.some((line) => line.startsWith("GET /parameters"))).toBe(false);
  });

  it("[GESTIONAR TASQUES I NOTES] opens the same editor as 26 in a drawer; a task created there shows in the record's block and counters", async () => {
    await renderRecord();
    fireEvent.click(screen.getByRole("button", { name: "Gestionar tasques i notes" }));
    const drawer = await screen.findByRole("dialog", { name: "Gestionar tasques i notes" });
    expect(within(drawer).getByLabelText("Observacions privades")).toBeVisible();
    fireEvent.click(within(drawer).getByRole("button", { name: "Afegir" }));
    fireEvent.change(within(drawer).getByLabelText("Text de la tasca nova"), {
      target: { value: "Salts amb calma" },
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "Afegeix" }));
    await waitFor(() => {
      expect(within(drawer).getAllByRole("listitem")).toHaveLength(4);
    });
    const block = blockOf("Tasques — les veu i marca l'alumne");
    await waitFor(() => {
      expect(within(block).getByText("3 pendents")).toBeVisible();
    });
    expect(block.querySelectorAll("li")).toHaveLength(4);
  });

  it("T-10-32 (D13): en with no missing key; `Level.name` is the api's (its ca fallback), never translated here", async () => {
    await renderRecord({ locale: "en" });
    const level = document.querySelector(".student-record__level");
    expect(level?.textContent).toMatch(/^Level C · /u);
    expect(level).toHaveAttribute("title", "Nivell C");
    expect(screen.getByText("Attendance · last 30 days")).toBeVisible();
    expect(screen.getByRole("table", { name: "Last 5 classes" })).toBeVisible();
    expect(document.body.textContent).not.toMatch(/instructor:|enums:|errors:/u);
  });
});

describe("E6-W02 round 2 (review of 30-09): D13", () => {
  const drawerCards = (drawer: HTMLElement) => [
    ...drawer.querySelectorAll<HTMLElement>(".ah-tasks__list > .ah-task"),
  ];
  const openDrawer = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Gestionar tasques i notes" }));
    return screen.findByRole("dialog", { name: "Gestionar tasques i notes" });
  };

  it("#2 (R-10-10): the drawer reaches every task too — «Mostra'n més» reads the second page, and its oldest pending task is completed there", async () => {
    await renderRecord({ scenario: "tasksMany" });
    const drawer = await openDrawer();
    await waitFor(() => {
      expect(drawerCards(drawer)).toHaveLength(50);
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "Mostra'n més" }));
    await waitFor(() => {
      expect(drawerCards(drawer)).toHaveLength(52);
    });
    const oldest = present(drawerCards(drawer)[51]);
    expect(oldest).toHaveTextContent("Repàs 49: dues sessions curtes de contactes");
    fireEvent.click(within(oldest).getByRole("button", { name: "Marca-la com a feta" }));
    await waitFor(() => {
      expect(drawerCards(drawer)[51]).toHaveTextContent("feta per l'Estel el 03-08");
    });
  });

  it("#3: a round trip through the history keeps the drawer's drafts — the new task's text and file and an open edit — and the focus comes back to the link", async () => {
    const lines = requestLines();
    await renderRecord();
    const drawer = await openDrawer();
    await waitFor(() => {
      expect(drawerCards(drawer)).toHaveLength(3);
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "Afegir" }));
    const form = within(drawer).getByRole("form", { name: "Nova tasca" });
    fireEvent.change(within(form).getByLabelText("Text de la tasca nova"), {
      target: { value: "Salts amb calma" },
    });
    const video = new File(["x"], "vídeo_salt.mp4", { type: "video/mp4" });
    fireEvent.change(within(form).getByLabelText("Adjunta un fitxer", { selector: "input" }), {
      target: { files: [video] },
    });
    fireEvent.click(
      within(present(drawerCards(drawer)[1])).getByRole("button", { name: "Edita la tasca" }),
    );
    fireEvent.change(within(drawer).getByLabelText("Text de la tasca"), {
      target: { value: "Repasseu la taula" },
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "Veure l'historial complet ›" }));
    const history = await screen.findByRole("dialog", { name: "Historial de tasques" });
    await waitFor(() => {
      expect(within(history).getAllByRole("listitem")).toHaveLength(3);
    });
    fireEvent.click(within(history).getByRole("button", { name: "Tanca" }));
    const back = await screen.findByRole("dialog", { name: "Gestionar tasques i notes" });
    expect(within(back).getByLabelText("Text de la tasca nova")).toHaveValue("Salts amb calma");
    expect(within(back).getByRole("button", { name: "vídeo_salt.mp4" })).toBeVisible();
    expect(within(back).getByLabelText("Text de la tasca")).toHaveValue("Repasseu la taula");
    expect(within(back).getByRole("button", { name: "Veure l'historial complet ›" })).toHaveFocus();
    expect(lines.some((line) => /^(POST|PATCH|PUT) /u.test(line))).toBe(false);
  });

  it("#4 (AGENTS rule 4): a clip of the record that cannot be opened says why next to it — by its code, or «No s'ha pogut obrir el fitxer.» without an answer", async () => {
    let answer: "forbidden" | "network" = "forbidden";
    server.use(
      http.get("*/api/v1/attachments", () =>
        answer === "network"
          ? HttpResponse.error()
          : HttpResponse.json(
              { code: "FORBIDDEN", details: {}, message: "Forbidden", traceId: "t" },
              { status: 403 },
            ),
      ),
    );
    await renderRecord();
    const note = blockOf("Notes als instructors — de l'alumne");
    const clip = within(note).getByRole("button", { name: "foto_balancí.jpg" });
    fireEvent.click(clip);
    const refused = await within(note).findByRole("alert");
    expect(refused).toHaveTextContent("No teniu permís per fer aquesta acció.");
    expect(clip.closest(".ah-attachment-chip")?.nextElementSibling).toBe(refused);
    answer = "network";
    fireEvent.click(clip);
    await waitFor(() => {
      expect(within(note).getByRole("alert")).toHaveTextContent("No s'ha pogut obrir el fitxer.");
    });
  });

  it("#6 T-10-32 (D13): es renders every literal of the record in Spanish, with no missing key", async () => {
    await renderRecord({ locale: "es" });
    expect(screen.getByRole("heading", { level: 1, name: "Laura + Duna" })).toBeVisible();
    const header = present(document.querySelector<HTMLElement>(".student-record__header"));
    expect([...header.querySelectorAll(".ah-chip")].map((chip) => chip.textContent)).toEqual([
      "Nivel C · hace 8 meses",
      "Abonada",
      "Border collie · 4 años",
    ]);
    expect(within(header).getByRole("button", { name: "Gestionar tareas y notas" })).toBeVisible();
    expect(
      [...document.querySelectorAll(".student-record__metric")].map((card) =>
        [...card.children].map((part) => clean(part.textContent)).join(" | "),
      ),
    ).toEqual([
      "86% | Asistencia · últimos 30 días | 1 no presentado · 1 avisado",
      "7 | Clases · últimos 30 días | mes móvil",
      "2,3 | Entrenamientos / semana | media 30 días",
      // E6-W05 step 7: es writes day and month zero-padded, as ca and the mockups («03/08»).
      "lun 03/08 | Última clase | A+B · Central · Estel",
    ]);
    expect(
      screen.getByRole("heading", { name: "Notas a los instructores — del alumno" }),
    ).toBeVisible();
    const tasks = blockOf("Tareas — las ve y marca el alumno");
    await waitFor(() => {
      expect(tasks.querySelectorAll("li")).toHaveLength(3);
    });
    expect(within(tasks).getByText("2 pendientes")).toBeVisible();
    expect(within(tasks).getByText("1 hecha")).toBeVisible();
    expect(
      [...tasks.querySelectorAll("li")].map((row) => clean(row.lastElementChild?.textContent)),
    ).toEqual(["pendiente", "pendiente", "hecha el 02-08"]);
    expect(
      screen.getByRole("heading", {
        name: "Observaciones — privadas (instructores y administración)",
      }),
    ).toBeVisible();
    const table = screen.getByRole("table", { name: "5 últimas clases" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["Fecha", "Niveles", "Pista", "Instructor", "Asistencia"]);
    expect(
      within(table)
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.querySelector("td:last-child")?.textContent),
    ).toEqual(["presente", "presente", "presente", "avisado", "no presentado"]);
    expect(document.body.textContent).not.toMatch(/instructor:|enums:|errors:/u);
  });
});

describe("E6-W05 (review of E6-W02's round 2): D13's drawer", () => {
  it("step 3 (AGENTS rule 6): Escape in the delete confirmation closes the confirmation only; the drawer stays open with its unsaved task text and deletes nothing", async () => {
    const lines = requestLines();
    await renderRecord();
    fireEvent.click(screen.getByRole("button", { name: "Gestionar tasques i notes" }));
    const drawer = await screen.findByRole("dialog", { name: "Gestionar tasques i notes" });
    await waitFor(() => {
      expect(drawer.querySelectorAll(".ah-tasks__list > .ah-task")).toHaveLength(3);
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "Afegir" }));
    fireEvent.change(within(drawer).getByLabelText("Text de la tasca nova"), {
      target: { value: "Salts amb calma" },
    });
    const [remove] = within(drawer).getAllByRole("button", { name: "Elimina la tasca" });
    fireEvent.click(present(remove));
    expect(screen.getByRole("dialog", { name: "Vols eliminar aquesta tasca?" })).toBeVisible();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Vols eliminar aquesta tasca?" })).toBeNull();
    const still = screen.getByRole("dialog", { name: "Gestionar tasques i notes" });
    expect(within(still).getByLabelText("Text de la tasca nova")).toHaveValue("Salts amb calma");
    // A second Escape closes the drawer, the topmost overlay now.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Gestionar tasques i notes" })).toBeNull();
    expect(lines.some((line) => line.startsWith("DELETE "))).toBe(false);
  });
});

describe("E6-W04 step 0d (review of E6-W05): D13's drawer", () => {
  it("E6-W04 step 0d: an instructor's mixed selection on an open task attaches the JPEG and says «eina.exe: …» in the drawer", async () => {
    const lines = requestLines();
    await renderRecord();
    fireEvent.click(screen.getByRole("button", { name: "Gestionar tasques i notes" }));
    const drawer = await screen.findByRole("dialog", { name: "Gestionar tasques i notes" });
    const second = () =>
      present(drawer.querySelectorAll<HTMLElement>(".ah-tasks__list > .ah-task")[1]);
    await waitFor(() => {
      expect(drawer.querySelectorAll(".ah-tasks__list > .ah-task")).toHaveLength(3);
    });
    // An instructor cannot read the file limits (403): every file goes to the api.
    await waitFor(() => {
      expect(lines.filter((line) => line.startsWith("GET /parameters/files."))).toHaveLength(3);
    });
    fireEvent.click(within(second()).getByRole("button", { name: "Edita la tasca" }));
    fireEvent.change(within(second()).getByLabelText("Adjunta un fitxer", { selector: "input" }), {
      target: {
        files: [
          new File(["x"], "contactes.jpg", { type: "image/jpeg" }),
          new File(["x"], "eina.exe", { type: "application/x-msdownload" }),
        ],
      },
    });
    expect(await within(second()).findByRole("button", { name: "contactes.jpg" })).toBeVisible();
    await waitFor(() => {
      expect(second()).not.toHaveAttribute("aria-busy");
    });
    expect(
      within(drawer)
        .getAllByRole("alert")
        .map((alert) => alert.textContent),
    ).toEqual(["eina.exe: Aquest tipus de fitxer no està permès."]);
    expect(lines.filter((line) => line === "POST /attachments")).toHaveLength(1);
    expect(lines.filter((line) => line.startsWith("PUT "))).toHaveLength(1);
  });
});

describe("E7-W06 (E6-W04 question 5 and its report nits): D13's drawer", () => {
  const manage = "Gestionar tasques i notes";
  async function openDrawer(lines: string[]) {
    fireEvent.click(screen.getByRole("button", { name: manage }));
    const drawer = await screen.findByRole("dialog", { name: manage });
    await waitFor(() => {
      expect(drawer.querySelectorAll(".ah-tasks__list > .ah-task")).toHaveLength(3);
    });
    // An instructor cannot read the file limits (403): every file goes to the api.
    await waitFor(() => {
      expect(lines.filter((line) => line.startsWith("GET /parameters/files."))).toHaveLength(3);
    });
    return drawer;
  }

  it("E7-W06 step 5 (E6-W04 Q5): an instructor's new task with a refused file names it — «eina.exe: …» — in the drawer, and creates nothing", async () => {
    const lines = requestLines();
    await renderRecord();
    const drawer = await openDrawer(lines);
    fireEvent.click(within(drawer).getByRole("button", { name: "Afegir" }));
    const form = within(drawer).getByRole("form", { name: "Nova tasca" });
    fireEvent.change(within(form).getByLabelText("Text de la tasca nova"), {
      target: { value: "Salts amb calma" },
    });
    fireEvent.change(within(form).getByLabelText("Adjunta un fitxer", { selector: "input" }), {
      target: { files: [new File(["x"], "eina.exe", { type: "application/x-msdownload" })] },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Afegeix" }));
    await waitFor(() => {
      expect(
        within(drawer)
          .getAllByRole("alert")
          .map((alert) => alert.textContent),
      ).toEqual(["eina.exe: Aquest tipus de fitxer no està permès."]);
    });
    expect(lines.filter((line) => line === "POST /tasks")).toHaveLength(0);
    expect(within(form).getByLabelText("Text de la tasca nova")).toHaveValue("Salts amb calma");
  });

  it("E7-W06 review #6: a creation abandoned while on its way (the drawer closed) keeps nothing when its answer is lost — the same task and file later are uploaded again and sent with a new key", async () => {
    const lines = requestLines();
    const keys: (string | null)[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post("*/api/v1/tasks", async ({ request }) => {
        keys.push(request.headers.get("Idempotency-Key"));
        if (keys.length > 1) return undefined;
        await gate;
        return HttpResponse.error();
      }),
    );
    const photo = new File(["x"], "salt.jpg", { type: "image/jpeg" });
    const create = (drawer: HTMLElement) => {
      fireEvent.click(within(drawer).getByRole("button", { name: "Afegir" }));
      const form = within(drawer).getByRole("form", { name: "Nova tasca" });
      fireEvent.change(within(form).getByLabelText("Text de la tasca nova"), {
        target: { value: "Salts amb calma" },
      });
      fireEvent.change(within(form).getByLabelText("Adjunta un fitxer", { selector: "input" }), {
        target: { files: [photo] },
      });
      fireEvent.click(within(form).getByRole("button", { name: "Afegeix" }));
    };
    await renderRecord();
    let drawer = await openDrawer(lines);
    create(drawer);
    await waitFor(() => {
      expect(keys).toHaveLength(1);
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "Tanca" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: manage })).toBeNull();
    });
    release();
    await waitFor(() => {
      expect(lines.filter((line) => line === "POST /tasks")).toHaveLength(1);
    });
    // Let the lost answer settle before the drawer opens again.
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    drawer = await openDrawer(lines);
    create(drawer);
    await waitFor(() => {
      expect(keys).toHaveLength(2);
    });
    expect(keys[1]).not.toBe(keys[0]);
    // The file is uploaded again: the api may have bound the first upload to what it created.
    expect(lines.filter((line) => line === "POST /attachments/upload-url")).toHaveLength(2);
  });

  it("E7-W06 step 6 (E6-W04's report nit): the drawer closed after a refusal reopens without it", async () => {
    const lines = requestLines();
    await renderRecord();
    let drawer = await openDrawer(lines);
    const observations = within(drawer).getAllByLabelText("Adjunta un fitxer", {
      selector: "input",
    })[0];
    fireEvent.change(present(observations), {
      target: { files: [new File(["x"], "eina.exe", { type: "application/x-msdownload" })] },
    });
    await waitFor(() => {
      expect(
        within(drawer)
          .getAllByRole("alert")
          .map((alert) => alert.textContent),
      ).toEqual(["eina.exe: Aquest tipus de fitxer no està permès."]);
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "Tanca" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: manage })).toBeNull();
    });
    drawer = await openDrawer(lines);
    expect(within(drawer).queryByRole("alert")).toBeNull();
    expect(within(drawer).queryByText(/eina\.exe/u)).toBeNull();
  });
});

describe("«Alumnes» of the back office (mockups D12–D14, S10 §13-9)", () => {
  it("instructors see «Alumnes» in the sidebar; the search reads GET /dogs and opens D13", async () => {
    const i18n = await createI18n({
      branding: canic,
      browserLanguages: ["ca"],
      initialNamespaces: ["shell", "instructor", "errors"],
      storage: undefined,
    });
    render(
      <I18nextProvider i18n={i18n}>
        <BrandingProvider branding={canic}>
          <AdminNavigation
            modules={canic.modules}
            pathname="/alumnes/dog-duna"
            roles={["INSTRUCTOR"]}
          />
        </BrandingProvider>
      </I18nextProvider>,
    );
    const entry = screen.getByRole("link", { name: "Alumnes" });
    expect(entry).toHaveAttribute("href", "/alumnes");
    // Mockup D13: the entry stays lit on a student's record.
    expect(entry).toHaveAttribute("aria-current", "page");
    cleanup();
    mockScenario("instructor");
    const lines = requestLines();
    const onNavigate = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <BrandingProvider branding={canic}>
          <StudentsPage
            client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
            onNavigate={onNavigate}
          />
        </BrandingProvider>
      </I18nextProvider>,
    );
    fireEvent.change(await screen.findByPlaceholderText("Cerca un alumne"), {
      target: { value: "Duna" },
    });
    await waitFor(() => {
      expect(lines.some((line) => line.includes("q=Duna"))).toBe(true);
    });
    await waitFor(() => {
      const names = screen.getAllByRole("link").map((item) => item.textContent);
      expect(names.length).toBeGreaterThan(0);
      expect(names.every((name) => name.includes("Duna"))).toBe(true);
    });
    const link = present(screen.getAllByRole("link")[0]);
    fireEvent.click(link);
    expect(onNavigate).toHaveBeenCalledWith(link.getAttribute("href"));
    expect(link.getAttribute("href")).toMatch(/^\/alumnes\/dog-/u);
    expect(lines.some((line) => line.startsWith("GET /dogs?") && line.includes("q=Duna"))).toBe(
      true,
    );
  });

  it("E5-W05 step 23 (R-10-00): «Alumnes» writes the owner's first name the api sends, a compound one whole («Joan Antoni + Toby»), and adds «(abonat: {nom i cognom})» to a dog led by another guide", async () => {
    const dogs = [
      {
        // No handlerName: the member leads the dog (the api leaves the key out).
        id: "00000000-0000-4000-8000-00000000a001",
        level: { code: "B", color: null, id: "00000000-0000-4000-8000-00000000000b", name: "B" },
        name: "Toby",
        owner: {
          firstName: "Joan Antoni",
          fullName: "Joan Antoni Puig Serra",
          id: "00000000-0000-4000-8000-00000000b001",
          status: "ACTIVE",
        },
      },
      {
        handlerName: "Júlia Roca",
        id: "00000000-0000-4000-8000-00000000a002",
        level: { code: "D", color: null, id: "00000000-0000-4000-8000-00000000000d", name: "D" },
        name: "Rock",
        owner: {
          firstName: "Laura",
          fullName: "Laura Serra Vidal",
          id: "00000000-0000-4000-8000-00000000b002",
          status: "ACTIVE",
        },
      },
      {
        // E5-W05 round 2 #5: a handlerName equal to the owner's first name is the owner.
        handlerName: "Joan Antoni",
        id: "00000000-0000-4000-8000-00000000a003",
        level: { code: "B", color: null, id: "00000000-0000-4000-8000-00000000000b", name: "B" },
        name: "Brisa",
        owner: {
          firstName: "Joan Antoni",
          fullName: "Joan Antoni Puig Serra",
          id: "00000000-0000-4000-8000-00000000b001",
          status: "ACTIVE",
        },
      },
    ];
    server.use(
      http.get("*/api/v1/dogs", () =>
        HttpResponse.json({
          appliedFilters: [{ field: "status", op: "eq", value: "ACTIVE" }],
          items: dogs,
          page: 0,
          size: 50,
          totalItems: dogs.length,
          totalPages: 1,
        }),
      ),
    );
    mockScenario("instructor");
    const i18n = await createI18n({
      branding: canic,
      browserLanguages: ["ca"],
      initialNamespaces: ["instructor", "enums", "errors", "common"],
      storage: undefined,
    });
    render(
      <I18nextProvider i18n={i18n}>
        <BrandingProvider branding={canic}>
          <StudentsPage
            client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
            onNavigate={vi.fn()}
          />
        </BrandingProvider>
      </I18nextProvider>,
    );
    const toby = await screen.findByRole("link", { name: "Joan Antoni + Toby · B" });
    expect(within(toby).queryByText(/abonat/u)).toBeNull();
    const rock = screen.getByRole("link", { name: /^Júlia Roca \+ Rock · D/u });
    expect(within(rock).getByText("(abonat: Laura Serra Vidal)")).toBeVisible();
    // E5-W05 round 2 #5 (R-10-00 «si difereixen»): «Joan Antoni» leads his own dog.
    const brisa = screen.getByRole("link", { name: "Joan Antoni + Brisa · B" });
    expect(within(brisa).queryByText(/abonat/u)).toBeNull();
  });
});
