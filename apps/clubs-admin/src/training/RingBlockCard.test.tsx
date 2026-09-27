import { createApiClient } from "@agilityhub/api-client";
import {
  mockScenario,
  type MockScenario,
  resetPlanningState,
  resetTrainingMockState,
  TRAINING_MOCK_NOW,
  trainingState,
} from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { AuthClient, MemoryRefreshTokenStore, SessionProvider } from "@agilityhub/auth";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AgendaRingCardPage } from "./RingBlockCard";

const branding: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  vi.useFakeTimers({ now: new Date(TRAINING_MOCK_NOW), shouldAdvanceTime: true, toFake: ["Date"] });
  resetPlanningState();
  resetTrainingMockState();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.events.removeAllListeners();
  vi.useRealTimers();
  resetTrainingMockState();
  resetPlanningState();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

function recordBodies(): unknown[] {
  const bodies: unknown[] = [];
  server.events.on("request:start", ({ request }) => {
    if (request.method !== "POST" || !request.url.endsWith("/ring-blocks")) return;
    void request
      .clone()
      .json()
      .then((body: unknown) => {
        bodies.push(body);
      });
  });
  return bodies;
}

async function renderCard(scenario: MockScenario, modules: readonly string[] = branding.modules) {
  mockScenario(scenario);
  window.history.replaceState(null, "", "/agenda");
  const clubBranding: Branding = { ...branding, modules: [...modules] };
  const i18n = await createI18n({
    branding: clubBranding,
    browserLanguages: ["ca"],
    initialNamespaces: ["instructor", "enums", "errors", "admin-scheduling", "shell", "training"],
    storage: undefined,
  });
  const auth = new AuthClient({
    apiBaseUrl: `${window.location.origin}/api/v1`,
    clientId: "clubs-admin",
    identityBaseUrl: window.location.origin,
    mockMode: true,
    mockRefreshTokenStore: new MemoryRefreshTokenStore(),
  });
  await auth.login("ivet.puig@example.test", "secret-password");
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={clubBranding}>
        <SessionProvider client={auth}>
          <AgendaRingCardPage
            client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
          />
        </SessionProvider>
      </BrandingProvider>
    </I18nextProvider>,
  );
  await screen.findByRole("heading", { name: "Reservar o bloquejar pista (sense alumne)" });
  await waitFor(() => {
    expect(screen.getByRole("combobox", { name: "Pista" })).toBeEnabled();
  });
}

function select(name: string): HTMLSelectElement {
  const element = screen.getByRole("combobox", { name });
  if (!(element instanceof HTMLSelectElement)) throw new TypeError(`${name} is not a select`);
  return element;
}

function options(name: string): string[] {
  return [...select(name).options].map((option) => option.textContent);
}

/** How many `GET /training-slots` answers MSW has sent (the card's grid reads). */
function countSlotReads(): () => number {
  let count = 0;
  server.events.on("response:mocked", ({ request }) => {
    if (request.method === "GET" && new URL(request.url).pathname.endsWith("/training-slots")) {
      count += 1;
    }
  });
  return () => count;
}

/** The grid read again after a refusal has landed and been rendered. */
async function refreshedGrid(reads: () => number, expected: number) {
  await waitFor(() => {
    expect(reads()).toBe(expected);
  });
  await new Promise((resolve) => {
    setTimeout(resolve, 50);
  });
}

/** A live training another member books while the card is on screen. */
function bookedMeanwhile(start: string, end: string) {
  trainingState.bookings.push({
    createdAt: "2026-08-03T05:05:00Z",
    date: "2026-08-03",
    dogId: "dog-nit",
    dogName: "Nit",
    end,
    id: "tb-meanwhile",
    memberId: "member-nil",
    memberName: "Nil",
    origin: "APP",
    ringId: "ring-central",
    start,
    state: "ACTIVE",
  });
}

async function choose(day: string, ring: string, from: string, to: string) {
  fireEvent.change(select("Dia"), { target: { value: day } });
  fireEvent.change(select("Pista"), { target: { value: ring } });
  await waitFor(() => {
    expect([...select("De").options].some((option) => option.value === from)).toBe(true);
  });
  fireEvent.change(select("De"), { target: { value: from } });
  fireEvent.change(select("A"), { target: { value: to } });
}

describe("D12 card «Reservar o bloquejar pista (sense alumne)» (S09 §2 row D12, R-09-11)", () => {
  it("the mockup's controls: kinds, «motiu: …», day and times, ring, RESERVA", async () => {
    await renderCard("instructor");
    const kinds = screen.getByRole("group", { name: "Tipus" });
    expect(
      within(kinds)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Reserva de pista", "Bloqueig"]);
    expect(options("Motiu")).toEqual([
      "motiu: classe particular",
      "motiu: teràpia",
      "motiu: preparació",
      "motiu: altres",
    ]);
    expect(options("Pista")).toEqual(["Muntanya", "Central", "Carretera", "Cadells", "Petita"]);
    expect(select("Dia").options[0]?.textContent).toBe("dl 3");
    // Muntanya today: 7:00 has begun, so the first free half hour is 7:30.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Reserva" })).toBeEnabled();
    });
    expect(select("De").value).toBe("07:30");
    expect(select("A").value).toBe("08:00");
    fireEvent.click(within(kinds).getByRole("button", { name: "Bloqueig" }));
    expect(options("Motiu")).toEqual(["motiu: manteniment", "motiu: altres"]);
    expect(screen.getByRole("button", { name: "Bloqueja" })).toBeEnabled();
  });

  it("offers only the free half hours of the ring and their runs, and posts the block", async () => {
    const bodies = recordBodies();
    await renderCard("instructor");
    await choose("2026-08-06", "ring-petita", "18:00", "19:00");
    // 19:00 is taken on Petita (a therapy reservation): the run from 18:00 ends there.
    expect(options("A")).toEqual(["18:30", "19:00"]);
    expect(options("De")).not.toContain("19:00");
    fireEvent.click(screen.getByRole("button", { name: "Reserva" }));
    expect(await screen.findByText("Pista reservada")).toBeVisible();
    expect(bodies).toEqual([
      {
        from: "2026-08-06T16:00:00.000Z",
        kind: "RESERVATION",
        note: null,
        reason: "PRIVATE_CLASS",
        ringId: "ring-petita",
        to: "2026-08-06T17:00:00.000Z",
      },
    ]);
  });

  it("an instructor with live bookings in the way is told to ask the administration", async () => {
    const bodies = recordBodies();
    const reads = countSlotReads();
    await renderCard("instructor");
    await choose("2026-08-03", "ring-central", "17:30", "18:00");
    const before = reads();
    bookedMeanwhile("17:30", "18:00");
    fireEvent.click(screen.getByRole("button", { name: "Reserva" }));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Aquesta pista té reserves.")).toBeVisible();
    expect(
      within(alert).getByText("Demana a l'administració que alliberi la pista."),
    ).toBeVisible();
    expect(within(alert).queryByRole("button")).not.toBeInTheDocument();
    expect(JSON.stringify(bodies)).not.toContain("cancelBookings");
    // The refused range stays on screen with its refusal, even once the grid says it is taken.
    await refreshedGrid(reads, before + 1);
    expect(select("De").value).toBe("17:30");
    expect(select("A").value).toBe("18:00");
    // An instructor can never pick a half hour held by a live training (R-09-13).
    expect(options("De")).not.toContain("8:30");
  });

  it("E5-W02 round 2 · review #2: after the refreshed grid the ADMIN still confirms 17:30–18:00 and resends it with cancelBookings (R-09-13)", async () => {
    const bodies = recordBodies();
    const reads = countSlotReads();
    await renderCard("admin");
    await choose("2026-08-03", "ring-central", "17:30", "18:00");
    const before = reads();
    bookedMeanwhile("17:30", "18:00");
    fireEvent.click(screen.getByRole("button", { name: "Reserva" }));
    await screen.findByText("Nil + Nit");
    // The grid is read again after the refusal: 17:30 is now a live training there.
    await refreshedGrid(reads, before + 1);
    expect(select("De").value).toBe("17:30");
    expect(select("A").value).toBe("18:00");
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("Nil + Nit")).toBeVisible();
    fireEvent.click(within(alert).getByRole("button", { name: "Anul·la les reserves i desa" }));
    expect(await screen.findByText("Pista reservada")).toBeVisible();
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).not.toHaveProperty("cancelBookings");
    expect(bodies[1]).toEqual({ ...(bodies[0] as object), cancelBookings: true });
    expect(bodies[1]).toMatchObject({
      from: "2026-08-03T15:30:00.000Z",
      ringId: "ring-central",
      to: "2026-08-03T16:00:00.000Z",
    });
    expect(trainingState.bookings.find((item) => item.id === "tb-meanwhile")?.state).toBe(
      "CANCELLED_BY_CLUB",
    );
  });

  it("E5-W02 round 2 · review #2: an ADMIN may pick a half hour held by a live training and force it (R-09-13)", async () => {
    const bodies = recordBodies();
    await renderCard("admin");
    // Central 8:30 on Monday 3 is Sergio + Thai's training (the 08 mockup's booked cell).
    await choose("2026-08-03", "ring-central", "08:30", "09:00");
    expect(select("De").value).toBe("08:30");
    fireEvent.click(screen.getByRole("button", { name: "Reserva" }));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Sergio + Thai")).toBeVisible();
    fireEvent.click(within(alert).getByRole("button", { name: "Anul·la les reserves i desa" }));
    expect(await screen.findByText("Pista reservada")).toBeVisible();
    expect(bodies[1]).toMatchObject({
      cancelBookings: true,
      from: "2026-08-03T06:30:00.000Z",
      to: "2026-08-03T07:00:00.000Z",
    });
    expect(
      trainingState.bookings.find((item) => item.id === "tb-2026-08-03-0830-central")?.state,
    ).toBe("CANCELLED_BY_CLUB");
  });

  it("FREE_TRAINING off: «Bloqueig» only, and the times without a grid", async () => {
    await renderCard(
      "trainingModuleOffInstructor",
      branding.modules.filter((m) => m !== "FREE_TRAINING"),
    );
    const kinds = screen.getByRole("group", { name: "Tipus" });
    expect(
      within(kinds)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Bloqueig"]);
    expect(options("De")[0]).toBe("0:00");
    expect(screen.getByRole("button", { name: "Bloqueja" })).toBeEnabled();
  });

  it("E5-W02 round 2 · review #5: without a grid every half hour of the day can be taken, the last one included", async () => {
    const bodies = recordBodies();
    await renderCard(
      "trainingModuleOffInstructor",
      branding.modules.filter((m) => m !== "FREE_TRAINING"),
    );
    fireEvent.change(select("Dia"), { target: { value: "2026-08-11" } });
    expect(options("De")).toHaveLength(48);
    expect(options("De").at(-1)).toBe("23:30");
    fireEvent.change(select("De"), { target: { value: "23:30" } });
    expect(options("A")).toEqual(["24:00"]);
    fireEvent.change(select("De"), { target: { value: "13:30" } });
    expect(options("A")[0]).toBe("14:00");
    expect(options("A").at(-1)).toBe("24:00");
    fireEvent.change(select("A"), { target: { value: "14:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Bloqueja" }));
    await waitFor(() => {
      expect(bodies).toHaveLength(1);
    });
    expect(bodies[0]).toMatchObject({
      from: "2026-08-11T11:30:00.000Z",
      kind: "BLOCK",
      to: "2026-08-11T12:00:00.000Z",
    });
  });
});
