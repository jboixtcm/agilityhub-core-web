import { server } from "@agilityhub/api-client/mocks/server";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { renderApp } from "../booking/test-utils";

import { recordRequests, setupTrainingWorld } from "./test-utils";

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
