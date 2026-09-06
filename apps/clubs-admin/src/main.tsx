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
  if (import.meta.env.VITE_MOCK === "1") {
    const { startMockWorker } = await import("@agilityhub/api-client/mocks/browser");
    await startMockWorker();
  }

  const apiBaseUrl =
    import.meta.env.VITE_API_BASE_URL ?? new URL("/api/v1", window.location.origin).href;
  const identityBaseUrl = import.meta.env.VITE_IDENTITY_BASE_URL ?? window.location.origin;
  const source = await refreshBranding(
    createApiClient({ baseUrl: apiBaseUrl }),
    window.location.host,
  );
  const branding = normalizeBranding(source);
  applyBrandingTheme(branding.theme);
  document.title = branding.club.name;
  const i18n = await createI18n({
    branding,
    initialNamespaces: ["common", "auth", "census", "errors", "shell"],
  });
  const authClient = new AuthClient({
    apiBaseUrl,
    clientId: "clubs-admin",
    identityBaseUrl,
  });

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
