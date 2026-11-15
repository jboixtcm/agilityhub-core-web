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

const branding: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetSettingsState();
});
afterAll(() => {
  server.close();
});

// The real core serialises a module-less parameter as `module: null` instead of omitting it.
const nullModuleFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const request = input instanceof Request ? input : new Request(input, init);
  if (request.method !== "GET" || !new URL(request.url).pathname.endsWith("/parameters"))
    return response;
  const body = (await response.json()) as { blocks: { rows: { module?: string | null }[] }[] };
  for (const block of body.blocks) {
    for (const row of block.rows) row.module ??= null;
  }
  return Response.json(body, { status: response.status });
};

describe("T-02-13 D11 parameter rows", () => {
  it("keeps module-less parameters that the core sends with module null", async () => {
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
              fetch: nullModuleFetch,
            })}
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
      if (request.method !== "GET" || !new URL(request.url).pathname.endsWith("/parameters"))
        return response;
      const body = (await response.json()) as {
        blocks: { key: string; rows: Record<string, unknown>[]; title?: string }[];
      };
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
              fetch: learnInSystem,
            })}
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
    if (!(card instanceof HTMLElement))
      throw new TypeError("Missing the «Alta i consentiments» card");
    expect(within(card).getByRole("button", { name: "Ajornaments de la política3" })).toBeVisible();
    // The fields with the labels of «Completa el teu perfil» (S01 §14), never the stored JSON.
    expect(
      within(card).getByRole("button", {
        name: "Camps per completar el perfilNom (obligatori) · Idioma (obligatori) · Telèfon",
      }),
    ).toBeVisible();
    // No learn row, labelled or raw, in any block (the modules card keeps its «Enllaç a Learn»).
    const rows = [...document.querySelectorAll(".settings-parameter")].map(
      (row) => row.textContent,
    );
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.filter((row) => /Learn|learn\./u.test(row))).toEqual([]);
  });

  it("SEPA-04 (c) (decision of 13 Nov 2026): «Quotes, packs i remesa» shows billing.sepa.settlementBusinessDays with its label, help and value", async () => {
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
            client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
            levels={[]}
            modules={branding.modules}
            onModulesChange={() => undefined}
            plans={[]}
          />
        </BrandingProvider>
      </I18nextProvider>,
    );

    const heading = await screen.findByRole("heading", { name: "Quotes, packs i remesa" });
    const card = heading.closest(".settings-card");
    if (!(card instanceof HTMLElement))
      throw new TypeError("Missing the «Quotes, packs i remesa» card");
    const row = within(card).getByRole("button", {
      name: "Marge per donar la remesa per cobrada5",
    });
    expect(row).toBeVisible();
    fireEvent.click(row);
    expect(
      await screen.findByText(
        "Dies hàbils bancaris (TARGET) que han de passar després de la data de cobrament perquè els rebuts d'una remesa enviada es donin per cobrats, si no s'han marcat com a impagats; amb 0, el mateix dia de cobrament.",
      ),
    ).toBeVisible();
  });
});

describe("SEPA-10 (decision of 13 Nov 2026): D11 «Quotes, packs i remesa»", () => {
  it("shows billing.totalDifferenceConfirmPercent with its label, help and value (0–100)", async () => {
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
            client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
            levels={[]}
            modules={branding.modules}
            onModulesChange={() => undefined}
            plans={[]}
          />
        </BrandingProvider>
      </I18nextProvider>,
    );

    const heading = await screen.findByRole("heading", { name: "Quotes, packs i remesa" });
    const card = heading.closest(".settings-card");
    if (!(card instanceof HTMLElement))
      throw new TypeError("Missing the «Quotes, packs i remesa» card");
    const row = within(card).getByRole("button", {
      name: "Diferència per demanar una segona confirmació20",
    });
    fireEvent.click(row);
    expect(
      await screen.findByText(
        "Si el total del mes canvia més d'aquest percentatge respecte del mes anterior, generar els rebuts demana una segona confirmació; amb 0, qualsevol diferència la demana.",
      ),
    ).toBeVisible();
    const field = await screen.findByRole("spinbutton", {
      name: "Diferència per demanar una segona confirmació",
    });
    expect(field).toHaveAttribute("min", "0");
    expect(field).toHaveAttribute("max", "100");
  });
});

describe("COMM-06 (decision of 13 Nov 2026): D11 «Comunicacions» SMS quiet hours", () => {
  async function renderSettings(language: string, modules: string[]) {
    const i18n = await createI18n({
      branding: { ...branding, locales: ["ca", "es", "en"] },
      browserLanguages: [language],
      initialNamespaces: ["admin-settings"],
      storage: undefined,
    });
    render(
      <I18nextProvider i18n={i18n}>
        <BrandingProvider branding={branding}>
          <ParameterSettings
            client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
            levels={[]}
            modules={modules}
            onModulesChange={() => undefined}
            plans={[]}
          />
        </BrandingProvider>
      </I18nextProvider>,
    );
  }

  async function messagingCard(title: string): Promise<HTMLElement> {
    const heading = await screen.findByRole("heading", { name: title });
    const card = heading.closest(".settings-card");
    if (!(card instanceof HTMLElement)) throw new TypeError(`Missing the «${title}» card`);
    return card;
  }

  it("shows messaging.sms.quietHoursStart and quietHoursEnd beside the SMS cap, with their help and the time input", async () => {
    await renderSettings("ca", branding.modules);
    const card = await messagingCard("Comunicacions");
    const rows = [...card.querySelectorAll(".settings-parameter__main span")].map(
      (label) => label.textContent,
    );
    expect(rows.slice(rows.indexOf("Límit mensual d'SMS"))).toEqual([
      "Límit mensual d'SMS",
      "Inici de les hores sense SMS",
      "Final de les hores sense SMS",
    ]);
    expect(
      within(card).getByRole("button", { name: "Final de les hores sense SMS08:00" }),
    ).toBeVisible();

    fireEvent.click(
      within(card).getByRole("button", { name: "Inici de les hores sense SMS22:00" }),
    );
    const drawer = await screen.findByRole("dialog", { name: "Inici de les hores sense SMS" });
    expect(
      within(drawer).getByText(
        "A partir d'aquesta hora (hora del club) els SMS no urgents esperen fins al final de la franja; una oferta de plaça amb termini no espera. Igual que el final: sense franja.",
      ),
    ).toBeVisible();
    const field = within(drawer).getByLabelText("Inici de les hores sense SMS");
    expect(field).toHaveAttribute("type", "time");
    expect(field).toHaveValue("22:00");
  });

  it("labels both rows in es and en", async () => {
    for (const [language, title, start, end] of [
      ["es", "Comunicaciones", "Inicio de las horas sin SMS", "Final de las horas sin SMS"],
      ["en", "Communications", "Start of the no-SMS hours", "End of the no-SMS hours"],
    ] as const) {
      await renderSettings(language, branding.modules);
      const card = await messagingCard(title);
      expect(within(card).getByRole("button", { name: `${start}22:00` })).toBeVisible();
      expect(within(card).getByRole("button", { name: `${end}08:00` })).toBeVisible();
      cleanup();
    }
  });

  it("shows neither row while the SMS module is off, like the SMS cap", async () => {
    await renderSettings(
      "ca",
      branding.modules.filter((module) => module !== "SMS"),
    );
    const card = await messagingCard("Comunicacions");
    expect(within(card).queryByText("Límit mensual d'SMS")).toBeNull();
    expect(within(card).queryByText("Inici de les hores sense SMS")).toBeNull();
    expect(within(card).queryByText("Final de les hores sense SMS")).toBeNull();
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

describe("PRIV-02 (owner decision of 13 Nov 2026) · D11 «Privacitat i auditoria»: the retention floors of the catalogue", () => {
  it.each([
    ["Conservació de l'auditoria", 6],
    ["Conservació després de la baixa", 1],
    ["Espera mínima abans de l'esborrat", 30],
  ])(
    "«%s» takes the floor %i as its minimum: below it the field is invalid, at it valid",
    async (label, floor) => {
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
              client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
              levels={[]}
              modules={branding.modules}
              onModulesChange={() => undefined}
              plans={[]}
            />
          </BrandingProvider>
        </I18nextProvider>,
      );

      fireEvent.click(await screen.findByRole("button", { name: `Edita ${label}` }));
      const drawer = screen.getByRole("dialog", { name: label });
      const input = within(drawer).getByRole("spinbutton");
      if (!(input instanceof HTMLInputElement)) throw new TypeError("No number field");
      expect(input).toHaveAttribute("min", String(floor));
      fireEvent.change(input, { target: { value: String(floor - 1) } });
      expect(input.validity.rangeUnderflow).toBe(true);
      fireEvent.change(input, { target: { value: String(floor) } });
      expect(input.validity.valid).toBe(true);
    },
  );
});
