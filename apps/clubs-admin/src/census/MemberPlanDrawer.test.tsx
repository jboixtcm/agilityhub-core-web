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

import { MemberPlanDrawer } from "./MemberPlanDrawer";

const branding: Branding = { ...brandingFixture, theme: { ...brandingFixture.theme, mode: "dark" } };

beforeAll(() => { server.listen({ onUnhandledRequest: "error" }); });
beforeEach(() => { resetMemberBillingState(); mockScenario("admin"); });
afterEach(() => { cleanup(); server.resetHandlers(); resetMemberBillingState(); mockScenario("admin"); });
afterAll(() => { server.close(); });

async function loadMember(): Promise<components["schemas"]["Member"]> {
  const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
  const result = await client.GET("/members/{id}/overview", { params: { path: { id: "member-laura" } } });
  if (result.data === undefined) throw new TypeError("Missing member fixture");
  return result.data.member;
}

async function renderDrawer(member: components["schemas"]["Member"], onChanged = vi.fn()) {
  const i18n = await createI18n({ branding, browserLanguages: ["ca"], initialNamespaces: ["admin-census", "errors"], storage: undefined });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <MemberPlanDrawer
          client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
          member={member}
          onChanged={onChanged}
          onClose={() => undefined}
          onErased={() => undefined}
          open
        />
      </BrandingProvider>
    </I18nextProvider>,
  );
  return onChanged;
}

describe("E8-W03 round 2 member plan change", () => {
  it("#2 submits the published plan-change mutation and refreshes D10", async () => {
    const member = await loadMember();
    const writes: unknown[] = [];
    server.use(
      http.post("*/api/v1/members/:id/plan-change", async ({ request }) => {
        writes.push(await request.json());
        expect(request.headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/u);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const onChanged = await renderDrawer(member);
    const drawer = await screen.findByRole("dialog", { name: "Modalitat" });
    await within(drawer).findByRole("option", { name: "Abonat" });
    fireEvent.change(within(drawer).getByLabelText("Modalitat nova"), { target: { value: "plan-member" } });
    fireEvent.change(await within(drawer).findByLabelText("Tarifa"), { target: { value: "price-member" } });
    expect(await within(drawer).findByRole("option", { name: /60,00.*€/u })).toBeInTheDocument();
    fireEvent.click(within(drawer).getByRole("button", { name: "Desa" }));

    await waitFor(() => {
      expect(writes).toEqual([{ planId: "plan-member", priceId: "price-member" }]);
      expect(onChanged).toHaveBeenCalledTimes(1);
    });
  });

  it("#2 shows the 40% rule only for a qualifying ten-session pack", async () => {
    const member = await loadMember();
    await renderDrawer({ ...member, planId: "plan-pack-10" });
    let drawer = await screen.findByRole("dialog", { name: "Modalitat" });
    await within(drawer).findByRole("option", { name: "Abonat" });
    fireEvent.change(within(drawer).getByLabelText("Modalitat nova"), { target: { value: "plan-member" } });
    expect(await within(drawer).findByText(/40 %/u)).toBeVisible();

    cleanup();
    await renderDrawer({ ...member, planId: "plan-pack-6" });
    drawer = await screen.findByRole("dialog", { name: "Modalitat" });
    await within(drawer).findByRole("option", { name: "Abonat" });
    fireEvent.change(within(drawer).getByLabelText("Modalitat nova"), { target: { value: "plan-member" } });
    expect(within(drawer).queryByText(/40 %/u)).not.toBeInTheDocument();
  });
});
