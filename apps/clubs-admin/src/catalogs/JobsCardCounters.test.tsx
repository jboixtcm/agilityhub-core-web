import { createApiClient, type components } from "@agilityhub/api-client";
import {
  handlers,
  JOBS_MOCK_NOW,
  mockScenario,
  resetBackofficeMockState,
  resetSettingsState,
} from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, render, screen, within } from "@testing-library/react";
import { getResponse, http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { JobsCard } from "./JobsCard";

type JobList = components["schemas"]["JobSummaries"];

const branding: Branding = {
  ...brandingCanicFixture,
  locales: ["ca", "es", "en"],
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  vi.useFakeTimers({ now: new Date(JOBS_MOCK_NOW), shouldAdvanceTime: true, toFake: ["Date"] });
  resetBackofficeMockState();
  resetSettingsState();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.useRealTimers();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

/**
 * `cleanup`'s last run with the counters the core sent in E6-W04's run (`e5-core-run.json`): only
 * `ttlPendingRingSlotLocks` is not zero, so it is the one the card says.
 */
function serveCleanupCounters() {
  server.use(
    http.get("*/api/v1/jobs", async ({ request }) => {
      const answer = await getResponse(handlers, request);
      if (answer === undefined) throw new TypeError("The jobs mock did not answer");
      const list = (await answer.json()) as JobList;
      return HttpResponse.json({
        ...list,
        items: list.items.map((job) =>
          job.name !== "cleanup" || job.lastRun == null
            ? job
            : {
                ...job,
                lastRun: {
                  ...job.lastRun,
                  counters: {
                    domainEventsDeleted: 0,
                    exportsPurged: 0,
                    orphanUploadsDeleted: 0,
                    ttlPendingIdempotencyRecords: 0,
                    ttlPendingJobLocks: 0,
                    ttlPendingMagicLinkTokens: 0,
                    ttlPendingRingSlotLocks: 2,
                    ttlPendingSeatHolds: 0,
                    ttlPendingSignupNotificationAdmissions: 0,
                  },
                },
              },
        ),
      });
    }),
  );
}

async function cleanupRow(language: "ca" | "en" | "es", name: string): Promise<HTMLElement> {
  mockScenario("jobsFullClub");
  const i18n = await createI18n({
    branding,
    browserLanguages: [language],
    initialNamespaces: ["admin-settings", "enums", "errors"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <JobsCard client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })} />
      </BrandingProvider>
    </I18nextProvider>,
  );
  const row = (await screen.findByText(name)).closest("li");
  if (row === null) throw new TypeError(`No row ${name}`);
  return row;
}

describe("E7-W06 step 5 (ruling E82, E6-W04 Q3): D11 names the cleanup's ring-slot counter (S15 R-15-19)", () => {
  it.each([
    ["ca", "Neteja tècnica", "2 bloquejos tècnics de pista caducats"],
    ["es", "Limpieza técnica", "2 bloqueos técnicos de pista caducados"],
    ["en", "Technical cleanup", "2 expired technical ring locks"],
  ] as const)(
    "E7-W06 step 5 (%s): the last run of «%s» reads «%s», never the raw ttlPendingRingSlotLocks",
    async (language, name, label) => {
      serveCleanupCounters();
      const row = await cleanupRow(language, name);
      const last = await within(row).findByRole("button", { name: new RegExp(label, "u") });
      expect(last).toBeVisible();
      expect(last.textContent).not.toContain("ttlPendingRingSlotLocks");
    },
  );
});
