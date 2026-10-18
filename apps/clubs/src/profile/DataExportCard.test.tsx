import { createApiClient } from "@agilityhub/api-client";
import { mockScenario, resetAuditMockState } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { MEMBER_DATA_EXPORT_STORAGE_KEY, DataExportCard } from "./DataExportCard";

const branding = brandingCanicFixture as Branding;
const accountId = "10000000-0000-4000-8000-000000000002";
let client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

beforeEach(() => {
  mockScenario("member");
  client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetAuditMockState();
  mockScenario("member");
  sessionStorage.clear();
  vi.useRealTimers();
});

afterAll(() => {
  server.close();
});

async function renderCard(language = "ca") {
  const i18n = await createI18n({
    branding: { ...branding, locales: ["ca", "es", "en"] },
    browserLanguages: [language],
    initialNamespaces: ["auth", "errors"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <DataExportCard accountId={accountId} client={client} />
      </BrandingProvider>
    </I18nextProvider>,
  );
}

describe("T-14-17 · screen 12 requests, follows and downloads the member data package (R-14-13)", () => {
  it("shows QUEUED/RUNNING, persists the job across a remount, then offers its ZIP", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const calls: string[] = [];
    server.events.on("request:start", ({ request }) => {
      const url = new URL(request.url);
      if (/data-export|exports/u.test(url.pathname))
        calls.push(`${request.method} ${url.pathname}`);
    });
    await renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Descarrega les meves dades" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Preparant el paquet…");
    await waitFor(() => {
      expect(
        sessionStorage.getItem(`${MEMBER_DATA_EXPORT_STORAGE_KEY}:${accountId}`),
      ).not.toBeNull();
    });
    const jobId = sessionStorage.getItem(`${MEMBER_DATA_EXPORT_STORAGE_KEY}:${accountId}`);
    expect(jobId).toMatch(/[0-9a-f-]{36}/u);
    cleanup();
    await renderCard();
    expect(screen.getByRole("status")).toHaveTextContent("Preparant el paquet…");

    await vi.advanceTimersByTimeAsync(2_100);
    const download = await screen.findByRole("button", { name: "Descarrega el paquet" });
    expect(download).toBeEnabled();
    fireEvent.click(download);
    await waitFor(() => {
      expect(calls.filter((call) => call.startsWith("POST "))).toHaveLength(1);
      expect(calls).toContain(`GET /api/v1/exports/${jobId ?? ""}`);
      expect(calls).toContain(`GET /api/v1/exports/${jobId ?? ""}/download`);
    });
  });

  it("keeps DATA_EXPORT_TOO_SOON in the card and allows a later retry", async () => {
    server.use(
      http.post("*/api/v1/me/data-export", () =>
        HttpResponse.json(
          {
            code: "DATA_EXPORT_TOO_SOON",
            details: {},
            message: "Too soon",
            traceId: "data-export-test",
          },
          { status: 422 },
        ),
      ),
    );
    await renderCard();
    const button = screen.getByRole("button", { name: "Descarrega les meves dades" });
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Encara no es pot sol·licitar una nova exportació de dades.",
    );
    expect(button).toBeEnabled();
  });

  it("renders the native action and status in ca, es and en", async () => {
    for (const [language, action] of [
      ["ca", "Descarrega les meves dades"],
      ["es", "Descargar mis datos"],
      ["en", "Download my data"],
    ] as const) {
      await renderCard(language);
      expect(screen.getByRole("button", { name: action })).toBeVisible();
      cleanup();
    }
  });
});
