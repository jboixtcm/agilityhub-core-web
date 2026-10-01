import { type components, createApiClient } from "@agilityhub/api-client";
import {
  JOBS_MOCK_NOW,
  mockScenario,
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

import { ClassRegistrantsPanel } from "./ClassRegistrantsPanel";

/** D4's Wednesday 12 at 18:50 «B+C» of the calendar world: 4 booked of 5, 2 waiting. */
const CLASS_ID = "cls-2026-08-12-1850-0";
const branding: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  vi.useFakeTimers({ now: new Date(JOBS_MOCK_NOW), shouldAdvanceTime: true, toFake: ["Date"] });
  resetPlanningState();
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

async function renderPanel({
  modules = branding.modules,
  onChanged = vi.fn(),
  readOnly = false,
}: { modules?: readonly string[]; onChanged?: () => void; readOnly?: boolean } = {}) {
  const clubBranding: Branding = { ...branding, modules: [...modules] };
  const i18n = await createI18n({
    branding: clubBranding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-scheduling", "enums", "errors"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={clubBranding}>
        <ClassRegistrantsPanel
          booked={4}
          capacity={5}
          classSessionId={CLASS_ID}
          client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
          onChanged={onChanged}
          readOnly={readOnly}
        />
      </BrandingProvider>
    </I18nextProvider>,
  );
  const panel = await screen.findByRole("region", { name: "Inscrits (4/5)" });
  await within(panel).findByText("Laura + Duna");
  return panel;
}

describe("E5-W03 step 1 · the registrants panel of a class (S08 §6, R-08-12, R-08-16)", () => {
  it("lists every booking as the api orders it, with its state, and the D12 «En espera: …» line", async () => {
    const panel = await renderPanel();
    const rows = within(panel)
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    // Each row: «{abonat} + {gos}», the level chip (E5-T29 `levelCode`, the dog's own level) and
    // the displayState chip. E5-W05 round 3 #4: the «B+C» class has only B and C dogs (R-08-04).
    expect(rows.slice(0, 5)).toEqual([
      "Laura + DunaCconfirmada",
      "Anna + NassBconfirmada",
      "Eva + FishBconfirmada",
      "Pau + BlatBconfirmada",
      "Jana + MixaCanul·lada tard",
    ]);
    // E5-W05 step 2: «{guia} + {gos}» (E5-T29 `memberFirstName`), mockup D12's line.
    expect(within(panel).getByText("En espera: Júlia + Kira · Roser + Lluna")).toBeVisible();
    // Nothing to book, cancel or mark here (R-08-19, S10).
    expect(
      within(panel).queryByRole("button", { name: /reserva|assistència|anul·la/iu }),
    ).toBeNull();
  });

  it("offers [Treu de la llista] only to an ADMIN; an INSTRUCTOR reads the same panel", async () => {
    const admin = await renderPanel();
    expect(
      within(admin).getAllByRole("button", { name: /^Treu .* de la llista d'espera$/u }),
    ).toHaveLength(2);
    cleanup();
    const instructor = await renderPanel({ readOnly: true });
    expect(within(instructor).getByText("En espera: Júlia + Kira · Roser + Lluna")).toBeVisible();
    expect(within(instructor).queryByRole("button", { name: /Treu/u })).toBeNull();
  });

  it("R-08-16 removes a waiting entry after the confirmation, reads the list again and tells the host", async () => {
    const onChanged = vi.fn();
    const removals: string[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.method === "POST" && request.url.includes("/waitlist-entries/")) {
        removals.push(new URL(request.url).pathname);
      }
    });
    const panel = await renderPanel({ onChanged });
    fireEvent.click(
      within(panel).getByRole("button", { name: "Treu Júlia + Kira de la llista d'espera" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Treure de la llista d'espera" });
    expect(
      within(dialog).getByText("Júlia + Kira deixarà d'estar en espera d'aquesta classe."),
    ).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Treu de la llista" }));
    await waitFor(() => {
      expect(within(panel).getByText("En espera: Roser + Lluna")).toBeVisible();
    });
    expect(removals).toEqual([`/api/v1/waitlist-entries/wl-${CLASS_ID}-0/cancellation`]);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("422 WAITLIST_ENTRY_NOT_LIVE shows why inside the panel and reads the list again", async () => {
    const panel = await renderPanel();
    server.use(
      http.post("*/api/v1/waitlist-entries/:id/cancellation", () =>
        HttpResponse.json(
          { code: "WAITLIST_ENTRY_NOT_LIVE", details: {}, message: "Not live", traceId: "t" },
          { status: 422 },
        ),
      ),
    );
    fireEvent.click(
      within(panel).getByRole("button", { name: "Treu Roser + Lluna de la llista d'espera" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Treure de la llista d'espera" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Treu de la llista" }));
    expect(
      await within(panel).findByText("Aquesta entrada de la llista d'espera ja no està activa."),
    ).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("another error stays inside the confirmation, where the admin is", async () => {
    const panel = await renderPanel();
    server.use(
      http.post("*/api/v1/waitlist-entries/:id/cancellation", () =>
        HttpResponse.json(
          { code: "MODULE_DISABLED", details: {}, message: "Off", traceId: "t" },
          { status: 404 },
        ),
      ),
    );
    fireEvent.click(
      within(panel).getByRole("button", { name: "Treu Júlia + Kira de la llista d'espera" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Treure de la llista d'espera" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Treu de la llista" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Aquest mòdul està desactivat.",
    );
  });

  it("R-08-14 shows each waiting entry's position in a FIFO club (`waitlist.mode = FIFO`)", async () => {
    const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
    const mode = await client.GET("/parameters/{key}", {
      params: { path: { key: "waitlist.mode" } },
    });
    await client.PUT("/parameters/{key}", {
      body: { value: "FIFO", version: mode.data?.version ?? 0 },
      params: { path: { key: "waitlist.mode" } },
    });
    const panel = await renderPanel();
    expect(within(panel).getByText("En espera: 1. Júlia + Kira · 2. Roser + Lluna")).toBeVisible();
  });

  it("S08 §9: without WAITLIST there is no waiting line and no waiting request", async () => {
    const paths: string[] = [];
    server.events.on("request:start", ({ request }) => {
      paths.push(new URL(request.url).pathname);
    });
    const panel = await renderPanel({
      modules: branding.modules.filter((module) => module !== "WAITLIST"),
    });
    expect(within(panel).queryByText(/En espera/u)).toBeNull();
    expect(paths.some((path) => path.endsWith("/waitlist-entries"))).toBe(false);
  });
});

type ClassBookingItem = components["schemas"]["ClassBookingItem"];
type WaitlistEntry = components["schemas"]["WaitlistEntry"];

/** A row of `GET /class-sessions/{id}/bookings` as the api sends it (E5-T29: displayState, levelCode). */
function registrant(fields: Partial<ClassBookingItem> & Pick<ClassBookingItem, "id">) {
  return {
    bookedAt: "2026-08-09T10:00:00Z",
    bookingWeekKey: "2026-08-09",
    classSessionId: CLASS_ID,
    classStartsAt: "2026-08-12T16:50:00Z",
    displayState: "CONFIRMED",
    dogId: `dog-${fields.id}`,
    dogName: "Duna",
    late: null,
    levelCode: null,
    memberId: `member-${fields.id}`,
    memberName: "Laura",
    origin: "APP",
    state: "ACTIVE",
    ...fields,
  } satisfies ClassBookingItem;
}

/** An entry of `GET /class-sessions/{id}/waitlist-entries` (E5-T29: handlerName, memberFirstName). */
function waiting(fields: Partial<WaitlistEntry> & Pick<WaitlistEntry, "dogName" | "id">) {
  return {
    bookingId: null,
    cancelReason: null,
    cancelledAt: null,
    classSession: {
      description: "B+C",
      endsAtLocal: "2026-08-12T19:50",
      instructorName: null,
      ringName: null,
      startsAtLocal: "2026-08-12T18:50",
    },
    classSessionId: CLASS_ID,
    confirmBy: null,
    dog: { id: `dog-${fields.id}`, name: fields.dogName ?? "", sex: "FEMALE" },
    dogId: `dog-${fields.id}`,
    handlerName: null,
    joinedAt: "2026-08-10T08:00:00Z",
    memberFirstName: null,
    memberId: `member-${fields.id}`,
    notifiedAt: null,
    position: null,
    state: "ACTIVE",
    ...fields,
  } satisfies WaitlistEntry;
}

describe("E5-W05 steps 1 and 2 · the registrants read E5-T29's fields (S08 §6, S10 R-10-00)", () => {
  it("E5-W05 step 1: each chip reads the api's displayState with 07's literals (a past booking «feta», a NO_SHOW mark «no presentat»), never `state`; the level chip is levelCode, none when null", async () => {
    server.use(
      http.get("*/api/v1/class-sessions/:id/bookings", () =>
        HttpResponse.json({
          items: [
            registrant({ displayState: "DONE", id: "laura", levelCode: "C" }),
            registrant({
              displayState: "NO_SHOW",
              dogName: "Chun-li",
              id: "marc",
              levelCode: "B",
              memberName: "Marc",
            }),
            registrant({
              displayState: "CANCELLED_LATE",
              dogName: "Thai",
              id: "sergio",
              late: true,
              memberName: "Sergio",
              state: "CANCELLED_LATE",
            }),
          ],
        }),
      ),
    );
    const panel = await renderPanel();
    const rows = within(panel).getAllByRole("listitem");
    expect(rows.slice(0, 3).map((item) => item.textContent)).toEqual([
      "Laura + DunaCfeta",
      "Marc + Chun-liBno presentat",
      "Sergio + Thaianul·lada tard",
    ]);
    expect(within(panel).queryByText("confirmada")).toBeNull();
    expect(within(rows[1] ?? panel).getByText("no presentat")).toHaveClass("ah-tone--danger");
    const levels = [...panel.querySelectorAll(".ah-registrants__level")].map(
      (chip) => chip.textContent,
    );
    expect(levels).toEqual(["C", "B"]);
  });

  it("E5-W05 step 2: «En espera: {guia} + {gos}», the guide being handlerName ?? memberFirstName, with the position in a FIFO club (mockup D12)", async () => {
    server.use(
      http.get("*/api/v1/class-sessions/:id/waitlist-entries", () =>
        HttpResponse.json({
          items: [
            waiting({ dogName: "Kira", id: "kira", memberFirstName: "Júlia", position: 1 }),
            waiting({
              dogName: "Llamp",
              handlerName: "Gina Soler",
              id: "llamp",
              memberFirstName: "Oriol",
              position: 2,
            }),
          ],
        }),
      ),
    );
    const panel = await renderPanel();
    expect(
      await within(panel).findByText("En espera: 1. Júlia + Kira · 2. Gina Soler + Llamp"),
    ).toBeVisible();
    expect(
      within(panel).getByRole("button", {
        name: "Treu 2. Gina Soler + Llamp de la llista d'espera",
      }),
    ).toBeVisible();
  });

  it("E5-W05 step 2: the mock's staff waitlist sends each entry's first name, as the api does: «En espera: Júlia + Kira · Roser + Lluna»", async () => {
    const panel = await renderPanel();
    expect(within(panel).getByText("En espera: Júlia + Kira · Roser + Lluna")).toBeVisible();
  });
});

describe("E5-W05 round 2 · the mock's level chip is the dog's own level, and none with levels off (S08 §6 levelCode)", () => {
  const levelChips = (panel: HTMLElement) =>
    [...panel.querySelectorAll(".ah-registrants__level")].map((chip) => chip.textContent);

  it("E5-W05 round 2 #3: with levels on each chip is the dog's level (Duna «C», her census level), one the «B+C» class allows (round 3 #4); in a club with levels.enabled = false (planningNoLevels) no row has a level chip", async () => {
    const panel = await renderPanel();
    expect(within(panel).getAllByRole("listitem")[0]?.textContent).toBe("Laura + DunaCconfirmada");
    expect(levelChips(panel)).toEqual(["C", "B", "B", "B", "C"]);
    cleanup();
    mockScenario("planningNoLevels");
    const noLevels = await renderPanel();
    expect(levelChips(noLevels)).toEqual([]);
    expect(
      within(noLevels)
        .getAllByRole("listitem")
        .slice(0, 5)
        .map((item) => item.textContent),
    ).toEqual([
      "Laura + Dunaconfirmada",
      "Marc + Chun-liconfirmada",
      "Anna + Nassconfirmada",
      "Eva + Fishconfirmada",
      "Sergio + Thaianul·lada tard",
    ]);
  });
});
