import { createApiClient, type components } from "@agilityhub/api-client";
import { mockScenario, resetMemberBillingState } from "@agilityhub/api-client/mocks";
import brandingFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

import { MemberPaymentMethodDrawer } from "./MemberPaymentMethodDrawer";

const branding: Branding = { ...brandingFixture, theme: { ...brandingFixture.theme, mode: "dark" } };

beforeAll(() => { server.listen({ onUnhandledRequest: "error" }); });
beforeEach(() => { resetMemberBillingState(); mockScenario("admin"); });
afterEach(() => { cleanup(); server.resetHandlers(); resetMemberBillingState(); mockScenario("admin"); });
afterAll(() => { server.close(); });

async function paymentMethod(): Promise<components["schemas"]["PaymentMethodView"]> {
  const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
  const result = await client.GET("/members/{id}/overview", { params: { path: { id: "member-laura" } } });
  const payment = result.data?.member.paymentMethod;
  if (payment === undefined || payment === null) throw new TypeError("Missing payment fixture");
  return payment;
}

it("E8-W03 round 2 #16 shows Save after switching away from a generated card link", async () => {
  const i18n = await createI18n({ branding, browserLanguages: ["ca"], initialNamespaces: ["admin-census", "common", "enums", "errors"], storage: undefined });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <MemberPaymentMethodDrawer
          client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
          memberId="member-laura"
          onChanged={() => undefined}
          onClose={() => undefined}
          onErased={() => undefined}
          open
          paymentMethod={await paymentMethod()}
        />
      </BrandingProvider>
    </I18nextProvider>,
  );
  const drawer = await screen.findByRole("dialog", { name: "Mètode de pagament" });
  fireEvent.change(within(drawer).getByLabelText("Tipus"), { target: { value: "CARD" } });
  fireEvent.click(within(drawer).getByRole("button", { name: "Envia l'enllaç per actualitzar la targeta" }));
  expect(await within(drawer).findByRole("link", { name: /checkout\.example\.test/u })).toBeVisible();

  fireEvent.change(within(drawer).getByLabelText("Tipus"), { target: { value: "MANUAL" } });
  expect(within(drawer).getByRole("button", { name: "Desa" })).toBeEnabled();
  expect(within(drawer).queryByRole("link", { name: /checkout\.example\.test/u })).not.toBeInTheDocument();
});

it("E8-W06 #6 shows the shared in-progress message and retries the card link with the retained key", async () => {
  const sentKeys: string[] = [];
  server.use(http.post("*/api/v1/members/:id/card-setup-link", ({ request }) => {
    sentKeys.push(request.headers.get("Idempotency-Key") ?? "");
    return sentKeys.length === 1
      ? HttpResponse.json({ code: "IDEMPOTENCY_KEY_REUSED", details: { reason: "IN_PROGRESS" }, message: "still running", traceId: "test" }, { status: 409 })
      : HttpResponse.json({ checkoutUrl: "https://checkout.example.test/retry" }, { status: 201 });
  }));
  const i18n = await createI18n({ branding, browserLanguages: ["ca"], initialNamespaces: ["admin-census", "common", "enums", "errors"], storage: undefined });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <MemberPaymentMethodDrawer
          client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
          memberId="member-laura"
          onChanged={() => undefined}
          onClose={() => undefined}
          onErased={() => undefined}
          open
          paymentMethod={await paymentMethod()}
        />
      </BrandingProvider>
    </I18nextProvider>,
  );
  const drawer = await screen.findByRole("dialog", { name: "Mètode de pagament" });
  fireEvent.change(within(drawer).getByLabelText("Tipus"), { target: { value: "CARD" } });
  const send = within(drawer).getByRole("button", { name: "Envia l'enllaç per actualitzar la targeta" });
  fireEvent.click(send);
  expect(await within(drawer).findByRole("alert")).toHaveTextContent("L'operació encara està en curs. Torna-ho a provar d'aquí a un moment.");
  fireEvent.click(send);
  await waitFor(() => {
    expect(sentKeys).toHaveLength(2);
    expect(sentKeys[0]).toBe(sentKeys[1]);
  });
  expect(await within(drawer).findByRole("link", { name: /checkout\.example\.test\/retry/u })).toBeVisible();
});

it("E11-W06 W10 (R-04-06) 409 READMISSION_PENDING on the payment method points to D2", async () => {
  const current = await paymentMethod();
  mockScenario("adminMemberReadmissionPending");
  const i18n = await createI18n({ branding, browserLanguages: ["ca"], initialNamespaces: ["admin-census", "common", "enums", "errors"], storage: undefined });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <MemberPaymentMethodDrawer
          client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
          memberId="member-laura"
          onChanged={() => undefined}
          onClose={() => undefined}
          onErased={() => undefined}
          open
          paymentMethod={current}
        />
      </BrandingProvider>
    </I18nextProvider>,
  );
  const drawer = await screen.findByRole("dialog", { name: "Mètode de pagament" });
  fireEvent.change(within(drawer).getByLabelText("Tipus"), { target: { value: "MANUAL" } });
  fireEvent.click(within(drawer).getByRole("button", { name: "Desa" }));

  const alert = await within(drawer).findByRole("alert");
  await waitFor(() => {
    expect(alert).toHaveTextContent("Aquest abonat té una readmissió pendent");
  });
  expect(within(alert).getByRole("link", { name: "Preinscripcions pendents" })).toHaveAttribute("href", "/preinscripcions/member-laura");
});

it("WEB-07 (decision of 13 Nov 2026): the new IBAN is visible while typed and its length and check digits are checked before saving", async () => {
  const current = await paymentMethod();
  const patches: unknown[] = [];
  const recording: typeof fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    if (request.method === "PATCH") patches.push(await request.clone().json());
    return fetch(input, init);
  };
  const onChanged = vi.fn();
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-census", "common", "enums", "errors"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <MemberPaymentMethodDrawer
          client={createApiClient({
            baseUrl: `${window.location.origin}/api/v1`,
            fetch: recording,
          })}
          memberId="member-laura"
          onChanged={onChanged}
          onClose={() => undefined}
          onErased={() => undefined}
          open
          paymentMethod={current}
        />
      </BrandingProvider>
    </I18nextProvider>,
  );
  const drawer = await screen.findByRole("dialog", { name: "Mètode de pagament" });
  const iban = within(drawer).getByLabelText("IBAN nou");
  expect(iban).toHaveProperty("type", "text");
  expect(iban).toHaveAttribute("spellcheck", "false");
  expect(
    within(drawer).getByText(
      "Es veu mentre l'escrius. Un cop desat, queda ocult i no es torna a mostrar.",
    ),
  ).toBeVisible();

  // Wrong check digits, then a Spanish IBAN of 25 characters whose check digits are right.
  for (const typed of ["ES91 2100 0418 4502 0005 1333", "ES55 0000 0000 0000 0000 0000 1"]) {
    fireEvent.change(iban, { target: { value: typed } });
    expect(iban).toHaveValue(typed);
    fireEvent.click(within(drawer).getByRole("button", { name: "Desa" }));

    expect(within(drawer).getByRole("alert")).toHaveTextContent(
      "El número de compte bancari no és vàlid.",
    );
    expect(iban).toHaveAttribute("aria-invalid", "true");
    expect(iban).toHaveFocus();
  }
  expect(patches).toEqual([]);

  fireEvent.change(iban, { target: { value: "ES91 2100 0418 4502 0005 1332" } });
  expect(within(drawer).queryByRole("alert")).toBeNull();
  fireEvent.click(within(drawer).getByRole("button", { name: "Desa" }));

  await waitFor(() => {
    expect(onChanged).toHaveBeenCalledTimes(1);
  });
  expect(patches).toEqual([
    {
      sepa: { holderName: current.holderName, iban: "ES91 2100 0418 4502 0005 1332" },
      type: "SEPA_DD",
    },
  ]);
});
