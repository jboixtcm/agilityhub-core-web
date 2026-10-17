import {
  BRANDING_BOOT_TIMEOUT_MS,
  createApiClient,
  createBuildEventsSubscriber,
  normalizeBranding,
  readCachedBranding,
  refreshBranding,
} from "@agilityhub/api-client";
import {
  AuthClient,
  createAuthenticatedApiClient,
  MemoryRefreshTokenStore,
  SessionProvider,
} from "@agilityhub/auth";
import { type ClubsNamespace, createClubsI18n, preloadClubsI18n } from "@agilityhub/i18n/clubs";
import { applyBrandingTheme, BrandingProvider } from "@agilityhub/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";

import { App } from "./App";
import { BOOT_FAILURE_BRANDING, BootFailurePage } from "./BootFailurePage";
import { configureBuildEvents } from "./courses/live-events";
import { setPushRegistration } from "./notifications/push";
import "./styles.css";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Root element was not found");
}

/** Only the students' namespaces are loadable here: no `admin-*` locale chunk in this build. */
const BOOT_NAMESPACES: readonly ClubsNamespace[] = [
  "common",
  "auth",
  "billing",
  "inactivity",
  "leave",
  "shell",
  "signup",
];

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
    // subscribes with (never `navigator.serviceWorker.ready`). Not awaited (E11-W02 step 6): the
    // boot does not wait for the worker's module before it asks for `/branding`.
    void import("virtual:pwa-register").then(({ registerSW }) => {
      registerSW({
        immediate: true,
        onRegisteredSW: (_url, registration) => {
          setPushRegistration(registration);
        },
      });
    });
  }

  const apiBaseUrl = env.VITE_API_BASE_URL ?? "/api/v1";
  const identityBaseUrl = env.VITE_IDENTITY_BASE_URL ?? "";
  // E11-W02 step 6: with a cached branding (the club's locales known), the locale chunks load while
  // `/branding` does, not after it. A first visit cannot know them: no guess, no extra chunks.
  const cached = readCachedBranding(window.location.host, localStorage);
  if (cached !== null) preloadClubsI18n(BOOT_NAMESPACES, { branding: cached });
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
  const i18n = await createClubsI18n({ branding, initialNamespaces: BOOT_NAMESPACES });
  const authClient = new AuthClient({
    apiBaseUrl,
    clientId: "clubs-app",
    identityBaseUrl,
    mockMode: mockEnabled,
    ...(mockEnabled ? { mockRefreshTokenStore: new MemoryRefreshTokenStore() } : {}),
  });
  // S16 R-16-11 (E9-W04): the build session's live events through the core's SSE stream, which
  // takes the access token as a query parameter (an EventSource sends no header). Mock mode has
  // no stream: the store polls `GET /build-sessions/{id}` instead (INC-60).
  if (!mockEnabled) {
    configureBuildEvents(
      createBuildEventsSubscriber({
        eventsUrl: (sessionId) =>
          `${apiBaseUrl}/build-sessions/${encodeURIComponent(sessionId)}/events`,
        getAccessToken: () => authClient.getAccessToken(),
      }),
    );
  }
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

/**
 * E11-W02 (INC-41): an app that cannot start (`/branding` failed and nothing is cached) says so,
 * in the product's theme, with a retry — never a blank page.
 */
async function showBootFailure(root: HTMLElement, cause: unknown) {
  console.error(cause);
  const i18n = await createClubsI18n({
    branding: BOOT_FAILURE_BRANDING,
    initialNamespaces: ["common"],
  });
  createRoot(root).render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <BootFailurePage />
      </I18nextProvider>
    </StrictMode>,
  );
}

bootstrap(rootElement).catch(async (cause: unknown) => {
  await showBootFailure(rootElement, cause);
});
