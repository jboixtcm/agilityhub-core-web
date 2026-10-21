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

import {
  DATA_EXPORT_POLL_LIMIT_MS,
  MEMBER_DATA_EXPORT_STORAGE_KEY,
  DataExportCard,
  dataExportJobFromUrl,
} from "./DataExportCard";

const branding = brandingCanicFixture as Branding;
const accountId = "10000000-0000-4000-8000-000000000002";
const jobId = "71000000-0000-4000-8000-000000000001";
const storageKey = `${MEMBER_DATA_EXPORT_STORAGE_KEY}:${accountId}`;
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
  server.events.removeAllListeners();
  resetAuditMockState();
  mockScenario("member");
  localStorage.removeItem(storageKey);
  sessionStorage.clear();
  vi.useRealTimers();
});

afterAll(() => {
  server.close();
});

/** The member's job as `GET /exports/{id}` sends it in each state (absent fields stay absent). */
function exportJob(
  status: "EXPIRED" | "FAILED" | "QUEUED" | "READY" | "RUNNING",
  extra: Record<string, unknown> = {},
) {
  return {
    createdAt: "2026-10-18T09:00:00Z",
    format: "ZIP",
    id: jobId,
    kind: "MEMBER_DATA",
    progressPct: status === "READY" ? 100 : 0,
    status,
    ...extra,
  };
}

function serveJob(answer: () => Response) {
  server.use(http.get("*/api/v1/exports/:id", answer));
}

function apiFailure(code: string, status: number) {
  return HttpResponse.json(
    { code, details: {}, message: code, traceId: "data-export-test" },
    { status },
  );
}

async function renderCard(language = "ca", initialJobId?: string) {
  const i18n = await createI18n({
    branding: { ...branding, locales: ["ca", "es", "en"] },
    browserLanguages: [language],
    // `common` is the default namespace `useClubFormats` reads (loaded at boot in the app).
    initialNamespaces: ["auth", "common", "errors"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <DataExportCard
          accountId={accountId}
          client={client}
          {...(initialJobId === undefined ? {} : { initialJobId })}
        />
      </BrandingProvider>
    </I18nextProvider>,
  );
}

describe("T-14-17 · screen 12 requests, follows and downloads the member data package (R-14-13)", () => {
  it("shows QUEUED/RUNNING, keeps the job when the tab is closed (round 2 #2), then offers its ZIP", async () => {
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
      expect(localStorage.getItem(storageKey)).not.toBeNull();
    });
    const storedJob = localStorage.getItem(storageKey);
    expect(storedJob).toMatch(/[0-9a-f-]{36}/u);
    // The tab is closed and the PWA launched again: the tab's own storage is gone.
    cleanup();
    sessionStorage.clear();
    await renderCard();
    expect(screen.getByRole("status")).toHaveTextContent("Preparant el paquet…");

    await vi.advanceTimersByTimeAsync(4_100);
    const download = await screen.findByRole("button", { name: "Descarrega el paquet" });
    expect(download).toBeEnabled();
    fireEvent.click(download);
    await waitFor(() => {
      expect(calls.filter((call) => call.startsWith("POST "))).toHaveLength(1);
      expect(calls).toContain(`GET /api/v1/exports/${storedJob ?? ""}`);
      expect(calls).toContain(`GET /api/v1/exports/${storedJob ?? ""}/download`);
    });
  });

  it("keeps DATA_EXPORT_TOO_SOON in the card and allows a later retry", async () => {
    server.use(http.post("*/api/v1/me/data-export", () => apiFailure("DATA_EXPORT_TOO_SOON", 422)));
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

  it("READY reads N-50's «Les teves dades estan a punt» and the api's expiresAt, never a hard-coded «7 dies»", async () => {
    serveJob(() =>
      HttpResponse.json(
        exportJob("READY", {
          downloadUrl: `/api/v1/exports/${jobId}/download?expires=1&signature=s`,
          expiresAt: "2026-10-25T09:00:00Z",
          fileName: "member-data.zip",
        }),
      ),
    );
    await renderCard("ca", jobId);
    expect(await screen.findByText("Les teves dades estan a punt.")).toBeVisible();
    expect(screen.getByText("Disponible fins al 25/10/2026.")).toBeVisible();
    expect(screen.queryByText(/7 dies/u)).toBeNull();
    expect(screen.getByText("Prepara un paquet amb les dades del teu compte.")).toBeVisible();
  });

  it("FAILED shows the translated error of job.error.code (never the api's English message) and offers a new package", async () => {
    localStorage.setItem(storageKey, jobId);
    serveJob(() =>
      HttpResponse.json(
        exportJob("FAILED", {
          error: { code: "EXPORT_TOO_LARGE", message: "Export exceeds the maximum size" },
        }),
      ),
    );
    await renderCard();
    expect(await screen.findByRole("alert")).toHaveTextContent("L'exportació és massa gran.");
    expect(screen.queryByText(/Export exceeds/u)).toBeNull();
    expect(screen.getByRole("button", { name: "Descarrega les meves dades" })).toBeEnabled();
    expect(localStorage.getItem(storageKey)).toBeNull();

    // An error code without its own message falls back to the card's.
    cleanup();
    localStorage.setItem(storageKey, jobId);
    serveJob(() =>
      HttpResponse.json(
        exportJob("FAILED", { error: { code: "WORKER_CRASHED", message: "Worker crashed" } }),
      ),
    );
    await renderCard();
    expect(await screen.findByRole("alert")).toHaveTextContent("No s'ha pogut preparar el paquet.");
  });

  it("EXPIRED says so, clears the stored job and offers a new package", async () => {
    localStorage.setItem(storageKey, jobId);
    serveJob(() => HttpResponse.json(exportJob("EXPIRED")));
    await renderCard();
    expect(await screen.findByRole("alert")).toHaveTextContent("El paquet ha caducat.");
    expect(screen.getByRole("button", { name: "Descarrega les meves dades" })).toBeEnabled();
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it("404 NOT_FOUND and 422 EXPORT_EXPIRED on the job clear the stored job and say why", async () => {
    for (const [code, status, text] of [
      ["NOT_FOUND", 404, "No s'ha trobat l'element sol·licitat."],
      ["EXPORT_EXPIRED", 422, "Aquesta exportació ha caducat."],
    ] as const) {
      localStorage.setItem(storageKey, jobId);
      serveJob(() => apiFailure(code, status));
      await renderCard();
      expect(await screen.findByRole("alert")).toHaveTextContent(text);
      expect(screen.getByRole("button", { name: "Descarrega les meves dades" })).toBeEnabled();
      expect(localStorage.getItem(storageKey)).toBeNull();
      cleanup();
      server.resetHandlers();
    }
  });

  it("R-12-13's bound: a package still queued after two minutes stops being read until [Actualitza]", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let reads = 0;
    let status: "READY" | "RUNNING" = "RUNNING";
    serveJob(() => {
      reads += 1;
      return HttpResponse.json(
        status === "RUNNING"
          ? exportJob("RUNNING", { progressPct: 40 })
          : exportJob("READY", {
              downloadUrl: `/api/v1/exports/${jobId}/download?expires=1&signature=s`,
              expiresAt: "2026-10-25T09:00:00Z",
            }),
      );
    });
    await renderCard("ca", jobId);
    expect(screen.getByRole("status")).toHaveTextContent("Preparant el paquet…");
    await vi.advanceTimersByTimeAsync(DATA_EXPORT_POLL_LIMIT_MS + 5_000);
    const refresh = await screen.findByRole("button", { name: "Actualitza" });
    expect(
      screen.getByText("El paquet encara s'està preparant. T'avisarem quan estigui a punt."),
    ).toBeVisible();
    const stoppedAt = reads;
    expect(stoppedAt).toBeLessThanOrEqual(DATA_EXPORT_POLL_LIMIT_MS / 2_000 + 2);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(reads).toBe(stoppedAt);

    status = "READY";
    fireEvent.click(refresh);
    expect(await screen.findByRole("button", { name: "Descarrega el paquet" })).toBeVisible();
    expect(reads).toBe(stoppedAt + 1);
  });

  it("N-50's job (OPEN_EXPORT → /perfil?jobId=) seeds the card on a fresh load, ahead of a stored job", async () => {
    const otherJob = "71000000-0000-4000-8000-000000000009";
    localStorage.setItem(storageKey, otherJob);
    const reads: string[] = [];
    serveJob(() => HttpResponse.json(exportJob("READY", { expiresAt: "2026-10-25T09:00:00Z" })));
    server.events.on("request:start", ({ request }) => {
      reads.push(new URL(request.url).pathname);
    });
    await renderCard("ca", jobId);
    expect(await screen.findByText("Les teves dades estan a punt.")).toBeVisible();
    expect(reads).toEqual([`/api/v1/exports/${jobId}`]);
    expect(localStorage.getItem(storageKey)).toBe(jobId);

    expect(dataExportJobFromUrl(`?jobId=${jobId}`)).toBe(jobId);
    expect(dataExportJobFromUrl("?jobId=..%2Fadmin")).toBeUndefined();
    expect(dataExportJobFromUrl("")).toBeUndefined();
  });
});
