import { createApiClient } from "@agilityhub/api-client";
import { mockScenario } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { AuthClient, MemoryRefreshTokenStore, SessionProvider } from "@agilityhub/auth";
import { createClubsI18n } from "@agilityhub/i18n/clubs";
import { type Branding, BrandingProvider, reloadDocument } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { ScreenBoundary } from "./ScreenBoundary";

// The screens' chunk is gone (a deploy replaced it): its import fails as a browser's does.
vi.mock("./screens", () =>
  Promise.reject(
    new TypeError("Failed to fetch dynamically imported module: /assets/screens-old.js"),
  ),
);
vi.mock("@agilityhub/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@agilityhub/ui")>()),
  reloadDocument: vi.fn(),
}));

const branding = brandingCanicFixture as Branding;

beforeAll(() => {
  server.listen({ onUnhandledRequest: "bypass" });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  sessionStorage.clear();
  vi.mocked(reloadDocument).mockClear();
});
afterAll(() => {
  server.close();
});

describe("E11-W02 round 2 (review #4) and E11-W05 step 5 (d): a screen whose chunk cannot load never blanks the app", () => {
  it("04 with its chunk gone: the shell stays, an ErrorState says the app was updated, and the document reloads once", async () => {
    const client = new AuthClient({
      apiBaseUrl: `${window.location.origin}/api/v1`,
      clientId: "clubs-app",
      identityBaseUrl: window.location.origin,
      mockMode: true,
      mockRefreshTokenStore: new MemoryRefreshTokenStore(),
    });
    // A member's session: 04 reads `/me/bookable-classes`, MEMBER only (E41; the mock answers it
    // since E11-W06), and W13 sends a session without MEMBER to its own landing.
    mockScenario("member");
    await client.login("laura@example.test", "secret-password");
    window.history.pushState(null, "", "/reservar");
    const i18n = await createClubsI18n({
      branding,
      browserLanguages: ["ca"],
      initialNamespaces: ["common", "errors", "shell"],
      storage: undefined,
    });
    render(
      <I18nextProvider i18n={i18n}>
        <BrandingProvider branding={branding}>
          <SessionProvider client={client}>
            <App
              apiClient={createApiClient({
                baseUrl: `${window.location.origin}/api/v1`,
                getAccessToken: () => client.getAccessToken(),
                getLocale: () => "ca",
              })}
              authClient={client}
            />
          </SessionProvider>
        </BrandingProvider>
      </I18nextProvider>,
    );

    const alert = await screen.findByRole("alert", {}, { timeout: 5_000 });
    expect(alert).toHaveTextContent("No disponible");
    // A chunk a deploy removed: the app was updated, not a lost connection (A39.210).
    expect(alert).toHaveTextContent("L'aplicació s'ha actualitzat. Torna a carregar-la.");
    expect(alert).not.toHaveTextContent("No hi ha connexió amb el servidor.");
    // The shell is still there: the tabs lead elsewhere.
    expect(screen.getByRole("navigation", { name: "Navegació principal" })).toBeVisible();
    // A newer deploy: one reload fetches the new chunks.
    expect(reloadDocument).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Torna a carregar" }));
    expect(reloadDocument).toHaveBeenCalledTimes(2);
  });

  it("a screen that throws while drawing: a plain message in the app's register, «Torna-ho a provar», and no reload of its own", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const i18n = await createClubsI18n({
      branding,
      browserLanguages: ["ca"],
      initialNamespaces: ["common", "errors", "shell"],
      storage: undefined,
    });
    function Broken(): never {
      throw new TypeError("Cannot read properties of undefined (reading 'dogs')");
    }
    render(
      <I18nextProvider i18n={i18n}>
        <ScreenBoundary>
          <Broken />
        </ScreenBoundary>
      </I18nextProvider>,
    );

    const alert = await screen.findByRole("alert");
    // A39.211: not `errors:INTERNAL_ERROR` (a reference code, «vosaltres»).
    expect(alert).toHaveTextContent("No s'ha pogut mostrar aquesta pantalla.");
    expect(alert).not.toHaveTextContent("codi de referència");
    expect(reloadDocument).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Torna-ho a provar" }));
    expect(reloadDocument).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});
