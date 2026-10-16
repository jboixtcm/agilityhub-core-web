import { createApiClient } from "@agilityhub/api-client";
import { currentMockScenario, mockScenario, type MockScenario } from "@agilityhub/api-client/mocks";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { render } from "@testing-library/react";
import { useState } from "react";
import { I18nextProvider } from "react-i18next";

import ConsolePage from "./ConsolePage";

export const API_BASE = `${window.location.origin}/api/v1`;

export interface CapturedRequest {
  body: unknown;
  headers: Headers;
  method: string;
  url: URL;
}

/**
 * The console's requests as the api receives them (method, url, headers and JSON body), for the
 * assertions on what a write sends. Call before the action; read after it.
 */
export function captureRequests(match: (method: string, url: URL) => boolean): CapturedRequest[] {
  const captured: CapturedRequest[] = [];
  server.events.on("request:start", ({ request }) => {
    const url = new URL(request.url);
    if (!match(request.method, url)) return;
    const entry: CapturedRequest = {
      body: undefined,
      headers: request.headers,
      method: request.method,
      url,
    };
    captured.push(entry);
    void request
      .clone()
      .text()
      .then((text) => {
        try {
          entry.body = text === "" ? undefined : (JSON.parse(text) as unknown);
        } catch {
          entry.body = text;
        }
      });
  });
  return captured;
}

/**
 * D19 rendered as the app routes it (`/consola/clubs…`), on the product host's branding, with the
 * app's in-app navigation (history + state), signed in as the `platform` scenario's account.
 */
export async function renderConsole(
  path: string,
  {
    locale = "ca",
    scenario = "platform",
  }: { locale?: "ca" | "en" | "es"; scenario?: MockScenario } = {},
) {
  mockScenario(scenario);
  window.history.pushState(null, "", path);
  const branding = {
    ...(currentMockScenario().branding as unknown as Branding),
    locales: ["ca", "es", "en"],
  };
  const i18n = await createI18n({
    branding,
    browserLanguages: [locale],
    initialNamespaces: [
      "admin-audit",
      "admin-catalogs",
      "admin-settings",
      "auth",
      "census",
      "common",
      "console",
      "enums",
      "errors",
    ],
    storage: undefined,
  });
  const client = createApiClient({ baseUrl: API_BASE, getLocale: () => locale });
  const navigations: string[] = [];

  function Harness() {
    const [location, setLocation] = useState(path);
    const url = new URL(location, window.location.origin);
    return (
      <ConsolePage
        client={client}
        onNavigate={(next) => {
          navigations.push(next);
          window.history.pushState(null, "", next);
          setLocation(next);
        }}
        pathname={url.pathname}
        search={url.search}
      />
    );
  }

  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <Harness />
      </BrandingProvider>
    </I18nextProvider>,
  );
  return { client, i18n, navigations };
}
