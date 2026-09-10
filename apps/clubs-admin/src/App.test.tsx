import { mockScenario, resetOnboardingMockState } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { AuthClient, MemoryRefreshTokenStore, SessionProvider } from "@agilityhub/auth";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ADMIN_ROUTES, AdminNavigation, App } from "./App";

const branding: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  resetOnboardingMockState();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  mockScenario("admin");
  resetOnboardingMockState();
});
afterAll(() => {
  server.close();
});

function authClient() {
  return new AuthClient({
    apiBaseUrl: `${window.location.origin}/api/v1`,
    clientId: "clubs-admin",
    identityBaseUrl: window.location.origin,
    mockMode: true,
    mockRefreshTokenStore: new MemoryRefreshTokenStore(),
  });
}

async function renderApplication(client: AuthClient) {
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-audit", "auth", "shell"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <SessionProvider client={client}>
          <App authClient={client} />
        </SessionProvider>
      </BrandingProvider>
    </I18nextProvider>,
  );
}

async function renderNavigation(roles: ("ADMIN" | "INSTRUCTOR" | "MEMBER")[]) {
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["shell"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <AdminNavigation modules={branding.modules} pathname="/tauler" roles={roles} />
      </BrandingProvider>
    </I18nextProvider>,
  );
}

describe("T-02-14 clubs-admin shell", () => {
  it("uses the compact mark with the runtime club name", async () => {
    const client = authClient();
    await client.login("aina.serra@example.test", "secret-password");
    window.history.pushState(null, "", "/tauler");
    await renderApplication(client);

    await waitFor(() => {
      expect(document.querySelector(".admin-shell__brand img")).toHaveAttribute(
        "src",
        brandingCanicFixture.theme.markUrl,
      );
    });
    expect(document.querySelector(".admin-shell__brand img")).toHaveAttribute("alt", "");
    expect(screen.getByText(brandingCanicFixture.club.name)).toBeVisible();
  });

  it("hides the Configuració group from instructors", async () => {
    await renderNavigation(["INSTRUCTOR"]);

    expect(screen.queryByRole("heading", { name: "Configuració" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Paràmetres" })).not.toBeInTheDocument();
  });

  it("shows the fixed sidebar groups to administrators", async () => {
    await renderNavigation(["ADMIN"]);

    expect(screen.getByRole("heading", { name: "Persones" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Camp" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Gestió" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Configuració" })).toBeInTheDocument();
  });

  it("registers every desktop route from the frontend plan", () => {
    expect(ADMIN_ROUTES.map((route) => route.path)).toEqual(
      expect.arrayContaining([
        "/tauler",
        "/preinscripcions/:id",
        "/plantilles",
        "/calendari",
        "/abonats",
        "/abonats/:id",
        "/gossos",
        "/gossos/:id",
        "/facturacio",
        "/facturacio/remeses",
        "/activitats",
        "/modalitats",
        "/comunicats",
        "/parametres",
        "/agenda",
        "/alumnes/:id",
        "/seguiment",
        "/pistes",
        "/equip",
        "/recorreguts",
        "/inactivitats",
        "/auditoria",
        "/consola/*",
      ]),
    );
  });
});

describe("T-01-18 clubs-admin access", () => {
  it("offers magic-link and password entry with the shared auth components", async () => {
    window.history.pushState(null, "", "/entrar");
    await renderApplication(authClient());

    expect(screen.getByRole("heading", { name: "Accés al backoffice" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Envia'm l'enllaç" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Tinc contrasenya" })).toBeVisible();
    fireEvent.change(screen.getByLabelText("Correu electrònic"), {
      target: { value: "aina.serra@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Envia'm l'enllaç" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Si el correu és al club, hi rebràs l'enllaç",
    );
    fireEvent.click(screen.getByRole("button", { name: "Tinc contrasenya" }));
    expect(screen.getByLabelText("Contrasenya")).toBeVisible();
  });
});

describe("T-01-20 clubs-admin handoff", () => {
  it("exchanges the one-time handoff code on the landing route", async () => {
    window.history.pushState(null, "", "/entrar?handoff=mock-handoff-code");
    const client = authClient();
    const exchange = vi
      .spyOn(client, "exchangeHandoff")
      .mockImplementation(() => new Promise<never>(() => undefined));
    await renderApplication(client);

    expect(screen.getByRole("status")).toHaveTextContent("Obrint el backoffice…");
    await waitFor(() => {
      expect(exchange).toHaveBeenCalledWith("mock-handoff-code");
    });
  });
});

describe("T-01-26 clubs-admin onboarding", () => {
  it("shows profile completion as a non-dismissible backoffice modal", async () => {
    mockScenario("onboardingAdmin");
    const client = authClient();
    await client.login("aina.serra@example.test", "secret-password");
    window.history.pushState(null, "", "/tauler");
    await renderApplication(client);

    const dialog = await screen.findByRole("dialog", { name: "Completa el teu perfil" });
    expect(dialog).toBeVisible();
    expect(screen.getByRole("heading", { name: "Configuració" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Tanca" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ho faré més tard" })).toBeVisible();
  });

  it("removes the postpone action when the policy limit is exhausted", async () => {
    mockScenario("policyReconsent");
    const client = authClient();
    await client.login("aina.serra@example.test", "secret-password");
    await client.postponeOnboarding();
    await client.postponeOnboarding();
    await client.postponeOnboarding();
    window.history.pushState(null, "", "/tauler");
    await renderApplication(client);

    expect(
      await screen.findByRole("dialog", {
        name: "Hem actualitzat la política de privacitat",
      }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Més tard" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tanca" })).not.toBeInTheDocument();
  });
});
