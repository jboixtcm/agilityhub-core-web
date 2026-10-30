import { createApiClient, type components } from "@agilityhub/api-client";
import {
  ERASED_MEMBER_ID,
  handlers,
  mockScenario,
  resetCensusRecordState,
  resetMemberBillingState,
} from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { getResponse, HttpResponse, http } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it, onTestFinished, vi } from "vitest";

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
  const page = (recordId: string) => (
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={recordBranding}>
        <CountersRefreshContext.Provider value={refreshCounters}>
          {kind === "member" ? (
            <MemberRecordPage client={client} id={recordId} />
          ) : (
            <DogRecordPage client={client} id={recordId} />
          )}
        </CountersRefreshContext.Provider>
      </BrandingProvider>
    </I18nextProvider>
  );
  const view = render(page(kind === "member" ? memberId : "dog-duna"));
  return {
    client,
    navigate: (recordId: string) => {
      window.history.pushState(
        null,
        "",
        `/${kind === "member" ? "abonats" : "gossos"}/${recordId}`,
      );
      view.rerender(page(recordId));
    },
  };
}

describe("Assigned access roles", () => {
  it("shows the linked dog's photo in the member's Gossos block", async () => {
    const photoUrl = "/api/v1/attachments/files/example?expires=10&signature=example";
    server.use(
      http.get("*/api/v1/members/:id/overview", async ({ request }) => {
        const original = await getResponse(handlers, request);
        if (original === undefined) throw new Error("Expected member overview");
        const overview = (await original.json()) as components["schemas"]["MemberOverview"];
        return HttpResponse.json({
          ...overview,
          dogs: overview.dogs.map((dog) => ({ ...dog, photoUrl })),
        });
      }),
    );
    await renderRecord("member");
    await screen.findByRole("heading", { name: "Laura Serra Vidal" });
    const link = document.querySelector<HTMLAnchorElement>(".census-record__dog-link");
    expect(link?.querySelector("img")).toHaveAttribute("src", photoUrl);
    expect(link).toHaveAttribute("href", "/gossos/dog-duna");
  });

  it("shows only assigned roles while retaining the existing role editor", async () => {
    const { client } = await renderRecord("member");
    await screen.findByRole("heading", { name: "Laura Serra Vidal" });
    const { data } = await client.GET("/members/{id}/overview", {
      params: { path: { id: "member-laura" } },
    });
    const badges = document.querySelector(".census-record__badges");
    expect(badges?.children.length).toBe(data?.member.roles.length);
    expect(badges?.textContent).toBe("alumne");
  });
});

describe("MR-03 member tasks", () => {
  it("links each member dog to its working task management screen", async () => {
    const { client } = await renderRecord("member");
    await screen.findByRole("heading", { name: "Laura Serra Vidal" });
    const { data } = await client.GET("/members/{id}/overview", {
      params: { path: { id: "member-laura" } },
    });
    expect(data?.dogs.length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("tab", { name: "Tasques" }));
    for (const dog of data?.dogs ?? []) {
      expect(
        screen.getByRole("link", { name: `Veure i gestionar les tasques de ${dog.name}` }),
      ).toHaveAttribute("href", `/alumnes/${dog.id}`);
    }
  });
});

describe("T-03-39 INC-98 record navigation isolates member and dog state", () => {
  it("shows one preferences card and no previous booking feedback after navigating to another member", async () => {
    const reads: string[] = [];
    const listener = ({ request }: { request: Request }) => {
      if (request.method === "GET") reads.push(new URL(request.url).pathname);
    };
    server.events.on("request:start", listener);
    onTestFinished(() => {
      server.events.removeListener("request:start", listener);
    });
    const view = await renderRecord("member");
    await screen.findByRole("heading", { name: "Laura Serra Vidal" });
    const { data: preferences } = await view.client.GET("/members/{id}/notification-preferences", {
      params: { path: { id: "member-laura" } },
    });
    if (preferences === undefined) throw new TypeError("Missing member preferences fixture");
    const { data: nextOverview } = await view.client.GET("/members/{id}/overview", {
      params: { path: { id: "member-eva" } },
    });
    if (nextOverview === undefined) throw new TypeError("Missing next member fixture");
    const nextMemberId = nextOverview.member.id;
    // The standard fixture exposes preferences only for Laura. Eva needs her own response;
    // an orphaned Laura block must never stand in for a successful read of Eva's preferences.
    server.use(
      http.get(`*/api/v1/members/${nextMemberId}/notification-preferences`, () =>
        HttpResponse.json({ ...preferences, reminderMinutesBefore: null }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Bloqueja les reserves" }));
    const dialog = screen.getByRole("dialog", { name: "Bloqueja les reserves" });
    fireEvent.change(within(dialog).getByLabelText("Motiu del bloqueig"), {
      target: { value: "Fictional pending receipt" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Bloqueja les reserves" }));
    expect(await screen.findByText("Les reserves s'han bloquejat.")).toBeVisible();
    reads.length = 0;

    view.navigate("member-eva");
    await screen.findByRole("heading", { name: "Eva Perez Prunell" });
    expect(await screen.findByLabelText("Recordatori de classe")).toHaveValue("");
    expect(document.querySelectorAll(".notification-preferences")).toHaveLength(1);
    expect(screen.queryByText("Les reserves s'han bloquejat.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bloqueja les reserves" })).toBeVisible();
    expect(reads).toContain(`/api/v1/members/${nextMemberId}/notification-preferences`);
    expect(reads).toContain(`/api/v1/members/${nextMemberId}/consents`);
    expect(reads.filter((path) => path.includes("/members/member-laura/"))).toEqual([]);
  });

  it("a delayed member save cannot replace the next member or reopen its edit drawer", async () => {
    let release: () => void = () => undefined;
    const delayed = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.patch("*/api/v1/members/member-laura", async ({ request }) => {
        const response = await getResponse(handlers, request);
        await delayed;
        return response;
      }),
    );
    const view = await renderRecord("member");
    const save = vi.spyOn(view.client, "PATCH");
    onTestFinished(() => {
      release();
      save.mockRestore();
    });
    await screen.findByRole("heading", { name: "Laura Serra Vidal" });
    const edit = screen.getAllByRole("button", { name: "Edita" }).at(0);
    if (edit === undefined) throw new TypeError("Missing member edit action");
    fireEvent.click(edit);
    const drawer = screen.getByRole("dialog", { name: "Edita l'abonat" });
    fireEvent.change(within(drawer).getByLabelText("Nom"), { target: { value: "Delayed Laura" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Desa" }));
    await waitFor(() => {
      expect(save).toHaveBeenCalledTimes(1);
    });
    const pending = save.mock.results[0]?.value as ReturnType<typeof view.client.PATCH>;
    view.navigate("member-eva");
    await screen.findByRole("heading", { name: "Eva Perez Prunell" });
    const oldDrawerClosed = screen.queryByRole("dialog", { name: "Edita l'abonat" }) === null;
    await act(async () => {
      release();
      await pending;
    });
    expect(screen.getByRole("heading", { name: "Eva Perez Prunell" })).toBeVisible();
    expect(oldDrawerClosed).toBe(true);
    expect(screen.queryByText("Les dades de l'abonat s'han desat.")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Delayed Laura/u })).not.toBeInTheDocument();
  });

  it("a delayed dog save and its open draft cannot cross into the next dog's record", async () => {
    let release: () => void = () => undefined;
    const delayed = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.patch("*/api/v1/dogs/dog-duna", async ({ request }) => {
        const response = await getResponse(handlers, request);
        await delayed;
        return response;
      }),
    );
    const view = await renderRecord("dog");
    const save = vi.spyOn(view.client, "PATCH");
    onTestFinished(() => {
      release();
      save.mockRestore();
    });
    await screen.findByRole("heading", { name: "Duna" });
    const header = document.querySelector<HTMLElement>(".census-record__header");
    if (header === null) throw new TypeError("Missing dog record header");
    fireEvent.click(within(header).getByRole("button", { name: "Edita" }));
    const drawer = screen.getByRole("dialog", { name: "Edita les dades del gos" });
    fireEvent.change(within(drawer).getByLabelText("Nom"), { target: { value: "Delayed Duna" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Desa" }));
    await waitFor(() => {
      expect(save).toHaveBeenCalledTimes(1);
    });
    const pending = save.mock.results[0]?.value as ReturnType<typeof view.client.PATCH>;
    view.navigate("dog-rock");
    await screen.findByRole("heading", { name: "Rock" });
    const oldDrawerClosed =
      screen.queryByRole("dialog", { name: "Edita les dades del gos" }) === null;
    await act(async () => {
      release();
      await pending;
    });
    expect(screen.getByRole("heading", { name: "Rock" })).toBeVisible();
    expect(oldDrawerClosed).toBe(true);
    expect(screen.queryByRole("heading", { name: "Delayed Duna" })).not.toBeInTheDocument();
  });
});

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
    const refreshedBillingPack = screen
      .getByText(/Rock · Pack 10/u)
      .closest(".member-billing__pack");
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
      screen.getByText("No autoritza l'ús de la seva imatge: no publiquis fotos on surti ella."),
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
        "Aquest element s'ha modificat des d'un altre lloc. Actualitza'l i torna-ho a provar.",
      ),
    ).toBeVisible();
  });

  it("E8-W03 round 2 #18 refreshes dashboard counters after a lifecycle write", async () => {
    const refreshCounters = vi.fn();
    await renderRecord("member", branding, "member-laura", "ca", refreshCounters);
    await screen.findByRole("heading", { name: "Laura Serra Vidal" });
    fireEvent.click(screen.getByRole("button", { name: "Baixa (amb data)" }));
    const drawer = await screen.findByRole("dialog", { name: "Baixa (amb data)" });
    fireEvent.change(await within(drawer).findByLabelText("Data d'efecte"), {
      target: { value: "2026-11-30" },
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "Programa la baixa" }));
    const confirmation = screen.getAllByRole("dialog", { name: "Programa la baixa" }).at(-1);
    if (confirmation === undefined) throw new TypeError("Missing direct-leave confirmation");
    fireEvent.click(within(confirmation).getByRole("button", { name: "Programa la baixa" }));
    await waitFor(() => {
      expect(refreshCounters).toHaveBeenCalledTimes(1);
    });
  });

  it("E8-W03 round 2 #8 opens the exact period carried by queue navigation", async () => {
    const periodId = "62000000-0000-4000-8000-000000000002";
    window.history.pushState(null, "", `/abonats/member-eva?calaix=inactivitat&period=${periodId}`);
    await renderRecord("member", branding, "member-eva");
    const drawer = await screen.findByRole("dialog", { name: "Inactivitat" });
    expect(await within(drawer).findByText("Període obert")).toBeVisible();
    expect(within(drawer).getByText("actiu", { exact: true })).toBeVisible();
  });

  it("E8-W03 round 4 #2 keeps accountMissing after a holder-only partial SEPA edit", async () => {
    const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
    const cleared = await client.PATCH("/members/{id}/payment-method", {
      body: { sepa: { holderName: "Laura Serra Vidal", iban: null }, type: "SEPA_DD" },
      params: { path: { id: "member-laura" } },
    });
    expect(cleared.data?.maskedAccount ?? null).toBeNull();

    await renderRecord("member");
    expect(await screen.findByText("Compte no informat")).toBeVisible();
    const row = screen
      .getByText("Pagament", { selector: "dt" })
      .closest<HTMLElement>(".census-record__data-row");
    if (row === null) throw new TypeError("Missing payment row");
    fireEvent.click(within(row).getByRole("button", { name: "Edita" }));
    const drawer = screen.getByRole("dialog", { name: "Mètode de pagament" });
    fireEvent.change(within(drawer).getByLabelText("Titular del compte"), {
      target: { value: "Laura S. Vidal" },
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "Desa" }));

    expect(await screen.findByText("El mètode de pagament s'ha actualitzat.")).toBeVisible();
    expect(screen.getByText("Compte no informat")).toBeVisible();
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

describe("E11-W05 step 4 (A40.3): D10's image notice for a member whose gender is OTHER", () => {
  it("reads «aquesta persona» in the app's register, never the masculine «ell»", async () => {
    const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
    const { data } = await client.GET("/members/{id}/overview", {
      params: { path: { id: "member-laura" } },
    });
    if (data === undefined) throw new TypeError("The mock overview did not answer");
    const overview = { ...data, member: { ...data.member, gender: "OTHER" as const } };
    server.use(http.get("*/api/v1/members/:id/overview", () => HttpResponse.json(overview)));
    await renderRecord("member");
    await screen.findByRole("heading", { name: "Laura Serra Vidal" });
    expect(
      screen.getByText(
        "No autoritza l'ús de la seva imatge: no publiquis fotos on surti aquesta persona.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/surti ell\./u)).not.toBeInTheDocument();
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
    "Descarrega les dades (RGPD)",
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
        expect(
          screen.getAllByText("···· ···· ···· ···· 2231", { exact: false }).length,
        ).toBeGreaterThan(0);
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
    {
      method: "post",
      name: "«Descarrega les dades (RGPD)» (POST /members/{id}/data-export, E11-W01 round 2 #3)",
      path: "/members/:id/data-export",
      saved: "Paquet de dades sol·licitat. Consulta'n l'estat a Exportacions.",
      // No dialog: the page says it, as for «Desbloqueja les reserves».
      send: () => {
        headerAction("Descarrega les dades (RGPD)");
        return undefined;
      },
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
        // E11-W01 round 2 #6: the «suprimit» badge follows the same `erased` as the actions.
        expect(screen.getByText("suprimit")).toBeVisible();
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
    expect(screen.getByText("Baixa")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Reactiva" }));
    const reactivation = screen.getByRole("dialog", { name: "Reactiva el gos" });
    fireEvent.click(within(reactivation).getByRole("button", { name: "Reactiva" }));
    expect(await screen.findByText("El gos s'ha reactivat.")).toBeVisible();
    expect(screen.getByText("actiu")).toBeVisible();
  });
});

describe("E11-W06 W10 (S04 R-04-06, INC-39): D10's writes on a record frozen by a pending readmission", () => {
  const TEXT =
    "Aquest abonat té una readmissió pendent: valida-la o rebutja-la des del tauler abans de canviar la fitxa.";

  it("R-04-06 409 READMISSION_PENDING on a D10 write points to D2", async () => {
    mockScenario("adminMemberReadmissionPending");
    await renderRecord("member");
    await screen.findByRole("heading", { name: "Laura Serra Vidal" });

    fireEvent.click(screen.getByRole("button", { name: "Bloqueja les reserves" }));
    const dialog = screen.getByRole("dialog", { name: "Bloqueja les reserves" });
    fireEvent.change(within(dialog).getByLabelText("Motiu del bloqueig"), {
      target: { value: "Rebut pendent" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Bloqueja les reserves" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent(TEXT);
    expect(within(alert).getByRole("link", { name: "Preinscripcions pendents" })).toHaveAttribute(
      "href",
      "/preinscripcions/member-laura",
    );
  });

  it("R-04-06 a refused change of the notification preferences points to D2 too", async () => {
    mockScenario("adminMemberReadmissionPending");
    await renderRecord("member");
    fireEvent.change(await screen.findByLabelText("Recordatori de classe"), {
      target: { value: "240" },
    });

    const alert = await screen.findByText(TEXT, { exact: false });
    expect(
      within(alert.closest("[role='alert']") ?? alert).getByRole("link", {
        name: "Preinscripcions pendents",
      }),
    ).toHaveAttribute("href", "/preinscripcions/member-laura");
  });
});

describe("E11-W07 step 2 (E146, S12 §6): D10's next receipt date on the record", () => {
  it("E146: D6's link (?calaix=proper-rebut) opens the date's drawer; after the save the data card's «Proper rebut» reads the new date and the link leaves the address", async () => {
    vi.useFakeTimers({
      now: new Date("2026-10-05T10:00:00Z"),
      shouldAdvanceTime: true,
      toFake: ["Date"],
    });
    onTestFinished(() => {
      vi.useRealTimers();
      resetMemberBillingState();
    });
    window.history.pushState(null, "", "/abonats/member-laura?calaix=proper-rebut");
    await renderRecord("member");
    const drawer = await screen.findByRole("dialog", { name: "Proper rebut" });
    expect(within(drawer).getByLabelText("Data del proper rebut")).toHaveValue("2026-09-01");
    fireEvent.change(within(drawer).getByLabelText("Data del proper rebut"), {
      target: { value: "2026-11-01" },
    });
    fireEvent.change(within(drawer).getByLabelText("Motiu"), {
      target: { value: "Pagat fins a octubre" },
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "Desa" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Proper rebut" })).toBeNull();
    });
    expect(window.location.search).toBe("");

    // The overview is read again: its «Proper rebut» row (date · amount) follows the write.
    const row = screen.getByText("Proper rebut", { selector: "dt" }).closest("div");
    await waitFor(() => {
      expect(row).toHaveTextContent("01/11/2026");
    });
  });

  it("E164 (d): ?calaix=proper-rebut opens nothing for a pack member without a date, who has no next receipt to correct", async () => {
    server.use(
      http.get("*/api/v1/members/member-laura/overview", async ({ request }) => {
        const real = await getResponse(handlers, request);
        const overview = (await real?.json()) as {
          member: Record<string, unknown>;
          nextInvoice?: unknown;
        };
        overview.member.planId = "plan-pack-10";
        overview.member.nextInvoiceDate = null;
        delete overview.nextInvoice;
        return HttpResponse.json(overview);
      }),
    );
    window.history.pushState(null, "", "/abonats/member-laura?calaix=proper-rebut");
    await renderRecord("member");
    expect(await screen.findByText("Dades i pagament")).toBeVisible();
    // The plans are read: the member's own is a pack.
    expect(await screen.findByText("Pack 10", { selector: "strong" })).toBeVisible();
    expect(screen.queryByRole("dialog", { name: "Proper rebut" })).toBeNull();
    expect(screen.queryByText("Proper rebut")).toBeNull();
  });

  it("E164 (d): the drawer D6's link opened leaves no ?calaix=proper-rebut behind once closed, so a reload does not open it again", async () => {
    window.history.pushState(null, "", "/abonats/member-laura?calaix=proper-rebut&tab=dades");
    await renderRecord("member");
    const drawer = await screen.findByRole("dialog", { name: "Proper rebut" });
    fireEvent.click(within(drawer).getByRole("button", { name: "Cancel·la" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Proper rebut" })).toBeNull();
    });
    expect(window.location.pathname).toBe("/abonats/member-laura");
    expect(window.location.search).toBe("?tab=dades");
  });

  it("E164 (c): «Proper rebut» is read once, in the data card's row (mockup D10), with its edit action; the billing block has no copy of it", async () => {
    await renderRecord("member");
    const row = (await screen.findByText("Proper rebut", { selector: "dt" })).closest("div");
    if (row === null) throw new TypeError("No «Proper rebut» row");
    expect(row).toHaveTextContent(/^Proper rebut01\/09\/2026 · 90,00\s€\sEdita$/u);
    expect(
      within(row as HTMLElement).getByRole("button", { name: "Edita la data del proper rebut" }),
    ).toBeVisible();
    expect(await screen.findByText("2026-0912")).toBeVisible();
    expect(screen.getAllByText("Proper rebut")).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Proper rebut" })).toBeNull();
  });
});

describe("E11-W06 W7 (CONVENCIONS_I18N §1, R-06-14): D10 shows an instant on the club's day", () => {
  it("CONVENCIONS_I18N §1: registeredAt 2026-10-04T22:30:00Z with Europe/Madrid reads 05/10/2026", async () => {
    server.use(
      http.get("*/api/v1/dogs/dog-duna", async ({ request }) => {
        const real = await getResponse(handlers, request);
        const detail = (await real?.json()) as Record<string, unknown> & {
          dog?: Record<string, unknown>;
        };
        // 00:30 on 05/10 in Madrid; the birth date is a plain date, the day it names.
        const instants = {
          birthDate: "2020-10-04",
          levelAssignedAt: "2026-10-04T22:30:00Z",
          registeredAt: "2026-10-04T22:30:00Z",
        };
        return HttpResponse.json({
          ...detail,
          ...instants,
          ...(detail.dog === undefined ? {} : { dog: { ...detail.dog, ...instants } }),
        });
      }),
    );
    expect(branding.timeZone).toBe("Europe/Madrid");
    await renderRecord("dog");
    await screen.findByRole("heading", { name: "Duna" });

    const registered = screen.getByText("Alta", { selector: "dt" }).closest("div");
    expect(registered).toHaveTextContent("05/10/2026");
    expect(screen.getByText("04/10/2020")).toBeVisible();
    expect(document.querySelector(".census-record__level-current")).toHaveTextContent("05/10/2026");
    expect(document.body).not.toHaveTextContent("04/10/2026");
  });
});

describe("R-02-06 (E11-W02 round 2, INC-41): no «+34» typed in D10", () => {
  it("a new phone of the member takes the club's country prefix (its countryProfile), not Spain's", async () => {
    server.use(
      // D10 reads the member through its overview: Laura without phones.
      http.get("*/api/v1/members/member-laura/overview", async ({ request }) => {
        const real = await getResponse(handlers, request);
        const overview = (await real?.json()) as { member: Record<string, unknown> };
        return HttpResponse.json({ ...overview, member: { ...overview.member, phones: [] } });
      }),
    );
    const andorran: Branding = {
      ...branding,
      countryProfile: { code: "AD", idDocumentTypes: ["PASSPORT"], phonePrefix: "+376" },
    };
    await renderRecord("member", andorran);
    await screen.findByRole("heading", { name: "Laura Serra Vidal" });
    const editButton = screen.getAllByRole("button", { name: "Edita" }).at(0);
    if (editButton === undefined) throw new Error("Expected the member edit button");
    fireEvent.click(editButton);
    const drawer = screen.getByRole("dialog", { name: "Edita l'abonat" });
    const prefixes = within(drawer).getAllByLabelText("Prefix");
    expect(prefixes.map((input) => (input as HTMLInputElement).value)).toEqual(["+376", "+376"]);
  });
});

describe("R-03-14 (E11-W02 round 2, INC-41): the dog transfer offers every active member", () => {
  it("«Abonat de destí» lists all the club's active members but the owner, not the first 12", async () => {
    const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
    const active = await client.GET("/members", {
      params: { query: { fields: "id", filter: ["status:eq:ACTIVE"], page: 0, size: 20 } },
    });
    const total = active.data?.totalItems ?? 0;
    expect(total).toBeGreaterThan(12);
    await renderRecord("dog");
    await screen.findByRole("heading", { name: "Duna" });
    fireEvent.click(screen.getByRole("button", { name: "Transfereix" }));
    const drawer = screen.getByRole("dialog", { name: "Transfereix el gos" });
    const target = within(drawer).getByLabelText("Abonat de destí");
    // The placeholder, then every active member but Duna's owner.
    expect(within(target).getAllByRole("option")).toHaveLength(total);
  });
});

describe("Word feedback: active dog and reviewed merge", () => {
  it("opens a former member without a recorded leave date and keeps privacy and reactivation available", async () => {
    resetMemberBillingState();
    onTestFinished(resetMemberBillingState);
    mockScenario("memberLeft");
    await renderRecord("member");
    expect(await screen.findByRole("heading", { name: "Laura Serra Vidal" })).toBeVisible();
    const header = document.querySelector<HTMLElement>(".census-record__header");
    if (header === null) throw new Error("Missing member header");
    expect(within(header).getByText("Baixa", { exact: true })).toBeVisible();
    expect(header).toHaveTextContent("(alta:");
    expect(
      await screen.findByRole("heading", { name: "Historial de consentiments" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Reactiva l'abonat" })).toBeVisible();
  });
  it("adds an active dog to the same member with explicit usual handler identity", async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post("*/api/v1/members/:id/dogs", async ({ request, params }) => {
        body = (await request.json()) as Record<string, unknown>;
        expect(params.id).toBe("member-laura");
        expect(request.headers.get("Idempotency-Key")).toBeTruthy();
        return HttpResponse.json(
          { id: "new-dog", ...body, status: "ACTIVE", memberId: params.id, version: 0 },
          { status: 201 },
        );
      }),
    );
    await renderRecord("member");
    fireEvent.click(await screen.findByRole("button", { name: "Afegir un altre gos" }));
    const drawer = await screen.findByRole("dialog", { name: "Afegir un altre gos" });
    fireEvent.change(within(drawer).getByLabelText("Nom"), { target: { value: "Nova" } });
    fireEvent.change(within(drawer).getByLabelText("Raça"), { target: { value: "Mestissa" } });
    fireEvent.change(within(drawer).getByLabelText("Data de naixement"), {
      target: { value: "2023-03-12" },
    });
    fireEvent.change(within(drawer).getByLabelText("Guia"), { target: { value: "Lau" } });
    expect(within(drawer).getByLabelText("El guia és l’abonat")).toBeChecked();
    fireEvent.click(within(drawer).getByRole("button", { name: "Desa" }));
    expect(await screen.findByText("Gos afegit i actiu.")).toBeVisible();
    expect(body).toMatchObject({
      name: "Nova",
      handlerName: "Lau",
      handlerIsMember: true,
      freeTrainingAllowed: false,
    });
    expect(screen.queryByRole("dialog", { name: "Afegir un altre gos" })).not.toBeInTheDocument();
  });
  it("requires a target and a preview before confirming a merge and links the surviving record", async () => {
    const merges: unknown[] = [];
    server.use(
      http.post("*/api/v1/members/:id/merge", async ({ request }) => {
        merges.push(await request.json());
        return HttpResponse.json({
          source: { id: "member-laura" },
          target: { id: "member-target" },
          counts: {},
          blockers: [],
        });
      }),
    );
    await renderRecord("member");
    fireEvent.click(await screen.findByRole("button", { name: "Fusiona abonats" }));
    const dialog = await screen.findByRole("dialog", { name: "Fusiona abonats" });
    expect(within(dialog).getByRole("button", { name: "Previsualitza la fusió" })).toBeDisabled();
    const option = await within(dialog).findByRole("option", { name: /Marc Prats García · #/ });
    fireEvent.change(within(dialog).getByLabelText("Abonat que es conserva"), {
      target: { value: option.getAttribute("value") },
    });
    expect(
      within(dialog).queryByRole("button", { name: "Confirma la fusió" }),
    ).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Previsualitza la fusió" }));
    const confirm = await within(dialog).findByRole("button", { name: "Confirma la fusió" });
    expect(merges).toHaveLength(0);
    expect(within(dialog).getByText(/Es conserva: Marc/)).toBeVisible();
    fireEvent.click(confirm);
    await waitFor(() => {
      expect(merges).toHaveLength(1);
    });
    expect(merges[0]).toHaveProperty("sourceVersion");
    expect(merges[0]).toHaveProperty("targetVersion");
  });
  it("requires a fresh merge preview after a concurrent change and preserves a retry after a lost response", async () => {
    let previews = 0;
    const attempts: { body: components["schemas"]["MemberMergeRequest"]; key: string | null }[] =
      [];
    server.use(
      http.get("*/api/v1/members/:id/merge-preview", async ({ request }) => {
        const response = await getResponse(handlers, request);
        const preview = (await response?.json()) as components["schemas"]["MemberMergePreview"];
        previews++;
        return HttpResponse.json({ ...preview, source: { ...preview.source, version: previews } });
      }),
      http.post("*/api/v1/members/:id/merge", async ({ request }) => {
        attempts.push({
          body: (await request.json()) as components["schemas"]["MemberMergeRequest"],
          key: request.headers.get("Idempotency-Key"),
        });
        if (attempts.length === 1)
          return HttpResponse.json(
            { code: "STALE_VERSION", message: "Changed", traceId: "test", details: {} },
            { status: 409 },
          );
        if (attempts.length === 2) return HttpResponse.error();
        return HttpResponse.json({ source: {}, target: {}, counts: {}, blockers: [] });
      }),
    );
    await renderRecord("member");
    fireEvent.click(await screen.findByRole("button", { name: "Fusiona abonats" }));
    const dialog = screen.getByRole("dialog", { name: "Fusiona abonats" });
    const option = await within(dialog).findByRole("option", { name: /Marc Prats García · #/ });
    fireEvent.change(within(dialog).getByLabelText("Abonat que es conserva"), {
      target: { value: option.getAttribute("value") },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Previsualitza la fusió" }));
    fireEvent.click(await within(dialog).findByRole("button", { name: "Confirma la fusió" }));
    await within(dialog).findByRole("alert");
    expect(
      within(dialog).queryByRole("button", { name: "Confirma la fusió" }),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Abonat que es conserva")).toHaveValue("member-marc");
    expect(previews).toBe(1);
    fireEvent.click(within(dialog).getByRole("button", { name: "Previsualitza la fusió" }));
    fireEvent.click(await within(dialog).findByRole("button", { name: "Confirma la fusió" }));
    await within(dialog).findByRole("alert");
    expect(previews).toBe(2);
    expect(within(dialog).getByText(/Es conserva: Marc/)).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirma la fusió" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Fusiona abonats" })).not.toBeInTheDocument(),
    );
    expect(attempts.map((attempt) => attempt.body.sourceVersion)).toEqual([1, 2, 2]);
    expect(attempts[0]?.key).not.toBe(attempts[1]?.key);
    expect(attempts[1]?.key).toMatch(/^[0-9a-f-]{36}$/u);
    expect(attempts[1]?.key).toBe(attempts[2]?.key);
    expect(attempts[1]?.body).toEqual(attempts[2]?.body);
  });

  it("strips read-only email metadata when saving the member", async () => {
    let sent: Record<string, unknown> | undefined;
    server.use(
      http.patch("*/api/v1/members/:id", async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            code: "VALIDATION_ERROR",
            details: { fieldErrors: [{ field: "firstName", code: "REQUIRED" }] },
            message: "Invalid",
            traceId: "test",
          },
          { status: 400 },
        );
      }),
    );
    await renderRecord("member");
    await screen.findByRole("heading", { name: "Laura Serra Vidal" });
    const header = document.querySelector(".census-record__header");
    if (header === null) throw new Error("No header");
    fireEvent.click(within(header as HTMLElement).getByRole("button", { name: "Edita" }));
    const drawer = screen.getByRole("dialog", { name: "Edita l'abonat" });
    fireEvent.click(within(drawer).getByRole("button", { name: "Desa" }));
    await waitFor(() => {
      expect(sent).toBeDefined();
    });
    expect((sent?.contactEmails as Record<string, unknown>[])[0]).not.toHaveProperty("bounced");
    expect(await within(drawer).findAllByText("Revisa aquest camp.")).not.toHaveLength(0);
  });
});
