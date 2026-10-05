import { server } from "@agilityhub/api-client/mocks/server";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { e8Client, renderE8, setupE8World } from "../test/e8";

import { InactivityPage } from "./InactivityPage";

setupE8World();

describe("T-13-29 member inactivity", () => {
  it("renders consultation mode, the proposed open end, fee and debounced booking warning", async () => {
    await renderE8(<InactivityPage client={e8Client()} />);
    const start = await screen.findByLabelText("Mes d'inici (obligatori)");
    expect(start).toHaveValue("2026-10");
    expect(screen.getByLabelText("Mes de finalització (si el saps)")).toHaveValue("");
    expect(screen.getByRole("option", { name: "— encara no ho sé" })).toBeVisible();
    expect(screen.getByText(/Quota del 1r mes/u)).toHaveTextContent("20,00 €");
    expect(screen.getByRole("button", { name: "MODIFICA" })).toBeVisible();
    expect(screen.getByRole("button", { name: "RETIRA LA SOL·LICITUD" })).toBeVisible();
    expect(await screen.findByText(/Ara tens 1 reserva dins del període/u)).toBeVisible();
  });

  it("shows the API earliest month for INACTIVITY_DEADLINE_PASSED", async () => {
    server.use(
      http.get("*/api/v1/me/inactivity-periods", () =>
        HttpResponse.json({
          deadlineDay: 25,
          earliestFromMonth: "2026-10",
          fee: null,
          periods: [],
          proposedFromMonth: "2026-10",
        }),
      ),
    );
    await renderE8(<InactivityPage client={e8Client()} />, { scenario: "memberDeadlinePassed" });
    fireEvent.click(await screen.findByRole("button", { name: "ENVIA LA SOL·LICITUD" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ja ha passat el dia 25: el primer mes que pots demanar és Novembre 2026.",
    );
  });

  it("does not render the fee card when the context has no fee", async () => {
    server.use(
      http.get("*/api/v1/me/inactivity-periods", () =>
        HttpResponse.json({
          deadlineDay: 25,
          earliestFromMonth: "2026-10",
          fee: null,
          periods: [],
          proposedFromMonth: "2026-10",
        }),
      ),
    );
    await renderE8(<InactivityPage client={e8Client()} />);
    await screen.findByLabelText("Mes d'inici (obligatori)");
    expect(screen.queryByText(/Quota del 1r mes/u)).not.toBeInTheDocument();
  });

  it("keeps the 14 literals complete in ca, es and en", async () => {
    for (const locale of ["ca", "es", "en"] as const) {
      const view = await renderE8(<InactivityPage client={e8Client(locale)} />, { locale });
      await waitFor(() => {
        expect(view.container.querySelector("form")).not.toBeNull();
        expect(view.container.textContent).not.toContain("inactivity:");
      });
      expect(view.container.textContent).toMatchSnapshot(locale);
      view.unmount();
    }
  });
});
