import { type components } from "@agilityhub/api-client";
import { handlers } from "@agilityhub/api-client/mocks";
import { server } from "@agilityhub/api-client/mocks/server";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { getResponse, http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { BookPage } from "./BookPage";
import { apiClient, renderPage, setupBookingWorld } from "./test-utils";

setupBookingWorld();
type Booking = components["schemas"]["Booking"];
const reserved = () => [
  ...document.querySelectorAll<HTMLElement>('[data-bookable-state="RESERVED"]'),
];

function rewriteBookings(edit: (items: Booking[]) => Booking[]) {
  server.use(
    http.get("*/api/v1/me/bookings", async ({ request }) => {
      const response = await getResponse(handlers, request);
      if (response === undefined) throw new Error("Missing booking fixture");
      const body = (await response.json()) as { items: Booking[] };
      return HttpResponse.json({ items: edit(body.items) });
    }),
  );
}

async function open() {
  await renderPage(<BookPage client={apiClient()} />);
  await screen.findByRole("heading", { name: "Classes" });
}

describe("T-08-37 reserved classes stay in the selected dog's list", () => {
  it("keeps the booking in date order with its detail link, without a second booking action", async () => {
    await open();
    expect(reserved()).toHaveLength(1);
    expect(reserved()[0]).toHaveTextContent("dl 3 · 18:50 · B+CReservada");
    expect(within(reserved()[0] ?? document.body).getByRole("link")).toHaveAttribute(
      "href",
      "/reserves/booking-duna-mon3",
    );
    expect(within(reserved()[0] ?? document.body).queryByRole("button")).toBeNull();
    expect(document.querySelector(".class-row")).toBe(reserved()[0]);
    expect(document.querySelectorAll(".class-row")).toHaveLength(7);
  });

  it("switches own and family dogs without carrying another dog's reserved badge", async () => {
    const queries: string[] = [];
    server.use(
      http.get("*/api/v1/me/bookings", ({ request }) => {
        queries.push(new URL(request.url).search);
        return undefined;
      }),
    );
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Rock · D" }));
    await waitFor(() => {
      expect(screen.queryByRole("link", { name: /dl 3 · 18:50/u })).toBeNull();
    });
    expect(reserved()).toHaveLength(1);
    expect(within(reserved()[0] ?? document.body).getByRole("link")).toHaveAttribute(
      "href",
      "/reserves/booking-rock-mon10",
    );
    fireEvent.click(screen.getByRole("button", { name: "Toby · B (Joan Antoni)" }));
    await waitFor(() => {
      expect(reserved()).toHaveLength(0);
    });
    expect(queries).toEqual([
      "?from=2026-08-02",
      "?dogId=dog-rock&from=2026-08-02",
      "?dogId=dog-toby&from=2026-08-02",
    ]);
  });

  it("keeps reserved rows when no new classes are available", async () => {
    server.use(
      http.get("*/api/v1/me/bookable-classes", async ({ request }) => {
        const response = await getResponse(handlers, request);
        if (response === undefined) throw new Error("Missing classes fixture");
        return HttpResponse.json({ ...((await response.json()) as object), classes: [] });
      }),
    );
    await open();
    expect(reserved()).toHaveLength(1);
    expect(
      screen.queryByText("Ara mateix no hi ha cap classe per reservar amb aquest gos."),
    ).toBeNull();
  });

  it("shows pending payment distinctly and links to the existing booking", async () => {
    rewriteBookings((items) => items.map((item) => ({ ...item, state: "PAYMENT_PENDING" })));
    await open();
    expect(reserved()).toHaveLength(0);
    const pending = document.querySelector<HTMLElement>('[data-bookable-state="PAYMENT_PENDING"]');
    if (pending === null) throw new Error("Missing pending booking");
    expect(pending).toHaveTextContent("pendent de pagament");
    expect(within(pending).getByRole("link")).toHaveAttribute(
      "href",
      "/reserves/booking-duna-mon3",
    );
    expect(within(pending).queryByRole("button")).toBeNull();
  });

  it.each(["CANCELLED", "CANCELLED_LATE", "CANCELLED_BY_CLUB"] as const)(
    "excludes %s reservations",
    async (state) => {
      rewriteBookings((items) => items.map((item) => ({ ...item, state })));
      await open();
      expect(reserved()).toHaveLength(0);
    },
  );

  it("excludes classes that already started in the club's time zone", async () => {
    vi.setSystemTime(new Date("2026-08-03T18:50:00+02:00"));
    await open();
    expect(reserved()).toHaveLength(0);
  });

  it("deduplicates a class returned by both reads, giving priority to the existing reservation", async () => {
    rewriteBookings((items) =>
      items.map((item) => ({ ...item, classSessionId: "class-2026-08-05-1850" })),
    );
    await open();
    expect(document.querySelectorAll('[data-class-id="class-2026-08-05-1850"]')).toHaveLength(1);
    expect(reserved()).toHaveLength(1);
  });

  it("reloads bookings after focus and removes a cancelled reservation", async () => {
    let cancelled = false;
    rewriteBookings((items) =>
      items.map((item) => ({ ...item, state: cancelled ? "CANCELLED" : item.state })),
    );
    await open();
    cancelled = true;
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => {
      expect(reserved()).toHaveLength(0);
    });
  });

  it("shows a retry when reservations cannot load, instead of presenting an incomplete list", async () => {
    let failing = true;
    server.use(
      http.get("*/api/v1/me/bookings", () =>
        failing
          ? HttpResponse.json(
              { code: "INTERNAL_ERROR", message: "x", traceId: "t" },
              { status: 503 },
            )
          : undefined,
      ),
    );
    await renderPage(<BookPage client={apiClient()} />);
    expect(await screen.findByText("No s'han pogut carregar les classes.")).toBeVisible();
    expect(document.querySelectorAll(".class-row")).toHaveLength(0);
    failing = false;
    fireEvent.click(screen.getByRole("button", { name: "Torna-ho a provar" }));
    await waitFor(() => {
      expect(reserved()).toHaveLength(1);
    });
  });

  it.each([
    ["es", "Reservada"],
    ["en", "Booked"],
  ] as const)("translates the tag in %s", async (locale, label) => {
    await renderPage(<BookPage client={apiClient()} />, { locale });
    expect(await screen.findByText(label, { exact: true })).toBeVisible();
  });
});
