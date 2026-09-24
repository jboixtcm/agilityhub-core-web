import { createApiClient } from "@agilityhub/api-client";
import { mockScenario, resetCatalogState, resetPlanningState } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CalendarPage } from "./CalendarPage";

const branding: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};
// The D4 mockup is drawn on Wednesday 12 August 2026 (club-local week 2026-08-10…16).
const mockupNow = new Date("2026-08-12T08:00:00Z");

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  vi.useFakeTimers({ now: mockupNow, shouldAdvanceTime: true, toFake: ["Date"] });
  resetCatalogState();
  resetPlanningState();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.useRealTimers();
  resetPlanningState();
  resetCatalogState();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

async function renderCalendar({ readOnly = false, search = "" } = {}) {
  window.history.replaceState(null, "", `/calendari${search}`);
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-scheduling", "enums", "errors"],
    storage: undefined,
  });
  const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
  const onNavigate = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <CalendarPage client={client} onNavigate={onNavigate} readOnly={readOnly} />
      </BrandingProvider>
    </I18nextProvider>,
  );
  return { onNavigate };
}

function grid(range: RegExp) {
  return screen.findByRole("table", { name: range });
}

function selectedCard() {
  return screen.getByRole("region", { name: /^Classe seleccionada/u });
}

describe("T-06-28 D4 / D4b / D4c class calendar (front half, MSW)", () => {
  it("opens «Esborrany» on the first week with drafts, with the validation card and its count", async () => {
    await renderCalendar();
    await grid(/del 10 al 16 d.agost$/u);
    expect(screen.getByRole("button", { name: "Setmana" })).toHaveTextContent(
      "Setmana en curs · del 10 al 16 d’agost",
    );
    expect(window.location.search).toBe("?estat=actives&setmana=2026-08-10");

    fireEvent.click(screen.getByRole("button", { name: "Esborrany" }));
    const drafts = await grid(/del 17 al 23 d.agost$/u);
    expect(window.location.search).toBe("?estat=esborrany&setmana=2026-08-17");
    expect(screen.getByRole("button", { name: "Setmana" })).toHaveTextContent(
      "Setmana vinent · del 17 al 23 d’agost",
    );
    expect(drafts.querySelectorAll(".ah-schedule-cell--dashed")).toHaveLength(28);
    expect(
      screen.getByText(
        "contorn discontinu = esborrany (els alumnes encara no la veuen) · Clica el nom d'un dia per veure'l per pista o per instructor",
      ),
    ).toBeVisible();

    const validation = screen.getByRole("region", { name: "Validació de la setmana" });
    expect(validation).toHaveTextContent(
      "Setmana vinent · del 17 al 23 d’agost · 28 classes en esborrany · cap incoherència",
    );
    expect(within(validation).getByText("28 classes").tagName).toBe("STRONG");
    expect(validation).toHaveTextContent(
      "En validar, les 28 classes passen a actives alhora i els alumnes ja les poden reservar. No es pot validar una classe sola.",
    );
    expect(within(validation).getByRole("button", { name: "VALIDAR LA SETMANA" })).toBeEnabled();

    // ‹ › move inside the filter: the next week with drafts has an inconsistency.
    fireEvent.click(screen.getByRole("button", { name: "Setmana següent" }));
    await grid(/del 24 al 30 d.agost$/u);
    const blocked = screen.getByRole("region", { name: "Validació de la setmana" });
    expect(blocked).toHaveTextContent("6 classes en esborrany · 1 incoherència");
    expect(within(blocked).getByRole("button", { name: "VALIDAR LA SETMANA" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Setmana següent" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /pista Central amb dues classes alhora/u }),
    ).toBeVisible();
  });

  it("[VALIDAR LA SETMANA] turns every draft of the week active at once", async () => {
    await renderCalendar({ search: "?estat=esborrany" });
    await grid(/del 17 al 23 d.agost$/u);

    fireEvent.click(screen.getByRole("button", { name: "VALIDAR LA SETMANA" }));
    const dialog = await screen.findByRole("dialog", { name: "Validació de la setmana" });
    fireEvent.click(within(dialog).getByRole("button", { name: "VALIDAR LA SETMANA" }));

    expect(await screen.findByText("28 classes validades")).toBeVisible();
    await waitFor(() => {
      expect(window.location.search).toBe("?estat=actives&setmana=2026-08-17");
    });
    expect(screen.getByRole("button", { name: "Actives" })).toHaveAttribute("aria-pressed", "true");
    const active = await grid(/del 17 al 23 d.agost$/u);
    await waitFor(() => {
      expect(active.querySelectorAll("button.ah-schedule-cell")).toHaveLength(28);
    });
    expect(active.querySelectorAll(".ah-schedule-cell--dashed")).toHaveLength(0);
    expect(within(active).getAllByText("0/5").length).toBeGreaterThan(0);
  });

  it("cancels an active class with registrants through D4c: four rows, text required, «ANUL·LA I AVISA ELS 4 ALUMNES»", async () => {
    const keys: string[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.method === "POST" && request.url.endsWith("/cancellation")) {
        keys.push(request.headers.get("Idempotency-Key") ?? "");
      }
    });
    await renderCalendar();
    const week = await grid(/del 10 al 16 d.agost$/u);

    fireEvent.click(within(week).getByRole("button", { name: /^dc 12 18:50 · B\+C · 4\/5 \+2/u }));
    expect(selectedCard()).toHaveTextContent(
      "Classe seleccionada — dc 12 · 18:50 · B+C · Central · Marcactiva4/5 +2",
    );
    fireEvent.click(within(selectedCard()).getByRole("button", { name: "ANUL·LA LA CLASSE" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Anul·lar la classe — dc 12 · 18:50 · B+C · Central · Marc",
    });
    expect(dialog).toHaveTextContent(
      "Aquesta classe té 4 alumnes inscrits. Si l'anul·les, rebran un avís a l'app, per correu i per SMS amb el text que escriguis a sota.",
    );
    const rows = within(
      within(dialog).getByRole("table", { name: "Alumnes inscrits" }),
    ).getAllByRole("row");
    expect(rows.map((row) => row.textContent)).toEqual([
      "Laura Serra + DunaCapp · correu · SMS (2 telèfons)",
      "Marc Prats + Chun-liBapp · correu · SMS",
      "Aina Roca + NassBapp · correu · SMS",
      "Biel Puig + ThaiCapp · correu · SMS",
    ]);
    expect(dialog).toHaveTextContent(
      "S'envia amb la plantilla «Classe anul·lada pel club» · també a la llista d'espera (2)",
    );
    const confirm = within(dialog).getByRole("button", { name: "ANUL·LA I AVISA ELS 4 ALUMNES" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Text de l'avís"), {
      target: { value: "La classe queda anul·lada per la pluja. Disculpeu les molèsties!" },
    });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    expect(await screen.findByText("Classe anul·lada")).toBeVisible();
    await waitFor(() => {
      expect(
        within(week).getByRole("button", {
          name: /^dc 12 18:50 · B\+C · 0\/5 · anul·lada · pel club/u,
        }),
      ).toBeVisible();
    });
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it("[ELIMINA] of an active class goes through the same D4c modal", async () => {
    await renderCalendar();
    const week = await grid(/del 10 al 16 d.agost$/u);

    fireEvent.click(within(week).getByRole("button", { name: /^dt 11 18:50 · A\+B · 3\/5/u }));
    fireEvent.click(within(selectedCard()).getByRole("button", { name: "ELIMINA" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Anul·lar la classe — dt 11 · 18:50 · A+B · Central · Laura",
    });
    const confirm = within(dialog).getByRole("button", { name: "ANUL·LA I AVISA ELS 3 ALUMNES" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Text de l'avís"), {
      target: { value: "Eliminem la classe." },
    });
    fireEvent.click(confirm);

    expect(await screen.findByText("Classe eliminada")).toBeVisible();
    await waitFor(() => {
      expect(
        within(week).getByRole("button", {
          name: /^dt 11 18:50 · A\+B · 0\/5 · anul·lada · eliminada/u,
        }),
      ).toBeVisible();
    });

    fireEvent.click(screen.getByRole("button", { name: "Anul·lades" }));
    const cancelled = await grid(/del 10 al 16 d.agost$/u);
    await waitFor(() => {
      expect(cancelled.querySelectorAll("button.ah-schedule-cell--struck")).toHaveLength(2);
    });
  });

  it("R-06-09 saves the diff with the version and handles STALE_VERSION and CAPACITY_BELOW_BOOKINGS", async () => {
    await renderCalendar();
    const week = await grid(/del 10 al 16 d.agost$/u);
    fireEvent.click(within(week).getByRole("button", { name: /^dc 12 18:50 · B\+C/u }));

    const accept = within(selectedCard()).getByRole("button", { name: "ACCEPTA" });
    expect(accept).toBeDisabled();
    fireEvent.change(within(selectedCard()).getByRole("spinbutton"), { target: { value: "3" } });
    fireEvent.click(accept);
    expect(
      await within(selectedCard()).findByText(
        "La capacitat no pot ser inferior a les reserves actuals.",
      ),
    ).toBeVisible();

    let calendarReads = 0;
    let patchBody: unknown;
    server.events.on("request:start", ({ request }) => {
      if (request.method === "GET" && request.url.includes("/calendar")) calendarReads += 1;
    });
    server.use(
      http.patch("*/api/v1/class-sessions/:id", async ({ request }) => {
        patchBody = await request.json();
        return HttpResponse.json(
          { code: "STALE_VERSION", details: {}, message: "Stale", traceId: "t" },
          { status: 409 },
        );
      }),
    );
    fireEvent.change(within(selectedCard()).getByRole("spinbutton"), { target: { value: "6" } });
    fireEvent.click(within(selectedCard()).getByRole("button", { name: "ACCEPTA" }));
    expect(
      await within(selectedCard()).findByText(
        "Aquest element s'ha modificat des d'un altre lloc. Actualitzeu-lo i torneu-ho a provar.",
      ),
    ).toBeVisible();
    expect(patchBody).toEqual({ capacity: 6, version: 1 });
    await waitFor(() => {
      expect(calendarReads).toBeGreaterThan(0);
    });

    server.resetHandlers();
    fireEvent.change(within(selectedCard()).getByRole("spinbutton"), { target: { value: "6" } });
    fireEvent.click(within(selectedCard()).getByRole("button", { name: "ACCEPTA" }));
    expect(await screen.findByText("Canvis desats")).toBeVisible();
    await waitFor(() => {
      expect(
        within(week).getByRole("button", { name: /^dc 12 18:50 · B\+C · 4\/6 \+2/u }),
      ).toBeVisible();
    });
  });

  it("R-06-11 lists the RING_BLOCK_CONFLICT conflicts inside the block drawer", async () => {
    await renderCalendar();
    await grid(/del 10 al 16 d.agost$/u);

    fireEvent.click(screen.getByRole("button", { name: "Bloqueja pista" }));
    const drawer = await screen.findByRole("dialog", { name: "Bloqueja pista" });
    fireEvent.change(within(drawer).getByLabelText("Pista"), { target: { value: "ring-cadells" } });
    fireEvent.change(within(drawer).getByLabelText("Data"), { target: { value: "13082026" } });
    expect(within(drawer).getByLabelText("Data")).toHaveValue("13/08/2026");
    fireEvent.change(within(drawer).getByLabelText("De"), { target: { value: "18:00" } });
    fireEvent.change(within(drawer).getByLabelText("A"), { target: { value: "19:00" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "DESA EL BLOQUEIG" }));

    const conflicts = await within(drawer).findByRole("list", { name: "Coincideix amb:" });
    expect(
      within(conflicts)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["dj 18:50 · Cadells · 18:50–19:50"]);
    expect(within(drawer).getByRole("alert")).toHaveTextContent(
      "Aquest bloqueig de pista coincideix amb un altre element.",
    );

    fireEvent.change(within(drawer).getByLabelText("De"), { target: { value: "16:00" } });
    fireEvent.change(within(drawer).getByLabelText("A"), { target: { value: "17:00" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "DESA EL BLOQUEIG" }));
    expect(await screen.findByText("Bloqueig desat")).toBeVisible();
    expect(
      await screen.findByRole("button", {
        name: /^Cadells bloquejada · manteniment 16:00–17:00$/u,
      }),
    ).toBeVisible();
  });

  it("INSTRUCTOR reads the calendar without actions and with inert chips (A22 c)", async () => {
    mockScenario("instructor");
    await renderCalendar({ readOnly: true });
    const week = await grid(/del 10 al 16 d.agost$/u);

    expect(screen.queryByRole("button", { name: "Crear classe" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bloqueja pista" })).not.toBeInTheDocument();
    expect(
      within(week).queryByRole("button", { name: /Carretera bloquejada/u }),
    ).not.toBeInTheDocument();
    expect(within(week).getByRole("group", { name: /Carretera bloquejada/u })).toBeVisible();

    fireEvent.click(within(week).getByRole("button", { name: /^dc 12 18:50 · B\+C/u }));
    const card = selectedCard();
    expect(within(card).queryByRole("button", { name: "ACCEPTA" })).not.toBeInTheDocument();
    expect(
      within(card).queryByRole("button", { name: "ANUL·LA LA CLASSE" }),
    ).not.toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "ELIMINA" })).not.toBeInTheDocument();
    expect(within(card).queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(card).queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(card).toHaveTextContent(/Pista\s+Central/u);

    fireEvent.click(screen.getByRole("button", { name: "Esborrany" }));
    await grid(/del 17 al 23 d.agost$/u);
    expect(screen.queryByRole("button", { name: "VALIDAR LA SETMANA" })).not.toBeInTheDocument();
  });

  it("shows the week warnings and selects the class of a warning; day headers open the day view", async () => {
    const { onNavigate } = await renderCalendar();
    await grid(/del 10 al 16 d.agost$/u);

    const warnings = screen.getByRole("region", { name: "Avisos d'incoherència de la setmana" });
    fireEvent.click(
      within(warnings).getByRole("button", {
        name: "dj 18:50 — Marc assignat a dues pistes alhora (Cadells i Petita)",
      }),
    );
    expect(selectedCard()).toHaveTextContent("Classe seleccionada — dj 13 · 18:50 · Cadells");
    expect(
      screen.getByText(
        (_, element) =>
          element?.classList.contains("calendar-footer") === true &&
          element.textContent ===
            "n/n +e = inscrits/places + llista d'espera ·  = pista bloquejada · Clica el nom d'un dia per veure'l per pista o per instructor",
      ),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "dc 12" }));
    expect(onNavigate).toHaveBeenCalledWith("/calendari/dia/2026-08-12?estat=actives");
  });
});
