import { server } from "@agilityhub/api-client/mocks/server";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { BookingDetailPage } from "./BookingDetailPage";
import { BookPage } from "./BookPage";
import { HomePage } from "./HomePage";
import { apiClient, canic, renderApp, renderPage, setupBookingWorld, without } from "./test-utils";

setupBookingWorld();

const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/gu, " ").trim();

/** Each row of «Les meves reserves»: its two lines, as a reader sees them. */
function reservationRows(): string[] {
  return [...document.querySelectorAll(".reservation-row, .activity-row")].map((row) =>
    [...row.querySelectorAll(".reservation-row__line, .activity-row__line")]
      .map((line) =>
        [...line.children]
          .map((part) => clean(part.textContent))
          .filter(Boolean)
          .join(" | "),
      )
      .join(" / "),
  );
}

/** Rewrites the mock world's `GET path` answer (an inner request marked `X-Pass` reaches it). */
function rewrite(path: string, change: (body: Record<string, unknown>) => void) {
  server.use(
    http.get(`*/api/v1${path}`, async ({ request }) => {
      if (request.headers.get("X-Pass") !== null) return undefined;
      const url = new URL(request.url);
      const body = (await (await fetch(url, { headers: { "X-Pass": "1" } })).json()) as Record<
        string,
        unknown
      >;
      change(body);
      return HttpResponse.json(body);
    }),
  );
}

async function renderHome(options: Parameters<typeof renderPage>[1] = {}) {
  await renderPage(<HomePage client={apiClient(options.locale)} />, options);
  await screen.findByRole("heading", { level: 2 });
}

describe("screen 03 «Inici» (S08 §2, R-08-02, R-08-20, R-08-23)", () => {
  it("the greeting and the bell, «Tots» last and pressed, the counters and the rows as the api delivers them", async () => {
    await renderApp("/inici");
    expect(await screen.findByRole("heading", { level: 1, name: "Hola, Laura!" })).toBeVisible();
    const bell = screen.getByRole("link", { name: "Avisos: 2 sense llegir" });
    expect(bell).toHaveAttribute("href", "/notificacions");
    expect(bell.querySelector("svg")).toHaveClass("home-header__bell-icon--ringing");
    const chips = within(screen.getByRole("group", { name: "Gossos" })).getAllByRole("button");
    expect(chips.map((chip) => [chip.textContent, chip.getAttribute("aria-pressed")])).toEqual([
      ["Duna · C", "false"],
      ["Rock · D", "false"],
      ["Toby · B (Joan Antoni)", "false"],
      ["Tots", "true"],
    ]);
    const counters = screen.getByRole("group", { name: "Classes reservades" });
    expect(
      [...counters.querySelectorAll(".home-limits__item")].map((item) => item.textContent),
    ).toEqual(["1classe\naquesta setm.", "＋1classe\nsetmana vinent"]);
    expect(screen.getByRole("heading", { name: "Les meves reserves" })).toBeVisible();
    await waitFor(() => {
      expect(reservationRows()).toHaveLength(5);
    });
    expect(reservationRows()).toEqual([
      "Classe B+C · amb Duna | confirmada / Dilluns 3 · 18:50–19:50 · Central · instructor: es mostra el dia abans",
      "Entrenament · amb Rock | confirmada / Dimarts 4 · 8:00–8:30 · Muntanya",
      "Classe C i sup. · amb Duna | en llista d'espera / Dijous 6 · 20:00 · Carretera · t'avisarem si s'allibera plaça",
      "Torneig d'Estiu 2026 | inscrita / Divendres 7 · 18:30–20:30 · totes les pistes",
      "Classe D i sup. · amb Rock | confirmada / Dilluns 10 · 19:00–20:00 · Muntanya · instructor: es mostra el dia abans",
    ]);
    const links = [...document.querySelectorAll(".reservation-row, .activity-row")].map(
      (row) => row.querySelector("a")?.getAttribute("href") ?? null,
    );
    // The training's page belongs to E5-W02 (S09): the row is not a link yet.
    expect(links).toEqual([
      "/reserves/booking-duna-mon3",
      null,
      "/espera/waitlist-duna-thu6",
      expect.stringMatching(/^\/activitats\//u) as unknown,
      "/reserves/booking-rock-mon10",
    ]);
    expect(screen.getByRole("link", { name: "Veure l'històric (2 mesos) ›" })).toHaveAttribute(
      "href",
      "/historic",
    );
    expect(screen.getByRole("link", { name: "Inici" })).toHaveAttribute("aria-current", "page");
  });

  it("a dog selected: its rows without « · amb …», its counters, and «Tots» brings them back", async () => {
    await renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Duna · C" }));
    await waitFor(() => {
      expect(reservationRows()[0]).toBe(
        "Classe B+C | confirmada / Dilluns 3 · 18:50–19:50 · Central · instructor: es mostra el dia abans",
      );
    });
    expect(reservationRows().some((row) => row.includes("amb "))).toBe(false);
    expect(screen.getByRole("button", { name: "Duna · C" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const counters = screen.getByRole("group", { name: "Classes reservades" });
    expect(clean(counters.textContent)).toBe("1classe aquesta setm.＋0classes setmana vinent");
    fireEvent.click(screen.getByRole("button", { name: "Tots" }));
    await waitFor(() => {
      expect(reservationRows()[0]).toContain("amb Duna");
    });
  });

  it("a dog without reservations: «Encara no tens cap reserva» and a way to 04", async () => {
    await renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Toby · B (Joan Antoni)" }));
    expect(await screen.findByText("Encara no tens cap reserva")).toBeVisible();
    expect(screen.getByRole("link", { name: "RESERVA UNA CLASSE" })).toHaveAttribute(
      "href",
      "/reservar",
    );
    expect(reservationRows()).toEqual([]);
  });

  it("only one accessible dog: no «Tots», its chip selected; nothing unread: the bell is still", async () => {
    rewrite("/me/home", (body) => {
      body.dogs = [(body.dogs as unknown[])[0]];
      body.notifications = { unreadCount: 0 };
    });
    await renderHome();
    const chips = within(screen.getByRole("group", { name: "Gossos" })).getAllByRole("button");
    expect(chips.map((chip) => [chip.textContent, chip.getAttribute("aria-pressed")])).toEqual([
      ["Duna · C", "true"],
    ]);
    const bell = screen.getByRole("link", { name: "Avisos" });
    expect(bell.querySelector("svg")).not.toHaveClass("home-header__bell-icon--ringing");
  });

  it("R-08-20: a visible instructor is named; «es mostra 6 h abans» and «1,5 h» take the ICU `other` branch", async () => {
    rewrite("/me/home", (body) => {
      const rows = body.reservations as Record<string, unknown>[];
      Object.assign(rows[0] ?? {}, { instructorName: "Marc" });
      Object.assign(rows[4] ?? {}, {
        instructorName: null,
        instructorVisibleAt: "2026-08-10T11:00:00Z",
      });
    });
    await renderHome();
    await waitFor(() => {
      expect(reservationRows()[0]).toContain("Central · Marc");
    });
    expect(reservationRows()[4]).toContain("instructor: es mostra 6 h abans");
  });

  it("R-08-20: a non-whole number of hours reads with the reader's decimal comma", async () => {
    rewrite("/me/home", (body) => {
      const rows = body.reservations as Record<string, unknown>[];
      Object.assign(rows[0] ?? {}, { instructorVisibleAt: "2026-08-03T15:20:00Z" });
    });
    await renderHome();
    await waitFor(() => {
      expect(reservationRows()[0]).toContain("instructor: es mostra 1,5 h abans");
    });
  });

  it("WAITLIST off: no waiting row", async () => {
    await renderHome({
      branding: { ...canic, modules: without("WAITLIST") },
      scenario: "bookingNoWaitlist",
    });
    await waitFor(() => {
      expect(reservationRows()).toHaveLength(4);
    });
    expect(reservationRows().some((row) => row.includes("en llista d'espera"))).toBe(false);
  });
});

describe("E5-W01 i18n: the three locales, and the club's zone for a viewer elsewhere (CONVENCIONS_I18N §5)", () => {
  it("es: 03 and 04 read in Spanish, with no Catalan article", async () => {
    await renderHome({ locale: "es" });
    expect(screen.getByRole("heading", { level: 1, name: "¡Hola, Laura!" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Mis reservas" })).toBeVisible();
    await waitFor(() => {
      expect(reservationRows()[0]).toBe(
        "Clase B+C · con Duna | confirmada / Lunes 3 · 18:50–19:50 · Central · instructor: se muestra el día antes",
      );
    });
  });

  it("en: 04's badges and pack in English", async () => {
    await renderPage(<BookPage client={apiClient("en")} />, { locale: "en" });
    await screen.findByRole("heading", { name: "Classes" });
    expect(screen.getByText("Pack 10 — with Duna")).toBeVisible();
    const badges = [...document.querySelectorAll(".class-row .ah-badge")].map((badge) =>
      clean((badge.querySelector(".class-row__badge-content") ?? badge).textContent),
    );
    expect(badges).toEqual([
      "2 places",
      "Full · 1",
      "Full · 3/3",
      "Weekly limit",
      "4 places",
      "Coming soon",
    ]);
  });

  it("a viewer in America/Bogota still reads the club's times (Europe/Madrid): «18:50» and «20:14»", async () => {
    vi.stubEnv("TZ", "America/Bogota");
    expect(new Date("2026-08-03T16:50:00Z").getHours()).toBe(11);
    await renderHome();
    await waitFor(() => {
      expect(reservationRows()[0]).toContain("Dilluns 3 · 18:50–19:50");
    });
    await renderPage(<BookingDetailPage bookingId="booking-duna-mon3" client={apiClient()} />);
    expect(await screen.findByText("Reservada el dijous 30/07 a les 20:14")).toBeVisible();
  });
});
