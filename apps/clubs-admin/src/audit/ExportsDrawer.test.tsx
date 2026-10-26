import { createApiClient, type components } from "@agilityhub/api-client";
import brandingFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ExportJobsProvider, useExportsDrawer } from "./ExportsDrawer";

type ExportJob = components["schemas"]["ExportJob"];
const branding = brandingFixture as Branding;
const requestedId = "71000000-0000-4000-8000-000000000001";
const otherId = "71000000-0000-4000-8000-000000000002";
const preparing = "Preparant l'exportació…";

function job(status: ExportJob["status"], id = requestedId): ExportJob {
  return {
    createdAt: "2026-10-24T10:00:00Z",
    fileName: `${id}.zip`,
    format: "ZIP",
    id,
    kind: "MEMBER_DATA",
    status,
  };
}

function OpenButton() {
  const { openExports } = useExportsDrawer();
  return (
    <button
      onClick={() => {
        openExports({ jobId: requestedId, kind: "MEMBER_DATA" });
      }}
    >
      Open requested export
    </button>
  );
}

async function openDrawer() {
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-audit", "errors"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <ExportJobsProvider
          client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
        >
          <OpenButton />
        </ExportJobsProvider>
      </BrandingProvider>
    </I18nextProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Open requested export" }));
  return screen.findByRole("dialog", { name: "Exportacions" });
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

describe("T-14-26 / INC-95: preparing describes the requested export's current state", () => {
  it.each(["READY", "FAILED", "EXPIRED"] as const)(
    "removes preparing when the requested job becomes %s even if another job is queued",
    async (terminal) => {
      let reads = 0;
      server.use(
        http.get("*/api/v1/exports", () => {
          reads += 1;
          return HttpResponse.json([
            job(reads === 1 ? "RUNNING" : terminal),
            job("QUEUED", otherId),
          ]);
        }),
      );
      const drawer = await openDrawer();
      expect(await screen.findByText(preparing)).toBeVisible();
      await waitFor(
        () => {
          expect(reads).toBeGreaterThan(1);
          expect(drawer).not.toHaveTextContent(preparing);
        },
        { timeout: 3_000 },
      );
    },
  );

  it("does not claim a completed job is preparing on first open", async () => {
    server.use(http.get("*/api/v1/exports", () => HttpResponse.json([job("READY")])));
    const drawer = await openDrawer();
    await screen.findByRole("button", { name: `Descarrega ${requestedId}.zip` });
    expect(drawer).not.toHaveTextContent(preparing);
  });

  it("does not borrow an unrelated queued job's status when the requested job is absent", async () => {
    server.use(http.get("*/api/v1/exports", () => HttpResponse.json([job("QUEUED", otherId)])));
    const drawer = await openDrawer();
    await screen.findByText(`${otherId}.zip`);
    expect(drawer).not.toHaveTextContent(preparing);
  });

  it("does not retain a progress claim after reading the status fails", async () => {
    let reads = 0;
    server.use(
      http.get("*/api/v1/exports", () => {
        reads += 1;
        return reads === 1
          ? HttpResponse.json([job("QUEUED")])
          : new HttpResponse(null, { status: 503 });
      }),
    );
    const drawer = await openDrawer();
    expect(await screen.findByText(preparing)).toBeVisible();
    await screen.findByRole("alert", undefined, { timeout: 3_000 });
    expect(drawer).not.toHaveTextContent(preparing);
  });
});
