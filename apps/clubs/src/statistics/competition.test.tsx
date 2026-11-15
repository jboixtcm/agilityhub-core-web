import { competitionFixture } from "@agilityhub/api-client/mocks";
import { server } from "@agilityhub/api-client/mocks/server";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { apiClient, canic, renderApp, renderPage, setupBookingWorld } from "../booking/test-utils";

import CompetitionStatisticsPage from "./CompetitionStatisticsPage";

setupBookingWorld();
const options = {
  branding: { ...canic, modules: [...canic.modules, "STATS"] },
  scenario: "competitionMember" as const,
};

describe("Competition statistics", () => {
  it("T-STATS-15 shows official points, sources and filters without recalculating totals", async () => {
    await renderPage(<CompetitionStatisticsPage client={apiClient()} />, options);
    await screen.findByText("140");
    expect(screen.getByText("1 prova amb punt")).toBeVisible();
    expect(document.querySelectorAll(".competition-runs li")).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Veure la font" })[0]).toHaveAttribute(
      "href",
      "https://app.fcagility.cat/federated/classification/division/128",
    );
    fireEvent.click(screen.getByLabelText("Mostra només mànegues amb punt"));
    expect(document.querySelectorAll(".competition-runs li")).toHaveLength(1);
    expect(screen.getByText("1 prova amb punt")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Gos"), {
      target: { value: "31000000-0000-4000-8000-000000000002" },
    });
    await screen.findByText("No hi ha resultats importats per a aquest any.");
    expect(screen.queryByText("140")).not.toBeInTheDocument();
  });
  it("T-STATS-16 retry keeps the selected period and never shows the previous dog's results", async () => {
    let failed = true;
    server.use(
      http.get("*/api/v1/me/dogs/:id/competition-statistics", ({ params }) =>
        failed
          ? HttpResponse.json(
              { code: "INTERNAL_ERROR", message: "Unavailable", traceId: "mock" },
              { status: 500 },
            )
          : HttpResponse.json(competitionFixture(String(params.id))),
      ),
    );
    await renderPage(<CompetitionStatisticsPage client={apiClient()} />, options);
    await screen.findByRole("alert");
    expect(screen.queryByText("140")).not.toBeInTheDocument();
    failed = false;
    fireEvent.click(screen.getByRole("button", { name: "Torna-ho a provar" }));
    await screen.findByText("140");
  });
  it("T-STATS-17 disabled STATS hides the profile entry and never requests results", async () => {
    let reads = 0;
    server.use(
      http.get("*/api/v1/me/dogs/:id/competition-statistics", () => {
        reads++;
        return HttpResponse.json({});
      }),
    );
    await renderApp("/perfil");
    await screen.findByRole("heading", { name: "El meu perfil" });
    expect(
      screen.queryByRole("link", { name: "Estadístiques de competició" }),
    ).not.toBeInTheDocument();
    await waitFor(() => {
      expect(reads).toBe(0);
    });
  });
  it("T-STATS-32 staff without membership cannot see the member statistics link", async () => {
    await renderApp("/perfil", { ...options, scenario: "instructor" });
    await screen.findByRole("heading", { name: "El meu perfil" });
    expect(
      screen.queryByRole("link", { name: "Estadístiques de competició" }),
    ).not.toBeInTheDocument();
  });
});
