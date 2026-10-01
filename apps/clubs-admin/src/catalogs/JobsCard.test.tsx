import { createApiClient } from "@agilityhub/api-client";
import {
  JOBS_MOCK_NOW,
  mockScenario,
  type MockScenario,
  resetBackofficeMockState,
  resetPlanningState,
  resetSettingsState,
} from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import dashboardCa from "../../../../packages/i18n/src/locales/ca/admin-dashboard.json";
import settingsCa from "../../../../packages/i18n/src/locales/ca/admin-settings.json";
import dashboardEn from "../../../../packages/i18n/src/locales/en/admin-dashboard.json";
import settingsEn from "../../../../packages/i18n/src/locales/en/admin-settings.json";
import dashboardEs from "../../../../packages/i18n/src/locales/es/admin-dashboard.json";
import settingsEs from "../../../../packages/i18n/src/locales/es/admin-settings.json";

import { JobsCard } from "./JobsCard";
import { ParameterSettings } from "./ParameterSettings";

const branding: Branding = {
  ...brandingCanicFixture,
  locales: ["ca", "es", "en"],
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
// Monday 10 August 2026 at 8:12 in the club, after the 7:30 review.
beforeEach(() => {
  vi.useFakeTimers({ now: new Date(JOBS_MOCK_NOW), shouldAdvanceTime: true, toFake: ["Date"] });
  resetBackofficeMockState();
  resetSettingsState();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.events.removeAllListeners();
  vi.useRealTimers();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

function recordRequests(): { body: unknown; method: string; url: URL }[] {
  const requests: { body: unknown; method: string; url: URL }[] = [];
  server.events.on("request:start", ({ request }) => {
    const entry = { body: undefined as unknown, method: request.method, url: new URL(request.url) };
    requests.push(entry);
    if (request.method !== "GET") {
      void request
        .clone()
        .json()
        .then((body: unknown) => {
          entry.body = body;
        });
    }
  });
  return requests;
}

async function renderCard(scenario: MockScenario = "jobsFullClub", language = "ca") {
  mockScenario(scenario);
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
  return screen.findByRole("region", {
    name:
      language === "ca"
        ? "Processos automàtics"
        : language === "es"
          ? "Procesos automáticos"
          : "Automated processes",
  });
}

function rowOf(card: HTMLElement, name: string): HTMLElement {
  const row = within(card).getByText(name).closest("li");
  if (row === null) throw new TypeError(`No row ${name}`);
  return row;
}

describe("T-15-32 D11 «Processos automàtics» (S15 §2, R-15-01, R-15-08, R-15-09)", () => {
  it("lists the ten processes of the full club and the eight of the club mínim, each with its cadence and last run", async () => {
    const card = await renderCard();
    await within(card).findByText("Revisió de classes en risc");
    expect(within(card).getAllByRole("listitem")).toHaveLength(10);
    const risk = rowOf(card, "Revisió de classes en risc");
    expect(within(risk).getByText("cada dia a les 7:30")).toBeVisible();
    expect(
      within(risk).getByRole("button", {
        name: "fa 42 min · correcta · 1 en risc · 2 anul·lades · 1 sense inscrits · 1 alumne avisat · 4 classes revisades",
      }),
    ).toBeVisible();
    expect(
      within(rowOf(card, "Obertura de la setmana")).getByText("diumenge a les 20:00"),
    ).toBeVisible();
    expect(within(rowOf(card, "Recordatoris")).getByText("continu")).toBeVisible();
    expect(
      within(rowOf(card, "Recordatori de facturació")).getByText("el dia 22 a les 6:00"),
    ).toBeVisible();
    expect(
      within(rowOf(card, "Llista d'espera (FIFO)")).getByRole("button", { name: /omesa/u }),
    ).toBeVisible();

    cleanup();
    const minimal = await renderCard("jobsMinimalClub");
    await within(minimal).findByText("Llista d'espera (FIFO)");
    expect(within(minimal).getAllByRole("listitem")).toHaveLength(8);
    expect(within(minimal).queryByText("Temps de pagament exhaurit")).toBeNull();
    expect(within(minimal).queryByText("Recordatori de facturació")).toBeNull();
  });

  it("paints a failed last run in the danger tone", async () => {
    const card = await renderCard();
    const failed = within(await waitForRow(card, "Avisos de no presentat")).getByRole("button", {
      name: /fallida/u,
    });
    expect(failed).toHaveClass("jobs-card__last--failed");
    expect(
      within(rowOf(card, "Caducitats")).getByRole("button", { name: /parcial/u }),
    ).not.toHaveClass("jobs-card__last--failed");
  });

  it("R-15-09 dims a disabled process and keeps its [Executa ara] (and [Simula])", async () => {
    const card = await renderCard();
    const off = await waitForRow(card, "Recordatori de facturació");
    expect(off).toHaveClass("jobs-card__row--off");
    expect(
      within(off).getByRole("switch", { name: "Recordatori de facturació activat" }),
    ).toHaveAttribute("aria-checked", "false");
    expect(
      within(off).getByRole("button", { name: "Executa ara Recordatori de facturació" }),
    ).toBeEnabled();
    expect(
      within(off).getByRole("button", { name: "Simula Recordatori de facturació" }),
    ).toBeEnabled();
  });

  it("asks before disabling (S15 §2 literal) and writes PUT /jobs/{name}/switch {enabled: false} only after the confirmation", async () => {
    const requests = recordRequests();
    const card = await renderCard();
    const risk = await waitForRow(card, "Revisió de classes en risc");
    fireEvent.click(
      within(risk).getByRole("switch", { name: "Revisió de classes en risc activat" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Desactivar «Revisió de classes en risc»",
    });
    expect(
      within(dialog).getByText(
        "Els efectes d'aquest procés deixaran d'aplicar-se fins que el tornis a activar.",
      ),
    ).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel·la" }));
    expect(requests.some((request) => request.method === "PUT")).toBe(false);

    fireEvent.click(
      within(risk).getByRole("switch", { name: "Revisió de classes en risc activat" }),
    );
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Desactiva" }),
    );
    await waitFor(() => {
      expect(rowOf(card, "Revisió de classes en risc")).toHaveClass("jobs-card__row--off");
    });
    const put = requests.find((request) => request.method === "PUT");
    expect(put?.url.pathname).toBe("/api/v1/jobs/risk-review/switch");
    expect(put?.body).toEqual({ enabled: false });

    // Turning it on again asks nothing.
    fireEvent.click(within(rowOf(card, "Revisió de classes en risc")).getByRole("switch"));
    await waitFor(() => {
      expect(rowOf(card, "Revisió de classes en risc")).not.toHaveClass("jobs-card__row--off");
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("R-15-08 [Simula] shows the plan of the response (the WOULD_* items as delivered) and says nothing was applied", async () => {
    const requests = recordRequests();
    const card = await renderCard();
    fireEvent.click(
      within(await waitForRow(card, "Revisió de classes en risc")).getByRole("button", {
        name: "Simula Revisió de classes en risc",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Simulació: què faria ara · Revisió de classes en risc",
    });
    expect(within(dialog).getByText("Simulació: no s'ha aplicat cap canvi.")).toBeVisible();
    expect(
      within(dialog)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      // The calendar world's classes of the example day (T-15-33 round 2).
      "ClassSession cls-2026-08-10-2000-11 · WOULD_CANCEL",
      "ClassSession cls-2026-08-12-0930-0 · WOULD_NOTIFY",
    ]);
    expect(
      within(dialog).getByText(/1 en risc · 1 anul·lada · 3 classes revisades/u),
    ).toBeVisible();
    const trigger = requests.find((request) => request.method === "POST");
    expect(trigger?.url.pathname).toBe("/api/v1/jobs/risk-review/trigger");
    expect(trigger?.body).toEqual({ dryRun: true });
  });

  it("R-15-09 [Executa ara] asks, runs {dryRun: false} and shows the run's summary, then reads the list again", async () => {
    const requests = recordRequests();
    const card = await renderCard();
    fireEvent.click(
      within(await waitForRow(card, "Revisió de classes en risc")).getByRole("button", {
        name: "Executa ara Revisió de classes en risc",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Executar «Revisió de classes en risc» ara",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Executa ara" }));
    expect(
      await within(card).findByText(
        "Revisió de classes en risc: correcta · 1 en risc · 1 anul·lada · 3 classes revisades",
      ),
    ).toBeVisible();
    expect(requests.find((request) => request.method === "POST")?.body).toEqual({ dryRun: false });
    await waitFor(() => {
      expect(
        requests.filter(
          (request) => request.method === "GET" && request.url.pathname === "/api/v1/jobs",
        ),
      ).toHaveLength(2);
    });
  });

  it("keeps one Idempotency-Key per payload while the outcome is unknown: a retry after a lost answer reuses it", async () => {
    const keys: string[] = [];
    server.use(
      http.post("*/api/v1/jobs/:name/trigger", ({ request }) => {
        keys.push(request.headers.get("Idempotency-Key") ?? "");
        // The first [Executa ara] never gets its answer back (the network drops it).
        return keys.length === 1 ? HttpResponse.error() : undefined;
      }),
    );
    const card = await renderCard();
    const risk = await waitForRow(card, "Revisió de classes en risc");
    fireEvent.click(
      within(risk).getByRole("button", { name: "Executa ara Revisió de classes en risc" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Executar «Revisió de classes en risc» ara",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Executa ara" }));
    expect(await within(dialog).findByRole("alert")).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Executa ara" }));
    expect(
      await within(card).findByText(
        "Revisió de classes en risc: correcta · 1 en risc · 1 anul·lada · 3 classes revisades",
      ),
    ).toBeVisible();
    // A different payload ([Simula]) takes its own key.
    fireEvent.click(
      within(risk).getByRole("button", { name: "Simula Revisió de classes en risc" }),
    );
    await screen.findByRole("dialog", { name: /^Simulació: què faria ara/u });
    expect(keys).toHaveLength(3);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
    expect(keys.every((key) => /^[0-9a-f-]{36}$/u.test(key))).toBe(true);
  });

  it("409 JOB_ALREADY_RUNNING shows its message inside the confirmation and reads the list again", async () => {
    const requests = recordRequests();
    const card = await renderCard();
    fireEvent.click(
      within(await waitForRow(card, "Tancament de classes")).getByRole("button", {
        name: "Executa ara Tancament de classes",
      }),
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Executa ara" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Aquesta tasca programada ja s'està executant.",
    );
    await waitFor(() => {
      expect(requests.filter((request) => request.url.pathname === "/api/v1/jobs")).toHaveLength(2);
    });
  });

  it.each([404, 422])(
    "JOB_UNKNOWN (%i: S15 writes 404, rule 0 implies 422) shows its message and reads the list again",
    async (status) => {
      const requests = recordRequests();
      server.use(
        http.post("*/api/v1/jobs/:name/trigger", () =>
          HttpResponse.json(
            { code: "JOB_UNKNOWN", details: {}, message: "Unknown process", traceId: "t" },
            { status },
          ),
        ),
      );
      const card = await renderCard();
      fireEvent.click(
        within(await waitForRow(card, "Neteja tècnica")).getByRole("button", {
          name: "Simula Neteja tècnica",
        }),
      );
      expect(await within(card).findByText("No es reconeix la tasca programada.")).toBeVisible();
      await waitFor(() => {
        expect(requests.filter((request) => request.url.pathname === "/api/v1/jobs")).toHaveLength(
          2,
        );
      });
    },
  );

  it("opens a process's run history and a run's sheet (effects and errors)", async () => {
    const card = await renderCard();
    fireEvent.click(
      within(await waitForRow(card, "Avisos de no presentat")).getByRole("button", {
        name: /fallida/u,
      }),
    );
    const drawer = await screen.findByRole("dialog", {
      name: "Execucions · Avisos de no presentat",
    });
    const table = await within(drawer).findByRole("table", { name: "Darreres execucions" });
    expect(within(table).getAllByRole("row")).toHaveLength(1 + 3);
    // At `messaging.noShowNoticeTime` (08:00, E5-W05 round 2 #11.d): today's run is the failed one.
    fireEvent.click(within(table).getByRole("button", { name: "10/08/2026 8:00" }));
    const sheet = await within(drawer).findByRole("region", { name: "Fitxa de l'execució" });
    expect(
      await within(sheet).findByText(
        "S'ha produït un error inesperat. Torneu-ho a provar; si persisteix, indiqueu el codi de referència al club.",
      ),
    ).toBeVisible();
  });

  it("E5-W03 round 2 · review #1: the run history pages through the api's list, and its filters narrow it", async () => {
    const requests = recordRequests();
    const card = await renderCard();
    fireEvent.click(
      within(await waitForRow(card, "Neteja tècnica")).getByRole("button", { name: /correcta/u }),
    );
    const drawer = await screen.findByRole("dialog", { name: "Execucions · Neteja tècnica" });
    const table = () => within(drawer).getByRole("table", { name: "Darreres execucions" });
    await waitFor(() => {
      expect(within(table()).getAllByRole("row")).toHaveLength(1 + 20);
    });
    expect(within(drawer).getByText("Pàgina 1 de 2")).toBeVisible();
    // 14 July's failed run is older than the first page: the next page reaches it.
    expect(within(table()).queryByRole("button", { name: "14/07/2026 6:00" })).toBeNull();
    fireEvent.click(within(drawer).getByRole("button", { name: "Pàgina següent" }));
    expect(await within(drawer).findByRole("button", { name: "14/07/2026 6:00" })).toBeVisible();
    expect(within(drawer).getByText("Pàgina 2 de 2")).toBeVisible();
    expect(within(table()).getAllByRole("row")).toHaveLength(1 + 11);

    // A filter narrows the list, from its first page.
    fireEvent.change(within(drawer).getByLabelText("Resultat"), { target: { value: "FAILED" } });
    await waitFor(() => {
      expect(within(table()).getAllByRole("row")).toHaveLength(1 + 1);
    });
    expect(within(table()).getByRole("button", { name: "14/07/2026 6:00" })).toBeVisible();
    expect(within(drawer).queryByText(/^Pàgina \d/u)).toBeNull();

    // The origin, the simulations and the club-local range of `scheduledFor`.
    fireEvent.change(within(drawer).getByLabelText("Resultat"), { target: { value: "" } });
    fireEvent.change(within(drawer).getByLabelText("Origen"), { target: { value: "MANUAL" } });
    fireEvent.change(within(drawer).getByLabelText("Simulacions"), { target: { value: "true" } });
    fireEvent.change(within(drawer).getByLabelText("Des del"), {
      target: { value: "2026-08-01" },
    });
    fireEvent.change(within(drawer).getByLabelText("Fins al"), {
      target: { value: "2026-08-10" },
    });
    expect(await within(drawer).findByRole("button", { name: "05/08/2026 10:15" })).toBeVisible();
    await waitFor(() => {
      expect(within(table()).getAllByRole("row")).toHaveLength(1 + 1);
    });
    const runReads = requests.filter((request) => request.url.pathname.endsWith("/runs"));
    expect(runReads.at(-1)?.url.searchParams.getAll("filter")).toEqual([
      "trigger:eq:MANUAL",
      "dryRun:eq:true",
      "scheduledFor:between:2026-07-31T22:00:00Z,2026-08-10T21:59:59Z",
    ]);
    expect(runReads.at(-1)?.url.searchParams.get("page")).toBe("0");
    expect(runReads.map((request) => request.url.searchParams.get("page"))).toContain("1");

    fireEvent.click(within(drawer).getByRole("button", { name: "Treu els filtres" }));
    expect(await within(drawer).findByText("Pàgina 1 de 2")).toBeVisible();
  });

  it("E5-W03 round 2 · E68: P1's and P8's counters read with their own labels", async () => {
    const card = await renderCard();
    expect(
      within(await waitForRow(card, "Obertura de la setmana")).getByRole("button", {
        name: /· 28 classes actives · 184 avisos enviats · 1 setmana oberta$/u,
      }),
    ).toBeVisible();
    const finishing = rowOf(card, "Tancament de classes");
    expect(
      within(finishing).getByRole("button", {
        name: /· 2 classes tancades · 1 entrada d'espera tancada$/u,
      }),
    ).toBeVisible();
    fireEvent.click(within(finishing).getByRole("button", { name: /classes tancades/u }));
    const drawer = await screen.findByRole("dialog", { name: "Execucions · Tancament de classes" });
    expect(await within(drawer).findByText("1 activitat tancada")).toBeVisible();
    expect(within(drawer).queryByText(/activitiesFinished|swept|finished|opened/u)).toBeNull();
  });

  it("R-15-09 an impersonation token cannot manage the processes: the card says why and lists none", async () => {
    const card = await renderCard("impersonated");
    expect(
      await within(card).findByText(
        "Els processos automàtics no es poden gestionar mentre actues com un abonat.",
      ),
    ).toBeVisible();
    expect(within(card).queryAllByRole("listitem")).toHaveLength(0);
  });
});

describe("T-15-34 (i18n) the processes' and the risk card's keys in ca, es and en", () => {
  function keys(value: unknown, prefix = ""): string[] {
    if (typeof value !== "object" || value === null) return [prefix];
    return Object.entries(value).flatMap(([key, child]) =>
      keys(child, prefix === "" ? key : `${prefix}.${key}`),
    );
  }
  function values(value: unknown): string[] {
    if (typeof value === "string") return [value];
    return typeof value === "object" && value !== null ? Object.values(value).flatMap(values) : [];
  }

  it("has every admin-settings:jobs.* and admin-dashboard:risk.* key in the three locales, none empty and none forbidden", () => {
    const groups = [
      [settingsCa.jobs, settingsEs.jobs, settingsEn.jobs],
      [dashboardCa.risk, dashboardEs.risk, dashboardEn.risk],
    ] as const;
    for (const [ca, es, en] of groups) {
      expect(keys(es).sort()).toEqual(keys(ca).sort());
      expect(keys(en).sort()).toEqual(keys(ca).sort());
      for (const text of [...values(ca), ...values(es), ...values(en)]) {
        expect(text.trim()).not.toBe("");
        expect(text).not.toMatch(
          /\bparell(?:a|es)?\b|\bamigable\b|\(paràmetre\)|\bF\d+\b|\bRF-|\bBR-/iu,
        );
      }
    }
    // One name per R-15-01 process.
    expect(Object.keys(settingsCa.jobs.name).sort()).toEqual([
      "BILLING_REMINDER",
      "CLASS_FINISHING",
      "CLEANUP",
      "EXPIRATIONS",
      "NO_SHOW_NOTICES",
      "PAYMENT_TIMEOUTS",
      "REMINDERS",
      "RISK_REVIEW",
      "WAITLIST_FIFO",
      "WEEK_OPENING",
    ]);
  });

  it.each([
    ["es", "Revisión de clases en riesgo", "cada día a las 7:30"],
    ["en", "At-risk class review", "every day at 7:30"],
  ])("renders the card in %s", async (language, name, cadence) => {
    const card = await renderCard("jobsFullClub", language);
    const row = await waitForRow(card, name);
    expect(within(row).getByText(cadence)).toBeVisible();
  });

  it("shows the cadence in club-local time whatever the device's time zone", async () => {
    const deviceZone = process.env.TZ;
    process.env.TZ = "America/Bogota";
    try {
      const card = await renderCard();
      const risk = await waitForRow(card, "Revisió de classes en risc");
      expect(within(risk).getByText("cada dia a les 7:30")).toBeVisible();
      expect(
        within(rowOf(card, "Obertura de la setmana")).getByText("diumenge a les 20:00"),
      ).toBeVisible();
    } finally {
      process.env.TZ = deviceZone;
    }
  });
});

async function waitForRow(card: HTMLElement, name: string): Promise<HTMLElement> {
  await within(card).findByText(name);
  return rowOf(card, name);
}

describe("E5-W05 step 18 · the run drawer (S15 §2, R-15-21)", () => {
  it("E5-W05 step 18: a failed history page keeps the pager and offers a retry, the drawer stays open, and the retry shows page 2", async () => {
    let refused = false;
    server.use(
      http.get("*/api/v1/jobs/:name/runs", ({ request }) => {
        if (new URL(request.url).searchParams.get("page") !== "1" || refused) return undefined;
        refused = true;
        return HttpResponse.json(
          { code: "INTERNAL_ERROR", details: {}, message: "boom", traceId: "t" },
          { status: 500 },
        );
      }),
    );
    const card = await renderCard();
    fireEvent.click(
      within(await waitForRow(card, "Neteja tècnica")).getByRole("button", { name: /correcta/u }),
    );
    const drawer = await screen.findByRole("dialog", { name: "Execucions · Neteja tècnica" });
    expect(await within(drawer).findByText("Pàgina 1 de 2")).toBeVisible();
    fireEvent.click(within(drawer).getByRole("button", { name: "Pàgina següent" }));
    expect(await within(drawer).findByRole("alert")).toHaveTextContent(
      "S'ha produït un error inesperat.",
    );
    // The pager stays, on the page that failed, and the drawer is still open.
    expect(within(drawer).getByText("Pàgina 2 de 2")).toBeVisible();
    expect(within(drawer).getByRole("button", { name: "Pàgina anterior" })).toBeEnabled();
    expect(screen.getByRole("dialog", { name: "Execucions · Neteja tècnica" })).toBeVisible();
    fireEvent.click(within(drawer).getByRole("button", { name: "Torna-ho a provar" }));
    expect(await within(drawer).findByRole("button", { name: "14/07/2026 6:00" })).toBeVisible();
    expect(within(drawer).queryByRole("alert")).toBeNull();
  });

  it("E5-W05 step 18 (R-15-21, T-15-35): a risk-review run's cancelled class opens in D4 on its week with the class selected, as D1's rows do", async () => {
    resetPlanningState();
    mockScenario("jobsFullClub");
    const i18n = await createI18n({
      branding,
      browserLanguages: ["ca"],
      initialNamespaces: ["admin-settings", "enums", "errors"],
      storage: undefined,
    });
    const onNavigate = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <BrandingProvider branding={branding}>
          <JobsCard
            client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
            onNavigate={onNavigate}
          />
        </BrandingProvider>
      </I18nextProvider>,
    );
    const card = await screen.findByRole("region", { name: "Processos automàtics" });
    fireEvent.click(
      within(await waitForRow(card, "Revisió de classes en risc")).getByRole("button", {
        name: /correcta/u,
      }),
    );
    const drawer = await screen.findByRole("dialog", {
      name: "Execucions · Revisió de classes en risc",
    });
    fireEvent.click(await within(drawer).findByRole("button", { name: "10/08/2026 7:30" }));
    const sheet = await within(drawer).findByRole("region", { name: "Fitxa de l'execució" });
    const cancelled = await within(sheet).findByRole("button", {
      name: /cls-2026-08-10-1740-9 · CANCEL$/u,
    });
    fireEvent.click(cancelled);
    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledWith(
        "/calendari?classe=cls-2026-08-10-1740-9&estat=anul%C2%B7lades&setmana=2026-08-10",
      );
    });
  });
});

describe("E5-W05 round 2 #7 · a run's Week and Member effects link to D4 and D10 (R-15-21)", () => {
  /**
   * P1 of a club whose week opens on Friday (`bookings.weekOpensAt` FRIDAY 20:00), run on Friday 31
   * July at 20:00: it opens the booking week `2026-08-07` (`openedWeekKey` = the opening + 7 days,
   * S15 R-15-11), from Friday 7 at 20:00 to Friday 14 at 20:00. R-15-11's `isoWeekStart` is the
   * ISO week that holds `openedWeekKey` + 1 day: Saturday 8 → Monday 3.
   */
  function fridayOpeningRun(runId: string) {
    return {
      actorAccountId: null,
      dryRun: false,
      durationMs: 812,
      effects: {
        counters: { activeClasses: 28, notified: 1, opened: 1 },
        items: [
          {
            action: "OPEN",
            detail: { activeClasses: 28, recipients: 1, weekKey: "2026-08-07" },
            entityId: "2026-08-07",
            entityType: "Week",
          },
          { action: "NOTIFY", detail: {}, entityId: "member-laura", entityType: "Member" },
          {
            action: "CANCEL",
            detail: { classId: "cls-2026-08-10-1740-9" },
            entityId: "cls-2026-08-10-1740-9",
            entityType: "ClassSession",
          },
        ],
      },
      errors: [],
      finishedAt: "2026-07-31T18:00:01Z",
      job: "WEEK_OPENING",
      parametersSnapshot: { "bookings.weekOpensAt": { dayOfWeek: "FRIDAY", time: "20:00" } },
      runId,
      scheduledFor: "2026-07-31T18:00:00Z",
      scheduledForLocal: "2026-07-31T20:00",
      skipReason: null,
      startedAt: "2026-07-31T18:00:00Z",
      status: "SUCCEEDED",
      timeZone: "Europe/Madrid",
      trigger: "SCHEDULE",
    };
  }

  async function openSheet(run: (runId: string) => Record<string, unknown> = fridayOpeningRun) {
    resetPlanningState();
    mockScenario("jobsFullClub");
    server.use(
      http.get("*/api/v1/jobs/week-opening/runs/:runId", ({ params }) =>
        HttpResponse.json(run(String(params.runId))),
      ),
    );
    const i18n = await createI18n({
      branding,
      browserLanguages: ["ca"],
      initialNamespaces: ["admin-settings", "enums", "errors"],
      storage: undefined,
    });
    const onNavigate = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <BrandingProvider branding={branding}>
          <JobsCard
            client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
            onNavigate={onNavigate}
          />
        </BrandingProvider>
      </I18nextProvider>,
    );
    const card = await screen.findByRole("region", { name: "Processos automàtics" });
    fireEvent.click(
      within(await waitForRow(card, "Obertura de la setmana")).getByRole("button", {
        name: /correcta/u,
      }),
    );
    const drawer = await screen.findByRole("dialog", {
      name: "Execucions · Obertura de la setmana",
    });
    fireEvent.click(await within(drawer).findByRole("button", { name: "09/08/2026 20:00" }));
    const sheet = await within(drawer).findByRole("region", { name: "Fitxa de l'execució" });
    return { drawer, onNavigate, sheet };
  }

  it("E5-W05 round 3 #5 (S15 R-15-11): with a Friday opening, the Week item opens D4 on the ISO week that holds `openedWeekKey` + 1 day (Saturday 8 → Monday 3), and the Member item opens D10", async () => {
    const { onNavigate, sheet } = await openSheet();
    const week = await within(sheet).findByRole("link", { name: "Week 2026-08-07 · OPEN" });
    expect(week).toHaveAttribute("href", "/calendari?setmana=2026-08-03");
    fireEvent.click(week);
    expect(onNavigate).toHaveBeenLastCalledWith("/calendari?setmana=2026-08-03");
    const member = within(sheet).getByRole("link", { name: "Member member-laura · NOTIFY" });
    expect(member).toHaveAttribute("href", "/abonats/member-laura");
    fireEvent.click(member);
    expect(onNavigate).toHaveBeenLastCalledWith("/abonats/member-laura");
  });

  it("E5-W05 round 3 #5 (ruling E82, INC-53): when the api's Week item carries `isoWeekStart` in its detail, the link opens that week as it is", async () => {
    const { sheet } = await openSheet((runId) => {
      const run = fridayOpeningRun(runId);
      const [opened, ...rest] = run.effects.items;
      if (opened === undefined) throw new TypeError("No Week item");
      // A made-up week, so the link can only come from the item.
      const detail = { ...opened.detail, isoWeekStart: "2026-08-17" };
      return { ...run, effects: { ...run.effects, items: [{ ...opened, detail }, ...rest] } };
    });
    const week = await within(sheet).findByRole("link", { name: "Week 2026-08-07 · OPEN" });
    expect(week).toHaveAttribute("href", "/calendari?setmana=2026-08-17");
  });

  it("E5-W05 round 2 #7 (assumption A3): a class answer that arrives after the drawer closed navigates nowhere", async () => {
    let release: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => {
      release = resolve;
    });
    const classReads: string[] = [];
    const { drawer, onNavigate, sheet } = await openSheet();
    server.use(
      http.get("*/api/v1/class-sessions/:id", async ({ params }) => {
        classReads.push(String(params.id));
        await answered;
        // Then the calendar world's own answer.
        return undefined;
      }),
    );
    fireEvent.click(
      await within(sheet).findByRole("button", {
        name: "ClassSession cls-2026-08-10-1740-9 · CANCEL",
      }),
    );
    await waitFor(() => {
      expect(classReads).toEqual(["cls-2026-08-10-1740-9"]);
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "Tanca" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Execucions · Obertura de la setmana" }),
      ).toBeNull();
    });
    release();
    await new Promise((resolve) => {
      setTimeout(resolve, 300);
    });
    expect(onNavigate).not.toHaveBeenCalled();
  });
});

describe("E5-W05 step 17 · D11 after a schedule change (R-15-01)", () => {
  it("E5-W05 step 17: saving jobs.dailyTime reads GET /jobs again, so «Caducitats» and «Neteja tècnica» show the new time at once", async () => {
    mockScenario("admin");
    const requests = recordRequests();
    const i18n = await createI18n({
      branding,
      browserLanguages: ["ca"],
      initialNamespaces: ["admin-settings", "enums", "errors", "auth"],
      storage: undefined,
    });
    render(
      <I18nextProvider i18n={i18n}>
        <BrandingProvider branding={branding}>
          <ParameterSettings
            client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
            levels={[]}
            modules={branding.modules}
            onModulesChange={() => undefined}
            plans={[]}
          />
        </BrandingProvider>
      </I18nextProvider>,
    );
    const card = await screen.findByRole("region", { name: "Processos automàtics" });
    const expirations = await waitForRow(card, "Caducitats");
    expect(within(expirations).getByText("cada dia a les 6:00")).toBeVisible();
    const jobsReads = () =>
      requests.filter(
        (request) => request.method === "GET" && request.url.pathname.endsWith("/jobs"),
      ).length;
    const before = jobsReads();

    fireEvent.click(within(card).getByRole("button", { name: "Edita Hora dels processos diaris" }));
    const drawer = await screen.findByRole("dialog", { name: "Hora dels processos diaris" });
    fireEvent.change(within(drawer).getByLabelText("Hora dels processos diaris"), {
      target: { value: "06:30" },
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "DESA" }));

    await waitFor(() => {
      expect(within(rowOf(card, "Caducitats")).getByText("cada dia a les 6:30")).toBeVisible();
    });
    expect(within(rowOf(card, "Neteja tècnica")).getByText("cada dia a les 6:30")).toBeVisible();
    expect(jobsReads()).toBeGreaterThan(before);
  });
});

/** `409 IDEMPOTENCY_KEY_REUSED {reason: IN_PROGRESS}` as the api answers it (CONVENCIONS_API §6, §7). */
const IN_PROGRESS_BODY = {
  code: "IDEMPOTENCY_KEY_REUSED",
  details: { reason: "IN_PROGRESS" },
  message: "The first request with this Idempotency-Key is still in progress",
  traceId: "t-in-progress",
};
/** `common:inProgress` in ca (E80); never `errors:IDEMPOTENCY_KEY_REUSED`'s text. */
const IN_PROGRESS_TEXT = "L'operació encara està en curs. Torna-ho a provar d'aquí a un moment.";

/** The trigger's keys; its first request is answered `IN_PROGRESS`, the rest by the mock world. */
function triggerInProgressOnce(): string[] {
  const keys: string[] = [];
  server.use(
    http.post("*/api/v1/jobs/:name/trigger", ({ request }) => {
      keys.push(request.headers.get("Idempotency-Key") ?? "");
      return keys.length === 1 ? HttpResponse.json(IN_PROGRESS_BODY, { status: 409 }) : undefined;
    }),
  );
  return keys;
}

describe("T-15-32 E7-W06 step 1 (CONVENCIONS_API §7, E79, E80): S15's triggers keep their key on IN_PROGRESS", () => {
  it("E7-W06 step 1: [Simula] keeps its Idempotency-Key on IN_PROGRESS, says «L'operació encara està en curs…», the retry sends the same key, and a new [Simula] after the api's answer takes a new key", async () => {
    const keys = triggerInProgressOnce();
    const card = await renderCard();
    const risk = await waitForRow(card, "Revisió de classes en risc");
    const simulate = () =>
      within(risk).getByRole("button", { name: "Simula Revisió de classes en risc" });
    fireEvent.click(simulate());
    expect(await within(card).findByText(IN_PROGRESS_TEXT)).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(simulate());
    const plan = await screen.findByRole("dialog", {
      name: "Simulació: què faria ara · Revisió de classes en risc",
    });
    fireEvent.click(within(plan).getByRole("button", { name: "Tanca" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    // The api answered: the same payload again is a new submission.
    fireEvent.click(simulate());
    await screen.findByRole("dialog", { name: /^Simulació: què faria ara/u });
    expect(keys).toHaveLength(3);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/u);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("E7-W06 step 1: [Executa ara] keeps its Idempotency-Key on IN_PROGRESS, says «L'operació encara està en curs…» inside the confirmation, which stays open, the retry sends the same key, and a new run after the api's answer takes a new key", async () => {
    const keys = triggerInProgressOnce();
    const card = await renderCard();
    const risk = await waitForRow(card, "Revisió de classes en risc");
    const runNow = () =>
      within(risk).getByRole("button", { name: "Executa ara Revisió de classes en risc" });
    fireEvent.click(runNow());
    const dialog = await screen.findByRole("dialog", {
      name: "Executar «Revisió de classes en risc» ara",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Executa ara" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(IN_PROGRESS_TEXT);
    fireEvent.click(within(dialog).getByRole("button", { name: "Executa ara" }));
    expect(
      await within(card).findByText(
        "Revisió de classes en risc: correcta · 1 en risc · 1 anul·lada · 3 classes revisades",
      ),
    ).toBeVisible();
    // The api answered: running it again is a new submission.
    fireEvent.click(runNow());
    const again = await screen.findByRole("dialog", {
      name: "Executar «Revisió de classes en risc» ara",
    });
    fireEvent.click(within(again).getByRole("button", { name: "Executa ara" }));
    await waitFor(() => {
      expect(keys).toHaveLength(3);
    });
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/u);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("E7-W06 review #5: closing [Executa ara]'s confirmation after an unanswered run gives it up — a run asked for later is a new one with a new key, never the replay of the old one", async () => {
    const keys = triggerInProgressOnce();
    const card = await renderCard();
    const risk = await waitForRow(card, "Revisió de classes en risc");
    const runNow = () =>
      within(risk).getByRole("button", { name: "Executa ara Revisió de classes en risc" });
    fireEvent.click(runNow());
    const dialog = await screen.findByRole("dialog", {
      name: "Executar «Revisió de classes en risc» ara",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Executa ara" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(IN_PROGRESS_TEXT);
    await waitFor(() => {
      expect(within(dialog).getByRole("button", { name: "Cancel·la" })).toBeEnabled();
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel·la" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    fireEvent.click(runNow());
    const again = await screen.findByRole("dialog", {
      name: "Executar «Revisió de classes en risc» ara",
    });
    fireEvent.click(within(again).getByRole("button", { name: "Executa ara" }));
    await waitFor(() => {
      expect(keys).toHaveLength(2);
    });
    expect(keys[1]).not.toBe(keys[0]);
  });

  it("E7-W06 review #5: an unanswered [Simula] keeps its key for 5 minutes only — a simulation asked for later is a new one", async () => {
    const keys = triggerInProgressOnce();
    const card = await renderCard();
    const risk = await waitForRow(card, "Revisió de classes en risc");
    fireEvent.click(
      within(risk).getByRole("button", { name: "Simula Revisió de classes en risc" }),
    );
    expect(await within(card).findByText(IN_PROGRESS_TEXT)).toBeVisible();
    vi.setSystemTime(Date.now() + 5 * 60_000 + 1_000);
    await waitFor(() => {
      expect(
        within(risk).getByRole("button", { name: "Simula Revisió de classes en risc" }),
      ).toBeEnabled();
    });
    fireEvent.click(
      within(risk).getByRole("button", { name: "Simula Revisió de classes en risc" }),
    );
    await screen.findByRole("dialog", { name: /^Simulació: què faria ara/u });
    expect(keys).toHaveLength(2);
    expect(keys[1]).not.toBe(keys[0]);
  });

  it("T-15-32 E7-W07 step 4 (CONVENCIONS_API §7, E85): [Simula] keeps its key after a 503 with the api's body — the retry sends the same one — and a 409 JOB_ALREADY_RUNNING retires it — the next [Simula] is a new submission", async () => {
    const keys: string[] = [];
    server.use(
      http.post("*/api/v1/jobs/:name/trigger", ({ request }) => {
        keys.push(request.headers.get("Idempotency-Key") ?? "");
        if (keys.length === 1) {
          return HttpResponse.json(
            { code: "INTERNAL_ERROR", details: {}, message: "Unavailable", traceId: "t-503" },
            { status: 503 },
          );
        }
        if (keys.length === 2) {
          return HttpResponse.json(
            {
              code: "JOB_ALREADY_RUNNING",
              details: {},
              message: "Job already running",
              traceId: "t-409",
            },
            { status: 409 },
          );
        }
        return undefined;
      }),
    );
    const card = await renderCard();
    const risk = await waitForRow(card, "Revisió de classes en risc");
    const simulate = () =>
      within(risk).getByRole("button", { name: "Simula Revisió de classes en risc" });
    for (const attempt of [1, 2]) {
      fireEvent.click(simulate());
      await waitFor(() => {
        expect(keys).toHaveLength(attempt);
      });
      await waitFor(() => {
        expect(simulate()).toBeEnabled();
      });
    }
    fireEvent.click(simulate());
    await screen.findByRole("dialog", { name: /^Simulació: què faria ara/u });
    expect(keys).toHaveLength(3);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
  });
});
