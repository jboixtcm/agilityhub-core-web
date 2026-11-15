import { createApiClient } from "@agilityhub/api-client";
import { mockScenario, resetMemberBillingState } from "@agilityhub/api-client/mocks";
import brandingFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider, ToastProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { MemberBillingBlock } from "./MemberBillingBlock";

const branding: Branding = {
  ...brandingFixture,
  locales: ["ca", "es", "en"],
  theme: { ...brandingFixture.theme, mode: "dark" },
};
const dogs = [
  {
    breed: "border collie",
    freeTrainingAllowed: false,
    id: "dog-duna",
    name: "Duna",
    pendingDocuments: [],
    status: "ACTIVE" as const,
  },
  {
    breed: "mestís",
    freeTrainingAllowed: true,
    id: "dog-rock",
    name: "Rock",
    pendingDocuments: [],
    status: "ACTIVE" as const,
  },
];

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetMemberBillingState();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

async function renderBlock(
  brandingOverride: Branding = branding,
  { locale = "ca", readOnly = false }: { locale?: "ca" | "en" | "es"; readOnly?: boolean } = {},
) {
  mockScenario("admin");
  const i18n = await createI18n({
    branding: brandingOverride,
    browserLanguages: [locale],
    initialNamespaces: ["admin-census", "enums", "errors"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={brandingOverride}>
        <ToastProvider dismissLabel="Tanca">
          <MemberBillingBlock
            client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
            dogs={dogs}
            memberId="member-laura"
            memberName="Laura Serra Vidal"
            readOnly={readOnly}
          />
        </ToastProvider>
      </BrandingProvider>
    </I18nextProvider>,
  );
}

describe("D10 member billing block", () => {
  it("loads recent receipts, upfront payments and the dog pack", async () => {
    await renderBlock();
    expect(await screen.findByText("2026-0912")).toBeVisible();
    expect(screen.getByText("Entrada")).toBeVisible();
    expect(screen.getByText("Pack 10", { exact: false })).toBeVisible();
    expect(screen.getByRole("link", { name: "Tots els rebuts ›" })).toHaveAttribute(
      "href",
      expect.stringContaining("memberId%3Aeq%3Amember-laura"),
    );
  });

  it("keeps AMOUNT_EXCEEDS_DUE on the amount field", async () => {
    await renderBlock();
    fireEvent.click(await screen.findByRole("button", { name: "Registra un pagament" }));
    const dialog = screen.getByRole("dialog", { name: "Registra un pagament" });
    fireEvent.change(within(dialog).getByLabelText("Import degut"), { target: { value: "10" } });
    fireEvent.change(within(dialog).getByLabelText("Import pagat"), { target: { value: "20" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Desa" }));
    expect(await within(dialog).findByText(/no pot superar/u)).toBeVisible();
  });

  it("sets an absolute consumed count and preserves a separately adjusted balance", async () => {
    await renderBlock();
    fireEvent.click(await screen.findByRole("button", { name: "Ajusta" }));
    const adjustment = screen.getByRole("dialog", { name: "Ajusta" });
    fireEvent.change(within(adjustment).getByLabelText("Variació de sessions"), {
      target: { value: "2" },
    });
    fireEvent.change(within(adjustment).getByLabelText("Motiu"), {
      target: { value: "Dues sessions de regal" },
    });
    fireEvent.click(within(adjustment).getByRole("button", { name: "Desa" }));
    expect(await screen.findByText(/6 consumides · 6 disponibles/u)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Corregeix les classes consumides" }));
    const correction = screen.getByRole("dialog", { name: "Corregeix les classes consumides" });
    const input = within(correction).getByLabelText("Total de classes consumides");
    expect(input).toHaveValue(6);
    fireEvent.change(input, { target: { value: "3" } });
    expect(
      within(correction).getByText(/Saldo després de la correcció: 9 sessions/u),
    ).toBeVisible();
    fireEvent.change(within(correction).getByLabelText("Motiu"), {
      target: { value: "Recompte d’assistència" },
    });
    fireEvent.click(within(correction).getByRole("button", { name: "Desa" }));
    expect(await screen.findByText(/3 consumides · 9 disponibles/u)).toBeVisible();
  });

  it("refreshes a stale pack and requires reviewing the new counts", async () => {
    server.use(
      http.post("*/api/v1/pack-balances/:id/consumption-corrections", () =>
        HttpResponse.json({ code: "STALE_VERSION", message: "Changed" }, { status: 409 }),
      ),
    );
    await renderBlock();
    fireEvent.click(
      await screen.findByRole("button", { name: "Corregeix les classes consumides" }),
    );
    const correction = screen.getByRole("dialog", { name: "Corregeix les classes consumides" });
    fireEvent.change(within(correction).getByLabelText("Total de classes consumides"), {
      target: { value: "8" },
    });
    fireEvent.change(within(correction).getByLabelText("Motiu"), {
      target: { value: "Classes anteriors" },
    });
    fireEvent.click(within(correction).getByRole("button", { name: "Desa" }));
    expect(await within(correction).findByRole("alert")).toHaveTextContent("El pack ha canviat");
    expect(within(correction).getByRole("button", { name: "Desa" })).toBeDisabled();
  });

  it("shows the minimum from charged bookings and excludes refunded bookings", async () => {
    server.use(
      http.get("*/api/v1/pack-balances", () =>
        HttpResponse.json([
          {
            id: "pack-rock",
            dogId: "dog-rock",
            planName: "Pack 10",
            consumed: 4,
            sessionsTotal: 10,
            remaining: 6,
            expiresOn: "2026-11-25",
            state: "ACTIVE",
            movements: [
              { bookingId: "attended", type: "CONSUME", delta: -1 },
              { bookingId: "cancelled", type: "CONSUME", delta: -1 },
              { bookingId: "cancelled", type: "REFUND", delta: 1 },
            ],
          },
        ]),
      ),
    );
    await renderBlock();
    fireEvent.click(
      await screen.findByRole("button", { name: "Corregeix les classes consumides" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Corregeix les classes consumides" });
    const field = within(dialog).getByLabelText("Total de classes consumides");
    expect(field).toHaveAccessibleDescription(/entre 1 i 10 classes/u);
    expect(field).toHaveAttribute("min", "1");
    fireEvent.change(within(dialog).getByLabelText("Motiu"), { target: { value: "Recompte" } });
    fireEvent.change(field, { target: { value: "0" } });
    expect(within(dialog).getByRole("button", { name: "Desa" })).toBeDisabled();
    fireEvent.change(field, { target: { value: "1" } });
    expect(within(dialog).getByRole("button", { name: "Desa" })).toBeEnabled();
  });

  it("requires a new expiry when adjusting an expired pack", async () => {
    server.use(
      http.get("*/api/v1/pack-balances", () =>
        HttpResponse.json([
          {
            consumed: 10,
            dogId: "dog-rock",
            expiresOn: "2026-07-31",
            id: "53000000-0000-4000-8000-000000000099",
            memberId: "member-laura",
            movements: [],
            openedOn: "2026-01-01",
            planId: "plan-pack-10",
            planName: "Pack 10",
            remaining: 0,
            sessionsTotal: 10,
            state: "EXPIRED",
          },
        ]),
      ),
    );
    await renderBlock();
    fireEvent.click(await screen.findByRole("button", { name: "Ajusta" }));
    const dialog = screen.getByRole("dialog", { name: "Ajusta" });
    expect(within(dialog).getByLabelText("Nova caducitat")).toBeRequired();
    expect(screen.getByText(/Pack 10/u).closest(".member-billing__pack")).not.toHaveTextContent(
      "disponibles",
    );
    expect(screen.getByText(/Pack 10/u).closest(".member-billing__pack")).toHaveTextContent(
      "caducat",
    );
  });

  it("names the dog on every pack row and inside its adjustment modal", async () => {
    server.use(
      http.get("*/api/v1/pack-balances", () =>
        HttpResponse.json(
          dogs.map((dog, index) => ({
            consumed: index + 1,
            dogId: dog.id,
            expiresOn: "2026-12-31",
            id: `pack-${dog.id}`,
            memberId: "member-laura",
            movements: [],
            openedOn: "2026-08-01",
            planId: "plan-pack-10",
            planName: "Pack 10",
            remaining: 9 - index,
            sessionsTotal: 10,
            state: "ACTIVE",
            upfrontPaymentId: null,
          })),
        ),
      ),
    );
    await renderBlock();
    const packRows = await screen.findAllByText("Pack 10", { exact: false });
    expect(packRows).toHaveLength(2);
    expect(packRows[0]?.closest(".member-billing__pack")).toHaveTextContent("Duna");
    expect(packRows[1]?.closest(".member-billing__pack")).toHaveTextContent("Rock");
    const [, rockAdjust] = screen.getAllByRole("button", { name: "Ajusta" });
    if (rockAdjust === undefined) throw new Error("Rock adjustment button was not rendered");
    fireEvent.click(rockAdjust);
    expect(screen.getByRole("dialog", { name: "Ajusta" })).toHaveTextContent("Rock");
  });

  it("omits the pack request, section and upfront PACK concept when PACKS is off", async () => {
    const requests: string[] = [];
    server.events.on("request:start", ({ request }) => {
      requests.push(new URL(request.url).pathname);
    });
    await renderBlock({
      ...branding,
      modules: branding.modules.filter((module) => module !== "PACKS"),
    });
    await screen.findByText("2026-0912");
    expect(requests).not.toContain("/api/v1/pack-balances");
    expect(screen.queryByRole("heading", { name: "Packs" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Registra un pagament" }));
    expect(
      within(screen.getByLabelText("Concepte")).queryByRole("option", { name: "Pack" }),
    ).toBeNull();
  });

  it("maps adjustment field errors and shows an alert for an unclassified failure", async () => {
    server.use(
      http.post("*/api/v1/pack-balances/:id/adjustments", () =>
        HttpResponse.json(
          {
            code: "VALIDATION_ERROR",
            details: { fieldErrors: [{ code: "REQUIRED", field: "reason" }] },
            message: "VALIDATION_ERROR",
            traceId: "test-trace",
          },
          { status: 400 },
        ),
      ),
    );
    await renderBlock();
    fireEvent.click(await screen.findByRole("button", { name: "Ajusta" }));
    let dialog = screen.getByRole("dialog", { name: "Ajusta" });
    fireEvent.change(within(dialog).getByLabelText("Variació de sessions"), {
      target: { value: "1" },
    });
    fireEvent.change(within(dialog).getByLabelText("Motiu"), { target: { value: "Correcció" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Desa" }));
    expect(await within(dialog).findByText(/camps destacats/u)).toBeVisible();

    server.use(
      http.post("*/api/v1/pack-balances/:id/adjustments", () =>
        HttpResponse.json(
          { code: "INTERNAL_ERROR", details: {}, message: "INTERNAL_ERROR", traceId: "test-trace" },
          { status: 500 },
        ),
      ),
    );
    fireEvent.change(within(dialog).getByLabelText("Motiu"), { target: { value: "Segon intent" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Desa" }));
    await waitFor(() => {
      dialog = screen.getByRole("dialog", { name: "Ajusta" });
      expect(within(dialog).getByRole("alert")).toBeVisible();
    });
  });

  it("keeps an expiry validation visible when the pack expired after the modal opened", async () => {
    let packReads = 0;
    const balance = (state: "ACTIVE" | "EXPIRED") => ({
      consumed: 6,
      dogId: "dog-rock",
      expiresOn: "2026-07-31",
      id: "pack-race",
      memberId: "member-laura",
      movements: [],
      openedOn: "2026-01-01",
      planId: "plan-pack-10",
      planName: "Pack 10",
      remaining: 4,
      sessionsTotal: 10,
      state,
      upfrontPaymentId: null,
    });
    server.use(
      http.get("*/api/v1/pack-balances", () => {
        packReads += 1;
        return HttpResponse.json([balance(packReads === 1 ? "ACTIVE" : "EXPIRED")]);
      }),
      http.post("*/api/v1/pack-balances/:id/adjustments", () =>
        HttpResponse.json(
          {
            code: "VALIDATION_ERROR",
            details: { fieldErrors: [{ code: "REQUIRED", field: "expiresOn" }] },
            message: "VALIDATION_ERROR",
            traceId: "pack-race",
          },
          { status: 400 },
        ),
      ),
    );
    await renderBlock();
    fireEvent.click(await screen.findByRole("button", { name: "Ajusta" }));
    const dialog = screen.getByRole("dialog", { name: "Ajusta" });
    fireEvent.change(within(dialog).getByLabelText("Variació de sessions"), {
      target: { value: "1" },
    });
    fireEvent.change(within(dialog).getByLabelText("Motiu"), { target: { value: "Correcció" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Desa" }));
    await waitFor(() => {
      expect(within(dialog).getByLabelText("Nova caducitat")).toBeVisible();
    });
    expect(within(dialog).getByText(/camps destacats/u)).toBeVisible();
  });

  it("shows and retries section-level errors for rejected receipt, payment and pack reads", async () => {
    const failing = () =>
      HttpResponse.json(
        { code: "INTERNAL_ERROR", details: {}, message: "INTERNAL_ERROR", traceId: "read-test" },
        { status: 500 },
      );
    server.use(
      http.get("*/api/v1/invoices", failing),
      http.get("*/api/v1/upfront-payments", failing),
      http.get("*/api/v1/pack-balances", failing),
    );
    await renderBlock();

    for (const name of ["Rebuts recents", "Pagaments a l'acte", "Packs"]) {
      const section = (await screen.findByRole("heading", { name })).closest("section");
      if (section === null) throw new Error(`Missing ${name} section`);
      expect(await within(section).findByRole("alert")).toBeVisible();
      expect(within(section).getByRole("button", { name: "Torna-ho a provar" })).toBeVisible();
    }

    server.resetHandlers();
    const retry = screen.getAllByRole("button", { name: "Torna-ho a provar" })[0];
    if (retry === undefined) throw new Error("Missing billing read retry");
    fireEvent.click(retry);
    expect(retry).toBeDisabled();
    expect(await screen.findByText("2026-0912")).toBeVisible();
    await waitFor(() => {
      expect(screen.queryAllByRole("alert")).toHaveLength(0);
    });
  });

  it("keeps stale section data visible with an error when a post-write refresh is rejected", async () => {
    await renderBlock();
    expect(await screen.findByText("Entrada")).toBeVisible();
    const failing = () =>
      HttpResponse.json(
        { code: "INTERNAL_ERROR", details: {}, message: "INTERNAL_ERROR", traceId: "refresh-test" },
        { status: 500 },
      );
    server.use(
      http.get("*/api/v1/invoices", failing),
      http.get("*/api/v1/upfront-payments", failing),
      http.get("*/api/v1/pack-balances", failing),
    );
    fireEvent.click(screen.getByRole("button", { name: "Registra un pagament" }));
    const dialog = screen.getByRole("dialog", { name: "Registra un pagament" });
    fireEvent.change(within(dialog).getByLabelText("Import degut"), { target: { value: "10" } });
    fireEvent.change(within(dialog).getByLabelText("Import pagat"), { target: { value: "10" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Desa" }));

    const payments = screen.getByRole("heading", { name: "Pagaments a l'acte" }).closest("section");
    if (payments === null) throw new Error("Missing upfront section");
    expect(await within(payments).findByRole("alert")).toBeVisible();
    expect(within(payments).getByText("Entrada")).toBeVisible();
  });
});

describe("PAY-05 (decision of 13 Nov 2026): D10 refunds a card payment", () => {
  interface Sent {
    body: unknown;
    key: string | null;
  }

  /** The refund requests the block sends (the mock answers as the api). */
  function recordRefunds(): Sent[] {
    const sent: Sent[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.method !== "POST" || !request.url.endsWith("/refund")) return;
      const entry: Sent = { body: undefined, key: request.headers.get("Idempotency-Key") };
      sent.push(entry);
      void request
        .clone()
        .json()
        .then((body: unknown) => {
          entry.body = body;
        });
    });
    return sent;
  }

  async function upfrontSection() {
    const section = (await screen.findByRole("heading", { name: "Pagaments a l'acte" })).closest(
      "section",
    );
    if (section === null) throw new Error("Missing upfront section");
    return section;
  }

  async function openRefund() {
    fireEvent.click(await screen.findByRole("button", { name: "Reemborsa Pack (120,00 €)" }));
    return screen.getByRole("dialog", { name: "Reemborsa un pagament amb targeta" });
  }

  it("offers [Reemborsa] only on a card payment that is collected, never read-only", async () => {
    await renderBlock();
    const section = await upfrontSection();
    expect(await within(section).findByText("Pack")).toBeVisible();
    // The cash entry fee has no automatic refund: no action on it.
    expect(within(section).getAllByRole("button", { name: /^Reemborsa/u })).toHaveLength(1);
    expect(within(section).getByText("Entrada").closest("li")).not.toContainElement(
      within(section).getByRole("button", { name: "Reemborsa Pack (120,00 €)" }),
    );
    cleanup();
    await renderBlock(branding, { readOnly: true });
    expect(await within(await upfrontSection()).findByText("Pack")).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Reemborsa/u })).not.toBeInTheDocument();
  });

  it("refunds what is left after a reason and a confirmation naming the member, the concept and the amount", async () => {
    const sent = recordRefunds();
    await renderBlock();
    const dialog = await openRefund();
    expect(dialog).toHaveTextContent(
      "Pack: pagat amb targeta 120,00 €; queda per reemborsar 120,00 €.",
    );
    expect(within(dialog).getByLabelText("Import a reemborsar")).toHaveValue("");
    expect(
      within(dialog).getByText("En blanc, es reemborsa tot el que queda (120,00 €)."),
    ).toBeVisible();
    const next = within(dialog).getByRole("button", { name: "Continua" });
    expect(next).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Motiu"), { target: { value: "   " } });
    expect(next).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Motiu"), {
      target: { value: "Pack comprat per error" },
    });
    fireEvent.click(next);
    const heading = within(dialog).getByRole("heading", { name: "Confirma el reemborsament" });
    expect(heading).toHaveFocus();
    expect(dialog).toHaveTextContent(
      "Es reemborsaran 120,00 € a Laura Serra Vidal pel pagament «Pack». Stripe els retornarà a la targeta amb què es va pagar, i no es pot desfer.",
    );
    expect(dialog).toHaveTextContent("Motiu: Pack comprat per error");
    expect(sent).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Reemborsa 120,00 €" }));
    expect(
      await screen.findByText(
        "Reemborsament de 120,00 € sol·licitat: es confirmarà quan Stripe el processi.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(sent).toHaveLength(1);
    await waitFor(() => {
      // The amount the confirmation named is sent, also for «what is left».
      expect(sent[0]?.body).toEqual({
        amount: { amountMinor: 12000, currency: "EUR" },
        reason: "Pack comprat per error",
      });
    });
    expect(sent[0]?.key).toMatch(/^[0-9a-f-]{36}$/u);
    // The list is read again: the row is refunded, with its refund, and offers nothing more.
    const row = (await within(await upfrontSection()).findByText("reemborsat")).closest("li");
    expect(row).toHaveTextContent(
      "Reemborsament de 120,00 € el 05/10/2026: Pack comprat per error",
    );
    expect(screen.queryByRole("button", { name: /^Reemborsa/u })).not.toBeInTheDocument();
  });

  it("refunds a part; the rest stays refundable", async () => {
    const sent = recordRefunds();
    await renderBlock();
    let dialog = await openRefund();
    fireEvent.change(within(dialog).getByLabelText("Import a reemborsar"), {
      target: { value: "40" },
    });
    fireEvent.change(within(dialog).getByLabelText("Motiu"), {
      target: { value: "Dues sessions" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Continua" }));
    expect(dialog).toHaveTextContent("Es reemborsaran 40,00 € a Laura Serra Vidal");
    fireEvent.click(within(dialog).getByRole("button", { name: "Reemborsa 40,00 €" }));
    expect(await screen.findByText(/Reemborsament de 40,00 € sol·licitat/u)).toBeVisible();
    await waitFor(() => {
      expect(sent[0]?.body).toEqual({
        amount: { amountMinor: 4000, currency: "EUR" },
        reason: "Dues sessions",
      });
    });
    expect(
      await within(await upfrontSection()).findByText(/Reemborsament de 40,00 € el/u),
    ).toBeVisible();
    dialog = await openRefund();
    expect(dialog).toHaveTextContent("queda per reemborsar 80,00 €.");
  });

  it("refuses an amount that is not positive or above what is left, and sends nothing on Back or Cancel", async () => {
    const sent = recordRefunds();
    await renderBlock();
    const dialog = await openRefund();
    const amount = within(dialog).getByLabelText("Import a reemborsar");
    fireEvent.change(within(dialog).getByLabelText("Motiu"), { target: { value: "Error" } });
    for (const value of ["200", "0", "-5", "abc"]) {
      fireEvent.change(amount, { target: { value } });
      expect(
        within(dialog).getByText("Escriu un import positiu que no superi 120,00 €."),
      ).toBeVisible();
      expect(within(dialog).getByRole("button", { name: "Continua" })).toBeDisabled();
    }
    fireEvent.change(amount, { target: { value: "120" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Continua" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Enrere" }));
    expect(within(dialog).getByLabelText("Import a reemborsar")).toHaveValue("120");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel·la" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it("puts REFUND_EXCEEDS_PAID on the amount and reads the list again after INVALID_STATE", async () => {
    const reads: string[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.method === "GET" && new URL(request.url).pathname === "/api/v1/upfront-payments")
        reads.push(request.url);
    });
    server.use(
      http.post("*/api/v1/upfront-payments/:id/refund", () =>
        HttpResponse.json(
          { code: "REFUND_EXCEEDS_PAID", details: {}, message: "x", traceId: "refund-test" },
          { status: 422 },
        ),
      ),
    );
    await renderBlock();
    let dialog = await openRefund();
    fireEvent.change(within(dialog).getByLabelText("Motiu"), { target: { value: "Error" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Continua" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Reemborsa 120,00 €" }));
    // Back on the form, on its field: a refund still in flight counts against what is left.
    expect(
      await within(dialog).findByText("El reemborsament no pot superar l'import pagat."),
    ).toBeVisible();
    expect(within(dialog).getByLabelText("Import a reemborsar")).toBeVisible();

    server.use(
      http.post("*/api/v1/upfront-payments/:id/refund", () =>
        HttpResponse.json(
          { code: "INVALID_STATE", details: { status: "REFUNDED" }, message: "x", traceId: "t" },
          { status: 409 },
        ),
      ),
    );
    const before = reads.length;
    fireEvent.click(within(dialog).getByRole("button", { name: "Continua" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Reemborsa 120,00 €" }));
    dialog = screen.getByRole("dialog", { name: "Reemborsa un pagament amb targeta" });
    expect(
      await within(dialog).findByText(
        "Aquest pagament ha canviat i ja no es pot reemborsar així. S'ha tornat a llegir la llista.",
      ),
    ).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Reemborsa 120,00 €" })).toBeDisabled();
    await waitFor(() => {
      expect(reads.length).toBeGreaterThan(before);
    });
  });

  it("speaks es and en", async () => {
    await renderBlock(branding, { locale: "es" });
    fireEvent.click(await screen.findByRole("button", { name: "Reembolsar Bono (120,00 €)" }));
    let dialog = screen.getByRole("dialog", { name: "Reembolsar un pago con tarjeta" });
    fireEvent.change(within(dialog).getByLabelText("Motivo"), { target: { value: "Error" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Continuar" }));
    expect(within(dialog).getByRole("heading", { name: "Confirmar el reembolso" })).toHaveFocus();
    expect(dialog).toHaveTextContent(
      "Se reembolsarán 120,00 € a Laura Serra Vidal por el pago «Bono».",
    );
    expect(within(dialog).getByRole("button", { name: "Reembolsar 120,00 €" })).toBeVisible();
    cleanup();
    await renderBlock(branding, { locale: "en" });
    fireEvent.click(await screen.findByRole("button", { name: "Refund Pack (€120.00)" }));
    dialog = screen.getByRole("dialog", { name: "Refund a card payment" });
    expect(dialog).toHaveTextContent("Pack: paid by card €120.00; left to refund €120.00.");
    fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Mistake" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Continue" }));
    expect(dialog).toHaveTextContent(
      "€120.00 will be refunded to Laura Serra Vidal for the payment «Pack».",
    );
    expect(within(dialog).getByRole("button", { name: "Refund €120.00" })).toBeVisible();
  });
});

describe("PAY-06 (decision of 13 Nov 2026): D10 marks a card payment under dispute", () => {
  it("shows the mark on the disputed row only, read-only, with the amount, the reason and the date", async () => {
    server.use(
      http.get("*/api/v1/upfront-payments", () =>
        HttpResponse.json({
          items: [
            {
              amountDue: { amountMinor: 1500, currency: "EUR" },
              amountPaid: { amountMinor: 1500, currency: "EUR" },
              concept: "SINGLE_CLASS",
              createdAt: "2026-10-20T16:00:00Z",
              dispute: {
                amount: { amountMinor: 1500, currency: "EUR" },
                closedAt: null,
                openedAt: "2026-11-10T09:00:00Z",
                providerRef: "dp_test_d10",
                reason: "duplicate",
                status: "needs_response",
              },
              id: "54000000-0000-4000-8000-000000000201",
              memberId: "member-laura",
              provider: { type: "STRIPE" },
              refunds: [],
              status: "PAID",
            },
            {
              amountDue: { amountMinor: 3000, currency: "EUR" },
              amountPaid: { amountMinor: 3000, currency: "EUR" },
              concept: "ENTRY_FEE",
              createdAt: "2026-08-11T09:00:00Z",
              dispute: null,
              id: "54000000-0000-4000-8000-000000000001",
              memberId: "member-laura",
              provider: { channel: "CASH", type: "MANUAL" },
              refunds: [],
              status: "PAID",
            },
          ],
        }),
      ),
    );
    await renderBlock();
    const disputed = (await screen.findByText("Classe individual")).closest("li");
    if (disputed === null) throw new Error("Missing the disputed row");
    expect(within(disputed).getByText("En disputa")).toHaveClass("ah-tone--danger");
    expect(disputed).toHaveTextContent(
      "El titular ha disputat 15,00 € al banc (cobrament duplicat) el 10/11/2026. Respon la disputa des del tauler de Stripe.",
    );
    // The mark changes nothing: the payment stays «cobrat».
    expect(within(disputed).getByText("cobrat")).toBeVisible();
    expect(screen.getByText("Entrada").closest("li")).not.toHaveTextContent("disputa");
  });
});
