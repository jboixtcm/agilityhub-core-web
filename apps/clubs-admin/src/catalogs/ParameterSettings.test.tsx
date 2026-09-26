import { createApiClient } from "@agilityhub/api-client";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, render, screen, within } from "@testing-library/react";
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

  it("E4-W13 step 0 (api E5-T20): «Alta i consentiments» shows signup.onboardingFields and legal.maxPostpones; the learn keys, in the core's system block, show nowhere", async () => {
    // As the core sends them since E5-T20: the learn keys wait in the `system` block D11 never renders.
    const learnInSystem: typeof fetch = async (input, init) => {
      const response = await fetch(input, init);
      const request = input instanceof Request ? input : new Request(input, init);
      if (request.method !== "GET" || !new URL(request.url).pathname.endsWith("/parameters")) return response;
      const body = (await response.json()) as { blocks: { key: string; rows: Record<string, unknown>[]; title?: string }[] };
      const signup = body.blocks.find((block) => block.key === "signup")?.rows[0];
      body.blocks.push({
        key: "system",
        rows: ["learn.baseUrl", "learn.linkText", "learn.recommendationsTtlMinutes"].map((key) => ({
          ...signup,
          block: "system",
          editableBy: "PLATFORM",
          key,
          label: key,
          type: "string",
          value: key,
        })),
        title: "system",
      });
      return Response.json(body, { status: response.status });
    };
    const i18n = await createI18n({ branding, browserLanguages: ["ca"], initialNamespaces: ["admin-settings"], storage: undefined });
    render(
      <I18nextProvider i18n={i18n}>
        <BrandingProvider branding={branding}>
          <ParameterSettings
            client={createApiClient({ baseUrl: `${window.location.origin}/api/v1`, fetch: learnInSystem })}
            levels={[]}
            modules={branding.modules}
            onModulesChange={() => undefined}
            plans={[]}
          />
        </BrandingProvider>
      </I18nextProvider>,
    );

    const heading = await screen.findByRole("heading", { name: "Alta i consentiments" });
    const card = heading.closest(".settings-card");
    if (!(card instanceof HTMLElement)) throw new TypeError("Missing the «Alta i consentiments» card");
    expect(within(card).getByRole("button", { name: "Ajornaments de la política3" })).toBeVisible();
    // The fields with the labels of «Completa el teu perfil» (S01 §14), never the stored JSON.
    expect(
      within(card).getByRole("button", {
        name: "Camps per completar el perfilNom (obligatori) · Idioma (obligatori) · Telèfon",
      }),
    ).toBeVisible();
    // No learn row, labelled or raw, in any block (the modules card keeps its «Enllaç a Learn»).
    const rows = [...document.querySelectorAll(".settings-parameter")].map((row) => row.textContent);
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.filter((row) => /Learn|learn\./u.test(row))).toEqual([]);
  });
});
