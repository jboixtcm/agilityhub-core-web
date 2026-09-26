import type { components } from "@agilityhub/api-client";
import { bookingState } from "@agilityhub/api-client/mocks";
import { server } from "@agilityhub/api-client/mocks/server";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { ConfirmPage } from "./ConfirmPage";
import { apiClient, canic, renderApp, renderPage, setupBookingWorld } from "./test-utils";

setupBookingWorld();

type SeatHoldResponse = components["schemas"]["SeatHoldResponse"];

interface Recorded {
  body: unknown;
  key: string | null;
  method: string;
  path: string;
}

/** Records the S08 writes the page sends, then lets the mock world answer. */
function recordWrites(): Recorded[] {
  const writes: Recorded[] = [];
  const record = async ({ request }: { request: Request }) => {
    const text = request.method === "DELETE" ? "" : await request.clone().text();
    writes.push({
      body: text === "" ? undefined : (JSON.parse(text) as unknown),
      key: request.headers.get("Idempotency-Key"),
      method: request.method,
      path: new URL(request.url).pathname,
    });
    return undefined;
  };
  server.use(
    http.post("*/api/v1/seat-holds", record),
    http.delete("*/api/v1/seat-holds/:id", record),
    http.post("*/api/v1/bookings", record),
    http.post("*/api/v1/waitlist-entries/:id/claim", record),
  );
  return writes;
}

const classRow = (index: number) => document.querySelectorAll<HTMLElement>(".class-row")[index];

/** 04 in the app, then a tap on the row at `index` (0-based, as the mockup's list). */
async function tapRow(index: number, options: Parameters<typeof renderApp>[1] = {}) {
  await renderApp("/reservar", options);
  await screen.findByRole("heading", { name: "Classes" });
  fireEvent.click(within(classRow(index) ?? document.body).getByRole("button"));
  await screen.findByRole("heading", { name: "Confirmar reserva" });
}

function heldSeat(serverNow: string, expiresAt: string): SeatHoldResponse {
  return {
    classSession: {
      description: "B+C",
      endsAtLocal: "2026-08-05T19:50",
      levelNames: ["B", "C"],
      ringName: "Central",
      startsAtLocal: "2026-08-05T18:50",
    },
    classSessionId: "class-2026-08-05-1850",
    dog: { id: "dog-duna", name: "Duna", sex: "FEMALE" },
    dogId: "dog-duna",
    expiresAt,
    holdSeconds: 30,
    id: "hold-skewed",
    limit: {
      count: 1,
      max: 2,
      notSelectable: [],
      reached: false,
      swappable: [],
      unit: "DOG",
      week: "CURRENT",
    },
    serverNow,
  };
}

describe("T-08-36 the 30 s hold counts on the api clock, not the device's (R-08-07)", () => {
  it("a device clock 5 min ahead still starts at 0:30, reaches 0 at the right instant, then the red note returns to 04", async () => {
    vi.useRealTimers();
    const serverNow = "2026-08-02T10:00:00.000Z";
    vi.useFakeTimers({
      now: Date.parse(serverNow) + 5 * 60_000,
      toFake: ["Date", "setInterval", "clearInterval"],
    });
    window.history.replaceState(
      {
        confirm: {
          hold: heldSeat(serverNow, "2026-08-02T10:00:30.000Z"),
          kind: "hold",
          receivedAt: Date.now(),
          waitlistEntryId: null,
        },
      },
      "",
      "/reservar/confirmar",
    );
    await renderPage(<ConfirmPage client={apiClient()} />);
    expect(screen.getByText("Plaça bloquejada per a tu · 0:30")).toBeVisible();
    act(() => {
      vi.advanceTimersByTime(29_000);
    });
    expect(screen.getByText("Plaça bloquejada per a tu · 0:01")).toBeVisible();
    expect(screen.getByRole("button", { name: "CONFIRMAR LA RESERVA" })).toBeEnabled();
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    const expired = screen.getByRole("button", {
      name: "Reserva cancel·lada per temps. Toca per tornar a la llista de classes.",
    });
    expect(screen.queryByText(/Plaça bloquejada per a tu/u)).toBeNull();
    expect(screen.getByRole("button", { name: "CONFIRMAR LA RESERVA" })).toBeDisabled();
    fireEvent.click(expired);
    expect(window.location.pathname).toBe("/reservar");
  });

  it("409 SEAT_HOLD_EXPIRED on the confirmation shows the same red note", async () => {
    server.use(
      http.post("*/api/v1/bookings", () =>
        HttpResponse.json(
          { code: "SEAT_HOLD_EXPIRED", details: {}, message: "x", traceId: "t" },
          { status: 409 },
        ),
      ),
    );
    await tapRow(0);
    fireEvent.click(screen.getByRole("button", { name: "CONFIRMAR LA RESERVA" }));
    expect(
      await screen.findByRole("button", {
        name: "Reserva cancel·lada per temps. Toca per tornar a la llista de classes.",
      }),
    ).toBeVisible();
  });
});

describe("T-08-38 screen 06: the swap when the week's limit is reached (R-08-09)", () => {
  it("single selection among the swappable bookings, the done one inert, the button names both days, then the swap is confirmed", async () => {
    const writes = recordWrites();
    await tapRow(3, { scenario: "bookingLimit" });
    expect(screen.getByText("Nova reserva")).toBeVisible();
    const card = document.querySelector(".confirm-card");
    if (!(card instanceof HTMLElement)) throw new TypeError("Missing the new booking card");
    expect(within(card).getByText("Dissabte 8 · 9:00–10:00")).toBeVisible();
    expect(within(card).getByText("nova")).toBeVisible();
    expect(within(card).getByText("Nivell C")).toBeVisible();
    expect(within(card).getByText("amb la Duna")).toBeVisible();
    expect(within(card).getByText("Muntanya")).toBeVisible();
    expect(screen.getByText("Plaça bloquejada per a tu · 0:30")).toBeVisible();
    expect(
      screen.getByText("Ja tens 2 classes aquesta setmana amb la Duna (límit per gos)."),
    ).toBeVisible();
    const group = screen.getByRole("radiogroup", { name: "Tria quina anul·les per fer-li lloc" });
    const options = within(group).getAllByRole("radio");
    expect(options.map((option) => option.textContent)).toEqual([
      "Dilluns 3 · 18:50Classe B+C · Central · anul·lable dins termini",
      "Divendres 7 · 20:00Classe C · Carretera · anul·lable dins termini",
    ]);
    expect(options.map((option) => option.getAttribute("aria-checked"))).toEqual(["true", "false"]);
    const done = within(group)
      .getByText("Classe B+C · ja feta — no es pot seleccionar")
      .closest(".confirm-option");
    expect(done).toHaveAttribute("aria-disabled", "true");
    expect(done?.tagName).toBe("DIV");
    expect(
      screen.getByRole("button", { name: "ANUL·LA DILLUNS 3 I CONFIRMA DISSABTE 8" }),
    ).toBeEnabled();
    fireEvent.click(options[1] ?? document.body);
    expect(options.map((option) => option.getAttribute("aria-checked"))).toEqual(["false", "true"]);
    fireEvent.click(
      screen.getByRole("button", { name: "ANUL·LA DIVENDRES 7 I CONFIRMA DISSABTE 8" }),
    );
    expect(await screen.findByText("Reserva confirmada. Afegeix-la al calendari:")).toBeVisible();
    const booking = writes.find((write) => write.path === "/api/v1/bookings");
    expect(booking?.body).toEqual({
      seatHoldId: expect.stringMatching(/^hold-/u) as unknown,
      swapBookingId: "booking-duna-fri7",
    });
    expect(booking?.key).toMatch(/^[0-9a-f-]{36}$/u);
    expect(screen.getByRole("link", { name: "Google" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
    expect(screen.getByRole("link", { name: "Outlook" })).toBeVisible();
    expect(screen.getByRole("link", { name: ".ics" })).toBeVisible();
    expect(bookingState.bookings.find((item) => item.id === "booking-duna-fri7")?.state).toBe(
      "CANCELLED",
    );
    // A consumed hold is never released.
    expect(writes.filter((write) => write.method === "DELETE")).toEqual([]);
  });

  it("«CANCEL·LAR LA NOVA RESERVA» releases the hold (DELETE) and goes back to 04", async () => {
    const writes = recordWrites();
    await tapRow(3, { scenario: "bookingLimit" });
    fireEvent.click(screen.getByRole("button", { name: "CANCEL·LAR LA NOVA RESERVA" }));
    await screen.findByRole("heading", { name: "Classes" });
    const hold = writes.find(
      (write) => write.method === "POST" && write.path === "/api/v1/seat-holds",
    );
    await waitFor(() => {
      expect(
        writes.filter((write) => write.method === "DELETE").map((write) => write.path),
      ).toHaveLength(1);
    });
    expect(hold).toBeDefined();
    expect(window.location.pathname).toBe("/reservar");
  });

  it("the back gesture leaves the page and releases the hold too", async () => {
    const writes = recordWrites();
    await tapRow(0);
    act(() => {
      window.history.back();
    });
    await screen.findByRole("heading", { name: "Classes" });
    await waitFor(() => {
      expect(writes.filter((write) => write.method === "DELETE")).toHaveLength(1);
    });
  });
});

describe("29: the normal confirmation and the informative variants (S08 §2 29, decision B1)", () => {
  it("normal: no swap, «CONFIRMAR LA RESERVA», then the calendar links and the booking", async () => {
    await tapRow(0);
    expect(screen.queryByText("nova")).toBeNull();
    expect(screen.queryByRole("button", { name: "CANCEL·LAR LA NOVA RESERVA" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "CONFIRMAR LA RESERVA" }));
    expect(await screen.findByText("Reserva confirmada. Afegeix-la al calendari:")).toBeVisible();
    expect(screen.getByRole("link", { name: "VEURE LA RESERVA" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/reserves\/booking-/u) as unknown,
    );
  });

  it("the limit done this week (CURRENT, per dog): the mockup's «… per a la setmana vinent a partir de diumenge 9 a les 20 h», without a countdown", async () => {
    await tapRow(3);
    expect(
      screen.getByText(
        "Aquesta setmana ja has fet dues classes amb la Duna. Podràs reservar per a la setmana vinent a partir de diumenge 9 a les 20 h.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/Podràs reservar aquesta classe/u)).toBeNull();
    expect(screen.queryByText(/Plaça bloquejada/u)).toBeNull();
    expect(screen.queryByRole("button", { name: "CONFIRMAR LA RESERVA" })).toBeNull();
  });

  /** A hold refused with `409 BOOKING_LIMIT_REACHED` and no swappable booking (S08 §6). */
  function limitReached(details: Record<string, unknown>) {
    server.use(
      http.post("*/api/v1/seat-holds", () =>
        HttpResponse.json(
          {
            code: "BOOKING_LIMIT_REACHED",
            details: {
              nextBookableAt: "2026-08-09T18:00:00Z",
              swappable: [],
              ...details,
            },
            message: "Booking limit reached",
            traceId: "t",
          },
          { status: 409 },
        ),
      ),
    );
  }

  it("the limit of next week reached (NEXT, per dog): «La setmana vinent ja tens una classe amb la Duna» and B1's «Podràs reservar aquesta classe a partir de …»", async () => {
    limitReached({
      current: 1,
      limit: 1,
      notSelectable: [
        {
          bookingId: "booking-duna-mon10",
          description: "C",
          reason: "LATE_WINDOW",
          startsAtLocal: "2026-08-10T09:00",
        },
      ],
      unit: "DOG",
      week: "NEXT",
    });
    await tapRow(0);
    expect(
      screen.getByText(
        "La setmana vinent ja tens una classe amb la Duna. Podràs reservar aquesta classe a partir de diumenge 9 a les 20 h.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/Aquesta setmana ja has fet/u)).toBeNull();
  });

  it("the limit per person (unit MEMBER) names no dog: «Aquesta setmana ja has fet dues classes.»", async () => {
    limitReached({
      current: 2,
      limit: 2,
      notSelectable: [
        { bookingId: "booking-duna-past-1", reason: "DONE" },
        { bookingId: "booking-rock-past-1", reason: "DONE" },
      ],
      unit: "MEMBER",
      week: "CURRENT",
    });
    await tapRow(0);
    expect(
      screen.getByText(
        "Aquesta setmana ja has fet dues classes. Podràs reservar per a la setmana vinent a partir de diumenge 9 a les 20 h.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/Duna\./u)).toBeNull();
  });

  it("«Properament»: «Disponible a partir de diumenge 9 a les 20 h.»", async () => {
    await tapRow(5);
    expect(screen.getByText("Disponible a partir de diumenge 9 a les 20 h.")).toBeVisible();
  });

  it("a seat another hold takes: the retry note, and a retry that gets the seat shows the countdown", async () => {
    await renderApp("/reservar");
    await screen.findByRole("heading", { name: "Classes" });
    fireEvent.click(screen.getByRole("button", { name: "Rock · D" }));
    await waitFor(() => {
      expect(classRow(0)?.textContent).toContain("D i sup.");
    });
    fireEvent.click(within(classRow(0) ?? document.body).getByRole("button"));
    expect(
      await screen.findByText(
        "Algú altre està acabant de reservar l'última plaça. Torna-ho a provar d'aquí a uns segons.",
      ),
    ).toBeVisible();
    const serverNow = new Date().toISOString();
    server.use(
      http.post("*/api/v1/seat-holds", () =>
        HttpResponse.json(
          heldSeat(serverNow, new Date(Date.parse(serverNow) + 30_000).toISOString()),
          { status: 201 },
        ),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Torna-ho a provar" }));
    expect(await screen.findByText(/Plaça bloquejada per a tu · 0:(30|29)/u)).toBeVisible();
  });
});

describe("R-08-18 SINGLE_CLASS on 29, and one Idempotency-Key per payload (R-08-08)", () => {
  const single = {
    branding: { ...canic, modules: [...canic.modules, "SINGLE_CLASS"] },
    scenario: "bookingSingleClass" as const,
  };

  it("PAY_TO_BOOK: «PAGAR I CONFIRMAR (12,00 €)» opens the api's Checkout URL", async () => {
    await tapRow(0, single);
    const assign = vi.fn();
    const origin = window.location.origin;
    vi.stubGlobal("location", { assign, origin, pathname: "/reservar/confirmar" });
    // Without a swap the button itself names the payment.
    expect(screen.queryByText(/En confirmar, pagaràs/u)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "PAGAR I CONFIRMAR (12,00 €)" }));
    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`^${origin}/reserves/booking-`, "u")),
      );
    });
  });

  it("PAY_TO_BOOK with a swap keeps the price in view: «En confirmar, pagaràs aquesta classe (12,00 €).» above «ANUL·LA … I CONFIRMA …» (review #8)", async () => {
    const serverNow = new Date().toISOString();
    const hold = heldSeat(serverNow, new Date(Date.parse(serverNow) + 30_000).toISOString());
    window.history.replaceState(
      {
        confirm: {
          hold: {
            ...hold,
            limit: {
              count: 2,
              max: 2,
              notSelectable: [],
              reached: true,
              swappable: [
                {
                  bookingId: "booking-duna-mon3",
                  description: "B+C",
                  ringName: "Central",
                  startsAtLocal: "2026-08-03T18:50",
                },
              ],
              unit: "DOG",
              week: "CURRENT",
            },
            payment: { mode: "PAY_TO_BOOK", price: { amountMinor: 1200, currency: "EUR" } },
          } satisfies SeatHoldResponse,
          kind: "hold",
          receivedAt: Date.now(),
          waitlistEntryId: null,
        },
      },
      "",
      "/reservar/confirmar",
    );
    await renderPage(<ConfirmPage client={apiClient()} />, single);
    expect(screen.getByText("En confirmar, pagaràs aquesta classe (12,00 €).")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "ANUL·LA DILLUNS 3 I CONFIRMA DIMECRES 5" }),
    ).toBeEnabled();
  });

  it("CHARGE_ON_ATTENDANCE: the note above the normal button", async () => {
    await renderApp("/reservar", single);
    await screen.findByRole("heading", { name: "Classes" });
    fireEvent.click(screen.getByRole("button", { name: "Rock · D" }));
    await waitFor(() => {
      expect(classRow(1)?.textContent).toContain("D i sup.");
    });
    fireEvent.click(within(classRow(1) ?? document.body).getByRole("button"));
    expect(
      await screen.findByText("Aquesta classe es carregarà al proper rebut (12,00 €)."),
    ).toBeVisible();
    // Rock already has next week's class (limit 1): the note says so and the swap is proposed.
    expect(
      screen.getByText("Ja tens 1 classe la setmana vinent amb en Rock (límit per gos)."),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "ANUL·LA DILLUNS 10 I CONFIRMA DIMECRES 12" }),
    ).toBeEnabled();
  });

  it("a confirmation that fails on the way stays on the page, and its retry sends the same key", async () => {
    const writes: Recorded[] = [];
    let failures = 1;
    server.use(
      http.post("*/api/v1/bookings", async ({ request }) => {
        writes.push({
          body: await request.clone().json(),
          key: request.headers.get("Idempotency-Key"),
          method: "POST",
          path: "/api/v1/bookings",
        });
        if (failures > 0) {
          failures -= 1;
          return HttpResponse.json(
            { code: "INTERNAL_ERROR", details: {}, message: "x", traceId: "t" },
            { status: 503 },
          );
        }
        return undefined;
      }),
    );
    await tapRow(0);
    fireEvent.click(screen.getByRole("button", { name: "CONFIRMAR LA RESERVA" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/error inesperat/u);
    fireEvent.click(screen.getByRole("button", { name: "CONFIRMAR LA RESERVA" }));
    expect(await screen.findByText("Reserva confirmada. Afegeix-la al calendari:")).toBeVisible();
    const keys = writes
      .filter((write) => write.path === "/api/v1/bookings")
      .map((write) => write.key);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });
});

describe("R-08-15 the claim of a NOTIFIED waiting entry (step 5)", () => {
  /** The mock world is drawn on its first request: then the entry is notified (N-15). */
  async function notifiedEntry() {
    await fetch(`${window.location.origin}/api/v1/waitlist-entries/waitlist-duna-thu6`);
    const entry = bookingState.entries.find((item) => item.id === "waitlist-duna-thu6");
    if (entry === undefined) throw new TypeError("Missing the waiting entry");
    entry.state = "NOTIFIED";
  }

  it("[AGAFA LA PLAÇA] holds with the entry, and the confirmation posts the claim with its key", async () => {
    const writes = recordWrites();
    await notifiedEntry();
    await renderApp("/espera/waitlist-duna-thu6");
    expect(await screen.findByText("Classe C i sup. · amb la Duna")).toBeVisible();
    fireEvent.click(await screen.findByRole("button", { name: "AGAFA LA PLAÇA" }));
    await screen.findByRole("heading", { name: "Confirmar reserva" });
    expect(writes.find((write) => write.path === "/api/v1/seat-holds")?.body).toEqual({
      classSessionId: "class-2026-08-06-2000",
      dogId: "dog-duna",
      waitlistEntryId: "waitlist-duna-thu6",
    });
    fireEvent.click(screen.getByRole("button", { name: "CONFIRMAR LA RESERVA" }));
    expect(await screen.findByText("Reserva confirmada. Afegeix-la al calendari:")).toBeVisible();
    const claim = writes.find(
      (write) => write.path === "/api/v1/waitlist-entries/waitlist-duna-thu6/claim",
    );
    expect(claim?.key).toMatch(/^[0-9a-f-]{36}$/u);
    expect(writes.some((write) => write.path === "/api/v1/bookings")).toBe(false);
  });

  it("a claim that lost the seat (409 SEAT_TAKEN) goes back to 04 with its message", async () => {
    server.use(
      http.post("*/api/v1/waitlist-entries/:id/claim", () =>
        HttpResponse.json(
          { code: "SEAT_TAKEN", details: {}, message: "x", traceId: "t" },
          { status: 409 },
        ),
      ),
    );
    await notifiedEntry();
    await renderApp("/espera/waitlist-duna-thu6");
    fireEvent.click(await screen.findByRole("button", { name: "AGAFA LA PLAÇA" }));
    fireEvent.click(await screen.findByRole("button", { name: "CONFIRMAR LA RESERVA" }));
    expect(await screen.findByText("Aquesta plaça s'acaba d'ocupar.")).toBeVisible();
    expect(window.location.pathname).toBe("/reservar");
  });
});
