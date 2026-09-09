import { createApiClient } from "@agilityhub/api-client";
import { resetCatalogState } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { InfoPage } from "./InfoPage";

const branding: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  resetCatalogState();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetCatalogState();
});
afterAll(() => {
  server.close();
});

async function renderInfo(runtimeBranding: Branding = branding) {
  const i18n = await createI18n({
    branding: runtimeBranding,
    browserLanguages: ["ca"],
    initialNamespaces: ["shell"],
    storage: undefined,
  });
  const client = createApiClient({
    baseUrl: `${window.location.origin}/api/v1`,
    getLocale: () => "ca",
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={runtimeBranding}>
        <InfoPage client={client} />
      </BrandingProvider>
    </I18nextProvider>,
  );
  await screen.findByRole("tab", { name: "FAQ" });
}

describe("T-05-CP-07 screen 30 Info", () => {
  it("shows FAQ, rules and other active pages only", async () => {
    await renderInfo();

    expect(screen.getByRole("tab", { name: "FAQ" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Normes" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Consentiment d'imatge" })).toBeVisible();
    expect(screen.queryByRole("tab", { name: "Privacitat" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Guia de benvinguda" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Convivència al club" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Puc venir amb més gent al club?" }));
    expect(screen.getByText("Sí, sempre que respecti les normes del club.")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Normes" }));
    expect(screen.getByRole("heading", { name: "Normes del club" })).toBeVisible();
    expect(screen.getByText(/Actualitzat el 09\/09\/2026/u)).toBeVisible();
  });

  it("keeps Info available without the FAQ module and omits the FAQ tab", async () => {
    const withoutFaq = {
      ...branding,
      modules: branding.modules.filter((module) => module !== "FAQ"),
    };
    const i18n = await createI18n({
      branding: withoutFaq,
      browserLanguages: ["ca"],
      initialNamespaces: ["shell"],
      storage: undefined,
    });
    const client = createApiClient({
      baseUrl: `${window.location.origin}/api/v1`,
      getLocale: () => "ca",
    });
    render(
      <I18nextProvider i18n={i18n}>
        <BrandingProvider branding={withoutFaq}>
          <InfoPage client={client} />
        </BrandingProvider>
      </I18nextProvider>,
    );

    expect(await screen.findByRole("tab", { name: "Normes" })).toBeVisible();
    expect(screen.queryByRole("tab", { name: "FAQ" })).not.toBeInTheDocument();
  });
});
