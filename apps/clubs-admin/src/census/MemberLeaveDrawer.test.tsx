import { createApiClient, type components } from "@agilityhub/api-client";
import { mockScenario, resetMemberBillingState } from "@agilityhub/api-client/mocks";
import brandingFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, render, screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

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

async function renderDrawer(member: components["schemas"]["Member"], language = "ca") {
  const i18n = await createI18n({ branding: trilingualBranding, browserLanguages: [language], initialNamespaces: ["admin-census", "enums", "errors"], storage: undefined });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={trilingualBranding}>
        <MemberLeaveDrawer client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })} member={member} onChanged={() => undefined} onClose={() => undefined} open />
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
});

describe("T-13-32 ca/es/en drawer literals", () => {
  it.each([
    ["ca", "Baixa (amb data)", "Programa la baixa"],
    ["es", "Baja (con fecha)", "Programa la baja"],
    ["en", "Leave (with date)", "Schedule leave"],
  ])("renders %s", async (language, title, action) => {
    const member = await loadMember();
    await renderDrawer(member, language);
    expect(await screen.findByRole("dialog", { name: title })).toBeVisible();
    expect(screen.getAllByText(action).length).toBeGreaterThan(0);
  });
});
