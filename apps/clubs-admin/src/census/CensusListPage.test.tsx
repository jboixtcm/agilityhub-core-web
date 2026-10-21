import { createApiClient } from "@agilityhub/api-client";
import { handlers, mockScenario } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { getResponse, HttpResponse, http } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { DogsPage, MembersPage } from "./CensusListPage";

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
  mockScenario("admin");
  localStorage.clear();
});

afterAll(() => {
  server.close();
});

async function renderPage(kind: "dogs" | "members") {
  server.use(
    http.get("*/api/v1/dashboard/counters", () => HttpResponse.json({ pendingSignups: 0 })),
  );
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["census", "enums", "errors"],
    storage: undefined,
  });
  const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        {kind === "members" ? <MembersPage client={client} /> : <DogsPage client={client} />}
      </BrandingProvider>
    </I18nextProvider>,
  );
}

describe("T-03-38 D5 universal member list", () => {
  it("renders applied filters and preserves selection when page size changes", async () => {
    window.history.pushState(
      null,
      "",
      "/abonats?size=20&filter=status:eq:ACTIVE&filter=planId:eq:plan-member",
    );
    await renderPage("members");

    expect(await screen.findByText("Laura Serra Vidal")).toBeVisible();
    expect(await screen.findByText("184 d'alta")).toBeVisible();
    expect(screen.getByText(/Filtre \(1\): Modalitat = «Abonat»/u)).toBeVisible();

    fireEvent.click(screen.getByRole("checkbox", { name: "Selecciona Laura Serra Vidal" }));
    expect(screen.getByText("1 seleccionat — accions massives:")).toBeVisible();
    fireEvent.change(screen.getByRole("combobox", { name: "files per pàgina" }), {
      target: { value: "50" },
    });

    expect(screen.getByText("1 seleccionat — accions massives:")).toBeVisible();
    expect(new URLSearchParams(window.location.search).get("size")).toBe("50");
  });

  it("E11-W02 round 3 (AGENTS rule 3): the bulk bar offers only what works — no «Canviar nivell» while the contract has no bulk level endpoint", async () => {
    window.history.pushState(null, "", "/abonats");
    await renderPage("members");
    fireEvent.click(await screen.findByRole("checkbox", { name: "Selecciona Laura Serra Vidal" }));
    const bar = screen.getByText("1 seleccionat — accions massives:").parentElement;
    if (bar === null) throw new TypeError("Expected the bulk actions bar");
    expect(within(bar).getByRole("button", { name: "Enviar comunicat" })).toBeVisible();
    expect(within(bar).getByRole("button", { name: "Exportar selecció" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Canviar nivell" })).toBeNull();
  });

  it("E4-W12 step 5: a fresh /abonats applies only the status chip «Alta», so a club whose plan ids differ from the fixture's lists its members", async () => {
    // The real core's plan ids are UUIDs: `plan-member` exists only in the MSW fixture.
    const coreMembers = [
      {
        fullName: "Aina Fictícia Riera",
        id: "7d0f4a9e-0000-4000-8000-000000000001",
        memberNumber: 1,
        planId: "5b0c1e2a-0000-4000-8000-000000000011",
      },
      {
        fullName: "Pol Fictici Serra",
        id: "7d0f4a9e-0000-4000-8000-000000000002",
        memberNumber: 2,
        planId: "5b0c1e2a-0000-4000-8000-000000000012",
      },
    ].map((member) => ({
      contact: "",
      displayStatus: { kind: "ACTIVE", label: "alta" },
      dogs: [],
      fullName: member.fullName,
      id: member.id,
      memberNumber: member.memberNumber,
      plan: { id: member.planId, name: "Abonat", summary: "Abonat · 60 €" },
      status: "ACTIVE",
    }));
    const requested: { fields: string | null; filters: string[] }[] = [];
    server.use(
      http.get("*/api/v1/members", ({ request }) => {
        const url = new URL(request.url);
        const filters = url.searchParams.getAll("filter");
        requested.push({ fields: url.searchParams.get("fields"), filters });
        // Like the core: an equality filter on an unknown plan id matches nobody.
        const items = coreMembers.filter((member) =>
          filters.every((filter) => {
            const [field, , value] = filter.split(":");
            if (field === "planId") return member.plan.id === value;
            if (field === "status") return member.status === value;
            return true;
          }),
        );
        return HttpResponse.json({
          appliedFilters: filters.map((filter) => {
            const [field = "", op = "eq", value = ""] = filter.split(":");
            return { field, label: field, op, value, valueLabel: value };
          }),
          items,
          page: 0,
          size: 50,
          totalItems: items.length,
          totalPages: items.length === 0 ? 0 : 1,
        });
      }),
    );
    window.history.pushState(null, "", "/abonats");
    await renderPage("members");

    expect(await screen.findByText("Aina Fictícia Riera")).toBeVisible();
    expect(screen.getByText("Pol Fictici Serra")).toBeVisible();
    expect(screen.queryByText("Cap abonat amb aquests criteris")).not.toBeInTheDocument();
    // The list request (its visible columns, not the «d'alta» count's `id`) carries the chip only.
    const listRequests = requested.filter((request) => request.fields !== "id");
    expect(listRequests.length).toBeGreaterThan(0);
    for (const request of listRequests) expect(request.filters).toEqual(["status:eq:ACTIVE"]);
    expect(screen.getByRole("combobox", { name: "Estat dels abonats" })).toHaveValue("ACTIVE");
    expect(screen.queryByText(/Filtre \(\d+\)/u)).not.toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).getAll("filter")).not.toContainEqual(
      expect.stringMatching(/^planId:/u),
    );
  });

  it("toggles visible columns and synchronizes the ordered fields to the URL", async () => {
    window.history.pushState(null, "", "/abonats");
    await renderPage("members");
    expect(await screen.findByText("Laura Serra Vidal")).toBeVisible();

    fireEvent.click(screen.getByText("Columnes"));
    const planColumn = screen.getByRole("checkbox", { name: "Modalitat" });
    expect(planColumn).toBeChecked();
    fireEvent.click(planColumn);

    expect(screen.queryByRole("columnheader", { name: "Modalitat" })).not.toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get("fields")).toBe(
      "fullName,dogs,displayStatus",
    );
  });

  it("E11-W05 step 4 (A40.2): D5 names the identity column «Document d'identitat» and searches by «document», never «DNI»", async () => {
    window.history.pushState(null, "", "/abonats");
    await renderPage("members");
    expect(await screen.findByText("Laura Serra Vidal")).toBeVisible();
    expect(screen.getByRole("searchbox", { name: "Cerca per nom, document, gos…" })).toBeVisible();

    fireEvent.click(screen.getByText("Columnes"));
    fireEvent.click(screen.getByRole("checkbox", { name: "Document d'identitat" }));
    expect(await screen.findByRole("columnheader", { name: "Document d'identitat" })).toBeVisible();
    expect(screen.queryByText(/\bDNI\b/u)).not.toBeInTheDocument();
  });

  it("T-13-22 offers the leave columns and keeps the system leave view non-deletable", async () => {
    const memberRequests: (string | null)[] = [];
    server.events.on("request:start", ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/api/v1/members")) {
        memberRequests.push(url.searchParams.get("fields"));
      }
    });
    window.history.pushState(null, "", "/abonats");
    await renderPage("members");
    expect(await screen.findByText("Laura Serra Vidal")).toBeVisible();

    fireEvent.click(screen.getByText("Columnes"));
    expect(screen.getByRole("checkbox", { name: "Origen de la baixa" })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Inactiva fins" })).toBeVisible();
    fireEvent.click(screen.getByRole("checkbox", { name: "Inactiva fins" }));

    fireEvent.click(screen.getByText("Vistes", { selector: "summary" }));
    const systemView = screen.getByRole<HTMLOptionElement>("option", { name: "Baixes previstes" });
    expect(systemView).toBeVisible();
    fireEvent.change(screen.getByRole("combobox", { name: "Vistes" }), {
      target: { value: systemView.value },
    });
    expect(screen.queryByRole("button", { name: "Elimina la vista" })).not.toBeInTheDocument();
    expect(await screen.findByText("Filtre (1): Estat visible = «baixa prevista»")).toBeVisible();
    expect(screen.queryByText(/LEAVE_SCHEDULED/u)).not.toBeInTheDocument();
    expect(await screen.findByRole("columnheader", { name: "Origen de la baixa" })).toBeVisible();
    expect(
      memberRequests.some((fields) => fields?.split(",").includes("leaveSource") === true),
    ).toBe(true);
    expect(
      memberRequests.some((fields) => fields?.split(",").includes("inactivityUntil") === true),
    ).toBe(true);
  });
});

describe("T-03-42 D15 translated dog list", () => {
  it("renders the approved columns and dog record links", async () => {
    window.history.pushState(null, "", "/gossos");
    await renderPage("dogs");

    expect(await screen.findByText("Duna")).toBeVisible();
    expect(screen.getByText("242 actius")).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Entrenament lliure" })).toBeVisible();
    expect(screen.getByText("FCAG 3241 (Iniciació) · RSCE 13298 (2)")).toBeVisible();
    fireEvent.click(screen.getByText("Columnes"));
    fireEvent.click(screen.getByRole("checkbox", { name: "Guia" }));
    expect(screen.getByRole("columnheader", { name: "Guia" })).toBeVisible();
    expect(await screen.findByText("Júlia Roca")).toBeVisible();
    expect(screen.getAllByRole("link", { name: "Obre la fitxa de Duna" })[0]).toHaveAttribute(
      "href",
      "/gossos/dog-duna",
    );
  });
});

describe("E11-W02 round 2 (review #12): D5's active count", () => {
  it("a failed count read hides the header badge instead of «0 d'alta»", async () => {
    window.history.pushState(null, "", "/abonats");
    let answered = false;
    server.use(
      http.get("*/api/v1/members", ({ request }) => {
        // The count's read (`fields=id`, the active filter) fails; the list's own read does not.
        if (new URL(request.url).searchParams.get("fields") !== "id") return undefined;
        answered = true;
        return HttpResponse.json(
          { code: "INTERNAL_ERROR", details: {}, message: "Internal error", traceId: "t-count" },
          { status: 500 },
        );
      }),
    );
    await renderPage("members");

    expect(await screen.findByText("Laura Serra Vidal")).toBeVisible();
    await waitFor(() => {
      expect(answered).toBe(true);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText(/d'alta$/u)).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Abonats$/u);
  });
});

describe("T-03-42 / R-03-32, R-03-29 (E11-W02 round 2, INC-41): D5 and D15 show labels and the club's dates, never codes", () => {
  function showColumn(name: string) {
    const box = screen.getByRole("checkbox", { name });
    if (!(box as HTMLInputElement).checked) fireEvent.click(box);
  }

  it("T-03-42 / R-03-32 D5: the payment method and the pending documents by their labels", async () => {
    window.history.pushState(null, "", "/abonats?size=100");
    await renderPage("members");
    expect(await screen.findByText("Anna Ballart Consul")).toBeVisible();
    fireEvent.click(screen.getByText("Columnes"));
    showColumn("Pagament");
    showColumn("Documents pendents");
    // A new column reads the list again (its fields): the rows come back with it.
    const anna = (await screen.findByText("Anna Ballart Consul")).closest("tr");
    const marc = (await screen.findByText("Marc Prats García")).closest("tr");
    if (anna === null || marc === null) throw new Error("Expected the members' rows");
    expect(await within(marc).findByText("Targeta")).toBeVisible();
    expect(within(anna).getByText("Efectiu")).toBeVisible();
    expect(await within(anna).findByText("Cartilla de vacunes")).toBeVisible();
    for (const code of ["CARD", "MANUAL", "CASH", "VACCINATION_CARD"]) {
      expect(screen.queryByText(code)).toBeNull();
    }
  });

  it("R-03-32 E11-W05 step 5 (f): D5: a channel with no label (the api's `channel` is a free string) reads its type's label, never the key", async () => {
    server.use(
      http.get("*/api/v1/members", async ({ request }) => {
        const real = await getResponse(handlers, request);
        const page = (await real?.json()) as { items: Record<string, unknown>[] };
        return HttpResponse.json({
          ...page,
          items: page.items.map((item) =>
            item.fullName === "Anna Ballart Consul" && item.paymentMethod !== undefined
              ? {
                  ...item,
                  paymentMethod: {
                    ...(item.paymentMethod as Record<string, unknown>),
                    channel: "CHEQUE",
                    maskedAccount: null,
                    type: "MANUAL",
                  },
                }
              : item,
          ),
        });
      }),
    );
    window.history.pushState(null, "", "/abonats?size=100");
    await renderPage("members");
    expect(await screen.findByText("Anna Ballart Consul")).toBeVisible();
    fireEvent.click(screen.getByText("Columnes"));
    showColumn("Pagament");
    const anna = (await screen.findByText("Anna Ballart Consul")).closest("tr");
    if (anna === null) throw new Error("Expected Anna's row");
    expect(await within(anna).findByText("Efectiu")).toBeVisible();
    expect(screen.queryByText(/paymentChannel|CHEQUE/u)).toBeNull();
  });

  it("T-03-04 / R-03-29 D15: «Al nivell des de» and «Data d'alta» are instants, shown as the club's calendar day", async () => {
    server.use(
      http.get("*/api/v1/dogs", async ({ request }) => {
        const real = await getResponse(handlers, request);
        const page = (await real?.json()) as { items: Record<string, unknown>[] };
        // 23:30 UTC on 31 January is already 1 February in the club (Europe/Madrid).
        return HttpResponse.json({
          ...page,
          items: page.items.map((item) =>
            item.id === "dog-duna"
              ? {
                  ...item,
                  levelAssignedAt: "2025-01-31T23:30:00Z",
                  registeredAt: "2023-02-02T23:30:00Z",
                }
              : item,
          ),
        });
      }),
    );
    window.history.pushState(null, "", "/gossos");
    await renderPage("dogs");
    expect(await screen.findByText("Duna")).toBeVisible();
    fireEvent.click(screen.getByText("Columnes"));
    showColumn("Al nivell des de");
    showColumn("Data d'alta");
    const duna = (await screen.findAllByText("Duna"))[0]?.closest("tr");
    if (duna === null || duna === undefined) throw new Error("Expected Duna's row");
    expect(await within(duna).findByText("01/02")).toBeVisible();
    expect(within(duna).getByText("03/02")).toBeVisible();
  });
});
