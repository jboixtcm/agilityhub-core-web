import { createApiClient } from "@agilityhub/api-client";
import { mockScenario, resetMemberBillingState } from "@agilityhub/api-client/mocks";
import brandingFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider, ToastProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

async function renderBlock() {
  mockScenario("admin");
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-census", "enums", "errors"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
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
  });
});
