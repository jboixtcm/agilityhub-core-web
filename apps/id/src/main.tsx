import { AuthClient, MemoryRefreshTokenStore, SessionProvider } from "@agilityhub/auth";
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

  const apiBaseUrl = env.VITE_API_BASE_URL ?? "/api/v1";
  const identityBaseUrl = env.VITE_IDENTITY_BASE_URL ?? "";
  const i18n = await createI18n({
    branding: { defaultLocale: "ca", locales: ["ca", "es", "en"] },
    initialNamespaces: ["common", "errors", "id"],
  });
  const authClient = new AuthClient({
    apiBaseUrl,
    clientId: "id-web",
    identityBaseUrl,
    mockMode: mockEnabled,
    ...(mockEnabled ? { mockRefreshTokenStore: new MemoryRefreshTokenStore() } : {}),
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
