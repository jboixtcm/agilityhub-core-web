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
import { StrictMode } from "react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { RemittancesPage } from "./RemittancesPage";

const branding: Branding = {
  ...brandingCanicFixture,
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
  window.history.replaceState(null, "", "/");
});
afterAll(() => {
  server.close();
});

async function renderPage(search = "", strict = false) {
  window.history.replaceState(null, "", `/facturacio/remeses${search}`);
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-billing", "census", "common", "enums", "errors"],
    storage: undefined,
  });
  const onNavigate = vi.fn();
  const page = (
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <RemittancesPage
          client={createApiClient({
            baseUrl: `${window.location.origin}/api/v1`,
            getLocale: () => "ca",
          })}
          onNavigate={onNavigate}
        />
      </BrandingProvider>
    </I18nextProvider>
  );
  render(strict ? <StrictMode>{page}</StrictMode> : page);
  await screen.findByRole("heading", { level: 1, name: "Remeses" });
  return { onNavigate };
}

async function rows() {
  const table = await screen.findByRole("table", { name: "Remeses SEPA" });
  return waitFor(() => {
    const found = within(table)
      .getAllByRole("row")
      .filter((row) => row.hasAttribute("data-remittance-status"));
    expect(found).toHaveLength(3);
    return found;
  });
}

function text(row: HTMLElement) {
  return within(row)
    .getAllByRole("cell")
    .map((cell) => cell.textContent.replace(/\s+/gu, " ").trim());
}

describe("S12 §2 «D6 (remeses)» /facturacio/remeses (no mockup: design system, §13-12)", () => {
  it("E8-W01 round 2 #5: a bare route waits for saved views and applies the default before writing list state into the URL", async () => {
    localStorage.setItem("agilityhub.list.defaultView.remittances", "view-remittances-rolled-back");
    server.use(
      http.get("*/api/v1/saved-views", ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("listKey") !== "remittances") return HttpResponse.json([]);
        return HttpResponse.json([
          {
            columns: [
              "period",
              "creationAt",
              "count",
              "total",
              "requestedCollectionDate",
              "status",
              "actions",
            ],
            filters: [{ field: "status", op: "eq", value: "ROLLED_BACK" }],
            id: "view-remittances-rolled-back",
            listKey: "remittances",
            name: "Retrocedides",
            shared: false,
            sort: [],
            version: 1,
          },
        ]);
      }),
    );

    await renderPage("", true);
    await waitFor(() => {
      expect(new URLSearchParams(window.location.search).getAll("filter")).toEqual([
        "status:eq:ROLLED_BACK",
      ]);
    });
    await waitFor(() => {
      const lists = sent.filter((entry) => entry.url.pathname === "/api/v1/remittances");
      expect(lists.at(-1)?.url.searchParams.getAll("filter")).toEqual(["status:eq:ROLLED_BACK"]);
    });
    expect(await screen.findByText("Vistes: «Retrocedides»")).toBeVisible();
  });

  it("lists the remittances newest first with month, creation, receipts, amount, collection date and status; no free-text search", async () => {
    const { onNavigate } = await renderPage();
    const [september, august, rolledBack] = await rows();
    if (september === undefined || august === undefined || rolledBack === undefined) {
      throw new TypeError("Three remittances expected");
    }
    expect(text(september).slice(0, 6)).toEqual([
      "Setembre 2026",
      "25/08/2026 09:20",
      "164",
      "6.240,00 €",
      "01/09/2026",
      "generada",
    ]);
    expect(text(august).slice(0, 6)).toEqual([
      "Agost 2026",
      "27/07/2026 09:05",
      "164",
      "6.240,00 €",
      "01/08/2026",
      "enviada al banc",
    ]);
    expect(text(rolledBack).at(5)).toBe("retrocedida");
    // A `q` would be 400 INVALID_FILTER (S12 §6): there is no search box.
    expect(screen.queryByRole("searchbox")).toBeNull();
    const list = sent.find((entry) => entry.url.pathname === "/api/v1/remittances");
    expect(list?.url.searchParams.has("q")).toBe(false);
    fireEvent.click(screen.getByRole("link", { name: "‹ Facturació" }));
    expect(onNavigate).toHaveBeenCalledWith("/facturacio");
  });

  it("[Descarrega l'XML] follows the api's signed URL (GET /remittances/{id}/file), never reading the XML", async () => {
    const clicked: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this.href);
    });
    await renderPage();
    const [september] = await rows();
    if (september === undefined) throw new TypeError("No September row");
    fireEvent.click(within(september).getByRole("button", { name: "Descarrega l'XML" }));
    await waitFor(() => {
      expect(clicked).toHaveLength(1);
    });
    // The api's attachment name (SEPA-06): `remesa-{period}-{seq}.xml` (was `remesa-{period}.xml`).
    expect(clicked[0]).toMatch(
      /^https:\/\/files\.example\.test\/remittances\/[0-9a-f-]+\/remesa-2026-09-1\.xml\?/u,
    );
    const file = sent.filter((entry) => entry.url.pathname.endsWith("/file"));
    expect(file.map((entry) => entry.method)).toEqual(["GET"]);
  });

  it("R-12-15 [Marca com a enviada al banc]: a confirmation warns the rollback becomes impossible, then POST …/submission {submittedAt} with a key; the row reads «enviada al banc»", async () => {
    await renderPage();
    const [september] = await rows();
    if (september === undefined) throw new TypeError("No September row");
    fireEvent.click(within(september).getByRole("button", { name: "Marca com a enviada al banc" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Marca com a enviada al banc · Setembre 2026",
    });
    expect(
      within(dialog).getByText(
        "La remesa quedarà marcada com a enviada al banc. A partir d'aquí ja no es podrà retrocedir.",
      ),
    ).toBeVisible();
    expect(within(dialog).getByLabelText("Data d'enviament al banc")).toHaveValue("2026-08-26");
    fireEvent.click(within(dialog).getByRole("button", { name: "Marca com a enviada" }));
    expect(await screen.findByText("Remesa marcada com a enviada al banc.")).toBeVisible();
    const [submission] = sent.filter((entry) => entry.url.pathname.endsWith("/submission"));
    expect(submission?.body).toEqual({ submittedAt: "2026-08-26" });
    expect(submission?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/u);
    await waitFor(async () => {
      const [first] = await rows();
      if (first === undefined) throw new TypeError("No first row");
      expect(text(first).at(5)).toBe("enviada al banc");
      expect(
        within(first).queryByRole("button", { name: "Marca com a enviada al banc" }),
      ).toBeNull();
    });
  });

  it("R-12-15 a remittance another admin sent meanwhile answers 409 INVALID_STATE: the error stays in the dialog and the list is read again", async () => {
    await renderPage();
    const [september] = await rows();
    if (september === undefined) throw new TypeError("No September row");
    fireEvent.click(within(september).getByRole("button", { name: "Marca com a enviada al banc" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Marca com a enviada al banc · Setembre 2026",
    });
    // The other admin's submission, straight to the api with its own key.
    const generated = (await (
      await fetch(`${window.location.origin}/api/v1/remittances?filter=status:eq:GENERATED`)
    ).json()) as { items: { id: string }[] };
    expect(generated.items).toHaveLength(1);
    const other = await fetch(
      `${window.location.origin}/api/v1/remittances/${generated.items[0]?.id ?? ""}/submission`,
      {
        body: JSON.stringify({ submittedAt: "2026-08-25" }),
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        method: "POST",
      },
    );
    expect(other.status).toBe(200);
    const listReads = sent.filter((entry) => entry.url.pathname === "/api/v1/remittances").length;
    fireEvent.click(within(dialog).getByRole("button", { name: "Marca com a enviada" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Aquest element no està en un estat vàlid per a aquesta operació.",
    );
    await waitFor(() => {
      expect(
        sent.filter((entry) => entry.url.pathname === "/api/v1/remittances").length,
      ).toBeGreaterThan(listReads);
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel·la" }));
    await waitFor(async () => {
      const [first] = await rows();
      if (first === undefined) throw new TypeError("No first row");
      expect(text(first).at(5)).toBe("enviada al banc");
    });
  });

  it("R-12-15 the day it went to the bank runs from the remittance's club-local day to today (snapshot b67a07b): outside it the field says so and nothing is sent", async () => {
    await renderPage();
    const [september] = await rows();
    if (september === undefined) throw new TypeError("No September row");
    fireEvent.click(within(september).getByRole("button", { name: "Marca com a enviada al banc" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Marca com a enviada al banc · Setembre 2026",
    });
    const date = within(dialog).getByLabelText("Data d'enviament al banc");
    // Created 25/08 at 09:20 club time; today is 26/08 (club time).
    expect(date).toHaveAttribute("min", "2026-08-25");
    expect(date).toHaveAttribute("max", "2026-08-26");
    const confirm = within(dialog).getByRole("button", { name: "Marca com a enviada" });
    for (const outside of ["2026-08-24", "2026-08-27"]) {
      fireEvent.change(date, { target: { value: outside } });
      expect(
        within(dialog).getByText("La data ha de ser entre el 25/08/2026 i avui."),
      ).toBeVisible();
      expect(confirm).toBeDisabled();
    }
    fireEvent.change(date, { target: { value: "2026-08-25" } });
    expect(within(dialog).queryByText("La data ha de ser entre el 25/08/2026 i avui.")).toBeNull();
    fireEvent.click(confirm);
    expect(await screen.findByText("Remesa marcada com a enviada al banc.")).toBeVisible();
    const submissions = sent.filter((entry) => entry.url.pathname.endsWith("/submission"));
    expect(submissions.map((entry) => entry.body)).toEqual([{ submittedAt: "2026-08-25" }]);
  });

  it("R-12-15 the api's 400 VALIDATION_ERROR {submittedAt} sits on the field; 409 STALE_VERSION stays in the dialog and the list is read again", async () => {
    let answer: "invalid" | "stale" = "invalid";
    server.use(
      http.post("*/api/v1/remittances/:id/submission", () =>
        answer === "invalid"
          ? HttpResponse.json(
              {
                code: "VALIDATION_ERROR",
                details: { field: "submittedAt" },
                message: "Invalid",
                traceId: "t-400",
              },
              { status: 400 },
            )
          : HttpResponse.json(
              { code: "STALE_VERSION", details: {}, message: "Stale version", traceId: "t-409" },
              { status: 409 },
            ),
      ),
    );
    await renderPage();
    const [september] = await rows();
    if (september === undefined) throw new TypeError("No September row");
    fireEvent.click(within(september).getByRole("button", { name: "Marca com a enviada al banc" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Marca com a enviada al banc · Setembre 2026",
    });
    const confirm = within(dialog).getByRole("button", { name: "Marca com a enviada" });
    fireEvent.click(confirm);
    expect(
      await within(dialog).findByText("La data ha de ser entre el 25/08/2026 i avui."),
    ).toBeVisible();
    // Only the field's message: no second, generic error under it.
    expect(within(dialog).getAllByRole("alert")).toHaveLength(1);
    answer = "stale";
    const listReads = sent.filter((entry) => entry.url.pathname === "/api/v1/remittances").length;
    fireEvent.click(confirm);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Aquest element s'ha modificat des d'un altre lloc.",
    );
    await waitFor(() => {
      expect(
        sent.filter((entry) => entry.url.pathname === "/api/v1/remittances").length,
      ).toBeGreaterThan(listReads);
    });
  });

  it("«‹ Facturació» goes back to the month D6 came from (`?mes=` stays in the address)", async () => {
    const { onNavigate } = await renderPage("?mes=2026-08");
    await rows();
    expect(new URLSearchParams(window.location.search).get("mes")).toBe("2026-08");
    const back = screen.getByRole("link", { name: "‹ Facturació" });
    expect(back).toHaveAttribute("href", "/facturacio?mes=2026-08");
    fireEvent.click(back);
    expect(onNavigate).toHaveBeenCalledWith("/facturacio?mes=2026-08");
  });

  it("a ROLLED_BACK and a SUBMITTED remittance are read-only: their XML can be downloaded, never marked as sent", async () => {
    await renderPage();
    const [, august, rolledBack] = await rows();
    if (august === undefined || rolledBack === undefined) throw new TypeError("Rows missing");
    for (const row of [august, rolledBack]) {
      expect(within(row).queryByRole("button", { name: "Marca com a enviada al banc" })).toBeNull();
    }
    expect(within(august).getByRole("button", { name: "Descarrega l'XML" })).toBeEnabled();
    // SEPA-06: the rolled-back file's button says it is cancelled.
    expect(
      within(rolledBack).getByRole("button", {
        name: "Descarrega l'XML (anul·lada, no la pugis al banc)",
      }),
    ).toBeEnabled();
  });

  it("opens a remittance: its message, sequences, XSD check and the creditor with the IBAN masked", async () => {
    await renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Obre la remesa: Setembre 2026" }));
    const drawer = await screen.findByRole("dialog", { name: "Remesa · Setembre 2026" });
    expect(await within(drawer).findByText("FRST 0 · RCUR 164")).toBeVisible();
    expect(within(drawer).getByText(/^canic-2026-09-\d+$/u)).toBeVisible();
    expect(within(drawer).getByText("Club Agility Fictici")).toBeVisible();
    // The creditor's account in the one masked format (R-03-27), as the api masks it: never an IBAN.
    expect(within(drawer).getByText("···· ···· ···· ···· 0042")).toBeVisible();
    expect(drawer).not.toHaveTextContent("ES00 ****");
    // The canonical creditor of the fixture (E147).
    expect(within(drawer).getByText("ES10ZZZG00000000")).toBeVisible();
    expect(drawer).toHaveTextContent("Identificador de creditor");
  });

  it("filters by status through the universal filter (`filter=status:eq:…`)", async () => {
    await renderPage();
    await rows();
    fireEvent.click(screen.getByText("Filtre"));
    fireEvent.change(screen.getByRole("combobox", { name: "Columna" }), {
      target: { value: "status" },
    });
    const value = screen.getByRole("combobox", { name: "Valor" });
    await waitFor(() => {
      expect(value).toBeEnabled();
    });
    fireEvent.change(value, { target: { value: "SUBMITTED" } });
    fireEvent.click(screen.getByRole("button", { name: "Afegeix el filtre" }));
    await waitFor(() => {
      const table = screen.getByRole("table", { name: "Remeses SEPA" });
      expect(
        within(table)
          .getAllByRole("row")
          .filter((row) => row.hasAttribute("data-remittance-status"))
          .map((row) => row.getAttribute("data-remittance-status")),
      ).toEqual(["SUBMITTED"]);
    });
    const last = sent.filter((entry) => entry.url.pathname === "/api/v1/remittances").at(-1);
    expect(last?.url.searchParams.getAll("filter")).toEqual(["status:eq:SUBMITTED"]);
  });
});

describe("SEPA-04 (a) [Desfés «enviada al banc»] (R-12-15, owner decision of 13 Nov 2026)", () => {
  const origin = () => window.location.origin;

  /** October simulated, generated (collection date 01/10) and marked sent, straight to the api. */
  async function octoberSent(): Promise<string> {
    const simulation = (await (
      await fetch(`${origin()}/api/v1/billing/simulations`, {
        body: JSON.stringify({ period: "2026-10" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
    ).json()) as { id: string };
    const run = (await (
      await fetch(`${origin()}/api/v1/billing/runs`, {
        body: JSON.stringify({ period: "2026-10", simulationId: simulation.id }),
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        method: "POST",
      })
    ).json()) as { remittance: { id: string; requestedCollectionDate: string } };
    expect(run.remittance.requestedCollectionDate).toBe("2026-10-01");
    await markSent(run.remittance.id);
    return run.remittance.id;
  }

  async function markSent(id: string) {
    const response = await fetch(`${origin()}/api/v1/remittances/${id}/submission`, {
      body: JSON.stringify({ submittedAt: "2026-08-26" }),
      headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      method: "POST",
    });
    expect(response.status).toBe(200);
  }

  async function rowOf(month: string) {
    const table = await screen.findByRole("table", { name: "Remeses SEPA" });
    return waitFor(() => {
      const found = within(table)
        .getAllByRole("row")
        .find((row) => within(row).queryByRole("button", { name: `Obre la remesa: ${month}` }));
      if (found === undefined) throw new TypeError(`No ${month} row`);
      return found;
    });
  }

  it("a remittance sent before its collection date offers it; the reason is required; POST …/submission-undo {reason} with a key makes it «generada» again", async () => {
    await octoberSent();
    await renderPage();
    const october = await rowOf("Octubre 2026");
    expect(text(october).at(5)).toBe("enviada al banc");
    // August went to the bank and its collection date (01/08) has come; September is not sent.
    for (const month of ["Agost 2026", "Setembre 2026"]) {
      expect(
        within(await rowOf(month)).queryByRole("button", { name: "Desfés «enviada al banc»" }),
      ).toBeNull();
    }
    fireEvent.click(within(october).getByRole("button", { name: "Desfés «enviada al banc»" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Desfés «enviada al banc» · Octubre 2026",
    });
    expect(
      within(dialog).getByText(/Fes-ho només si el banc no ha acceptat el fitxer/u),
    ).toBeVisible();
    const confirm = within(dialog).getByRole("button", { name: "Desfés «enviada»" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Motiu"), { target: { value: "   " } });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Motiu"), {
      target: { value: "El banc ha refusat el fitxer" },
    });
    fireEvent.click(confirm);
    expect(
      await screen.findByText(
        "La remesa torna a estar generada: ja no consta com a enviada al banc.",
      ),
    ).toBeVisible();
    const undo = sent.filter((entry) => entry.url.pathname.endsWith("/submission-undo"));
    expect(undo.map((entry) => entry.body)).toEqual([{ reason: "El banc ha refusat el fitxer" }]);
    expect(undo[0]?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/u);
    await waitFor(async () => {
      const row = await rowOf("Octubre 2026");
      expect(text(row).at(5)).toBe("generada");
      expect(
        within(row).getByRole("button", { name: "Marca com a enviada al banc" }),
      ).toBeVisible();
      expect(within(row).queryByRole("button", { name: "Desfés «enviada al banc»" })).toBeNull();
    });
  });

  it("409 INVALID_STATE INVOICE_CHANGED (receipts returned since) says so in the dialog and the list is read again", async () => {
    // September's run has two bank returns (the fixture): once sent, its undo is refused.
    const generated = (await (
      await fetch(`${origin()}/api/v1/remittances?filter=status:eq:GENERATED`)
    ).json()) as { items: { id: string }[] };
    await markSent(generated.items[0]?.id ?? "");
    await renderPage();
    fireEvent.click(
      within(await rowOf("Setembre 2026")).getByRole("button", {
        name: "Desfés «enviada al banc»",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Desfés «enviada al banc» · Setembre 2026",
    });
    fireEvent.change(within(dialog).getByLabelText("Motiu"), {
      target: { value: "Marcada per error" },
    });
    const listReads = sent.filter((entry) => entry.url.pathname === "/api/v1/remittances").length;
    fireEvent.click(within(dialog).getByRole("button", { name: "Desfés «enviada»" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "2 rebuts de la remesa ja han canviat (impagats, cobrats o anul·lats): la remesa ja no es pot desfer.",
    );
    await waitFor(() => {
      expect(
        sent.filter((entry) => entry.url.pathname === "/api/v1/remittances").length,
      ).toBeGreaterThan(listReads);
    });
    expect(text(await rowOf("Setembre 2026")).at(5)).toBe("enviada al banc");
  });

  it("409 INVALID_STATE COLLECTION_DATE_PASSED and 400 VALIDATION_ERROR {reason} are named in the dialog", async () => {
    let answer: "date" | "reason" = "date";
    server.use(
      http.post("*/api/v1/remittances/:id/submission-undo", () =>
        answer === "date"
          ? HttpResponse.json(
              {
                code: "INVALID_STATE",
                details: { reason: "COLLECTION_DATE_PASSED" },
                message: "Invalid state",
                traceId: "t-409",
              },
              { status: 409 },
            )
          : HttpResponse.json(
              {
                code: "VALIDATION_ERROR",
                details: { field: "reason" },
                message: "Invalid",
                traceId: "t-400",
              },
              { status: 400 },
            ),
      ),
    );
    await octoberSent();
    await renderPage();
    fireEvent.click(
      within(await rowOf("Octubre 2026")).getByRole("button", {
        name: "Desfés «enviada al banc»",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Desfés «enviada al banc» · Octubre 2026",
    });
    fireEvent.change(within(dialog).getByLabelText("Motiu"), { target: { value: "Refusat" } });
    const confirm = within(dialog).getByRole("button", { name: "Desfés «enviada»" });
    fireEvent.click(confirm);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Ja ha arribat la data de cobrament de la remesa: ja no es pot desfer.",
    );
    answer = "reason";
    fireEvent.click(confirm);
    expect(
      await within(dialog).findByText("Escriu el motiu (fins a 500 caràcters)."),
    ).toBeVisible();
    expect(within(dialog).getAllByRole("alert")).toHaveLength(1);
  });
});

describe("SEPA-06 (S12 §2 D6, decision of 13 Nov 2026): a rolled-back remittance's file is marked cancelled", () => {
  function captureLinks() {
    const clicked: { download: string; href: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push({ download: this.download, href: this.href });
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:remittance");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    return clicked;
  }

  it("marks only the ROLLED_BACK row, beside its buttons and in their names", async () => {
    await renderPage();
    const [september, august, rolledBack] = await rows();
    if (september === undefined || august === undefined || rolledBack === undefined) {
      throw new TypeError("Rows missing");
    }
    expect(within(rolledBack).getByText("Anul·lada — no la pugis al banc")).toHaveClass(
      "ah-tone--danger",
    );
    expect(
      within(rolledBack).getByRole("button", {
        name: "Excel de la remesa (anul·lada, no la pugis al banc)",
      }),
    ).toBeEnabled();
    expect(within(rolledBack).queryByRole("button", { name: "Descarrega l'XML" })).toBeNull();
    for (const row of [september, august]) {
      expect(within(row).queryByText("Anul·lada — no la pugis al banc")).toBeNull();
      expect(within(row).getByRole("button", { name: "Descarrega l'XML" })).toBeEnabled();
      expect(within(row).getByRole("button", { name: "Excel de la remesa" })).toBeEnabled();
    }
  });

  it("downloads the rolled-back XML and Excel under their cancelled names", async () => {
    const clicked = captureLinks();
    await renderPage();
    const [, , rolledBack] = await rows();
    if (rolledBack === undefined) throw new TypeError("No rolled-back row");
    fireEvent.click(
      within(rolledBack).getByRole("button", {
        name: "Descarrega l'XML (anul·lada, no la pugis al banc)",
      }),
    );
    await waitFor(() => {
      expect(clicked).toHaveLength(1);
    });
    expect(clicked[0]?.href).toMatch(/\/remesa-2026-08-1-ANULLADA-NO-PUJAR\.xml\?/u);
    fireEvent.click(
      within(rolledBack).getByRole("button", {
        name: "Excel de la remesa (anul·lada, no la pugis al banc)",
      }),
    );
    await waitFor(() => {
      expect(clicked).toHaveLength(2);
    });
    expect(clicked[1]?.download).toBe("remesa-2026-08-1-ANULLADA-NO-PUJAR.xlsx");
  });

  it("without the api's file name, the Excel is saved under the remittance's own name, never the month's alone", async () => {
    server.use(
      http.get(
        "*/api/v1/remittances/:id/spreadsheet",
        () =>
          new HttpResponse("xlsx", {
            headers: {
              "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            },
          }),
      ),
    );
    const clicked = captureLinks();
    await renderPage();
    const [september, , rolledBack] = await rows();
    if (september === undefined || rolledBack === undefined) throw new TypeError("Rows missing");
    fireEvent.click(within(september).getByRole("button", { name: "Excel de la remesa" }));
    await waitFor(() => {
      expect(clicked).toHaveLength(1);
    });
    fireEvent.click(
      within(rolledBack).getByRole("button", {
        name: "Excel de la remesa (anul·lada, no la pugis al banc)",
      }),
    );
    await waitFor(() => {
      expect(clicked).toHaveLength(2);
    });
    expect(clicked.map((link) => link.download)).toEqual([
      "remesa-2026-09-1.xlsx",
      "remesa-2026-08-1-ANULLADA-NO-PUJAR.xlsx",
    ]);
  });
});
