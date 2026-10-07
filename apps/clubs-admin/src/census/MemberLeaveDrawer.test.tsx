import { createApiClient, type components } from "@agilityhub/api-client";
import { mockScenario, resetMemberBillingState } from "@agilityhub/api-client/mocks";
import brandingFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { MemberLeaveDrawer } from "./MemberLeaveDrawer";

const branding: Branding = { ...brandingFixture, theme: { ...brandingFixture.theme, mode: "dark" } };
const trilingualBranding: Branding = { ...branding, locales: ["ca", "es", "en"] };

beforeAll(() => { server.listen({ onUnhandledRequest: "error" }); });
beforeEach(() => { resetMemberBillingState(); mockScenario("admin"); });
afterEach(() => {
  cleanup(); server.resetHandlers(); resetMemberBillingState(); mockScenario("admin");
});
afterAll(() => { server.close(); });

async function loadMember(): Promise<components["schemas"]["Member"]> {
  const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
  const result = await client.GET("/members/{id}/overview", { params: { path: { id: "member-laura" } } });
  if (result.data === undefined) throw new TypeError("Missing member fixture");
  return result.data.member;
}

async function renderDrawer(member: components["schemas"]["Member"], language = "ca", onChanged = vi.fn(), onErased = vi.fn()) {
  const i18n = await createI18n({ branding: trilingualBranding, browserLanguages: [language], initialNamespaces: ["admin-census", "enums", "errors"], storage: undefined });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={trilingualBranding}>
        <MemberLeaveDrawer client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })} member={member} onChanged={onChanged} onClose={() => undefined} onErased={onErased} open />
      </BrandingProvider>
    </I18nextProvider>,
  );
  return i18n;
}

describe("T-13-31 admin leave lifecycle", () => {
  it("prefills the effective date for a pending request", async () => {
    const member = await loadMember();
    const pending = {
      cancelledBookings: [], comment: "Canvi de ciutat", decision: null, id: "leave-pending", member: { fullName: member.fullName, id: member.id, leaveDate: null, leftAt: null, leftReason: null, memberNumber: member.memberNumber, status: "ACTIVE" }, nps: 8, origin: "APP", packBalanceId: null, reason: "Motius externs", reasonKey: "EXTERNAL", requestedAt: "2026-08-01T10:00:00Z", requestedBy: { accountId: "account-laura", impersonatedMemberId: null }, requestedDate: "2026-08-31", source: "MEMBER", state: "PENDING", version: 1,
    };
    server.use(
      http.get("*/api/v1/leave-requests", () => HttpResponse.json({ appliedFilters: [], items: [pending], page: 0, size: 20, totalItems: 1, totalPages: 1 })),
      http.get("*/api/v1/leave-requests/:id", () => HttpResponse.json(pending)),
    );
    await renderDrawer(member);
    const drawer = await screen.findByRole("dialog", { name: "Baixa (amb data)" });
    expect(await within(drawer).findByDisplayValue("2026-08-31")).toHaveAccessibleName("Data d'efecte");
    expect(within(drawer).getByRole("button", { name: "Aprova" })).toBeVisible();
    expect(within(drawer).getByRole("button", { name: "Denega" })).toBeVisible();
  });

  it("shows planned-leave cancellation only when the member has a planned date", async () => {
    const member = await loadMember();
    await renderDrawer({ ...member, leaveDate: "2026-10-31" });
    expect(await screen.findByRole("button", { name: "Anul·la la baixa prevista" })).toBeVisible();
  });

  it("a left member shows only the reactivation flow", async () => {
    const member = await loadMember();
    await renderDrawer({ ...member, status: "LEFT" });
    const drawer = await screen.findByRole("dialog", { name: "Baixa (amb data)" });
    expect(within(drawer).getByRole("button", { name: "Reactiva l'abonat" })).toBeVisible();
    expect(within(drawer).queryByText("Programa la baixa")).not.toBeInTheDocument();
  });

  it("E8-W03 round 2 #5 confirms direct leave before POST and reports cancelled bookings", async () => {
    const member = await loadMember();
    const writes: unknown[] = [];
    server.use(http.post("*/api/v1/members/:id/leave", async ({ request }) => {
      writes.push(await request.json());
      return HttpResponse.json({ cancelledBookings: [{ id: "64000000-0000-4000-8000-000000000001", sessionDate: "2026-12-01", type: "CLASS" }] }, { status: 201 });
    }));
    await renderDrawer(member);
    const drawer = await screen.findByRole("dialog", { name: "Baixa (amb data)" });
    fireEvent.change(within(drawer).getByLabelText("Data d'efecte"), { target: { value: "2026-11-30" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Programa la baixa" }));
    expect(writes).toHaveLength(0);
    const confirm = screen.getAllByRole("dialog", { name: "Programa la baixa" }).at(-1);
    if (confirm === undefined) throw new TypeError("Missing direct-leave confirmation");
    fireEvent.click(within(confirm).getByRole("button", { name: "Programa la baixa" }));
    await waitFor(() => { expect(writes).toEqual([{ effectiveDate: "2026-11-30" }]); });
    expect(await screen.findByText("S'han anul·lat 1 reserva")).toBeVisible();
  });

  it("E8-W03 round 2 #7 reports detail and reactivation plan-read failures", async () => {
    const member = await loadMember();
    const pending = {
      cancelledBookings: [], comment: null, decision: null, id: "65000000-0000-4000-8000-000000000001", member: { fullName: member.fullName, id: member.id, leaveDate: null, leftAt: null, leftReason: null, memberNumber: member.memberNumber, status: "ACTIVE" }, nps: null, origin: "APP", packBalanceId: null, reason: null, reasonKey: null, requestedAt: "2026-10-01T10:00:00Z", requestedBy: { accountId: "63000000-0000-4000-8000-000000000001", impersonatedMemberId: null }, requestedDate: "2026-11-30", source: "MEMBER", state: "PENDING", version: 1,
    };
    server.use(
      http.get("*/api/v1/leave-requests", () => HttpResponse.json({ appliedFilters: [], items: [pending], page: 0, size: 20, totalItems: 1, totalPages: 1 })),
      http.get("*/api/v1/leave-requests/:id", () => HttpResponse.json({ code: "INTERNAL_ERROR", details: {}, message: "failed", traceId: "test" }, { status: 500 })),
    );
    await renderDrawer(member);
    expect(await screen.findByRole("alert")).toHaveTextContent("S'ha produït un error inesperat");
    cleanup();

    server.resetHandlers();
    mockScenario("admin");
    server.use(http.get("*/api/v1/plans", () => HttpResponse.json({ code: "INTERNAL_ERROR", details: {}, message: "failed", traceId: "test" }, { status: 500 })));
    await renderDrawer({ ...member, status: "LEFT" });
    expect(await screen.findByRole("alert")).toHaveTextContent("S'ha produït un error inesperat");
  });

  it("E8-W03 round 2 #14 offers MEMBER and ADMIN reasons but excludes SYSTEM reasons", async () => {
    const member = await loadMember();
    await renderDrawer(member);
    const reason = await screen.findByLabelText("Motiu (opcional)");
    expect(await within(reason).findByRole("option", { name: "Decisió del club" })).toBeInTheDocument();
    expect(within(reason).queryByRole("option", { name: "Pack caducat" })).not.toBeInTheDocument();
  });

  it("E8-W03 round 2 #12 submits reactivation and formats prices through club money rules", async () => {
    const member = await loadMember();
    const writes: unknown[] = [];
    server.use(http.post("*/api/v1/members/:id/reactivation", async ({ request }) => {
      writes.push(await request.json());
      return HttpResponse.json({ ...member, status: "ACTIVE" });
    }));
    await renderDrawer({ ...member, status: "LEFT", nextInvoiceDate: "2026-11-01" });
    fireEvent.click(await screen.findByRole("button", { name: "Reactiva l'abonat" }));
    const modal = screen.getByRole("dialog", { name: "Reactiva l'abonat" });
    fireEvent.change(within(modal).getByLabelText("Modalitat"), { target: { value: "plan-member" } });
    fireEvent.change(await within(modal).findByLabelText("Tarifa"), { target: { value: "price-member" } });
    expect(within(modal).getByRole("option", { name: /60,00.*€/u })).toBeVisible();
    fireEvent.click(within(modal).getByRole("button", { name: "Reactiva l'abonat" }));
    await waitFor(() => { expect(writes).toEqual([{ nextInvoiceDate: "2026-11-01", planId: "plan-member", priceId: "price-member" }]); });
  });

  it("E8-W03 round 2 #6 makes MEMBER_ERASED terminal and notifies D10", async () => {
    const member = await loadMember();
    const onErased = vi.fn();
    server.use(http.post("*/api/v1/members/:id/leave", () => HttpResponse.json({ code: "MEMBER_ERASED", details: {}, message: "erased", traceId: "test" }, { status: 409 })));
    await renderDrawer(member, "ca", vi.fn(), onErased);
    const drawer = await screen.findByRole("dialog", { name: "Baixa (amb data)" });
    fireEvent.change(await within(drawer).findByLabelText("Data d'efecte"), { target: { value: "2026-11-30" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Programa la baixa" }));
    const confirmation = screen.getAllByRole("dialog", { name: "Programa la baixa" }).at(-1);
    if (confirmation === undefined) throw new TypeError("Missing direct-leave confirmation");
    fireEvent.click(within(confirmation).getByRole("button", { name: "Programa la baixa" }));
    await waitFor(() => { expect(onErased).toHaveBeenCalledTimes(1); });
    expect(within(drawer).getByRole("alert")).toHaveTextContent("Aquest abonat ha estat suprimit");
    expect(within(drawer).queryByRole("button", { name: "Programa la baixa" })).not.toBeInTheDocument();
  });

  it("E8-W03 round 2 #10 persists leave approval into the queue member overview", async () => {
    const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
    const approved = await client.POST("/leave-requests/{id}/decision", {
      body: { decision: "APPROVED", effectiveDate: "2026-11-30" },
      headers: { "Idempotency-Key": "67000000-0000-4000-8000-000000000003" },
      params: { path: { id: "65000000-0000-4000-8000-000000000003" } },
    });
    expect(approved.data).toMatchObject({ cancelledBookings: [{ type: "CLASS" }], state: "APPROVED" });
    const overview = await client.GET("/members/{id}/overview", { params: { path: { id: "member-montse" } } });
    expect(overview.data?.member).toMatchObject({ displayStatus: { kind: "LEAVE_SCHEDULED" }, leaveDate: "2026-11-30" });
  });
});

describe("T-13-32 ca/es/en drawer literals", () => {
  it.each([
    ["ca", "Baixa (amb data)", "Programa la baixa"],
    ["es", "Baja (con fecha)", "Programa la baja"],
    ["en", "Leave (with date)", "Schedule leave"],
  ])("renders %s", async (language, title, action) => {
    const member = await loadMember();
    await renderDrawer(member, language);
    const drawer = await screen.findByRole("dialog", { name: title });
    expect(drawer).toBeVisible();
    expect(screen.getAllByText(action).length).toBeGreaterThan(0);
    await waitFor(() => { expect(within(drawer).queryByRole("status")).not.toBeInTheDocument(); });
    expect(drawer.textContent).toMatchSnapshot(language);
  });
});
