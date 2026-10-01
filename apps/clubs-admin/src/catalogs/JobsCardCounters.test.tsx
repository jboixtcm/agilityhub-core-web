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
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

/** Every counter of P9 `cleanup` (S15 R-15-19; the names the core sent in E6-W04's run). */
const CLEANUP_COUNTERS = [
  "domainEventsDeleted",
  "exportsPurged",
  "jobRunsDeleted",
  "orphanUploadsDeleted",
  "stripeEventsDeleted",
  "ttlPendingIdempotencyRecords",
  "ttlPendingJobLocks",
  "ttlPendingMagicLinkTokens",
  "ttlPendingRingSlotLocks",
  "ttlPendingSeatHolds",
  "ttlPendingSignupNotificationAdmissions",
] as const;

/** `cleanup`'s last run with `counters`. */
function serveCleanupRun(counters: Readonly<Record<string, number>>) {
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
            : { ...job, lastRun: { ...job.lastRun, counters } },
        ),
      });
    }),
  );
}

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

describe("T-15-27 E7-W07 step 8 (E7-W06's report; S15 R-15-19): D11 names every counter of the cleanup", () => {
  it.each([
    [
      "ca",
      "Neteja tècnica",
      [
        "1 esdeveniment intern esborrat",
        "2 exportacions caducades esborrades",
        "1 execució antiga esborrada",
        "3 fitxers d'alta orfes esborrats",
        "1 esdeveniment de Stripe esborrat",
        "2 registres de reintents caducats",
        "1 bloqueig de procés caducat",
        "2 enllaços d'accés caducats",
        "1 bloqueig tècnic de pista caducat",
        "2 bloquejos temporals de plaça caducats",
        "1 control d'avís d'alta caducat",
      ],
    ],
    [
      "es",
      "Limpieza técnica",
      [
        "1 evento interno eliminado",
        "2 exportaciones caducadas eliminadas",
        "1 ejecución antigua eliminada",
        "3 archivos de alta huérfanos eliminados",
        "1 evento de Stripe eliminado",
        "2 registros de reintentos caducados",
        "1 bloqueo de proceso caducado",
        "2 enlaces de acceso caducados",
        "1 bloqueo técnico de pista caducado",
        "2 bloqueos temporales de plaza caducados",
        "1 control de aviso de alta caducado",
      ],
    ],
    [
      "en",
      "Technical cleanup",
      [
        "1 internal event deleted",
        "2 expired exports deleted",
        "1 old run deleted",
        "3 orphan sign-up files deleted",
        "1 Stripe event deleted",
        "2 expired retry records",
        "1 expired process lock",
        "2 expired sign-in links",
        "1 expired technical ring lock",
        "2 expired seat holds",
        "1 expired sign-up notice check",
      ],
    ],
  ] as const)(
    "T-15-27 E7-W07 step 8 (%s): the last run of «%s» says each cleanup counter by its label, never its raw key",
    async (language, name, labels) => {
      serveCleanupRun({
        domainEventsDeleted: 1,
        exportsPurged: 2,
        jobRunsDeleted: 1,
        orphanUploadsDeleted: 3,
        stripeEventsDeleted: 1,
        ttlPendingIdempotencyRecords: 2,
        ttlPendingJobLocks: 1,
        ttlPendingMagicLinkTokens: 2,
        ttlPendingRingSlotLocks: 1,
        ttlPendingSeatHolds: 2,
        ttlPendingSignupNotificationAdmissions: 1,
      });
      const row = await cleanupRow(language, name);
      const last = await within(row).findByRole("button", {
        name: new RegExp(labels[0], "u"),
      });
      for (const label of labels) expect(last.textContent).toContain(label);
      for (const key of CLEANUP_COUNTERS) expect(last.textContent).not.toContain(key);
    },
  );
});

describe("T-15-34 E7-W03 round 2 #5 (D11; ruling E89, INC-53 item 15): P4's dry-run counter WOULD_REMIND and its run's classReminders read with their labels (S15 R-15-14)", () => {
  it.each([
    {
      close: "Cerrar",
      language: "es",
      name: "Recordatorios",
      plan: "1 recordatorio previsto",
      planTitle: "Simulación: qué haría ahora · Recordatorios",
      run: "Ejecuta ahora",
      runLabel: "Ejecuta ahora Recordatorios",
      runTitle: "Ejecutar «Recordatorios» ahora",
      simulate: "Simula Recordatorios",
      summary: "Recordatorios: correcta · 1 recordatorio de clase",
      tag: "simulación",
    },
    {
      close: "Close",
      language: "en",
      name: "Reminders",
      plan: "1 planned reminder",
      planTitle: "Simulation: what it would do now · Reminders",
      run: "Run now",
      runLabel: "Run Reminders now",
      runTitle: "Run «Reminders» now",
      simulate: "Simulate Reminders",
      summary: "Reminders: succeeded · 1 class reminder",
      tag: "simulation",
    },
    {
      close: "Tanca",
      language: "ca",
      name: "Recordatoris",
      plan: "1 recordatori previst",
      planTitle: "Simulació: què faria ara · Recordatoris",
      run: "Executa ara",
      runLabel: "Executa ara Recordatoris",
      runTitle: "Executar «Recordatoris» ara",
      simulate: "Simula Recordatoris",
      summary: "Recordatoris: correcta · 1 recordatori de classe",
      tag: "simulació",
    },
  ] as const)(
    "T-15-34 E7-W03 round 2 #5 ($language): «$name»'s last run and [Simula] plan say «$plan», its [Executa ara] summary the class reminders' label, never WOULD_REMIND or classReminders",
    async (expected) => {
      mockScenario("admin");
      const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
      // A simulation already ran: it is the process's last run (R-15-08).
      const earlier = await client.POST("/jobs/{name}/trigger", {
        body: { dryRun: true },
        params: { path: { name: "reminders" } },
      });
      expect(earlier.data?.dryRun).toBe(true);
      const i18n = await createI18n({
        branding,
        browserLanguages: [expected.language],
        initialNamespaces: ["admin-settings", "enums", "errors"],
        storage: undefined,
      });
      render(
        <I18nextProvider i18n={i18n}>
          <BrandingProvider branding={branding}>
            <JobsCard client={client} />
          </BrandingProvider>
        </I18nextProvider>,
      );
      const row = (await screen.findByText(expected.name)).closest("li");
      if (row === null) throw new TypeError(`No row ${expected.name}`);
      const raw = /WOULD_REMIND|classReminders|trainingReminders/u;

      const last = await within(row).findByRole("button", {
        name: new RegExp(` · ${expected.tag} · ${expected.plan}$`, "u"),
      });
      expect(last.textContent).not.toMatch(raw);

      fireEvent.click(within(row).getByRole("button", { name: expected.simulate }));
      const plan = await screen.findByRole("dialog", { name: expected.planTitle });
      expect(within(plan).getByText(new RegExp(`${expected.plan}$`, "u"))).toBeVisible();
      // The plan's item keeps the api's action (`{entityType} {entityId} · {action}`); its counter
      // never reads as `{key}: {count}`.
      expect(plan.textContent).not.toMatch(/WOULD_REMIND: |classReminders|trainingReminders/u);
      fireEvent.click(within(plan).getAllByRole("button", { name: expected.close })[0] as Element);

      fireEvent.click(within(row).getByRole("button", { name: expected.runLabel }));
      const confirm = await screen.findByRole("dialog", { name: expected.runTitle });
      fireEvent.click(within(confirm).getByRole("button", { name: expected.run }));
      expect(await screen.findByText(expected.summary)).toBeVisible();
      expect(screen.queryByText(raw)).toBeNull();
    },
  );
});

describe("T-15-27 E7-W06 step 5 (ruling E82, E6-W04 Q3): D11 names the cleanup's ring-slot counter (S15 R-15-19)", () => {
  it.each([
    ["ca", "Neteja tècnica", "2 bloquejos tècnics de pista caducats"],
    ["es", "Limpieza técnica", "2 bloqueos técnicos de pista caducados"],
    ["en", "Technical cleanup", "2 expired technical ring locks"],
  ] as const)(
    "T-15-27 E7-W06 step 5 (%s): the last run of «%s» reads «%s», never the raw ttlPendingRingSlotLocks",
    async (language, name, label) => {
      serveCleanupCounters();
      const row = await cleanupRow(language, name);
      const last = await within(row).findByRole("button", { name: new RegExp(label, "u") });
      expect(last).toBeVisible();
      expect(last.textContent).not.toContain("ttlPendingRingSlotLocks");
    },
  );
});
