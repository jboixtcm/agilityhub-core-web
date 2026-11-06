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

async function renderPlans(club: Branding = branding) {
  const i18n = await createI18n({
    branding: club,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-catalogs", "errors"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={club}>
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
  server.use(
    http.get("*/api/v1/plans", () => HttpResponse.json({ ...data, items })),
    http.get("*/api/v1/plans/:id", ({ params }) =>
      HttpResponse.json(items.find((item) => item.id === params.id)),
    ),
  );
}

async function openPriceForm(name: string) {
  const table = await screen.findByRole("table", { name: "Modalitats i tarifes" });
  fireEvent.click(await within(table).findByRole("button", { name: `Edita ${name}` }));
  const dialog = await screen.findByRole("dialog", { name: `Edita ${name}` });
  return { dialog, tax: within(dialog).getByLabelText("Impost (%)") };
}

describe("E11-W05 step 1 (INC-41 #7): D8's prices through the minor-units helper — no visible change for EUR", () => {
  const row = async (name: string) => {
    const table = await screen.findByRole("table", { name: "Modalitats i tarifes" });
    const cell = await within(table).findByText(name);
    const tr = cell.closest("tr");
    if (tr === null) throw new TypeError(`No row for ${name}`);
    return tr.textContent.replace(/\s+/gu, " ");
  };

  it("E11-W05 step 1: «Abonat» reads «60 €/mes + entrada 100 €» as before, and a price with cents keeps them («60,50 €/mes»)", async () => {
    await renderPlans();
    expect(await row("Abonat")).toContain("60 €/mes + entrada 100 €");
    cleanup();

    server.resetHandlers();
    await servePlans("Abonat", (plan) => ({
      ...plan,
      currentPrices: (plan.currentPrices ?? []).map((price) => ({
        ...price,
        amount: { amountMinor: 6050, currency: "EUR" },
      })),
    }));
    await renderPlans();
    expect(await row("Abonat")).toContain("60,50 €/mes + entrada 100 €");
  });

  it("E11-W05 step 1: a club whose currency has no cents (JPY) reads its price undivided («6.000 ¥/mes», never «60,00 ¥»)", async () => {
    await servePlans("Abonat", (plan) => ({
      ...plan,
      currentPrices: (plan.currentPrices ?? []).map((price) => ({
        ...price,
        amount: { amountMinor: 6000, currency: "JPY" },
      })),
      entryFee: { mode: "NONE" },
    }));
    await renderPlans({ ...branding, currency: "JPY" });
    expect(await row("Abonat")).toContain("6.000 ¥/mes");
  });
});

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

describe("Josep feedback: complete price history", () => {
  it("loads scheduled prices from the detail and edits the selected unlocked price", async () => {
    let sent: unknown;
    await servePlans("Abonat", (plan) => ({
      ...plan,
      prices: [
        {
          id: "future-price",
          planId: plan.id,
          concept: "MONTHLY_FEE",
          amount: { amountMinor: 5000, currency: "EUR" },
          taxPercent: 0,
          validFrom: "2026-12-01",
          periodicity: "MONTHLY",
          locked: false,
          version: 3,
          status: "SCHEDULED",
        },
      ],
    }));
    server.use(
      http.patch("*/api/v1/prices/:id", async ({ request, params }) => {
        sent = { id: params.id, body: await request.json() };
        return HttpResponse.json({});
      }),
    );
    await renderPlans();
    const { dialog } = await openPriceForm("Abonat");
    expect(within(dialog).getByText("2026-12-01")).toBeVisible();
    expect(within(dialog).queryByText("Encara no hi ha preus.")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Edita" }));
    const input = within(dialog).getByLabelText("Import");
    expect(input).toHaveValue(50);
    fireEvent.change(input, { target: { value: "55" } });
    const form = input.closest("form");
    if (form === null) throw new Error("Missing price form");
    fireEvent.submit(form);
    await waitFor(() => {
      expect(sent).toEqual({
        id: "future-price",
        body: {
          amount: { amountMinor: 5500, currency: "EUR" },
          taxPercent: 0,
          validFrom: "2026-12-01",
          validTo: null,
          version: 3,
        },
      });
    });
  });
});

describe("Josep feedback: plan conditions", () => {
  it("highlights missing signup conditions and allows an internal plan to omit them", async () => {
    let sent: Record<string, unknown> | undefined;
    server.use(
      http.patch("*/api/v1/plans/:id", async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({});
      }),
    );
    await renderPlans();
    const { dialog } = await openPriceForm("Abonat");
    const conditions = within(dialog).getByLabelText("Condicions");
    fireEvent.change(conditions, { target: { value: "" } });
    const form = conditions.closest("form");
    if (form === null) throw new Error("Missing plan form");
    fireEvent.submit(form);
    expect(
      await within(dialog).findByText(
        "Cal informar les condicions per mostrar la modalitat a l’alta.",
      ),
    ).toBeVisible();
    expect(conditions).toHaveAttribute("aria-invalid", "true");
    expect(sent).toBeUndefined();
    fireEvent.click(within(dialog).getByRole("switch", { name: "Mostra a l'alta" }));
    fireEvent.submit(form);
    await waitFor(() => {
      expect(sent).toMatchObject({ showOnSignup: false });
    });
  });
});

describe("T-05 feedback 3: price and plan removal", () => {
  it("requires confirmation before deleting an unused past price", async () => {
    let deleted: unknown;
    await servePlans("Abonat", (plan) => ({
      ...plan,
      prices: [
        {
          id: "past-price",
          planId: plan.id,
          concept: "MONTHLY_FEE",
          amount: { amountMinor: 1000, currency: "EUR" },
          taxPercent: 0,
          validFrom: "2020-01-01",
          validTo: "2020-12-31",
          periodicity: "MONTHLY",
          locked: false,
          version: 0,
          status: "EXPIRED",
        },
      ],
    }));
    server.use(
      http.delete("*/api/v1/prices/:id", ({ params }) => {
        deleted = params.id;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await renderPlans();
    const { dialog } = await openPriceForm("Abonat");
    fireEvent.click(within(dialog).getByRole("button", { name: "Elimina" }));
    expect(deleted).toBeUndefined();
    let confirmation = within(dialog).getByRole("group", { name: "Confirma l’eliminació" });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Cancel·la" }));
    expect(deleted).toBeUndefined();
    fireEvent.click(within(dialog).getByRole("button", { name: "Elimina" }));
    confirmation = within(dialog).getByRole("group", { name: "Confirma l’eliminació" });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Elimina" }));
    await waitFor(() => {
      expect(deleted).toBe("past-price");
    });
  });

  it("explains billed prices and allows only closing their validity", async () => {
    await servePlans("Abonat", (plan) => ({
      ...plan,
      prices: [
        {
          id: "billed-price",
          planId: plan.id,
          concept: "MONTHLY_FEE",
          amount: { amountMinor: 1000, currency: "EUR" },
          taxPercent: 0,
          validFrom: "2020-01-01",
          periodicity: "MONTHLY",
          locked: true,
          version: 0,
          status: "CURRENT",
        },
      ],
    }));
    await renderPlans();
    const { dialog } = await openPriceForm("Abonat");
    expect(within(dialog).getByRole("button", { name: "Elimina" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Edita" }));
    expect(within(dialog).getByLabelText("Import")).toBeDisabled();
    expect(within(dialog).getByLabelText("Data d'inici")).toBeDisabled();
    expect(within(dialog).getByLabelText("Data de fi")).toBeEnabled();
  });

  it("offers deactivation when an in-use plan cannot be deleted", async () => {
    let sent: unknown;
    server.use(
      http.delete("*/api/v1/plans/:id", () =>
        HttpResponse.json(
          { code: "PLAN_IN_USE", message: "In use", details: {}, traceId: "test" },
          { status: 409 },
        ),
      ),
      http.patch("*/api/v1/plans/:id", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({});
      }),
    );
    await renderPlans();
    const { dialog } = await openPriceForm("Abonat");
    fireEvent.click(within(dialog).getByRole("button", { name: "Elimina la modalitat" }));
    const confirmation = within(dialog).getByRole("group", { name: "Confirma l’eliminació" });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Elimina" }));
    fireEvent.click(await within(confirmation).findByRole("button", { name: "Desactiva" }));
    await waitFor(() => {
      expect(sent).toMatchObject({ active: false });
    });
  });
});
