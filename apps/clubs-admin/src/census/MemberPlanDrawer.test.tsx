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

  it("E11-W06 W10 (R-04-06) 409 READMISSION_PENDING on the plan change points to D2", async () => {
    mockScenario("adminMemberReadmissionPending");
    const member = await loadMember();
    await renderDrawer(member);
    const drawer = await screen.findByRole("dialog", { name: "Modalitat" });
    await within(drawer).findByRole("option", { name: "Abonat" });
    fireEvent.change(within(drawer).getByLabelText("Modalitat nova"), { target: { value: "plan-member" } });
    fireEvent.change(await within(drawer).findByLabelText("Tarifa"), { target: { value: "price-member" } });
    await within(drawer).findByRole("option", { name: /60,00.*€/u });
    fireEvent.click(within(drawer).getByRole("button", { name: "Desa" }));

    const alert = await within(drawer).findByRole("alert");
    await waitFor(() => {
      expect(alert).toHaveTextContent("Aquest abonat té una readmissió pendent");
    });
    expect(within(alert).getByRole("link", { name: "Preinscripcions pendents" })).toHaveAttribute("href", "/preinscripcions/member-laura");
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

  describe("E11-W07 step 3 (E146, R-12-06): a pack member moving to a MONTHLY plan", () => {
    // Club-local 05/10/2026: without a date the api puts November's invoice day (the 1st).
    beforeEach(() => {
      vi.useFakeTimers({ now: new Date("2026-10-05T10:00:00Z"), shouldAdvanceTime: true, toFake: ["Date"] });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    async function choose(member: components["schemas"]["Member"], planId: string) {
      const writes: unknown[] = [];
      server.use(
        http.post("*/api/v1/members/:id/plan-change", async ({ request }) => {
          writes.push(await request.clone().json());
          return new HttpResponse(null, { status: 204 });
        }),
      );
      await renderDrawer(member);
      const drawer = await screen.findByRole("dialog", { name: "Modalitat" });
      await within(drawer).findByRole("option", { name: "Abonat" });
      fireEvent.change(within(drawer).getByLabelText("Modalitat nova"), { target: { value: planId } });
      const price = await within(drawer).findByLabelText("Tarifa");
      await waitFor(() => {
        expect(within(price).getAllByRole("option").length).toBeGreaterThan(1);
      });
      const values = within(price).getAllByRole("option").map((item) => item.getAttribute("value") ?? "");
      fireEvent.change(price, { target: { value: values.includes("price-member") ? "price-member" : values[1] } });
      return { drawer, writes };
    }

    it("R-12-06: the optional «Data del proper rebut» says what an empty one means; empty → no nextInvoiceDate in the body", async () => {
      const member = { ...(await loadMember()), nextInvoiceDate: null, planId: "plan-pack-10" };
      const { drawer, writes } = await choose(member, "plan-member");
      const date = within(drawer).getByLabelText("Data del proper rebut (opcional)");
      expect(date).not.toBeRequired();
      expect(date).toHaveAttribute("min", "2026-10-01");
      expect(
        await within(drawer).findByText("Si la deixes en blanc, el proper rebut serà el 01/11/2026."),
      ).toBeVisible();
      fireEvent.click(within(drawer).getByRole("button", { name: "Desa" }));
      await waitFor(() => {
        expect(writes).toEqual([{ planId: "plan-member", priceId: "price-member" }]);
      });
    });

    it("R-12-06: a filled date travels as nextInvoiceDate; the api's 400 on it lands on the field", async () => {
      const member = { ...(await loadMember()), nextInvoiceDate: null, planId: "plan-pack-10" };
      const { drawer, writes } = await choose(member, "plan-member");
      fireEvent.change(within(drawer).getByLabelText("Data del proper rebut (opcional)"), {
        target: { value: "2026-12-01" },
      });
      fireEvent.click(within(drawer).getByRole("button", { name: "Desa" }));
      await waitFor(() => {
        expect(writes).toEqual([
          { nextInvoiceDate: "2026-12-01", planId: "plan-member", priceId: "price-member" },
        ]);
      });
      cleanup();
      server.resetHandlers();

      server.use(
        http.post("*/api/v1/members/:id/plan-change", () =>
          HttpResponse.json(
            {
              code: "VALIDATION_ERROR",
              details: { fieldErrors: [{ code: "INVALID_VALUE", field: "nextInvoiceDate" }] },
              message: "Validation failed",
              traceId: "t-plan",
            },
            { status: 400 },
          ),
        ),
      );
      await renderDrawer(member);
      const again = await screen.findByRole("dialog", { name: "Modalitat" });
      await within(again).findByRole("option", { name: "Abonat" });
      fireEvent.change(within(again).getByLabelText("Modalitat nova"), { target: { value: "plan-member" } });
      fireEvent.change(await within(again).findByLabelText("Tarifa"), { target: { value: "price-member" } });
      await within(again).findByRole("option", { name: /60,00.*€/u });
      fireEvent.change(within(again).getByLabelText("Data del proper rebut (opcional)"), {
        target: { value: "2026-10-15" },
      });
      fireEvent.click(within(again).getByRole("button", { name: "Desa" }));
      const field = within(again).getByLabelText("Data del proper rebut (opcional)").closest(".ah-form-field");
      if (!(field instanceof HTMLElement)) throw new TypeError("No date field");
      expect(await within(field).findByText("La data no pot ser anterior al 01/10/2026.")).toBeVisible();
      expect(within(again).getAllByRole("alert")).toHaveLength(1);
    });

    it("R-12-06: a member who already has a date (or a non-monthly target) gets no date field — it never moves on a plan change", async () => {
      const member = await loadMember();
      const { drawer } = await choose({ ...member, planId: "plan-pack-10" }, "plan-member");
      expect(within(drawer).queryByLabelText("Data del proper rebut (opcional)")).toBeNull();
      cleanup();
      const pack = await choose({ ...member, nextInvoiceDate: null }, "plan-pack-6");
      expect(within(pack.drawer).queryByLabelText("Data del proper rebut (opcional)")).toBeNull();
    });
  });

  it("E8-W03 round 3 #9 does not expose a dead second-dog link", async () => {
    const member = await loadMember();
    await renderDrawer(member);
    const drawer = await screen.findByRole("dialog", { name: "Modalitat" });
    await within(drawer).findByRole("option", { name: "Abonat" });
    expect(within(drawer).queryByRole("link")).not.toBeInTheDocument();
  });
});
