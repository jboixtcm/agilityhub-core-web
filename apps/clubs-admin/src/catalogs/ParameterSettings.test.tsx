import { createApiClient } from "@agilityhub/api-client";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ParameterSettings } from "./ParameterSettings";

const branding: Branding = { ...brandingCanicFixture, theme: { ...brandingCanicFixture.theme, mode: "dark" } };

beforeAll(() => { server.listen({ onUnhandledRequest: "error" }); });
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => { server.close(); });

// The real core serialises a module-less parameter as `module: null` instead of omitting it.
const nullModuleFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const request = input instanceof Request ? input : new Request(input, init);
  if (request.method !== "GET" || !new URL(request.url).pathname.endsWith("/parameters")) return response;
  const body = (await response.json()) as { blocks: { rows: { module?: string | null }[] }[] };
  for (const block of body.blocks) {
    for (const row of block.rows) row.module ??= null;
  }
  return Response.json(body, { status: response.status });
};

describe("T-02-13 D11 parameter rows", () => {
  it("keeps module-less parameters that the core sends with module null", async () => {
    const i18n = await createI18n({ branding, browserLanguages: ["ca"], initialNamespaces: ["admin-settings"], storage: undefined });
    render(
      <I18nextProvider i18n={i18n}>
        <BrandingProvider branding={branding}>
          <ParameterSettings
            client={createApiClient({ baseUrl: `${window.location.origin}/api/v1`, fetch: nullModuleFetch })}
            levels={[]}
            modules={branding.modules}
            onModulesChange={() => undefined}
            plans={[]}
          />
        </BrandingProvider>
      </I18nextProvider>,
    );

    expect(await screen.findByText("Altes públiques")).toBeVisible();
    expect(screen.getByText("Llindar d'anul·lació tardana («classe feta»)")).toBeVisible();
  });
});
