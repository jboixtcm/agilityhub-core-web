import { createApiClient } from "@agilityhub/api-client";
import { mockScenario, resetDashboardMockState } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { DashboardPage } from "./DashboardPage";

const branding: Branding = { ...brandingCanicFixture, theme: { ...brandingCanicFixture.theme, mode: "dark" } };

beforeAll(() => { server.listen({ onUnhandledRequest: "error" }); });
afterEach(() => { cleanup(); server.resetHandlers(); resetDashboardMockState(); mockScenario("admin"); });
afterAll(() => { server.close(); });

async function renderDashboard(
  onNavigate = vi.fn(),
  client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` }),
) {
  const i18n = await createI18n({ branding, browserLanguages: ["ca"], initialNamespaces: ["admin-dashboard"], storage: undefined });
  render(<I18nextProvider i18n={i18n}><BrandingProvider branding={branding}><DashboardPage client={client} onNavigate={onNavigate} /></BrandingProvider></I18nextProvider>);
  return { client, navigate: onNavigate };
}

describe("T-14-25 D1 dashboard", () => {
  it("renders the server aggregate, all risk rows, pending signups, and accessible chart", async () => {
    const { navigate } = await renderDashboard();

    expect(await screen.findByRole("heading", { name: /Bon dia!.*dilluns.*10 d’agost/iu })).toBeVisible();
    expect(screen.getByText("184")).toBeVisible();
    expect(screen.getByText("87%")).toBeVisible();
    expect(screen.getByText("56")).toBeVisible();
    expect(screen.getByText(/142\/163 places/u)).toBeVisible();
    expect(screen.getAllByText(/avisad[as]/u).length).toBeGreaterThan(0);
    expect(screen.getByText("anul·lada", { exact: true })).toBeVisible();
    expect(screen.getByText(/anul·lada · avisada Laura \+ Duna/u)).toBeVisible();
    expect(screen.getByText(/en risc · avisat Pau \+ Blat/u)).toBeVisible();
    expect(screen.getByText(/s'anul·larà dc a les 07:30/u)).toBeVisible();
    expect(screen.getAllByRole("button", { name: "VALIDA" })).toHaveLength(3);
    expect(screen.getByText("Compte no informat")).toBeVisible();

    const chart = screen.getByRole("figure", { name: "Gossos per nivell — 242 actius" });
    expect(within(chart).getByRole("table", { name: "Gossos per nivell — 242 actius" })).toBeInTheDocument();
    expect(within(chart).getByRole("row", { name: /CAD 24 19/u })).toBeInTheDocument();

    const validateButtons = screen.getAllByRole("button", { name: "VALIDA" });
    const firstValidate = validateButtons[0];
    expect(firstValidate).toBeDefined();
    if (firstValidate === undefined) return;
    fireEvent.click(firstValidate);
    expect(navigate).toHaveBeenCalledWith("/preinscripcions/42000000-0000-4000-8000-000000000001");
  });

  it("hides nullable module blocks and refetches when the window regains focus", async () => {
    mockScenario("adminDashboardNulls");
    const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
    const get = vi.spyOn(client, "GET");
    await renderDashboard(vi.fn(), client);

    expect(await screen.findByText("184")).toBeVisible();
    expect(get).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Entrenaments reservats")).not.toBeInTheDocument();
    expect(screen.queryByRole("figure")).not.toBeInTheDocument();

    fireEvent.focus(window);
    await waitFor(() => { expect(get).toHaveBeenCalledTimes(2); });
  });
});
