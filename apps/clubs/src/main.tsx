import {
  BRANDING_BOOT_TIMEOUT_MS,
  createApiClient,
  normalizeBranding,
  refreshBranding,
} from "@agilityhub/api-client";
import {
  AuthClient,
  createAuthenticatedApiClient,
  MemoryRefreshTokenStore,
  SessionProvider,
} from "@agilityhub/auth";
import { createI18n } from "@agilityhub/i18n";
import { applyBrandingTheme, BrandingProvider } from "@agilityhub/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";

import { App } from "./App";
import { setPushRegistration } from "./notifications/push";
import "./styles.css";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Root element was not found");
}

async function bootstrap(root: HTMLElement) {
  const env = import.meta.env as Record<string, string | undefined>;
  const mockEnabled = import.meta.env.VITE_MOCK === "1";
  // INC-20: the literal `import.meta.env.VITE_MOCK` lets Vite drop the mock world (MSW, fixtures)
  // from a production build; a variable would keep its chunk in the bundle and the precache.
  if (import.meta.env.VITE_MOCK === "1") {
    const { startMockWorker } = await import("@agilityhub/api-client/mocks/browser");
    await startMockWorker();
    // S11 R-11-07: mock mode registers no app worker (MSW's owns `/`), and a headless browser has
    // no push service, so the e2e suite may hand in a stand-in registration (`addInitScript`).
    const standIn: unknown = Reflect.get(window, "__agilityhubPushRegistration");
    if (typeof standIn === "object" && standIn !== null) {
      setPushRegistration(standIn as ServiceWorkerRegistration);
    }
  } else {
    // The app's worker (`src/sw.ts`): the precache and web push; its registration is the one push
    // subscribes with (never `navigator.serviceWorker.ready`).
    const { registerSW } = await import("virtual:pwa-register");
    registerSW({
      immediate: true,
      onRegisteredSW: (_url, registration) => {
        setPushRegistration(registration);
      },
    });
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
  const branding = normalizeBranding(source);
  applyBrandingTheme(branding.theme);
  document.title = branding.club.name;
  const i18n = await createI18n({
    branding,
    initialNamespaces: ["common", "auth", "billing", "inactivity", "leave", "shell", "signup"],
  });
  const authClient = new AuthClient({
    apiBaseUrl,
    clientId: "clubs-app",
    identityBaseUrl,
    mockMode: mockEnabled,
    ...(mockEnabled ? { mockRefreshTokenStore: new MemoryRefreshTokenStore() } : {}),
  });
  const apiClient = createAuthenticatedApiClient(authClient, {
    baseUrl: apiBaseUrl,
    getLocale: () => i18n.resolvedLanguage ?? branding.defaultLocale,
  });
  const publicApiClient = createApiClient({
    baseUrl: apiBaseUrl,
    credentials: "omit",
    getLocale: () => i18n.resolvedLanguage ?? branding.defaultLocale,
  });
  createRoot(root).render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <BrandingProvider branding={branding}>
          <SessionProvider client={authClient}>
            <App apiClient={apiClient} authClient={authClient} publicApiClient={publicApiClient} />
          </SessionProvider>
        </BrandingProvider>
      </I18nextProvider>
    </StrictMode>,
  );
}

void bootstrap(rootElement);
