import { createApiClient } from "@agilityhub/api-client";
import { resetSettingsState } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ParameterSettings } from "./ParameterSettings";

const branding: Branding = { ...brandingCanicFixture, theme: { ...brandingCanicFixture.theme, mode: "dark" } };

beforeAll(() => { server.listen({ onUnhandledRequest: "error" }); });
afterEach(() => { cleanup(); server.resetHandlers(); resetSettingsState(); });
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

describe("T-02-13 D11 «Restableix el valor de producte» (WEB-06, decision of 13 Nov 2026)", () => {
  const key = "bookings.lateCancelThresholdMinutes";
  const label = "Llindar d'anul·lació tardana («classe feta»)";

  /**
   * The mock club with `key` customised to 120 min (product value 240) until a DELETE resets it,
   * and every request it sees.
   */
  function customisedFetch() {
    const requests: { method: string; path: string }[] = [];
    let reset = false;
    const fetchOverride: typeof fetch = async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const path = new URL(request.url).pathname;
      requests.push({ method: request.method, path });
      const response = await fetch(input, init);
      if (request.method === "DELETE" && response.ok) reset = true;
      if (request.method !== "GET" || !path.endsWith("/parameters") || reset) return response;
      const body = (await response.json()) as {
        blocks: {
          rows: { default: unknown; isOverride: boolean; key: string; value: unknown }[];
        }[];
      };
      for (const row of body.blocks.flatMap((block) => block.rows)) {
        if (row.key === key) {
          row.default = 240;
          row.isOverride = true;
          row.value = 120;
        }
      }
      return Response.json(body, { status: response.status });
    };
    return { fetchOverride, requests };
  }

  async function renderSettings(fetchOverride?: typeof fetch) {
    const i18n = await createI18n({
      branding,
      browserLanguages: ["ca"],
      initialNamespaces: ["admin-settings"],
      storage: undefined,
    });
    render(
      <I18nextProvider i18n={i18n}>
        <BrandingProvider branding={branding}>
          <ParameterSettings
            client={createApiClient({
              baseUrl: `${window.location.origin}/api/v1`,
              ...(fetchOverride === undefined ? {} : { fetch: fetchOverride }),
            })}
            levels={[]}
            modules={branding.modules}
            onModulesChange={() => undefined}
            plans={[]}
          />
        </BrandingProvider>
      </I18nextProvider>,
    );
  }

  async function openEditor(): Promise<HTMLElement> {
    fireEvent.click(await screen.findByRole("button", { name: `Edita ${label}` }));
    return screen.getByRole("dialog", { name: label });
  }

  it("shows no reset for a parameter the club has not customised", async () => {
    await renderSettings();
    const drawer = await openEditor();

    expect(within(drawer).getByRole("button", { name: "DESA" })).toBeVisible();
    expect(
      within(drawer).queryByRole("button", { name: "Restableix el valor de producte" }),
    ).toBeNull();
  });

  it("asks before resetting, showing «current → product value»; Cancel sends nothing", async () => {
    const { fetchOverride, requests } = customisedFetch();
    await renderSettings(fetchOverride);
    expect(await screen.findByRole("button", { name: `${label}2 h abans` })).toBeVisible();
    const drawer = await openEditor();

    fireEvent.click(
      within(drawer).getByRole("button", { name: "Restableix el valor de producte" }),
    );
    const confirmation = screen.getByRole("dialog", { name: "Restableix el valor de producte" });
    expect(confirmation).toHaveTextContent(
      "Aquest paràmetre tornarà al valor de producte. S'aplica a partir d'ara.",
    );
    expect(confirmation).toHaveTextContent(
      "Valor actual: 2 h abans → valor de producte: 4 h abans",
    );
    expect(requests.filter((request) => request.method === "DELETE")).toEqual([]);

    fireEvent.click(within(confirmation).getByRole("button", { name: "Cancel·la" }));
    expect(screen.queryByRole("dialog", { name: "Restableix el valor de producte" })).toBeNull();
    expect(screen.getByRole("dialog", { name: label })).toBeVisible();
    expect(requests.filter((request) => request.method === "DELETE")).toEqual([]);
  });

  it("resets on the confirmation's button: one DELETE, the drawer closes and the row shows the product value", async () => {
    const { fetchOverride, requests } = customisedFetch();
    await renderSettings(fetchOverride);
    const drawer = await openEditor();
    fireEvent.click(
      within(drawer).getByRole("button", { name: "Restableix el valor de producte" }),
    );
    const confirmation = screen.getByRole("dialog", { name: "Restableix el valor de producte" });

    fireEvent.click(
      within(confirmation).getByRole("button", { name: "Restableix el valor de producte" }),
    );

    expect(await screen.findByRole("button", { name: `${label}4 h abans` })).toBeVisible();
    expect(screen.queryByRole("dialog", { name: label })).toBeNull();
    expect(requests.filter((request) => request.method === "DELETE")).toEqual([
      { method: "DELETE", path: `/api/v1/parameters/${key}` },
    ]);
  });

  it("keeps the confirmation open with the api's error when the reset fails", async () => {
    server.use(
      http.delete("*/api/v1/parameters/:key", () =>
        HttpResponse.json(
          { code: "MODULE_DISABLED", details: {}, message: "Module disabled", traceId: "test" },
          { status: 404 },
        ),
      ),
    );
    const { fetchOverride } = customisedFetch();
    await renderSettings(fetchOverride);
    const drawer = await openEditor();
    fireEvent.click(
      within(drawer).getByRole("button", { name: "Restableix el valor de producte" }),
    );
    const confirmation = screen.getByRole("dialog", { name: "Restableix el valor de producte" });

    fireEvent.click(
      within(confirmation).getByRole("button", { name: "Restableix el valor de producte" }),
    );

    expect(await within(confirmation).findByRole("alert")).toHaveTextContent(
      "Aquest mòdul està desactivat.",
    );
    expect(screen.getByRole("dialog", { name: "Restableix el valor de producte" })).toBeVisible();
    expect(screen.getByRole("dialog", { name: label })).toBeVisible();
  });
});
