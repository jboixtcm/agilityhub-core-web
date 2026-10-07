import { server } from "@agilityhub/api-client/mocks/server";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { ProfileLifecycleSection } from "../profile/ProfileLifecycleSection";
import { e8Branding, e8Client, renderE8, setupE8World } from "../test/e8";

import { InvoicesPage } from "./InvoicesPage";

setupE8World();

describe("T-12-26 member receipts", () => {
  it("lists frozen descriptions, localized amounts and the family-group receipt", async () => {
    await renderE8(<InvoicesPage client={e8Client()} />);
    expect(await screen.findByText("Quota setembre 2026")).toBeVisible();
    expect(screen.getAllByText("60,00 €")).toHaveLength(3);
    expect(screen.getByText("Grup familiar")).toBeVisible();
    expect(screen.getByRole("link", { name: /Setembre 2026/u })).toHaveAttribute(
      "href",
      "/rebuts/51000000-0000-4000-8000-000000000001",
    );
  });

  it("T-12-32 keeps the frozen Catalan description while an English member sees English month and money", async () => {
    await renderE8(<InvoicesPage client={e8Client("en")} />, { locale: "en" });
    expect(await screen.findByText("Quota setembre 2026")).toBeVisible();
    expect(screen.getByRole("link", { name: /September 2026/u })).toHaveTextContent("€60.00");
  });

  it("shows the masked method in detail and requests the PDF document", async () => {
    const requested: string[] = [];
    const client = e8Client();
    vi.stubGlobal(
      "open",
      vi.fn(() => null),
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    server.events.on("request:start", ({ request }) =>
      requested.push(new URL(request.url).pathname),
    );
    await renderE8(
      <InvoicesPage client={client} invoiceId="51000000-0000-4000-8000-000000000001" />,
    );
    expect(await screen.findByText("···· 2231", { exact: false })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Descarrega el justificant" }));
    await waitFor(() => {
      expect(requested).toContain(
        "/api/v1/me/invoices/51000000-0000-4000-8000-000000000001/document",
      );
    });
  });

  it("shows a fully refunded PAID receipt as refunded in its detail", async () => {
    server.use(
      http.get("*/api/v1/me/invoices/:id", () =>
        HttpResponse.json({
          displayNumber: "2026-0812",
          familyGroup: false,
          id: "receipt-refunded",
          issueDate: "2026-08-01",
          lines: [
            {
              description: "Quota agost 2026",
              origin: "MONTHLY_FEE",
              total: { amountMinor: 6000, currency: "EUR" },
            },
          ],
          paidAt: "2026-08-05T09:00:00Z",
          paymentMethod: {
            channel: null,
            holderName: "Laura Serra Vidal",
            last4: null,
            mandateRef: null,
            maskedAccount: "···· 2231",
            type: "SEPA_DD",
          },
          period: "2026-08",
          refundedTotal: { amountMinor: 6000, currency: "EUR" },
          status: "PAID",
          total: { amountMinor: 6000, currency: "EUR" },
        }),
      ),
    );
    await renderE8(<InvoicesPage client={e8Client()} invoiceId="receipt-refunded" />);
    expect(await screen.findByText("reemborsat")).toBeVisible();
  });

  it("shows the invalid-card banner and POST action from /me.paymentMethod.invalid", async () => {
    const posted: string[] = [];
    const client = e8Client();
    server.events.on("request:start", ({ request }) => {
      if (request.method === "POST") posted.push(new URL(request.url).pathname);
    });
    await renderE8(
      <InvoicesPage
        client={client}
        paymentMethod={{ invalid: true, type: "CARD" }}
      />,
      { scenario: "memberCardInvalid" },
    );
    expect(await screen.findByText(/No hem pogut cobrar/u)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Actualitza la targeta" }));
    await waitFor(() => {
      expect(posted).toContain("/api/v1/me/card-setup");
    });
  });

  it("hides the profile receipt row when BILLING is off", async () => {
    const branding = {
      ...e8Branding,
      modules: e8Branding.modules.filter((item) => item !== "BILLING"),
    };
    await renderE8(
      <ProfileLifecycleSection
        client={e8Client()}
        logoutDisabled={false}
        onLogout={() => undefined}
      />,
      { branding, scenario: "billingOff" },
    );
    expect(screen.queryByRole("link", { name: "Rebuts" })).not.toBeInTheDocument();
  });

  it("disables load-more while reading and de-duplicates overlapping pages by receipt id", async () => {
    const receipt = (id: string, displayNumber: string, period: string) => ({
      displayNumber,
      familyGroup: false,
      id,
      issueDate: `${period}-01`,
      lines: [
        {
          description: `Quota ${period}`,
          origin: "MONTHLY_FEE",
          total: { amountMinor: 6000, currency: "EUR" },
        },
      ],
      paidAt: null,
      paymentMethod: {
        channel: null,
        holderName: "Laura Serra Vidal",
        last4: null,
        mandateRef: null,
        maskedAccount: "···· 2231",
        type: "SEPA_DD",
      },
      period,
      refundedTotal: { amountMinor: 0, currency: "EUR" },
      status: "PAID",
      total: { amountMinor: 6000, currency: "EUR" },
    });
    let release: (() => void) | undefined;
    server.use(
      http.get("*/api/v1/me/invoices", async ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get("page") ?? 0);
        if (page === 1) {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        return HttpResponse.json({
          items:
            page === 0
              ? [receipt("receipt-a", "2026-0901", "2026-09")]
              : [
                  receipt("receipt-a", "2026-0901", "2026-09"),
                  receipt("receipt-b", "2026-0801", "2026-08"),
                ],
          page,
          size: 20,
          totalItems: 2,
          totalPages: 2,
        });
      }),
    );
    await renderE8(<InvoicesPage client={e8Client()} />);
    const more = await screen.findByRole("button", { name: "Carrega'n més" });
    fireEvent.click(more);
    expect(more).toBeDisabled();
    await waitFor(() => {
      expect(release).toBeTypeOf("function");
    });
    release?.();
    await screen.findByRole("link", { name: /Agost 2026/u });
    expect(document.querySelectorAll('a[href="/rebuts/receipt-a"]')).toHaveLength(1);
    expect(document.querySelectorAll('a[href="/rebuts/receipt-b"]')).toHaveLength(1);
  });
});
