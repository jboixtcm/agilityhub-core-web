import { createApiClient } from "@agilityhub/api-client";
import { mockScenario, resetCensusRecordState } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

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

async function renderRecord(kind: "dog" | "member") {
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-census", "errors"],
    storage: undefined,
  });
  const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
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
