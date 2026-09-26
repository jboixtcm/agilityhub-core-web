import { server } from "@agilityhub/api-client/mocks/server";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { BookPage } from "./BookPage";
import { apiClient, canic, renderApp, renderPage, setupBookingWorld, without } from "./test-utils";

setupBookingWorld();

const rows = () => [...document.querySelectorAll<HTMLElement>(".class-row")];
const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/gu, " ").trim();

/** «{date · time · description} | {visible badge}[ | {screen-reader badge}]» of a 04 row. */
function text(row: Element): string {
  const badge = row.querySelector(".ah-badge");
  const visible = badge?.querySelector(".class-row__badge-content") ?? badge;
  return [
    clean(row.querySelector(".class-row__text")?.textContent),
    clean(visible?.textContent),
    clean(badge?.querySelector(".ah-sr-only")?.textContent),
  ]
    .filter((part) => part !== "")
    .join(" | ");
}

async function renderBook(options: Parameters<typeof renderPage>[1] = {}) {
  await renderPage(<BookPage client={apiClient()} />, options);
  await screen.findByRole("heading", { name: "Classes" });
}

describe("T-08-37 screen 04 «Reservar»: every row state with its mockup badge (S08 §2, R-08-03)", () => {
  it("Duna: the chips without «Tots», the pack, the intro, the activities and the six mockup rows", async () => {
    await renderBook();
    const chips = screen.getByRole("group", { name: "Gossos" });
    expect(within(chips).getByRole("button", { name: "Duna · C", pressed: true })).toBeVisible();
    expect(within(chips).getByRole("button", { name: "Rock · D", pressed: false })).toBeVisible();
    expect(within(chips).getByRole("button", { name: "Toby · B (Joan Antoni)" })).toBeVisible();
    expect(within(chips).queryByRole("button", { name: "Tots" })).toBeNull();
    const pack = document.querySelector(".pack-card");
    if (!(pack instanceof HTMLElement)) throw new TypeError("Missing the pack card");
    expect(within(pack).getByText("Pack 10 — amb la Duna")).toBeVisible();
    expect(within(pack).getByText("caduca 12/11/2026")).toHaveClass("ah-tone--warning");
    expect(clean(pack.querySelector(".pack-card__counts")?.textContent)).toBe(
      "6 consumides · 4 disponibles",
    );
    expect(
      screen.getByText("Seleccioneu l'activitat o classe que vulgueu reservar."),
    ).toBeVisible();
    expect(await screen.findByRole("heading", { name: "Activitats" })).toBeVisible();
    expect(rows().map(text)).toEqual([
      "dc 5 · 18:50 · B+C | 2 places",
      "dj 6 · 20:00 · C+D | Completa · 1 | Completa, 1 en llista d'espera",
      "dv 7 · 17:40 · Teràpia | Completa · 3/3 | Completa, llista d'espera plena (3/3)",
      "ds 8 · 9:00 · C | Límit setmanal",
      "dl 10 · 18:50 · B+C | 4 places",
      "dl 17 · 9:30 · C | Properament",
    ]);
    expect(
      rows().map((row) => row.querySelector(".ah-badge")?.className.match(/ah-tone--\w+/u)?.[0]),
    ).toEqual([
      "ah-tone--success",
      "ah-tone--danger",
      "ah-tone--danger",
      "ah-tone--warning",
      "ah-tone--success",
      "ah-tone--neutral",
    ]);
    // The hourglass is the mockup's SVG, not a text character.
    expect(rows()[1]?.querySelector("svg.class-row__hourglass")).not.toBeNull();
    // A full waiting list is inert: no action and no ›; every other row acts and shows it.
    const actions = rows().map((row) => [
      row.querySelector("button") !== null,
      row.querySelector(".class-row__chevron") !== null,
    ]);
    expect(actions).toEqual([
      [true, true],
      [true, true],
      [false, false],
      [true, true],
      [true, true],
      [true, true],
    ]);
  });

  it("Rock: «Sense sessions» is inert with an expiring pack; Toby: the block banner and inert rows without a badge", async () => {
    await renderBook();
    fireEvent.click(screen.getByRole("button", { name: "Rock · D" }));
    await waitFor(() => {
      expect(rows().map(text)).toEqual([
        "dc 5 · 19:00 · D i sup. | 1 plaça",
        "dc 12 · 19:00 · D i sup. | Sense sessions",
      ]);
    });
    expect(rows()[1]?.querySelector("button")).toBeNull();
    expect(document.querySelector(".pack-card")).toHaveClass("pack-card--expiring");
    expect(screen.getByText("Pack 10 — amb en Rock")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Toby · B (Joan Antoni)" }));
    expect(
      await screen.findByText(
        "Les reserves estan bloquejades: rebut de juliol pendent. Posa't en contacte amb el club.",
      ),
    ).toBeVisible();
    expect(
      rows().every(
        (row) => row.querySelector("button") === null && row.querySelector(".ah-badge") === null,
      ),
    ).toBe(true);
    expect(within(rows()[0] ?? document.body).getByText("no reservable")).toHaveClass("ah-sr-only");
    expect(document.querySelector(".pack-card")).toBeNull();
  });

  it("modules gate the page: no ACTIVITIES block, no PACKS card, WAITLIST off reads «Completa» inert, SINGLE_CLASS adds the price", async () => {
    await renderBook({
      branding: { ...canic, modules: without("ACTIVITIES").filter((module) => module !== "PACKS") },
    });
    expect(screen.queryByRole("heading", { name: "Activitats" })).toBeNull();
    expect(document.querySelector(".pack-card")).toBeNull();
  });

  it("WAITLIST off: the full rows read «Completa» and do nothing", async () => {
    await renderBook({
      branding: { ...canic, modules: without("WAITLIST") },
      scenario: "bookingNoWaitlist",
    });
    expect(rows().slice(1, 3).map(text)).toEqual([
      "dj 6 · 20:00 · C+D | Completa",
      "dv 7 · 17:40 · Teràpia | Completa",
    ]);
    expect(
      rows()
        .slice(1, 3)
        .every((row) => row.querySelector("button") === null),
    ).toBe(true);
  });

  it("SINGLE_CLASS: every badge carries the price (R-08-18)", async () => {
    await renderBook({
      branding: { ...canic, modules: [...canic.modules, "SINGLE_CLASS"] },
      scenario: "bookingSingleClass",
    });
    expect(text(rows()[0] ?? document.body)).toBe("dc 5 · 18:50 · B+C | 2 places · 12,00 €");
    expect(document.querySelector(".pack-card")).toBeNull();
  });

  it("WAITLIST_OPEN asks first, joins with the selected dog, then the row leaves the list with «Ets a la llista d'espera»", async () => {
    const joins: unknown[] = [];
    server.use(
      http.post("*/api/v1/waitlist-entries", async ({ request }) => {
        joins.push(await request.clone().json());
        return undefined;
      }),
    );
    await renderBook();
    fireEvent.click(within(rows()[1] ?? document.body).getByRole("button"));
    const dialog = screen.getByRole("dialog", {
      name: "Vols apuntar-te a la llista d'espera de la classe C+D (dj 6 · 20:00)?",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "APUNTA'M" }));
    expect(await screen.findByText("Ets a la llista d'espera")).toBeVisible();
    await waitFor(() => {
      expect(rows()).toHaveLength(5);
    });
    expect(joins).toEqual([{ classSessionId: "class-2026-08-06-2000-cd", dogId: "dog-duna" }]);
  });

  it("a refused join keeps its message inside the dialog (409 WAITLIST_LIMIT)", async () => {
    server.use(
      http.post("*/api/v1/waitlist-entries", () =>
        HttpResponse.json(
          { code: "WAITLIST_LIMIT", details: { scope: "DOG_WEEK" }, message: "x", traceId: "t" },
          { status: 409 },
        ),
      ),
    );
    await renderBook();
    fireEvent.click(within(rows()[1] ?? document.body).getByRole("button"));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "APUNTA'M" }));
    expect(
      await within(dialog).findByText("S'ha assolit el límit de la llista d'espera."),
    ).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "APUNTA'M" })).toBeEnabled();
  });

  it("a hold refused with any other code stays on 04 with its errors: message and the list read again", async () => {
    let reads = 0;
    server.use(
      http.post("*/api/v1/seat-holds", () =>
        HttpResponse.json(
          { code: "CLASS_NOT_BOOKABLE", details: {}, message: "x", traceId: "t" },
          { status: 422 },
        ),
      ),
      http.get("*/api/v1/me/bookable-classes", () => {
        reads += 1;
        return undefined;
      }),
    );
    await renderBook();
    fireEvent.click(within(rows()[0] ?? document.body).getByRole("button"));
    expect(await screen.findByText("Aquesta classe no es pot reservar.")).toBeVisible();
    await waitFor(() => {
      expect(reads).toBe(2);
    });
    expect(window.location.pathname).not.toBe("/reservar/confirmar");
  });

  it("the app mounts 04 on /reservar with the «Reservar» tab active", async () => {
    await renderApp("/reservar");
    expect(await screen.findByRole("heading", { name: "Reservar" })).toBeVisible();
    expect(await screen.findByRole("heading", { name: "Classes" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Reservar" })).toHaveAttribute("aria-current", "page");
  });
});
