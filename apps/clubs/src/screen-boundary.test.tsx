import { createApiClient } from "@agilityhub/api-client";
import { mockScenario } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { AuthClient, MemoryRefreshTokenStore, SessionProvider } from "@agilityhub/auth";
import { createClubsI18n } from "@agilityhub/i18n/clubs";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { App } from "./App";

// The screens' chunk (E11-W02 step 6) arrives only when the test opens it.
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
vi.mock("./screens", async (importOriginal) => {
  await chunk.arrived;
  return importOriginal();
});

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

describe("A38 (E11-W02 step 1): the screen the user left is gone, even while the next one loads", () => {
  it("12 → 03 before the screens' chunk arrived: 12 leaves the page at once, not hidden under the loading state (R-16-11)", async () => {
    const client = new AuthClient({
      apiBaseUrl: `${window.location.origin}/api/v1`,
      clientId: "clubs-app",
      identityBaseUrl: window.location.origin,
      mockMode: true,
      mockRefreshTokenStore: new MemoryRefreshTokenStore(),
    });
    // A member's session: 03 reads `/me/home`, MEMBER only (E41; the mock answers it since E11-W06).
    mockScenario("member");
    await client.login("laura@example.test", "secret-password");
    window.history.pushState(null, "", "/perfil");
    const i18n = await createClubsI18n({
      branding,
      browserLanguages: ["ca"],
      initialNamespaces: ["auth", "census", "common", "enums", "errors", "shell"],
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
    await screen.findByRole("heading", { name: "El meu perfil" });

    const tabs = screen.getByRole("navigation", { name: "Navegació principal" });
    fireEvent.click(within(tabs).getByRole("link", { name: "Reservar" }));

    expect(await screen.findByRole("status", { name: "Carregant" })).toBeVisible();
    // Not merely hidden: a hidden screen keeps its effects, so its late answers could still act.
    expect(screen.queryByText("El meu perfil")).not.toBeInTheDocument();

    chunk.open();
    expect(await screen.findByRole("heading", { level: 1, name: "Reservar" })).toBeVisible();
  });
});
