import { createApiClient } from "@agilityhub/api-client";
import {
  ERASED_MEMBER_ID,
  mockScenario,
  resetCensusRecordState,
} from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { CountersRefreshContext } from "../dashboard/counters";

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
  window.history.pushState(null, "", "/");
});

afterAll(() => {
  server.close();
});

async function renderRecord(
  kind: "dog" | "member",
  recordBranding: Branding = branding,
  memberId = "member-laura",
  language = "ca",
  refreshCounters = () => undefined,
) {
  const i18n = await createI18n({
    branding: recordBranding,
    browserLanguages: [language],
    initialNamespaces: ["admin-census", "errors"],
    storage: undefined,
  });
  const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={recordBranding}>
        <CountersRefreshContext.Provider value={refreshCounters}>
          {kind === "member" ? (
            <MemberRecordPage client={client} id={memberId} />
          ) : (
            <DogRecordPage client={client} id="dog-duna" />
          )}
        </CountersRefreshContext.Provider>
      </BrandingProvider>
    </I18nextProvider>,
  );
}

describe("T-03-39 D10 member record", () => {
  it("E8-W05 #4: a pack adjustment refreshes both billing and the D10 dog row", async () => {
    await renderRecord("member");
    expect(await screen.findByText("Pack 10: 6/4 · caduca 12-11")).toBeVisible();
    const initialBillingPack = (await screen.findByText(/Rock · Pack 10/u)).closest(
      ".member-billing__pack",
    );
    expect(initialBillingPack).toHaveTextContent("6 consumides");
    expect(initialBillingPack).toHaveTextContent("4 disponibles");

    fireEvent.click(screen.getByRole("button", { name: "Ajusta" }));
    const dialog = screen.getByRole("dialog", { name: "Ajusta" });
    fireEvent.change(within(dialog).getByLabelText("Variació de sessions"), {
      target: { value: "2" },
    });
    fireEvent.change(within(dialog).getByLabelText("Motiu"), {
      target: { value: "Correcció" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Desa" }));

    expect(await screen.findByText("Pack 10: 4/6 · caduca 12-11")).toBeVisible();
    const refreshedBillingPack = screen.getByText(/Rock · Pack 10/u).closest(
      ".member-billing__pack",
    );
    expect(refreshedBillingPack).toHaveTextContent("4 consumides");
    expect(refreshedBillingPack).toHaveTextContent("6 disponibles");
  });

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

  it("E8-W03 round 2 #18 refreshes dashboard counters after a lifecycle write", async () => {
    const refreshCounters = vi.fn();
    await renderRecord("member", branding, "member-laura", "ca", refreshCounters);
    await screen.findByRole("heading", { name: "Laura Serra Vidal" });
    fireEvent.click(screen.getByRole("button", { name: "Baixa (amb data)" }));
    const drawer = await screen.findByRole("dialog", { name: "Baixa (amb data)" });
    fireEvent.change(await within(drawer).findByLabelText("Data d'efecte"), { target: { value: "2026-11-30" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Programa la baixa" }));
    const confirmation = screen.getAllByRole("dialog", { name: "Programa la baixa" }).at(-1);
    if (confirmation === undefined) throw new TypeError("Missing direct-leave confirmation");
    fireEvent.click(within(confirmation).getByRole("button", { name: "Programa la baixa" }));
    await waitFor(() => { expect(refreshCounters).toHaveBeenCalledTimes(1); });
  });

  it("E8-W03 round 2 #8 opens the exact period carried by queue navigation", async () => {
    const periodId = "62000000-0000-4000-8000-000000000002";
    window.history.pushState(null, "", `/abonats/member-eva?calaix=inactivitat&period=${periodId}`);
    await renderRecord("member", branding, "member-eva");
    const drawer = await screen.findByRole("dialog", { name: "Inactivitat" });
    expect(await within(drawer).findByText("Període obert")).toBeVisible();
    expect(within(drawer).getByText("actiu", { exact: true })).toBeVisible();
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

describe("E7-W01 round 2 #4: D10's «Preferències d'avisos» reads its own route", () => {
  it("an overview without the preferences (the free-form field the api may shape otherwise) still shows the block, from GET /members/{id}/notification-preferences", async () => {
    const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
    const { data } = await client.GET("/members/{id}/overview", {
      params: { path: { id: "member-laura" } },
    });
    if (data === undefined) throw new TypeError("The mock overview did not answer");
    const overview: Record<string, unknown> = { ...data };
    delete overview.notificationPreferences;
    server.use(http.get("*/api/v1/members/:id/overview", () => HttpResponse.json(overview)));
    await renderRecord("member");
    await screen.findByRole("heading", { name: "Laura Serra Vidal" });
    expect(
      await screen.findByRole("heading", {
        name: "Preferències d'avisos (mantenibles aquí i al perfil)",
      }),
    ).toBeVisible();
    expect(await screen.findByLabelText("Recordatori de classe")).toBeVisible();
    expect(screen.getByRole("link", { name: "Avisos enviats ›" })).toBeVisible();
  });
});

describe("T-14-19 E7-W06 step 5 (ruling E82, E6-W04 Q3): D10 of an erased member (S14 §5, R-14-15)", () => {
  const erased = "Aquest abonat ha estat suprimit i ja no es pot modificar.";

  it("E7-W06 step 5: an erased member's «Preferències d'avisos» say MEMBER_ERASED as final — its own message, no «Torna-ho a provar» — and ask nothing the api refuses with 409", async () => {
    const lines: string[] = [];
    const listener = ({ request }: { request: Request }) => {
      const url = new URL(request.url);
      lines.push(`${request.method} ${url.pathname.replace(/^\/api\/v1/u, "")}`);
    };
    server.events.on("request:start", listener);
    try {
      await renderRecord("member", branding, ERASED_MEMBER_ID);
      expect(await screen.findByRole("heading", { name: "Abonat suprimit #64" })).toBeVisible();
      const heading = await screen.findByRole("heading", {
        name: "Preferències d'avisos (mantenibles aquí i al perfil)",
      });
      const block = heading.closest<HTMLElement>(".ah-card");
      if (block === null) throw new TypeError("The preferences block has no card");
      expect(within(block).getByText(erased)).toBeVisible();
      expect(within(block).queryByRole("button", { name: "Torna-ho a provar" })).toBeNull();
      expect(within(block).queryByLabelText("Recordatori de classe")).toBeNull();
      expect(lines).toContain(`GET /members/${ERASED_MEMBER_ID}/overview`);
      expect(lines.filter((line) => line.includes("/notification-preferences"))).toEqual([]);
    } finally {
      server.events.removeListener("request:start", listener);
    }
  });

  it("E7-W06 step 5: a record read answered 409 MEMBER_ERASED is final — its own message, no «Torna-ho a provar»", async () => {
    server.use(
      http.get("*/api/v1/members/:id/overview", () =>
        HttpResponse.json(
          { code: "MEMBER_ERASED", details: {}, message: "Member erased", traceId: "t-d10" },
          { status: 409 },
        ),
      ),
    );
    await renderRecord("member");
    expect(await screen.findByRole("alert")).toHaveTextContent(erased);
    expect(screen.queryByRole("button", { name: "Torna-ho a provar" })).toBeNull();
    expect(screen.queryByText("No s'ha pogut carregar la fitxa.")).toBeNull();
  });
});

describe("E7-W07 step 3 (E7-W06 review #4, A8; S14 §5, T-14-19): D10's changes of an erased member are final", () => {
  const erased = "Aquest abonat ha estat suprimit i ja no es pot modificar.";
  /** Every change D10 offers on a member; none of them is left once the member is erased. */
  const changeButtons = [
    "Edita",
    "Reenvia accés",
    "Entra com l'abonat",
    "Bloqueja les reserves",
    "Desbloqueja les reserves",
    "Inactivitat",
    "Baixa (amb data)",
    "Registra un pagament",
    "Ajusta",
  ];
  function expectNoChangeOffered() {
    for (const name of changeButtons) {
      expect(screen.queryAllByRole("button", { name }), name).toEqual([]);
    }
  }

  function headerAction(name: string) {
    const actions = document.querySelector<HTMLElement>(".census-record__header-actions");
    if (actions === null) throw new TypeError("D10 has no header actions");
    fireEvent.click(within(actions).getByRole("button", { name }));
  }

  function rowEdit(label: string) {
    const row = screen
      .getByText(label, { selector: "dt" })
      .closest<HTMLElement>(".census-record__data-row");
    if (row === null) throw new TypeError(`D10 has no «${label}» row`);
    fireEvent.click(within(row).getByRole("button", { name: "Edita" }));
  }

  /** Laura's record, read while her booking block was active (the unblock's case). */
  async function serveBlockedLaura() {
    const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
    const { data } = await client.GET("/members/{id}/overview", {
      params: { path: { id: "member-laura" } },
    });
    if (data === undefined) throw new TypeError("The mock overview did not answer");
    const overview = {
      ...data,
      member: {
        ...data.member,
        bookingBlock: {
          active: true,
          byAccountId: null,
          reason: "Rebut pendent",
          since: "2026-09-06T15:00:00Z",
        },
      },
    };
    server.use(http.get("*/api/v1/members/:id/overview", () => HttpResponse.json(overview)));
  }

  interface ErasedAction {
    blocked?: boolean;
    method: "delete" | "patch" | "post" | "put";
    name: string;
    path: string;
    /** What a saved change would announce: it must never show. */
    saved?: RegExp | string;
    /** Opens the action and sends it; its dialog, or `undefined` when it has none. */
    send: () => HTMLElement | undefined;
    /** The dialog's button that would send the same request again. */
    submit?: string;
    /** What the record still shows: the change was not applied. */
    unchanged: () => void;
  }

  const actions: ErasedAction[] = [
    {
      method: "patch",
      name: "«Edita» the member (PATCH /members/{id})",
      path: "/members/:id",
      saved: "Les dades de l'abonat s'han desat.",
      send: () => {
        headerAction("Edita");
        const drawer = screen.getByRole("dialog", { name: "Edita l'abonat" });
        fireEvent.change(within(drawer).getByLabelText("Nom"), { target: { value: "Lara" } });
        fireEvent.click(within(drawer).getByRole("button", { name: "Desa" }));
        return drawer;
      },
      submit: "Desa",
      unchanged: () => {
        expect(screen.getByRole("heading", { name: "Laura Serra Vidal" })).toBeVisible();
      },
    },
    {
      method: "patch",
      name: "«Pagament» › «Edita» (PATCH /members/{id}/payment-method)",
      path: "/members/:id/payment-method",
      saved: "El mètode de pagament s'ha actualitzat.",
      send: () => {
        rowEdit("Pagament");
        const dialog = screen.getByRole("dialog", { name: "Mètode de pagament" });
        fireEvent.change(within(dialog).getByLabelText("IBAN nou"), {
          target: { value: "ES9121000418450200051332" },
        });
        fireEvent.click(within(dialog).getByRole("button", { name: "Desa" }));
        return dialog;
      },
      submit: "Desa",
      unchanged: () => {
        expect(screen.getAllByText("···· ···· ···· ···· 2231", { exact: false }).length).toBeGreaterThan(0);
      },
    },
    {
      method: "put",
      name: "«Rols d'accés» › «Edita» (PUT /members/{id}/roles)",
      path: "/members/:id/roles",
      saved: "Els rols d'accés s'han actualitzat.",
      send: () => {
        rowEdit("Rols d'accés");
        const dialog = screen.getByRole("dialog", { name: "Rols d'accés" });
        fireEvent.click(within(dialog).getByRole("button", { name: "Desa" }));
        return dialog;
      },
      submit: "Desa",
      unchanged: () => undefined,
    },
    {
      method: "post",
      name: "«Bloqueja les reserves» (POST /members/{id}/booking-block)",
      path: "/members/:id/booking-block",
      saved: "Les reserves s'han bloquejat.",
      send: () => {
        fireEvent.click(screen.getByRole("button", { name: "Bloqueja les reserves" }));
        const dialog = screen.getByRole("dialog", { name: "Bloqueja les reserves" });
        fireEvent.change(within(dialog).getByLabelText("Motiu del bloqueig"), {
          target: { value: "Rebut pendent" },
        });
        fireEvent.click(within(dialog).getByRole("button", { name: "Bloqueja les reserves" }));
        return dialog;
      },
      submit: "Bloqueja les reserves",
      unchanged: () => {
        expect(screen.queryByText("Reserves bloquejades")).toBeNull();
      },
    },
    {
      blocked: true,
      method: "delete",
      name: "«Desbloqueja les reserves» (DELETE /members/{id}/booking-block)",
      path: "/members/:id/booking-block",
      saved: "Les reserves s'han desbloquejat.",
      send: () => {
        fireEvent.click(screen.getByRole("button", { name: "Desbloqueja les reserves" }));
        return undefined;
      },
      unchanged: () => {
        expect(screen.getByText("Reserves bloquejades")).toBeVisible();
      },
    },
    {
      method: "post",
      name: "«Reenvia accés» (POST /members/{id}/access-resend)",
      path: "/members/:id/access-resend",
      saved: /Enllaç enviat a/u,
      send: () => {
        headerAction("Reenvia accés");
        const dialog = screen.getByRole("dialog", { name: "Reenvia l'accés" });
        fireEvent.click(within(dialog).getByRole("button", { name: "Reenvia accés" }));
        return dialog;
      },
      submit: "Reenvia accés",
      unchanged: () => undefined,
    },
    {
      method: "post",
      name: "«Entra com l'abonat» (POST /members/{id}/impersonation-token)",
      path: "/members/:id/impersonation-token",
      // A started impersonation would open the club app (`window.open`): it never does.
      send: () => {
        headerAction("Entra com l'abonat");
        const dialog = screen.getByRole("dialog", { name: "Entra com l'abonat" });
        fireEvent.click(within(dialog).getByRole("button", { name: "Entra com l'abonat" }));
        return dialog;
      },
      submit: "Entra com l'abonat",
      unchanged: () => undefined,
    },
  ];

  // One test per action, named in full (`it.each`'s `$name` would cut the longer names).
  for (const action of actions) {
    it(`E7-W07 step 3 (S14 §5, T-14-19): ${action.name} on a record read before the erasure, answered 409 MEMBER_ERASED, says the member was erased, offers no resend of the request and shows nothing saved`, async () => {
      mockScenario("admin");
      const opened = vi.spyOn(window, "open").mockImplementation(() => null);
      let calls = 0;
      // The member was erased after D10 read the record: the api refuses the change (S14 §5).
      server.use(
        http[action.method](`*/api/v1${action.path}`, () => {
          calls += 1;
          return HttpResponse.json(
            { code: "MEMBER_ERASED", details: {}, message: "Member erased", traceId: "t-d10" },
            { status: 409 },
          );
        }),
      );
      if (action.blocked === true) await serveBlockedLaura();
      try {
        await renderRecord("member");
        await screen.findByRole("heading", { name: "Laura Serra Vidal" });

        const dialog = action.send();
        if (dialog === undefined) {
          await waitFor(() => {
            expect(
              screen.getByText(erased, { selector: ".census-record__feedback" }),
            ).toBeVisible();
          });
        } else {
          expect(await within(dialog).findByRole("alert")).toHaveTextContent(erased);
          // Final: the dialog cannot send the same request again.
          if (action.submit !== undefined) {
            expect(within(dialog).queryByRole("button", { name: action.submit })).toBeNull();
          }
        }
        expect(screen.queryByRole("button", { name: "Torna-ho a provar" })).toBeNull();
        if (action.saved !== undefined) expect(screen.queryByText(action.saved)).toBeNull();
        action.unchanged();

        // The record offers no other change either: the member is erased.
        if (dialog !== undefined) {
          fireEvent.click(within(dialog).getByRole("button", { name: "Cancel·la" }));
          expect(dialog).not.toBeInTheDocument();
        }
        expectNoChangeOffered();
        expect(opened).not.toHaveBeenCalled();
        expect(calls).toBe(1);
      } finally {
        opened.mockRestore();
      }
    });
  }

  it("E7-W07 step 3 (S14 §5, R-14-15): an erased member's record offers none of the changes the api refuses with 409 MEMBER_ERASED, and sends none", async () => {
    mockScenario("admin");
    const changes: string[] = [];
    const listener = ({ request }: { request: Request }) => {
      if (request.method !== "GET") changes.push(`${request.method} ${request.url}`);
    };
    server.events.on("request:start", listener);
    try {
      await renderRecord("member", branding, ERASED_MEMBER_ID);
      expect(await screen.findByRole("heading", { name: "Abonat suprimit #64" })).toBeVisible();
      expectNoChangeOffered();
      // R-14-15 keeps the invoices: the record still lists the last two.
      expect(await screen.findAllByText("cobrat")).toHaveLength(2);
      expect(changes).toEqual([]);
    } finally {
      server.events.removeListener("request:start", listener);
    }
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
        paymentMethod: {
          channel: "Efectiu",
          holderName: null,
          maskedAccount: null,
          type: "MANUAL",
        },
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
    expect(screen.getByRole("button", { name: "Inactivitat" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Baixa (amb data)" })).toBeVisible();
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

    expect(screen.getByRole("heading", { name: "Facturació" })).toBeVisible();
    expect(screen.getByRole("link", { name: /Tots els rebuts/u })).toHaveAttribute(
      "href",
      "/facturacio?filter=memberId%3Aeq%3Amember-laura",
    );
    expect(screen.getByRole("button", { name: "Bloqueja les reserves" })).toBeVisible();
  });
});

describe("T-14-26 E7-W03 round 2 #5 (AGENTS rule 1): D10's «Darrers canvis» names the action and the actor's role, never their codes", () => {
  /**
   * The member's last two audit entries as the api sends them (S14 R-14-11, `AuditSummary`): the
   * `AuditAction` and the actor's role are codes; the second change was made by the member, so it
   * has no actor name.
   */
  async function serveRecentAudit() {
    const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
    const { data } = await client.GET("/members/{id}/overview", {
      params: { path: { id: "member-laura" } },
    });
    if (data === undefined) throw new TypeError("The mock overview did not answer");
    const overview = {
      ...data,
      recentAudit: [
        {
          action: "MEMBER_PAYMENT_METHOD_CHANGED",
          actorName: "Jordi",
          actorRole: "ADMIN",
          at: "2026-08-03T11:15:00Z",
          id: "audit-iban",
        },
        {
          action: "MEMBER_UPDATED",
          actorRole: "MEMBER",
          at: "2026-07-26T09:30:00Z",
          id: "audit-self",
        },
      ],
    };
    server.use(http.get("*/api/v1/members/:id/overview", () => HttpResponse.json(overview)));
  }

  const trilingual: Branding = { ...branding, locales: ["ca", "es", "en"] };

  for (const [language, recent, entries] of [
    [
      "ca",
      "Darrers canvis",
      [
        "03/08 Mètode de pagament modificat (Administrador Jordi)",
        "26/07 Dades de l'abonat modificades (Abonat)",
      ],
    ],
    [
      "es",
      "Últimos cambios",
      [
        "Método de pago modificado (Administrador Jordi)",
        "Datos del abonado modificados (Abonado)",
      ],
    ],
    [
      "en",
      "Latest changes",
      ["Payment method changed (Administrator Jordi)", "Member details changed (Member)"],
    ],
  ] as const) {
    it(`reads «${recent}: ${entries.join(" · ")}» in ${language}, never MEMBER_PAYMENT_METHOD_CHANGED, MEMBER_UPDATED, ADMIN or MEMBER`, async () => {
      await serveRecentAudit();
      await renderRecord("member", trilingual, "member-laura", language);
      await screen.findByRole("heading", { name: "Laura Serra Vidal" });

      const line = screen.getByText(new RegExp(`${recent}:`, "u"));
      for (const entry of entries) expect(line).toHaveTextContent(entry);
      if (language === "ca") {
        expect(line).toHaveTextContent(`${recent}: ${entries.join(" · ")}`, {
          normalizeWhitespace: true,
        });
      }
      expect(line.textContent).not.toMatch(/MEMBER_|\bADMIN\b|\bMEMBER\b/u);
    });
  }
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
