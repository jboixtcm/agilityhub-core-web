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
  const i18n = await createI18n({ branding, browserLanguages: ["ca"], initialNamespaces: ["admin-census", "common", "errors"], storage: undefined });
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
  it("E8-W06 #6 shows the shared in-progress message and retries with the retained key", async () => {
    const member = await loadMember();
    const sentKeys: string[] = [];
    server.use(http.post("*/api/v1/members/:id/plan-change", ({ request }) => {
      sentKeys.push(request.headers.get("Idempotency-Key") ?? "");
      return sentKeys.length === 1
        ? HttpResponse.json({ code: "IDEMPOTENCY_KEY_REUSED", details: { reason: "IN_PROGRESS" }, message: "still running", traceId: "test" }, { status: 409 })
        : new HttpResponse(null, { status: 204 });
    }));
    await renderDrawer(member);
    const drawer = await screen.findByRole("dialog", { name: "Modalitat" });
    await within(drawer).findByRole("option", { name: "Abonat" });
    fireEvent.change(within(drawer).getByLabelText("Modalitat nova"), { target: { value: "plan-member" } });
    fireEvent.change(await within(drawer).findByLabelText("Tarifa"), { target: { value: "price-member" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Desa" }));
    expect(await within(drawer).findByRole("alert")).toHaveTextContent("L'operació encara està en curs. Torna-ho a provar d'aquí a un moment.");
    fireEvent.click(within(drawer).getByRole("button", { name: "Desa" }));
    await waitFor(() => {
      expect(sentKeys).toHaveLength(2);
      expect(sentKeys[0]).toBe(sentKeys[1]);
    });
  });

  it("E8-W06 #7 formats a JPY plan price without dividing it by 100", async () => {
    const member = await loadMember();
    const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
    const result = await client.GET("/prices", { params: { query: { planId: "plan-member" } } });
    const price = result.data?.items[0];
    if (price === undefined) throw new TypeError("Missing price fixture");
    server.use(http.get("*/api/v1/prices", () => HttpResponse.json({
      items: [{ ...price, amount: { amountMinor: 6000, currency: "JPY" } }],
      totalItems: 1,
    })));
    await renderDrawer(member);
    const drawer = await screen.findByRole("dialog", { name: "Modalitat" });
    await within(drawer).findByRole("option", { name: "Abonat" });
    fireEvent.change(within(drawer).getByLabelText("Modalitat nova"), { target: { value: "plan-member" } });
    expect(await within(drawer).findByRole("option", { name: /6\.000.*¥/u })).toBeInTheDocument();
  });

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

  it("E8-W03 round 3 #5 reads the discount threshold and percentage from the catalog", async () => {
    server.use(
      http.get("*/api/v1/parameters/:key", ({ params }) =>
        HttpResponse.json({
          key: params.key,
          value: params.key === "billing.packToMemberMinSessions" ? 6 : 35,
          version: 1,
        }),
      ),
    );
    const member = await loadMember();
    await renderDrawer({ ...member, planId: "plan-pack-6" });
    const drawer = await screen.findByRole("dialog", { name: "Modalitat" });
    await within(drawer).findByRole("option", { name: "Abonat" });
    fireEvent.change(within(drawer).getByLabelText("Modalitat nova"), { target: { value: "plan-member" } });
    expect(await within(drawer).findByText(/6 sessions.*35 %/u)).toBeVisible();
    expect(within(drawer).queryByText(/10 sessions|40 %/u)).not.toBeInTheDocument();
  });

  it("E8-W03 round 3 #9 does not expose a dead second-dog link", async () => {
    const member = await loadMember();
    await renderDrawer(member);
    const drawer = await screen.findByRole("dialog", { name: "Modalitat" });
    await within(drawer).findByRole("option", { name: "Abonat" });
    expect(within(drawer).queryByRole("link")).not.toBeInTheDocument();
  });
});
