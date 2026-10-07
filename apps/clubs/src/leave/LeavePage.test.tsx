import { server } from "@agilityhub/api-client/mocks/server";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { e8Branding, e8Client, renderE8, setupE8World } from "../test/e8";

import { LeavePage } from "./LeavePage";

setupE8World();

describe("T-13-30 member leave", () => {
  it("renders the inactivity offer, API reason catalog, NPS 0–10 and full-month help", async () => {
    await renderE8(<LeavePage client={e8Client()} />);
    expect(await screen.findByText(/mantenir la teva entrada vigent/u)).toBeVisible();
    expect(screen.getByRole("link", { name: "VULL DEMANAR INACTIVITAT" })).toHaveAttribute(
      "href",
      "/inactivitat",
    );
    expect(screen.getByText("Avui, 11 d’agost del 2026")).toBeVisible();
    expect(screen.getByRole("option", { name: "Ja he après tot el que volia" })).toBeVisible();
    const group = screen.getByRole("group", {
      name: "De 0 a 10, amb quina probabilitat ens recomanaries?",
    });
    expect(within(group).getAllByRole("button")).toHaveLength(11);
    expect(screen.getByText(/aquell mes es cobrarà íntegrament/u)).toBeVisible();
  });

  it("sends the selected catalog reason and shows the review footer", async () => {
    await renderE8(<LeavePage client={e8Client()} />);
    fireEvent.change(await screen.findByLabelText("Motiu"), { target: { value: "NO_TIME" } });
    fireEvent.click(screen.getByRole("button", { name: "ENVIA LA SOL·LICITUD" }));
    const back = await screen.findByRole("button", { name: "Torna al perfil" });
    expect(back.closest(".leave-sent")).toHaveTextContent(
      "El club la revisarà i et confirmarà la data d'efecte.",
    );
  });

  it("withdraws a pending request and returns to the profile", async () => {
    const first = await renderE8(<LeavePage client={e8Client()} />);
    fireEvent.change(await screen.findByLabelText("Motiu"), { target: { value: "NO_TIME" } });
    fireEvent.click(screen.getByRole("button", { name: "ENVIA LA SOL·LICITUD" }));
    await screen.findByRole("button", { name: "Torna al perfil" });
    first.unmount();

    const navigate = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await renderE8(<LeavePage client={e8Client()} navigate={navigate} />);
    fireEvent.click(await screen.findByRole("button", { name: "RETIRA LA SOL·LICITUD" }));
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/perfil");
    });
  });

  it("renders a planned leave read-only", async () => {
    await renderE8(<LeavePage client={e8Client()} />, { scenario: "memberPlannedLeave" });
    expect(await screen.findByText(/Tens la baixa prevista el/u)).toBeVisible();
    expect(screen.queryByRole("button", { name: "ENVIA LA SOL·LICITUD" })).not.toBeInTheDocument();
  });

  it("shows a pending request's own future date and disables the field", async () => {
    server.use(
      http.get("*/api/v1/me/leave-requests", () =>
        HttpResponse.json({
          defaultDate: "2026-08-11",
          fee: null,
          fullMonthIfLater: false,
          npsEnabled: false,
          offerInactivity: false,
          plannedLeave: null,
          reasons: [{ key: "NO_TIME", label: "No trobo temps per anar-hi" }],
          requests: [
            {
              comment: null,
              id: "leave-pending",
              nps: null,
              reasonKey: "NO_TIME",
              requestedDate: "2026-09-30",
              state: "PENDING",
            },
          ],
        }),
      ),
    );
    await renderE8(<LeavePage client={e8Client()} />);
    expect(await screen.findByLabelText("Data en què vols la baixa")).toHaveValue("2026-09-30");
    expect(screen.getByLabelText("Data en què vols la baixa")).toBeDisabled();
  });

  it("hides the offer, NPS and full-month help when their API flags are disabled", async () => {
    server.use(
      http.get("*/api/v1/me/leave-requests", () =>
        HttpResponse.json({
          defaultDate: "2026-08-11",
          fee: null,
          fullMonthIfLater: false,
          npsEnabled: false,
          offerInactivity: false,
          plannedLeave: null,
          reasons: [{ key: "OTHER", label: "Altres" }],
          requests: [],
        }),
      ),
    );
    await renderE8(<LeavePage client={e8Client()} />);
    await screen.findByLabelText("Data en què vols la baixa");
    expect(
      screen.queryByRole("link", { name: "VULL DEMANAR INACTIVITAT" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/aquell mes es cobrarà íntegrament/u)).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /probabilitat/u })).not.toBeInTheDocument();
  });

  it("formats the API's club-local today for Madrid and Buenos Aires", async () => {
    const contexts = [
      { date: "2026-08-11", text: "Avui, 11 d’agost del 2026", timeZone: "Europe/Madrid" },
      {
        date: "2026-08-10",
        text: "Avui, 10 d’agost del 2026",
        timeZone: "America/Argentina/Buenos_Aires",
      },
    ] as const;
    for (const item of contexts) {
      server.use(
        http.get("*/api/v1/me/leave-requests", () =>
          HttpResponse.json({
            defaultDate: item.date,
            fee: null,
            fullMonthIfLater: false,
            npsEnabled: false,
            offerInactivity: false,
            plannedLeave: null,
            reasons: [{ key: "OTHER", label: "Altres" }],
            requests: [],
          }),
        ),
      );
      const view = await renderE8(<LeavePage client={e8Client()} />, {
        branding: { ...e8Branding, timeZone: item.timeZone },
      });
      expect(await screen.findByText(item.text)).toBeVisible();
      view.unmount();
    }
  });

  it("keeps the 15 literals complete in ca, es and en", async () => {
    for (const locale of ["ca", "es", "en"] as const) {
      const view = await renderE8(<LeavePage client={e8Client(locale)} />, { locale });
      await waitFor(() => {
        expect(view.container.querySelector("form")).not.toBeNull();
        expect(view.container.textContent).not.toContain("leave:");
      });
      expect(view.container.textContent).toMatchSnapshot(locale);
      view.unmount();
    }
  });
});
