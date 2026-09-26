import { createApiClient } from "@agilityhub/api-client";
import {
  mockScenario,
  resetActivityState,
  resetBookingMockState,
  type MockScenario,
} from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { AuthClient, MemoryRefreshTokenStore, SessionProvider } from "@agilityhub/auth";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";

import { App } from "../App";

/** The club-local instant the S08 mock world is drawn at (`BOOKING_MOCK_NOW`, Sunday 2-08 noon). */
export const BOOKING_NOW = new Date("2026-08-02T12:00:00+02:00");

export const canic: Branding = {
  ...brandingCanicFixture,
  locales: ["ca", "es", "en"],
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

export const without = (module: string) => canic.modules.filter((item) => item !== module);

/** Test hooks of the booking suites: MSW, the pinned clock and a fresh booking world per case. */
export function setupBookingWorld(): void {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" });
  });
  beforeEach(() => {
    vi.useFakeTimers({ now: BOOKING_NOW, shouldAdvanceTime: true, toFake: ["Date"] });
    resetBookingMockState();
    resetActivityState();
    mockScenario("member");
    window.history.replaceState(null, "", "/");
  });
  afterEach(async () => {
    cleanup();
    // A confirmation that unmounts releases its hold on the next tick: let it land in this test.
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    server.resetHandlers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    resetBookingMockState();
    resetActivityState();
    mockScenario("member");
  });
  afterAll(() => {
    server.close();
  });
}

export function apiClient(locale = "ca") {
  return createApiClient({ baseUrl: `${window.location.origin}/api/v1`, getLocale: () => locale });
}

async function signedIn(): Promise<AuthClient> {
  const client = new AuthClient({
    apiBaseUrl: `${window.location.origin}/api/v1`,
    clientId: "clubs-app",
    identityBaseUrl: window.location.origin,
    mockMode: true,
    mockRefreshTokenStore: new MemoryRefreshTokenStore(),
  });
  await client.login("laura@example.test", "secret-password");
  return client;
}

interface RenderOptions {
  branding?: Branding;
  locale?: "ca" | "en" | "es";
  scenario?: MockScenario;
}

async function providers(
  node: (auth: AuthClient) => ReactNode,
  { branding = canic, locale = "ca", scenario }: RenderOptions,
) {
  if (scenario !== undefined) mockScenario(scenario);
  const i18n = await createI18n({
    branding,
    browserLanguages: [locale],
    initialNamespaces: [
      "activities",
      "auth",
      "booking",
      "common",
      "enums",
      "errors",
      "home",
      "shell",
    ],
    storage: undefined,
  });
  const auth = await signedIn();
  return render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <SessionProvider client={auth}>{node(auth)}</SessionProvider>
      </BrandingProvider>
    </I18nextProvider>,
  );
}

/** A booking page alone, with the i18n, branding and session it reads. */
export async function renderPage(node: ReactNode, options: RenderOptions = {}) {
  return providers(() => node, options);
}

/**
 * The whole app at `path`: the flow moves between 04, 06/29, 07 and 03 through the history
 * entry (`navigateInApp`), as in the browser.
 */
export async function renderApp(path: string, options: RenderOptions = {}) {
  window.history.replaceState(null, "", path);
  const locale = options.locale ?? "ca";
  return providers((auth) => <App apiClient={apiClient(locale)} authClient={auth} />, options);
}
