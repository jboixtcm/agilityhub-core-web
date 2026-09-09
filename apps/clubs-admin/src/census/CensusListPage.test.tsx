import { createApiClient } from "@agilityhub/api-client";
import { mockScenario } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { DogsPage, MembersPage } from "./CensusListPage";

const branding: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  mockScenario("admin");
  localStorage.clear();
});

afterAll(() => {
  server.close();
});

async function renderPage(kind: "dogs" | "members") {
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["census", "errors"],
    storage: undefined,
  });
  const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        {kind === "members" ? <MembersPage client={client} /> : <DogsPage client={client} />}
      </BrandingProvider>
    </I18nextProvider>,
  );
}

describe("T-03-38 D5 universal member list", () => {
  it("renders applied filters and preserves selection when page size changes", async () => {
    window.history.pushState(null, "", "/abonats");
    await renderPage("members");

    expect(await screen.findByText("Laura Serra Vidal")).toBeVisible();
    expect(screen.getByText("184 d'alta")).toBeVisible();
    expect(screen.getByText(/Filtre \(1\): Modalitat = «Abonat»/u)).toBeVisible();

    fireEvent.click(screen.getByRole("checkbox", { name: "Selecciona Laura Serra Vidal" }));
    expect(screen.getByText("1 seleccionat — accions massives:")).toBeVisible();
    fireEvent.change(screen.getByRole("combobox", { name: "files per pàgina" }), {
      target: { value: "20" },
    });

    expect(screen.getByText("1 seleccionat — accions massives:")).toBeVisible();
    await waitFor(() => {
      expect(new URLSearchParams(window.location.search).get("size")).toBe("20");
    });
  });

  it("toggles visible columns and synchronizes the ordered fields to the URL", async () => {
    window.history.pushState(null, "", "/abonats");
    await renderPage("members");
    expect(await screen.findByText("Laura Serra Vidal")).toBeVisible();

    fireEvent.click(screen.getByText("Columnes"));
    const planColumn = screen.getByRole("checkbox", { name: "Modalitat" });
    expect(planColumn).toBeChecked();
    fireEvent.click(planColumn);

    expect(screen.queryByRole("columnheader", { name: "Modalitat" })).not.toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get("fields")).toBe(
      "fullName,dogs,displayStatus",
    );
  });
});

describe("T-03-42 D15 translated dog list", () => {
  it("renders the approved columns and dog record links", async () => {
    window.history.pushState(null, "", "/gossos");
    await renderPage("dogs");

    expect(await screen.findByText("Duna")).toBeVisible();
    expect(screen.getByText("242 actius")).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Entrenament lliure" })).toBeVisible();
    expect(screen.getByText("FCAG 3241 (Iniciació) · RSCE 13298 (2)")).toBeVisible();
    fireEvent.click(screen.getByText("Columnes"));
    fireEvent.click(screen.getByRole("checkbox", { name: "Guia" }));
    expect(screen.getByRole("columnheader", { name: "Guia" })).toBeVisible();
    expect(await screen.findByText("Júlia Roca")).toBeVisible();
    expect(screen.getAllByRole("link", { name: "Obre la fitxa de Duna" })[0]).toHaveAttribute(
      "href",
      "/gossos/dog-duna",
    );
  });
});
