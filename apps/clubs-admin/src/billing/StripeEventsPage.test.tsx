import { createApiClient } from "@agilityhub/api-client";
import {
  BILLING_MOCK_NOW,
  mockScenario,
  resetBillingMockState,
} from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BillingPage } from "./BillingPage";
import { StripeEventsPage } from "./StripeEventsPage";

const branding: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

const lists: URL[] = [];

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  server.events.on("request:start", ({ request }) => {
    const url = new URL(request.url);
    if (url.pathname === "/api/v1/billing/stripe-events") lists.push(url);
  });
});
beforeEach(() => {
  vi.useFakeTimers({ now: new Date(BILLING_MOCK_NOW), shouldAdvanceTime: true, toFake: ["Date"] });
  resetBillingMockState();
  mockScenario("admin");
  lists.length = 0;
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetBillingMockState();
  mockScenario("admin");
  window.history.replaceState(null, "", "/");
});
afterAll(() => {
  server.close();
});

function client() {
  return createApiClient({ baseUrl: `${window.location.origin}/api/v1`, getLocale: () => "ca" });
}

async function i18n() {
  return createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-billing", "census", "common", "enums", "errors"],
    storage: undefined,
  });
}

async function renderPage() {
  window.history.replaceState(null, "", "/facturacio/esdeveniments-stripe");
  const onNavigate = vi.fn();
  render(
    <I18nextProvider i18n={await i18n()}>
      <BrandingProvider branding={branding}>
        <StripeEventsPage client={client()} onNavigate={onNavigate} />
      </BrandingProvider>
    </I18nextProvider>,
  );
  await screen.findByRole("heading", { level: 1, name: "Esdeveniments Stripe fallits" });
  return { onNavigate };
}

async function rows() {
  const table = await screen.findByRole("table", {
    name: "Esdeveniments de Stripe que no s'han pogut processar",
  });
  return waitFor(() => {
    const found = within(table)
      .getAllByRole("row")
      .filter((row) => row.hasAttribute("data-stripe-event"));
    expect(found).toHaveLength(3);
    return found;
  });
}

function text(row: HTMLElement) {
  return within(row)
    .getAllByRole("cell")
    .map((cell) => cell.textContent.replace(/\s+/gu, " ").trim());
}

describe("PAY-02 «Esdeveniments Stripe fallits» (R-12-21, owner decision of 13 Nov 2026)", () => {
  it("lists the club's failed events newest first: id, type, received, attempts and «es tornarà a provar el …» or «aturat el …»; no filter, no search, no actions", async () => {
    const { onNavigate } = await renderPage();
    expect(
      screen.getByText(
        "Esdeveniments que Stripe ha enviat i que no s'han pogut processar. Es tornen a provar sols durant unes 24 hores; un esdeveniment aturat es torna a processar reenviant-lo des del tauler de Stripe.",
      ),
    ).toBeVisible();
    const [outage, retrying, stopped] = await rows();
    if (outage === undefined || retrying === undefined || stopped === undefined) {
      throw new TypeError("Three events expected");
    }
    expect(text(outage).slice(0, 4)).toEqual([
      "evt_mock_refund_outageCopia",
      "charge.refunded",
      "26/08/2026 09:55",
      "0",
    ]);
    expect(text(outage).at(4)).toBe("es tornarà a provar el 26/08/2026 10:05");
    expect(text(retrying).slice(1, 5)).toEqual([
      "checkout.session.completed",
      "26/08/2026 09:40",
      "3",
      "es tornarà a provar el 26/08/2026 10:25",
    ]);
    expect(text(stopped).slice(1, 5)).toEqual([
      "setup_intent.succeeded",
      "24/08/2026 11:12",
      "10",
      "aturat el 25/08/2026 11:03",
    ]);
    // The contract has no filter and no `q` (400 INVALID_FILTER): neither is offered or sent.
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(document.querySelector(".ah-universal-list__filter-menu")).toBeNull();
    const [first] = lists;
    expect(first?.searchParams.has("q")).toBe(false);
    expect(first?.searchParams.getAll("filter")).toEqual([]);
    expect(first?.searchParams.get("fields")).toBe(
      "id,type,receivedAt,attempts,nextAttemptAt,processedAt",
    );
    fireEvent.click(screen.getByRole("link", { name: "‹ Facturació" }));
    expect(onNavigate).toHaveBeenCalledWith("/facturacio");
  });

  it("copies an event's id, to find it in the Stripe dashboard", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await renderPage();
    const [, , stopped] = await rows();
    if (stopped === undefined) throw new TypeError("No stopped event");
    fireEvent.click(
      within(stopped).getByRole("button", {
        name: "Copia l'identificador evt_mock_setup_stopped",
      }),
    );
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("evt_mock_setup_stopped");
    });
    expect(await within(stopped).findByText("Copiat")).toBeVisible();
    expect(
      within(stopped).getByRole("button", {
        name: "Copiat l'identificador evt_mock_setup_stopped",
      }),
    ).toBeVisible();
  });

  it("sorts by received date through the column (`sort=receivedAt,asc`)", async () => {
    await renderPage();
    await rows();
    fireEvent.click(screen.getByRole("button", { name: /Rebut el/u }));
    await waitFor(() => {
      expect(lists.at(-1)?.searchParams.getAll("sort")).toEqual(["receivedAt,asc"]);
    });
    await waitFor(async () => {
      const [first] = await rows();
      expect(first?.getAttribute("data-stripe-event")).toBe("evt_mock_setup_stopped");
    });
  });

  it("an empty list says every event was processed; a failed read says so", async () => {
    server.use(
      http.get("*/api/v1/billing/stripe-events", () =>
        HttpResponse.json({
          appliedFilters: [],
          items: [],
          page: 0,
          size: 50,
          totalItems: 0,
          totalPages: 0,
        }),
      ),
    );
    await renderPage();
    expect(await screen.findByText("Cap esdeveniment fallit")).toBeVisible();
    expect(screen.getByText("Tots els esdeveniments de Stripe s'han processat.")).toBeVisible();
    cleanup();
    server.use(
      http.get("*/api/v1/billing/stripe-events", () =>
        HttpResponse.json(
          { code: "INTERNAL_ERROR", details: {}, message: "Boom", traceId: "t-500" },
          { status: 500 },
        ),
      ),
    );
    await renderPage();
    expect(
      await screen.findByText("No s'han pogut carregar els esdeveniments de Stripe."),
    ).toBeVisible();
  });

  it("D6 links to it for a card club only (`paymentProviders.STRIPE`)", async () => {
    const renderBilling = async () => {
      window.history.replaceState(null, "", "/facturacio?mes=2026-09");
      const onNavigate = vi.fn();
      render(
        <I18nextProvider i18n={await i18n()}>
          <BrandingProvider branding={branding}>
            <BillingPage client={client()} onNavigate={onNavigate} />
          </BrandingProvider>
        </I18nextProvider>,
      );
      await screen.findByRole("heading", { level: 1, name: "Setembre 2026" });
      return onNavigate;
    };
    // The Cànic remits by SEPA and takes cash: no card provider, no link.
    await renderBilling();
    await screen.findByRole("link", { name: "Remeses ›" });
    expect(screen.queryByRole("link", { name: "Esdeveniments Stripe fallits ›" })).toBeNull();
    cleanup();
    mockScenario("billingStripe");
    const onNavigate = await renderBilling();
    const link = await screen.findByRole("link", { name: "Esdeveniments Stripe fallits ›" });
    expect(link).toHaveAttribute("href", "/facturacio/esdeveniments-stripe");
    fireEvent.click(link);
    expect(onNavigate).toHaveBeenCalledWith("/facturacio/esdeveniments-stripe");
  });
});
