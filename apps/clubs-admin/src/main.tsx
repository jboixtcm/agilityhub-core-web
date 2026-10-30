import {
  BRANDING_BOOT_TIMEOUT_MS,
  createApiClient,
  normalizeBranding,
  refreshBranding,
} from "@agilityhub/api-client";
import { AuthClient, MemoryRefreshTokenStore, SessionProvider } from "@agilityhub/auth";
import { createI18n } from "@agilityhub/i18n";
import {
  applyBrandingTheme,
  AppearanceProvider,
  withAppearance,
  withProductBrandName,
} from "@agilityhub/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";

import { App } from "./App";
import { ADMIN_AUTH_OPTIONS } from "./auth-options";
import { BOOT_FAILURE_BRANDING, BootFailurePage } from "./BootFailurePage";
import "./styles.css";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Root element was not found");
}

async function bootstrap(root: HTMLElement) {
  const env = import.meta.env as Record<string, string | undefined>;
  const mockEnabled = import.meta.env.VITE_MOCK === "1";
  // INC-20: the literal `import.meta.env.VITE_MOCK` lets Vite drop the mock world (MSW, fixtures)
  // from a production build; a variable would keep its chunk in the bundle.
  if (import.meta.env.VITE_MOCK === "1") {
    const { startMockWorker } = await import("@agilityhub/api-client/mocks/browser");
    await startMockWorker();
  }

  const apiBaseUrl = env.VITE_API_BASE_URL ?? "/api/v1";
  const identityBaseUrl = env.VITE_IDENTITY_BASE_URL ?? "";
  // E7-W06 step 2: with a cached branding the boot never waits forever for the live one.
  const source = await refreshBranding(
    createApiClient({ baseUrl: apiBaseUrl, credentials: "include" }),
    window.location.host,
    localStorage,
    { cachedTimeoutMs: BRANDING_BOOT_TIMEOUT_MS },
  );
  const branding = withProductBrandName(normalizeBranding(source), env.VITE_PLATFORM_BRAND_NAME);
  applyBrandingTheme(withAppearance(branding).theme);
  document.title = branding.club.name;
  const i18n = await createI18n({
    branding,
    initialNamespaces: [
      "common",
      "auth",
      "admin-activities",
      "admin-audit",
      "admin-catalogs",
      "admin-census",
      "admin-dashboard",
      "admin-scheduling",
      "census",
      "enums",
      "errors",
      "shell",
    ],
  });
  const authClient = new AuthClient({
    ...ADMIN_AUTH_OPTIONS,
    apiBaseUrl,
    identityBaseUrl,
    mockMode: mockEnabled,
    ...(mockEnabled ? { mockRefreshTokenStore: new MemoryRefreshTokenStore() } : {}),
  });

  createRoot(root).render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <AppearanceProvider branding={branding}>
          <SessionProvider client={authClient}>
            <App authClient={authClient} />
          </SessionProvider>
        </AppearanceProvider>
      </I18nextProvider>
    </StrictMode>,
  );
}

/**
 * E11-W02 (INC-41): an app that cannot start (`/branding` failed and nothing is cached) says so,
 * in the product's theme, with a retry — never a blank page.
 */
async function showBootFailure(root: HTMLElement, cause: unknown) {
  console.error(cause);
  const i18n = await createI18n({
    branding: BOOT_FAILURE_BRANDING,
    initialNamespaces: ["common", "errors"],
  });
  createRoot(root).render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <BootFailurePage cause={cause} />
      </I18nextProvider>
    </StrictMode>,
  );
}

bootstrap(rootElement).catch(async (cause: unknown) => {
  await showBootFailure(rootElement, cause);
});
