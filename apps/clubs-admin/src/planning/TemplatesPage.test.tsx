import { createApiClient } from "@agilityhub/api-client";
import { mockScenario, resetCatalogState, resetPlanningState } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  resetPlanningState();
  resetCatalogState();
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
