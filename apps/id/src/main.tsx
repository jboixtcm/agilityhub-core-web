import { AuthClient, SessionProvider } from "@agilityhub/auth";
import { createI18n } from "@agilityhub/i18n";
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

  const apiBaseUrl = new URL("/api/v1", window.location.origin).href;
  const i18n = await createI18n({
    branding: { defaultLocale: "ca", locales: ["ca", "es", "en"] },
    initialNamespaces: ["common", "errors", "id"],
  });
  const authClient = new AuthClient({
    apiBaseUrl,
    authBaseUrl: window.location.origin,
    clientId: "id-web",
    revokeEndpoint: new URL("/oauth2/revoke", window.location.origin).href,
    tokenEndpoint: new URL("/oauth2/token", window.location.origin).href,
  });

  createRoot(root).render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <SessionProvider client={authClient}>
          <App authClient={authClient} />
        </SessionProvider>
      </I18nextProvider>
    </StrictMode>,
  );
}

void bootstrap(rootElement);
