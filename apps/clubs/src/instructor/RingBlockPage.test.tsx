import { trainingState } from "@agilityhub/api-client/mocks";
import { server } from "@agilityhub/api-client/mocks/server";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { canic, renderApp, without } from "../booking/test-utils";
import { recordRequests, setupTrainingWorld } from "../training/test-utils";

setupTrainingWorld();

function group(name: string): HTMLElement {
  return screen.getByRole("group", { name });
}

function buttons(name: string): string[] {
  return within(group(name))
    .getAllByRole("button")
    .map((button) => button.textContent);
}

async function openRingBlock(
  ringId = "ring-petita",
  options: Parameters<typeof renderApp>[1] = { scenario: "instructor" },
) {
  await renderApp(`/instructor/pistes/${ringId}/reservar`, options);
  await screen.findByRole("heading", { name: "Reservar o bloquejar pista" });
  await screen.findByRole("group", { name: "Pista" });
}

/** Day and band as the dropdowns of mockup 24 («dj 6 ▾», «tarda ▾»). */
async function pick(date: string, band: "afternoon" | "morning") {
  fireEvent.change(screen.getByRole("combobox", { name: "Dia" }), { target: { value: date } });
  fireEvent.change(screen.getByRole("combobox", { name: "Franja" }), { target: { value: band } });
  await screen.findByRole("group", { name: "Hores de la franja" });
}

function cell(name: string): HTMLElement {
  return within(group("Hores de la franja")).getByRole("button", { name });
}

describe("screen 24 «Reservar o bloquejar pista» (S09 §2 row 24, R-09-11)", () => {
  it("«Reserva de pista» first with its four reasons; «Bloqueig» hides them and offers its two", async () => {
    await openRingBlock();
    expect(buttons("Tipus")).toEqual(["Reserva de pista", "Bloqueig"]);
    expect(
      within(group("Tipus")).getByRole("button", { name: "Reserva de pista" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(buttons("Motiu")).toEqual(["Classe particular", "Teràpia", "Preparació", "Altres"]);
    fireEvent.click(within(group("Tipus")).getByRole("button", { name: "Bloqueig" }));
    expect(buttons("Motiu")).toEqual(["Manteniment", "Altres"]);
    expect(screen.queryByRole("button", { name: "Classe particular" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bloqueja la pista" })).toBeDisabled();
  });

  it("every active ring (also those closed to training), the route's ring preselected", async () => {
    await openRingBlock();
    expect(buttons("Pista")).toEqual(["Muntanya", "Central", "Carretera", "Cadells", "Petita"]);
    expect(within(group("Pista")).getByRole("button", { name: "Petita" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("a contiguous selection writes the summary and posts the block, then 23 with its toast", async () => {
    const requests = recordRequests();
    await openRingBlock();
    await pick("2026-08-06", "afternoon");
    // Screen 23's instructor projection names why a cell is taken (R-09-12).
    const taken = cell("19:00, bloqueig");
    expect(taken).toBeDisabled();
    expect(taken).toHaveTextContent("teràpia");
    fireEvent.click(cell("18:00, lliure"));
    fireEvent.click(cell("18:30, lliure"));
    expect(
      screen.getByText(
        "Ocupa la pista Petita de 18:00 a 19:00, surt al quadre global i al registre d'ús de pistes. No es vincula a cap alumne.",
      ),
    ).toBeVisible();
    // A selection never keeps a gap: the taken 19:00 starts nothing and 20:00 starts a new run.
    fireEvent.click(cell("20:00, lliure"));
    expect(cell("18:00, lliure")).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(cell("20:00, lliure"));
    fireEvent.click(cell("18:00, lliure"));
    fireEvent.click(cell("18:30, lliure"));
    fireEvent.change(screen.getByRole("textbox", { name: "Nota" }), {
      target: { value: "Particular amb l'alumna de la tarda" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reserva la pista" }));
    await waitFor(() => {
      expect(window.location.pathname).toBe("/instructor/avui");
    });
    expect(window.location.search).toBe("?date=2026-08-06");
    expect(await screen.findByText("Pista reservada")).toBeVisible();
    expect(requests.bodies.get("/ring-blocks")).toEqual([
      {
        from: "2026-08-06T16:00:00.000Z",
        kind: "RESERVATION",
        note: "Particular amb l'alumna de la tarda",
        reason: "PRIVATE_CLASS",
        ringId: "ring-petita",
        to: "2026-08-06T17:00:00.000Z",
      },
    ]);
    expect(requests.keys).toHaveLength(1);
    expect(
      trainingState.blocks.some((block) => block.note === "Particular amb l'alumna de la tarda"),
    ).toBe(true);
  });

  it("409 RING_BLOCK_CONFLICT marks the conflicting cells, lists the overlaps and reads the grid again", async () => {
    const requests = recordRequests();
    await openRingBlock("ring-central");
    await pick("2026-08-03", "afternoon");
    fireEvent.click(cell("17:30, lliure"));
    fireEvent.click(cell("18:00, lliure"));
    // Another instructor blocks Central at 18:00 while the grid is on screen.
    trainingState.blocks.push({
      activityId: null,
      activityTitle: null,
      createdByName: "Marc",
      date: "2026-08-03",
      from: "2026-08-03T16:00:00Z",
      fromLocal: "18:00",
      id: "rb-meanwhile",
      kind: "BLOCK",
      note: null,
      reason: "MAINTENANCE",
      ringId: "ring-central",
      state: "ACTIVE",
      to: "2026-08-03T16:30:00Z",
      toLocal: "18:30",
      version: 1,
    });
    fireEvent.click(screen.getByRole("button", { name: "Reserva la pista" }));
    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByText("Aquest bloqueig de pista coincideix amb un altre element."),
    ).toBeVisible();
    expect(within(alert).getByText("Coincideix amb:")).toBeVisible();
    expect(within(alert).getByText("Central bloquejada 18:00–18:30")).toBeVisible();
    await waitFor(() => {
      expect(cell("18:00, bloqueig")).toHaveClass("ah-slot--conflict");
    });
    expect(cell("17:30, lliure")).not.toHaveClass("ah-slot--conflict");
    expect(requests.list.filter((line) => line.startsWith("GET /training-slots"))).toHaveLength(2);
  });

  it("422 RING_HAS_BOOKINGS: the instructor is told to ask the administration, and nothing forces it", async () => {
    const requests = recordRequests();
    await openRingBlock("ring-central");
    await pick("2026-08-03", "afternoon");
    fireEvent.click(cell("17:30, lliure"));
    // A member books Central at 17:30 meanwhile.
    trainingState.bookings.push({
      createdAt: "2026-08-03T05:05:00Z",
      date: "2026-08-03",
      dogId: "dog-nit",
      dogName: "Nit",
      end: "18:00",
      id: "tb-meanwhile",
      memberId: "member-nil",
      memberName: "Nil",
      origin: "APP",
      ringId: "ring-central",
      start: "17:30",
      state: "ACTIVE",
    });
    fireEvent.click(screen.getByRole("button", { name: "Reserva la pista" }));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Aquesta pista té reserves.")).toBeVisible();
    expect(
      within(alert).getByText("Demana a l'administració que alliberi la pista."),
    ).toBeVisible();
    expect(within(alert).queryByRole("button")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(requests.bodies.get("/ring-blocks")).toHaveLength(1);
    });
    expect(JSON.stringify(requests.bodies.get("/ring-blocks"))).not.toContain("cancelBookings");
    expect(trainingState.bookings.find((item) => item.id === "tb-meanwhile")?.state).toBe("ACTIVE");
  });

  it("FREE_TRAINING off: only «Bloqueig», and the times are taken without a grid (the api validates)", async () => {
    const requests = recordRequests();
    await openRingBlock("ring-petita", {
      branding: { ...canic, modules: without("FREE_TRAINING") },
      scenario: "trainingModuleOffInstructor",
    });
    expect(buttons("Tipus")).toEqual(["Bloqueig"]);
    expect(buttons("Motiu")).toEqual(["Manteniment", "Altres"]);
    fireEvent.change(screen.getByRole("combobox", { name: "Dia" }), {
      target: { value: "2026-08-11" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Franja" }), {
      target: { value: "afternoon" },
    });
    expect(screen.queryByRole("group", { name: "Hores de la franja" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "De" }), { target: { value: "18:00" } });
    fireEvent.change(screen.getByRole("combobox", { name: "A" }), { target: { value: "19:00" } });
    expect(screen.getByText(/^Ocupa la pista Petita de 18:00 a 19:00/u)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Bloqueja la pista" }));
    expect(await screen.findByText("Pista bloquejada")).toBeVisible();
    expect(requests.list.some((line) => line.startsWith("GET /training-slots"))).toBe(false);
    expect(requests.bodies.get("/ring-blocks")).toEqual([
      expect.objectContaining({ kind: "BLOCK", reason: "MAINTENANCE", ringId: "ring-petita" }),
    ]);
  });

  it("E5-W02 round 2 · review #5: without a grid the band's last half hour can be taken (13:30–14:00)", async () => {
    const requests = recordRequests();
    await openRingBlock("ring-petita", {
      branding: { ...canic, modules: without("FREE_TRAINING") },
      scenario: "trainingModuleOffInstructor",
    });
    const values = (name: string) => {
      const element = screen.getByRole("combobox", { name });
      if (!(element instanceof HTMLSelectElement)) throw new TypeError(`${name} is not a select`);
      return [...element.options]
        .filter((option) => option.value !== "")
        .map((option) => option.textContent);
    };
    fireEvent.change(screen.getByRole("combobox", { name: "Dia" }), {
      target: { value: "2026-08-11" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Franja" }), {
      target: { value: "afternoon" },
    });
    expect(values("De")[0]).toBe("14:00");
    expect(values("De").at(-1)).toBe("23:30");
    fireEvent.change(screen.getByRole("combobox", { name: "De" }), { target: { value: "23:30" } });
    expect(values("A")).toEqual(["24:00"]);
    fireEvent.change(screen.getByRole("combobox", { name: "Franja" }), {
      target: { value: "morning" },
    });
    expect(values("De")[0]).toBe("0:00");
    expect(values("De").at(-1)).toBe("13:30");
    fireEvent.change(screen.getByRole("combobox", { name: "De" }), { target: { value: "13:30" } });
    expect(values("A")).toEqual(["14:00"]);
    expect(screen.getByText(/^Ocupa la pista Petita de 13:30 a 14:00/u)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Bloqueja la pista" }));
    await waitFor(() => {
      expect(requests.bodies.get("/ring-blocks")).toHaveLength(1);
    });
    expect(requests.bodies.get("/ring-blocks")?.[0]).toMatchObject({
      from: "2026-08-11T11:30:00.000Z",
      to: "2026-08-11T12:00:00.000Z",
    });
  });

  it("while the block is sent the button is busy and the grid, kinds and rings are inert", async () => {
    let release: () => void = () => undefined;
    server.use(
      http.post("*/api/v1/ring-blocks", async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return undefined;
      }),
    );
    await openRingBlock();
    await pick("2026-08-06", "afternoon");
    fireEvent.click(cell("18:00, lliure"));
    fireEvent.click(screen.getByRole("button", { name: "Reserva la pista" }));
    // While sending, the button's name also carries its «Enviant» loading label.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Reserva la pista/u })).toHaveAttribute(
        "aria-busy",
        "true",
      );
    });
    expect(cell("20:00, lliure")).toBeDisabled();
    expect(within(group("Tipus")).getByRole("button", { name: "Bloqueig" })).toBeDisabled();
    expect(within(group("Pista")).getByRole("button", { name: "Central" })).toBeDisabled();
    release();
    expect(await screen.findByText("Pista reservada")).toBeVisible();
  });

  it("a time refusal is shown by code (400 INVALID_TIME_RANGE), and a lost answer keeps its key", async () => {
    const requests = recordRequests();
    let calls = 0;
    server.use(
      http.post("*/api/v1/ring-blocks", () => {
        calls += 1;
        if (calls === 1) return HttpResponse.error();
        return HttpResponse.json(
          { code: "INVALID_TIME_RANGE", details: {}, message: "range", traceId: "trace-range" },
          { status: 400 },
        );
      }),
    );
    await openRingBlock();
    await pick("2026-08-06", "afternoon");
    fireEvent.click(cell("18:00, lliure"));
    fireEvent.click(screen.getByRole("button", { name: "Reserva la pista" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Reserva la pista" }));
    expect(await screen.findByText("L'interval horari no és vàlid.")).toBeVisible();
    expect(requests.keys).toHaveLength(2);
    expect(requests.keys[1]).toBe(requests.keys[0]);
  });
});

/** `409 IDEMPOTENCY_KEY_REUSED {reason: IN_PROGRESS}` as the api answers it (CONVENCIONS_API §6, §7). */
const IN_PROGRESS_BODY = {
  code: "IDEMPOTENCY_KEY_REUSED",
  details: { reason: "IN_PROGRESS" },
  message: "The first request with this Idempotency-Key is still in progress",
  traceId: "t-in-progress",
};
/** `common:inProgress` in ca (E80); never `errors:IDEMPOTENCY_KEY_REUSED`'s text. */
const IN_PROGRESS_TEXT = "L'operació encara està en curs. Torna-ho a provar d'aquí a un moment.";

describe("E7-W06 step 1 (CONVENCIONS_API §7, E79, E80): 24's block keeps its key on IN_PROGRESS", () => {
  it("E7-W06 step 1: 24's ring block keeps its Idempotency-Key on IN_PROGRESS, says «L'operació encara està en curs…», the retry sends the same key, and the same block after the api's answer takes a new key", async () => {
    const requests = recordRequests();
    let calls = 0;
    server.use(
      http.post("*/api/v1/ring-blocks", () => {
        calls += 1;
        if (calls === 1) return HttpResponse.json(IN_PROGRESS_BODY, { status: 409 });
        if (calls === 2) {
          return HttpResponse.json(
            { code: "INVALID_TIME_RANGE", details: {}, message: "range", traceId: "trace-range" },
            { status: 400 },
          );
        }
        return undefined;
      }),
    );
    await openRingBlock();
    await pick("2026-08-06", "afternoon");
    fireEvent.click(cell("18:00, lliure"));
    fireEvent.click(screen.getByRole("button", { name: "Reserva la pista" }));
    expect(await screen.findByText(IN_PROGRESS_TEXT)).toBeVisible();
    expect(window.location.pathname).toBe("/instructor/pistes/ring-petita/reservar");
    fireEvent.click(screen.getByRole("button", { name: "Reserva la pista" }));
    expect(await screen.findByText("L'interval horari no és vàlid.")).toBeVisible();
    // The api answered: the same block sent again is a new submission.
    fireEvent.click(screen.getByRole("button", { name: "Reserva la pista" }));
    expect(await screen.findByText("Pista reservada")).toBeVisible();
    await waitFor(() => {
      expect(requests.bodies.get("/ring-blocks")).toHaveLength(3);
    });
    const bodies = requests.bodies.get("/ring-blocks") ?? [];
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
    expect(requests.keys).toHaveLength(3);
    expect(requests.keys[1]).toBe(requests.keys[0]);
    expect(requests.keys[2]).not.toBe(requests.keys[0]);
  });
});
