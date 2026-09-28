import { createApiClient } from "@agilityhub/api-client";
import { mockScenario, resetCensusRecordState } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { DogRecordPage, MemberRecordPage } from "./CensusRecordPage";

const branding: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetCensusRecordState();
  mockScenario("admin");
});

afterAll(() => {
  server.close();
});

async function renderRecord(kind: "dog" | "member", recordBranding: Branding = branding) {
  const i18n = await createI18n({
    branding: recordBranding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-census", "errors"],
    storage: undefined,
  });
  const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={recordBranding}>
        {kind === "member" ? (
          <MemberRecordPage client={client} id="member-laura" />
        ) : (
          <DogRecordPage client={client} id="dog-duna" />
        )}
      </BrandingProvider>
    </I18nextProvider>,
  );
}

describe("T-03-39 D10 member record", () => {
  it("renders the approved badges, masked account, consent warning, dog rights, and WhatsApp URL", async () => {
    await renderRecord("member");

    expect(await screen.findByRole("heading", { name: "Laura Serra Vidal" })).toBeVisible();
    expect(screen.getByText("núm. 87")).toBeVisible();
    expect(screen.getByText("alta des de 2023")).toBeVisible();
    expect(screen.getByText("titular del grup familiar")).toBeVisible();
    expect(screen.getByText("···· ···· ···· ···· 2231", { exact: false })).toBeVisible();
    expect(screen.getByText("canvi només admin")).toBeVisible();
    expect(await screen.findByText("Quota mensual")).toBeVisible();
    expect(screen.getByText("Mode de facturació")).toBeVisible();
    expect(screen.getByText("alumne", { exact: true })).toBeVisible();
    expect(
      screen.getByText("No autoritza l'ús de la seva imatge: no publiqueu fotos on surti ella."),
    ).toBeVisible();
    expect(screen.getByText("Pack 10: 6/4 · caduca 12-11")).toBeVisible();
    expect(screen.getByText("Pot entrenar sol")).toBeVisible();
    expect(screen.getByRole("link", { name: /WhatsApp/u })).toHaveAttribute(
      "href",
      "https://wa.me/34655100101",
    );
  });

  it("blocks and unblocks new bookings with the required reason", async () => {
    await renderRecord("member");
    await screen.findByRole("heading", { name: "Laura Serra Vidal" });

    fireEvent.click(screen.getByRole("button", { name: "Bloqueja les reserves" }));
    const blockDialog = screen.getByRole("dialog", { name: "Bloqueja les reserves" });
    fireEvent.change(within(blockDialog).getByLabelText("Motiu del bloqueig"), {
      target: { value: "Rebut pendent" },
    });
    fireEvent.click(within(blockDialog).getByRole("button", { name: "Bloqueja les reserves" }));

    expect(await screen.findByText("Reserves bloquejades")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Desbloqueja les reserves" }));
    await waitFor(() => {
      expect(screen.queryByText("Reserves bloquejades")).not.toBeInTheDocument();
    });
  });

  it("maps STALE_VERSION when another administrator edited the member", async () => {
    server.use(
      http.patch("*/api/v1/members/:id", () =>
        HttpResponse.json(
          { code: "STALE_VERSION", details: {}, message: "Stale version", traceId: "test" },
          { status: 409 },
        ),
      ),
    );
    await renderRecord("member");
    await screen.findByRole("heading", { name: "Laura Serra Vidal" });

    const editButton = screen.getAllByRole("button", { name: "Edita" }).at(0);
    if (editButton === undefined) {
      throw new Error("Expected the member edit button");
    }
    fireEvent.click(editButton);
    const drawer = screen.getByRole("dialog", { name: "Edita l'abonat" });
    fireEvent.change(within(drawer).getByLabelText("Nom"), { target: { value: "Lara" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Desa" }));

    expect(
      await within(drawer).findByText(
        "Aquest element s'ha modificat des d'un altre lloc. Actualitzeu-lo i torneu-ho a provar.",
      ),
    ).toBeVisible();
  });
});

describe("T-01-11 E4-W16 step 1 (INC-15, E47): «Entra com l'abonat» opens the api's launchUrl", () => {
  function recordOpens() {
    const spy = vi.spyOn(window, "open").mockImplementation(() => null);
    return {
      get opened() {
        return spy.mock.calls;
      },
      restore: () => {
        spy.mockRestore();
      },
    };
  }

  async function impersonate() {
    await renderRecord("member");
    await screen.findByRole("heading", { name: "Laura Serra Vidal" });
    fireEvent.click(screen.getByRole("button", { name: "Entra com l'abonat" }));
    const dialog = screen.getByRole("dialog", { name: "Entra com l'abonat" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Entra com l'abonat" }));
    return dialog;
  }

  it("opens exactly the launchUrl with the one-time code, in a new tab, and never writes the token into a URL", async () => {
    const opens = recordOpens();
    await impersonate();

    await waitFor(() => {
      expect(opens.opened).toHaveLength(1);
    });
    expect(opens.opened[0]).toEqual([
      "http://127.0.0.1:4173/entrar?handoff=mock-impersonation-handoff-1",
      "_blank",
      "noopener,noreferrer",
    ]);
    expect(String(opens.opened[0]?.[0])).not.toContain("mock-impersonation-token");
    expect(window.location.hash).toBe("");
    opens.restore();
  });

  it("a response without launchUrl is an error in the dialog and opens nothing (no same-origin guess)", async () => {
    server.use(
      http.post("*/api/v1/members/:id/impersonation-token", () =>
        HttpResponse.json(
          { expiresAt: "2026-09-06T16:00:00Z", token: "mock-impersonation-token" },
          { status: 201 },
        ),
      ),
    );
    const opens = recordOpens();
    const dialog = await impersonate();

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "No s'ha pogut completar l'acció.",
    );
    expect(opens.opened).toEqual([]);
    opens.restore();
  });
});

describe("T-03-39 E4-W17 step 9 (AGENTS rule 1): D10's «Pagament» row names a cash member's method", () => {
  async function serveCashMember() {
    const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
    const { data } = await client.GET("/members/{id}/overview", {
      params: { path: { id: "member-laura" } },
    });
    if (data === undefined) throw new TypeError("The mock overview did not answer");
    const overview = {
      ...data,
      member: {
        ...data.member,
        paymentMethod: { channel: "Efectiu", holderName: null, maskedAccount: null, type: "MANUAL" },
      },
    };
    server.use(http.get("*/api/v1/members/:id/overview", () => HttpResponse.json(overview)));
  }

  function paymentRow(label: string): HTMLElement {
    const term = screen.getByText(label, { selector: "dt" });
    const value = term.nextElementSibling;
    if (!(value instanceof HTMLElement)) throw new TypeError("Missing the payment value");
    return value;
  }

  it("reads «Efectiu» in ca, «Efectivo» in es and «Cash» in en, never the raw MANUAL", async () => {
    await serveCashMember();
    await renderRecord("member");
    await screen.findByRole("heading", { name: "Laura Serra Vidal" });
    expect(paymentRow("Pagament")).toHaveTextContent(/^Efectiu/u);
    expect(screen.queryByText(/MANUAL/u)).not.toBeInTheDocument();

    // A club that offers the three locales (the Cànic's fixture offers ca and es).
    const trilingual: Branding = { ...branding, locales: ["ca", "es", "en"] };
    for (const [language, rowLabel, method] of [
      ["es", "Pago", /^Efectivo/u],
      ["en", "Payment", /^Cash/u],
    ] as const) {
      cleanup();
      await serveCashMember();
      const i18n = await createI18n({
        branding: trilingual,
        browserLanguages: [language],
        initialNamespaces: ["admin-census", "errors"],
        storage: undefined,
      });
      render(
        <I18nextProvider i18n={i18n}>
          <BrandingProvider branding={trilingual}>
            <MemberRecordPage
              client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
              id="member-laura"
            />
          </BrandingProvider>
        </I18nextProvider>,
      );
      await screen.findByRole("heading", { name: "Laura Serra Vidal" });
      expect(paymentRow(rowLabel)).toHaveTextContent(method);
      expect(screen.queryByText(/MANUAL/u)).not.toBeInTheDocument();
    }
  });
});

describe("T-03-34 (front) E4-W16 step 7 (INC-27, R-03-30): D10 without BILLING keeps its actions", () => {
  const noBilling: Branding = {
    ...branding,
    modules: branding.modules.filter((module) => module !== "BILLING"),
  };

  it("keeps «Bloqueja les reserves», «Inactivitat», «Baixa (amb data)», «Tota l'auditoria ›» and the recent changes; only the invoice rows and «Tots els rebuts» go", async () => {
    mockScenario("adminNoBilling");
    await renderRecord("member", noBilling);
    await screen.findByRole("heading", { name: "Laura Serra Vidal" });

    expect(screen.getByRole("heading", { name: "Auditoria" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Bloqueja les reserves" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Inactivitat" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Baixa (amb data)" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Tota l'auditoria ›" })).toHaveAttribute(
      "href",
      "/abonats/member-laura/auditoria",
    );
    expect(screen.getByText(/Darrers canvis:/u)).toBeVisible();
    expect(screen.queryByRole("link", { name: /Tots els rebuts/u })).not.toBeInTheDocument();
    expect(screen.queryByText("cobrat")).not.toBeInTheDocument();
    expect(screen.queryByText("remesat")).not.toBeInTheDocument();
    expect(screen.queryByText("Rebuts recents i auditoria")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Bloqueja les reserves" }));
    expect(screen.getByRole("dialog", { name: "Bloqueja les reserves" })).toBeVisible();
  });

  it("with BILLING the card keeps its invoice rows and «Tots els rebuts»", async () => {
    await renderRecord("member");
    await screen.findByRole("heading", { name: "Laura Serra Vidal" });

    expect(screen.getByRole("heading", { name: "Rebuts recents i auditoria" })).toBeVisible();
    expect(screen.getByRole("link", { name: /Tots els rebuts/u })).toHaveAttribute(
      "href",
      "/facturacio",
    );
    expect(screen.getByRole("button", { name: "Bloqueja les reserves" })).toBeVisible();
  });
});

/**
 * The D10 overview the api sends for a member without a number whose dogs have pending documents
 * (E4-W13 report, question 4): the mock's own overview, with `memberNumber: null` and the
 * documents' type keys in `pendingDocuments`.
 */
async function overviewWithoutNumber(pendingDocuments: readonly (readonly string[])[]) {
  const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
  const { data } = await client.GET("/members/{id}/overview", {
    params: { path: { id: "member-laura" } },
  });
  if (data === undefined) throw new TypeError("The mock overview did not answer");
  const overview = {
    ...data,
    dogs: data.dogs.map((dog, index) => ({
      ...dog,
      pendingDocuments: [...(pendingDocuments[index] ?? [])],
    })),
    member: { ...data.member, memberNumber: null },
  };
  server.use(http.get("*/api/v1/members/:id/overview", () => HttpResponse.json(overview)));
}

describe("T-03-39 E4-W15 step 8 D10 on the real core (E4-W13 report, question 4)", () => {
  it("names a pending document by its type's label, as D2 does, and a type the club no longer lists as «Document pendent»", async () => {
    await overviewWithoutNumber([[], ["VACCINATION_CARD", "RETIRED_TYPE"]]);
    await renderRecord("member");
    await screen.findByRole("heading", { name: "Laura Serra Vidal" });

    const rock = screen.getByRole("link", { name: /Rock/u });
    expect(await within(rock).findByText("Cartilla de vacunes")).toHaveClass("ah-badge");
    expect(within(rock).getByText("Document pendent")).toHaveClass("ah-badge");
    expect(screen.queryByText("VACCINATION_CARD")).not.toBeInTheDocument();
    expect(screen.queryByText("RETIRED_TYPE")).not.toBeInTheDocument();
  });

  it("never shows the raw key while the labels load or when they cannot be read", async () => {
    await overviewWithoutNumber([["VACCINATION_CARD"]]);
    server.use(
      http.get("*/api/v1/parameters/:key", () =>
        HttpResponse.json(
          { code: "FORBIDDEN", details: {}, message: "Forbidden", traceId: "test" },
          { status: 403 },
        ),
      ),
    );
    await renderRecord("member");
    await screen.findByRole("heading", { name: "Laura Serra Vidal" });

    const duna = screen.getByRole("link", { name: /Duna/u });
    expect(within(duna).getByText("Document pendent")).toHaveClass("ah-badge");
    expect(screen.queryByText("VACCINATION_CARD")).not.toBeInTheDocument();
  });

  it("shows no «núm.» badge for a member without a number", async () => {
    await overviewWithoutNumber([]);
    await renderRecord("member");
    const heading = await screen.findByRole("heading", { name: "Laura Serra Vidal" });

    const identity = heading.parentElement;
    if (identity === null) throw new TypeError("The heading has no identity block");
    expect(within(identity).queryByText(/^núm\./u)).not.toBeInTheDocument();
    expect(within(identity).getByText("alta des de 2023")).toBeVisible();
  });
});

describe("T-03-38 dog record", () => {
  it("shows the complete dog record and changes level without a booking warning", async () => {
    await renderRecord("dog");
    expect(await screen.findByRole("heading", { name: "Duna" })).toBeVisible();
    expect(screen.getByText("941000000000001")).toBeVisible();
    expect(screen.getAllByText("Cartilla de vacunes")[0]).toBeVisible();
    expect(screen.getByText("Treballar la calma a la sortida.")).toBeVisible();
    expect(screen.getByText("Guia")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Canvia el nivell" }));
    const dialog = screen.getByRole("dialog", { name: "Canvia el nivell" });
    fireEvent.change(within(dialog).getByLabelText("Nivell nou"), {
      target: { value: "level-d" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Desa" }));

    expect(await screen.findByText("El nivell s'ha actualitzat.")).toBeVisible();
    expect(screen.queryByText(/reserva futura/u)).not.toBeInTheDocument();
    expect(screen.getByText("Nivell D")).toBeVisible();
  });

  it("deactivates and reactivates a dog without deleting its record", async () => {
    await renderRecord("dog");
    await screen.findByRole("heading", { name: "Duna" });

    fireEvent.click(screen.getByRole("button", { name: "Dona de baixa" }));
    const dialog = screen.getByRole("dialog", { name: "Dona de baixa el gos" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Dona de baixa" }));
    expect(await screen.findByText("El gos s'ha donat de baixa.")).toBeVisible();
    expect(screen.getByText("baixa")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Reactiva" }));
    const reactivation = screen.getByRole("dialog", { name: "Reactiva el gos" });
    fireEvent.click(within(reactivation).getByRole("button", { name: "Reactiva" }));
    expect(await screen.findByText("El gos s'ha reactivat.")).toBeVisible();
    expect(screen.getByText("actiu")).toBeVisible();
  });
});
