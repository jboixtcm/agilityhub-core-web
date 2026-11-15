import type { components } from "@agilityhub/api-client";
import brandingFixture from "@agilityhub/api-client/mocks/branding-canic";
import { createI18n, type Locale } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import { DisputeMark, disputeState } from "./DisputeMark";

type PaymentDispute = components["schemas"]["PaymentDispute"];

const branding: Branding = {
  ...brandingFixture,
  locales: ["ca", "es", "en"],
  theme: { ...brandingFixture.theme, mode: "dark" },
};

/** A fictional dispute of a 120 € card payment, opened late on 12 Nov 2026 (UTC). */
const open: PaymentDispute = {
  amount: { amountMinor: 12000, currency: "EUR" },
  closedAt: null,
  openedAt: "2026-11-12T23:30:00Z",
  providerRef: "dp_test_pay06",
  reason: "fraudulent",
  status: "needs_response",
};

async function renderMark(dispute: PaymentDispute, locale: Locale = "ca") {
  const i18n = await createI18n({
    branding,
    browserLanguages: [locale],
    initialNamespaces: ["common"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <DisputeMark dispute={dispute} />
      </BrandingProvider>
    </I18nextProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe("PAY-06 (decision of 13 Nov 2026): the mark of a disputed card payment", () => {
  it("reads the state from Stripe's status and closedAt", () => {
    expect(disputeState(open)).toBe("open");
    expect(disputeState({ ...open, status: "warning_needs_response" })).toBe("open");
    expect(disputeState({ ...open, status: "under_review" })).toBe("open");
    const closedAt = "2026-12-20T10:00:00Z";
    expect(disputeState({ ...open, closedAt, status: "won" })).toBe("won");
    expect(disputeState({ ...open, closedAt, status: "lost" })).toBe("lost");
    expect(disputeState({ ...open, closedAt, status: "warning_closed" })).toBe("closed");
  });

  it("an open dispute: the danger mark, the amount, Stripe's reason in words, the club's day and where to answer it", async () => {
    await renderMark(open);
    const badge = screen.getByText("En disputa");
    expect(badge).toHaveClass("ah-tone--danger");
    expect(
      screen.getByText(
        "El titular ha disputat 120,00 € al banc (frau) el 13/11/2026. Respon la disputa des del tauler de Stripe.",
      ),
    ).toBeVisible();
  });

  it("a closed dispute: won, lost or closed, with both dates; an unknown reason as Stripe writes it", async () => {
    const closedAt = "2026-12-20T10:00:00Z";
    await renderMark({ ...open, closedAt, reason: "product_not_received", status: "won" });
    expect(screen.getByText("Disputa guanyada")).toHaveClass("ah-tone--success");
    expect(
      screen.getByText(
        "Disputa de 120,00 € (servei no rebut) oberta el 13/11/2026 i tancada per Stripe el 20/12/2026.",
      ),
    ).toBeVisible();
    cleanup();
    await renderMark({ ...open, closedAt, reason: "bank_cannot_process", status: "lost" });
    expect(screen.getByText("Disputa perduda")).toHaveClass("ah-tone--danger");
    expect(screen.getByText(/\(motiu: bank_cannot_process\)/u)).toBeVisible();
    cleanup();
    await renderMark({ ...open, closedAt, reason: null, status: "warning_closed" });
    expect(screen.getByText("Disputa tancada")).toHaveClass("ah-tone--neutral");
    expect(screen.getByText(/\(sense motiu\)/u)).toBeVisible();
  });

  it("speaks es and en", async () => {
    await renderMark(open, "es");
    expect(screen.getByText("En disputa")).toBeVisible();
    expect(
      screen.getByText(
        "El titular ha disputado 120,00 € en su banco (fraude) el 13/11/2026. Responde a la disputa desde el panel de Stripe.",
      ),
    ).toBeVisible();
    cleanup();
    await renderMark({ ...open, closedAt: "2026-12-20T10:00:00Z", status: "lost" }, "en");
    expect(screen.getByText("Dispute lost")).toBeVisible();
    expect(screen.getByText(/^Dispute of €120\.00 \(fraud\) opened on /u)).toBeVisible();
  });
});
