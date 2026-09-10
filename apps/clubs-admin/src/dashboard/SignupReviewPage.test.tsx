import { createApiClient } from "@agilityhub/api-client";
import { mockScenario, resetDashboardMockState } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { SignupReviewPage } from "./SignupReviewPage";

const branding: Branding = { ...brandingCanicFixture, theme: { ...brandingCanicFixture.theme, mode: "dark" } };
const memberId = "42000000-0000-4000-8000-000000000001";

beforeAll(() => { server.listen({ onUnhandledRequest: "error" }); });
afterEach(() => { cleanup(); server.resetHandlers(); resetDashboardMockState(); mockScenario("admin"); });
afterAll(() => { server.close(); });

async function renderReview(onNavigate = vi.fn()) {
  window.history.pushState(null, "", `/preinscripcions/${memberId}`);
  const i18n = await createI18n({ branding, browserLanguages: ["ca"], initialNamespaces: ["admin-census"], storage: undefined });
  render(<I18nextProvider i18n={i18n}><BrandingProvider branding={branding}><SignupReviewPage client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })} onNavigate={onNavigate} /></BrandingProvider></I18nextProvider>);
  await screen.findByRole("heading", { name: /Preinscripció #1042 — Marta Roca Pujol \+ Kiwi/u });
  return onNavigate;
}

describe("T-04-33 D2 signup validation", () => {
  it("shows masked data, signed documents, consent warning, level, invoice, and Stripe payment", async () => {
    await renderReview();

    expect(screen.getByText("47·····2K")).toBeVisible();
    expect(screen.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", "https://wa.me/34655123123");
    expect(screen.getByRole("link", { name: /cartilla_Kiwi_1.jpg/u })).toHaveAttribute("href", "https://files.example.test/cartilla_Kiwi_1.jpg");
    expect(screen.getByText(/no publiqueu fotos on surti ella/u)).toBeVisible();
    expect(screen.getByLabelText("Nivell inicial")).toHaveValue("43000000-0000-4000-8000-000000000001");
    expect(screen.getByLabelText("Data del proper rebut")).toHaveValue("01/09/2026");
    expect(screen.getByDisplayValue(/130,00/u)).toBeVisible();
    expect(screen.getByText("cobrat")).toBeVisible();
  });

  it("edits pending data, requires a rejection reason, and validates through the server", async () => {
    const navigate = await renderReview();
    fireEvent.click(screen.getByRole("button", { name: "EDITA LES DADES" }));
    const drawer = screen.getByRole("dialog", { name: "Edita les dades de la preinscripció" });
    const nameInput = within(drawer).getAllByLabelText("Nom")[0];
    expect(nameInput).toBeDefined();
    if (nameInput === undefined) return;
    fireEvent.change(nameInput, { target: { value: "Mariona" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "DESA ELS CANVIS" }));
    expect(await screen.findByText("Les dades s'han actualitzat.")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "REBUTJA (amb motiu)" }));
    const modal = screen.getByRole("dialog", { name: "Rebutja la preinscripció" });
    expect(within(modal).getByRole("button", { name: "REBUTJA (amb motiu)" })).toBeDisabled();
    fireEvent.click(within(modal).getByRole("button", { name: "Cancel·la" }));

    fireEvent.click(screen.getByRole("button", { name: "VALIDA L'ALTA" }));
    await waitFor(() => { expect(navigate).toHaveBeenCalledWith("/tauler?signup=validated"); });
  });

  it("maps validation errors to the level and next-invoice fields", async () => {
    const navigate = await renderReview();
    fireEvent.change(screen.getByLabelText("Nivell inicial"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "VALIDA L'ALTA" }));
    expect(await screen.findByText("Selecciona el nivell inicial.")).toBeVisible();
    expect(navigate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Nivell inicial"), { target: { value: "43000000-0000-4000-8000-000000000001" } });
    fireEvent.change(screen.getByLabelText("Data del proper rebut"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "VALIDA L'ALTA" }));
    expect(await screen.findByText("Indica la data del proper rebut.")).toBeVisible();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation when a manual upfront payment is zero", async () => {
    mockScenario("adminSignupReviewManual");
    const navigate = await renderReview();
    expect(screen.getByLabelText("Import efectivament cobrat:")).toHaveValue(0);

    fireEvent.click(screen.getByRole("button", { name: "VALIDA L'ALTA" }));
    expect(await screen.findByText("Confirma que no s'ha cobrat cap import")).toBeVisible();
    expect(navigate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("checkbox", { name: "No s'ha cobrat res: queda pendent" }));
    fireEvent.click(screen.getByRole("button", { name: "VALIDA L'ALTA" }));
    await waitFor(() => { expect(navigate).toHaveBeenCalledWith("/tauler?signup=validated"); });
  });

  it("rejects a pending signup only after receiving a valid reason", async () => {
    const navigate = await renderReview();
    fireEvent.click(screen.getByRole("button", { name: "REBUTJA (amb motiu)" }));
    const modal = screen.getByRole("dialog", { name: "Rebutja la preinscripció" });
    fireEvent.change(within(modal).getByLabelText("Motiu del rebuig"), { target: { value: "Documentació incorrecta" } });
    fireEvent.click(within(modal).getByRole("button", { name: "REBUTJA (amb motiu)" }));
    await waitFor(() => { expect(navigate).toHaveBeenCalledWith("/tauler"); });
  });
});
