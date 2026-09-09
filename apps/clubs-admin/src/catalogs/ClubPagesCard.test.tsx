import { createApiClient, type ApiClient } from "@agilityhub/api-client";
import { resetCatalogState } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ClubPagesCard } from "./ClubPagesCard";

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

async function renderCard(): Promise<ApiClient> {
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-catalogs", "admin-settings", "errors"],
    storage: undefined,
  });
  const client = createApiClient({
    baseUrl: `${window.location.origin}/api/v1`,
    getLocale: () => "ca",
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <ClubPagesCard client={client} />
      </BrandingProvider>
    </I18nextProvider>,
  );
  await screen.findByRole("button", { name: /Normes del club/u });
  return client;
}

describe("T-05-CP-07 club page editor", () => {
  it("warns about provisional text and confirms the next consent version before publishing", async () => {
    await renderCard();

    expect(screen.getByText("Text provisional — pendent d'omplir")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Normes del club/u }));
    expect(screen.getByRole("dialog", { name: "Edita la pàgina" })).toBeVisible();
    expect(screen.getAllByText("Text provisional — pendent d'omplir")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Convivència" })).toBeVisible();

    fireEvent.change(screen.getByLabelText("Contingut"), {
      target: { value: "## Convivència\n\nRespecteu els espais **compartits**." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Publica" }));
    const confirmation = screen.getByRole("dialog", { name: "Publica la pàgina" });
    expect(confirmation).toHaveTextContent(
      "Es publicarà la versió 2 — els consentiments futurs hi faran referència",
    );
    fireEvent.click(within(confirmation).getByRole("button", { name: "Publica" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByText(/versió 2/u)).toBeVisible();
    });
  });

  it("maps STALE_VERSION to the page-specific reload message", async () => {
    const client = await renderCard();
    fireEvent.click(screen.getByRole("button", { name: /Normes del club/u }));
    const current = await client.GET("/club-pages/{key}", {
      params: { path: { key: "RULES" } },
    });
    if (current.data === undefined) throw new TypeError("Expected the rules fixture");
    await client.PATCH("/club-pages/{key}", {
      body: {
        body: { ...current.data.body, ca: "## Canvi extern" },
        version: current.data.version,
      },
      params: { path: { key: "RULES" } },
    });

    fireEvent.change(screen.getByLabelText("Contingut"), {
      target: { value: "## Canvi local" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Desa l'esborrany" }));

    expect(
      await screen.findByText("Un altre administrador ha editat aquesta pàgina — recarrega"),
    ).toBeVisible();
  });
});
