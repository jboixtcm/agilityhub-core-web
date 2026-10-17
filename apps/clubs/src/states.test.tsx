import { createApiClient } from "@agilityhub/api-client";
import { mockScenario, resetMemberBillingState } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { AuthClient, MemoryRefreshTokenStore, SessionProvider } from "@agilityhub/auth";
import { createClubsI18n } from "@agilityhub/i18n/clubs";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
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
  mockScenario("member");
  resetMemberBillingState();
});
afterAll(() => {
  server.close();
});

/** The session's own reads: the shell needs them, every screen's data is something else. */
const SESSION_PATHS = /\/api\/v1\/(me|me\/training-summary|branding)$|\/oauth2\//u;

async function renderAt(path: string, email: string, reads: "fail" | "pending") {
  const client = new AuthClient({
    apiBaseUrl: `${window.location.origin}/api/v1`,
    clientId: "clubs-app",
    identityBaseUrl: window.location.origin,
    mockMode: true,
    mockRefreshTokenStore: new MemoryRefreshTokenStore(),
  });
  await client.login(email, "secret-password");
  server.use(
    http.get("*/api/v1/*", async ({ request }) => {
      const url = new URL(request.url);
      if (SESSION_PATHS.test(url.pathname)) return undefined;
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
}

const MEMBER = "laura@example.test";
const INSTRUCTOR = "ivet.puig@example.test";

/** Every list and detail screen of the members' app that reads data of its own. */
const SCREENS: [string, string, string, "instructor" | "member"][] = [
  ["03", "/inici", MEMBER, "member"],
  ["04", "/reservar", MEMBER, "member"],
  ["07", "/reserves/booking-duna-mon3", MEMBER, "member"],
  ["08", "/entrenaments", MEMBER, "member"],
  ["10", "/avui", MEMBER, "member"],
  ["11", "/notificacions", MEMBER, "member"],
  ["13", "/gossos", MEMBER, "member"],
  ["25", "/historic", MEMBER, "member"],
  ["rebuts", "/rebuts", MEMBER, "member"],
  ["rebut", "/rebuts/invoice-laura-sep", MEMBER, "member"],
  ["28", "/dades", MEMBER, "member"],
  ["14", "/inactivitat", MEMBER, "member"],
  ["15", "/baixa", MEMBER, "member"],
  ["30", "/info", MEMBER, "member"],
  ["20", "/instructor/dia", INSTRUCTOR, "instructor"],
  ["23", "/instructor/avui", INSTRUCTOR, "instructor"],
  ["alumnes", "/instructor/alumnes", INSTRUCTOR, "instructor"],
];

// E11-W02 step 4: each screen's reads have their states from the UI kit — a status while they
// load (the Skeleton's `role="status"`) and an alert when they fail.
describe("E11-W02 step 4: the members' app says when its data is loading or failed", () => {
  it.each(SCREENS)(
    "%s (%s) shows a loading status while its reads are out",
    async (_screen, path, email, scenario) => {
      mockScenario(scenario);
      await renderAt(path, email, "pending");
      await waitFor(() => {
        expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
      });
    },
  );

  it.each(SCREENS)(
    "%s (%s) shows an alert when its reads fail",
    async (_screen, path, email, scenario) => {
      mockScenario(scenario);
      await renderAt(path, email, "fail");
      expect((await screen.findAllByRole("alert")).length).toBeGreaterThan(0);
    },
  );
});
