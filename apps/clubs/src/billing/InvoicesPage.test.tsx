import { server } from "@agilityhub/api-client/mocks/server";
import { fireEvent, screen, waitFor } from "@testing-library/react";
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

  it("shows the invalid-card banner and POST action only for the failed CARD scenario", async () => {
    const posted: string[] = [];
    const client = e8Client();
    server.events.on("request:start", ({ request }) => {
      if (request.method === "POST") posted.push(new URL(request.url).pathname);
    });
    await renderE8(<InvoicesPage client={client} />, { scenario: "memberCardInvalid" });
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
});
