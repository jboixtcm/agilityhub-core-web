import { competitionFixture } from "@agilityhub/api-client/mocks";
import { server } from "@agilityhub/api-client/mocks/server";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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
  it("T-STATS-40 separates yearly P/PV/PA and lifetime promotion with the registered grade", async () => {
    await renderPage(<CompetitionStatisticsPage client={apiClient()} />, options);
    await screen.findByRole("heading", { name: "Grau actual G2" });
    const promotion = screen.getByRole("region", { name: "Progrés d’ascens" });
    expect(within(promotion).getByText("Falten 2")).toBeVisible();
    expect(within(promotion).getByText("Falten 3")).toBeVisible();
    const championship = screen.getByRole("region", { name: "Campionat d’Espanya 2027" });
    expect(within(championship).getByRole("progressbar", { name: "Agility · PV" })).toHaveAttribute(
      "value",
      "1",
    );
    expect(
      [...document.querySelectorAll(".competition-awards dt")]
        .slice(0, 3)
        .map((node) => node.textContent),
    ).toEqual(["P", "PV", "PA"]);
    expect(document.querySelector(".competition-runs")).toHaveTextContent("PA / PV");
    fireEvent.change(screen.getByLabelText("Any RSCE"), { target: { value: "2025" } });
    await screen.findByText(/El reglament de 2026 no s’aplica aquí/);
    expect(
      within(screen.getByRole("region", { name: "Progrés d’ascens" })).getByText("Falten 2"),
    ).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "Campionat d’Espanya 2026" }),
    ).not.toBeInTheDocument();
  });
  it("T-STATS-41 G1 shows both promotion options and the outstanding judge condition", async () => {
    server.use(
      http.get("*/api/v1/me/dogs/:id/competition-statistics", () => {
        const stats = competitionFixture("dog-duna");
        const p = stats.rsceProgress[0];
        if (!p) throw new Error("Missing progress fixture");
        p.currentGrade = "G1";
        p.registeredGrade = "G1";
        p.lastResultGrade = "G1";
        p.championshipRoutes = [];
        p.promotionRoutes = [
          {
            code: "G1_THREE_AGILITY",
            targetGrade: "G2",
            championshipYear: 0,
            requiresDifferentJudges: true,
            pointTargetsMet: false,
            targets: [
              {
                discipline: "AGILITY",
                kind: "CLEAR_EXCELLENT",
                earned: 2,
                required: 3,
                remaining: 1,
              },
            ],
          },
          {
            code: "G1_TWO_EACH",
            targetGrade: "G2",
            championshipYear: 0,
            requiresDifferentJudges: true,
            pointTargetsMet: true,
            targets: [
              {
                discipline: "AGILITY",
                kind: "CLEAR_EXCELLENT",
                earned: 2,
                required: 2,
                remaining: 0,
              },
              {
                discipline: "JUMPING",
                kind: "CLEAR_EXCELLENT",
                earned: 2,
                required: 2,
                remaining: 0,
              },
            ],
          },
        ];
        return HttpResponse.json(stats);
      }),
    );
    await renderPage(<CompetitionStatisticsPage client={apiClient()} />, options);
    await screen.findByRole("heading", { name: "Grau actual G1" });
    expect(screen.getByText("G1 → G2 · 3 Agility")).toBeVisible();
    expect(screen.getAllByText(/Calen almenys dos jutges diferents/)).toHaveLength(2);
    expect(screen.getByText(/En G1, la via ordinària és l’ascens a G2/)).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Campionat d’Espanya 2027" }),
    ).not.toBeInTheDocument();
  });
  it("T-STATS-42 licence switching keeps G3 progress and results separate", async () => {
    server.use(
      http.get("*/api/v1/me/dogs/:id/competition-statistics", () => {
        const stats = competitionFixture("dog-duna");
        const p = stats.rsceProgress[0];
        if (!p) throw new Error("Missing progress fixture");
        stats.rsceProgress.push({
          ...p,
          license: "4567",
          currentGrade: "G3",
          registeredGrade: "G3",
          lastResultGrade: "G3",
          promotionRoutes: [],
          summaries: [],
          championshipRoutes: [
            {
              code: "G3_STANDARD",
              targetGrade: "G3",
              championshipYear: 2027,
              pointTargetsMet: false,
              requiresDifferentJudges: false,
              targets: [
                { discipline: "AGILITY", kind: "PV", earned: 2, required: 4, remaining: 2 },
                { discipline: "JUMPING", kind: "PV", earned: 3, required: 4, remaining: 1 },
              ],
            },
          ],
        });
        return HttpResponse.json(stats);
      }),
    );
    await renderPage(<CompetitionStatisticsPage client={apiClient()} />, options);
    await screen.findByLabelText("Llicència");
    fireEvent.change(screen.getByLabelText("Llicència"), { target: { value: "4567" } });
    expect(screen.getByRole("heading", { name: "Grau actual G3" })).toBeVisible();
    expect(screen.getByText("Via ordinària de G3 · 4 PV en G3 per disciplina")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Progrés d’ascens" })).not.toBeInTheDocument();
    expect(document.querySelectorAll(".competition-runs li")).toHaveLength(0);
    expect(screen.getByText("No hi ha resultats importats per a aquest any.")).toBeVisible();
  });
  it("T-STATS-43 identifies observed grades and licence conflicts without presenting them as confirmed", async () => {
    let conflict = false;
    server.use(
      http.get("*/api/v1/me/dogs/:id/competition-statistics", () => {
        const stats = competitionFixture("dog-duna");
        const p = stats.rsceProgress[0];
        if (!p) throw new Error("Missing progress fixture");
        p.gradeSource = conflict ? "LICENSE" : "LAST_RESULT";
        p.registeredGrade = conflict ? "G2" : null;
        p.lastResultDate = "2025-07-19";
        p.lastResultGrade = conflict ? "G3" : "G2";
        p.gradeConflict = conflict;
        return HttpResponse.json(stats);
      }),
    );
    await renderPage(<CompetitionStatisticsPage client={apiClient()} />, options);
    await screen.findByRole("heading", { name: "Últim grau a Flow G2" });
    expect(screen.getByText("Segons l’última prova importada, del 19/07/2025.")).toBeVisible();
    conflict = true;
    fireEvent.change(screen.getByLabelText("Any RSCE"), { target: { value: "2025" } });
    await screen.findByRole("heading", { name: "Grau pendent de revisar G2" });
    expect(screen.getByText(/A Flow consta G3 el 19\/07\/2025/)).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Grau actual G2" })).not.toBeInTheDocument();
  });
});
