import { bookingState, catalogState } from "@agilityhub/api-client/mocks";
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

/** The colour the club's ring catalogue gives `name` (the api's `ringColor`). */
const ringColour = (name: string) =>
  catalogState.rings.find((ring) => ring.name === name)?.color ?? "missing";

/** The detail card's ring dot, and whether it comes before the card's title (mockup 07). */
function cardDot(title: HTMLElement) {
  const card = title.closest(".detail-card");
  const dot = card?.querySelector<HTMLElement>(".detail-card__dot") ?? null;
  return {
    before:
      dot !== null &&
      (dot.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING) ===
        Node.DOCUMENT_POSITION_FOLLOWING,
    colour: dot?.style.getPropertyValue("--class-row-ring") ?? null,
    dot,
  };
}

describe("T-08-39 screen 07: the booking, who booked it, and its cancellation (R-08-10)", () => {
  it("E5-W05 step 8: shows the mockup card, and a cancellation in time asks first and leaves the green note, which names no week («pots reservar una altra classe.»)", async () => {
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
    // The note also follows a next-week booking's cancellation, and `Booking` names no week: it
    // says no «aquesta setmana» (E5-W01 round-2 review #3).
    expect(
      await screen.findByText(
        "Anul·lació feta dins el termini establert: pots reservar una altra classe.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/setmana/u)).toBeNull();
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

  it.each([
    // 80 minutes before the class: inside the 90 minutes, the dialog warns.
    ["2026-08-03T17:30:00+02:00", true],
    // 100 minutes before: still in time with 90 minutes (the catalog's 4 h would warn here).
    ["2026-08-03T17:10:00+02:00", false],
  ] as const)(
    "E5-W05 step 8: the threshold comes from the booking — a club with 90 minutes (`cancellableInTimeUntil` 17:20) at %s warns «Falten menys de 90 minuts»: %s",
    async (now, warns) => {
      vi.setSystemTime(new Date(now));
      // As the api answers for a club with `bookings.lateCancelThresholdMinutes = 90`: both fields
      // follow the parameter (Monday 3 at 18:50 − 90 min = 17:20 local).
      rewrite("/bookings/booking-duna-mon3", (body) => {
        body.lateCancelThresholdMinutes = 90;
        body.cancellableInTimeUntil = "2026-08-03T15:20:00Z";
      });
      await openBooking();
      fireEvent.click(screen.getByRole("button", { name: "ANUL·LA LA RESERVA" }));
      const dialog = screen.getByRole("dialog");
      expect(
        within(dialog).queryByText("Falten menys de 90 minuts: la sessió comptarà com a feta.") !==
          null,
      ).toBe(warns);
      expect(within(dialog).queryByText(/Falten menys de 4 hores/u)).toBeNull();
    },
  );

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

  it("E5-W05 step 9 (mockup 07, api E5-T29): the ring's dot before the title, in the booking's `classSession.ringColor`", async () => {
    const title = await openBooking();
    const { before, colour, dot } = cardDot(title);
    expect(colour).toBe(ringColour("Central"));
    expect(before).toBe(true);
    expect(dot).toHaveAttribute("aria-hidden", "true");
  });

  it("E5-W05 step 9: a ring without a colour (`ringColor` null) draws no dot", async () => {
    rewrite("/bookings/:id", (body) => {
      (body.classSession as Record<string, unknown>).ringColor = null;
    });
    const title = await openBooking();
    expect(cardDot(title).dot).toBeNull();
  });

  it("who booked it: another member of the group", async () => {
    rewrite("/bookings/:id", (body) => {
      body.bookedBy = { displayName: "Joan", self: false, viaClub: false };
    });
    await openBooking();
    expect(screen.getByText("Reservada per Joan el dijous 30/07 a les 20:14")).toBeVisible();
  });

  it("E5-W04 step 0 (api E5-T25): `BookedBy.self` decides, never the names — a namesake of the group is «Reservada per Biel»", async () => {
    // The reader's account is «Biel Roca»; another Biel of the family group booked it.
    rewrite("/bookings/:id", (body) => {
      body.bookedBy = { displayName: "Biel", self: false, viaClub: false };
    });
    await openBooking();
    expect(screen.getByText("Reservada per Biel el dijous 30/07 a les 20:14")).toBeVisible();
  });

  it("E5-W04 step 0 (api E5-T25): the reader's own booking reads «Reservada el …» whatever the name it carries", async () => {
    rewrite("/bookings/:id", (body) => {
      body.bookedBy = { displayName: "Laura Serra", self: true, viaClub: false };
    });
    await openBooking();
    expect(screen.getByText("Reservada el dijous 30/07 a les 20:14")).toBeVisible();
  });

  it("booked by the club reads «Reservada pel club el …»", async () => {
    rewrite("/bookings/:id", (body) => {
      body.bookedBy = { displayName: "Jordi Soler", self: false, viaClub: true };
    });
    await openBooking();
    expect(screen.getByText("Reservada pel club el dijous 30/07 a les 20:14")).toBeVisible();
  });

  it.each([
    // Inside the booking's 4 h, but the api says it is still in time until 18:00.
    ["2026-08-03T16:00:00+02:00", "2026-08-03T16:00:00Z", false],
    // Well before the 4 h, but the api's instant has passed.
    ["2026-08-03T12:00:00+02:00", "2026-08-03T09:00:00Z", true],
  ] as const)(
    "E5-W04 step 0 (R-08-10, api E5-T25): at %s with `cancellableInTimeUntil` %s the dialog warns: %s",
    async (now, until, warns) => {
      vi.setSystemTime(new Date(now));
      rewrite("/bookings/:id", (body) => {
        body.cancellableInTimeUntil = until;
      });
      await openBooking();
      fireEvent.click(screen.getByRole("button", { name: "ANUL·LA LA RESERVA" }));
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).queryByText(/^Falten menys de 4 hores/u) !== null).toBe(warns);
    },
  );

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

  it("E5-W05 step 10: a NOTIFIED entry reads «plaça alliberada» with [AGAFA LA PLAÇA]; an ACTIVE one keeps «en llista d'espera» without it", async () => {
    await renderApp("/espera/waitlist-duna-thu6");
    expect(await screen.findByText("en llista d'espera")).toHaveClass("ah-tone--warning");
    expect(screen.queryByText("plaça alliberada")).toBeNull();
    expect(screen.queryByRole("button", { name: "AGAFA LA PLAÇA" })).toBeNull();
    cleanup();
    // N-15 (R-08-13): a seat was released and the entry was notified, in the mock world itself.
    const entry = bookingState.entries.find((item) => item.id === "waitlist-duna-thu6");
    if (entry === undefined) throw new TypeError("Missing the waiting entry");
    entry.state = "NOTIFIED";
    entry.notifiedAt = "2026-08-02T18:25:00Z";
    await renderApp("/espera/waitlist-duna-thu6");
    expect(await screen.findByText("plaça alliberada")).toHaveClass("ah-tone--warning");
    expect(screen.queryByText("en llista d'espera")).toBeNull();
    expect(screen.getByRole("button", { name: "AGAFA LA PLAÇA" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "SURT DE LA LLISTA D'ESPERA" })).toBeEnabled();
  });

  it("E5-W05 step 9: the waiting entry's card (the same card as 07) carries its ring's dot before the title", async () => {
    await renderApp("/espera/waitlist-duna-thu6");
    const title = await screen.findByText("Classe C i sup. · amb la Duna");
    const { before, colour } = cardDot(title);
    expect(colour).toBe(ringColour("Carretera"));
    expect(before).toBe(true);
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
