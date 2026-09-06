import { createApiClient, normalizeBranding, refreshBranding } from "@agilityhub/api-client";
import { AuthClient, SessionProvider } from "@agilityhub/auth";
import { createI18n } from "@agilityhub/i18n";
import { applyBrandingTheme, BrandingProvider } from "@agilityhub/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";

import { App } from "./App";
import "./styles.css";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Root element was not found");
}

async function bootstrap(root: HTMLElement) {
  const env = (
    import.meta as unknown as {
      readonly env: Record<string, string | undefined>;
    }
  ).env;
  const mockEnabled = env.VITE_MOCK === "1";
  if (mockEnabled) {
    const { startMockWorker } = await import("@agilityhub/api-client/mocks/browser");
    await startMockWorker();
  }

  const apiBaseUrl = env.VITE_API_BASE_URL ?? new URL("/api/v1", window.location.origin).href;
  const identityBaseUrl =
    env.VITE_IDENTITY_BASE_URL ?? (mockEnabled ? window.location.origin : undefined);
  const source = await refreshBranding(
    createApiClient({ baseUrl: apiBaseUrl }),
    window.location.host,
  );
  const branding = normalizeBranding(source);
  applyBrandingTheme(branding.theme);
  document.title = branding.club.name;
  const i18n = await createI18n({ branding, initialNamespaces: ["common", "auth", "shell"] });
  const authClient = new AuthClient({
    apiBaseUrl,
    clientId: "clubs-app",
    ...(identityBaseUrl === undefined ? {} : { identityBaseUrl }),
  });
  if (window.location.hash.startsWith("#impersonation=")) {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("impersonation");
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    if (token !== null && token !== "") {
      await authClient.acceptImpersonation(token);
    }
  }

  createRoot(root).render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <BrandingProvider branding={branding}>
          <SessionProvider client={authClient}>
            <App authClient={authClient} />
          </SessionProvider>
        </BrandingProvider>
      </I18nextProvider>
    </StrictMode>,
  );
}

void bootstrap(rootElement);
