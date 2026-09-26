import { createApiClient } from "@agilityhub/api-client";
import { mockScenario } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
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
    initialNamespaces: ["census", "errors"],
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
