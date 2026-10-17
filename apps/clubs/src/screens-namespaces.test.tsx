import { createApiClient } from "@agilityhub/api-client";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { AuthClient, MemoryRefreshTokenStore, SessionProvider } from "@agilityhub/auth";
import { clubsNamespaces, createClubsI18n } from "@agilityhub/i18n/clubs";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { App } from "./App";

const branding = brandingCanicFixture as Branding;

beforeAll(() => {
  server.listen({ onUnhandledRequest: "bypass" });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

// Its own file: a `lazy` screen resolves once per module graph, and the check needs the first one.
describe("A38 (E11-W02 step 1): a screen of the lazy chunk never hides itself again", () => {
  it("a screen of the chunk is shown with every namespace of the app loaded: what it mounts with its data never hides it again (04, 25, the receipts)", async () => {
    const client = new AuthClient({
      apiBaseUrl: `${window.location.origin}/api/v1`,
      clientId: "clubs-app",
      identityBaseUrl: window.location.origin,
      mockMode: true,
      mockRefreshTokenStore: new MemoryRefreshTokenStore(),
    });
    await client.login("laura@example.test", "secret-password");
    window.history.pushState(null, "", "/reservar");
    const i18n = await createClubsI18n({
      branding,
      browserLanguages: ["ca"],
      initialNamespaces: ["auth", "common", "shell"],
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
    await screen.findByRole("heading", { level: 1, name: "Reservar" }, { timeout: 5_000 });
    expect(clubsNamespaces.filter((namespace) => !i18n.hasLoadedNamespace(namespace))).toEqual([]);
  });
});
