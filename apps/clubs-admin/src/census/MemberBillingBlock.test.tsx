import { createApiClient } from "@agilityhub/api-client";
import { mockScenario, resetMemberBillingState } from "@agilityhub/api-client/mocks";
import brandingFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider, ToastProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { MemberBillingBlock } from "./MemberBillingBlock";

const branding: Branding = {
  ...brandingFixture,
  locales: ["ca", "es", "en"],
  theme: { ...brandingFixture.theme, mode: "dark" },
};
const dogs = [
  {
    breed: "border collie",
    freeTrainingAllowed: false,
    id: "dog-duna",
    name: "Duna",
    pendingDocuments: [],
  },
  {
    breed: "mestís",
    freeTrainingAllowed: true,
    id: "dog-rock",
    name: "Rock",
    pendingDocuments: [],
  },
];

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetMemberBillingState();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

async function renderBlock(brandingOverride: Branding = branding) {
  mockScenario("admin");
  const i18n = await createI18n({
    branding: brandingOverride,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-census", "enums", "errors"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={brandingOverride}>
        <ToastProvider dismissLabel="Tanca">
          <MemberBillingBlock
            client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
            dogs={dogs}
            memberId="member-laura"
          />
        </ToastProvider>
      </BrandingProvider>
    </I18nextProvider>,
  );
}

describe("D10 member billing block", () => {
  it("loads recent receipts, upfront payments and the dog pack", async () => {
    await renderBlock();
    expect(await screen.findByText("2026-0912")).toBeVisible();
    expect(screen.getByText("Entrada")).toBeVisible();
    expect(screen.getByText("Pack 10", { exact: false })).toBeVisible();
    expect(screen.getByRole("link", { name: "Tots els rebuts ›" })).toHaveAttribute(
      "href",
      expect.stringContaining("memberId%3Aeq%3Amember-laura"),
    );
  });

  it("keeps AMOUNT_EXCEEDS_DUE on the amount field", async () => {
    await renderBlock();
    fireEvent.click(await screen.findByRole("button", { name: "Registra un pagament" }));
    const dialog = screen.getByRole("dialog", { name: "Registra un pagament" });
    fireEvent.change(within(dialog).getByLabelText("Import degut"), { target: { value: "10" } });
    fireEvent.change(within(dialog).getByLabelText("Import pagat"), { target: { value: "20" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Desa" }));
    expect(await within(dialog).findByText(/no pot superar/u)).toBeVisible();
  });

  it("requires a new expiry when adjusting an expired pack", async () => {
    server.use(
      http.get("*/api/v1/pack-balances", () =>
        HttpResponse.json([
          {
            consumed: 10,
            dogId: "dog-rock",
            expiresOn: "2026-07-31",
            id: "53000000-0000-4000-8000-000000000099",
            memberId: "member-laura",
            movements: [],
            openedOn: "2026-01-01",
            planId: "plan-pack-10",
            planName: "Pack 10",
            remaining: 0,
            sessionsTotal: 10,
            state: "EXPIRED",
          },
        ]),
      ),
    );
    await renderBlock();
    fireEvent.click(await screen.findByRole("button", { name: "Ajusta" }));
    const dialog = screen.getByRole("dialog", { name: "Ajusta" });
    expect(within(dialog).getByLabelText("Nova caducitat")).toBeRequired();
    expect(screen.getByText(/Pack 10/u).closest(".member-billing__pack")).not.toHaveTextContent(
      "disponibles",
    );
    expect(screen.getByText(/Pack 10/u).closest(".member-billing__pack")).toHaveTextContent(
      "caducat",
    );
  });

  it("names the dog on every pack row and inside its adjustment modal", async () => {
    server.use(
      http.get("*/api/v1/pack-balances", () =>
        HttpResponse.json(
          dogs.map((dog, index) => ({
            consumed: index + 1,
            dogId: dog.id,
            expiresOn: "2026-12-31",
            id: `pack-${dog.id}`,
            memberId: "member-laura",
            movements: [],
            openedOn: "2026-08-01",
            planId: "plan-pack-10",
            planName: "Pack 10",
            remaining: 9 - index,
            sessionsTotal: 10,
            state: "ACTIVE",
            upfrontPaymentId: null,
          })),
        ),
      ),
    );
    await renderBlock();
    const packRows = await screen.findAllByText("Pack 10", { exact: false });
    expect(packRows).toHaveLength(2);
    expect(packRows[0]?.closest(".member-billing__pack")).toHaveTextContent("Duna");
    expect(packRows[1]?.closest(".member-billing__pack")).toHaveTextContent("Rock");
    const [, rockAdjust] = screen.getAllByRole("button", { name: "Ajusta" });
    if (rockAdjust === undefined) throw new Error("Rock adjustment button was not rendered");
    fireEvent.click(rockAdjust);
    expect(screen.getByRole("dialog", { name: "Ajusta" })).toHaveTextContent("Rock");
  });

  it("omits the pack request, section and upfront PACK concept when PACKS is off", async () => {
    const requests: string[] = [];
    server.events.on("request:start", ({ request }) => {
      requests.push(new URL(request.url).pathname);
    });
    await renderBlock({
      ...branding,
      modules: branding.modules.filter((module) => module !== "PACKS"),
    });
    await screen.findByText("2026-0912");
    expect(requests).not.toContain("/api/v1/pack-balances");
    expect(screen.queryByRole("heading", { name: "Packs" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Registra un pagament" }));
    expect(within(screen.getByLabelText("Concepte")).queryByRole("option", { name: "Pack" })).toBeNull();
  });

  it("maps adjustment field errors and shows an alert for an unclassified failure", async () => {
    server.use(
      http.post("*/api/v1/pack-balances/:id/adjustments", () =>
        HttpResponse.json(
          {
            code: "VALIDATION_ERROR",
            details: { fieldErrors: [{ code: "REQUIRED", field: "reason" }] },
            message: "VALIDATION_ERROR",
            traceId: "test-trace",
          },
          { status: 400 },
        ),
      ),
    );
    await renderBlock();
    fireEvent.click(await screen.findByRole("button", { name: "Ajusta" }));
    let dialog = screen.getByRole("dialog", { name: "Ajusta" });
    fireEvent.change(within(dialog).getByLabelText("Variació de sessions"), {
      target: { value: "1" },
    });
    fireEvent.change(within(dialog).getByLabelText("Motiu"), { target: { value: "Correcció" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Desa" }));
    expect(await within(dialog).findByText(/camps destacats/u)).toBeVisible();

    server.use(
      http.post("*/api/v1/pack-balances/:id/adjustments", () =>
        HttpResponse.json(
          { code: "INTERNAL_ERROR", details: {}, message: "INTERNAL_ERROR", traceId: "test-trace" },
          { status: 500 },
        ),
      ),
    );
    fireEvent.change(within(dialog).getByLabelText("Motiu"), { target: { value: "Segon intent" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Desa" }));
    await waitFor(() => {
      dialog = screen.getByRole("dialog", { name: "Ajusta" });
      expect(within(dialog).getByRole("alert")).toBeVisible();
    });
  });
});
