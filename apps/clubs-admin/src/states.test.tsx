import { mockScenario } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { AuthClient, MemoryRefreshTokenStore, SessionProvider } from "@agilityhub/auth";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { App } from "./App";
import { ADMIN_AUTH_OPTIONS } from "./auth-options";

const branding = brandingCanicFixture as Branding;

beforeAll(() => {
  server.listen({ onUnhandledRequest: "bypass" });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

/** The session's own reads: the shell needs them, every screen's data is something else. */
const SESSION_PATHS = /\/api\/v1\/(me|branding|dashboard\/counters)$|\/oauth2\//u;

async function renderAt(path: string, reads: "fail" | "pending") {
  const client = new AuthClient({
    ...ADMIN_AUTH_OPTIONS,
    apiBaseUrl: `${window.location.origin}/api/v1`,
    identityBaseUrl: window.location.origin,
    mockMode: true,
    mockRefreshTokenStore: new MemoryRefreshTokenStore(),
  });
  await client.login("aina.serra@example.test", "secret-password");
  server.use(
    http.get("*/api/v1/*", async ({ request }) => {
      if (SESSION_PATHS.test(new URL(request.url).pathname)) return undefined;
      if (reads === "pending") {
        await delay("infinite");
        return undefined;
      }
      return HttpResponse.json(
        { code: "INTERNAL_ERROR", details: {}, message: "Down", traceId: "t-states" },
        { status: 500 },
      );
    }),
  );
  window.history.pushState(null, "", path);
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["common", "errors", "shell"],
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

/** The back office's list and detail screens that read data of their own. */
const SCREENS: [string, string][] = [
  ["D1", "/tauler"],
  ["D2", "/preinscripcions/42000000-0000-4000-8000-000000000001"],
  ["D3", "/plantilles"],
  ["D4", "/calendari"],
  ["D5", "/abonats"],
  ["D10", "/abonats/member-laura"],
  ["D15", "/gossos"],
  ["D6", "/facturacio"],
  ["activitats", "/activitats"],
  ["D8", "/modalitats"],
  ["D9", "/comunicats"],
  ["D11", "/parametres"],
  ["D12", "/agenda"],
  ["entrenaments", "/entrenaments"],
  ["D13", "/alumnes"],
  ["D14", "/seguiment"],
  ["D16", "/pistes"],
  ["D17", "/equip"],
  ["D18", "/recorreguts"],
  ["inactivitats", "/inactivitats"],
  ["auditoria", "/auditoria"],
];

// E11-W02 step 4: each screen's reads have their states from the UI kit — a status while they
// load and an alert when they fail.
describe("E11-W02 step 4: the back office says when its data is loading or failed", () => {
  it.each(SCREENS)(
    "%s (%s) shows a loading status while its reads are out",
    async (_screen, path) => {
      await renderAt(path, "pending");
      await waitFor(() => {
        expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
      });
    },
  );

  it.each(SCREENS)("%s (%s) shows an alert when its reads fail", async (_screen, path) => {
    await renderAt(path, "fail");
    expect((await screen.findAllByRole("alert")).length).toBeGreaterThan(0);
  });
});
