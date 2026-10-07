import { server } from "@agilityhub/api-client/mocks/server";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { ProfileLifecycleSection } from "../profile/ProfileLifecycleSection";
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
    expect(screen.getByText(/Quota del 1r mes/u).closest(".lifecycle-fee")).toHaveTextContent(
      "20,00 €",
    );
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

  it("covers zero, singular and plural booking previews after the selected months change", async () => {
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
      http.get("*/api/v1/me/inactivity-periods/preview", ({ request }) => {
        const end = new URL(request.url).searchParams.get("toMonth");
        const total = end === "2026-11" ? 1 : end === "2026-12" ? 2 : 0;
        return HttpResponse.json({
          bookingsInside: { activities: 0, classes: total, total, trainings: 0, waitlist: 0 },
          earliestMonthViolation: false,
          feeSchedule: [],
        });
      }),
    );
    await renderE8(<InactivityPage client={e8Client()} />);
    const end = await screen.findByLabelText("Mes de finalització (si el saps)");
    await waitFor(() => {
      expect(screen.queryByText(/Ara tens/u)).not.toBeInTheDocument();
    });
    fireEvent.change(end, { target: { value: "2026-11" } });
    expect(await screen.findByText(/Ara tens 1 reserva dins del període/u)).toBeVisible();
    fireEvent.change(end, { target: { value: "2026-12" } });
    expect(await screen.findByText(/Ara tens 2 reserves dins del període/u)).toBeVisible();
  });

  it("renders a historical ACTIVE period and patches only its changed editable end", async () => {
    let patchBody: unknown;
    server.use(
      http.get("*/api/v1/me/inactivity-periods", () =>
        HttpResponse.json({
          deadlineDay: 25,
          earliestFromMonth: "2026-10",
          fee: null,
          periods: [
            {
              comments: "Període històric",
              editable: { cancel: false, fromMonth: false, toMonth: true },
              fee: null,
              fromMonth: "2025-08",
              id: "period-historical",
              state: "ACTIVE",
              toMonth: "2027-12",
              version: 7,
            },
          ],
          proposedFromMonth: "2026-10",
        }),
      ),
      http.patch("*/api/v1/me/inactivity-periods/:id", async ({ request }) => {
        patchBody = await request.json();
        return HttpResponse.json({
          comments: "Període històric",
          editable: { cancel: false, fromMonth: false, toMonth: true },
          fee: null,
          fromMonth: "2025-08",
          id: "period-historical",
          state: "ACTIVE",
          toMonth: "2027-11",
          version: 8,
        });
      }),
    );
    await renderE8(<InactivityPage client={e8Client()} navigate={() => undefined} />);
    expect(await screen.findByLabelText("Mes d'inici (obligatori)")).toHaveValue("2025-08");
    const end = screen.getByLabelText("Mes de finalització (si el saps)");
    expect(end).toHaveValue("2027-12");
    expect(screen.getByLabelText("Comentaris")).toBeDisabled();
    fireEvent.change(end, { target: { value: "2027-11" } });
    fireEvent.click(screen.getByRole("button", { name: "MODIFICA" }));
    await waitFor(() => {
      expect(patchBody).toEqual({ toMonth: "2027-11", version: 7 });
    });
  });

  it("keeps a newly created period for the return-to-profile subtitle", async () => {
    const navigate = vi.fn();
    const view = await renderE8(<InactivityPage client={e8Client()} navigate={navigate} />, {
      scenario: "memberNoInactivity",
    });
    fireEvent.click(await screen.findByRole("button", { name: "ENVIA LA SOL·LICITUD" }));
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/perfil");
    });
    view.unmount();
    await renderE8(
      <ProfileLifecycleSection
        client={e8Client()}
        logoutDisabled={false}
        onLogout={() => undefined}
      />,
    );
    expect(
      await screen.findByRole("link", { name: /pendent d'aprovació/u }),
    ).toBeVisible();
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
