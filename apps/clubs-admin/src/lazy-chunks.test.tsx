import { currentMockScenario, mockScenario } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { AuthClient, MemoryRefreshTokenStore, SessionProvider } from "@agilityhub/auth";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider, reloadDocument } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { ADMIN_AUTH_OPTIONS } from "./auth-options";

// The console's chunk is gone (a deploy replaced it): its import fails as a browser's does.
vi.mock("./console/ConsolePage", () =>
  Promise.reject(
    new TypeError("Failed to fetch dynamically imported module: /assets/ConsolePage-old.js"),
  ),
);
// The courses chunk arrives only when the test opens it.
const chunk = vi.hoisted(() => {
  let open: () => void = () => undefined;
  const arrived = new Promise<void>((resolve) => {
    open = resolve;
  });
  return {
    arrived,
    open: () => {
      open();
    },
  };
});
vi.mock("./courses/CoursesRoute", async (importOriginal) => {
  await chunk.arrived;
  return importOriginal();
});
vi.mock("@agilityhub/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@agilityhub/ui")>()),
  reloadDocument: vi.fn(),
}));

beforeAll(() => {
  server.listen({ onUnhandledRequest: "bypass" });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  sessionStorage.clear();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

async function renderAt(path: string, email: string, appBranding: Branding) {
  const client = new AuthClient({
    ...ADMIN_AUTH_OPTIONS,
    apiBaseUrl: `${window.location.origin}/api/v1`,
    identityBaseUrl: window.location.origin,
    mockMode: true,
    mockRefreshTokenStore: new MemoryRefreshTokenStore(),
  });
  await client.login(email, "secret-password");
  window.history.pushState(null, "", path);
  const i18n = await createI18n({
    branding: appBranding,
    browserLanguages: ["ca"],
    initialNamespaces: ["common", "errors", "shell"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={appBranding}>
        <SessionProvider client={client}>
          <App authClient={client} />
        </SessionProvider>
      </BrandingProvider>
    </I18nextProvider>,
  );
}

describe("E11-W02 round 3 (review m1) and E11-W05 step 5 (a, d): the back office's lazy chunks never blank the app", () => {
  it("D19 with its chunk gone: the shell stays, an ErrorState says the app was updated, and the document reloads once", async () => {
    mockScenario("platform");
    await renderAt("/consola/clubs", "pol.ferrer@example.test", currentMockScenario().branding);

    const alert = await screen.findByRole("alert", {}, { timeout: 5_000 });
    expect(alert).toHaveTextContent("No disponible");
    // A chunk a deploy removed: the app was updated, not a lost connection (A39.210).
    expect(alert).toHaveTextContent("L'aplicació s'ha actualitzat. Torna a carregar-la.");
    expect(alert).not.toHaveTextContent("No hi ha connexió amb el servidor.");
    // The shell is still there: its entries lead elsewhere.
    expect(screen.getByRole("link", { name: "Consola" })).toBeVisible();
    // A newer deploy: one reload fetches the new chunks.
    expect(reloadDocument).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Torna a carregar" }));
    expect(reloadDocument).toHaveBeenCalledTimes(2);
  });

  it("D18 while its chunk loads: a visible loading state inside the shell, then the screen", async () => {
    await renderAt("/recorreguts", "aina.serra@example.test", brandingCanicFixture as Branding);

    expect(
      await screen.findByRole("status", { name: "Carregant" }, { timeout: 5_000 }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Tauler" })).toBeVisible();

    chunk.open();
    expect(
      await screen.findByRole(
        "heading",
        { level: 1, name: "Biblioteca de recorreguts" },
        { timeout: 5_000 },
      ),
    ).toBeVisible();
    expect(screen.queryByRole("status", { name: "Carregant" })).toBeNull();
  });
});
