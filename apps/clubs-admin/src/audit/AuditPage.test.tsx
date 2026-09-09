import { createApiClient } from "@agilityhub/api-client";
import { mockScenario, resetAuditMockState } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { DogsPage, MembersPage } from "../census/CensusListPage";

import { MemberAuditPage } from "./AuditPage";
import { ExportJobsProvider } from "./ExportsDrawer";
import { LastChange } from "./LastChange";

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
  resetAuditMockState();
  mockScenario("admin");
  window.history.replaceState(null, "", "/");
});
afterAll(() => {
  server.close();
});

async function renderAudit() {
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-audit", "census", "errors"],
    storage: undefined,
  });
  const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <ExportJobsProvider client={client}>
          <MemberAuditPage client={client} id="member-laura" />
        </ExportJobsProvider>
      </BrandingProvider>
    </I18nextProvider>,
  );
}

async function renderCensus(kind: "dogs" | "members") {
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-audit", "census", "errors"],
    storage: undefined,
  });
  const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <ExportJobsProvider client={client}>
          {kind === "members" ? <MembersPage client={client} /> : <DogsPage client={client} />}
        </ExportJobsProvider>
      </BrandingProvider>
    </I18nextProvider>,
  );
}

describe("T-14-26 member audit and exports", () => {
  it("filters by action and opens the masked before/after change drawer", async () => {
    window.history.replaceState(null, "", "/abonats/member-laura/auditoria");
    await renderAudit();

    expect(await screen.findByRole("heading", { name: "Auditoria de l'abonat" })).toBeVisible();
    const actionFilter = screen.getByRole("combobox", { name: "Acció" });
    fireEvent.change(actionFilter, { target: { value: "MEMBER_PAYMENT_METHOD_CHANGED" } });

    const action = await screen.findByRole("link", { name: "Mètode de pagament modificat" });
    expect(screen.queryByRole("link", { name: "Modalitat modificada" })).not.toBeInTheDocument();
    fireEvent.click(action);

    const drawer = await screen.findByRole("dialog", { name: "Detall del canvi" });
    expect(drawer).toHaveTextContent("paymentMethod.iban");
    expect(drawer).toHaveTextContent("···· ···· ···· ···· 2231");
    expect(drawer).toHaveTextContent("···· ···· ···· ···· 8867");
  });

  it("opens the exports drawer for a queued job and exposes its READY download", async () => {
    window.history.replaceState(null, "", "/abonats/member-laura/auditoria");
    await renderAudit();
    await screen.findByRole("link", { name: "Mètode de pagament modificat" });

    const exportSummary = screen.getByText("Excel · PDF").closest("summary");
    if (exportSummary === null) throw new Error("Expected the export menu");
    fireEvent.click(exportSummary);
    fireEvent.click(screen.getByRole("button", { name: "Excel" }));

    const drawer = await screen.findByRole("dialog", { name: "Exportacions" });
    expect(drawer).toHaveTextContent("Preparant l'exportació…");
    expect(
      await screen.findByRole("link", { name: "Descarrega auditoria_20260803-1025.xlsx" }),
    ).toHaveAttribute("href", "/api/v1/exports/00000000-0000-4000-8000-000000000402/download");
  });

  it("shows the catalogued EXPORT_LIMIT explanation in the exports drawer", async () => {
    server.use(
      http.get("*/api/v1/audit-entries/export", () =>
        HttpResponse.json(
          { code: "EXPORT_LIMIT", details: {}, message: "Limit", traceId: "mock-trace" },
          { status: 422 },
        ),
      ),
    );
    window.history.replaceState(null, "", "/abonats/member-laura/auditoria");
    await renderAudit();
    await screen.findByRole("link", { name: "Mètode de pagament modificat" });

    const exportSummary = screen.getByText("Excel · PDF").closest("summary");
    if (exportSummary === null) throw new Error("Expected the export menu");
    fireEvent.click(exportSummary);
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));

    expect(
      await screen.findByText(/S'ha assolit el límit d'exportacions simultànies/u),
    ).toBeVisible();
  });

  it.each([
    ["members", "Abonats", "/abonats"],
    ["dogs", "Gossos", "/gossos"],
  ] as const)(
    "routes a queued %s list export into the global drawer",
    async (kind, title, path) => {
      server.use(
        http.get(`*/api/v1/${kind}/export`, () =>
          HttpResponse.json(
            {
              jobId: "00000000-0000-4000-8000-000000000402",
              statusUrl: "/api/v1/exports/00000000-0000-4000-8000-000000000402",
            },
            { status: 202 },
          ),
        ),
      );
      window.history.replaceState(null, "", path);
      await renderCensus(kind);
      expect(await screen.findByRole("heading", { name: new RegExp(title, "u") })).toBeVisible();

      const exportSummary = screen.getByText("Excel · PDF").closest("summary");
      if (exportSummary === null) throw new Error("Expected the export menu");
      fireEvent.click(exportSummary);
      fireEvent.click(screen.getByRole("button", { name: "Excel" }));

      expect(await screen.findByText("Preparant l'exportació…")).toBeVisible();
    },
  );

  it("links LastChange to the entity-scoped audit trail", async () => {
    const i18n = await createI18n({
      branding,
      browserLanguages: ["ca"],
      initialNamespaces: ["admin-audit"],
      storage: undefined,
    });
    render(
      <I18nextProvider i18n={i18n}>
        <BrandingProvider branding={branding}>
          <LastChange
            entityId="level-a"
            entityType="Level"
            value={{ action: "CATALOG_CHANGED", actorName: "Aina", at: "2026-08-03T10:00:00Z" }}
          />
        </BrandingProvider>
      </I18nextProvider>,
    );

    expect(screen.getByText(/últim canvi: Catàleg modificat/u)).toBeVisible();
    expect(screen.getByRole("link", { name: "amb històric" })).toHaveAttribute(
      "href",
      "/auditoria?entityType=Level&entityId=level-a",
    );
  });
});
