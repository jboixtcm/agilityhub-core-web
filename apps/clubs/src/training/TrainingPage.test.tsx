import { mockScenario, trainingState } from "@agilityhub/api-client/mocks";
import { server } from "@agilityhub/api-client/mocks/server";
import type { Me } from "@agilityhub/auth";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { renderApp } from "../booking/test-utils";

import { recordRequests, setupTrainingWorld } from "./test-utils";

setupTrainingWorld();

function group(name: string): HTMLElement {
  return screen.getByRole("group", { name });
}

function pressed(container: HTMLElement): string[] {
  return within(container)
    .getAllByRole("button")
    .filter((button) => button.getAttribute("aria-pressed") === "true")
    .map((button) => button.textContent);
}

async function openTraining(scenario: Parameters<typeof renderApp>[1] = {}) {
  await renderApp("/entrenaments", scenario);
  await screen.findByRole("group", { name: "Matí" });
  // E7-W02 round 2 #7: [Confirma] waits for the week's counter (the limit is the api's); the
  // grid may land first on a loaded runner, so the page is ready once the counter (or its error)
  // is there too.
  await waitFor(() => {
    expect(document.querySelector(".training-counter")).not.toBeNull();
  });
}

function confirmButton(): HTMLElement {
  return screen.getByRole("button", { name: /^Confirma/u });
}

/** A training another member makes while the grid is on screen (the api's own world). */
function bookedMeanwhile(ringId: string, start: string, dogId = "dog-nit", memberName = "Nil") {
  const [hours = 0, minutes = 0] = start.split(":").map(Number);
  const end = hours * 60 + minutes + 30;
  trainingState.bookings.push({
    createdAt: "2026-08-03T05:05:00Z",
    date: "2026-08-03",
    dogId,
    dogName: dogId === "dog-rock" ? "Rock" : "Nit",
    end: `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`,
    id: `tb-meanwhile-${ringId}-${start}`,
    memberId: dogId === "dog-rock" ? "20000000-0000-4000-8000-000000000002" : "member-nil",
    memberName,
    origin: "APP",
    ringId,
    start,
    state: "ACTIVE",
  });
}

describe("T-09-37 screen 08 exists only with a dog allowed to train alone", () => {
  it("without eligible dogs the tab is absent and /entrenaments goes back to 03", async () => {
    const requests = recordRequests();
    await renderApp("/entrenaments", { scenario: "trainingNoRight" });
    await waitFor(() => {
      expect(window.location.pathname).toBe("/inici");
    });
    await screen.findByRole("heading", { name: "Les meves reserves" });
    // The shell asked for the summary and got no dog: no tab.
    await waitFor(() => {
      expect(
        requests.list.filter((line) => line.startsWith("GET /me/training-summary")),
      ).not.toEqual([]);
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 30);
    });
    expect(screen.queryByRole("link", { name: "Entrenaments" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Inici" })).toBeInTheDocument();
  });

  it("with Rock and Toby the tab exists and Rock (defaultDogId) is the selected chip", async () => {
    await openTraining();
    expect(await screen.findByRole("link", { name: "Entrenaments" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const dogs = group("Gossos");
    expect(
      within(dogs)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Rock · D", "Toby · B (Joan Antoni)"]);
    expect(pressed(dogs)).toEqual(["Rock · D"]);
    expect(screen.getByRole("heading", { name: "Entrenaments" })).toBeVisible();
  });

  it("FREE_TRAINING off: no tab, and the route shows nothing of the module", async () => {
    await renderApp("/inici", { scenario: "trainingModuleOff" });
    await screen.findByRole("heading", { name: "Les meves reserves" });
    expect(screen.queryByRole("link", { name: "Entrenaments" })).not.toBeInTheDocument();
  });
});

describe("T-09-38 screen 08 grid, «Qualsevol» and the confirmation", () => {
  it("draws the api's cells: free outlined and pressable, struck, «classe» dimmed", async () => {
    await openTraining();
    const days = group("Dia");
    expect(
      within(days)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Avui dl 3", "dt 4", "dc 5", "dj 6"]);
    expect(pressed(days)).toEqual(["Avui dl 3"]);
    const rings = group("Pista");
    expect(
      within(rings)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Qualsevol", "Muntanya", "Central", "Carretera"]);
    expect(pressed(rings)).toEqual(["Qualsevol"]);
    // R-09-15 (COURSES): the course built on Muntanya is described on its chip.
    expect(within(rings).getByRole("button", { name: "Muntanya" })).toHaveAccessibleDescription(
      "Muntanya: recorregut muntat",
    );

    const morning = group("Matí");
    const free = within(morning).getByRole("button", { name: "7:30, lliure" });
    expect(free).toHaveClass("ah-slot--free");
    expect(free).toBeEnabled();
    // 7:00 has begun and every ring is taken: struck and inert.
    const taken = within(morning).getByRole("button", { name: "7:00, ocupada" });
    expect(taken).toHaveClass("ah-slot--taken");
    expect(taken).toBeDisabled();
    // Expected deviation (S09 §13-3): the fixed 30-min grid labels the class with the row's time.
    const afternoon = group("Tarda");
    const lesson = within(afternoon).getByRole("button", { name: "18:30, 18:30 classe" });
    expect(lesson).toHaveClass("ah-slot--class");
    expect(lesson).toHaveTextContent("18:30 classe");
    expect(lesson).toBeDisabled();
    expect(within(afternoon).getByRole("button", { name: "19:00, 19:00 classe" })).toBeDisabled();
    // The two sections are split at 14:00 club-local (S09 §13-12).
    expect(within(morning).getAllByRole("button").at(-1)).toHaveAccessibleName("13:30, lliure");
    expect(within(afternoon).getAllByRole("button")[0]).toHaveAccessibleName("14:00, lliure");

    // A concrete ring: its own cells (the viewer's training «meva», a booked one, a block).
    fireEvent.click(within(rings).getByRole("button", { name: "Muntanya" }));
    expect(within(group("Matí")).getByRole("button", { name: "7:00, 7:00 · meva" })).toHaveClass(
      "ah-slot--own",
    );
    expect(within(group("Matí")).getByRole("button", { name: "9:00, bloqueig" })).toBeDisabled();
    fireEvent.click(within(rings).getByRole("button", { name: "Central" }));
    expect(within(group("Matí")).getByRole("button", { name: "8:30, entrenament" })).toHaveClass(
      "ah-slot--taken",
    );
  });

  it("«Qualsevol» with two free rings asks which one, Muntanya first, and books with it", async () => {
    const requests = recordRequests();
    await openTraining();
    expect(confirmButton()).toBeDisabled();
    fireEvent.click(within(group("Matí")).getByRole("button", { name: "8:30, lliure" }));
    expect(
      screen.getByText("A les 8:30 hi ha més d'una pista lliure — tria quina vols:"),
    ).toBeVisible();
    const choices = screen.getAllByRole("group", { name: "Pista" })[1] ?? document.body;
    expect(
      within(choices)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Muntanya", "Carretera"]);
    expect(pressed(choices)).toEqual(["Muntanya"]);
    // Upper-cased by CSS: «CONFIRMA DILLUNS 3 · 8:30–9:00 · MUNTANYA».
    expect(confirmButton()).toHaveTextContent("Confirma Dilluns 3 · 8:30–9:00 · Muntanya");
    expect(confirmButton()).toHaveClass("training-confirm");
    expect(confirmButton()).toBeEnabled();

    fireEvent.click(within(choices).getByRole("button", { name: "Carretera" }));
    expect(confirmButton()).toHaveTextContent("Confirma Dilluns 3 · 8:30–9:00 · Carretera");
    fireEvent.click(confirmButton());
    expect(await screen.findByText("Entrenament reservat")).toBeVisible();
    await waitFor(() => {
      expect(requests.bodies.get("/training-bookings")).toEqual([
        { dogId: "dog-rock", ringId: "ring-carretera", startsAt: "2026-08-03T06:30:00Z" },
      ]);
    });
    expect(requests.keys).toHaveLength(1);
    // Rock is now at 3/3 (by session date): the button gives way to the limit message.
    expect(
      await screen.findByText(
        "Has arribat al límit de 3 reserves per aquesta setmana: anul·la alguna de les properes per reservar-ne una altra.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Confirma/u })).not.toBeInTheDocument();
    // The grid and the counter were read again after the booking.
    expect(requests.list.filter((line) => line.startsWith("GET /training-slots"))).toHaveLength(2);
  });

  it("the counter card reads the selected day's week and follows the dog", async () => {
    const requests = recordRequests();
    await openTraining();
    expect(await screen.findByText("Portes 2/3 entrenaments aquesta setmana")).toBeVisible();
    expect(screen.getByText("reinici dg 20:00")).toBeVisible();
    const bar = screen.getByRole("progressbar", {
      name: "Portes 2/3 entrenaments aquesta setmana",
    });
    expect(bar).toHaveAttribute("value", "2");
    expect(bar).toHaveAttribute("max", "3");
    fireEvent.click(
      within(group("Gossos")).getByRole("button", { name: "Toby · B (Joan Antoni)" }),
    );
    expect(await screen.findByText("Portes 0/3 entrenaments aquesta setmana")).toBeVisible();
    expect(requests.list).toEqual(
      expect.arrayContaining([
        "GET /me/training-summary?dogId=dog-rock&date=2026-08-03",
        "GET /training-slots?from=2026-08-03&to=2026-09-03&dogId=dog-toby",
        "GET /me/training-summary?dogId=dog-toby&date=2026-08-03",
      ]),
    );
  });

  it("a closed day says so and draws no grid", async () => {
    await openTraining();
    fireEvent.click(within(group("Dia")).getByRole("button", { name: "dc 5" }));
    expect(screen.getByText("El club està tancat aquest dia")).toBeVisible();
    expect(screen.queryByRole("group", { name: "Matí" })).not.toBeInTheDocument();
  });
});

describe("T-09-39 screen 08 at the weekly limit (R-09-05)", () => {
  it("with cancellable sessions: no button, the message and a link to each", async () => {
    await openTraining({ scenario: "trainingAtLimit" });
    expect(
      await screen.findByText(
        "Has arribat al límit de 3 reserves per aquesta setmana: anul·la alguna de les properes per reservar-ne una altra.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Confirma/u })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "dt 4 · 8:00 · Muntanya" })).toHaveAttribute(
      "href",
      "/entrenaments/training-rock-tue4",
    );
    expect(screen.getByRole("link", { name: "dj 6 · 7:30 · Carretera" })).toHaveAttribute(
      "href",
      "/entrenaments/training-rock-thu6",
    );
    expect(screen.getByText("Portes 3/3 entrenaments aquesta setmana")).toBeVisible();
  });

  it("without any cancellable session: the short message", async () => {
    await openTraining({ scenario: "trainingAtLimitNoCancellable" });
    expect(
      await screen.findByText("Has arribat al límit de 3 reserves per aquesta setmana."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Confirma/u })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Muntanya|Carretera/u })).not.toBeInTheDocument();
  });
});

describe("screen 08 refusals by code (S09 §6, R-09-06)", () => {
  it("409 SLOT_TAKEN: the message, the grid read again and the api's free rings offered", async () => {
    const requests = recordRequests();
    await openTraining();
    fireEvent.click(within(group("Pista")).getByRole("button", { name: "Muntanya" }));
    fireEvent.click(within(group("Matí")).getByRole("button", { name: "8:30, lliure" }));
    // Another member takes Muntanya at 8:30 while the grid is on screen.
    bookedMeanwhile("ring-muntanya", "08:30");
    fireEvent.click(confirmButton());
    expect(await screen.findByText("Aquesta pista ja no està lliure.")).toBeVisible();
    const choices = screen.getAllByRole("group", { name: "Pista" })[1] ?? document.body;
    expect(
      within(choices)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Carretera"]);
    expect(confirmButton()).toHaveTextContent("Confirma Dilluns 3 · 8:30–9:00 · Carretera");
    await waitFor(() => {
      expect(
        within(group("Matí")).getByRole("button", { name: "8:30, entrenament" }),
      ).toBeDisabled();
    });
    expect(requests.list.filter((line) => line.startsWith("GET /training-slots"))).toHaveLength(2);
  });

  it("409 TRAINING_LIMIT_REACHED on a stale counter: the R-09-05 message from the details", async () => {
    await openTraining();
    fireEvent.click(within(group("Matí")).getByRole("button", { name: "7:30, lliure" }));
    // Rock's third session was booked from another device meanwhile.
    bookedMeanwhile("ring-central", "12:00", "dog-rock", "Laura");
    fireEvent.click(confirmButton());
    expect(
      await screen.findByText(
        "Has arribat al límit de 3 reserves per aquesta setmana: anul·la alguna de les properes per reservar-ne una altra.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "dt 4 · 8:00 · Muntanya" })).toBeVisible();
  });

  it("422 codes show their message by code, never the api's text", async () => {
    server.use(
      http.post("*/api/v1/training-bookings", () =>
        HttpResponse.json(
          {
            code: "BOOKING_BLOCKED",
            details: {},
            message: "Member booking block",
            traceId: "trace-blocked",
          },
          { status: 422 },
        ),
      ),
    );
    await openTraining();
    fireEvent.click(within(group("Matí")).getByRole("button", { name: "7:30, lliure" }));
    fireEvent.click(confirmButton());
    expect(
      await screen.findByText("Les reserves estan bloquejades per a aquest abonament."),
    ).toBeVisible();
    expect(screen.queryByText("Member booking block")).not.toBeInTheDocument();
  });

  it("while the booking is sent the button is busy and the grid, days and dogs are inert", async () => {
    let release: () => void = () => undefined;
    server.use(
      http.post("*/api/v1/training-bookings", async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return undefined;
      }),
    );
    await openTraining();
    fireEvent.click(within(group("Matí")).getByRole("button", { name: "7:30, lliure" }));
    fireEvent.click(confirmButton());
    await waitFor(() => {
      expect(confirmButton()).toHaveAttribute("aria-busy", "true");
    });
    expect(within(group("Matí")).getByRole("button", { name: "8:00, lliure" })).toBeDisabled();
    expect(within(group("Dia")).getByRole("button", { name: "dt 4" })).toBeDisabled();
    expect(
      within(group("Gossos")).getByRole("button", { name: "Toby · B (Joan Antoni)" }),
    ).toBeDisabled();
    release();
    expect(await screen.findByText("Entrenament reservat")).toBeVisible();
    expect(within(group("Dia")).getByRole("button", { name: "dt 4" })).toBeEnabled();
  });

  it("a lost answer keeps its Idempotency-Key for the retry; an answer drops it", async () => {
    const requests = recordRequests();
    let calls = 0;
    server.use(
      http.post("*/api/v1/training-bookings", () => {
        calls += 1;
        return calls === 1 ? HttpResponse.error() : undefined;
      }),
    );
    await openTraining();
    fireEvent.click(within(group("Matí")).getByRole("button", { name: "7:30, lliure" }));
    fireEvent.click(
      within(screen.getAllByRole("group", { name: "Pista" })[1] ?? document.body).getByRole(
        "button",
        { name: "Muntanya" },
      ),
    );
    fireEvent.click(confirmButton());
    await screen.findByRole("alert");
    expect(confirmButton()).toBeEnabled();
    fireEvent.click(confirmButton());
    expect(await screen.findByText("Entrenament reservat")).toBeVisible();
    expect(requests.keys).toHaveLength(2);
    expect(requests.keys[1]).toBe(requests.keys[0]);
  });
});

function slotReads(requests: { list: string[] }): number {
  return requests.list.filter((line) => line.startsWith("GET /training-slots")).length;
}

describe("E5-W05 step 11: a refreshed grid clears an invalid choice (E5-W02 round-2 review #1, R-09-03)", () => {
  it("E5-W05 step 11: another member books the chosen slot; the focus refresh clears the choice and [Confirma] is disabled", async () => {
    const requests = recordRequests();
    await openTraining();
    fireEvent.click(within(group("Pista")).getByRole("button", { name: "Muntanya" }));
    fireEvent.click(within(group("Matí")).getByRole("button", { name: "8:30, lliure" }));
    expect(confirmButton()).toHaveTextContent("Confirma Dilluns 3 · 8:30–9:00 · Muntanya");
    expect(confirmButton()).toBeEnabled();
    // Another member takes Muntanya at 8:30; the app regains focus and reads the grid again.
    bookedMeanwhile("ring-muntanya", "08:30");
    fireEvent.focus(window);
    await waitFor(() => {
      expect(
        within(group("Matí")).getByRole("button", { name: "8:30, entrenament" }),
      ).toBeDisabled();
    });
    expect(slotReads(requests)).toBe(2);
    expect(group("Matí").querySelector(".ah-slot--selected")).toBeNull();
    expect(confirmButton()).toHaveTextContent(/^Confirma$/u);
    expect(confirmButton()).toBeDisabled();
  });

  it("E5-W05 step 11: with «Qualsevol», the chosen ring taken meanwhile clears the choice and its chooser", async () => {
    await openTraining();
    fireEvent.click(within(group("Matí")).getByRole("button", { name: "8:30, lliure" }));
    const chooser = screen.getAllByRole("group", { name: "Pista" })[1] ?? document.body;
    expect(pressed(chooser)).toEqual(["Muntanya"]);
    expect(confirmButton()).toBeEnabled();
    bookedMeanwhile("ring-muntanya", "08:30");
    fireEvent.focus(window);
    await waitFor(() => {
      expect(confirmButton()).toBeDisabled();
    });
    expect(confirmButton()).toHaveTextContent(/^Confirma$/u);
    expect(screen.getAllByRole("group", { name: "Pista" })).toHaveLength(1);
    // Carretera is still free at 8:30: the member can choose again.
    const again = within(group("Matí")).getByRole("button", { name: "8:30, lliure" });
    expect(again).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(again);
    expect(confirmButton()).toHaveTextContent("Confirma Dilluns 3 · 8:30–9:00 · Carretera");
    expect(confirmButton()).toBeEnabled();
  });
});

describe("E5-W05 step 12: the offline copy blocks the booking (E5-W02 round-2 review #2, S09 §2)", () => {
  it("E5-W05 step 12: a NETWORK answer while navigator.onLine is true: «pot no estar al dia», [Confirma] disabled, and the retry reads again", async () => {
    const requests = recordRequests();
    await openTraining();
    fireEvent.click(within(group("Pista")).getByRole("button", { name: "Muntanya" }));
    fireEvent.click(within(group("Matí")).getByRole("button", { name: "7:30, lliure" }));
    expect(confirmButton()).toBeEnabled();
    // The browser says online, but the api cannot be reached.
    expect(navigator.onLine).toBe(true);
    server.use(http.get("*/api/v1/training-slots", () => HttpResponse.error()));
    fireEvent.focus(window);
    expect(await screen.findByText("pot no estar al dia")).toBeVisible();
    expect(navigator.onLine).toBe(true);
    expect(within(group("Matí")).getByRole("button", { name: "7:30, lliure" })).toBeVisible();
    expect(confirmButton()).toBeDisabled();

    // The api answers again: the retry reads the grid again and the booking can go.
    server.resetHandlers();
    const before = slotReads(requests);
    const retry = screen.getByRole("button", { name: "Torna-ho a provar" });
    fireEvent.click(retry);
    // Busy while the reads are out.
    expect(retry).toHaveAttribute("aria-busy", "true");
    expect(retry).toBeDisabled();
    await waitFor(() => {
      expect(screen.queryByText("pot no estar al dia")).not.toBeInTheDocument();
    });
    expect(slotReads(requests)).toBeGreaterThan(before);
    expect(confirmButton()).toHaveTextContent("Confirma Dilluns 3 · 7:30–8:00 · Muntanya");
    expect(confirmButton()).toBeEnabled();
  });

  it("E5-W05 step 12: the counter's offline copy blocks the booking too", async () => {
    await openTraining();
    fireEvent.click(within(group("Pista")).getByRole("button", { name: "Muntanya" }));
    fireEvent.click(within(group("Matí")).getByRole("button", { name: "7:30, lliure" }));
    expect(await screen.findByText("Portes 2/3 entrenaments aquesta setmana")).toBeVisible();
    expect(confirmButton()).toBeEnabled();
    server.use(http.get("*/api/v1/me/training-summary", () => HttpResponse.error()));
    fireEvent.focus(window);
    expect(await screen.findByText("pot no estar al dia")).toBeVisible();
    // The kept counter stays on screen, and the booking waits for a fresh one.
    expect(screen.getByText("Portes 2/3 entrenaments aquesta setmana")).toBeVisible();
    expect(confirmButton()).toBeDisabled();
  });
});

describe("screen 08 without network (S09 §2 «sense connexió»)", () => {
  it("keeps the last grid marked «pot no estar al dia» and blocks the booking", async () => {
    await openTraining();
    fireEvent.click(within(group("Matí")).getByRole("button", { name: "7:30, lliure" }));
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    server.use(http.get("*/api/v1/training-slots", () => HttpResponse.error()));
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("focus"));
    expect(await screen.findByText("pot no estar al dia")).toBeVisible();
    expect(within(group("Matí")).getByRole("button", { name: "7:30, lliure" })).toBeVisible();
    expect(confirmButton()).toBeDisabled();
  });
});

/** The scenario's own `/me` (the mock answers it without a bearer). */
async function scenarioMe(): Promise<Me> {
  return (await (await fetch(`${window.location.origin}/api/v1/me`)).json()) as Me;
}

/** Every training read of 08 without network: only a kept answer could fill the screen. */
function trainingOffline(): void {
  server.use(
    http.get("*/api/v1/me/training-summary", () => HttpResponse.error()),
    http.get("*/api/v1/training-slots", () => HttpResponse.error()),
  );
}

/** 08 for `me` (the session `/me` answers), without network: the error, never kept answers. */
async function expectNothingKept(me: Me): Promise<void> {
  server.use(http.get("*/api/v1/me", () => HttpResponse.json(me)));
  trainingOffline();
  await renderApp("/entrenaments");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No s'han pogut carregar els entrenaments.",
  );
  expect(screen.queryByRole("button", { name: "Rock · D" })).not.toBeInTheDocument();
  expect(screen.queryByRole("group", { name: "Matí" })).not.toBeInTheDocument();
  cleanup();
  server.resetHandlers();
}

describe("E5-W02 round 2 · review #1: the offline copy of 08 is per club and person (S09 §6)", () => {
  it("A's answers never show for B after a network failure, and B's session drops A's copy", async () => {
    const own = await scenarioMe();
    // A: the member's 08, online.
    await openTraining();
    expect(pressed(group("Gossos"))).toEqual(["Rock · D"]);
    cleanup();
    // B: another account of the same club, every training read without network.
    await expectNothingKept({
      ...own,
      account: { ...own.account, id: "10000000-0000-4000-8000-0000000000b2", name: "Marc Puig" },
      ...(own.membership === undefined
        ? {}
        : {
            membership: { ...own.membership, memberId: "20000000-0000-4000-8000-0000000000b2" },
          }),
    });
    // A again, still without network: B's session dropped A's copy.
    await expectNothingKept(own);
  });

  it("an impersonated session never reads the answers the account's own session kept", async () => {
    const own = await scenarioMe();
    await openTraining();
    expect(pressed(group("Gossos"))).toEqual(["Rock · D"]);
    cleanup();
    // The same account, now through «Entra com l'abonat»: another scope.
    await expectNothingKept({
      ...own,
      impersonation: { actorName: "Aina Serra", memberName: "Laura Serra Vidal" },
    });
    // The impersonation ended: its start already dropped the account's own copy.
    await expectNothingKept(own);
  });
});

function trainingTab(): HTMLElement | null {
  return screen.queryByRole("link", { name: "Entrenaments" });
}

describe("E5-W02 round 2 · review #3: the tab follows the member's rights (R-09-01, S09 §7)", () => {
  it("rights granted while away: the tab appears when the app regains focus", async () => {
    await renderApp("/inici", { scenario: "trainingNoRight" });
    await screen.findByRole("heading", { name: "Les meves reserves" });
    await new Promise((resolve) => {
      setTimeout(resolve, 30);
    });
    expect(trainingTab()).not.toBeInTheDocument();
    mockScenario("member");
    fireEvent.focus(window);
    expect(await screen.findByRole("link", { name: "Entrenaments" })).toBeVisible();
  });

  it("rights revoked while away: the tab goes when the app regains focus", async () => {
    await renderApp("/inici");
    expect(await screen.findByRole("link", { name: "Entrenaments" })).toBeVisible();
    mockScenario("trainingNoRight");
    fireEvent.focus(window);
    await waitFor(() => {
      expect(trainingTab()).not.toBeInTheDocument();
    });
  });

  it("a MODULE_DISABLED from any training read asks the rights again, and the tab goes", async () => {
    const requests = recordRequests();
    await openTraining();
    expect(trainingTab()).toBeInTheDocument();
    const moduleOff = () =>
      HttpResponse.json(
        {
          code: "MODULE_DISABLED",
          details: {},
          message: "Module disabled",
          traceId: "trace-module-off",
        },
        { status: 404 },
      );
    server.use(
      http.get("*/api/v1/me/training-summary", moduleOff),
      http.get("*/api/v1/training-slots", moduleOff),
    );
    const before = requests.list.filter((line) => line === "GET /me/training-summary").length;
    // Another day: the counter of its week is a training read, and it is refused.
    fireEvent.click(within(group("Dia")).getByRole("button", { name: "dt 4" }));
    await waitFor(() => {
      expect(window.location.pathname).toBe("/inici");
    });
    await waitFor(() => {
      expect(trainingTab()).not.toBeInTheDocument();
    });
    // The shell asked the eligibility again after the refusal (no focus, no remount).
    expect(
      requests.list.filter((line) => line === "GET /me/training-summary").length,
    ).toBeGreaterThan(before);
  });
});

describe("E5-W02 round 2 · review #4: a failed counter (S09 §2 states)", () => {
  it("shows its error and retry, and [Confirma] stays disabled until the summary is there", async () => {
    server.use(
      http.get("*/api/v1/me/training-summary", ({ request }) =>
        new URL(request.url).searchParams.has("date")
          ? HttpResponse.json(
              {
                code: "INTERNAL_ERROR",
                details: {},
                message: "Internal error",
                traceId: "trace-counter",
              },
              { status: 500 },
            )
          : undefined,
      ),
    );
    await openTraining();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No s'han pogut carregar els entrenaments.");
    fireEvent.click(within(group("Matí")).getByRole("button", { name: "7:30, lliure" }));
    fireEvent.click(
      within(screen.getAllByRole("group", { name: "Pista" })[1] ?? document.body).getByRole(
        "button",
        { name: "Muntanya" },
      ),
    );
    expect(confirmButton()).toHaveTextContent("Confirma Dilluns 3 · 7:30–8:00 · Muntanya");
    expect(confirmButton()).toBeDisabled();
    server.resetHandlers();
    fireEvent.click(within(alert).getByRole("button", { name: "Torna-ho a provar" }));
    expect(await screen.findByText("Portes 2/3 entrenaments aquesta setmana")).toBeVisible();
    expect(confirmButton()).toBeEnabled();
  });
});
