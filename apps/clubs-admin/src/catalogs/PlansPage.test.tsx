import { type components, createApiClient } from "@agilityhub/api-client";
import { mockScenario, resetCatalogState } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { PlansPage } from "./PlansPage";

type Plan = components["schemas"]["Plan"];

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
  resetCatalogState();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

function client() {
  return createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
}

async function renderPlans() {
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-catalogs", "errors"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <PlansPage client={client()} />
      </BrandingProvider>
    </I18nextProvider>,
  );
}

/** The mock's plans, with `edit` applied to the one named `name` (as the api would store it). */
async function servePlans(name: string, edit: (plan: Plan) => Plan) {
  const { data } = await client().GET("/plans", { params: { query: { includeInactive: true } } });
  if (data === undefined) throw new TypeError("The mock plans did not answer");
  // As PlansPage reads them (`GET /plans` with `includeInactive`: whole plans).
  const items = (data.items as Plan[]).map((plan) => (plan.name === name ? edit(plan) : plan));
  server.use(http.get("*/api/v1/plans", () => HttpResponse.json({ ...data, items })));
}

async function openPriceForm(name: string) {
  const table = await screen.findByRole("table", { name: "Modalitats i tarifes" });
  fireEvent.click(await within(table).findByRole("button", { name: `Edita ${name}` }));
  const dialog = screen.getByRole("dialog", { name: `Edita ${name}` });
  return { dialog, tax: within(dialog).getByLabelText("Impost (%)") };
}

describe("E4-W16 step 8 (INC-28, S05 §12, §13-5): D8 «Nou preu» proposes the plan's tax, never a country constant", () => {
  it("proposes the current price's taxPercent — 0 at a club without VAT — and sends the value shown", async () => {
    let sent: unknown;
    server.use(
      http.post("*/api/v1/prices", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(
          { code: "PRICE_OVERLAP", details: {}, message: "Overlap", traceId: "t" },
          { status: 409 },
        );
      }),
    );
    await renderPlans();
    const { dialog, tax } = await openPriceForm("Abonat");

    expect(tax).toHaveValue(0);
    fireEvent.change(within(dialog).getByLabelText("Import"), { target: { value: "65" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Afegeix el preu" }));
    await waitFor(() => {
      expect(sent).toMatchObject({ amount: { amountMinor: 6500 }, taxPercent: 0 });
    });
  });

  it("a plan whose current price carries 10 % proposes 10, and a plan without prices proposes 0", async () => {
    await servePlans("Abonat", (plan) => ({
      ...plan,
      currentPrices: (plan.currentPrices ?? []).map((price) => ({ ...price, taxPercent: 10 })),
    }));
    await renderPlans();
    expect((await openPriceForm("Abonat")).tax).toHaveValue(10);
    cleanup();

    server.resetHandlers();
    await servePlans("Abonat", (plan) => ({ ...plan, currentPrices: [], prices: [] }));
    await renderPlans();
    expect((await openPriceForm("Abonat")).tax).toHaveValue(0);
  });
});
