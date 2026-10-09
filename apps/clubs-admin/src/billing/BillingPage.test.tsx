import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createApiClient } from "@agilityhub/api-client";
import {
  BILLING_MOCK_NOW,
  billingState,
  mockScenario,
  resetBillingMockState,
  type MockScenario,
} from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n, loadNamespace, type Locale } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BillingPage } from "./BillingPage";
import { invoiceActions } from "./InvoiceDrawer";
import { invoiceStatusView } from "./shared";

const branding: Branding = {
  ...brandingCanicFixture,
  locales: ["ca", "es", "en"],
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

interface SentRequest {
  body?: unknown;
  idempotencyKey: string | null;
  method: string;
  url: URL;
}
const sent: SentRequest[] = [];

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  server.events.on("request:start", ({ request }) => {
    const entry: SentRequest = {
      idempotencyKey: request.headers.get("Idempotency-Key"),
      method: request.method,
      url: new URL(request.url),
    };
    sent.push(entry);
    if (request.method === "POST") {
      void request
        .clone()
        .json()
        .then(
          (body: unknown) => {
            entry.body = body;
          },
          () => undefined,
        );
    }
  });
});
beforeEach(() => {
  vi.useFakeTimers({ now: new Date(BILLING_MOCK_NOW), shouldAdvanceTime: true, toFake: ["Date"] });
  resetBillingMockState();
  mockScenario("admin");
  sent.length = 0;
  localStorage.clear();
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

async function renderPage({
  locale = "ca",
  scenario = "admin",
  search = "?mes=2026-09",
}: { locale?: Locale; scenario?: MockScenario; search?: string } = {}) {
  mockScenario(scenario);
  window.history.replaceState(null, "", `/facturacio${search}`);
  const i18n = await createI18n({
    branding,
    browserLanguages: [locale],
    initialNamespaces: ["admin-billing", "census", "common", "enums", "errors"],
    storage: undefined,
  });
  const onNavigate = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <BillingPage client={client()} onNavigate={onNavigate} />
      </BrandingProvider>
    </I18nextProvider>,
  );
  const parameters = new URLSearchParams(search);
  const acrossMonths =
    parameters.get("mes") === null &&
    parameters.getAll("filter").some((filter) => filter.startsWith("memberId:eq:"));
  if (acrossMonths) {
    await screen.findByRole("heading", {
      level: 1,
      name: /Tots els mesos|Todos los meses|All months/u,
    });
  } else {
    await screen.findByRole("heading", {
      level: 2,
      name: /Pas 1|Paso 1|Step 1|Encara|Todavía|There is/u,
    });
  }
  return { onNavigate };
}

function requests(method: string, path: string) {
  return sent.filter((entry) => entry.method === method && entry.url.pathname === `/api/v1${path}`);
}

function invoiceTable() {
  return screen.getByRole("table", { name: /^(Rebuts|Recibos|Receipts) · / });
}

/** The visible text of a receipt row, cell by cell (the checkbox cell is empty). */
async function invoiceRow(number: string) {
  return waitFor(() => {
    const row = within(invoiceTable())
      .getAllByRole("row")
      .find((item) => item.getAttribute("data-invoice-number") === number);
    if (row === undefined) throw new TypeError(`Missing receipt ${number}`);
    return row;
  });
}

function cells(row: HTMLElement) {
  return within(row)
    .getAllByRole("cell")
    .map((cell) => cell.textContent.replace(/\s+/gu, " ").trim());
}

async function listedNumbers() {
  const table = invoiceTable();
  await waitFor(() => {
    expect(within(table).queryAllByText("Carregant", { exact: false })).toHaveLength(0);
  });
  return within(table)
    .getAllByRole("row")
    .map((row) => row.getAttribute("data-invoice-number"))
    .filter((value): value is string => value !== null);
}

async function openDrawer(number: string) {
  fireEvent.click(await screen.findByRole("button", { name: `Obre el rebut ${number}` }));
  return screen.findByRole("dialog", { name: `Rebut ${number}` });
}

describe("T-12-25 D6 «Facturació»: the month as the mockup draws it (S12 §2)", () => {
  it("T-12-25: header, incidents first with their labels and «Obre fitxa» links, the cash members, the KPIs and the chips", async () => {
    const { onNavigate } = await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Setembre 2026" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Mes anterior" })).toHaveTextContent("‹ mes");
    expect(screen.getByRole("button", { name: "Mes següent" })).toHaveTextContent("mes ›");
    expect(screen.getByRole("button", { name: "1 · SIMULA EL MES" })).toBeEnabled();
    // The month is generated already: button 2 waits, with its reason, and the rollback is offered.
    const generate = await screen.findByRole("button", { name: "2 · GENERA REMESA SEPA (XML)" });
    expect(generate).toBeDisabled();
    expect(generate).toHaveAccessibleDescription("Els rebuts d'aquest mes ja s'han generat.");
    expect(screen.getByRole("button", { name: "Retrocedeix la remesa" })).toBeVisible();

    const card = screen.getByRole("heading", { name: "Pas 1 — Simulació: incidències primer" })
      .parentElement?.parentElement;
    if (card === null || card === undefined) throw new TypeError("No simulation card");
    // The red «2» is read out as «2 incidències».
    expect(within(card).getByText("2 incidències")).toHaveClass("ah-sr-only");
    const [incidents, cash] = within(card).getAllByRole("table");
    if (incidents === undefined || cash === undefined) throw new TypeError("Two tables expected");
    // Incidents first (R-12-07), then «Actius amb pagament en efectiu».
    expect(incidents.compareDocumentPosition(cash) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      within(incidents)
        .getAllByRole("row")
        .map((row) => row.textContent),
    ).toEqual([
      "Joan Vilasense compte bancari informatObre fitxa",
      "Pau Rierasense tarifa assignadaObre fitxa",
    ]);
    const openJoan = within(incidents).getByRole("link", { name: "Obre fitxa de Joan Vila" });
    expect(openJoan).toHaveTextContent("Obre fitxa");
    // E8-W04 6b(d): the link points to a member whose D10 record the census mock serves.
    const joanId = openJoan.getAttribute("href")?.replace(/^\/abonats\//u, "") ?? "";
    const joan = await client().GET("/members/{id}/overview", {
      params: { path: { id: joanId } },
    });
    expect(joan.response.status).toBe(200);
    expect(joan.data?.member.fullName).toBe("Joan Vila");
    fireEvent.click(openJoan);
    expect(onNavigate).toHaveBeenCalledWith(openJoan.getAttribute("href"));
    expect(
      within(card).getByText("Els abonats amb incidència s'ometen de la generació."),
    ).toBeVisible();
    expect(
      within(card).getByRole("heading", { name: "Actius amb pagament en efectiu" }),
    ).toBeVisible();
    expect(
      within(cash)
        .getAllByRole("row")
        .map((row) => row.textContent),
    ).toEqual([
      "Joan Viladata de baixa prevista: 31/12/2026Obre fitxa",
      "Roser Campsdata de baixa prevista: 30/06/2027Obre fitxa",
    ]);

    // The collection date is the run's (`GET /billing/runs/{id}`), read after the month.
    await screen.findByText("data de cobrament: 01/09");
    const kpis = [...document.querySelectorAll(".billing-kpi")].map((kpi) => kpi.textContent);
    expect(kpis).toEqual([
      "168Rebuts del messimulats el 25/08",
      "6.480 €Import de la remesadata de cobrament: 01/09Remeses ›",
      "4En efectiupendents de marcar cobrat",
      "2Quota d'inactivitat20 € el 1r mes · 10 €/mes",
    ]);

    const chips = within(screen.getByRole("group", { name: "Estat dels rebuts" }));
    expect(chips.getAllByRole("button").map((chip) => chip.textContent)).toEqual([
      "Tots (168)",
      "Pendents (4)",
      "Remesats (162)",
      "Cobrats",
      "Impagats (2)",
    ]);
    expect(chips.getByRole("button", { name: "Tots (168)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Marcar cobrat (selecció)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Exporta per a comptabilitat" })).toBeEnabled();

    // The mockup's rows: frozen concepts, amounts, methods and the D6 status wordings.
    expect(cells(await invoiceRow("2026-0912")).slice(1, 7)).toEqual([
      "2026-0912",
      "Laura Serra",
      "Quota Abonat 2 gossos — Setembre 2026",
      "90,00 €",
      "Domiciliació",
      "remesat",
    ]);
    expect(cells(await invoiceRow("2026-0914")).slice(3, 7)).toEqual([
      "Quota inactivitat — Setembre 2026",
      "10,00 €",
      "Domiciliació",
      "remesat",
    ]);
    expect(cells(await invoiceRow("2026-0915")).slice(1, 7)).toEqual([
      "2026-0915",
      "Joan Vila",
      "Quota Abonat — Setembre 2026",
      "60,00 €",
      "Efectiu",
      "pendent · marca cobrat",
    ]);
    // One read drives the month; the list always asks for the header's month.
    expect(requests("GET", "/billing/periods/2026-09")).not.toHaveLength(0);
    const list = requests("GET", "/invoices").at(-1);
    expect(list?.url.searchParams.getAll("filter")).toEqual(["period:eq:2026-09"]);
    expect(list?.url.searchParams.getAll("sort")).toEqual(["number,asc"]);
  });

  it("T-12-25: the month steppers rewrite ?mes= and read that month; a month without a simulation offers [1 · SIMULA EL MES], which shows its incidents", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Mes següent" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Octubre 2026" })).toBeVisible();
    expect(new URLSearchParams(window.location.search).get("mes")).toBe("2026-10");
    expect(
      await screen.findByRole("heading", { name: "Encara no hi ha cap simulació d'aquest mes" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "2 · GENERA REMESA SEPA (XML)" }),
    ).toHaveAccessibleDescription("Primer cal simular el mes.");
    expect(screen.queryByRole("button", { name: "Retrocedeix la remesa" })).toBeNull();
    expect(
      within(screen.getByRole("group", { name: "Estat dels rebuts" })).getByRole("button", {
        name: "Tots (0)",
      }),
    ).toBeVisible();

    const simulate = screen.getAllByRole("button", { name: "1 · SIMULA EL MES" })[0];
    if (simulate === undefined) throw new TypeError("No simulate button");
    fireEvent.click(simulate);
    expect(await screen.findByText("Mes simulat.")).toBeVisible();
    expect(await screen.findByText("sense compte bancari informat")).toBeVisible();
    expect(screen.getByRole("button", { name: "2 · GENERA REMESA SEPA (XML)" })).toBeEnabled();
    expect(requests("POST", "/billing/simulations").map((entry) => entry.body)).toEqual([
      { period: "2026-10" },
    ]);
    // The contract keys no simulation (S12 §6): the client adds no Idempotency-Key to it.
    expect(requests("POST", "/billing/simulations")[0]?.idempotencyKey).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Mes anterior" }));
    fireEvent.click(screen.getByRole("button", { name: "Mes anterior" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Agost 2026" })).toBeVisible();
    // August is collected and returned: no rollback, a SUBMITTED remittance.
    await waitFor(() => {
      expect(
        within(screen.getByRole("group", { name: "Estat dels rebuts" })).getByRole("button", {
          name: "Impagats (1)",
        }),
      ).toBeVisible();
    });
    expect(screen.queryByRole("button", { name: "Retrocedeix la remesa" })).toBeNull();
  });

  it("T-12-25: a month more than three months ahead is refused by the api with a toast, not on a field", async () => {
    await renderPage({ search: "?mes=2026-12" });
    const simulate = screen.getAllByRole("button", { name: "1 · SIMULA EL MES" })[0];
    if (simulate === undefined) throw new TypeError("No simulate button");
    fireEvent.click(simulate);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Només es pot simular fins a tres mesos endavant.",
    );
  });
});

describe("T-12-25 the strong confirmation and the generation (R-12-11, R-12-06)", () => {
  it("R-12-29 (CONVENCIONS_API §7, E85): an unanswered generation (503) keeps its Idempotency-Key, so the retry is the same submission; the answer then retires it", async () => {
    let failures = 1;
    server.use(
      http.post("*/api/v1/billing/runs", () => {
        if (failures === 0) return undefined;
        failures -= 1;
        return HttpResponse.json(
          { code: "INTERNAL_ERROR", details: {}, message: "Unavailable", traceId: "t-503" },
          { status: 503 },
        );
      }),
    );
    await renderPage({ scenario: "billingStale" });
    const [simulate] = screen.getAllByRole("button", { name: "1 · SIMULA EL MES" });
    if (simulate === undefined) throw new TypeError("No simulate button");
    fireEvent.click(simulate);
    await screen.findByText("Mes simulat.");
    fireEvent.click(screen.getByRole("button", { name: "2 · GENERA REMESA SEPA (XML)" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Genera" }));
    // The catalog's text of the api's code (errors:INTERNAL_ERROR), inside the modal.
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "S'ha produït un error inesperat.",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Genera" }));
    expect(await screen.findByText("168 rebuts generats")).toBeVisible();
    const keys = requests("POST", "/billing/runs").map((entry) => entry.idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/u);
    expect(keys[1]).toBe(keys[0]);
  });

  it("CONVENCIONS_API §7 (E80): 409 IDEMPOTENCY_KEY_REUSED {IN_PROGRESS} reads the shared «encara està en curs» text inside the modal", async () => {
    server.use(
      http.post("*/api/v1/invoices/payments", () =>
        HttpResponse.json(
          {
            code: "IDEMPOTENCY_KEY_REUSED",
            details: { reason: "IN_PROGRESS" },
            message: "In progress",
            traceId: "t-409",
          },
          { status: 409 },
        ),
      ),
    );
    await renderPage();
    fireEvent.click(
      within(await invoiceRow("2026-0915")).getByRole("checkbox", {
        name: "Selecciona el rebut 2026-0915",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Marcar cobrat (selecció)" }));
    const dialog = await screen.findByRole("dialog", { name: "Marcar cobrat" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Marca cobrat" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "L'operació encara està en curs. Torna-ho a provar d'aquí a un moment.",
    );
  });

  it("T-12-25: «Es generaran 168 rebuts…» from the simulation's KPIs, then POST /billing/runs with one Idempotency-Key, «168 rebuts generats»", async () => {
    await renderPage({ search: "?mes=2026-10" });
    const simulate = screen.getAllByRole("button", { name: "1 · SIMULA EL MES" })[0];
    if (simulate === undefined) throw new TypeError("No simulate button");
    fireEvent.click(simulate);
    await screen.findByText("sense compte bancari informat");

    fireEvent.click(screen.getByRole("button", { name: "2 · GENERA REMESA SEPA (XML)" }));
    const dialog = await screen.findByRole("dialog", { name: "Genera els rebuts · Octubre 2026" });
    expect(within(dialog).getByText(/^Es generaran/u)).toHaveTextContent(
      "Es generaran 168 rebuts per un total de 6.480,00 €. La data del proper rebut dels abonats avançarà al dia 1 de novembre.",
    );
    expect(within(dialog).getByRole("button", { name: "Cancel·la" })).toBeEnabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Genera" }));

    expect(await screen.findByText("168 rebuts generats")).toBeVisible();
    expect(screen.queryByRole("dialog", { name: /^Genera els rebuts/u })).toBeNull();
    const [run] = requests("POST", "/billing/runs");
    expect(run?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/u);
    expect(run?.body).toMatchObject({ period: "2026-10" });
    expect(Object.keys(run?.body ?? {}).sort()).toEqual(["period", "simulationId"]);
    // The api's run now drives the header: button 2 waits, the rollback is offered.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "2 · GENERA REMESA SEPA (XML)" })).toBeDisabled();
    });
    expect(await screen.findByRole("button", { name: "Retrocedeix la remesa" })).toBeVisible();
    expect(
      await within(screen.getByRole("group", { name: "Estat dels rebuts" })).findByRole("button", {
        name: "Remesats (164)",
      }),
    ).toBeVisible();
  });

  it("T-12-25 / R-12-07 billingStale: 409 SIMULATION_STALE turns the modal into «Torna a simular el mes» with [Simula de nou]", async () => {
    await renderPage({ scenario: "billingStale" });
    fireEvent.click(await screen.findByRole("button", { name: "2 · GENERA REMESA SEPA (XML)" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Genera" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Hi ha hagut canvis des de l'última simulació. Torna a simular el mes.",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Simula de nou" }));
    expect(await screen.findByText("Mes simulat.")).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: "2 · GENERA REMESA SEPA (XML)" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Genera" }),
    );
    expect(await screen.findByText("168 rebuts generats")).toBeVisible();
  });

  it("T-12-25: 422 COLLECTION_DATE_TOO_SOON shows the api's dates inside the modal (two business days, T-12-29b)", async () => {
    // Monday 31/08: a run for September collected on 01/09 leaves less than two business days.
    vi.setSystemTime(new Date("2026-08-31T08:00:00Z"));
    await renderPage({ scenario: "billingStale" });
    const [simulate] = screen.getAllByRole("button", { name: "1 · SIMULA EL MES" });
    if (simulate === undefined) throw new TypeError("No simulate button");
    fireEvent.click(simulate);
    await screen.findByText("Mes simulat.");
    fireEvent.click(screen.getByRole("button", { name: "2 · GENERA REMESA SEPA (XML)" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Genera" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "La data de cobrament 01/09/2026 és massa propera: la primera possible és 02/09/2026.",
    );
  });
});

describe("T-12-25 [Retrocedeix la remesa] only when the api says so (R-12-14)", () => {
  it("T-12-25: absent once the remittance is submitted (rollbackable false), present while rollbackable", async () => {
    await renderPage();
    expect(await screen.findByRole("button", { name: "Retrocedeix la remesa" })).toBeVisible();
    cleanup();
    // The remittance goes to the bank: the next read of the month is not rollbackable.
    const api = client();
    const remittances = await api.GET("/remittances", { params: { query: {} } });
    const september = remittances.data?.items.find((item) => item.period === "2026-09");
    if (september === undefined) throw new TypeError("No September remittance");
    await api.POST("/remittances/{id}/submission", {
      body: { submittedAt: "2026-08-26" },
      params: { header: { "Idempotency-Key": crypto.randomUUID() }, path: { id: september.id } },
    });
    await renderPage();
    await screen.findByRole("button", { name: "2 · GENERA REMESA SEPA (XML)" });
    expect(screen.queryByRole("button", { name: "Retrocedeix la remesa" })).toBeNull();
  });

  it("T-12-25: the rollback button stays disabled until «RETROCEDIR» is typed exactly; then 200 «168 rebuts anul·lats» and the month reads rolled back", async () => {
    await renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Retrocedeix la remesa" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Retrocedeix la remesa · Setembre 2026",
    });
    expect(within(dialog).getByText("s'anul·laran 168 rebuts;")).toBeVisible();
    expect(within(dialog).getByText("la numeració dels rebuts tornarà enrere;")).toBeVisible();
    const confirm = within(dialog).getByRole("button", { name: "Retrocedeix" });
    const keyword = within(dialog).getByLabelText("Escriu RETROCEDIR per confirmar-ho");
    expect(confirm).toBeDisabled();
    fireEvent.change(keyword, { target: { value: "retrocedir" } });
    expect(confirm).toBeDisabled();
    fireEvent.change(keyword, { target: { value: "RETROCEDI" } });
    expect(confirm).toBeDisabled();
    fireEvent.change(keyword, { target: { value: "RETROCEDIR" } });
    fireEvent.change(within(dialog).getByLabelText("Motiu"), {
      target: { value: "Preu de la quota equivocat" },
    });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    expect(await screen.findByText("168 rebuts anul·lats")).toBeVisible();
    const [rollback] = requests(
      "POST",
      `/billing/runs/${billingState.world.runs[0]?.run.id ?? ""}/rollback`,
    );
    expect(rollback?.body).toEqual({
      confirmation: "RETROCEDIR",
      reason: "Preu de la quota equivocat",
    });
    expect(rollback?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/u);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Retrocedeix la remesa" })).toBeNull();
    });
    // The rolled-back run no longer holds the month: button 2 asks for a new simulation (stale).
    expect(screen.getByRole("button", { name: "2 · GENERA REMESA SEPA (XML)" })).toBeEnabled();
    expect(
      await within(screen.getByRole("group", { name: "Estat dels rebuts" })).findByRole("button", {
        name: "Tots (0)",
      }),
    ).toBeVisible();
  });

  it("T-12-25 billingRollbackBlocked: 409 RUN_NOT_ROLLBACKABLE lists the api's reasons in the modal and the button goes", async () => {
    await renderPage({ scenario: "billingRollbackBlocked" });
    fireEvent.click(await screen.findByRole("button", { name: "Retrocedeix la remesa" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Escriu RETROCEDIR per confirmar-ho"), {
      target: { value: "RETROCEDIR" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Retrocedeix" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("No es pot retrocedir la remesa:");
    expect(
      within(alert)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["la remesa ja s'ha enviat al banc"]);
    expect(within(dialog).queryByRole("button", { name: "Retrocedeix" })).toBeNull();
    // The modal's own [Tanca] (its × has the same name).
    const close = within(dialog).getAllByRole("button", { name: "Tanca" }).at(-1);
    if (close === undefined) throw new TypeError("No close button");
    fireEvent.click(close);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Retrocedeix la remesa" })).toBeNull();
    });
  });
});

describe("T-12-25 the receipts list: chips, selection and bulk mark-paid (R-12-16, E87)", () => {
  it("T-12-25: the chips filter the list by status on top of the month and show the api's counts", async () => {
    await renderPage();
    await invoiceRow("2026-0912");
    const chips = within(screen.getByRole("group", { name: "Estat dels rebuts" }));
    fireEvent.click(chips.getByRole("button", { name: "Pendents (4)" }));
    await waitFor(async () => {
      expect(await listedNumbers()).toHaveLength(4);
    });
    expect(chips.getByRole("button", { name: "Pendents (4)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(requests("GET", "/invoices").at(-1)?.url.searchParams.getAll("filter")).toEqual([
      "period:eq:2026-09",
      "status:eq:PENDING",
    ]);
    for (const number of await listedNumbers()) {
      expect(cells(await invoiceRow(number)).at(6)).toBe("pendent · marca cobrat");
    }

    fireEvent.click(chips.getByRole("button", { name: "Impagats (2)" }));
    await waitFor(async () => {
      expect(await listedNumbers()).toEqual(["2026-0972", "2026-1039"]);
    });
    expect(cells(await invoiceRow("2026-1039")).slice(2, 7)).toEqual([
      "Pere Soler",
      "Quota Abonat — Setembre 2026",
      "60,00 €",
      "Domiciliació",
      "impagat (manual)",
    ]);
    fireEvent.click(chips.getByRole("button", { name: "Tots (168)" }));
    await waitFor(() => {
      expect(requests("GET", "/invoices").at(-1)?.url.searchParams.getAll("filter")).toEqual([
        "period:eq:2026-09",
      ]);
    });
  });

  it("T-12-25: a selection enables [Marcar cobrat (selecció)]; remitted rows cannot be selected; the bulk payment marks them paid", async () => {
    await renderPage();
    const button = screen.getByRole("button", { name: "Marcar cobrat (selecció)" });
    expect(button).toBeDisabled();
    // E87: a COLLECTING receipt takes no «marca cobrat», so it cannot be selected.
    expect(
      within(await invoiceRow("2026-0912")).getByRole("checkbox", {
        name: "Selecciona el rebut 2026-0912",
      }),
    ).toBeDisabled();
    fireEvent.click(
      within(await invoiceRow("2026-0915")).getByRole("checkbox", {
        name: "Selecciona el rebut 2026-0915",
      }),
    );
    fireEvent.click(
      within(await invoiceRow("2026-0916")).getByRole("checkbox", {
        name: "Selecciona el rebut 2026-0916",
      }),
    );
    expect(button).toBeEnabled();
    fireEvent.click(button);
    const dialog = await screen.findByRole("dialog", { name: "Marcar cobrat" });
    expect(within(dialog).getByText("Es marcaran 2 rebuts com a cobrats.")).toBeVisible();
    expect(within(dialog).getByLabelText("Data de cobrament")).toHaveValue("2026-08-26");
    fireEvent.change(within(dialog).getByLabelText("Canal"), { target: { value: "BIZUM" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Marca cobrat" }));

    expect(await screen.findByText("2 rebuts marcats com a cobrats")).toBeVisible();
    const [bulk] = requests("POST", "/invoices/payments");
    expect(bulk?.body).toEqual({
      channel: "BIZUM",
      invoiceIds: [expect.any(String), expect.any(String)],
      paidAt: "2026-08-26",
    });
    expect(bulk?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/u);
    await waitFor(async () => {
      expect(cells(await invoiceRow("2026-0915")).at(6)).toBe("cobrat");
    });
    expect(
      await within(screen.getByRole("group", { name: "Estat dels rebuts" })).findByRole("button", {
        name: "Pendents (2)",
      }),
    ).toBeVisible();
    expect(button).toBeDisabled();
  });

  it("E8-W01 round 2 #4: a receipt paid in its drawer leaves the held selection before pagination, so a later bulk payment never resends its id", async () => {
    await renderPage();
    fireEvent.click(
      within(await invoiceRow("2026-0915")).getByRole("checkbox", {
        name: "Selecciona el rebut 2026-0915",
      }),
    );
    const drawer = await openDrawer("2026-0915");
    await within(drawer).findByText("Quota Abonat — Setembre 2026");
    fireEvent.click(within(drawer).getByRole("button", { name: "Marca cobrat" }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Marca cobrat" })).getByRole("button", {
        name: "Marca cobrat",
      }),
    );
    expect(await within(drawer).findByText("Rebut marcat com a cobrat.")).toBeVisible();
    const paid = requests("POST", "/invoices/payments").at(-1);
    expect(paid).toBeUndefined();
    const paidId = sent
      .find((entry) => entry.method === "POST" && entry.url.pathname.endsWith("/payment"))
      ?.url.pathname.split("/")
      .at(-2);
    expect(paidId).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByText("1 seleccionat")).toBeNull();
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "Tanca el rebut" }));

    for (const page of [2, 3, 4]) {
      fireEvent.click(screen.getByRole("button", { name: "Pàgina següent" }));
      await screen.findByText(`Pàgina ${String(page)} de 4`);
    }
    const payable = within(invoiceTable())
      .getAllByRole("checkbox")
      .find(
        (checkbox) =>
          !checkbox.hasAttribute("disabled") &&
          checkbox.getAttribute("aria-label")?.startsWith("Selecciona el rebut ") === true,
      );
    if (payable === undefined) throw new TypeError("No payable receipt on the last page");
    fireEvent.click(payable);
    fireEvent.click(screen.getByRole("button", { name: "Marcar cobrat (selecció)" }));
    const bulkDialog = await screen.findByRole("dialog", { name: "Marcar cobrat" });
    expect(within(bulkDialog).getByText("Es marcarà 1 rebut com a cobrat.")).toBeVisible();
    fireEvent.click(within(bulkDialog).getByRole("button", { name: "Marca cobrat" }));
    await waitFor(() => {
      expect(requests("POST", "/invoices/payments")).toHaveLength(1);
    });
    const bulk = requests("POST", "/invoices/payments")[0]?.body as
      { invoiceIds?: string[] } | undefined;
    expect(bulk?.invoiceIds).toHaveLength(1);
    expect(bulk?.invoiceIds).not.toContain(paidId);
  });

  it("E8-W04 6b: a drawer payment drops a selected receipt even when the Pendents filter removes its row", async () => {
    await renderPage();
    const chips = within(screen.getByRole("group", { name: "Estat dels rebuts" }));
    fireEvent.click(chips.getByRole("button", { name: "Pendents (4)" }));
    const row = await invoiceRow("2026-0915");
    fireEvent.click(within(row).getByRole("checkbox", { name: "Selecciona el rebut 2026-0915" }));
    const drawer = await openDrawer("2026-0915");
    fireEvent.click(within(drawer).getByRole("button", { name: "Marca cobrat" }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Marca cobrat" })).getByRole("button", {
        name: "Marca cobrat",
      }),
    );
    expect(await within(drawer).findByText("Rebut marcat com a cobrat.")).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByText("1 seleccionat")).toBeNull();
      expect(screen.getByRole("button", { name: "Marcar cobrat (selecció)" })).toBeDisabled();
    });
  });
});

describe("T-12-25 the receipt drawer: the actions each state allows (R-12-16…R-12-20)", () => {
  function actionNames(dialog: HTMLElement) {
    return within(within(dialog).getByRole("group", { name: "Accions del rebut" }))
      .getAllByRole("button")
      .map((button) => button.textContent);
  }

  it("T-12-25: PENDING cash, COLLECTING and FAILED direct debits, a PAID and a CANCELLED receipt", async () => {
    await renderPage();
    let dialog = await openDrawer("2026-0915");
    expect(await within(dialog).findByText("Quota Abonat — Setembre 2026")).toBeVisible();
    expect(actionNames(dialog)).toEqual([
      "Marca cobrat",
      "Anul·la el rebut",
      "Descarrega el justificant",
    ]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Tanca el rebut" }));

    dialog = await openDrawer("2026-0912");
    await within(dialog).findByText("Quota Abonat 2 gossos — Setembre 2026");
    // E87: a remitted receipt is collected on its date; only a bank return can be recorded.
    expect(actionNames(dialog)).toEqual(["Marca impagat", "Descarrega el justificant"]);
    // The payment method is masked: never an IBAN.
    expect(within(dialog).getByText("···· ···· ···· ···· 1087")).toBeVisible();
    expect(within(dialog).getByText("canic-87-1")).toBeVisible();
    // No tax column at the Cànic (B3): every line is 0 %.
    expect(within(dialog).queryByRole("columnheader", { name: "Impost" })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Tanca el rebut" }));

    // Pere Soler's September bank return is on the «Impagats» chip (beyond the first page).
    fireEvent.click(
      within(screen.getByRole("group", { name: "Estat dels rebuts" })).getByRole("button", {
        name: "Impagats (2)",
      }),
    );
    dialog = await openDrawer("2026-1039");
    // The bank return: its date and the admin's reason, and the FAILED{BANK_RETURN} collection
    // appended, its code in the reader's language (never the raw «BANK_RETURN»).
    expect(
      await within(dialog).findByText("Mandat anul·lat pel titular", { exact: false }),
    ).toBeVisible();
    expect(within(dialog).getByText("Motiu: devolució bancària")).toBeVisible();
    expect(dialog).not.toHaveTextContent("BANK_RETURN");
    expect(actionNames(dialog)).toEqual([
      "Marca cobrat",
      "Anul·la el rebut",
      "Descarrega el justificant",
    ]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Tanca el rebut" }));

    // August: collected on 01/08 (a later bank return can still be recorded) and the rolled-back try.
    fireEvent.click(screen.getByRole("button", { name: "Mes anterior" }));
    await screen.findByRole("heading", { level: 1, name: "Agost 2026" });
    // The chip stays when the month changes: «Tots» lists August's collected receipts.
    fireEvent.click(
      await within(screen.getByRole("group", { name: "Estat dels rebuts" })).findByRole("button", {
        name: "Tots (168)",
      }),
    );
    dialog = await openDrawer("2026-0744");
    await within(dialog).findByText("Quota Abonat 2 gossos — Agost 2026");
    expect(actionNames(dialog)).toEqual(["Marca impagat", "Descarrega el justificant"]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Tanca el rebut" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("T-12-25 invoiceActions: every status and method of S12 §5 (cards included)", () => {
    const sepaCollection = { provider: "SEPA_XML", status: "SUCCEEDED" } as const;
    const cardCollection = { provider: "STRIPE", status: "SUCCEEDED" } as const;
    const base = {
      collections: [],
      paymentMethod: { type: "SEPA_DD" as const },
      refundedTotal: { amountMinor: 0, currency: "EUR" },
      total: { amountMinor: 6000, currency: "EUR" },
    };
    const of = (fields: Record<string, unknown>) =>
      invoiceActions({ ...base, ...fields } as unknown as Parameters<typeof invoiceActions>[0]);
    expect(of({ paymentMethod: { type: "MANUAL" }, status: "PENDING" })).toEqual(["pay", "cancel"]);
    expect(of({ status: "COLLECTING" })).toEqual(["fail"]);
    expect(of({ collections: [sepaCollection], status: "PAID" })).toEqual(["fail"]);
    expect(of({ status: "FAILED" })).toEqual(["pay", "cancel"]);
    expect(of({ paymentMethod: { type: "CARD" }, status: "FAILED" })).toEqual(["retry", "cancel"]);
    expect(
      of({ collections: [cardCollection], paymentMethod: { type: "CARD" }, status: "PAID" }),
    ).toEqual(["refund"]);
    expect(
      of({
        collections: [cardCollection],
        paymentMethod: { type: "CARD" },
        refundedTotal: { amountMinor: 6000, currency: "EUR" },
        status: "PAID",
      }),
    ).toEqual([]);
    expect(of({ paymentMethod: { type: "CARD" }, status: "COLLECTING" })).toEqual([]);
    expect(of({ status: "CANCELLED" })).toEqual([]);
  });

  it("T-12-25: [Marca cobrat] sends the paid date, the channel and the receipt's version; the drawer and the list read PAID", async () => {
    await renderPage();
    const dialog = await openDrawer("2026-0915");
    await within(dialog).findByText("Quota Abonat — Setembre 2026");
    fireEvent.click(within(dialog).getByRole("button", { name: "Marca cobrat" }));
    const confirm = await screen.findByRole("dialog", { name: "Marca cobrat" });
    fireEvent.change(within(confirm).getByLabelText("Referència (opcional)"), {
      target: { value: "Rebut en mà" },
    });
    fireEvent.click(within(confirm).getByRole("button", { name: "Marca cobrat" }));
    expect(await within(dialog).findByText("Rebut marcat com a cobrat.")).toBeVisible();
    const [payment] = sent.filter(
      (entry) => entry.method === "POST" && entry.url.pathname.endsWith("/payment"),
    );
    expect(payment?.body).toEqual({
      channel: "CASH",
      paidAt: "2026-08-26",
      reference: "Rebut en mà",
      version: 1,
    });
    expect(payment?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/u);
    expect(within(dialog).getByText("cobrat")).toBeVisible();
    await waitFor(async () => {
      expect(cells(await invoiceRow("2026-0915")).at(6)).toBe("cobrat");
    });
  });

  it("T-12-25: 409 STALE_VERSION reads «El rebut ha canviat. Torna a obrir-lo.» in the drawer and the receipt is read again", async () => {
    server.use(
      http.post("*/api/v1/invoices/:id/payment", () =>
        HttpResponse.json(
          { code: "STALE_VERSION", details: {}, message: "Stale version", traceId: "t-409" },
          { status: 409 },
        ),
      ),
    );
    await renderPage();
    const dialog = await openDrawer("2026-0915");
    await within(dialog).findByText("Quota Abonat — Setembre 2026");
    const receiptReads = () =>
      sent.filter((entry) => entry.method === "GET" && entry.url.pathname.includes("/invoices/b2"))
        .length;
    const reads = receiptReads();
    fireEvent.click(within(dialog).getByRole("button", { name: "Marca cobrat" }));
    const confirm = await screen.findByRole("dialog", { name: "Marca cobrat" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Marca cobrat" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "El rebut ha canviat. Torna a obrir-lo.",
    );
    expect(screen.queryByRole("dialog", { name: "Marca cobrat" })).toBeNull();
    await waitFor(() => {
      expect(receiptReads()).toBe(reads + 1);
    });
  });

  it("E8-W01 round 2 #6: a failed drawer refetch stays beside the cached receipt, unlocks its actions and recovers through [Torna-ho a provar]", async () => {
    server.use(
      http.post("*/api/v1/invoices/:id/payment", () =>
        HttpResponse.json(
          { code: "STALE_VERSION", details: {}, message: "Stale version", traceId: "t-409" },
          { status: 409 },
        ),
      ),
    );
    await renderPage();
    const dialog = await openDrawer("2026-0915");
    await within(dialog).findByText("Quota Abonat — Setembre 2026");
    server.use(
      http.get("*/api/v1/invoices/:id", () =>
        HttpResponse.json(
          { code: "INTERNAL_ERROR", details: {}, message: "Unavailable", traceId: "t-503" },
          { status: 503 },
        ),
      ),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Marca cobrat" }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Marca cobrat" })).getByRole("button", {
        name: "Marca cobrat",
      }),
    );
    expect(await within(dialog).findByText("No s'ha pogut carregar el rebut.")).toBeVisible();
    expect(within(dialog).getByText("Quota Abonat — Setembre 2026")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Marca cobrat" })).toBeEnabled();

    server.resetHandlers();
    fireEvent.click(within(dialog).getByRole("button", { name: "Torna-ho a provar" }));
    await waitFor(() => {
      expect(within(dialog).queryByText("No s'ha pogut carregar el rebut.")).toBeNull();
    });
    expect(within(dialog).getByRole("button", { name: "Marca cobrat" })).toBeEnabled();
  });

  it("T-12-25: [Descarrega el justificant] opens the PDF in a new tab without parsing it", async () => {
    const tab = { close: vi.fn(), location: { href: "" } };
    const open = vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    const createObjectURL = vi.fn(() => "blob:receipt");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    await renderPage();
    const dialog = await openDrawer("2026-0912");
    await within(dialog).findByText("Quota Abonat 2 gossos — Setembre 2026");
    fireEvent.click(within(dialog).getByRole("button", { name: "Descarrega el justificant" }));
    await waitFor(() => {
      expect(tab.location.href).toBe("blob:receipt");
    });
    expect(open).toHaveBeenCalledWith("", "_blank");
    const [pdf] = sent.filter((entry) => entry.url.pathname.endsWith("/document"));
    expect(pdf?.method).toBe("GET");
  });
});

describe("T-12-32 (D6 half) button 2 and the KPIs follow the club's providers (R-12-28)", () => {
  it("T-12-32: SEPA_XML + MANUAL (the Cànic) → «2 · GENERA REMESA SEPA (XML)», no card KPI nor [COBRA LES TARGETES]", async () => {
    await renderPage();
    expect(
      await screen.findByRole("button", { name: "2 · GENERA REMESA SEPA (XML)" }),
    ).toBeVisible();
    expect(screen.queryByText("Amb targeta")).toBeNull();
    expect(screen.queryByRole("button", { name: "COBRA LES TARGETES" })).toBeNull();
  });

  it("T-12-32 billingManualOnly: «2 · GENERA ELS REBUTS»; the run issues every receipt by hand and makes no remittance", async () => {
    await renderPage({ scenario: "billingManualOnly" });
    const generate = await screen.findByRole("button", { name: "2 · GENERA ELS REBUTS" });
    expect(generate).toBeEnabled();
    expect(screen.queryByRole("button", { name: "2 · GENERA REMESA SEPA (XML)" })).toBeNull();
    fireEvent.click(generate);
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Genera" }),
    );
    expect(await screen.findByText("168 rebuts generats")).toBeVisible();
    expect(
      await within(screen.getByRole("group", { name: "Estat dels rebuts" })).findByRole("button", {
        name: "Pendents (168)",
      }),
    ).toBeVisible();
    expect(cells(await invoiceRow("2026-0912")).slice(5, 7)).toEqual([
      "Efectiu",
      "pendent · marca cobrat",
    ]);
    // No remittance: the KPI has no collection date and no way to a remittances page.
    expect(screen.getByText("Import de la remesa").parentElement).not.toHaveTextContent(
      "data de cobrament",
    );
    expect(screen.queryByRole("link", { name: "Remeses ›" })).toBeNull();
  });

  it("T-12-32 billingStripe: «2 · GENERA ELS REBUTS I COBRA LES TARGETES», the card KPI, [COBRA LES TARGETES] → 202, the 5 s poll while CHARGING and «impagat (targeta)»", async () => {
    await renderPage({ scenario: "billingStripe" });
    expect(
      await screen.findByRole("button", { name: "2 · GENERA ELS REBUTS I COBRA LES TARGETES" }),
    ).toBeDisabled();
    const card = screen.getByText("Amb targeta").parentElement;
    expect(card).toHaveTextContent("164Amb targeta6.240,00 €");
    fireEvent.click(await screen.findByRole("button", { name: "COBRA LES TARGETES" }));
    const dialog = await screen.findByRole("dialog", { name: "Cobra les targetes" });
    expect(
      within(dialog).getByText("Es cobraran 164 rebuts amb targeta per un total de 6.240,00 €."),
    ).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cobra" }));
    expect(await screen.findByText("163 cobraments enviats")).toBeVisible();
    expect(
      screen.getByText("1 rebut omès: No hi ha cap mètode de pagament disponible."),
    ).toBeVisible();
    expect(
      requests("POST", `/billing/runs/${billingState.world.runs[0]?.run.id ?? ""}/card-charges`)[0]
        ?.idempotencyKey,
    ).toMatch(/^[0-9a-f-]{36}$/u);
    expect(await screen.findByText("Cobrant les targetes…")).toBeVisible();
    expect(cells(await invoiceRow("2026-0912")).at(6)).toBe("cobrant");
    // The snapshot accepts card-charges on GENERATED or CHARGING (E8 delta c): still offered.
    expect(screen.getByRole("button", { name: "COBRA LES TARGETES" })).toBeEnabled();
    // The poll (every 5 s while CHARGING) reads the run settled: the month and the list are read again.
    const runReads = () =>
      requests("GET", `/billing/runs/${billingState.world.runs[0]?.run.id ?? ""}`).length;
    const before = runReads();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5_200));
    });
    await waitFor(() => {
      expect(runReads()).toBeGreaterThan(before);
    });
    await waitFor(() => {
      expect(screen.queryByText("Cobrant les targetes…")).toBeNull();
    });
    expect(
      await within(screen.getByRole("group", { name: "Estat dels rebuts" })).findByRole("button", {
        name: "Impagats (2)",
      }),
    ).toBeVisible();
    expect(cells(await invoiceRow("2026-0912")).slice(5, 7)).toEqual([
      "Targeta",
      "impagat (targeta)",
    ]);
  }, 20_000);
});

/** Charges the cards of the `billingStripe` run and lets the mock settle them (two run reads). */
async function settleStripeCards() {
  mockScenario("billingStripe");
  const api = client();
  const month = await api.GET("/billing/periods/{period}", {
    params: { path: { period: "2026-09" } },
  });
  const run = month.data?.run;
  if (run === undefined || run === null) throw new TypeError("No run");
  await api.POST("/billing/runs/{id}/card-charges", {
    params: { header: { "Idempotency-Key": crypto.randomUUID() }, path: { id: run.id } },
  });
  await api.GET("/billing/runs/{id}", { params: { path: { id: run.id } } });
  await api.GET("/billing/runs/{id}", { params: { path: { id: run.id } } });
}

describe("E8-W01 review follow-ups: where errors land, what the admin sees, what the api decides", () => {
  it("R-12-07: the run's skipped members are not repeated under the incidents; «Omesos de la generació» lists only the others", async () => {
    await renderPage();
    // The fixture's run skipped exactly the simulation's two incidents: nothing new to list.
    await screen.findByText("data de cobrament: 01/09");
    expect(screen.queryByRole("heading", { name: "Omesos de la generació" })).toBeNull();
    cleanup();

    const september = billingState.world.runs.find((stored) => stored.run.period === "2026-09");
    if (september === undefined) throw new TypeError("No September run");
    september.run.skipped = [
      ...september.run.skipped,
      {
        code: "NO_PLAN",
        memberId: "b1000000-0000-4000-8000-000000000099",
        memberName: "Anna Fictícia",
      },
    ];
    await renderPage();
    const skipped = await screen.findByRole("heading", { name: "Omesos de la generació" });
    const table = skipped.nextElementSibling;
    if (!(table instanceof HTMLElement)) throw new TypeError("No skipped table");
    expect(
      within(table)
        .getAllByRole("row")
        .map((row) => row.textContent),
    ).toEqual(["Anna Fictíciasense modalitat assignadaObre fitxa"]);
  });

  it("R-12-07: [Simula de nou] waits for its simulation and shows its refusal inside the modal (409 BILLING_BUSY)", async () => {
    server.use(
      http.post("*/api/v1/billing/simulations", async () => {
        await delay(150);
        return HttpResponse.json(
          { code: "BILLING_BUSY", details: {}, message: "Busy", traceId: "t-409" },
          { status: 409 },
        );
      }),
    );
    await renderPage({ scenario: "billingStale" });
    fireEvent.click(await screen.findByRole("button", { name: "2 · GENERA REMESA SEPA (XML)" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Genera" }));
    const again = await within(dialog).findByRole("button", { name: "Simula de nou" });
    fireEvent.click(again);
    await waitFor(() => {
      expect(again).toBeDisabled();
    });
    expect(again).toHaveAttribute("aria-busy", "true");
    // The month waits for its simulation's answer.
    expect(screen.getByRole("button", { name: "Mes següent", hidden: true })).toBeDisabled();
    await waitFor(() => {
      expect(within(dialog).getByRole("alert")).toHaveTextContent(
        "Hi ha una generació en curs. Torna-ho a provar d'aquí a uns minuts.",
      );
    });
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(again).toBeEnabled();
  });

  it("R-12-07: [1 · SIMULA EL MES] refused with 409 BILLING_BUSY reads its toast, and a 400 on another field is not «tres mesos»", async () => {
    let answer: "busy" | "other" = "busy";
    server.use(
      http.post("*/api/v1/billing/simulations", () =>
        answer === "busy"
          ? HttpResponse.json(
              { code: "BILLING_BUSY", details: {}, message: "Busy", traceId: "t-409" },
              { status: 409 },
            )
          : HttpResponse.json(
              {
                code: "VALIDATION_ERROR",
                details: { fieldErrors: [{ code: "REQUIRED", field: "simulationId" }] },
                message: "Invalid",
                traceId: "t-400",
              },
              { status: 400 },
            ),
      ),
    );
    await renderPage({ search: "?mes=2026-10" });
    const [simulate] = screen.getAllByRole("button", { name: "1 · SIMULA EL MES" });
    if (simulate === undefined) throw new TypeError("No simulate button");
    fireEvent.click(simulate);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Hi ha una generació en curs. Torna-ho a provar d'aquí a uns minuts.",
    );
    answer = "other";
    fireEvent.click(simulate);
    await waitFor(() => {
      expect(screen.getAllByRole("alert").at(-1)).toHaveTextContent("Reviseu els camps destacats.");
    });
    expect(screen.queryByText("Només es pot simular fins a tres mesos endavant.")).toBeNull();
  });

  it("T-12-25: a selection is counted beside [Marcar cobrat (selecció)], and another chip (other receipts) drops it", async () => {
    await renderPage();
    fireEvent.click(
      within(await invoiceRow("2026-0915")).getByRole("checkbox", {
        name: "Selecciona el rebut 2026-0915",
      }),
    );
    expect(screen.getByText("1 seleccionat")).toBeVisible();
    expect(screen.getByRole("button", { name: "Marcar cobrat (selecció)" })).toBeEnabled();
    fireEvent.click(
      within(screen.getByRole("group", { name: "Estat dels rebuts" })).getByRole("button", {
        name: "Impagats (2)",
      }),
    );
    expect(screen.getByRole("button", { name: "Marcar cobrat (selecció)" })).toBeDisabled();
    expect(screen.queryByText("1 seleccionat")).toBeNull();
  });

  it("T-12-25 / E87: a receipt cancelled by a rollback lists only under CANCELLED, reads «anul·lat · retrocés» and its drawer offers no action but the PDF", async () => {
    await renderPage({ search: "?mes=2026-08&filter=status:eq:CANCELLED" });
    expect(cells(await invoiceRow("2026-0744")).at(6)).toBe("anul·lat · retrocés");
    const dialog = await openDrawer("2026-0744");
    await within(dialog).findByText("Quota Abonat 2 gossos — Agost 2026");
    expect(
      within(within(dialog).getByRole("group", { name: "Accions del rebut" }))
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Descarrega el justificant"]);
    expect(within(dialog).getByText("Motiu: retrocés de la remesa")).toBeVisible();
    expect(dialog).not.toHaveTextContent("ROLLBACK");
  });

  it("R-12-13 / R-12-18: a withdrawn card reads «sense targeta vàlida» (never NO_PAYMENT_METHOD); [Reintenta amb targeta] → 409 MAX_ATTEMPTS shows the api's attempts", async () => {
    await settleStripeCards();
    server.use(
      http.post("*/api/v1/invoices/:id/retry", () =>
        HttpResponse.json(
          {
            code: "MAX_ATTEMPTS",
            details: { attempts: 3, max: 3 },
            message: "Max attempts",
            traceId: "t-409",
          },
          { status: 409 },
        ),
      ),
    );
    await renderPage({ scenario: "billingStripe" });
    fireEvent.click(
      within(screen.getByRole("group", { name: "Estat dels rebuts" })).getByRole("button", {
        name: "Impagats (2)",
      }),
    );
    const dialog = await openDrawer("2026-0913");
    expect(await within(dialog).findByText("Motiu: sense targeta vàlida")).toBeVisible();
    expect(dialog).not.toHaveTextContent("NO_PAYMENT_METHOD");
    fireEvent.click(within(dialog).getByRole("button", { name: "Reintenta amb targeta" }));
    const confirm = await screen.findByRole("dialog", { name: "Reintenta amb targeta" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Reintenta amb targeta" }));
    expect(await within(confirm).findByRole("alert")).toHaveTextContent(
      "Ja s'han fet 3 dels 3 intents de cobrament.",
    );
  });

  it("R-12-20: a refund over what was paid → 422 REFUND_EXCEEDS_PAID inside the refund modal", async () => {
    await settleStripeCards();
    await renderPage({ scenario: "billingStripe" });
    const dialog = await openDrawer("2026-0914");
    await within(dialog).findByText("Quota inactivitat — Setembre 2026");
    fireEvent.click(within(dialog).getByRole("button", { name: "Reemborsa" }));
    const confirm = await screen.findByRole("dialog", { name: "Reemborsa" });
    expect(within(confirm).getByText("En blanc, es reemborsa tot el que queda.")).toBeVisible();
    fireEvent.change(within(confirm).getByLabelText("Import a reemborsar"), {
      target: { value: "20" },
    });
    fireEvent.click(within(confirm).getByRole("button", { name: "Reemborsa" }));
    expect(await within(confirm).findByRole("alert")).toHaveTextContent(
      "El reemborsament no pot superar l'import pagat.",
    );
    const [refund] = sent.filter((entry) => entry.url.pathname.endsWith("/refund"));
    expect(refund?.body).toEqual({ amount: { amountMinor: 2000, currency: "EUR" }, reason: "" });
  });

  it("R-12-19: 422 CURRENCY_MISMATCH reads inside the manual receipt modal", async () => {
    server.use(
      http.post("*/api/v1/invoices", () =>
        HttpResponse.json(
          { code: "CURRENCY_MISMATCH", details: {}, message: "Currency", traceId: "t-422" },
          { status: 422 },
        ),
      ),
    );
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Rebut manual" }));
    const dialog = await screen.findByRole("dialog", { name: "Rebut manual" });
    fireEvent.change(within(dialog).getByLabelText("Abonat"), { target: { value: "Laura" } });
    fireEvent.click(
      await within(dialog).findByRole("radio", { name: "Laura Serra Vidal · núm. 87" }),
    );
    fireEvent.change(within(dialog).getByLabelText("Concepte (línia 1)"), {
      target: { value: "Ajust" },
    });
    fireEvent.change(within(dialog).getByLabelText("Import (línia 1)"), { target: { value: "5" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Crea el rebut" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Les monedes no coincideixen.",
    );
  });

  it("R-12-26: a large accounting export is queued (202 ACCOUNTING job): no file is saved and the modal closes", async () => {
    const saved: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(this.download);
    });
    await renderPage({ scenario: "adminExportsQueued" });
    fireEvent.click(screen.getByRole("button", { name: "Exporta per a comptabilitat" }));
    const dialog = await screen.findByRole("dialog", { name: "Exporta per a comptabilitat" });
    fireEvent.click(await within(dialog).findByRole("radio", { name: "Excel (XLSX)" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Exporta" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    const [exported] = requests("GET", "/billing/exports");
    expect(exported?.url.searchParams.get("format")).toBe("xlsx");
    expect(saved).toEqual([]);
  });

  it("R-12-13: the poll stops after two minutes of CHARGING with [Actualitza], which polls again", async () => {
    const stored = () => billingState.world.runs[0]?.run;
    server.use(
      http.get("*/api/v1/billing/runs/:id", () =>
        HttpResponse.json({
          ...stored(),
          rollbackBlockers: ["COLLECTION_SUBMITTED"],
          rollbackable: false,
          status: "CHARGING",
        }),
      ),
    );
    await renderPage({ scenario: "billingStripe" });
    expect(await screen.findByText("Cobrant les targetes…")).toBeVisible();
    const reads = () =>
      sent.filter((entry) => entry.url.pathname.startsWith("/api/v1/billing/runs/")).length;
    // Two minutes go by while the cards are still being charged.
    vi.setSystemTime(Date.now() + 121_000);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5_300));
    });
    expect(
      await screen.findByText("Els cobraments amb targeta encara s'estan processant."),
    ).toBeVisible();
    const stopped = reads();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5_300));
    });
    expect(reads()).toBe(stopped);
    fireEvent.click(screen.getByRole("button", { name: "Actualitza" }));
    await waitFor(() => {
      expect(reads()).toBeGreaterThan(stopped);
    });
  }, 30_000);

  it("E8-W01 round 2 #3: a CHARGING period starts bounded monitoring when the first run read fails, shows retry and settles on a later poll", async () => {
    mockScenario("billingStripe");
    const api = client();
    const period = await api.GET("/billing/periods/{period}", {
      params: { path: { period: "2026-09" } },
    });
    const run = period.data?.run;
    if (run === undefined || run === null) throw new TypeError("No Stripe run");
    await api.POST("/billing/runs/{id}/card-charges", {
      params: { header: { "Idempotency-Key": crypto.randomUUID() }, path: { id: run.id } },
    });
    sent.length = 0;
    let runReads = 0;
    server.use(
      http.get("*/api/v1/billing/runs/:id", () => {
        runReads += 1;
        if (runReads === 1) {
          return HttpResponse.json(
            { code: "INTERNAL_ERROR", details: {}, message: "Unavailable", traceId: "t-run" },
            { status: 503 },
          );
        }
        const stored = billingState.world.runs.find((item) => item.run.id === run.id)?.run;
        if (stored === undefined) throw new TypeError("Stored Stripe run missing");
        stored.status = "COMPLETED";
        return HttpResponse.json(stored);
      }),
    );

    await renderPage({ scenario: "billingStripe" });
    expect(
      await screen.findByText("No s'ha pogut actualitzar l'estat dels cobraments."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Torna-ho a provar" })).toBeVisible();
    expect(screen.getByText("Cobrant les targetes…")).toBeVisible();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5_200));
    });
    await waitFor(() => {
      expect(runReads).toBeGreaterThanOrEqual(2);
      expect(requests("GET", "/billing/periods/2026-09").length).toBeGreaterThan(1);
    });
    await waitFor(() => {
      expect(screen.queryByText("Cobrant les targetes…")).toBeNull();
    });
  }, 20_000);

  it("E8-W04 6b: a CHARGING period refreshes after detail moves GENERATED to COMPLETED", async () => {
    mockScenario("billingStripe");
    const api = client();
    const period = await api.GET("/billing/periods/{period}", {
      params: { path: { period: "2026-09" } },
    });
    const run = period.data?.run;
    if (run === undefined || run === null) throw new TypeError("No Stripe run");
    await api.POST("/billing/runs/{id}/card-charges", {
      params: { header: { "Idempotency-Key": crypto.randomUUID() }, path: { id: run.id } },
    });
    sent.length = 0;
    let reads = 0;
    let detailCompleted = false;
    server.use(
      http.get("*/api/v1/billing/periods/2026-09", () =>
        HttpResponse.json({
          ...period.data,
          run: { ...run, status: detailCompleted ? "COMPLETED" : "CHARGING" },
        }),
      ),
      http.get("*/api/v1/billing/runs/:id", () => {
        reads += 1;
        const stored = billingState.world.runs.find((item) => item.run.id === run.id)?.run;
        if (stored === undefined) throw new TypeError("Stored Stripe run missing");
        if (reads === 1) return HttpResponse.json({ ...stored, status: "GENERATED" });
        detailCompleted = true;
        stored.status = "COMPLETED";
        return HttpResponse.json(stored);
      }),
    );

    await renderPage({ scenario: "billingStripe" });
    expect(await screen.findByText("Cobrant les targetes…")).toBeVisible();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5_200));
    });
    await waitFor(() => {
      expect(reads).toBeGreaterThanOrEqual(2);
      expect(requests("GET", "/billing/periods/2026-09").length).toBeGreaterThan(1);
    });
    await waitFor(() => {
      expect(screen.queryByText("Cobrant les targetes…")).toBeNull();
    });
  }, 20_000);
});

describe("E8-W01 second review (01-10): the manual receipt's member and errors, the earliest collection date, a rolled-back receipt", () => {
  async function openManual() {
    fireEvent.click(screen.getByRole("button", { name: "Rebut manual" }));
    const dialog = await screen.findByRole("dialog", { name: "Rebut manual" });
    fireEvent.change(within(dialog).getByLabelText("Abonat"), { target: { value: "Laura" } });
    fireEvent.click(
      await within(dialog).findByRole("radio", { name: "Laura Serra Vidal · núm. 87" }),
    );
    fireEvent.change(within(dialog).getByLabelText("Concepte (línia 1)"), {
      target: { value: "Material" },
    });
    fireEvent.change(within(dialog).getByLabelText("Import (línia 1)"), {
      target: { value: "15" },
    });
    return dialog;
  }

  it("R-12-19: a new search drops the chosen member, so the receipt never goes to a member the list no longer shows", async () => {
    await renderPage();
    const dialog = await openManual();
    expect(
      within(dialog).getByRole("checkbox", { name: "Cobra'l amb la propera remesa" }),
    ).toBeVisible();
    fireEvent.change(within(dialog).getByLabelText("Abonat"), { target: { value: "Pere" } });
    expect(within(dialog).queryByRole("radio", { name: "Laura Serra Vidal · núm. 87" })).toBeNull();
    expect(
      within(dialog).queryByRole("checkbox", { name: "Cobra'l amb la propera remesa" }),
    ).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Crea el rebut" }));
    expect(await within(dialog).findByText("Tria un abonat.")).toBeVisible();
    expect(requests("POST", "/invoices")).toHaveLength(0);
  });

  it("E8-W01 round 2 #2: the manual adjustment search has no ACTIVE filter, shows a LEFT member's display status and creates their receipt", async () => {
    server.use(
      http.get("*/api/v1/members", ({ request }) => {
        expect(new URL(request.url).searchParams.getAll("filter")).toEqual([]);
        return HttpResponse.json({
          appliedFilters: [],
          items: [
            {
              displayStatus: { kind: "LEFT", label: "baixa" },
              fullName: "Rita Fictícia",
              id: "b1000000-0000-4000-8000-000000000777",
              memberNumber: 777,
              paymentMethod: { type: "MANUAL" },
            },
          ],
          page: 0,
          size: 20,
          totalItems: 1,
          totalPages: 1,
        });
      }),
      http.post("*/api/v1/invoices", () => {
        const source = billingState.world.invoices.find(
          (item) => item.invoice.displayNumber === "2026-0915",
        )?.invoice;
        if (source === undefined) throw new TypeError("Manual invoice fixture unavailable");
        const amount = { amountMinor: -3000, currency: "EUR" as const };
        const zero = { amountMinor: 0, currency: "EUR" as const };
        return HttpResponse.json(
          {
            ...source,
            base: amount,
            displayNumber: "2026-1081",
            id: "b2000000-0000-4000-8000-000000001081",
            kind: "MANUAL",
            lines: [
              {
                ...source.lines[0],
                base: amount,
                description: "Retorn quota en efectiu",
                origin: "ADJUSTMENT",
                tax: zero,
                total: amount,
              },
            ],
            memberId: "b1000000-0000-4000-8000-000000000777",
            memberSnapshot: { fullName: "Rita Fictícia", number: 777, taxId: null },
            note: null,
            number: 1081,
            paymentMethod: {
              channel: "CASH",
              holderName: null,
              last4: null,
              mandateRef: null,
              maskedAccount: null,
              type: "MANUAL",
            },
            refundedTotal: zero,
            remittanceId: null,
            runId: null,
            status: "PENDING",
            tax: zero,
            total: amount,
            version: 1,
          },
          { status: 201 },
        );
      }),
    );
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Rebut manual" }));
    const dialog = await screen.findByRole("dialog", { name: "Rebut manual" });
    fireEvent.change(within(dialog).getByLabelText("Abonat"), { target: { value: "Rita" } });
    expect(await within(dialog).findByText("baixa")).toHaveClass("ah-badge");
    fireEvent.click(within(dialog).getByRole("radio", { name: "Rita Fictícia · núm. 777" }));
    fireEvent.change(within(dialog).getByLabelText("Concepte (línia 1)"), {
      target: { value: "Retorn quota en efectiu" },
    });
    fireEvent.change(within(dialog).getByLabelText("Import (línia 1)"), {
      target: { value: "-30" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Crea el rebut" }));
    expect(await screen.findByText("Rebut 2026-1081 creat.")).toBeVisible();
    expect(requests("POST", "/invoices")[0]?.body).toMatchObject({
      memberId: "b1000000-0000-4000-8000-000000000777",
    });
  });

  it("E8-W01 round 2 #2: 409 MEMBER_ERASED is mapped to the manual receipt's member field", async () => {
    server.use(
      http.post("*/api/v1/invoices", () =>
        HttpResponse.json(
          { code: "MEMBER_ERASED", details: {}, message: "Erased", traceId: "t-erased" },
          { status: 409 },
        ),
      ),
    );
    await renderPage();
    const dialog = await openManual();
    fireEvent.click(within(dialog).getByRole("button", { name: "Crea el rebut" }));
    const memberField = within(dialog).getByLabelText("Abonat").closest(".ah-form-field");
    expect(memberField).not.toBeNull();
    await waitFor(() => {
      expect(memberField).toHaveTextContent(
        "Aquest abonat ha estat suprimit i ja no es pot modificar.",
      );
    });
  });

  it("R-12-19: the api's 400 on a line's member (lines[0].description) sits on that line, and on includeInNextRun under its checkbox, with no second generic alert", async () => {
    server.use(
      http.post("*/api/v1/invoices", () =>
        HttpResponse.json(
          {
            code: "VALIDATION_ERROR",
            details: {
              fieldErrors: [
                { code: "TOO_LONG", field: "lines[0].description" },
                { code: "INVALID", field: "includeInNextRun" },
              ],
            },
            message: "Invalid",
            traceId: "t-400",
          },
          { status: 400 },
        ),
      ),
    );
    await renderPage();
    const dialog = await openManual();
    fireEvent.click(
      within(dialog).getByRole("checkbox", { name: "Cobra'l amb la propera remesa" }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Crea el rebut" }));
    // FormField draws its error inside the field's own block.
    const fieldOf = (label: string) => {
      const field = within(dialog).getByLabelText(label).closest(".ah-form-field");
      if (!(field instanceof HTMLElement)) throw new TypeError(`No field ${label}`);
      return field;
    };
    await waitFor(() => {
      expect(fieldOf("Concepte (línia 1)")).toHaveTextContent("Reviseu els camps destacats.");
    });
    expect(fieldOf("Import (línia 1)")).not.toHaveTextContent("Reviseu els camps destacats.");
    expect(
      within(dialog).getByRole("checkbox", { name: "Cobra'l amb la propera remesa" }),
    ).toHaveAccessibleDescription("Reviseu els camps destacats.");
    // The two field messages only: no general alert repeating them.
    expect(within(dialog).getAllByRole("alert")).toHaveLength(2);
  });

  it("R-12-11: after 422 COLLECTION_DATE_TOO_SOON the admin generates with the api's first day (collectionDate = details.earliest, another payload, another key)", async () => {
    vi.setSystemTime(new Date("2026-08-31T08:00:00Z"));
    await renderPage({ scenario: "billingStale" });
    const [simulate] = screen.getAllByRole("button", { name: "1 · SIMULA EL MES" });
    if (simulate === undefined) throw new TypeError("No simulate button");
    fireEvent.click(simulate);
    await screen.findByText("Mes simulat.");
    fireEvent.click(screen.getByRole("button", { name: "2 · GENERA REMESA SEPA (XML)" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Genera" }));
    const earliest = await within(dialog).findByRole("button", {
      name: "Genera amb cobrament el 02/09/2026",
    });
    expect(within(dialog).queryByRole("button", { name: "Genera" })).toBeNull();
    fireEvent.click(earliest);
    expect(await screen.findByText(/rebuts generats/u)).toBeVisible();
    const runs = requests("POST", "/billing/runs");
    expect(runs).toHaveLength(2);
    expect(runs[0]?.body).not.toHaveProperty("collectionDate");
    expect(runs[1]?.body).toMatchObject({ collectionDate: "2026-09-02", period: "2026-09" });
    expect(runs[1]?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/u);
    expect(runs[1]?.idempotencyKey).not.toBe(runs[0]?.idempotencyKey);
  });

  it("E8-W01 round 2 #1: 422 → accepted earliest → 503 → retry keeps the accepted body and the same Idempotency-Key", async () => {
    vi.setSystemTime(new Date("2026-08-31T08:00:00Z"));
    let attempt = 0;
    server.use(
      http.post("*/api/v1/billing/runs", () => {
        attempt += 1;
        return attempt === 1
          ? HttpResponse.json(
              {
                code: "COLLECTION_DATE_TOO_SOON",
                details: { earliest: "2026-09-02", requested: "2026-09-01" },
                message: "Too soon",
                traceId: "t-422",
              },
              { status: 422 },
            )
          : HttpResponse.json(
              { code: "INTERNAL_ERROR", details: {}, message: "Unavailable", traceId: "t-503" },
              { status: 503 },
            );
      }),
    );
    await renderPage({ scenario: "billingStale" });
    const [simulate] = screen.getAllByRole("button", { name: "1 · SIMULA EL MES" });
    if (simulate === undefined) throw new TypeError("No simulate button");
    fireEvent.click(simulate);
    await screen.findByText("Mes simulat.");
    fireEvent.click(screen.getByRole("button", { name: "2 · GENERA REMESA SEPA (XML)" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Genera" }));
    fireEvent.click(
      await within(dialog).findByRole("button", {
        name: "Genera amb cobrament el 02/09/2026",
      }),
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "S'ha produït un error inesperat.",
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Genera amb cobrament el 02/09/2026" }),
    );
    await waitFor(() => {
      expect(requests("POST", "/billing/runs")).toHaveLength(3);
    });
    const runs = requests("POST", "/billing/runs");
    expect(runs[1]?.body).toEqual(runs[2]?.body);
    expect(runs[1]?.body).toMatchObject({ collectionDate: "2026-09-02" });
    expect(runs[1]?.idempotencyKey).toBe(runs[2]?.idempotencyKey);
  });

  it("R-12-14 E89: a receipt the admin cancelled before the rollback reads «anul·lat · retrocés» in the list and in its drawer, with its own reason", async () => {
    const api = client();
    const found = await api.GET("/invoices", { params: { query: { q: "2026-0915" } } });
    const joan = found.data?.items[0];
    if (joan === undefined) throw new TypeError("No 2026-0915");
    const read = await api.GET("/invoices/{id}", { params: { path: { id: joan.id } } });
    await api.POST("/invoices/{id}/cancellation", {
      body: { reason: "Baixa del club", version: read.data?.version ?? 0 },
      params: { header: { "Idempotency-Key": crypto.randomUUID() }, path: { id: joan.id } },
    });
    const period = await api.GET("/billing/periods/{period}", {
      params: { path: { period: "2026-09" } },
    });
    await api.POST("/billing/runs/{id}/rollback", {
      body: { confirmation: "RETROCEDIR", reason: "Preu equivocat" },
      params: {
        header: { "Idempotency-Key": crypto.randomUUID() },
        path: { id: period.data?.run?.id ?? "" },
      },
    });
    await renderPage({ search: "?mes=2026-09&filter=status:eq:CANCELLED" });
    expect(cells(await invoiceRow("2026-0915")).at(6)).toBe("anul·lat · retrocés");
    const dialog = await openDrawer("2026-0915");
    await within(dialog).findByText("Quota Abonat — Setembre 2026");
    expect(dialog).toHaveTextContent("anul·lat · retrocés");
    expect(dialog).toHaveTextContent("retrocés de la remesa · Baixa del club");
  });
});

describe("R-12-19 and R-12-26: the manual receipt and the accounting export", () => {
  it("R-12-19: [Rebut manual] finds the member, sends the lines in minor units, and the api's numbering blocks the rollback (MANUAL_INVOICE_AFTER)", async () => {
    await renderPage();
    expect(await screen.findByRole("button", { name: "Retrocedeix la remesa" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Rebut manual" }));
    const dialog = await screen.findByRole("dialog", { name: "Rebut manual" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Crea el rebut" }));
    expect(await within(dialog).findByText("Tria un abonat.")).toBeVisible();
    expect(within(dialog).getByText("Escriu el concepte.")).toBeVisible();
    expect(requests("POST", "/invoices")).toHaveLength(0);

    fireEvent.change(within(dialog).getByLabelText("Abonat"), { target: { value: "Laura" } });
    fireEvent.click(
      await within(dialog).findByRole("radio", { name: "Laura Serra Vidal · núm. 87" }),
    );
    expect(
      within(dialog).getByRole("checkbox", { name: "Cobra'l amb la propera remesa" }),
    ).toBeVisible();
    fireEvent.change(within(dialog).getByLabelText("Concepte (línia 1)"), {
      target: { value: "Ajust quota setembre" },
    });
    fireEvent.change(within(dialog).getByLabelText("Import (línia 1)"), {
      target: { value: "-30" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Crea el rebut" }));

    expect(await screen.findByText("Rebut 2026-1080 creat.")).toBeVisible();
    expect(requests("POST", "/invoices")[0]?.body).toEqual({
      lines: [
        {
          base: { amountMinor: -3000, currency: "EUR" },
          description: "Ajust quota setembre",
          taxPercent: 0,
        },
      ],
      memberId: "member-laura",
      note: "",
    });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Retrocedeix la remesa" })).toBeNull();
    });
  });

  it("R-12-26: «Exporta per a comptabilitat» → GET /billing/exports?period=2026-09&format=csv, saved as facturacio-2026-09.csv", async () => {
    const createObjectURL = vi.fn(() => "blob:export");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    const saved: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(this.download);
    });
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Exporta per a comptabilitat" }));
    const dialog = await screen.findByRole("dialog", { name: "Exporta per a comptabilitat" });
    expect(
      within(dialog).getByText("Una fila per línia de rebut; format CSV amb separador «;»."),
    ).toBeVisible();
    await waitFor(() => {
      expect(within(dialog).getByRole("radio", { name: "CSV" })).toBeChecked();
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Exporta" }));
    await waitFor(() => {
      expect(saved).toEqual(["facturacio-2026-09.csv"]);
    });
    const [exported] = requests("GET", "/billing/exports");
    expect(Object.fromEntries(exported?.url.searchParams ?? [])).toEqual({
      format: "csv",
      period: "2026-09",
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});

describe("E8-W01 round 2 #7: member history, charging copy and the Docker defaults", () => {
  it("Q3: a memberId link without mes lists all months, names that scope and selecting a month restores period:eq", async () => {
    const lauraId = billingState.world.members.find(
      (member) => member.fullName === "Laura Serra",
    )?.id;
    if (lauraId === undefined) throw new TypeError("Laura's billing id is unavailable");
    await renderPage({ search: `?filter=memberId:eq:${lauraId}` });
    expect(screen.getByRole("heading", { level: 1, name: "Tots els mesos" })).toBeVisible();
    await waitFor(() => {
      const filters = requests("GET", "/invoices").at(-1)?.url.searchParams.getAll("filter");
      expect(filters).toContain(`memberId:eq:${lauraId}`);
      expect(filters?.some((filter) => filter.startsWith("period:eq:"))).toBe(false);
    });
    expect(await screen.findByText("Filtre (1): Abonat = «Laura Serra»")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Mes següent" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Setembre 2026" })).toBeVisible();
    await waitFor(() => {
      expect(requests("GET", "/invoices").at(-1)?.url.searchParams.getAll("filter")).toEqual([
        "period:eq:2026-09",
        `memberId:eq:${lauraId}`,
      ]);
    });
  });

  it("Q6: e2e-docker defaults to four workers and gives Chromium host IPC", () => {
    const script = readFileSync(
      resolve(import.meta.dirname, "../../../../scripts/e2e-docker.sh"),
      "utf8",
    );
    expect(script).toContain("default_playwright_workers=4");
    expect(script).toContain("--ipc=host");
  });
});

describe("E8-W01 step 10: the D6 literals in ca (mockup V7) and the same keys in es and en", () => {
  it("E8-W01: «Pas 1 — Simulació: incidències primer», «Actius amb pagament en efectiu», «Marcar cobrat (selecció)», «Exporta per a comptabilitat»", async () => {
    const ca = (await loadNamespace("ca", "admin-billing")) as {
      actions: Record<string, string>;
      simulation: Record<string, string>;
    };
    expect(ca.simulation.incidentsTitle).toBe("Pas 1 — Simulació: incidències primer");
    expect(ca.simulation.cashTitle).toBe("Actius amb pagament en efectiu");
    expect(ca.actions.markPaidSelection).toBe("Marcar cobrat (selecció)");
    expect(ca.actions.accountingExport).toBe("Exporta per a comptabilitat");
    expect(ca.actions.simulate).toBe("1 · SIMULA EL MES");
    expect(ca.actions.generateSepa).toBe("2 · GENERA REMESA SEPA (XML)");
    expect(ca.actions.rollback).toBe("Retrocedeix la remesa");
    const enums = (await loadNamespace("ca", "enums")) as Record<string, Record<string, string>>;
    expect(enums.billingIncident?.NO_BANK_ACCOUNT).toBe("sense compte bancari informat");
    expect(enums.billingIncident?.NO_PRICE).toBe("sense tarifa assignada");
    expect(enums.billingIncident?.MEMBER_NOT_ACTIVE).toBe("abonat no actiu");
    expect(enums.billingIncident?.PAYMENT_METHOD_CHANGED).toBe("mètode de pagament canviat");
    expect(enums.paymentMethodType).toEqual({
      CARD: "Targeta",
      MANUAL: "Efectiu",
      SEPA_DD: "Domiciliació",
    });
  });

  it("E8-W01: D6 in es and en reads its own month titles and never a Catalan literal", async () => {
    await renderPage({ locale: "es" });
    expect(screen.getByRole("heading", { level: 1, name: "Septiembre 2026" })).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Paso 1 — Simulación: incidencias primero" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "2 · GENERAR REMESA SEPA (XML)" })).toBeVisible();
    cleanup();
    await renderPage({ locale: "en" });
    expect(screen.getByRole("heading", { level: 1, name: "September 2026" })).toBeVisible();
    expect(screen.getByText("no bank account on file")).toBeVisible();
    // The frozen description stays as the api sent it (R-12-30).
    expect(cells(await invoiceRow("2026-0912")).slice(3, 7)).toEqual([
      "Quota Abonat 2 gossos — Setembre 2026",
      "€90.00",
      "Direct debit",
      "in remittance",
    ]);
    const esEnums = (await loadNamespace("es", "enums")) as Record<string, Record<string, string>>;
    const enEnums = (await loadNamespace("en", "enums")) as Record<string, Record<string, string>>;
    expect(esEnums.billingIncident?.MEMBER_NOT_ACTIVE).toBe("abonado no activo");
    expect(esEnums.billingIncident?.PAYMENT_METHOD_CHANGED).toBe("método de pago cambiado");
    expect(enEnums.billingIncident?.MEMBER_NOT_ACTIVE).toBe("member not active");
    expect(enEnums.billingIncident?.PAYMENT_METHOD_CHANGED).toBe("payment method changed");
  });
});

describe("E8-W04 snapshot deltas (ruling E90) on D6", () => {
  it("E8-W04 E90 (d): before a run, «Import de la remesa» reads the simulation's collectionDate", async () => {
    await renderPage({ search: "?mes=2026-10" });
    const simulate = screen.getAllByRole("button", { name: "1 · SIMULA EL MES" })[0];
    if (simulate === undefined) throw new TypeError("No simulate button");
    fireEvent.click(simulate);
    await screen.findByText("sense compte bancari informat");
    expect(requests("POST", "/billing/runs")).toHaveLength(0);
    expect(screen.getByText("Import de la remesa").parentElement).toHaveTextContent(
      "data de cobrament: 01/10",
    );
  });

  it("E8-W04 E90 (a): an incident about a receipt shows its number, which opens the receipt", async () => {
    mockScenario("admin");
    const month = await client().GET("/billing/periods/{period}", {
      params: { path: { period: "2026-09" } },
    });
    const target = billingState.world.invoices.find(
      (item) => item.invoice.displayNumber === "2026-0912",
    )?.invoice;
    const simulation = month.data?.simulation;
    if (simulation == null || target === undefined) throw new TypeError("No September receipt");
    server.use(
      http.get("*/api/v1/billing/periods/2026-09", () =>
        HttpResponse.json({
          ...month.data,
          simulation: {
            ...simulation,
            incidents: [
              {
                code: "PAYMENT_METHOD_CHANGED",
                displayNumber: target.displayNumber,
                invoiceId: target.id,
                memberId: target.memberId,
                memberName: "Laura Serra",
              },
            ],
          },
        }),
      ),
    );
    await renderPage({ scenario: "admin" });
    const card = (await screen.findByText("mètode de pagament canviat")).closest(
      ".billing-simulation",
    );
    if (!(card instanceof HTMLElement)) throw new TypeError("No simulation card");
    fireEvent.click(within(card).getByRole("button", { name: "Obre el rebut 2026-0912" }));
    expect(await screen.findByRole("dialog", { name: "Rebut 2026-0912" })).toBeVisible();
  });
});

describe("E8-W04 step 6(b): one wording per receipt state on D6, its drawer and /rebuts", () => {
  it("E8-W04 6(b): a fully refunded receipt reads enums:invoiceStatus.REFUNDED, the key /rebuts reads", async () => {
    const refunded = invoiceStatusView({
      paymentMethodType: "CARD",
      refundedTotal: { amountMinor: 4500, currency: "EUR" },
      status: "PAID",
      total: { amountMinor: 4500, currency: "EUR" },
    });
    expect(refunded.key).toBe("enums:invoiceStatus.REFUNDED");
    const memberPage = readFileSync(
      resolve(import.meta.dirname, "../../../clubs/src/billing/InvoicesPage.tsx"),
      "utf8",
    );
    expect(memberPage.match(/t\("enums:invoiceStatus\.REFUNDED"\)/gu)).toHaveLength(2);
    expect(memberPage).not.toContain("billing:list.refunded");
    const words = await Promise.all(
      (["ca", "es", "en"] as const).map(
        async (locale) =>
          ((await loadNamespace(locale, "enums")) as Record<string, Record<string, string>>)
            .invoiceStatus?.REFUNDED,
      ),
    );
    expect(words).toEqual(["reemborsat", "reembolsado", "refunded"]);
  });
});
