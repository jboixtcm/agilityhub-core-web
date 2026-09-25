import { createApiClient } from "@agilityhub/api-client";
import {
  catalogState,
  mockScenario,
  planningState,
  resetCatalogState,
  resetPlanningState,
  resetSettingsState,
} from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CalendarPage } from "./CalendarPage";

const branding: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};
// The D4 mockup is drawn on Wednesday 12 August 2026 (club-local week 2026-08-10…16).
const mockupNow = new Date("2026-08-12T08:00:00Z");

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  vi.useFakeTimers({ now: mockupNow, shouldAdvanceTime: true, toFake: ["Date"] });
  resetCatalogState();
  resetPlanningState();
  resetSettingsState();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.events.removeAllListeners();
  vi.useRealTimers();
  resetPlanningState();
  resetCatalogState();
  resetSettingsState();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

async function renderCalendar({
  modules = branding.modules,
  readOnly = false,
  search = "",
}: { modules?: readonly string[]; readOnly?: boolean; search?: string } = {}) {
  window.history.replaceState(null, "", `/calendari${search}`);
  const clubBranding: Branding = { ...branding, modules: [...modules] };
  const i18n = await createI18n({
    branding: clubBranding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-scheduling", "enums", "errors"],
    storage: undefined,
  });
  const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
  const onNavigate = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={clubBranding}>
        <CalendarPage client={client} onNavigate={onNavigate} readOnly={readOnly} />
      </BrandingProvider>
    </I18nextProvider>,
  );
  return { client, onNavigate };
}

const WEDNESDAY_1850 = "cls-2026-08-12-1850-0";

/** Another admin's change, straight to the mock api: it bumps the class version. */
async function concurrentPatch(
  client: ReturnType<typeof createApiClient>,
  body: { capacity?: number; version: number },
) {
  await client.PATCH("/class-sessions/{id}", { body, params: { path: { id: WEDNESDAY_1850 } } });
}

function optionValues(select: HTMLElement): string[] {
  return [...(select as HTMLSelectElement).options].map((option) => option.value);
}

function minutesOfDay(time: string): number {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** The form of a submit button (to submit it while the button is disabled). */
function formOf(element: HTMLElement): HTMLFormElement {
  const form = element.closest("form");
  if (form === null) throw new TypeError("Missing form");
  return form;
}

/** Lets a request that should not exist reach the capture before asserting it did not. */
function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 50);
  });
}

function selectedLabel(select: HTMLElement): string | undefined {
  const element = select as HTMLSelectElement;
  return element.options[element.selectedIndex]?.textContent ?? undefined;
}

function openingHoursWithShortSaturday() {
  const day = { close: "22:00", open: "07:00" };
  return http.get("*/api/v1/club/opening-hours", () =>
    HttpResponse.json({
      key: "club.openingHours",
      value: {
        FRIDAY: day,
        MONDAY: day,
        SATURDAY: { close: "14:00", open: "09:00" },
        SUNDAY: day,
        THURSDAY: day,
        TUESDAY: day,
        WEDNESDAY: day,
      },
    }),
  );
}

const weekdays = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

/** `club.openingHours` of the mock club, changed through the api (R-02-09: an absent day is closed). */
async function putOpeningHours(open: string, close: string, days: readonly string[] = weekdays) {
  const api = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
  const current = await api.GET("/club/opening-hours");
  await api.PUT("/club/opening-hours", {
    body: {
      value: Object.fromEntries(days.map((day) => [day, { close, open }])),
      version: current.data?.version ?? 1,
    },
  });
}

/** Captures the JSON bodies of the requests that match `method` and the path suffix. */
function captureBodies(method: string, pathSuffix: string): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = [];
  server.events.on("request:start", ({ request }) => {
    if (request.method === method && new URL(request.url).pathname.endsWith(pathSuffix)) {
      void request
        .clone()
        .json()
        .then((body: Record<string, unknown>) => bodies.push(body));
    }
  });
  return bodies;
}

/** A calendar refetch that waits until `release()` once `hold` is set. */
function heldCalendar() {
  let resolveHeld: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    resolveHeld = resolve;
  });
  const control = {
    hold: false,
    release: () => {
      resolveHeld();
    },
  };
  // Resolvers that return nothing fall through to the stateful mock once released.
  server.use(
    http.get("*/api/v1/weeks/:id/calendar", async () => {
      if (control.hold) await held;
    }),
  );
  return control;
}

function grid(range: RegExp) {
  return screen.findByRole("table", { name: range });
}

function selectedCard() {
  return screen.getByRole("region", { name: /^Classe seleccionada/u });
}

/** Every editor and action of the selected ACTIVE class card. */
function cardEditors() {
  const card = selectedCard();
  return [
    within(card).getByRole("spinbutton"),
    within(card).getByLabelText("Pista"),
    within(card).getByLabelText("Hora"),
    within(card).getByLabelText("Descripció"),
    within(card).getByRole("button", { name: /^Nivells/u }),
    within(card).getByRole("button", { name: "Exempta de la revisió de les 7:30" }),
    within(card).getByRole("button", { name: "ACCEPTA" }),
    within(card).getByRole("button", { name: "ANUL·LA LA CLASSE" }),
    within(card).getByRole("button", { name: "ELIMINA" }),
  ];
}

const STALE_MESSAGE =
  "Aquest element s'ha modificat des d'un altre lloc. Actualitzeu-lo i torneu-ho a provar.";
const INVALID_STATE_MESSAGE = "Aquest element no està en un estat vàlid per a aquesta operació.";
const CLOSED_DAY = "El club està tancat aquest dia";
const VISIBLE_NOW = "Els alumnes la veuran de seguida";

/** A class on Sunday 16, created while the club still opened on Sundays. */
async function createSundayClass() {
  const api = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
  const created = await api.POST("/class-sessions", {
    body: {
      date: "2026-08-16",
      endTime: "11:00",
      instructorIds: ["instructor-marc"],
      levelIds: ["level-b"],
      ringId: "ring-central",
      startTime: "10:00",
    },
  });
  if (created.data === undefined) throw new TypeError("Missing the Sunday class");
  return created.data;
}

describe("E3-W07 step 9 a D1 risk row opens D4 on its class", () => {
  it("selects the class of `?classe=` in the week of `?setmana=`", async () => {
    await renderCalendar({ search: `?classe=${WEDNESDAY_1850}&estat=actives&setmana=2026-08-10` });
    await grid(/del 10 al 16 d.agost$/u);
    expect(selectedCard()).toHaveTextContent(
      "Classe seleccionada — dc 12 · 18:50 · B+C · Central · Marc",
    );
  });
});

describe("T-06-28 D4 / D4b / D4c class calendar (front half, MSW)", () => {
  it("opens «Esborrany» on the first week with drafts, with the validation card and its count", async () => {
    await renderCalendar();
    await grid(/del 10 al 16 d.agost$/u);
    expect(screen.getByRole("button", { name: "Setmana" })).toHaveTextContent(
      "Setmana en curs · del 10 al 16 d’agost",
    );
    expect(window.location.search).toBe("?estat=actives&setmana=2026-08-10");

    fireEvent.click(screen.getByRole("button", { name: "Esborrany" }));
    const drafts = await grid(/del 17 al 23 d.agost$/u);
    expect(window.location.search).toBe("?estat=esborrany&setmana=2026-08-17");
    expect(screen.getByRole("button", { name: "Setmana" })).toHaveTextContent(
      "Setmana vinent · del 17 al 23 d’agost",
    );
    expect(drafts.querySelectorAll(".ah-schedule-cell--dashed")).toHaveLength(28);
    expect(
      screen.getByText(
        "contorn discontinu = esborrany (els alumnes encara no la veuen) · Clica el nom d'un dia per veure'l per pista o per instructor",
      ),
    ).toBeVisible();

    const validation = screen.getByRole("region", { name: "Validació de la setmana" });
    expect(validation).toHaveTextContent(
      "Setmana vinent · del 17 al 23 d’agost · 28 classes en esborrany · cap incoherència",
    );
    expect(within(validation).getByText("28 classes").tagName).toBe("STRONG");
    expect(validation).toHaveTextContent(
      "En validar, les 28 classes passen a actives alhora i els alumnes ja les poden reservar. No es pot validar una classe sola.",
    );
    expect(within(validation).getByRole("button", { name: "VALIDAR LA SETMANA" })).toBeEnabled();

    // ‹ › move inside the filter: the next week with drafts has an inconsistency.
    fireEvent.click(screen.getByRole("button", { name: "Setmana següent" }));
    await grid(/del 24 al 30 d.agost$/u);
    const blocked = screen.getByRole("region", { name: "Validació de la setmana" });
    // Neither current nor next: the summary starts with the range only (step 1).
    expect(blocked.querySelector(".calendar-validation-card__summary")).toHaveTextContent(
      /^del 24 al 30 d’agost · 6 classes en esborrany · 1 incoherència$/u,
    );
    expect(within(blocked).getByRole("button", { name: "VALIDAR LA SETMANA" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Setmana següent" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /pista Central amb dues classes alhora/u }),
    ).toBeVisible();
  });

  it("[VALIDAR LA SETMANA] turns every draft of the week active at once", async () => {
    await renderCalendar({ search: "?estat=esborrany" });
    await grid(/del 17 al 23 d.agost$/u);

    fireEvent.click(screen.getByRole("button", { name: "VALIDAR LA SETMANA" }));
    const dialog = await screen.findByRole("dialog", { name: "Validació de la setmana" });
    fireEvent.click(within(dialog).getByRole("button", { name: "VALIDAR LA SETMANA" }));

    expect(await screen.findByText("28 classes validades")).toBeVisible();
    await waitFor(() => {
      expect(window.location.search).toBe("?estat=actives&setmana=2026-08-17");
    });
    expect(screen.getByRole("button", { name: "Actives" })).toHaveAttribute("aria-pressed", "true");
    const active = await grid(/del 17 al 23 d.agost$/u);
    await waitFor(() => {
      expect(active.querySelectorAll("button.ah-schedule-cell")).toHaveLength(28);
    });
    expect(active.querySelectorAll(".ah-schedule-cell--dashed")).toHaveLength(0);
    expect(within(active).getAllByText("0/5").length).toBeGreaterThan(0);
  });

  it("cancels an active class with registrants through D4c: four rows, text required, «ANUL·LA I AVISA ELS 4 ALUMNES»", async () => {
    const keys: string[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.method === "POST" && request.url.endsWith("/cancellation")) {
        keys.push(request.headers.get("Idempotency-Key") ?? "");
      }
    });
    await renderCalendar();
    const week = await grid(/del 10 al 16 d.agost$/u);

    fireEvent.click(within(week).getByRole("button", { name: /^dc 12 18:50 · B\+C · 4\/5 \+2/u }));
    expect(selectedCard()).toHaveTextContent(
      "Classe seleccionada — dc 12 · 18:50 · B+C · Central · Marcactiva4/5 +2",
    );
    fireEvent.click(within(selectedCard()).getByRole("button", { name: "ANUL·LA LA CLASSE" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Anul·lar la classe — dc 12 · 18:50 · B+C · Central · Marc",
    });
    expect(dialog).toHaveTextContent(
      "Aquesta classe té 4 alumnes inscrits. Si l'anul·les, rebran un avís a l'app, per correu i per SMS amb el text que escriguis a sota.",
    );
    const rows = within(
      within(dialog).getByRole("table", { name: "Alumnes inscrits" }),
    ).getAllByRole("row");
    expect(rows.map((row) => row.textContent)).toEqual([
      "Laura Serra + DunaCapp · correu · SMS (2 telèfons)",
      "Marc Prats + Chun-liBapp · correu · SMS",
      "Aina Roca + NassBapp · correu · SMS",
      "Biel Puig + ThaiCapp · correu · SMS",
    ]);
    expect(dialog).toHaveTextContent(
      "S'envia amb la plantilla «Classe anul·lada pel club» · també a la llista d'espera (2)",
    );
    const confirm = within(dialog).getByRole("button", { name: "ANUL·LA I AVISA ELS 4 ALUMNES" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Text de l'avís"), {
      target: { value: "La classe queda anul·lada per la pluja. Disculpeu les molèsties!" },
    });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    expect(await screen.findByText("Classe anul·lada")).toBeVisible();
    await waitFor(() => {
      expect(
        within(week).getByRole("button", {
          name: /^dc 12 18:50 · B\+C · 0\/5 · anul·lada · pel club/u,
        }),
      ).toBeVisible();
    });
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it("[ELIMINA] of an active class goes through the same D4c modal", async () => {
    await renderCalendar();
    const week = await grid(/del 10 al 16 d.agost$/u);

    fireEvent.click(within(week).getByRole("button", { name: /^dt 11 18:50 · A\+B · 3\/5/u }));
    fireEvent.click(within(selectedCard()).getByRole("button", { name: "ELIMINA" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Anul·lar la classe — dt 11 · 18:50 · A+B · Central · Laura",
    });
    const confirm = within(dialog).getByRole("button", { name: "ANUL·LA I AVISA ELS 3 ALUMNES" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Text de l'avís"), {
      target: { value: "Eliminem la classe." },
    });
    fireEvent.click(confirm);

    expect(await screen.findByText("Classe eliminada")).toBeVisible();
    await waitFor(() => {
      expect(
        within(week).getByRole("button", {
          name: /^dt 11 18:50 · A\+B · 0\/5 · anul·lada · eliminada/u,
        }),
      ).toBeVisible();
    });

    fireEvent.click(screen.getByRole("button", { name: "Anul·lades" }));
    const cancelled = await grid(/del 10 al 16 d.agost$/u);
    await waitFor(() => {
      expect(cancelled.querySelectorAll("button.ah-schedule-cell--struck")).toHaveLength(2);
    });
  });

  it("R-06-09 saves the diff with the version; STALE_VERSION keeps its message after the refetch remounts the card", async () => {
    const { client } = await renderCalendar();
    const week = await grid(/del 10 al 16 d.agost$/u);
    fireEvent.click(within(week).getByRole("button", { name: /^dc 12 18:50 · B\+C/u }));

    const accept = within(selectedCard()).getByRole("button", { name: "ACCEPTA" });
    const exempt = within(selectedCard()).getByRole("button", {
      name: "Exempta de la revisió de les 7:30",
    });
    expect(accept).toBeDisabled();
    expect(exempt).toBeEnabled();
    fireEvent.change(within(selectedCard()).getByRole("spinbutton"), { target: { value: "3" } });
    // Unsaved chip edits: the exemption (which reloads the class) waits for them.
    expect(exempt).toBeDisabled();
    fireEvent.click(accept);
    expect(
      await within(selectedCard()).findByText(
        "La capacitat no pot ser inferior a les reserves actuals.",
      ),
    ).toBeVisible();

    // Another admin raises the limit to 7 meanwhile: the class is now at version 2.
    await concurrentPatch(client, { capacity: 7, version: 1 });
    const bodies: unknown[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.method === "PATCH") {
        void request
          .clone()
          .json()
          .then((body: unknown) => bodies.push(body));
      }
    });
    fireEvent.change(within(selectedCard()).getByRole("spinbutton"), { target: { value: "6" } });
    fireEvent.click(within(selectedCard()).getByRole("button", { name: "ACCEPTA" }));

    // The refetch brings version 2, so the card remounts with the other admin's limit…
    await waitFor(() => {
      expect(
        within(week).getByRole("button", { name: /^dc 12 18:50 · B\+C · 4\/7 \+2/u }),
      ).toBeVisible();
    });
    await waitFor(() => {
      expect(within(selectedCard()).getByRole("spinbutton")).toHaveValue(7);
    });
    // …and the conflict message is still on the page.
    expect(
      screen.getByText(
        "Aquest element s'ha modificat des d'un altre lloc. Actualitzeu-lo i torneu-ho a provar.",
      ),
    ).toBeVisible();
    expect(bodies).toEqual([{ capacity: 6, version: 1 }]);

    fireEvent.change(within(selectedCard()).getByRole("spinbutton"), { target: { value: "6" } });
    fireEvent.click(within(selectedCard()).getByRole("button", { name: "ACCEPTA" }));
    expect(await screen.findByText("Canvis desats")).toBeVisible();
    await waitFor(() => {
      expect(
        within(week).getByRole("button", { name: /^dc 12 18:50 · B\+C · 4\/6 \+2/u }),
      ).toBeVisible();
    });
    expect(bodies).toEqual([
      { capacity: 6, version: 1 },
      { capacity: 6, version: 2 },
    ]);
    server.events.removeAllListeners();
  });

  it("R-06-09 keeps the INVALID_STATE message of the «Exempta…» toggle after the refetch", async () => {
    const { client } = await renderCalendar();
    const week = await grid(/del 10 al 16 d.agost$/u);
    fireEvent.click(within(week).getByRole("button", { name: /^dc 12 18:50 · B\+C/u }));
    // Another admin cancels the class meanwhile (new state, new version).
    await client.POST("/class-sessions/{id}/cancellation", {
      body: { adminText: "Plou massa.", reason: "CLUB_MANUAL" },
      params: { header: { "Idempotency-Key": "concurrent-cancel" }, path: { id: WEDNESDAY_1850 } },
    });
    fireEvent.click(
      within(selectedCard()).getByRole("button", { name: "Exempta de la revisió de les 7:30" }),
    );

    await waitFor(() => {
      expect(selectedCard()).toHaveTextContent(/^Classe seleccionada — dc 12 .*anul·lada0\/5/u);
    });
    expect(
      screen.getByText("Aquest element no està en un estat vàlid per a aquesta operació."),
    ).toBeVisible();
  });

  it("R-06-05 moving a class onto training bookings asks first and resends with cancelBookings", async () => {
    await renderCalendar();
    const week = await grid(/del 10 al 16 d.agost$/u);
    const bodies: unknown[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.method === "PATCH") {
        void request
          .clone()
          .json()
          .then((body: unknown) => bodies.push(body));
      }
    });
    fireEvent.click(within(week).getByRole("button", { name: /^dc 12 18:50 · B\+C/u }));
    fireEvent.change(within(selectedCard()).getByLabelText("Pista"), {
      target: { value: "ring-muntanya" },
    });
    fireEvent.click(within(selectedCard()).getByRole("button", { name: "ACCEPTA" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Aquesta pista té reserves d'entrenament",
    });
    expect(
      within(dialog)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Clara Font + Trevi"]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Anul·la les reserves i desa" }));

    expect(await screen.findByText("Canvis desats")).toBeVisible();
    await waitFor(() => {
      expect(
        within(week).getByRole("button", { name: /^dc 12 18:50 · B\+C · 4\/5 \+2 · Muntanya/u }),
      ).toBeVisible();
    });
    expect(bodies).toEqual([
      { ringId: "ring-muntanya", version: 1 },
      { cancelBookings: true, ringId: "ring-muntanya", version: 1 },
    ]);
    server.events.removeAllListeners();
  });

  it("R-06-10 D4c with only a waitlist: no «0 alumnes», a waitlist intro and button", async () => {
    server.use(
      http.get("*/api/v1/class-sessions/:id/cancellation-preview", () =>
        HttpResponse.json({ bookings: [], waitlistCount: 2 }),
      ),
    );
    await renderCalendar();
    const week = await grid(/del 10 al 16 d.agost$/u);
    fireEvent.click(within(week).getByRole("button", { name: /^dc 12 18:50 · B\+C/u }));
    fireEvent.click(within(selectedCard()).getByRole("button", { name: "ANUL·LA LA CLASSE" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Anul·lar la classe — dc 12 · 18:50 · B+C · Central · Marc",
    });
    expect(dialog).toHaveTextContent(
      "Aquesta classe no té alumnes inscrits, però té 2 alumnes a la llista d'espera. Si l'anul·les, rebran un avís a l'app, per correu i per SMS amb el text que escriguis a sota.",
    );
    expect(within(dialog).getByText("2 alumnes a la llista d'espera").tagName).toBe("STRONG");
    expect(dialog).not.toHaveTextContent(/\b0 alumnes/u);
    expect(within(dialog).queryByRole("table")).not.toBeInTheDocument();
    expect(dialog).toHaveTextContent(
      "S'envia amb la plantilla «Classe anul·lada pel club» · també a la llista d'espera (2)",
    );
    const confirm = within(dialog).getByRole("button", {
      name: "ANUL·LA I AVISA LA LLISTA D'ESPERA",
    });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Text de l'avís"), {
      target: { value: "Plou massa." },
    });
    expect(confirm).toBeEnabled();
  });

  it("R-06-11 the block drawer starts on the club-local today and a Saturday date offers Saturday's hours only", async () => {
    server.use(openingHoursWithShortSaturday());
    await renderCalendar();
    await grid(/del 10 al 16 d.agost$/u);

    fireEvent.click(screen.getByRole("button", { name: "Bloqueja pista" }));
    const drawer = await screen.findByRole("dialog", { name: "Bloqueja pista" });
    // No date yet: the options of today (Wednesday 12, 7:00–22:00).
    expect(within(drawer).getByLabelText("De")).toHaveValue("07:00");
    fireEvent.change(within(drawer).getByLabelText("Data"), { target: { value: "15082026" } });

    const from = within(drawer).getByLabelText("De");
    const to = within(drawer).getByLabelText("A");
    expect(optionValues(from)[0]).toBe("09:00");
    expect(optionValues(from).at(-1)).toBe("13:30");
    expect(optionValues(from).every((time) => time >= "09:00" && time <= "13:30")).toBe(true);
    expect(optionValues(to)[0]).toBe("09:30");
    expect(optionValues(to).at(-1)).toBe("14:00");
    expect(from).toHaveValue("09:00");
    expect(to).toHaveValue("09:30");

    // A later start keeps the minimum length and never leaves the opening hours.
    fireEvent.change(from, { target: { value: "13:30" } });
    expect(to).toHaveValue("14:00");
    expect(optionValues(to).every((time) => time <= "14:00")).toBe(true);
  });

  it("R-06-09 [Crear classe] clamps its start and end times to a Saturday's hours", async () => {
    server.use(openingHoursWithShortSaturday());
    await renderCalendar();
    await grid(/del 10 al 16 d.agost$/u);

    fireEvent.click(screen.getByRole("button", { name: "Crear classe" }));
    const drawer = await screen.findByRole("dialog", { name: "Crear classe" });
    expect(within(drawer).getByLabelText("Inici")).toHaveValue("07:00");
    expect(within(drawer).getByLabelText("Final")).toHaveValue("08:00");
    fireEvent.change(within(drawer).getByLabelText("Data"), { target: { value: "15082026" } });

    const start = within(drawer).getByLabelText("Inici");
    const end = within(drawer).getByLabelText("Final");
    expect(optionValues(start)[0]).toBe("09:00");
    expect(optionValues(start).at(-1)).toBe("13:50");
    expect(optionValues(end).at(-1)).toBe("14:00");
    expect(optionValues(end).every((time) => time >= "09:10" && time <= "14:00")).toBe(true);
    expect(start).toHaveValue("09:00");
    expect(end).toHaveValue("10:00");

    // The last start keeps the class length only up to the closing time (13:50 + 1 h → 14:00).
    fireEvent.change(start, { target: { value: "13:50" } });
    expect(start).toHaveValue("13:50");
    expect(end).toHaveValue("14:00");
    expect(optionValues(end).every((time) => time <= "14:00")).toBe(true);
  });

  it("R-06-11 a new ring after RING_HAS_BOOKINGS drops the confirmation: no cancelBookings for a ring not shown", async () => {
    await renderCalendar();
    await grid(/del 10 al 16 d.agost$/u);
    const bodies: Record<string, unknown>[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.method === "POST" && new URL(request.url).pathname.endsWith("/ring-blocks")) {
        void request
          .clone()
          .json()
          .then((body: Record<string, unknown>) => bodies.push(body));
      }
    });

    fireEvent.click(screen.getByRole("button", { name: "Bloqueja pista" }));
    const drawer = await screen.findByRole("dialog", { name: "Bloqueja pista" });
    fireEvent.change(within(drawer).getByLabelText("Pista"), {
      target: { value: "ring-muntanya" },
    });
    fireEvent.change(within(drawer).getByLabelText("Data"), { target: { value: "12082026" } });
    fireEvent.change(within(drawer).getByLabelText("De"), { target: { value: "19:00" } });
    fireEvent.change(within(drawer).getByLabelText("A"), { target: { value: "19:30" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "DESA EL BLOQUEIG" }));
    expect(await within(drawer).findByText("Clara Font + Trevi")).toBeVisible();
    expect(
      within(drawer).getByRole("button", { name: "Anul·la les reserves i desa" }),
    ).toBeVisible();

    fireEvent.change(within(drawer).getByLabelText("Pista"), { target: { value: "ring-cadells" } });
    expect(within(drawer).queryByText("Clara Font + Trevi")).not.toBeInTheDocument();
    expect(
      within(drawer).queryByRole("button", { name: "Anul·la les reserves i desa" }),
    ).not.toBeInTheDocument();

    fireEvent.click(within(drawer).getByRole("button", { name: "DESA EL BLOQUEIG" }));
    expect(await screen.findByText("Bloqueig desat")).toBeVisible();
    await waitFor(() => {
      expect(bodies.map((body) => body.ringId)).toEqual(["ring-muntanya", "ring-cadells"]);
    });
    expect(bodies.some((body) => "cancelBookings" in body)).toBe(false);
    server.events.removeAllListeners();
  });

  it("R-06-09 [Crear classe]: a new time or ring after RING_HAS_BOOKINGS drops the confirmation", async () => {
    await renderCalendar();
    await grid(/del 10 al 16 d.agost$/u);
    const bodies: Record<string, unknown>[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.method === "POST" && new URL(request.url).pathname.endsWith("/class-sessions")) {
        void request
          .clone()
          .json()
          .then((body: Record<string, unknown>) => bodies.push(body));
      }
    });

    fireEvent.click(screen.getByRole("button", { name: "Crear classe" }));
    const drawer = await screen.findByRole("dialog", { name: "Crear classe" });
    fireEvent.change(within(drawer).getByLabelText("Data"), { target: { value: "12082026" } });
    fireEvent.change(within(drawer).getByLabelText("Inici"), { target: { value: "19:00" } });
    fireEvent.click(within(drawer).getByRole("radio", { name: "Muntanya" }));
    fireEvent.click(within(drawer).getByRole("button", { name: "B" }));
    fireEvent.click(within(drawer).getByRole("button", { name: "CREA LA CLASSE" }));
    expect(await within(drawer).findByText("Clara Font + Trevi")).toBeVisible();

    // Another start: the list answered for 19:00 no longer applies.
    fireEvent.change(within(drawer).getByLabelText("Inici"), { target: { value: "19:10" } });
    expect(within(drawer).queryByText("Clara Font + Trevi")).not.toBeInTheDocument();
    fireEvent.click(within(drawer).getByRole("button", { name: "CREA LA CLASSE" }));
    expect(await within(drawer).findByText("Clara Font + Trevi")).toBeVisible();

    // Another ring: same thing, and the new ring is saved without cancelBookings.
    fireEvent.click(within(drawer).getByRole("radio", { name: "Cadells" }));
    expect(
      within(drawer).queryByRole("button", { name: "Anul·la les reserves i desa" }),
    ).not.toBeInTheDocument();
    fireEvent.click(within(drawer).getByRole("button", { name: "CREA LA CLASSE" }));
    await waitFor(() => {
      expect(bodies.map((body) => body.ringId)).toEqual([
        "ring-muntanya",
        "ring-muntanya",
        "ring-cadells",
      ]);
    });
    expect(bodies.some((body) => "cancelBookings" in body)).toBe(false);
    expect(await screen.findByText("Classe creada")).toBeVisible();
    server.events.removeAllListeners();
  });

  it("R-06-09 [Crear classe]: a RING_HAS_BOOKINGS answer that arrives after a ring change is dropped", async () => {
    let releaseFirst: () => void = () => undefined;
    const firstHeld = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let calls = 0;
    // Only the first POST waits; returning nothing falls through to the stateful mock.
    server.use(
      http.post("*/api/v1/class-sessions", async () => {
        calls += 1;
        if (calls === 1) await firstHeld;
      }),
    );
    await renderCalendar();
    await grid(/del 10 al 16 d.agost$/u);
    const bodies: Record<string, unknown>[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.method === "POST" && new URL(request.url).pathname.endsWith("/class-sessions")) {
        void request
          .clone()
          .json()
          .then((body: Record<string, unknown>) => bodies.push(body));
      }
    });

    fireEvent.click(screen.getByRole("button", { name: "Crear classe" }));
    const drawer = await screen.findByRole("dialog", { name: "Crear classe" });
    fireEvent.change(within(drawer).getByLabelText("Data"), { target: { value: "12082026" } });
    fireEvent.change(within(drawer).getByLabelText("Inici"), { target: { value: "19:00" } });
    fireEvent.click(within(drawer).getByRole("radio", { name: "Muntanya" }));
    fireEvent.click(within(drawer).getByRole("button", { name: "B" }));
    const submit = () => within(drawer).getByRole("button", { name: /^CREA LA CLASSE/u });
    fireEvent.click(submit());
    await waitFor(() => {
      expect(bodies).toHaveLength(1);
    });
    expect(submit()).toBeDisabled();

    // The Muntanya request is still pending when the admin picks Cadells; then its answer arrives.
    fireEvent.click(within(drawer).getByRole("radio", { name: "Cadells" }));
    releaseFirst();
    await waitFor(() => {
      expect(submit()).toBeEnabled();
    });
    expect(within(drawer).queryByText("Clara Font + Trevi")).not.toBeInTheDocument();
    expect(
      within(drawer).queryByRole("button", { name: "Anul·la les reserves i desa" }),
    ).not.toBeInTheDocument();
    // Dropped, not hidden: going back to Muntanya does not revive the old list either.
    fireEvent.click(within(drawer).getByRole("radio", { name: "Muntanya" }));
    expect(within(drawer).queryByText("Clara Font + Trevi")).not.toBeInTheDocument();

    fireEvent.click(within(drawer).getByRole("radio", { name: "Cadells" }));
    fireEvent.click(submit());
    expect(await screen.findByText("Classe creada")).toBeVisible();
    await waitFor(() => {
      expect(bodies.map((body) => body.ringId)).toEqual(["ring-muntanya", "ring-cadells"]);
    });
    expect(bodies.some((body) => "cancelBookings" in body)).toBe(false);
    server.events.removeAllListeners();
  });

  it("R-06-11 the block drawer locks ring, date and times until a delayed RING_HAS_BOOKINGS arrives", async () => {
    let releaseFirst: () => void = () => undefined;
    const firstHeld = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let calls = 0;
    server.use(
      http.post("*/api/v1/ring-blocks", async () => {
        calls += 1;
        if (calls === 1) await firstHeld;
      }),
    );
    await renderCalendar();
    await grid(/del 10 al 16 d.agost$/u);
    const bodies: Record<string, unknown>[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.method === "POST" && new URL(request.url).pathname.endsWith("/ring-blocks")) {
        void request
          .clone()
          .json()
          .then((body: Record<string, unknown>) => bodies.push(body));
      }
    });

    fireEvent.click(screen.getByRole("button", { name: "Bloqueja pista" }));
    const drawer = await screen.findByRole("dialog", { name: "Bloqueja pista" });
    const placement = () => [
      within(drawer).getByLabelText("Pista"),
      within(drawer).getByLabelText("Data"),
      within(drawer).getByLabelText("De"),
      within(drawer).getByLabelText("A"),
    ];
    fireEvent.change(within(drawer).getByLabelText("Pista"), {
      target: { value: "ring-muntanya" },
    });
    fireEvent.change(within(drawer).getByLabelText("Data"), { target: { value: "12082026" } });
    fireEvent.change(within(drawer).getByLabelText("De"), { target: { value: "19:00" } });
    fireEvent.change(within(drawer).getByLabelText("A"), { target: { value: "19:30" } });
    fireEvent.click(within(drawer).getByRole("button", { name: /^DESA EL BLOQUEIG/u }));
    await waitFor(() => {
      expect(bodies).toHaveLength(1);
    });
    // While the request is pending, the ring, date and times cannot change.
    for (const field of placement()) expect(field).toBeDisabled();

    releaseFirst();
    expect(await within(drawer).findByText("Clara Font + Trevi")).toBeVisible();
    for (const field of placement()) expect(field).toBeEnabled();
    expect(within(drawer).getByLabelText("Pista")).toHaveValue("ring-muntanya");
    // The confirmation resends the placement that was answered, the one still shown.
    fireEvent.click(within(drawer).getByRole("button", { name: "Anul·la les reserves i desa" }));
    expect(await screen.findByText("Bloqueig desat")).toBeVisible();
    await waitFor(() => {
      expect(bodies.map((body) => [body.ringId, body.cancelBookings])).toEqual([
        ["ring-muntanya", undefined],
        ["ring-muntanya", true],
      ]);
    });
    server.events.removeAllListeners();
  });

  it("R-06-09 keeps every editor disabled from [ACCEPTA] until the saved version is shown", async () => {
    let releasePatch: () => void = () => undefined;
    const patchHeld = new Promise<void>((resolve) => {
      releasePatch = resolve;
    });
    let holdCalendar = false;
    let releaseCalendar: () => void = () => undefined;
    const calendarHeld = new Promise<void>((resolve) => {
      releaseCalendar = resolve;
    });
    // Resolvers that return nothing fall through to the stateful mock once released.
    server.use(
      http.patch("*/api/v1/class-sessions/:id", async () => {
        await patchHeld;
      }),
      http.get("*/api/v1/weeks/:id/calendar", async () => {
        if (holdCalendar) await calendarHeld;
      }),
    );
    await renderCalendar();
    const week = await grid(/del 10 al 16 d.agost$/u);
    fireEvent.click(within(week).getByRole("button", { name: /^dc 12 18:50 · B\+C/u }));
    fireEvent.change(within(selectedCard()).getByRole("spinbutton"), { target: { value: "6" } });
    fireEvent.click(within(selectedCard()).getByRole("button", { name: "ACCEPTA" }));

    const editors = () => [
      within(selectedCard()).getByRole("spinbutton"),
      within(selectedCard()).getByLabelText("Pista"),
      within(selectedCard()).getByLabelText("Hora"),
      within(selectedCard()).getByLabelText("Descripció"),
      within(selectedCard()).getByRole("button", { name: /^Nivells/u }),
      within(selectedCard()).getByRole("button", { name: "Exempta de la revisió de les 7:30" }),
      within(selectedCard()).getByRole("button", { name: "ANUL·LA LA CLASSE" }),
      within(selectedCard()).getByRole("button", { name: "ELIMINA" }),
    ];
    // The PATCH is on its way: nothing can be edited.
    await waitFor(() => {
      for (const editor of editors()) expect(editor).toBeDisabled();
    });

    // The PATCH answers, the refetch is still on its way: still nothing can be edited.
    holdCalendar = true;
    releasePatch();
    expect(await screen.findByText("Canvis desats")).toBeVisible();
    for (const editor of editors()) expect(editor).toBeDisabled();
    expect(within(selectedCard()).getByRole("spinbutton")).toHaveValue(6);

    // The new version arrives: the card shows the saved values and is editable again.
    releaseCalendar();
    await waitFor(() => {
      expect(
        within(week).getByRole("button", { name: /^dc 12 18:50 · B\+C · 4\/6 \+2/u }),
      ).toBeVisible();
    });
    await waitFor(() => {
      expect(within(selectedCard()).getByRole("spinbutton")).toBeEnabled();
    });
    expect(within(selectedCard()).getByRole("spinbutton")).toHaveValue(6);
    expect(within(selectedCard()).getByRole("button", { name: "ACCEPTA" })).toBeDisabled();
  });

  it("shows the value the class holds: inactive ring and instructor stay selected", async () => {
    for (const item of [
      ...catalogState.rings.filter((ring) => ring.id === "ring-central"),
      ...catalogState.instructors.filter((instructor) => instructor.id === "instructor-marc"),
    ]) {
      item.active = false;
    }
    await renderCalendar();
    const week = await grid(/del 10 al 16 d.agost$/u);
    fireEvent.click(within(week).getByRole("button", { name: /^dc 12 18:50 · B\+C/u }));

    const ring = within(selectedCard()).getByLabelText("Pista");
    expect(ring).toHaveValue("ring-central");
    expect(selectedLabel(ring)).toBe("Central");
    const instructor = within(selectedCard()).getByLabelText("Instructor");
    expect(instructor).toHaveValue("instructor-marc");
    expect(selectedLabel(instructor)).toBe("Marc");
    expect(within(selectedCard()).getByRole("button", { name: "ACCEPTA" })).toBeDisabled();
  });

  it("shows a RESERVATION block as it is when FREE_TRAINING was turned off later", async () => {
    const [template] = planningState.blocks;
    if (template === undefined) throw new TypeError("Missing the fixture block");
    planningState.blocks.push({
      ...template,
      date: "2026-08-14",
      from: "2026-08-14T14:00:00Z",
      fromLocal: "16:00",
      id: "block-2026-08-14-petita",
      kind: "RESERVATION",
      reason: "THERAPY",
      ringId: "ring-petita",
      to: "2026-08-14T15:00:00Z",
      toLocal: "17:00",
    });
    await renderCalendar({ modules: branding.modules.filter((item) => item !== "FREE_TRAINING") });
    const week = await grid(/del 10 al 16 d.agost$/u);

    fireEvent.click(
      within(week).getByRole("button", { name: "Petita bloquejada · teràpia 16:00–17:00" }),
    );
    const drawer = await screen.findByRole("dialog", { name: "Bloqueig de pista" });
    const kind = within(drawer).getByLabelText("Tipus");
    expect(kind).toHaveValue("RESERVATION");
    expect(selectedLabel(kind)).toBe("Reserva de pista");
    expect(within(drawer).getByLabelText("Motiu")).toHaveValue("THERAPY");
  });

  it("R-06-15 without WAITLIST there is no «+e» in the cell nor in the card", async () => {
    await renderCalendar({ modules: branding.modules.filter((item) => item !== "WAITLIST") });
    const week = await grid(/del 10 al 16 d.agost$/u);
    const cell = within(week).getByRole("button", {
      name: /^dc 12 18:50 · B\+C · 4\/5 · Central/u,
    });
    expect(cell).not.toHaveTextContent("+2");
    fireEvent.click(cell);
    expect(selectedCard().querySelector(".calendar-selected-card__counts")).toHaveTextContent(
      /^4\/5$/u,
    );
  });

  it("R-06-15 without FREE_TRAINING [Bloqueja pista] offers only «Bloqueig»", async () => {
    await renderCalendar({ modules: branding.modules.filter((item) => item !== "FREE_TRAINING") });
    await grid(/del 10 al 16 d.agost$/u);
    fireEvent.click(screen.getByRole("button", { name: "Bloqueja pista" }));
    const drawer = await screen.findByRole("dialog", { name: "Bloqueja pista" });
    expect(optionValues(within(drawer).getByLabelText("Tipus"))).toEqual(["BLOCK"]);
  });

  it("R-06-15 with levels.enabled=false the card has no «Nivells» chip", async () => {
    mockScenario("planningNoLevels");
    await renderCalendar();
    const week = await grid(/del 10 al 16 d.agost$/u);
    fireEvent.click(within(week).getByRole("button", { name: /^dc 12 18:50 · B\+C/u }));
    expect(within(selectedCard()).getByRole("button", { name: "ACCEPTA" })).toBeInTheDocument();
    await waitFor(() => {
      expect(within(selectedCard()).queryByText("Nivells")).not.toBeInTheDocument();
    });
  });

  it("R-06-15 INSTRUCTOR (no /parameters) sees «Nivells» only on a class with levels", async () => {
    mockScenario("instructor");
    planningState.sessions = planningState.sessions.map((session) =>
      session.id === WEDNESDAY_1850 ? { ...session, levelIds: [] } : session,
    );
    await renderCalendar({ readOnly: true });
    const week = await grid(/del 10 al 16 d.agost$/u);

    fireEvent.click(within(week).getByRole("button", { name: /^dc 12 18:50 · B\+C/u }));
    expect(within(selectedCard()).queryByText("Nivells")).not.toBeInTheDocument();
    fireEvent.click(within(week).getByRole("button", { name: /^dt 11 18:50 · A\+B/u }));
    expect(selectedCard()).toHaveTextContent(/Nivells\s+A, B/u);
  });

  it("R-06-11 lists the RING_BLOCK_CONFLICT conflicts inside the block drawer", async () => {
    await renderCalendar();
    await grid(/del 10 al 16 d.agost$/u);

    fireEvent.click(screen.getByRole("button", { name: "Bloqueja pista" }));
    const drawer = await screen.findByRole("dialog", { name: "Bloqueja pista" });
    fireEvent.change(within(drawer).getByLabelText("Pista"), { target: { value: "ring-cadells" } });
    fireEvent.change(within(drawer).getByLabelText("Data"), { target: { value: "13082026" } });
    expect(within(drawer).getByLabelText("Data")).toHaveValue("13/08/2026");
    fireEvent.change(within(drawer).getByLabelText("De"), { target: { value: "18:00" } });
    fireEvent.change(within(drawer).getByLabelText("A"), { target: { value: "19:00" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "DESA EL BLOQUEIG" }));

    const conflicts = await within(drawer).findByRole("list", { name: "Coincideix amb:" });
    expect(
      within(conflicts)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["dj 18:50 · Cadells · 18:50–19:50"]);
    expect(within(drawer).getByRole("alert")).toHaveTextContent(
      "Aquest bloqueig de pista coincideix amb un altre element.",
    );

    fireEvent.change(within(drawer).getByLabelText("De"), { target: { value: "16:00" } });
    fireEvent.change(within(drawer).getByLabelText("A"), { target: { value: "17:00" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "DESA EL BLOQUEIG" }));
    expect(await screen.findByText("Bloqueig desat")).toBeVisible();
    expect(
      await screen.findByRole("button", {
        name: /^Cadells bloquejada · manteniment 16:00–17:00$/u,
      }),
    ).toBeVisible();
  });

  it("INSTRUCTOR reads the calendar without actions and with inert chips (A22 c)", async () => {
    mockScenario("instructor");
    await renderCalendar({ readOnly: true });
    const week = await grid(/del 10 al 16 d.agost$/u);

    expect(screen.queryByRole("button", { name: "Crear classe" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bloqueja pista" })).not.toBeInTheDocument();
    expect(
      within(week).queryByRole("button", { name: /Carretera bloquejada/u }),
    ).not.toBeInTheDocument();
    expect(within(week).getByRole("group", { name: /Carretera bloquejada/u })).toBeVisible();

    fireEvent.click(within(week).getByRole("button", { name: /^dc 12 18:50 · B\+C/u }));
    const card = selectedCard();
    expect(within(card).queryByRole("button", { name: "ACCEPTA" })).not.toBeInTheDocument();
    expect(
      within(card).queryByRole("button", { name: "ANUL·LA LA CLASSE" }),
    ).not.toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "ELIMINA" })).not.toBeInTheDocument();
    expect(within(card).queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(card).queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(card).toHaveTextContent(/Pista\s+Central/u);

    fireEvent.click(screen.getByRole("button", { name: "Esborrany" }));
    await grid(/del 17 al 23 d.agost$/u);
    expect(screen.queryByRole("button", { name: "VALIDAR LA SETMANA" })).not.toBeInTheDocument();
  });

  it("shows the week warnings and selects the class of a warning; day headers open the day view", async () => {
    const { onNavigate } = await renderCalendar();
    await grid(/del 10 al 16 d.agost$/u);

    const warnings = screen.getByRole("region", { name: "Avisos d'incoherència de la setmana" });
    fireEvent.click(
      within(warnings).getByRole("button", {
        name: "dj 18:50 — Marc assignat a dues pistes alhora (Cadells i Petita)",
      }),
    );
    expect(selectedCard()).toHaveTextContent("Classe seleccionada — dj 13 · 18:50 · Cadells");
    expect(
      screen.getByText(
        (_, element) =>
          element?.classList.contains("calendar-footer") === true &&
          element.textContent ===
            "n/n +e = inscrits/places + llista d'espera ·  = pista bloquejada · Clica el nom d'un dia per veure'l per pista o per instructor",
      ),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "dc 12" }));
    expect(onNavigate).toHaveBeenCalledWith("/calendari/dia/2026-08-12?estat=actives");
  });
});

describe("E4-W09 D4 follow-ups of the E4-W02 round-4 review", () => {
  it("S06 §3 R-06-09 an opening at 07:05 with 10-minute slots: «Hora» and [Crear classe] offer 07:10 first, and the class is sent on slot boundaries", async () => {
    await putOpeningHours("07:05", "21:55");
    await renderCalendar();
    const week = await grid(/del 10 al 16 d.agost$/u);
    const bodies = captureBodies("POST", "/class-sessions");

    // The card of a 60-minute class: starts on slot boundaries that end by 21:55.
    fireEvent.click(within(week).getByRole("button", { name: /^dc 12 18:50 · B\+C/u }));
    const hour = within(selectedCard()).getByLabelText("Hora");
    expect(optionValues(hour)[0]).toBe("07:10");
    expect(optionValues(hour).at(-1)).toBe("20:50");
    expect(optionValues(hour).every((time) => minutesOfDay(time) % 10 === 0)).toBe(true);
    expect(hour).toHaveValue("18:50");
    // [ACCEPTA] sends the aligned start and the end that keeps the 60 minutes (E4-W10 step 5).
    const patches = captureBodies("PATCH", `/class-sessions/${WEDNESDAY_1850}`);
    fireEvent.change(hour, { target: { value: "07:10" } });
    fireEvent.click(within(selectedCard()).getByRole("button", { name: "ACCEPTA" }));
    expect(await screen.findByText("Canvis desats")).toBeVisible();
    await waitFor(() => {
      expect(patches).toEqual([{ endTime: "08:10", startTime: "07:10", version: 1 }]);
    });

    fireEvent.click(screen.getByRole("button", { name: "Crear classe" }));
    const drawer = await screen.findByRole("dialog", { name: "Crear classe" });
    fireEvent.change(within(drawer).getByLabelText("Data"), { target: { value: "13082026" } });
    const start = within(drawer).getByLabelText("Inici");
    const end = within(drawer).getByLabelText("Final");
    expect(optionValues(start)[0]).toBe("07:10");
    expect(optionValues(start).at(-1)).toBe("21:40");
    expect(optionValues(end)[0]).toBe("07:20");
    expect(optionValues(end).at(-1)).toBe("21:50");
    expect(
      [...optionValues(start), ...optionValues(end)].every((time) => minutesOfDay(time) % 10 === 0),
    ).toBe(true);
    expect(start).toHaveValue("07:10");
    expect(end).toHaveValue("08:10");

    fireEvent.click(within(drawer).getByRole("button", { name: "B" }));
    fireEvent.click(within(drawer).getByRole("button", { name: "CREA LA CLASSE" }));
    expect(await screen.findByText("Classe creada")).toBeVisible();
    await waitFor(() => {
      expect(bodies).toHaveLength(1);
    });
    expect(bodies[0]).toMatchObject({ date: "2026-08-13", endTime: "08:10", startTime: "07:10" });
  });

  it("R-06-11 T-06-32 an opening at 07:05: [Bloqueja pista] offers 07:10–07:40 first and saves on slot boundaries", async () => {
    await putOpeningHours("07:05", "21:55");
    await renderCalendar();
    await grid(/del 10 al 16 d.agost$/u);
    const bodies = captureBodies("POST", "/ring-blocks");

    fireEvent.click(screen.getByRole("button", { name: "Bloqueja pista" }));
    const drawer = await screen.findByRole("dialog", { name: "Bloqueja pista" });
    const from = within(drawer).getByLabelText("De");
    const to = within(drawer).getByLabelText("A");
    // No date yet: today's options (Wednesday 12).
    expect(from).toHaveValue("07:10");
    expect(to).toHaveValue("07:40");
    fireEvent.change(within(drawer).getByLabelText("Data"), { target: { value: "13082026" } });
    expect(optionValues(from)[0]).toBe("07:10");
    expect(optionValues(from).at(-1)).toBe("21:20");
    expect(optionValues(to)[0]).toBe("07:40");
    expect(optionValues(to).at(-1)).toBe("21:50");
    expect(
      [...optionValues(from), ...optionValues(to)].every((time) => minutesOfDay(time) % 10 === 0),
    ).toBe(true);
    expect(from).toHaveValue("07:10");
    expect(to).toHaveValue("07:40");

    fireEvent.click(within(drawer).getByRole("button", { name: "DESA EL BLOQUEIG" }));
    expect(await screen.findByText("Bloqueig desat")).toBeVisible();
    await waitFor(() => {
      expect(bodies).toHaveLength(1);
    });
    // 07:10 and 07:40 club-local (CEST, UTC+2).
    expect(bodies[0]).toMatchObject({ from: "2026-08-13T05:10:00Z", to: "2026-08-13T05:40:00Z" });
  });

  it("R-06-09 after STALE_VERSION every editor stays locked until the refetched version is shown, so no edit is lost", async () => {
    const calendar = heldCalendar();
    const { client } = await renderCalendar();
    const week = await grid(/del 10 al 16 d.agost$/u);
    fireEvent.click(within(week).getByRole("button", { name: /^dc 12 18:50 · B\+C/u }));
    // Another admin raises the limit to 7 meanwhile: the class is now at version 2.
    await concurrentPatch(client, { capacity: 7, version: 1 });
    const bodies = captureBodies("PATCH", `/class-sessions/${WEDNESDAY_1850}`);

    fireEvent.change(within(selectedCard()).getByRole("spinbutton"), { target: { value: "6" } });
    calendar.hold = true;
    fireEvent.click(within(selectedCard()).getByRole("button", { name: "ACCEPTA" }));

    // The 409 has answered and the refetch that brings version 2 is still on its way: an edit
    // typed now would be dropped by the remount, so nothing can be edited.
    expect(await screen.findByText(STALE_MESSAGE)).toBeVisible();
    for (const editor of cardEditors()) expect(editor).toBeDisabled();
    expect(within(selectedCard()).getByRole("spinbutton")).toHaveValue(6);

    calendar.release();
    await waitFor(() => {
      expect(
        within(week).getByRole("button", { name: /^dc 12 18:50 · B\+C · 4\/7 \+2/u }),
      ).toBeVisible();
    });
    await waitFor(() => {
      expect(within(selectedCard()).getByRole("spinbutton")).toBeEnabled();
    });
    // The card shows version 2, and the edit made on it is saved with it.
    expect(within(selectedCard()).getByRole("spinbutton")).toHaveValue(7);
    expect(screen.getByText(STALE_MESSAGE)).toBeVisible();
    fireEvent.change(within(selectedCard()).getByRole("spinbutton"), { target: { value: "6" } });
    fireEvent.click(within(selectedCard()).getByRole("button", { name: "ACCEPTA" }));
    expect(await screen.findByText("Canvis desats")).toBeVisible();
    await waitFor(() => {
      expect(
        within(week).getByRole("button", { name: /^dc 12 18:50 · B\+C · 4\/6 \+2/u }),
      ).toBeVisible();
    });
    expect(bodies).toEqual([
      { capacity: 6, version: 1 },
      { capacity: 6, version: 2 },
    ]);
  });

  it("R-06-09 after INVALID_STATE on «Exempta…» every editor stays locked until the refetched class is shown", async () => {
    const calendar = heldCalendar();
    const { client } = await renderCalendar();
    const week = await grid(/del 10 al 16 d.agost$/u);
    fireEvent.click(within(week).getByRole("button", { name: /^dc 12 18:50 · B\+C/u }));
    // Another admin cancels the class meanwhile (new state, new version).
    await client.POST("/class-sessions/{id}/cancellation", {
      body: { adminText: "Plou massa.", reason: "CLUB_MANUAL" },
      params: { header: { "Idempotency-Key": "concurrent-cancel" }, path: { id: WEDNESDAY_1850 } },
    });
    calendar.hold = true;
    fireEvent.click(
      within(selectedCard()).getByRole("button", { name: "Exempta de la revisió de les 7:30" }),
    );

    expect(await screen.findByText(INVALID_STATE_MESSAGE)).toBeVisible();
    for (const editor of cardEditors()) expect(editor).toBeDisabled();

    calendar.release();
    await waitFor(() => {
      expect(selectedCard()).toHaveTextContent(/^Classe seleccionada — dc 12 .*anul·lada0\/5/u);
    });
    // The cancelled class keeps only «Notes», editable again.
    expect(within(selectedCard()).getByLabelText("Notes")).toBeEnabled();
    expect(within(selectedCard()).queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.getByText(INVALID_STATE_MESSAGE)).toBeVisible();
  });

  it("R-06-09 a conflict refetch that fails unlocks the card with the admin's edit kept", async () => {
    let failCalendar = false;
    server.use(
      http.get("*/api/v1/weeks/:id/calendar", () =>
        failCalendar
          ? HttpResponse.json(
              { code: "INTERNAL_ERROR", message: "Internal error", traceId: "trace-e4-w09" },
              { status: 500 },
            )
          : undefined,
      ),
    );
    const { client } = await renderCalendar();
    const week = await grid(/del 10 al 16 d.agost$/u);
    fireEvent.click(within(week).getByRole("button", { name: /^dc 12 18:50 · B\+C/u }));
    await concurrentPatch(client, { capacity: 7, version: 1 });
    fireEvent.change(within(selectedCard()).getByRole("spinbutton"), { target: { value: "6" } });
    failCalendar = true;
    fireEvent.click(within(selectedCard()).getByRole("button", { name: "ACCEPTA" }));

    expect(await screen.findByText(STALE_MESSAGE)).toBeVisible();
    // The refetch fails: the card is still the one shown, so it is not left locked for good.
    expect(await screen.findByRole("button", { name: "Torna-ho a provar" })).toBeVisible();
    await waitFor(() => {
      expect(within(selectedCard()).getByRole("spinbutton")).toBeEnabled();
    });
    expect(within(selectedCard()).getByRole("spinbutton")).toHaveValue(6);
    expect(within(selectedCard()).getByRole("button", { name: "ACCEPTA" })).toBeEnabled();
  });

  it("R-02-09 Sunday absent from club.openingHours is closed: the card and [Crear classe] offer no times there, say so and do not submit", async () => {
    const api = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
    // A class on Sunday 16, created while the club still opened on Sundays.
    await api.POST("/class-sessions", {
      body: {
        date: "2026-08-16",
        endTime: "11:00",
        instructorIds: ["instructor-marc"],
        levelIds: ["level-b"],
        ringId: "ring-central",
        startTime: "10:00",
      },
    });
    await putOpeningHours(
      "07:00",
      "22:00",
      weekdays.filter((day) => day !== "SUNDAY"),
    );
    await renderCalendar();
    const week = await grid(/del 10 al 16 d.agost$/u);
    const bodies = captureBodies("POST", "/class-sessions");

    // The Sunday class keeps its own time and offers no other.
    fireEvent.click(within(week).getByRole("button", { name: /^dg 16 10:00/u }));
    expect(optionValues(within(selectedCard()).getByLabelText("Hora"))).toEqual(["10:00"]);
    expect(within(selectedCard()).getByText(CLOSED_DAY)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Crear classe" }));
    const drawer = await screen.findByRole("dialog", { name: "Crear classe" });
    const date = within(drawer).getByLabelText("Data");
    const start = within(drawer).getByLabelText("Inici");
    const end = within(drawer).getByLabelText("Final");
    const submit = within(drawer).getByRole("button", { name: "CREA LA CLASSE" });
    fireEvent.click(within(drawer).getByRole("button", { name: "B" }));
    fireEvent.change(date, { target: { value: "16082026" } });
    expect(within(drawer).getByRole("alert")).toHaveTextContent(CLOSED_DAY);
    expect(date).toHaveAttribute("aria-invalid", "true");
    expect(optionValues(start)).toEqual([]);
    expect(optionValues(end)).toEqual([]);
    expect(start).toBeDisabled();
    expect(end).toBeDisabled();
    expect(submit).toBeDisabled();
    fireEvent.submit(formOf(submit));
    await settle();
    expect(bodies).toEqual([]);

    // Monday is open again: times from the opening and the form can be sent.
    fireEvent.change(date, { target: { value: "17082026" } });
    expect(within(drawer).queryByText(CLOSED_DAY)).not.toBeInTheDocument();
    expect(optionValues(start)[0]).toBe("07:00");
    expect(start).toBeEnabled();
    expect(submit).toBeEnabled();
  });

  it("R-02-09 R-06-11 Sunday absent from club.openingHours: [Bloqueja pista] offers no times there, says so and does not submit", async () => {
    await putOpeningHours(
      "07:00",
      "22:00",
      weekdays.filter((day) => day !== "SUNDAY"),
    );
    await renderCalendar();
    await grid(/del 10 al 16 d.agost$/u);
    const bodies = captureBodies("POST", "/ring-blocks");

    fireEvent.click(screen.getByRole("button", { name: "Bloqueja pista" }));
    const drawer = await screen.findByRole("dialog", { name: "Bloqueja pista" });
    const date = within(drawer).getByLabelText("Data");
    const submit = within(drawer).getByRole("button", { name: "DESA EL BLOQUEIG" });
    fireEvent.change(date, { target: { value: "16082026" } });
    expect(within(drawer).getByRole("alert")).toHaveTextContent(CLOSED_DAY);
    expect(date).toHaveAttribute("aria-invalid", "true");
    expect(optionValues(within(drawer).getByLabelText("De"))).toEqual([]);
    expect(optionValues(within(drawer).getByLabelText("A"))).toEqual([]);
    expect(submit).toBeDisabled();
    fireEvent.submit(formOf(submit));
    await settle();
    expect(bodies).toEqual([]);

    fireEvent.change(date, { target: { value: "17082026" } });
    expect(within(drawer).queryByText(CLOSED_DAY)).not.toBeInTheDocument();
    expect(optionValues(within(drawer).getByLabelText("De"))[0]).toBe("07:00");
    expect(submit).toBeEnabled();
  });
});

describe("E4-W10 D4 follow-ups of the E4-W09 review", () => {
  it("S06 §3 R-02-09 R-06-09 on a closed Sunday the card allows only notes: a capacity change keeps [ACCEPTA] disabled, a notes change saves", async () => {
    const sunday = await createSundayClass();
    await putOpeningHours(
      "07:00",
      "22:00",
      weekdays.filter((day) => day !== "SUNDAY"),
    );
    await renderCalendar();
    const week = await grid(/del 10 al 16 d.agost$/u);
    const bodies = captureBodies("PATCH", `/class-sessions/${sunday.id}`);

    fireEvent.click(within(week).getByRole("button", { name: /^dg 16 10:00/u }));
    const card = selectedCard();
    expect(within(card).getByText(CLOSED_DAY)).toBeVisible();
    const accept = within(card).getByRole("button", { name: "ACCEPTA" });
    const capacity = within(card).getByRole("spinbutton");
    const notes = within(card).getByLabelText("Notes");
    fireEvent.change(capacity, { target: { value: "6" } });
    // The api re-validates the whole class on any patch but notes (OUTSIDE_OPENING_HOURS).
    expect(accept).toBeDisabled();
    fireEvent.change(notes, { target: { value: "Porteu aigua" } });
    expect(accept).toBeDisabled();
    fireEvent.click(accept);
    await settle();
    expect(bodies).toEqual([]);

    // Back to the class's own limit: only the notes change, and they are saved.
    fireEvent.change(capacity, { target: { value: "" } });
    expect(accept).toBeEnabled();
    fireEvent.click(accept);
    expect(await screen.findByText("Canvis desats")).toBeVisible();
    await waitFor(() => {
      expect(bodies).toEqual([{ notes: "Porteu aigua", version: sunday.version }]);
    });
    await waitFor(() => {
      expect(within(selectedCard()).getByLabelText("Notes")).toHaveValue("Porteu aigua");
    });
  });

  it("R-02-09 R-06-09 on a closed day [Crear classe] does not say «Els alumnes la veuran de seguida»", async () => {
    await putOpeningHours(
      "07:00",
      "22:00",
      weekdays.filter((day) => day !== "SUNDAY"),
    );
    await renderCalendar();
    await grid(/del 10 al 16 d.agost$/u);
    fireEvent.click(screen.getByRole("button", { name: "Crear classe" }));
    const drawer = await screen.findByRole("dialog", { name: "Crear classe" });
    const date = within(drawer).getByLabelText("Data");

    // Saturday 15, in the validated week: the class would be born active, and the drawer says so.
    fireEvent.change(date, { target: { value: "15082026" } });
    expect(await within(drawer).findByText(VISIBLE_NOW)).toBeVisible();
    // Sunday 16, same week, closed: only the closed-day message.
    fireEvent.change(date, { target: { value: "16082026" } });
    expect(within(drawer).getByRole("alert")).toHaveTextContent(CLOSED_DAY);
    await settle();
    expect(within(drawer).queryByText(VISIBLE_NOW)).not.toBeInTheDocument();
  });

  it("S06 §3 a failed GET /club/opening-hours shows its error with [Torna-ho a provar] and offers no times until it loads", async () => {
    let failOpeningHours = true;
    server.use(
      http.get("*/api/v1/club/opening-hours", () =>
        failOpeningHours
          ? HttpResponse.json(
              { code: "INTERNAL_ERROR", message: "Internal error", traceId: "trace-e4-w10" },
              { status: 500 },
            )
          : undefined,
      ),
    );
    await renderCalendar();
    const week = await grid(/del 10 al 16 d.agost$/u);
    const retry = await screen.findByRole("button", { name: "Torna-ho a provar" });
    expect(
      screen.getByText(
        "S'ha produït un error inesperat. Torneu-ho a provar; si persisteix, indiqueu el codi de referència al club.",
      ),
    ).toBeVisible();
    // No default hours are assumed: nothing that picks a time can open.
    expect(screen.getByRole("button", { name: "Crear classe" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bloqueja pista" })).toBeDisabled();
    fireEvent.click(within(week).getByRole("button", { name: /^dc 12 18:50 · B\+C/u }));
    expect(optionValues(within(selectedCard()).getByLabelText("Hora"))).toEqual(["18:50"]);

    failOpeningHours = false;
    fireEvent.click(retry);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Crear classe" })).toBeEnabled();
    });
    expect(screen.getByRole("button", { name: "Bloqueja pista" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Torna-ho a provar" })).not.toBeInTheDocument();
    expect(optionValues(within(selectedCard()).getByLabelText("Hora"))[0]).toBe("07:00");
  });
});
