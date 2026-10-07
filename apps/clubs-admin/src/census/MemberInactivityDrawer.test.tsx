import { createApiClient } from "@agilityhub/api-client";
import { mockScenario, resetMemberBillingState } from "@agilityhub/api-client/mocks";
import brandingFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { MemberInactivityDrawer } from "./MemberInactivityDrawer";

const branding: Branding = { ...brandingFixture, theme: { ...brandingFixture.theme, mode: "dark" } };

beforeAll(() => { server.listen({ onUnhandledRequest: "error" }); });
beforeEach(() => {
  resetMemberBillingState();
  mockScenario("admin");
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetMemberBillingState();
  mockScenario("admin");
});
afterAll(() => { server.close(); });

async function renderDrawer(memberId = "member-laura", drawerBranding: Branding = branding, onErased = vi.fn()) {
  const i18n = await createI18n({
    branding: drawerBranding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-census", "enums", "errors"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={drawerBranding}>
        <MemberInactivityDrawer
          client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
          memberId={memberId}
          onChanged={() => undefined}
          onClose={() => undefined}
          onErased={onErased}
          open
        />
      </BrandingProvider>
    </I18nextProvider>,
  );
}

describe("T-13-31 admin inactivity lifecycle", () => {
  it("shows approve and deny only for a requested period", async () => {
    await renderDrawer();
    const drawer = await screen.findByRole("dialog", { name: "Inactivitat" });
    expect(await within(drawer).findByRole("button", { name: "Aprova" })).toBeVisible();
    expect(within(drawer).getByRole("button", { name: "Denega" })).toBeVisible();
    expect(within(drawer).queryByText("Nou període d'inactivitat")).not.toBeInTheDocument();
  });

  it("renders the day-25 override and clears the deadline error when selected", async () => {
    server.use(
      http.get("*/api/v1/inactivity-periods", () =>
        HttpResponse.json({ appliedFilters: [], items: [], page: 0, size: 20, totalItems: 0, totalPages: 0 }),
      ),
      http.post("*/api/v1/inactivity-periods", () =>
        HttpResponse.json(
          { code: "INACTIVITY_DEADLINE_PASSED", details: { earliestMonth: "2026-11" }, message: "deadline", traceId: "test" },
          { status: 422 },
        ),
      ),
    );
    await renderDrawer();
    const drawer = await screen.findByRole("dialog", { name: "Inactivitat" });
    fireEvent.change(await within(drawer).findByLabelText("Mes d'inici"), { target: { value: "2026-10" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Crea i aprova" }));
    expect(await within(drawer).findByText(/primer mes possible és 2026-11/u)).toBeVisible();
    fireEvent.click(within(drawer).getByRole("checkbox", { name: "Salta el termini del dia 25" }));
    expect(within(drawer).queryByText(/primer mes possible/u)).not.toBeInTheDocument();
  });

  it("links an overlap to the existing period", async () => {
    server.use(
      http.get("*/api/v1/inactivity-periods", () =>
        HttpResponse.json({ appliedFilters: [], items: [], page: 0, size: 20, totalItems: 0, totalPages: 0 }),
      ),
      http.post("*/api/v1/inactivity-periods", () =>
        HttpResponse.json(
          { code: "INACTIVITY_OVERLAP", details: { hint: "EXTEND", periodId: "period-existing" }, message: "overlap", traceId: "test" },
          { status: 409 },
        ),
      ),
    );
    await renderDrawer();
    const drawer = await screen.findByRole("dialog", { name: "Inactivitat" });
    fireEvent.change(await within(drawer).findByLabelText("Mes d'inici"), { target: { value: "2026-10" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Crea i aprova" }));
    expect(await within(drawer).findByRole("link", { name: "Obre el període existent" })).toHaveAttribute(
      "href",
      "/inactivitats?period=period-existing",
    );
  });

  it("E8-W03 round 2 #4 follows editable and PATCHes only toMonth for an ACTIVE period", async () => {
    const writes: unknown[] = [];
    server.use(
      http.patch("*/api/v1/inactivity-periods/:id", async ({ request }) => {
        writes.push(await request.json());
        return HttpResponse.json({
          cancelledBookings: [], comments: "Període obert", editable: { cancel: false, fromMonth: false, toMonth: true }, feeSnapshot: null,
          fromMonth: "2026-08", history: [], id: "62000000-0000-4000-8000-000000000002", member: { fullName: "Eva Perez Prunell", id: "61000000-0000-4000-8000-000000000002", memberNumber: 90 },
          origin: "BACKOFFICE", requestedAt: "2026-08-02T09:00:00Z", requestedBy: { accountId: "63000000-0000-4000-8000-000000000001", impersonatedMemberId: null }, state: "ACTIVE", toMonth: "2026-11", version: 2,
        });
      }),
    );
    await renderDrawer("member-eva");
    const drawer = await screen.findByRole("dialog", { name: "Inactivitat" });
    fireEvent.click(await within(drawer).findByRole("button", { name: "Modifica els mesos" }));
    expect(within(drawer).getByLabelText("Mes d'inici")).toBeDisabled();
    expect(within(drawer).getByLabelText("Comentaris")).toBeDisabled();
    fireEvent.change(within(drawer).getByLabelText(/Mes final/u), { target: { value: "2026-11" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Desa" }));
    await waitFor(() => { expect(writes).toEqual([{ toMonth: "2026-11", version: 1 }]); });
  });

  it("E8-W03 round 2 #12 terminates an active period and reports approval cancellations", async () => {
    const terminations: unknown[] = [];
    server.use(
      http.post("*/api/v1/inactivity-periods/:id/termination", async ({ request }) => {
        terminations.push(await request.json());
        return HttpResponse.json({});
      }),
    );
    await renderDrawer("member-eva");
    const drawer = await screen.findByRole("dialog", { name: "Inactivitat" });
    fireEvent.click(await within(drawer).findByRole("button", { name: "Modifica els mesos" }));
    fireEvent.change(await within(drawer).findByLabelText(/Mes final/u), { target: { value: "2026-10" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Finalitza el període" }));
    await waitFor(() => { expect(terminations).toEqual([{ toMonth: "2026-10" }]); });

    cleanup();
    server.use(
      http.post("*/api/v1/inactivity-periods/:id/decision", () => HttpResponse.json({
        cancelledBookings: [
          { id: "64000000-0000-4000-8000-000000000001", sessionDate: "2026-11-03", type: "CLASS" },
          { id: "64000000-0000-4000-8000-000000000002", sessionDate: "2026-11-04", type: "TRAINING" },
        ],
      })),
    );
    await renderDrawer();
    const requested = await screen.findByRole("dialog", { name: "Inactivitat" });
    fireEvent.click(await within(requested).findByRole("button", { name: "Aprova" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Aprova el període" })).getByRole("button", { name: "Aprova" }));
    expect(await screen.findByText("S'han anul·lat 2 reserves")).toBeVisible();
  });

  it("E8-W03 round 2 #12 reports the no-cancellation branch", async () => {
    server.use(
      http.get("*/api/v1/parameters/:key", ({ params }) =>
        HttpResponse.json({ key: params.key, value: params.key === "inactivity.cancelBookingsOnApproval" ? false : 25, version: 1 }),
      ),
      http.post("*/api/v1/inactivity-periods/:id/decision", () => HttpResponse.json({ bookingsInside: 3, cancelledBookings: [] })),
    );
    await renderDrawer();
    const drawer = await screen.findByRole("dialog", { name: "Inactivitat" });
    fireEvent.click(await within(drawer).findByRole("button", { name: "Aprova" }));
    expect(screen.getByText("En aprovar, les reserves que quedin dins del període es mantindran.")).toBeVisible();
    fireEvent.click(within(screen.getByRole("dialog", { name: "Aprova el període" })).getByRole("button", { name: "Aprova" }));
    expect(await screen.findByText("S'han mantingut 3 reserves dins del període.")).toBeVisible();
  });

  it("E8-W03 round 2 #7 shows a detail-read failure instead of stale content", async () => {
    server.use(
      http.get("*/api/v1/inactivity-periods/:id", () => HttpResponse.json({ code: "INTERNAL_ERROR", details: {}, message: "failed", traceId: "test" }, { status: 500 })),
    );
    await renderDrawer();
    expect(await screen.findByRole("alert")).toHaveTextContent("S'ha produït un error inesperat");
    expect(screen.queryByText("Nou període d'inactivitat")).not.toBeInTheDocument();
  });

  it("E8-W03 round 2 #13 gates an empty creation state from the member's pack plan", async () => {
    const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
    const overview = await client.GET("/members/{id}/overview", { params: { path: { id: "member-laura" } } });
    if (overview.data === undefined) throw new TypeError("Missing overview fixture");
    server.use(
      http.get("*/api/v1/inactivity-periods", () => HttpResponse.json({ appliedFilters: [], items: [], page: 0, size: 20, totalItems: 0, totalPages: 0 })),
      http.get("*/api/v1/members/:id/overview", () =>
        HttpResponse.json({ ...overview.data, member: { ...overview.data.member, planId: "plan-pack-10" } }),
      ),
    );
    await renderDrawer();
    expect(await screen.findByText("Les modalitats de pack no poden demanar inactivitat.")).toBeVisible();
    expect(screen.queryByText("Nou període d'inactivitat")).not.toBeInTheDocument();
  });

  it("E8-W03 round 2 #6 makes MEMBER_ERASED terminal and notifies D10", async () => {
    const onErased = vi.fn();
    server.use(http.post("*/api/v1/inactivity-periods/:id/decision", () => HttpResponse.json({ code: "MEMBER_ERASED", details: {}, message: "erased", traceId: "test" }, { status: 409 })));
    await renderDrawer("member-laura", branding, onErased);
    const drawer = await screen.findByRole("dialog", { name: "Inactivitat" });
    fireEvent.click(await within(drawer).findByRole("button", { name: "Aprova" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Aprova el període" })).getByRole("button", { name: "Aprova" }));
    await waitFor(() => { expect(onErased).toHaveBeenCalledTimes(1); });
    expect(within(drawer).getByRole("alert")).toHaveTextContent("Aquest abonat ha estat suprimit");
    expect(within(drawer).queryByRole("button", { name: "Aprova" })).not.toBeInTheDocument();
  });

  it("E8-W03 round 2 #10 keeps approval and future termination stateful in MSW", async () => {
    const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
    const approved = await client.POST("/inactivity-periods/{id}/decision", {
      body: { decision: "APPROVED" },
      headers: { "Idempotency-Key": "67000000-0000-4000-8000-000000000001" },
      params: { path: { id: "62000000-0000-4000-8000-000000000001" } },
    });
    expect(approved.data).toMatchObject({ cancelledBookings: [{ type: "CLASS" }, { type: "TRAINING" }], feeSnapshot: { firstMonth: { amountMinor: 2000 } }, state: "ACTIVE" });
    const overview = await client.GET("/members/{id}/overview", { params: { path: { id: "member-laura" } } });
    expect(overview.data?.member).toMatchObject({ displayStatus: { kind: "INACTIVE_PERIOD" }, status: "INACTIVE" });

    const terminated = await client.POST("/inactivity-periods/{id}/termination", {
      body: { toMonth: "2026-12" },
      headers: { "Idempotency-Key": "67000000-0000-4000-8000-000000000002" },
      params: { path: { id: "62000000-0000-4000-8000-000000000002" } },
    });
    expect(terminated.data).toMatchObject({ finishedAt: null, state: "ACTIVE", toMonth: "2026-12" });

    const created = await client.POST("/inactivity-periods", { body: { fromMonth: "2027-12", memberId: "member-marc" } });
    if (created.data === undefined) throw new TypeError("Missing created inactivity period");
    const cancelled = await client.POST("/inactivity-periods/{id}/cancellation", {
      body: {},
      headers: { "Idempotency-Key": "67000000-0000-4000-8000-000000000004" },
      params: { path: { id: created.data.id } },
    });
    expect(cancelled.data).toMatchObject({ cancelReason: "WITHDRAWN", state: "CANCELLED" });
  });

  it("T-13-32 renders the complete requested-period actions in ca, es and en", async () => {
    const variants = [
      ["ca", "Inactivitat", "Aprova", "Denega"],
      ["es", "Inactividad", "Aprueba", "Deniega"],
      ["en", "Inactivity", "Approve", "Deny"],
    ] as const;
    for (const [language, title, approve, deny] of variants) {
      const i18n = await createI18n({ branding: { ...branding, locales: ["ca", "es", "en"] }, browserLanguages: [language], initialNamespaces: ["admin-census", "enums", "errors"], storage: undefined });
      render(<I18nextProvider i18n={i18n}><BrandingProvider branding={{ ...branding, locales: ["ca", "es", "en"] }}><MemberInactivityDrawer client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })} memberId="member-laura" onChanged={() => undefined} onClose={() => undefined} onErased={vi.fn()} open /></BrandingProvider></I18nextProvider>);
      const drawer = await screen.findByRole("dialog", { name: title });
      expect(await within(drawer).findByRole("button", { name: approve })).toBeVisible();
      expect(within(drawer).getByRole("button", { name: deny })).toBeVisible();
      expect(drawer.textContent).toMatchSnapshot(language);
      cleanup();
    }
  });
});
