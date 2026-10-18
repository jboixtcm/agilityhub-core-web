import { createApiClient } from "@agilityhub/api-client";
import {
  mockScenario,
  resetAuditMockState,
  resetCensusRecordState,
} from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MemberDataExportButton, MemberPrivacyCard } from "./MemberPrivacyCard";

const branding = brandingCanicFixture as Branding;
let client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

beforeEach(() => {
  client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetAuditMockState();
  resetCensusRecordState();
  mockScenario("admin");
});

afterAll(() => {
  server.close();
});

async function renderPrivacy(status: "ACTIVE" | "LEFT" = "LEFT", language = "ca", erased = false) {
  const i18n = await createI18n({
    branding: { ...branding, locales: ["ca", "es", "en"] },
    browserLanguages: [language],
    initialNamespaces: ["admin-census", "errors"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <MemberPrivacyCard
          client={client}
          erased={erased}
          memberId="member-laura"
          status={status}
        />
      </BrandingProvider>
    </I18nextProvider>,
  );
}

describe("T-14-18 · D10 requests and cancels a member erasure (R-14-14)", () => {
  it("shows the eligibility checks, the scheduled date and the cancellation", async () => {
    mockScenario("memberLeft");
    await renderPrivacy();

    expect(await screen.findByText("Política de privacitat")).toBeVisible();
    expect(screen.getByText("Drets d'imatge")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Suprimeix les dades (RGPD)" }));

    const requestDialog = screen.getByRole("dialog", { name: "Suprimeix les dades (RGPD)" });
    expect(within(requestDialog).getByText(/ha d'estar de baixa/u)).toBeVisible();
    expect(within(requestDialog).getByText(/cap rebut obert/u)).toBeVisible();
    expect(within(requestDialog).getByText(/cap reserva futura/u)).toBeVisible();
    fireEvent.change(within(requestDialog).getByLabelText("Motiu (opcional)"), {
      target: { value: "Petició presencial" },
    });
    fireEvent.click(within(requestDialog).getByRole("button", { name: "PROGRAMA LA SUPRESSIÓ" }));

    expect(await screen.findByText(/Supressió programada per al/u)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Anul·la la supressió" }));
    const cancelDialog = screen.getByRole("dialog", { name: "Anul·la la supressió" });
    fireEvent.click(within(cancelDialog).getByRole("button", { name: "ANUL·LA LA SUPRESSIÓ" }));
    await waitFor(() => {
      expect(screen.queryByText(/Supressió programada per al/u)).not.toBeInTheDocument();
    });
    expect(screen.getByRole("status")).toHaveTextContent("La sol·licitud s'ha anul·lat.");
  });

  it("keeps the api's 422 ERASURE_BLOCKED reasons inside the request dialog", async () => {
    mockScenario("memberLeft");
    server.use(
      http.post("*/api/v1/members/:id/erasure", () =>
        HttpResponse.json(
          {
            code: "ERASURE_BLOCKED",
            details: { reasons: ["INVOICES_OPEN", "FUTURE_BOOKINGS"] },
            message: "Erasure blocked",
            traceId: "privacy-test",
          },
          { status: 422 },
        ),
      ),
    );
    await renderPrivacy();
    await screen.findByText("Política de privacitat");
    fireEvent.click(screen.getByRole("button", { name: "Suprimeix les dades (RGPD)" }));
    const dialog = screen.getByRole("dialog", { name: "Suprimeix les dades (RGPD)" });
    fireEvent.click(within(dialog).getByRole("button", { name: "PROGRAMA LA SUPRESSIÓ" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Hi ha rebuts pendents, en cobrament o impagats.",
    );
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Hi ha reserves futures actives.");
  });

  it("offers no erasure action unless the member is LEFT and not erased", async () => {
    await renderPrivacy("ACTIVE");
    await screen.findByText("Política de privacitat");
    expect(screen.queryByRole("button", { name: "Suprimeix les dades (RGPD)" })).toBeNull();
    cleanup();
    await renderPrivacy("LEFT", "ca", true);
    await screen.findByText("Política de privacitat");
    expect(screen.queryByRole("button", { name: "Suprimeix les dades (RGPD)" })).toBeNull();
  });
});

describe("T-14-17 and T-14-30 · D10 data access and consent history", () => {
  it("queues an admin data package once, disables the action while pending and reports it", async () => {
    let resolveRequest: (() => void) | undefined;
    let requestBody: unknown;
    server.use(
      http.post("*/api/v1/members/:id/data-export", async ({ request }) => {
        requestBody = await request.json();
        await new Promise<void>((resolve) => {
          resolveRequest = resolve;
        });
        return HttpResponse.json(
          { jobId: "71000000-0000-4000-8000-000000000001", statusUrl: "/api/v1/exports/job" },
          { status: 202 },
        );
      }),
    );
    const i18n = await createI18n({
      branding,
      browserLanguages: ["ca"],
      initialNamespaces: ["admin-census", "errors"],
      storage: undefined,
    });
    render(
      <I18nextProvider i18n={i18n}>
        <MemberDataExportButton client={client} memberId="member-laura" />
      </I18nextProvider>,
    );

    const button = screen.getByRole("button", { name: "Descarrega les dades (RGPD)" });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("S'està preparant el paquet de dades.");
    fireEvent.click(button);
    await waitFor(() => {
      expect(resolveRequest).toBeTypeOf("function");
    });
    resolveRequest?.();
    await waitFor(() => {
      expect(requestBody).toEqual({ deliverToMember: false });
      expect(button).toBeEnabled();
    });
  });

  it("renders consent history in ca, es and en without the ipHash", async () => {
    for (const [language, privacy, image] of [
      ["ca", "Política de privacitat", "Drets d'imatge"],
      ["es", "Política de privacidad", "Derechos de imagen"],
      ["en", "Privacy policy", "Image rights"],
    ] as const) {
      await renderPrivacy("ACTIVE", language);
      expect(await screen.findByText(privacy)).toBeVisible();
      expect(screen.getByText(image)).toBeVisible();
      expect(screen.queryByText(/mock-ip-hash/u)).toBeNull();
      cleanup();
    }
  });
});
