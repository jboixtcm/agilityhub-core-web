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
});
