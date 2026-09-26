import { server } from "@agilityhub/api-client/mocks/server";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { canic, renderApp, setupBookingWorld, without } from "./test-utils";

setupBookingWorld();

/**
 * Rewrites the mock world's answer to `GET path` as the published core would send it: the
 * override asks the mock world itself (an inner request marked `X-Pass` it lets through).
 */
function rewrite(path: string, change: (body: Record<string, unknown>) => void): { calls: number } {
  const counter = { calls: 0 };
  server.use(
    http.get(`*/api/v1${path}`, async ({ request }) => {
      if (request.headers.get("X-Pass") !== null) return undefined;
      counter.calls += 1;
      const original = await fetch(request.url, { headers: { "X-Pass": "1" } });
      const body = (await original.json()) as Record<string, unknown>;
      change(body);
      return HttpResponse.json(body);
    }),
  );
  return counter;
}

async function openBooking(id = "booking-duna-mon3") {
  await renderApp(`/reserves/${id}`);
  await screen.findByRole("heading", { name: "Detall de la reserva" });
  return screen.findByText(/^Classe /u);
}

describe("T-08-39 screen 07: the booking, who booked it, and its cancellation (R-08-10)", () => {
  it("shows the mockup card, and a cancellation in time asks first and leaves the green note", async () => {
    await openBooking();
    expect(screen.getByRole("link", { name: "Torna enrere" })).toHaveAttribute("href", "/inici");
    expect(screen.getByText("Classe B+C · amb la Duna")).toBeVisible();
    expect(screen.getByText("confirmada")).toHaveClass("ah-tone--success");
    expect(screen.getByText("Dilluns 3 · 18:50–19:50 · Central")).toBeVisible();
    expect(screen.getByText("Reservada el dijous 30/07 a les 20:14")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "ANUL·LA LA RESERVA" }));
    const dialog = screen.getByRole("dialog", {
      name: "Vols anul·lar la reserva de la classe B+C?",
    });
    expect(within(dialog).queryByText(/Falten menys de/u)).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "ANUL·LA" }));
    expect(
      await screen.findByText(
        "Anul·lació feta dins el termini establert: pots reservar una altra classe per aquesta setmana.",
      ),
    ).toBeVisible();
    expect(screen.getByText("anul·lada")).toBeVisible();
    expect(screen.queryByRole("button", { name: "ANUL·LA LA RESERVA" })).toBeNull();
  });

  it("inside the 4 h threshold the dialog warns, and the late note names «4 hores»", async () => {
    vi.setSystemTime(new Date("2026-08-03T16:00:00+02:00"));
    await openBooking();
    fireEvent.click(screen.getByRole("button", { name: "ANUL·LA LA RESERVA" }));
    const dialog = screen.getByRole("dialog", {
      name: "Vols anul·lar la reserva de la classe B+C?",
    });
    expect(
      within(dialog).getByText("Falten menys de 4 hores: la sessió comptarà com a feta."),
    ).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "ANUL·LA" }));
    expect(
      await screen.findByText(
        "Anul·lació feta amb menys de 4 hores d'antelació. T'agraïm que ens avisis: habilitem una plaça per si algú s'hi pot afegir a última hora. Aquesta sessió, però, compta dins el teu còmput de classes.",
      ),
    ).toBeVisible();
    expect(screen.getByText("anul·lada tard")).toHaveClass("ah-tone--warning");
  });

  it("the threshold comes from the booking: 90 minutes warn «Falten menys de 90 minuts»", async () => {
    vi.setSystemTime(new Date("2026-08-03T17:30:00+02:00"));
    rewrite("/bookings/booking-duna-mon3", (body) => {
      body.lateCancelThresholdMinutes = 90;
    });
    await openBooking();
    fireEvent.click(screen.getByRole("button", { name: "ANUL·LA LA RESERVA" }));
    expect(
      screen.getByText("Falten menys de 90 minuts: la sessió comptarà com a feta."),
    ).toBeVisible();
  });

  it("the published core omits the threshold: the dialog has no warning, and the late note reads without it", async () => {
    vi.setSystemTime(new Date("2026-08-03T16:00:00+02:00"));
    const reads = rewrite("/bookings/:id", (body) => {
      delete body.lateCancelThresholdMinutes;
    });
    await openBooking();
    fireEvent.click(screen.getByRole("button", { name: "ANUL·LA LA RESERVA" }));
    expect(screen.queryByText(/Falten menys de/u)).toBeNull();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "ANUL·LA" }));
    expect(await screen.findByText(/^Anul·lació feta fora del termini establert\./u)).toBeVisible();
    expect(reads.calls).toBeGreaterThan(1);
  });

  it("a booking cancelled by a swap, opened later: its state chip only, no «dins el termini» note (review #4)", async () => {
    // The mock's swap (bookingLimit, mockup 06) cancels Friday 7 in time, as R-08-09.
    await renderApp("/reservar", { scenario: "bookingLimit" });
    await screen.findByRole("heading", { name: "Classes" });
    const limitRow = document.querySelectorAll<HTMLElement>(".class-row")[3];
    fireEvent.click(within(limitRow ?? document.body).getByRole("button"));
    fireEvent.click(await screen.findByRole("radio", { name: /^Divendres 7/u }));
    fireEvent.click(
      screen.getByRole("button", { name: "ANUL·LA DIVENDRES 7 I CONFIRMA DISSABTE 8" }),
    );
    await screen.findByText("Reserva confirmada. Afegeix-la al calendari:");
    cleanup();
    await openBooking("booking-duna-fri7");
    expect(screen.getByText("anul·lada")).toBeVisible();
    expect(screen.queryByText(/^Anul·lació feta/u)).toBeNull();
    expect(screen.queryByRole("button", { name: "ANUL·LA LA RESERVA" })).toBeNull();
  });

  it.each([
    ["CANCELLED", "SYSTEM", "anul·lada", false],
    ["CANCELLED_LATE", "MEMBER", "anul·lada tard", true],
  ] as const)(
    "a %s booking cancelled by %s, opened later: its chip «%s» only, no note (review #4)",
    async (state, byRole, chip, late) => {
      rewrite("/bookings/:id", (body) => {
        Object.assign(body, {
          cancellation: {
            at: "2026-08-01T09:00:00Z",
            byDisplayName: "Laura",
            byRole,
            late,
            message: null,
            minutesBefore: 3350,
          },
          displayState: state,
          state,
        });
      });
      await openBooking();
      expect(screen.getByText(chip)).toBeVisible();
      expect(screen.queryByText(/^Anul·lació feta/u)).toBeNull();
      expect(screen.queryByRole("button", { name: "ANUL·LA LA RESERVA" })).toBeNull();
    },
  );

  it("who booked it: another member of the group", async () => {
    rewrite("/bookings/:id", (body) => {
      body.bookedBy = { displayName: "Joan", viaClub: false };
    });
    await openBooking();
    expect(screen.getByText("Reservada per Joan el dijous 30/07 a les 20:14")).toBeVisible();
  });

  it("booked by the club reads «Reservada pel club el …»", async () => {
    rewrite("/bookings/:id", (body) => {
      body.bookedBy = { displayName: "Jordi Soler", viaClub: true };
    });
    await openBooking();
    expect(screen.getByText("Reservada pel club el dijous 30/07 a les 20:14")).toBeVisible();
  });

  it.each([422, 409])(
    "BOOKING_NOT_CANCELLABLE (%i) shows its message inside the dialog and reads the booking again",
    async (status) => {
      let reads = 0;
      server.use(
        http.post("*/api/v1/bookings/:id/cancellation", () =>
          HttpResponse.json(
            { code: "BOOKING_NOT_CANCELLABLE", details: {}, message: "x", traceId: "t" },
            { status },
          ),
        ),
        http.get("*/api/v1/bookings/:id", () => {
          reads += 1;
          return undefined;
        }),
      );
      await openBooking();
      fireEvent.click(screen.getByRole("button", { name: "ANUL·LA LA RESERVA" }));
      const dialog = screen.getByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: "ANUL·LA" }));
      expect(
        await within(dialog).findByText("Aquesta reserva ja no es pot anul·lar."),
      ).toBeVisible();
      await waitFor(() => {
        expect(reads).toBe(2);
      });
    },
  );
});

describe("T-08-39 the waiting entry (/espera/:id, R-08-16)", () => {
  it("the card with «en llista d'espera», no position in ALL_AT_ONCE, and «SURT DE LA LLISTA D'ESPERA» back to 03", async () => {
    await renderApp("/espera/waitlist-duna-thu6");
    expect(await screen.findByText("Classe C i sup. · amb la Duna")).toBeVisible();
    expect(screen.getByText("en llista d'espera")).toHaveClass("ah-tone--warning");
    expect(screen.getByText("Dijous 6 · 20:00 · Carretera")).toBeVisible();
    expect(screen.queryByText(/Ets el número/u)).toBeNull();
    expect(screen.queryByRole("button", { name: "AGAFA LA PLAÇA" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "SURT DE LA LLISTA D'ESPERA" }));
    const dialog = screen.getByRole("dialog", {
      name: "Vols sortir de la llista d'espera de la classe C i sup. (dj 6 · 20:00)?",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "SURT DE LA LLISTA D'ESPERA" }));
    expect(await screen.findByText("Has sortit de la llista d'espera")).toBeVisible();
    expect(window.location.pathname).toBe("/inici");
    await screen.findByRole("heading", { name: "Les meves reserves" });
    expect(screen.queryByText(/Classe C i sup\./u)).toBeNull();
  });

  it("a FIFO club's NOTIFIED entry: the position, the deadline and [AGAFA LA PLAÇA]", async () => {
    rewrite("/waitlist-entries/:id", (body) => {
      Object.assign(body, { confirmBy: "2026-08-02T13:30:00Z", position: 1, state: "NOTIFIED" });
    });
    await renderApp("/espera/waitlist-duna-thu6");
    expect(await screen.findByText("Ets el número 1 de la llista")).toBeVisible();
    expect(screen.getByText("Tens temps fins a les 15:30 per agafar la plaça.")).toBeVisible();
    expect(screen.getByRole("button", { name: "AGAFA LA PLAÇA" })).toBeEnabled();
  });

  it("an entry no longer live is read-only with its state; leaving a dead one says so", async () => {
    rewrite("/waitlist-entries/:id", (body) => {
      body.state = "EXPIRED";
    });
    await renderApp("/espera/waitlist-duna-thu6");
    expect(await screen.findByText("caducada")).toHaveClass("ah-tone--neutral");
    expect(screen.queryByRole("button", { name: "SURT DE LA LLISTA D'ESPERA" })).toBeNull();
  });

  it("422 WAITLIST_ENTRY_NOT_LIVE on leaving shows its message and reads the entry again", async () => {
    server.use(
      http.post("*/api/v1/waitlist-entries/:id/cancellation", () =>
        HttpResponse.json(
          { code: "WAITLIST_ENTRY_NOT_LIVE", details: {}, message: "x", traceId: "t" },
          { status: 422 },
        ),
      ),
    );
    await renderApp("/espera/waitlist-duna-thu6");
    fireEvent.click(await screen.findByRole("button", { name: "SURT DE LA LLISTA D'ESPERA" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "SURT DE LA LLISTA D'ESPERA" }));
    expect(
      await within(dialog).findByText("Aquesta entrada de la llista d'espera ja no està activa."),
    ).toBeVisible();
    expect(window.location.pathname).toBe("/espera/waitlist-duna-thu6");
  });

  it("WAITLIST off: there is no waiting entry page", async () => {
    await renderApp("/espera/waitlist-duna-thu6", {
      branding: { ...canic, modules: without("WAITLIST") },
      scenario: "bookingNoWaitlist",
    });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "SURT DE LA LLISTA D'ESPERA" })).toBeNull();
    });
    expect(screen.queryByText("Classe C i sup. · amb la Duna")).toBeNull();
  });
});
