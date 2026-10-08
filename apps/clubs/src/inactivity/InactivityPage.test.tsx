import { server } from "@agilityhub/api-client/mocks/server";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { ProfileLifecycleSection } from "../profile/ProfileLifecycleSection";
import { e8Branding, e8Client, renderE8, setupE8World } from "../test/e8";

import { InactivityPage } from "./InactivityPage";

setupE8World();

async function readyAction(name: "ENVIA LA SOL·LICITUD" | "MODIFICA") {
  const action = await screen.findByRole("button", { name });
  await waitFor(() => {
    expect(action).toBeEnabled();
  });
  return action;
}

describe("T-13-29 member inactivity", () => {
  it("E8-W04 step 0c: a cached range stays blocked while its replacement preview is pending", async () => {
    let previewCalls = 0;
    let releaseReplacement: (() => void) | undefined;
    const heldReplacement = new Promise<void>((resolve) => {
      releaseReplacement = resolve;
    });
    server.use(
      http.get("*/api/v1/me/inactivity-periods/preview", async () => {
        previewCalls += 1;
        if (previewCalls > 1) await heldReplacement;
        return HttpResponse.json({
          bookingsInside: { activities: 0, classes: 0, total: 0, trainings: 0, waitlist: 0 },
          earliestMonthViolation: false,
          feeSchedule: [],
        });
      }),
    );

    await renderE8(<InactivityPage client={e8Client()} />);
    const submit = await readyAction("MODIFICA");
    const end = screen.getByLabelText("Mes de finalització (si el saps)");
    fireEvent.change(end, { target: { value: "2026-11" } });
    await waitFor(() => {
      expect(previewCalls).toBe(2);
    });
    fireEvent.change(end, { target: { value: "" } });
    await waitFor(() => {
      expect(previewCalls).toBe(3);
    });
    expect(submit).toBeDisabled();
    releaseReplacement?.();
    await waitFor(() => {
      expect(submit).toBeEnabled();
    });
  });

  it("E8-W04 step 0c: consultation mode hides frozen fees when BILLING is disabled", async () => {
    const billingOffBranding = {
      ...e8Branding,
      modules: e8Branding.modules.filter((module) => module !== "BILLING"),
    };
    await renderE8(<InactivityPage client={e8Client()} />, {
      branding: billingOffBranding,
      scenario: "billingOff",
    });
    await screen.findByLabelText("Mes d'inici (obligatori)");
    expect(screen.queryByText("Quota del 1r mes")).not.toBeInTheDocument();
  });

  it("E8-W05 #2: submission waits through the preview debounce and its current response", async () => {
    let previewStarted = false;
    let releasePreview: (() => void) | undefined;
    const heldPreview = new Promise<void>((resolve) => {
      releasePreview = resolve;
    });
    server.use(
      http.get("*/api/v1/me/inactivity-periods/preview", async () => {
        previewStarted = true;
        await heldPreview;
        return HttpResponse.json({
          bookingsInside: { activities: 0, classes: 0, total: 0, trainings: 0, waitlist: 0 },
          earliestMonthViolation: false,
          feeSchedule: [],
        });
      }),
    );

    await renderE8(<InactivityPage client={e8Client()} />);
    const submit = await screen.findByRole("button", { name: "MODIFICA" });
    expect(submit).toBeDisabled();
    await waitFor(() => {
      expect(previewStarted).toBe(true);
    });
    expect(submit).toBeDisabled();
    releasePreview?.();
    await waitFor(() => {
      expect(submit).toBeEnabled();
    });
  });

  it("E8-W05 #3: consultation mode renders the selected period's frozen fee", async () => {
    server.use(
      http.get("*/api/v1/me/inactivity-periods", () =>
        HttpResponse.json({
          deadlineDay: 25,
          earliestFromMonth: "2026-10",
          fee: {
            firstMonth: { amountMinor: 9900, currency: "EUR" },
            followingMonths: { amountMinor: 8800, currency: "EUR" },
          },
          periods: [
            {
              comments: null,
              editable: { cancel: false, fromMonth: false, toMonth: true },
              fee: {
                firstMonth: { amountMinor: 2000, currency: "EUR" },
                followingMonths: { amountMinor: 1000, currency: "EUR" },
              },
              fromMonth: "2026-10",
              id: "period-frozen-fee",
              state: "ACTIVE",
              toMonth: null,
              version: 4,
            },
          ],
          proposedFromMonth: "2026-11",
        }),
      ),
    );

    await renderE8(<InactivityPage client={e8Client()} />);
    const fee = (await screen.findByText("Quota del 1r mes")).closest(".lifecycle-fee");
    expect(fee).toHaveTextContent("20,00 €");
    expect(fee).toHaveTextContent("10,00 €/mes");
    expect(fee).not.toHaveTextContent("99,00 €");
    expect(fee).not.toHaveTextContent("88,00 €/mes");
  });

  it("renders consultation mode, the proposed open end, fee and debounced booking warning", async () => {
    await renderE8(<InactivityPage client={e8Client()} />);
    const start = await screen.findByLabelText("Mes d'inici (obligatori)");
    expect(start).toHaveValue("2026-10");
    expect(screen.getByLabelText("Mes de finalització (si el saps)")).toHaveValue("");
    expect(screen.getByRole("checkbox", { name: "— encara no ho sé" })).toBeChecked();
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
    fireEvent.click(await readyAction("ENVIA LA SOL·LICITUD"));
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
    fireEvent.change(end, { target: { value: "2026-11" } });
    expect(await screen.findByText(/Ara tens 1 reserva dins del període/u)).toBeVisible();
    fireEvent.change(end, { target: { value: "2026-12" } });
    expect(await screen.findByText(/Ara tens 2 reserves dins del període/u)).toBeVisible();
    fireEvent.change(end, { target: { value: "" } });
    await waitFor(() => {
      expect(screen.queryByText(/Ara tens/u)).not.toBeInTheDocument();
    });
  });

  it("offers future ends for a historical open ACTIVE period and beyond a long fixed end", async () => {
    let patchBody: unknown;
    server.use(
      http.get("*/api/v1/me/inactivity-periods", () =>
        HttpResponse.json({
          deadlineDay: 25,
          earliestFromMonth: "2026-10",
          fee: null,
          periods: [
            {
              comments: null,
              editable: { cancel: false, fromMonth: false, toMonth: true },
              fee: null,
              fromMonth: "2025-08",
              id: "period-historical-open",
              state: "ACTIVE",
              toMonth: null,
              version: 7,
            },
          ],
          proposedFromMonth: "2026-10",
        }),
      ),
      http.patch("*/api/v1/me/inactivity-periods/:id", async ({ request }) => {
        patchBody = await request.json();
        return HttpResponse.json({
          comments: null,
          editable: { cancel: false, fromMonth: false, toMonth: true },
          fee: null,
          fromMonth: "2025-08",
          id: "period-historical-open",
          state: "ACTIVE",
          toMonth: "2035-01",
          version: 8,
        });
      }),
    );
    await renderE8(<InactivityPage client={e8Client()} navigate={() => undefined} />);
    const openEnd = await screen.findByLabelText("Mes de finalització (si el saps)");
    fireEvent.change(openEnd, { target: { value: "2035-01" } });
    expect(openEnd).toHaveValue("2035-01");
    fireEvent.click(await readyAction("MODIFICA"));
    await waitFor(() => {
      expect(patchBody).toEqual({ toMonth: "2035-01", version: 7 });
    });
  });

  it("loads and links to the conflicting live period after INACTIVITY_OVERLAP", async () => {
    let reads = 0;
    let patchedId: string | undefined;
    const older = {
      comments: "Període anterior",
      editable: { cancel: true, fromMonth: true, toMonth: true },
      fee: null,
      fromMonth: "2026-10",
      id: "period-older",
      state: "APPROVED" as const,
      toMonth: "2026-10",
      version: 2,
    };
    const conflict = {
      comments: "Període existent",
      editable: { cancel: true, fromMonth: true, toMonth: true },
      fee: null,
      fromMonth: "2026-11",
      id: "period-conflict",
      state: "REQUESTED" as const,
      toMonth: null,
      version: 3,
    };
    server.use(
      http.get("*/api/v1/me/inactivity-periods", () => {
        reads += 1;
        return HttpResponse.json({
          deadlineDay: 25,
          earliestFromMonth: "2026-10",
          fee: null,
          periods: reads === 1 ? [] : [older, conflict],
          proposedFromMonth: "2026-10",
        });
      }),
      http.post("*/api/v1/me/inactivity-periods", () =>
        HttpResponse.json(
          {
            code: "INACTIVITY_OVERLAP",
            details: { hint: "EXTEND", periodId: conflict.id },
            message: "INACTIVITY_OVERLAP",
            traceId: "overlap-test",
          },
          { status: 409 },
        ),
      ),
      http.patch("*/api/v1/me/inactivity-periods/:id", ({ params }) => {
        patchedId = String(params.id);
        return HttpResponse.json({ ...conflict, version: 4 });
      }),
    );
    await renderE8(<InactivityPage client={e8Client()} navigate={() => undefined} />);
    fireEvent.click(await readyAction("ENVIA LA SOL·LICITUD"));
    const overlap = await screen.findByRole("link", { name: /Ja tens un període demanat/u });
    expect(overlap).toHaveAttribute(
      "href",
      "/inactivitat?periodId=period-conflict",
    );
    expect(await screen.findByRole("button", { name: "MODIFICA" })).toBeVisible();
    expect(screen.getByLabelText("Mes d'inici (obligatori)")).toHaveValue("2026-11");
    fireEvent.click(await readyAction("MODIFICA"));
    await waitFor(() => {
      expect(patchedId).toBe("period-conflict");
    });
  });

  it("clears an end month overtaken by a changed start and submits an open end", async () => {
    let posted: unknown;
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
      http.post("*/api/v1/me/inactivity-periods", async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json(
          {
            comments: null,
            editable: { cancel: true, fromMonth: true, toMonth: true },
            fee: null,
            fromMonth: "2026-12",
            id: "period-new",
            state: "REQUESTED",
            toMonth: null,
            version: 1,
          },
          { status: 201 },
        );
      }),
    );
    await renderE8(<InactivityPage client={e8Client()} navigate={() => undefined} />);
    const start = await screen.findByLabelText("Mes d'inici (obligatori)");
    const end = screen.getByLabelText("Mes de finalització (si el saps)");
    fireEvent.change(end, { target: { value: "2026-11" } });
    fireEvent.change(start, { target: { value: "2026-12" } });
    expect(end).toHaveValue("");
    fireEvent.click(await readyAction("ENVIA LA SOL·LICITUD"));
    await waitFor(() => {
      expect(posted).toMatchObject({ fromMonth: "2026-12", toMonth: null });
    });
  });

  it("clears an old booking warning and reports a failed replacement preview", async () => {
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
        return end === "2026-12"
          ? HttpResponse.json(
              { code: "INTERNAL_ERROR", details: {}, message: "failed", traceId: "preview" },
              { status: 500 },
            )
          : HttpResponse.json({
              bookingsInside: { activities: 0, classes: 1, total: 1, trainings: 0, waitlist: 0 },
              earliestMonthViolation: false,
              feeSchedule: [],
            });
      }),
    );
    await renderE8(<InactivityPage client={e8Client()} />);
    const end = await screen.findByLabelText("Mes de finalització (si el saps)");
    expect(await screen.findByText(/Ara tens 1 reserva dins del període/u)).toBeVisible();
    fireEvent.change(end, { target: { value: "2026-12" } });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No s'ha pogut carregar el període d'inactivitat.",
    );
    expect(screen.getByRole("button", { name: "Torna-ho a provar" })).toBeVisible();
    expect(screen.getByRole("button", { name: "ENVIA LA SOL·LICITUD" })).toBeDisabled();
    expect(screen.queryByText(/Ara tens 1 reserva dins del període/u)).not.toBeInTheDocument();
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
    fireEvent.click(await readyAction("MODIFICA"));
    await waitFor(() => {
      expect(patchBody).toEqual({ toMonth: "2027-11", version: 7 });
    });
  });

  it("after 409 STALE_VERSION keeps only the member's own edit on top of the new version", async () => {
    const fee = {
      firstMonth: { amountMinor: 2000, currency: "EUR" },
      followingMonths: { amountMinor: 1000, currency: "EUR" },
    };
    const period = (version: number, fromMonth: string, comments: string) => ({
      comments,
      editable: { cancel: true, fromMonth: true, toMonth: true },
      fee,
      fromMonth,
      id: "52000000-0000-4000-8000-000000000001",
      state: "REQUESTED",
      toMonth: null,
      version,
    });
    let current = period(1, "2026-10", "Descans de la Duna");
    const bodies: unknown[] = [];
    server.use(
      http.get("*/api/v1/me/inactivity-periods", () =>
        HttpResponse.json({
          deadlineDay: 25,
          earliestFromMonth: "2026-10",
          fee,
          periods: [current],
          proposedFromMonth: "2026-10",
        }),
      ),
      http.patch("*/api/v1/me/inactivity-periods/:id", async ({ request }) => {
        const body = (await request.json()) as { version: number };
        bodies.push(body);
        if (body.version !== current.version) {
          return HttpResponse.json(
            { code: "STALE_VERSION", details: {}, message: "STALE_VERSION", traceId: "t" },
            { status: 409 },
          );
        }
        return HttpResponse.json({ ...current, toMonth: "2027-01", version: 3 });
      }),
    );
    await renderE8(<InactivityPage client={e8Client()} navigate={() => undefined} />);
    const end = await screen.findByLabelText("Mes de finalització (si el saps)");
    fireEvent.change(end, { target: { value: "2027-01" } });
    // Meanwhile the club changed the start and the comments: version 2.
    current = period(2, "2026-11", "Canvi del club");
    fireEvent.click(await readyAction("MODIFICA"));
    expect(await screen.findByText("El període ha canviat.")).toBeVisible();
    await waitFor(() => {
      expect(screen.getByLabelText("Mes d'inici (obligatori)")).toHaveValue("2026-11");
    });
    expect(screen.getByLabelText("Comentaris")).toHaveValue("Canvi del club");
    expect(screen.getByLabelText("Mes de finalització (si el saps)")).toHaveValue("2027-01");
    fireEvent.click(await readyAction("MODIFICA"));
    await waitFor(() => {
      expect(bodies).toHaveLength(2);
    });
    expect(bodies).toEqual([
      { toMonth: "2027-01", version: 1 },
      { toMonth: "2027-01", version: 2 },
    ]);
  });

  it("keeps a newly created period for the return-to-profile subtitle", async () => {
    const navigate = vi.fn();
    const view = await renderE8(<InactivityPage client={e8Client()} navigate={navigate} />, {
      scenario: "memberNoInactivity",
    });
    fireEvent.click(await readyAction("ENVIA LA SOL·LICITUD"));
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
