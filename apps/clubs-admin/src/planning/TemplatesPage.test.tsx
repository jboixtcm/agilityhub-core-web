import { createApiClient } from "@agilityhub/api-client";
import {
  mockScenario,
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

import { TEMPLATE_STORAGE_KEY } from "./shared";
import { TemplatesPage } from "./TemplatesPage";

const branding: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/plantilles");
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.events.removeAllListeners();
  resetPlanningState();
  resetCatalogState();
  resetSettingsState();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

async function renderTemplates({ readOnly = false, onNavigate = vi.fn() } = {}) {
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-scheduling", "enums", "errors"],
    storage: undefined,
  });
  const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <TemplatesPage client={client} onNavigate={onNavigate} readOnly={readOnly} />
      </BrandingProvider>
    </I18nextProvider>,
  );
  await screen.findByRole("table", { name: "Quadre setmanal de la plantilla «Setmana A»" });
  return { onNavigate };
}

function classCard() {
  return screen.getByRole("region", { name: /Crear classe|Classe seleccionada/u });
}

describe("T-06-26 D3 weekly templates", () => {
  it("prefills band and day from an empty cell, fills the description by levels, keeps the manual text and asks for another class in the band", async () => {
    await renderTemplates();

    fireEvent.click(screen.getByRole("button", { name: "Crear classe: divendres 18:50" }));
    const card = classCard();
    expect(within(card).getByLabelText("Franja")).toHaveValue("tpl-a-b1850");
    expect(within(card).getByRole("radio", { name: "divendres" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(within(card).getByRole("radio", { name: "Sense pista" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    fireEvent.click(within(card).getByRole("button", { name: "B" }));
    fireEvent.click(within(card).getByRole("button", { name: "C" }));
    const description = within(card).getByLabelText("Descripció");
    expect(description).toHaveAttribute("placeholder", "B+C");
    fireEvent.click(within(card).getByRole("button", { name: "D" }));
    expect(description).toHaveAttribute("placeholder", "B+C+D");

    fireEvent.change(description, { target: { value: "Obed. urbana" } });
    fireEvent.click(within(card).getByRole("button", { name: "D" }));
    expect(description).toHaveValue("Obed. urbana");
    expect(description).toHaveAttribute("placeholder", "B+C");

    fireEvent.click(within(card).getByRole("radio", { name: "Petita" }));
    fireEvent.click(within(card).getByRole("button", { name: "CREA LA CLASSE" }));

    const question = await screen.findByRole("dialog", {
      name: "Vols afegir-ne una altra a la mateixa franja?",
    });
    expect(
      await screen.findByRole("button", { name: "Obed. urbana · Laura · Petita" }),
    ).toBeInTheDocument();
    fireEvent.click(within(question).getByRole("button", { name: "Sí" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    const nextCard = classCard();
    expect(within(nextCard).getByLabelText("Franja")).toHaveValue("tpl-a-b1850");
    expect(within(nextCard).getByRole("radio", { name: "divendres" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(within(nextCard).getByLabelText("Descripció")).toHaveValue("");
  });

  it("saves every change of a full cell at once with the template version", async () => {
    await renderTemplates();

    const [mondayClass] = screen.getAllByRole("button", { name: "C+D+E · Laura · Carretera" });
    expect(mondayClass).toBeDefined();
    if (mondayClass === undefined) return;
    fireEvent.click(mondayClass);
    const card = screen.getByRole("region", { name: "Classe seleccionada" });
    expect(within(card).getByRole("radio", { name: "Carretera" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(within(card).getByRole("button", { name: "E" }));

    expect(await screen.findByRole("button", { name: "C+D · Laura · Carretera" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(
      within(screen.getByRole("region", { name: "Classe seleccionada" })).getByRole("button", {
        name: "F",
      }),
    );
    expect(
      await screen.findByRole("button", { name: "C+D+F · Laura · Carretera" }),
    ).toBeInTheDocument();
  });

  it("queues two quick changes of a full cell and sends each PATCH with the latest version", async () => {
    const bodies: { levelIds?: string[]; version: number }[] = [];
    server.use(
      http.patch("*/api/v1/week-templates/:id/classes/:classId", async ({ request }) => {
        bodies.push((await request.clone().json()) as { levelIds?: string[]; version: number });
      }),
    );
    await renderTemplates();

    const [mondayClass] = screen.getAllByRole("button", { name: "C+D+E · Laura · Carretera" });
    if (mondayClass === undefined) throw new TypeError("missing Monday class");
    fireEvent.click(mondayClass);
    const card = screen.getByRole("region", { name: "Classe seleccionada" });
    // Two clicks in a row, without waiting for the first response.
    fireEvent.click(within(card).getByRole("button", { name: "E" }));
    fireEvent.click(within(card).getByRole("button", { name: "F" }));

    expect(
      await screen.findByRole("button", { name: "C+D+F · Laura · Carretera" }),
    ).toBeInTheDocument();
    expect(bodies).toHaveLength(2);
    const [first, second] = bodies;
    expect(second?.version).toBe((first?.version ?? Number.NaN) + 1);
    expect(second?.levelIds).toEqual(["level-c", "level-d", "level-f"]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(within(classCard()).getByRole("button", { name: "F" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("reloads the template and remounts the card on STALE_VERSION", async () => {
    let templateReads = 0;
    server.use(
      http.get("*/api/v1/week-templates/:id", () => {
        templateReads += 1;
      }),
      http.patch(
        "*/api/v1/week-templates/:id/classes/:classId",
        () =>
          HttpResponse.json(
            { code: "STALE_VERSION", message: "Stale template version", traceId: "trace-stale" },
            { status: 409 },
          ),
        { once: true },
      ),
    );
    await renderTemplates();
    const readsBefore = templateReads;

    const [mondayClass] = screen.getAllByRole("button", { name: "C+D+E · Laura · Carretera" });
    if (mondayClass === undefined) throw new TypeError("missing Monday class");
    fireEvent.click(mondayClass);
    fireEvent.click(
      within(screen.getByRole("region", { name: "Classe seleccionada" })).getByRole("button", {
        name: "E",
      }),
    );

    expect(
      await screen.findByText(
        "Aquest element s'ha modificat des d'un altre lloc. Actualitzeu-lo i torneu-ho a provar.",
      ),
    ).toBeVisible();
    await waitFor(() => {
      expect(templateReads).toBeGreaterThan(readsBefore);
    });
    const card = screen.getByRole("region", { name: "Classe seleccionada" });
    await waitFor(() => {
      expect(within(card).getByRole("button", { name: "E" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
    // The remounted card works on the fresh version.
    fireEvent.click(within(classCard()).getByRole("button", { name: "E" }));
    expect(
      await screen.findByRole("button", { name: "C+D · Laura · Carretera" }),
    ).toBeInTheDocument();
  });

  it("puts the form back to the saved class when a PATCH fails", async () => {
    server.use(
      http.patch(
        "*/api/v1/week-templates/:id/classes/:classId",
        () =>
          HttpResponse.json(
            { code: "LEVEL_REQUIRED", message: "At least one level", traceId: "trace-level" },
            { status: 422 },
          ),
        { once: true },
      ),
    );
    await renderTemplates();

    const [mondayClass] = screen.getAllByRole("button", { name: "C+D+E · Laura · Carretera" });
    if (mondayClass === undefined) throw new TypeError("missing Monday class");
    fireEvent.click(mondayClass);
    const card = screen.getByRole("region", { name: "Classe seleccionada" });
    fireEvent.click(within(card).getByRole("button", { name: "E" }));

    expect(await within(card).findByText("Seleccioneu un nivell.")).toBeVisible();
    expect(within(card).getByRole("button", { name: "E" })).toHaveAttribute("aria-pressed", "true");
    expect(within(card).getByLabelText("Descripció")).toHaveAttribute("placeholder", "C+D+E");
    expect(
      screen.getByRole("button", { name: "C+D+E · Laura · Carretera", pressed: true }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "C+D · Laura · Carretera" }),
    ).not.toBeInTheDocument();
  });

  it("shows a failed load of the weeks and the coverage with [Torna-ho a provar] instead of a loading table", async () => {
    const failure = () =>
      HttpResponse.json(
        { code: "INTERNAL_ERROR", message: "Unexpected error", traceId: "trace-load" },
        { status: 500 },
      );
    server.use(
      http.get("*/api/v1/weeks", failure, { once: true }),
      http.get("*/api/v1/coverage", failure, { once: true }),
    );
    await renderTemplates();

    const retry = await screen.findByRole("button", { name: "Torna-ho a provar" });
    const weeks = screen.getByRole("table", { name: "Setmanes" });
    expect(within(weeks).queryByText("Carregant…")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("table", { name: "Cobertura per nivell (places de la setmana)" }),
    ).not.toBeInTheDocument();

    fireEvent.click(retry);
    expect(
      (await within(weeks).findAllByText(/^\d{2}\/\d{2} · \d{2}:\d{2}$/u)).length,
    ).toBeGreaterThan(0);
    expect(
      await screen.findByRole("table", { name: "Cobertura per nivell (places de la setmana)" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Torna-ho a provar" })).not.toBeInTheDocument();
  });

  it("shows each band error on the field that caused it", async () => {
    await renderTemplates();

    fireEvent.click(screen.getByRole("button", { name: "Franja" }));
    const drawer = await screen.findByRole("dialog", { name: "Nova franja" });
    const start = within(drawer).getByLabelText("Inici");
    const end = within(drawer).getByLabelText("Final");
    const fieldOf = (input: HTMLElement) => input.closest(".ah-form-field");

    fireEvent.change(start, { target: { value: "21:10" } });
    fireEvent.change(end, { target: { value: "21:35" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Desa" }));
    expect(
      await within(drawer).findByText("L'interval de les franges horàries no és vàlid."),
    ).toBeVisible();
    expect(fieldOf(end)).toHaveClass("ah-form-field--error");
    expect(fieldOf(start)).not.toHaveClass("ah-form-field--error");

    fireEvent.change(start, { target: { value: "19:30" } });
    fireEvent.change(end, { target: { value: "21:40" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Desa" }));
    expect(
      await within(drawer).findByText("Aquesta franja se superposa amb una altra."),
    ).toBeVisible();
    expect(fieldOf(start)).toHaveClass("ah-form-field--error");
    expect(fieldOf(end)).not.toHaveClass("ah-form-field--error");

    fireEvent.change(start, { target: { value: "21:10" } });
    fireEvent.change(end, { target: { value: "23:00" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Desa" }));
    expect(
      await within(drawer).findByText("L'hora seleccionada és fora de l'horari d'obertura."),
    ).toBeVisible();
    expect(fieldOf(end)).toHaveClass("ah-form-field--error");
    expect(fieldOf(start)).not.toHaveClass("ah-form-field--error");
  });

  it("marks the inconsistency on the cells and in the footer note and blocks the generation", async () => {
    await renderTemplates();

    fireEvent.click(screen.getByRole("button", { name: "dl–dv: «Setmana A»" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Setmana B" }));

    await screen.findByRole("table", { name: "Quadre setmanal de la plantilla «Setmana B»" });
    expect(
      screen.getByText(
        "Incoherència: dimecres 20:00 — pista Central amb dues classes alhora. Mentre hi hagi incoherències no es poden generar classes d'aquesta plantilla.",
      ),
    ).toBeVisible();
    const flagged = screen.getAllByRole("button", {
      name: /Central · Pista amb dues classes alhora$/u,
    });
    expect(flagged).toHaveLength(2);
    flagged.forEach((cell) => {
      expect(cell).toHaveClass("ah-schedule-cell--warning");
    });
    expect(await screen.findByText("bloquejat: 1 incoherència a la plantilla")).toBeVisible();
    expect(screen.getByRole("button", { name: "GENERAR CLASSES" })).toBeDisabled();
    expect(
      screen.getByText(/Clica el nom d'un dia per veure'l per pista o per instructor/u),
    ).toBeVisible();
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem(TEMPLATE_STORAGE_KEY) ?? "{}")).toMatchObject({
        SATURDAY: "template-dissabtes",
        WEEKDAYS: "template-setmana-b",
      });
    });
    expect(window.location.search).toBe("?template=template-setmana-b");
  });

  it("confirms «Es generaran com a esborrany les classes de la setmana del …» and generates the proposed week", async () => {
    await renderTemplates();

    const generate = await screen.findByRole("button", { name: "GENERAR CLASSES" });
    await waitFor(() => {
      expect(generate).toBeEnabled();
    });
    expect(screen.getByRole("combobox", { name: "Setmana" })).toHaveDisplayValue(
      /^Setmana del \d+ (al|de)/u,
    );
    fireEvent.click(generate);

    const dialog = await screen.findByRole("dialog", { name: "Generar classes — per setmanes" });
    expect(
      within(dialog).getByText(
        /^Es generaran com a esborrany les classes de la setmana del \d{2}\/\d{2}\/\d{4}$/u,
      ),
    ).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "GENERAR CLASSES" }));

    expect(await screen.findByText("46 classes generades")).toBeVisible();
    const weeks = screen.getByRole("table", { name: "Setmanes" });
    await waitFor(() => {
      expect(within(weeks).queryByText("pendent")).not.toBeInTheDocument();
    });
  });

  it("hides every action from INSTRUCTOR and keeps the cells inert (A22 c)", async () => {
    const { onNavigate } = await renderTemplates({ readOnly: true });

    for (const name of ["Nova", "Duplica", "Franja", "Crear classe", "GENERAR CLASSES"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("region", { name: "Crear classe" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Crear classe:/u })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "A · Laura · Petita" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("group", { name: "A · Laura · Petita" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Franja 08:30–09:30" })).not.toBeInTheDocument();
    expect(
      await screen.findByRole("table", { name: "Cobertura per nivell (places de la setmana)" }),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "dilluns" }));
    expect(onNavigate).toHaveBeenCalledWith("/plantilles/template-setmana-a/dia/monday");
  });

  it("shows the coverage table with the D3 vocabulary and one-decimal places", async () => {
    await renderTemplates();

    const coverage = await screen.findByRole("table", {
      name: "Cobertura per nivell (places de la setmana)",
    });
    expect(
      within(coverage).getByRole("row", { name: /^A 100 70,5 233% 227% ajustat$/u }),
    ).toBeInTheDocument();
    expect(
      within(coverage).getByRole("row", { name: /^F 28 14 175% 140% cal ampliar$/u }),
    ).toBeInTheDocument();
    expect(
      within(coverage).getByRole("row", { name: /^C 105 60,5 250% 173% manca oferta$/u }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /bé > 240 % · ajustat 190–240 % · manca oferta 150–190 % · cal ampliar < 150 %$/u,
      ),
    ).toBeVisible();
  });

  it("R-06-15 offers instructor chips with maxInstructorsPerClass = 2", async () => {
    mockScenario("planningTwoInstructors");
    await renderTemplates();

    const card = await waitFor(() => classCard());
    const instructors = await within(card).findByRole("group", { name: "Instructors (màx. 2)" });
    fireEvent.click(within(instructors).getByRole("button", { name: "Laura" }));
    fireEvent.click(within(instructors).getByRole("button", { name: "Marc" }));
    expect(within(instructors).getByRole("button", { name: "Anna" })).toBeDisabled();
  });

  it("R-06-15 hides levels and coverage with levels.enabled = false and requires a manual description", async () => {
    mockScenario("planningNoLevels");
    await renderTemplates();

    const card = await waitFor(() => classCard());
    await waitFor(() => {
      expect(within(card).queryByRole("group", { name: "Nivells" })).not.toBeInTheDocument();
    });
    fireEvent.click(within(card).getByRole("button", { name: "CREA LA CLASSE" }));
    expect(await within(card).findByText("Introduïu una descripció.")).toBeVisible();
    expect(
      screen.queryByRole("table", { name: "Cobertura per nivell (places de la setmana)" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).toHaveTextContent("Introduïu una descripció.");
  });
});

/** `club.openingHours` of the mock club through the api (R-02-09: an absent weekday is closed). */
async function putOpeningHours(days: readonly string[]) {
  const api = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
  const current = await api.GET("/club/opening-hours");
  await api.PUT("/club/opening-hours", {
    body: {
      value: Object.fromEntries(days.map((day) => [day, { close: "22:00", open: "07:00" }])),
      version: current.data?.version ?? 1,
    },
  });
}

/** The JSON bodies of the band requests (`POST …/bands`, `PATCH …/bands/{id}`) sent. */
function captureBandBodies(): { body: unknown; method: string }[] {
  const seen: { body: unknown; method: string }[] = [];
  server.events.on("request:start", ({ request }) => {
    if (!/\/bands(\/[^/]+)?$/u.test(new URL(request.url).pathname)) return;
    if (request.method !== "POST" && request.method !== "PATCH") return;
    void request
      .clone()
      .json()
      .then((body: unknown) => seen.push({ body, method: request.method }));
  });
  return seen;
}

function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 50);
  });
}

describe("E4-W10 D3 closed days (S06 R-06-01, S02 R-02-09)", () => {
  it("R-06-01 R-02-09 a template whose kind has a closed day takes no band: the drawer says which day and sends nothing; the Saturday template still takes one", async () => {
    // Monday is absent from club.openingHours: every WEEKDAYS band would be refused by the api.
    await putOpeningHours(["TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]);
    const bands = captureBandBodies();
    await renderTemplates();

    fireEvent.click(screen.getByRole("button", { name: "Franja" }));
    const drawer = await screen.findByRole("dialog", { name: "Nova franja" });
    expect(
      await within(drawer).findByText(
        "El club està tancat dilluns: aquesta plantilla no admet franges.",
      ),
    ).toBeVisible();
    fireEvent.change(within(drawer).getByLabelText("Inici"), { target: { value: "10:00" } });
    fireEvent.change(within(drawer).getByLabelText("Final"), { target: { value: "11:00" } });
    const save = within(drawer).getByRole("button", { name: "Desa" });
    expect(save).toBeDisabled();
    const form = save.closest("form");
    if (form === null) throw new TypeError("Missing the band form");
    fireEvent.submit(form);
    await settle();
    expect(bands).toEqual([]);
    fireEvent.click(within(drawer).getByRole("button", { name: "Tanca" }));

    // An existing band is refused the same way.
    fireEvent.click(screen.getByRole("button", { name: "Franja 08:30–09:30" }));
    const edit = await screen.findByRole("dialog", { name: "Franja 08:30–09:30" });
    expect(
      within(edit).getByText("El club està tancat dilluns: aquesta plantilla no admet franges."),
    ).toBeVisible();
    expect(within(edit).getByRole("button", { name: "Desa" })).toBeDisabled();
    fireEvent.click(within(edit).getByRole("button", { name: "Tanca" }));

    // The Saturday template has no closed day: its band is sent and saved.
    fireEvent.click(screen.getByRole("button", { name: "Dissabtes" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Dissabtes" }));
    await screen.findByRole("table", { name: "Quadre setmanal de la plantilla «Dissabtes»" });
    fireEvent.click(screen.getByRole("button", { name: "Franja" }));
    const saturday = await screen.findByRole("dialog", { name: "Nova franja" });
    expect(within(saturday).queryByText(/El club està tancat/u)).not.toBeInTheDocument();
    fireEvent.change(within(saturday).getByLabelText("Inici"), { target: { value: "13:00" } });
    fireEvent.change(within(saturday).getByLabelText("Final"), { target: { value: "14:00" } });
    fireEvent.click(within(saturday).getByRole("button", { name: "Desa" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Nova franja" })).not.toBeInTheDocument();
    });
    expect(bands).toEqual([{ body: { endTime: "14:00", startTime: "13:00" }, method: "POST" }]);
  });

  it("S06 §3 a failed GET /club/opening-hours shows its error with [Torna-ho a provar] instead of assuming 07:00–22:00", async () => {
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
    await renderTemplates();
    const retry = await screen.findByRole("button", { name: "Torna-ho a provar" });
    failOpeningHours = false;
    fireEvent.click(retry);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Torna-ho a provar" })).not.toBeInTheDocument();
    });
  });
});
