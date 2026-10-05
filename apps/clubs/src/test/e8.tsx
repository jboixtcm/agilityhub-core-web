import { createApiClient } from "@agilityhub/api-client";
import {
  mockScenario,
  resetMemberBillingState,
  type MockScenario,
} from "@agilityhub/api-client/mocks";
import brandingFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider, ToastProvider } from "@agilityhub/ui";
import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";

export const e8Branding: Branding = {
  ...brandingFixture,
  locales: ["ca", "es", "en"],
  theme: { ...brandingFixture.theme, mode: "dark" },
};

export const e8Client = (locale = "ca") =>
  createApiClient({ baseUrl: `${window.location.origin}/api/v1`, getLocale: () => locale });

export function setupE8World(): void {
  beforeAll(() => { server.listen({ onUnhandledRequest: "error" }); });
  beforeEach(() => {
    mockScenario("member");
    resetMemberBillingState();
    window.history.replaceState(null, "", "/");
  });
  afterEach(() => {
    cleanup();
    server.resetHandlers();
    server.events.removeAllListeners();
    resetMemberBillingState();
    mockScenario("member");
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  afterAll(() => { server.close(); });
}

export async function renderE8(
  node: ReactNode,
  options: { branding?: Branding; locale?: "ca" | "es" | "en"; scenario?: MockScenario } = {},
) {
  const locale = options.locale ?? "ca";
  const branding = options.branding ?? e8Branding;
  if (options.scenario !== undefined) mockScenario(options.scenario);
  const i18n = await createI18n({
    branding,
    browserLanguages: [locale],
    initialNamespaces: [
      "admin-census",
      "auth",
      "billing",
      "census",
      "common",
      "enums",
      "errors",
      "inactivity",
      "leave",
    ],
    storage: undefined,
  });
  return render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <ToastProvider dismissLabel="close">{node}</ToastProvider>
      </BrandingProvider>
    </I18nextProvider>,
  );
}
