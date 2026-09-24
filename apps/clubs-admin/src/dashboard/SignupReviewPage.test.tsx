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

type SignupBody = Record<string, unknown> & {
  member: Record<string, unknown> & { paymentMethod?: Record<string, unknown> | null };
  signup: Record<string, unknown>;
};

// Rewrites the GET /members/{id}/signup response (and optionally the holder's record) the way the real core sends it.
function signupFetch(
  mutate: (body: SignupBody) => void,
  holder?: (body: Record<string, unknown>) => void,
  sent: unknown[] = [],
): typeof fetch {
  return async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const path = new URL(request.url).pathname;
    if (request.method === "POST" && path.endsWith(`/members/${memberId}/validation`)) {
      sent.push(await request.clone().json());
    }
    const response = await fetch(input, init);
    if (request.method !== "GET") return response;
    if (path.endsWith(`/members/${memberId}/signup`)) {
      const body = (await response.json()) as SignupBody;
      mutate(body);
      return Response.json(body, { status: response.status });
    }
    if (holder !== undefined && /\/members\/[^/]+$/u.test(path)) {
      const body = (await response.json()) as Record<string, unknown>;
      holder(body);
      return Response.json(body, { status: response.status });
    }
    return response;
  };
}

// The real core returns a PENDING member without `plan` and with the account masked with a single group.
const pendingMemberFetch = signupFetch((body) => {
  delete body.member.plan;
  delete body.member.planId;
  body.member.maskedAccount = "···· 7719";
  if (body.member.paymentMethod != null) body.member.paymentMethod.maskedAccount = "···· 7719";
});

function hasNull(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).some(hasNull);
}

async function renderReview(onNavigate = vi.fn(), fetchOverride?: typeof fetch) {
  window.history.pushState(null, "", `/preinscripcions/${memberId}`);
  const i18n = await createI18n({ branding, browserLanguages: ["ca"], initialNamespaces: ["admin-census"], storage: undefined });
  render(<I18nextProvider i18n={i18n}><BrandingProvider branding={branding}><SignupReviewPage client={createApiClient({ baseUrl: `${window.location.origin}/api/v1`, ...(fetchOverride === undefined ? {} : { fetch: fetchOverride }) })} onNavigate={onNavigate} /></BrandingProvider></I18nextProvider>);
  await screen.findByRole("heading", { name: /Preinscripció #1042 — Marta Roca Pujol \+ Kiwi/u });
  return onNavigate;
}

describe("T-04-33 D2 signup validation", () => {
  it("shows masked data, signed documents, consent warning, level, invoice, and Stripe payment", async () => {
    await renderReview();

    expect(screen.getByText("47·····2K")).toBeVisible();
    expect(screen.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", "https://wa.me/34655123123");
    expect(screen.getByText("Sí — titular: Marta Roca + gos Kiwi · tarifa familiar en validar")).toBeVisible();
    expect(screen.getByText("Domiciliació · ···· ···· ···· ···· 7719 · titular: la mateixa")).toBeVisible();
    expect(screen.getByRole("link", { name: /cartilla_Kiwi_1.jpg/u })).toHaveAttribute("href", "https://files.example.test/cartilla_Kiwi_1.jpg");
    expect(screen.getByText("3 adjunts")).toBeVisible();
    expect(screen.getByText(/no publiqueu fotos on surti ella/u)).toBeVisible();
    expect(screen.getByLabelText("Nivell inicial")).toHaveValue("43000000-0000-4000-8000-000000000001");
    expect(screen.getByLabelText("Data del proper rebut")).toHaveValue("01/09/2026");
    expect(await screen.findByDisplayValue(/Abonat · 60,00 €\/mes/u)).toBeVisible();
    expect(screen.getByDisplayValue(/130,00/u)).toBeVisible();
    expect(screen.getByText(/Entrada 100,00 € \+ agost 30,00 € \(mitja quota\)/u)).toBeVisible();
    expect(screen.getByText("cobrat")).toBeVisible();
  });

  it("shows the required next-invoice date from the proposed MONTHLY plan when the pending member has no plan yet", async () => {
    await renderReview(vi.fn(), pendingMemberFetch);

    expect(await screen.findByLabelText("Data del proper rebut")).toHaveValue("01/09/2026");
    expect(screen.getByText("obligatori")).toBeVisible();
    // R-03-27: the single-group form the core sends today is shown in the one masked-IBAN format.
    expect(screen.getByText("Domiciliació · ···· ···· ···· ···· 7719 · titular: la mateixa")).toBeVisible();
  });

  it.each([
    [0, "pendent des d'avui"],
    [1, "pendent des de fa 1 dia"],
    [5, "pendent des de fa 5 dies"],
  ])("shows the pending badge as an ICU plural for %i days", async (days, text) => {
    await renderReview(vi.fn(), signupFetch((body) => { body.signup.pendingDays = days; }));
    expect(screen.getByText(text)).toHaveClass("ah-badge");
  });

  it("tolerates null optional fields (INC-08) and never sends null back", async () => {
    const sent: unknown[] = [];
    const navigate = await renderReview(
      vi.fn(),
      signupFetch(
        (body) => {
          body.member.plan = null;
          body.member.maskedAccount = null;
          body.member.paymentMethod = { channel: null, holderName: "Marta Roca Pujol", maskedAccount: null, type: "SEPA_DD" };
          body.upfront = null;
        },
        (holder) => { holder.familyGroupId = null; },
        sent,
      ),
    );
    expect(screen.getByText("Domiciliació · — · titular: la mateixa")).toBeVisible();
    expect(screen.queryByText("Import efectivament cobrat:")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "VALIDA L'ALTA" }));
    // The claim is FOUND but the holder has no group: D2 stops instead of sending `familyGroupId: null`.
    expect(await screen.findByText("No s'ha pogut completar l'acció.", { exact: false })).toBeVisible();
    expect(sent.filter((body) => typeof body === "object" && body !== null && "familyGroupId" in body)).toEqual([]);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("validates a signup with a null payment method, upfront and family claim without sending null", async () => {
    const sent: unknown[] = [];
    const navigate = await renderReview(
      vi.fn(),
      signupFetch(
        (body) => {
          body.member.paymentMethod = null;
          body.member.maskedAccount = null;
          body.familyGroupClaim = null;
          body.upfront = null;
        },
        undefined,
        sent,
      ),
    );
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "VALIDA L'ALTA" }));
    await waitFor(() => { expect(navigate).toHaveBeenCalledWith("/tauler?signup=validated"); });
    const validation = sent.at(-1);
    expect(validation).toBeDefined();
    expect(hasNull(validation)).toBe(false);
    expect(validation).not.toHaveProperty("familyGroupId");
    expect(validation).not.toHaveProperty("upfrontAmountPaid");
  });

  it("shows signup warnings as compact header badges", async () => {
    mockScenario("adminSignupReviewManual");
    await renderReview();
    const header = screen.getByRole("heading", { name: /Preinscripció #1042/u }).closest("header");
    expect(header).not.toBeNull();
    if (header === null) return;
    expect(within(header).getByText("Pagament inicial pendent")).toHaveClass("ah-badge");
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
    const toast = screen.getByText("Les dades s'han actualitzat.").closest(".ah-toast");
    expect(toast).toHaveClass("ah-tone--success");
    expect(toast).toHaveAttribute("role", "status");

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
