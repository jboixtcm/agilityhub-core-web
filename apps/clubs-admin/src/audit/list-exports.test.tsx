import { type ApiClient, createApiClient } from "@agilityhub/api-client";
import {
  mockExportBody,
  mockScenario,
  resetActivityState,
  resetAuditMockState,
} from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ActivitiesPage } from "../activities/ActivitiesPage";
import { ActivityRegistrantsPage } from "../activities/ActivityRegistrantsPage";
import { DogsPage, MembersPage } from "../census/CensusListPage";

import { MemberAuditPage } from "./AuditPage";
import { ExportJobsProvider } from "./ExportsDrawer";

const branding: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
// Tuesday 4 August 2026, 10:25 in the club's zone (Europe/Madrid): the api's file name stamp.
const now = new Date("2026-08-04T08:25:00Z");
const WORKSHOP = "activity-taller-contactes";

interface ExportButton {
  /** Clicks the export button; returns the element the error must appear in. */
  click: () => Promise<HTMLElement>;
  format: "pdf" | "xlsx";
  listKey: string;
  location: string;
  name: string;
  page: (client: ApiClient) => ReactNode;
  path: string;
  /** Rendered once the list has loaded. */
  ready: () => Promise<unknown>;
  search?: string;
  selection?: string;
}

const exportRequests: URL[] = [];
const savedBlobs: Blob[] = [];
const clickedLinks: { download: string; hidden: boolean; href: string }[] = [];

async function openMenuAndClick(format: "pdf" | "xlsx"): Promise<HTMLElement> {
  const summary = (await screen.findByText("Excel · PDF")).closest("summary");
  const menu = summary?.parentElement ?? null;
  if (summary === null || menu === null) throw new TypeError("Expected the «Excel · PDF» menu");
  fireEvent.click(summary);
  fireEvent.click(within(menu).getByRole("button", { name: format === "pdf" ? "PDF" : "Excel" }));
  return menu;
}

const BUTTONS: ExportButton[] = [
  {
    click: () => openMenuAndClick("xlsx"),
    format: "xlsx",
    listKey: "members",
    location: "/abonats?q=Laura",
    name: "D5 members «Excel · PDF» → Excel",
    page: (client) => <MembersPage client={client} />,
    path: "/api/v1/members/export",
    ready: () => screen.findByText("Laura Serra Vidal"),
    search: "Laura",
  },
  {
    click: async () => {
      fireEvent.click(screen.getByRole("checkbox", { name: "Selecciona Laura Serra Vidal" }));
      const button = await screen.findByRole("button", { name: "Exportar selecció" });
      fireEvent.click(button);
      const bar = button.parentElement;
      if (bar === null) throw new TypeError("Expected the bulk actions bar");
      return bar;
    },
    format: "xlsx",
    listKey: "members",
    location: "/abonats?q=Laura",
    name: "D5 members «Exportar selecció»",
    page: (client) => <MembersPage client={client} />,
    path: "/api/v1/members/export",
    ready: () => screen.findByText("Laura Serra Vidal"),
    search: "Laura",
    selection: "id:in:member-laura",
  },
  {
    click: () => openMenuAndClick("pdf"),
    format: "pdf",
    listKey: "dogs",
    location: "/gossos?q=Duna",
    name: "D15 dogs «Excel · PDF» → PDF",
    page: (client) => <DogsPage client={client} />,
    path: "/api/v1/dogs/export",
    ready: () => screen.findByText("Duna"),
    search: "Duna",
  },
  {
    click: () => openMenuAndClick("xlsx"),
    format: "xlsx",
    listKey: "audit-entries",
    location: "/abonats/member-laura/auditoria",
    name: "member audit «Excel · PDF» → Excel",
    page: (client) => <MemberAuditPage client={client} id="member-laura" />,
    path: "/api/v1/audit-entries/export",
    ready: () => screen.findByRole("link", { name: "Mètode de pagament modificat" }),
  },
  {
    click: () => openMenuAndClick("pdf"),
    format: "pdf",
    listKey: "activities",
    location: "/activitats?q=Torneig",
    name: "D7 activities «Excel · PDF» → PDF",
    page: (client) => <ActivitiesPage client={client} onNavigate={vi.fn()} readOnly={false} />,
    path: "/api/v1/activities/export",
    ready: () => screen.findAllByText(/Torneig d'Estiu 2026/u),
    search: "Torneig",
  },
  {
    click: () => openMenuAndClick("xlsx"),
    format: "xlsx",
    listKey: "activity-registrations",
    location: `/activitats/${WORKSHOP}/inscrits?q=Serra&filter=state%3Aeq%3AACTIVE&sort=memberLastName%2Casc`,
    name: "registrants «Excel · PDF» → Excel",
    page: (client) => (
      <ActivityRegistrantsPage
        activityId={WORKSHOP}
        client={client}
        onNavigate={vi.fn()}
        readOnly={false}
      />
    ),
    path: "/api/v1/activity-registrations/export",
    ready: () => screen.findByRole("heading", { name: "Inscrits — Taller de contactes" }),
    search: "Serra",
  },
];

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  server.events.on("request:start", ({ request }) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/export")) exportRequests.push(url);
  });
});
beforeEach(() => {
  vi.useFakeTimers({ now, shouldAdvanceTime: true, toFake: ["Date"] });
  exportRequests.length = 0;
  savedBlobs.length = 0;
  clickedLinks.length = 0;
  localStorage.clear();
  // jsdom has no object URLs and does not download: record what `saveFile` hands to the browser.
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: (blob: Blob) => {
      savedBlobs.push(blob);
      return `blob:${window.location.origin}/export-${String(savedBlobs.length)}`;
    },
  });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clickedLinks.push({ download: this.download, hidden: this.hidden, href: this.href });
  });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetAuditMockState();
  resetActivityState();
  mockScenario("admin");
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.history.replaceState(null, "", "/");
});
afterAll(() => {
  server.close();
});

async function renderButton(button: ExportButton) {
  window.history.replaceState(null, "", button.location);
  server.use(
    http.get("*/api/v1/dashboard/counters", () => HttpResponse.json({ pendingSignups: 0 })),
  );
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: [
      "admin-activities",
      "admin-audit",
      "admin-catalogs",
      "admin-census",
      "census",
      "enums",
      "errors",
    ],
    storage: undefined,
  });
  const client = createApiClient({
    baseUrl: `${window.location.origin}/api/v1`,
    getLocale: () => "ca",
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <ExportJobsProvider client={client}>{button.page(client)}</ExportJobsProvider>
      </BrandingProvider>
    </I18nextProvider>,
  );
  await button.ready();
}

function exportError(path: string, code: string) {
  server.use(
    http.get(`*${path}`, () =>
      HttpResponse.json(
        { code, details: {}, message: code, traceId: "mock-trace-export" },
        { status: 422 },
      ),
    ),
  );
}

describe.each(BUTTONS)("T-14-26 R-14-12 E4-W07 $name", (button) => {
  it("200: saves the api's file byte for byte, with its Content-Type and the Content-Disposition name, and sends the list's parameters", async () => {
    await renderButton(button);
    await button.click();

    await waitFor(() => {
      expect(clickedLinks).toHaveLength(1);
    });
    const fileName = `canic_${button.listKey}_20260804-1025.${button.format}`;
    expect(clickedLinks[0]).toEqual({
      download: fileName,
      hidden: true,
      href: `blob:${window.location.origin}/export-1`,
    });
    const blob = savedBlobs[0];
    if (blob === undefined) throw new TypeError("Expected a saved file");
    expect(blob.type).toBe(button.format === "pdf" ? "application/pdf" : XLSX);
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(mockExportBody(button.format));
    expect(screen.queryByRole("dialog", { name: "Exportacions" })).toBeNull();

    expect(exportRequests).toHaveLength(1);
    const request = exportRequests[0];
    expect(request?.pathname).toBe(button.path);
    expect(request?.searchParams.get("format")).toBe(button.format);
    expect(request?.searchParams.get("columns")).not.toBeNull();
    if (button.selection === undefined) {
      expect(request?.searchParams.get("q")).toBe(button.search ?? null);
    } else {
      // R-03-24: the selected rows alone, whatever the search or filters are now.
      expect(request?.searchParams.getAll("filter")).toEqual([button.selection]);
      expect(request?.searchParams.get("q")).toBeNull();
    }
  });

  it("202: opens the exports drawer with the queued job and saves nothing", async () => {
    mockScenario("adminExportsQueued");
    await renderButton(button);
    await button.click();

    const drawer = await screen.findByRole("dialog", { name: "Exportacions" });
    expect(drawer).toHaveTextContent("Preparant l'exportació…");
    expect(clickedLinks).toHaveLength(0);
    expect(savedBlobs).toHaveLength(0);
  });

  it("422 EXPORT_LIMIT: shows the drawer's notice", async () => {
    exportError(button.path, "EXPORT_LIMIT");
    await renderButton(button);
    await button.click();

    const drawer = await screen.findByRole("dialog", { name: "Exportacions" });
    expect(
      within(drawer).getByText(/S'ha assolit el límit d'exportacions simultànies/u),
    ).toBeVisible();
    expect(clickedLinks).toHaveLength(0);
  });

  it("422 EXPORT_TOO_LARGE: shows errors:EXPORT_TOO_LARGE next to the button", async () => {
    exportError(button.path, "EXPORT_TOO_LARGE");
    await renderButton(button);
    const container = await button.click();

    expect(await within(container).findByRole("alert")).toHaveTextContent(
      "L'exportació és massa gran.",
    );
    expect(screen.queryByRole("dialog", { name: "Exportacions" })).toBeNull();
    expect(clickedLinks).toHaveLength(0);
  });
});

describe("T-14-26 R-14-12 E4-W07 one export at a time", () => {
  it("disables both formats while the export runs, so a second click sends nothing", async () => {
    let release: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get("*/api/v1/activities/export", async () => {
        await answered;
        return new HttpResponse(mockExportBody("pdf"), {
          headers: {
            "Content-Disposition": 'attachment; filename="canic_activities_20260804-1025.pdf"',
            "Content-Type": "application/pdf",
          },
        });
      }),
    );
    const d7 = BUTTONS.find((button) => button.listKey === "activities");
    if (d7 === undefined) throw new TypeError("Expected the D7 button");
    await renderButton(d7);
    const menu = await openMenuAndClick("pdf");

    await waitFor(() => {
      expect(within(menu).getByRole("button", { name: "PDF" })).toBeDisabled();
    });
    expect(within(menu).getByRole("button", { name: "Excel" })).toBeDisabled();
    fireEvent.click(within(menu).getByRole("button", { name: "Excel" }));
    release();

    await waitFor(() => {
      expect(clickedLinks).toHaveLength(1);
    });
    expect(within(menu).getByRole("button", { name: "PDF" })).toBeEnabled();
    expect(exportRequests).toHaveLength(1);
  });

  it("R-03-24 «Exportar selecció» still exports the selected rows after a new search hides them", async () => {
    const selection = BUTTONS.find((button) => button.selection !== undefined);
    if (selection === undefined) throw new TypeError("Expected the selection button");
    await renderButton(selection);
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecciona Laura Serra Vidal" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Cerca per nom, DNI, gos…" }), {
      target: { value: "Duna" },
    });
    await waitFor(() => {
      expect(new URLSearchParams(window.location.search).get("q")).toBe("Duna");
    });
    await waitFor(() => {
      expect(screen.queryByText("Laura Serra Vidal")).toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "Exportar selecció" }));

    await waitFor(() => {
      expect(clickedLinks).toHaveLength(1);
    });
    expect(exportRequests[0]?.searchParams.getAll("filter")).toEqual(["id:in:member-laura"]);
    expect(exportRequests[0]?.searchParams.get("q")).toBeNull();
  });

  it("registrants: the export carries the list's q, filters, sort and exportable columns (review #4)", async () => {
    const registrants = BUTTONS.find((button) => button.listKey === "activity-registrations");
    if (registrants === undefined) throw new TypeError("Expected the registrants button");
    await renderButton(registrants);
    await registrants.click();

    await waitFor(() => {
      expect(exportRequests).toHaveLength(1);
    });
    const request = exportRequests[0];
    expect(request?.searchParams.get("q")).toBe("Serra");
    expect(request?.searchParams.getAll("filter")).toEqual([
      `activityId:eq:${WORKSHOP}`,
      "state:eq:ACTIVE",
    ]);
    expect(request?.searchParams.getAll("sort")).toEqual(["memberLastName,asc"]);
    expect(request?.searchParams.get("columns")).toBe("member,state,registeredAt,origin");
  });
});
