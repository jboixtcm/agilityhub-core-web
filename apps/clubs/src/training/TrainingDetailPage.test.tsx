import { server } from "@agilityhub/api-client/mocks/server";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { renderApp } from "../booking/test-utils";

import { recordRequests, setupTrainingWorld, TRAINING_NOW } from "./test-utils";

setupTrainingWorld();

async function openDetail(id: string, locale: "ca" | "en" | "es" = "ca") {
  await renderApp(`/entrenaments/${id}`, { locale });
  return screen.findByText(/^(Entrenament|Training|Entrenamiento) · /u);
}

describe("S09 training booking detail (/entrenaments/:id, the 07 pattern, R-09-10)", () => {
  it("a future booking: title, state, line, who booked it, and the cancellation back to 03", async () => {
    const requests = recordRequests();
    await openDetail("training-rock-tue4");
    const card = screen.getByText("Entrenament · amb Rock").closest(".detail-card");
    expect(card).not.toBeNull();
    const detail = within(card as HTMLElement);
    expect(detail.getByText("confirmada")).toBeVisible();
    expect(detail.getByText("Dimarts 4 · 8:00–8:30 · Muntanya")).toBeVisible();
    expect(detail.getByText("Reservada el dissabte 01/08 a les 10:12")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "ANUL·LA LA RESERVA" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Vols anul·lar la reserva d'aquest entrenament?",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "ANUL·LA" }));
    await waitFor(() => {
      expect(window.location.pathname).toBe("/inici");
    });
    expect(await screen.findByText("Entrenament anul·lat")).toBeVisible();
    expect(requests.list).toContain("POST /training-bookings/training-rock-tue4/cancellation");
    // 03 no longer lists it.
    await screen.findByRole("heading", { name: "Les meves reserves" });
    await waitFor(() => {
      expect(screen.queryByText(/Dimarts 4 · 8:00–8:30/u)).not.toBeInTheDocument();
    });
  });

  it("past cancellableUntil the button gives way to the notice; «Reservada pel club» for BACKOFFICE", async () => {
    await openDetail("training-rock-mon3");
    expect(screen.getByText("confirmada")).toBeVisible();
    expect(screen.getByText("Reservada pel club el diumenge 02/08 a les 20:05")).toBeVisible();
    expect(screen.queryByRole("button", { name: "ANUL·LA LA RESERVA" })).not.toBeInTheDocument();
    expect(
      screen.getByText("Ja no es pot anul·lar des de l'app: posa't en contacte amb el club."),
    ).toBeVisible();
  });

  it("cancelled by the club: its state, and nothing to do", async () => {
    await openDetail("training-rock-club");
    expect(screen.getByText("cancel·lada pel club")).toBeVisible();
    expect(screen.queryByRole("button", { name: "ANUL·LA LA RESERVA" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Ja no es pot anul·lar/u)).not.toBeInTheDocument();
  });

  it("422 TRAINING_CANCEL_TOO_LATE: the threshold and the minutes left, from the details, in the dialog", async () => {
    server.use(
      http.post("*/api/v1/training-bookings/:id/cancellation", () =>
        HttpResponse.json(
          {
            code: "TRAINING_CANCEL_TOO_LATE",
            details: { minutesBefore: 95, thresholdMinutes: 120 },
            message: "Too late to cancel",
            traceId: "trace-too-late",
          },
          { status: 422 },
        ),
      ),
    );
    const requests = recordRequests();
    await openDetail("training-rock-tue4");
    fireEvent.click(screen.getByRole("button", { name: "ANUL·LA LA RESERVA" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "ANUL·LA" }));
    expect(
      await within(dialog).findByText(
        "Només es pot anul·lar fins a 2 hores abans de començar, i en falten 95 minuts.",
      ),
    ).toBeVisible();
    // The booking is read again.
    await waitFor(() => {
      expect(
        requests.list.filter((line) => line === "GET /training-bookings/training-rock-tue4"),
      ).toHaveLength(2);
    });
  });

  it("409 INVALID_STATE: the message and the booking read again (cancelled elsewhere)", async () => {
    await openDetail("training-rock-tue4");
    // Cancelled from another device meanwhile.
    await fetch(
      `${window.location.origin}/api/v1/training-bookings/training-rock-tue4/cancellation`,
      {
        body: "{}",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "ANUL·LA LA RESERVA" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "ANUL·LA" }));
    expect(
      await within(dialog).findByText(
        "Aquest element no està en un estat vàlid per a aquesta operació.",
      ),
    ).toBeVisible();
    expect(await screen.findByText("anul·lada")).toBeVisible();
  });

  it("es and en: the same page in the reader's language", async () => {
    await openDetail("training-rock-tue4", "es");
    expect(screen.getByText("Entrenamiento · con Rock")).toBeVisible();
    expect(screen.getByText("confirmada")).toBeVisible();
  });
});

describe("E7-W07 step 4 (CONVENCIONS_API §7, E74, E80, E85): the training cancellation follows the shared submission-key rule", () => {
  it("T-09-25 E7-W07 step 4 (CONVENCIONS_API §7, E85): [ANUL·LA] sends an Idempotency-Key, keeps it through IN_PROGRESS («L'operació encara està en curs…») and a 503 with the api's body, and a 422 TRAINING_CANCEL_TOO_LATE retires it, so the same cancellation sent again takes a new key", async () => {
    const sent: { body: unknown; key: string | null }[] = [];
    server.use(
      http.post("*/api/v1/training-bookings/:id/cancellation", async ({ request }) => {
        sent.push({
          body: await request.clone().json(),
          key: request.headers.get("Idempotency-Key"),
        });
        if (sent.length === 1) {
          return HttpResponse.json(
            {
              code: "IDEMPOTENCY_KEY_REUSED",
              details: { reason: "IN_PROGRESS" },
              message: "The first request with this Idempotency-Key is still in progress",
              traceId: "t-in-progress",
            },
            { status: 409 },
          );
        }
        if (sent.length === 2) {
          return HttpResponse.json(
            { code: "INTERNAL_ERROR", details: {}, message: "Unexpected error", traceId: "t-503" },
            { status: 503 },
          );
        }
        if (sent.length === 3) {
          return HttpResponse.json(
            {
              code: "TRAINING_CANCEL_TOO_LATE",
              details: { minutesBefore: 95, thresholdMinutes: 120 },
              message: "Too late to cancel",
              traceId: "t-422",
            },
            { status: 422 },
          );
        }
        return undefined;
      }),
    );
    await openDetail("training-rock-tue4");
    fireEvent.click(screen.getByRole("button", { name: "ANUL·LA LA RESERVA" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Vols anul·lar la reserva d'aquest entrenament?",
    });
    const press = async () => {
      const confirm = within(dialog).getByRole("button", { name: "ANUL·LA" });
      await waitFor(() => {
        expect(confirm).toBeEnabled();
      });
      fireEvent.click(confirm);
    };
    await press();
    expect(
      await within(dialog).findByText(
        "L'operació encara està en curs. Torna-ho a provar d'aquí a un moment.",
      ),
    ).toBeVisible();
    await press();
    expect(
      await within(dialog).findByText(
        "S'ha produït un error inesperat. Torneu-ho a provar; si persisteix, indiqueu el codi de referència al club.",
      ),
    ).toBeVisible();
    await press();
    expect(
      await within(dialog).findByText(
        "Només es pot anul·lar fins a 2 hores abans de començar, i en falten 95 minuts.",
      ),
    ).toBeVisible();
    // The api answered (a 4xx with its body): the same cancellation sent again is a new one.
    await press();
    await waitFor(() => {
      expect(window.location.pathname).toBe("/inici");
    });
    expect(sent).toHaveLength(4);
    expect(new Set(sent.map((request) => JSON.stringify(request.body))).size).toBe(1);
    expect(sent[0]?.key).toMatch(/^[0-9a-f-]{36}$/u);
    expect(sent[1]?.key).toBe(sent[0]?.key);
    expect(sent[2]?.key).toBe(sent[0]?.key);
    expect(sent[3]?.key).not.toBe(sent[0]?.key);
  });
});

describe("E5-W05 step 13: the detail reaches DONE (E5-W02 round-2 review #3, S09 §5)", () => {
  it("E5-W05 step 13: with a controlled clock the booking reads «fet» after its endsAt, without a remount", async () => {
    // A controlled clock: the page's timers fire exactly at the instant they were set for.
    vi.useRealTimers();
    vi.useFakeTimers({
      now: TRAINING_NOW,
      shouldAdvanceTime: true,
      toFake: ["Date", "setTimeout", "clearTimeout"],
    });
    // Monday 3, Muntanya 7:00–7:30 (`endsAt` 05:30Z); the clock is at 7:10.
    await openDetail("training-rock-mon3");
    const title = screen.getByText("Entrenament · amb Rock");
    expect(screen.getByText("confirmada")).toBeVisible();
    const endsAt = Date.parse("2026-08-03T05:30:00Z");
    expect(Date.now()).toBeLessThan(endsAt);

    // The clock reaches the end, then a minute more: the same page, now «fet».
    await act(async () => {
      await vi.advanceTimersByTimeAsync(endsAt - Date.now());
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(Date.now()).toBeGreaterThan(endsAt);
    expect(screen.getByText("fet")).toBeVisible();
    expect(screen.queryByText("confirmada")).not.toBeInTheDocument();
    // A past booking offers nothing: neither the button nor the too-late notice.
    expect(screen.queryByRole("button", { name: "ANUL·LA LA RESERVA" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Ja no es pot anul·lar/u)).not.toBeInTheDocument();
    // Not remounted: the title is the node that was on screen before.
    expect(screen.getByText("Entrenament · amb Rock")).toBe(title);
  });
});
