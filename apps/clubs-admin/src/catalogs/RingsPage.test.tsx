import { createApiClient } from "@agilityhub/api-client";
import {
  mockScenario,
  resetCatalogState,
  resetPlanningState,
  resetTrainingMockState,
  TRAINING_MOCK_NOW,
  trainingState,
} from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { RingsPage } from "./RingsPage";

const branding: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

// Monday 3 August 2026 at 7:10 in the club (the S09 world): Central keeps three live trainings
// that day (8:30 Sergio + Thai, 9:00 Pau + Blat, 16:30 Marc + Chun-li); its 7:00 has begun.
beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  vi.useFakeTimers({ now: new Date(TRAINING_MOCK_NOW), shouldAdvanceTime: true, toFake: ["Date"] });
  resetCatalogState();
  resetPlanningState();
  resetTrainingMockState();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.events.removeAllListeners();
  vi.useRealTimers();
  resetCatalogState();
  resetPlanningState();
  resetTrainingMockState();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

function client() {
  return createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
}

async function renderRings() {
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-catalogs", "errors"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <RingsPage client={client()} />
      </BrandingProvider>
    </I18nextProvider>,
  );
}

/** The JSON bodies of every `PATCH /rings/{id}`, in order. */
function capturePatches(): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = [];
  server.events.on("request:start", ({ request }) => {
    if (request.method === "PATCH" && /\/rings\/[^/]+$/u.test(new URL(request.url).pathname)) {
      void request
        .clone()
        .json()
        .then((body: Record<string, unknown>) => bodies.push(body));
    }
  });
  return bodies;
}

const CONFIRM_TITLE = "Aquesta pista té reserves d'entrenament";
const CENTRAL_LIVE = [
  "Sergio + Thai · dl 3 8:30",
  "Pau + Blat · dl 3 9:00",
  "Marc + Chun-li · dl 3 16:30",
];

function centralTrainings() {
  return trainingState.bookings
    .filter((booking) => booking.ringId === "ring-central" && booking.date === "2026-08-03")
    .map((booking) => [booking.start, booking.state, booking.cancelReason ?? null]);
}

async function openCentralForm() {
  fireEvent.click(await screen.findByRole("button", { name: "Edita Central" }));
  return screen.findByRole("dialog", { name: "Edita la pista Central" });
}

describe("D16 RING_HAS_BOOKINGS (R-05-07, R-05-08; E11-W05 step 3)", () => {
  it("T-05-28 / R-05-08: «Reservable per entrenaments» off with live bookings → the confirmation lists them and resends with cancelBookings", async () => {
    const bodies = capturePatches();
    await renderRings();
    const form = await openCentralForm();
    fireEvent.click(within(form).getByRole("switch", { name: "Reservable per entrenaments" }));
    fireEvent.click(within(form).getByRole("button", { name: "DESA" }));

    const confirm = await screen.findByRole("dialog", { name: CONFIRM_TITLE });
    expect(
      within(confirm).getByText(
        "Si continues, aquestes reserves quedaran anul·lades pel club i se'n farà l'avís:",
      ),
    ).toBeVisible();
    expect(
      within(confirm)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(CENTRAL_LIVE);
    expect(
      within(confirm).queryByRole("button", { name: "Anul·la les reserves i desactiva la pista" }),
    ).not.toBeInTheDocument();
    expect(centralTrainings().filter(([, state]) => state === "ACTIVE")).toHaveLength(4);

    fireEvent.click(within(confirm).getByRole("button", { name: "Anul·la les reserves i desa" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toMatchObject({ allowsFreeTraining: false, version: 1 });
    expect(bodies[0]).not.toHaveProperty("cancelBookings");
    expect(bodies[1]).toEqual({ ...bodies[0], cancelBookings: true });
    expect(centralTrainings()).toEqual([
      ["07:00", "ACTIVE", null],
      ["08:30", "CANCELLED_BY_CLUB", "RING_NOT_RESERVABLE"],
      ["09:00", "CANCELLED_BY_CLUB", "RING_NOT_RESERVABLE"],
      ["16:30", "CANCELLED_BY_CLUB", "RING_NOT_RESERVABLE"],
    ]);
  });

  it("R-05-07: deactivating with live bookings → the same confirmation; with future classes → RING_IN_USE as before", async () => {
    const bodies = capturePatches();
    await renderRings();
    // Central (live trainings, no classes): «Elimina» → in use → [Desactiva] → the confirmation.
    fireEvent.click(await screen.findByRole("button", { name: "Elimina Central" }));
    const remove = await screen.findByRole("dialog", { name: "Elimina la pista" });
    fireEvent.click(within(remove).getByRole("button", { name: "Elimina" }));
    fireEvent.click(await within(remove).findByRole("button", { name: "Desactiva" }));
    const confirm = await screen.findByRole("dialog", { name: CONFIRM_TITLE });
    expect(
      within(confirm)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(CENTRAL_LIVE);
    fireEvent.click(
      within(confirm).getByRole("button", { name: "Anul·la les reserves i desactiva la pista" }),
    );
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(bodies).toEqual([
      { active: false, version: 1 },
      { active: false, cancelBookings: true, version: 1 },
    ]);

    // Muntanya (future classes): its form's «Activa» off answers RING_IN_USE, no confirmation.
    fireEvent.click(await screen.findByRole("button", { name: "Edita Muntanya" }));
    const form = await screen.findByRole("dialog", { name: "Edita la pista Muntanya" });
    fireEvent.click(within(form).getByRole("switch", { name: "Activa" }));
    fireEvent.click(within(form).getByRole("button", { name: "DESA" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("Aquesta pista està en ús.");
    expect(screen.queryByRole("dialog", { name: CONFIRM_TITLE })).not.toBeInTheDocument();
    expect(bodies).toHaveLength(3);
  });

  it("R-05-08 (the R-06-11 pattern): a RING_HAS_BOOKINGS that answers a change the form no longer shows is dropped, and [Torna enrere] sends nothing", async () => {
    const bodies = capturePatches();
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let hold = true;
    // Falls through to the stateful mock once released.
    server.use(
      http.patch("*/api/v1/rings/:id", async () => {
        if (hold) await held;
      }),
    );
    await renderRings();
    const form = await openCentralForm();
    fireEvent.click(within(form).getByRole("switch", { name: "Reservable per entrenaments" }));
    fireEvent.click(within(form).getByRole("button", { name: "DESA" }));
    await waitFor(() => {
      expect(bodies).toHaveLength(1);
    });
    // The admin keeps typing while the answer is on its way: it is about the old values.
    fireEvent.change(within(form).getByLabelText("Nom"), { target: { value: "Central nova" } });
    hold = false;
    release();
    await waitFor(() => {
      expect(within(form).getByRole("button", { name: "DESA" })).toBeEnabled();
    });
    expect(screen.queryByRole("dialog", { name: CONFIRM_TITLE })).not.toBeInTheDocument();

    fireEvent.click(within(form).getByRole("button", { name: "DESA" }));
    const confirm = await screen.findByRole("dialog", { name: CONFIRM_TITLE });
    expect(bodies[1]).toMatchObject({ allowsFreeTraining: false, name: "Central nova" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Torna enrere" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: CONFIRM_TITLE })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("dialog", { name: "Edita la pista Central" })).toBeVisible();
    expect(bodies).toHaveLength(2);
    expect(centralTrainings().filter(([, state]) => state === "ACTIVE")).toHaveLength(4);
  });

  it("R-05-08: the confirmation's own failure shows inside it (a change made elsewhere meanwhile)", async () => {
    await renderRings();
    const form = await openCentralForm();
    fireEvent.click(within(form).getByRole("switch", { name: "Reservable per entrenaments" }));
    fireEvent.click(within(form).getByRole("button", { name: "DESA" }));
    const confirm = await screen.findByRole("dialog", { name: CONFIRM_TITLE });
    // Another admin renames the ring: its version moves on.
    await client().PATCH("/rings/{id}", {
      body: { name: "Central", version: 1 },
      params: { path: { id: "ring-central" } },
    });

    fireEvent.click(within(confirm).getByRole("button", { name: "Anul·la les reserves i desa" }));
    expect(await within(confirm).findByRole("alert")).toHaveTextContent(
      "Algú ha modificat aquest registre; torna a carregar",
    );
    expect(
      within(confirm).getByRole("button", { name: "Anul·la les reserves i desa" }),
    ).toBeEnabled();
    expect(centralTrainings().filter(([, state]) => state === "ACTIVE")).toHaveLength(4);
  });
});
