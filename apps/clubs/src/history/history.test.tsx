import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { server } from "@agilityhub/api-client/mocks/server";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import {
  apiClient,
  canic,
  renderApp,
  renderPage,
  setupBookingWorld,
  without,
} from "../booking/test-utils";

import { HistoryPage } from "./HistoryPage";

setupBookingWorld();

const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/gu, " ").trim();

/** Each row of 25 as a reader sees it: «date | title | badge / detail». */
function historyRows(): string[] {
  return [...document.querySelectorAll(".history-row")].map((row) => {
    const line = [...(row.querySelector(".history-row__line")?.children ?? [])]
      .map((part) => clean(part.textContent))
      .join(" | ");
    const detail = row.querySelector(".history-row__detail");
    return detail === null ? line : `${line} / ${clean(detail.textContent)}`;
  });
}

function requests(): string[] {
  const lines: string[] = [];
  server.events.on("request:start", ({ request }) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/me/history")) lines.push(`${url.pathname}${url.search}`);
  });
  return lines;
}

async function renderHistory(options: Parameters<typeof renderPage>[1] = {}) {
  await renderPage(<HistoryPage client={apiClient(options.locale)} />, options);
  await screen.findByRole("heading", { level: 1 });
  await waitFor(() => {
    expect(
      document.querySelector(".history-screen__window, .history-screen [role='alert']"),
    ).not.toBeNull();
  });
}

describe("T-10-31 screen 25 «Històric» (S10 §2, R-10-14)", () => {
  it("mockup 25: the three dogs with «Tots» pressed by default, the four type chips, the window caption and the seven rows with their exact badges and lines", async () => {
    window.history.replaceState(null, "", "/historic");
    await renderHistory();
    expect(screen.getByRole("heading", { level: 1, name: "Històric" })).toBeVisible();
    const dogs = within(screen.getByRole("group", { name: "Gossos" })).getAllByRole("button");
    expect(dogs.map((chip) => [chip.textContent, chip.getAttribute("aria-pressed")])).toEqual([
      ["Duna · C", "false"],
      ["Rock · D", "false"],
      ["Toby · B (Joan Antoni)", "false"],
      ["Tots", "true"],
    ]);
    const types = within(screen.getByRole("group", { name: "Tipus" })).getAllByRole("button");
    expect(types.map((chip) => [chip.textContent, chip.getAttribute("aria-pressed")])).toEqual([
      ["Tot", "true"],
      ["Classes", "false"],
      ["Entrenaments", "false"],
      ["Activitats", "false"],
    ]);
    expect(screen.getByText("Darrers 2 mesos, del més recent al més antic")).toBeVisible();
    expect(historyRows()).toEqual([
      "dt 28/07 | Classe B+C · amb Duna | feta",
      "dv 24/07 | Entrenament · amb Rock | fet",
      "dt 21/07 | Classe B+C · amb Duna | anul·lada tard / Per tu, el 21/07 a les 19:10 · compta com a feta",
      "dv 17/07 | Classe D i sup. · amb Rock | cancel·lada pel club / «Pluja forta: pistes tancades»",
      "dt 14/07 | Classe B+C · amb Duna | no presentat / Sense avís previ · compta com a feta",
      "dg 12/07 | Seminari d'obstacles | feta",
      "dc 8/07 | Classe C+D · amb Duna | anul·lada / Per tu, dins termini · no compta",
    ]);
    const badge = (text: string) =>
      [...document.querySelectorAll(".history-row__badge")].find(
        (item) => item.textContent === text,
      );
    expect(badge("feta")).toHaveClass("ah-tone--success");
    expect(badge("anul·lada tard")).toHaveClass("ah-tone--warning");
    expect(badge("cancel·lada pel club")).toHaveClass("ah-tone--danger");
    expect(badge("no presentat")).toHaveClass("ah-tone--danger");
    expect(badge("anul·lada")).toHaveClass("ah-tone--neutral");
  });

  it("every other line of R-10-14's table: a cancelled future class on top, «ha avisat» late and in time, the club on the member's behalf, the system, a cancelled training, and a club cancellation without a message", async () => {
    window.history.replaceState(null, "", "/historic");
    await renderHistory({ scenario: "historyAllReasons" });
    // As delivered (`startsAt` desc): the eight extra lines mixed with mockup 25's seven.
    expect(historyRows()).toEqual([
      "dl 10/08 | Classe B+C · amb Duna | anul·lada / Per tu, dins termini · no compta",
      "dj 30/07 | Classe B+C · amb Duna | anul·lada tard / Vas avisar el club el 30/07 a les 17:05 · compta com a feta",
      "dt 28/07 | Classe B+C · amb Duna | feta",
      "dl 27/07 | Classe A+B · amb Toby | anul·lada / Vas avisar el club, dins termini · no compta",
      "dv 24/07 | Entrenament · amb Rock | fet",
      "dj 23/07 | Classe D i sup. · amb Rock | anul·lada / Pel club en nom teu · no compta",
      "dt 21/07 | Classe B+C · amb Duna | anul·lada tard / Per tu, el 21/07 a les 19:10 · compta com a feta",
      "dl 20/07 | Classe B+C · amb Duna | anul·lada / Per inactivitat o baixa · no compta",
      "ds 18/07 | Entrenament · amb Rock | anul·lada / Per tu",
      "dv 17/07 | Classe D i sup. · amb Rock | cancel·lada pel club / «Pluja forta: pistes tancades»",
      "dj 16/07 | Entrenament · amb Rock | cancel·lada pel club",
      "dc 15/07 | Classe D i sup. · amb Rock | cancel·lada pel club",
      "dt 14/07 | Classe B+C · amb Duna | no presentat / Sense avís previ · compta com a feta",
      "dg 12/07 | Seminari d'obstacles | feta",
      "dc 8/07 | Classe C+D · amb Duna | anul·lada / Per tu, dins termini · no compta",
    ]);
  });

  it("a detail kind this front does not know yet renders no line (forward compatibility); the empty history says so", async () => {
    server.use(
      http.get("*/api/v1/me/history", () =>
        HttpResponse.json({
          dogs: [{ id: "dog-duna", levelCode: "C", name: "Duna", own: true }],
          from: "2026-06-03",
          items: [
            {
              counts: false,
              date: "2026-07-08",
              detail: { kind: "BY_ROBOT" },
              dogId: "dog-duna",
              dogName: "Duna",
              id: "b5",
              startsAtLocal: "2026-07-08T18:50",
              state: "CANCELLED",
              title: "Classe C+D",
              type: "CLASS",
            },
          ],
          monthsVisible: 1,
          showDog: false,
          types: ["CLASS"],
        }),
      ),
    );
    window.history.replaceState(null, "", "/historic");
    await renderHistory();
    expect(historyRows()).toEqual(["dc 8/07 | Classe C+D | anul·lada"]);
    expect(screen.getByText("Darrer mes, del més recent al més antic")).toBeVisible();
    server.resetHandlers();
  });

  it("the detail's instant is read in the club's time zone, never the device's (a late cancellation near midnight)", async () => {
    server.use(
      http.get("*/api/v1/me/history", () =>
        HttpResponse.json({
          dogs: [{ id: "dog-duna", levelCode: "C", name: "Duna", own: true }],
          from: "2026-05-21",
          items: [
            {
              counts: true,
              date: "2026-07-21",
              // 01:30 UTC on the 22nd is 22:30 on the 21st in Buenos Aires (the club).
              detail: { at: "2026-07-22T01:30:00Z", atLocal: null, kind: "BY_MEMBER" },
              dogId: "dog-duna",
              dogName: "Duna",
              id: "b8",
              startsAtLocal: "2026-07-21T23:00",
              state: "CANCELLED_LATE",
              title: "Classe B+C",
              type: "CLASS",
            },
          ],
          monthsVisible: 2,
          showDog: false,
          types: ["CLASS"],
        }),
      ),
    );
    window.history.replaceState(null, "", "/historic");
    await renderHistory({
      branding: { ...canic, timeZone: "America/Argentina/Buenos_Aires" },
    });
    expect(historyRows()).toEqual([
      "dt 21/07 | Classe B+C | anul·lada tard / Per tu, el 21/07 a les 22:30 · compta com a feta",
    ]);
    server.resetHandlers();
  });

  it("a single accessible dog: no dog chips and no « · amb {gos}»; FREE_TRAINING and ACTIVITIES off: no type chips and no such rows", async () => {
    window.history.replaceState(null, "", "/historic");
    await renderHistory({ scenario: "historySingleDog" });
    expect(screen.queryByRole("group", { name: "Gossos" })).toBeNull();
    expect(historyRows()[0]).toBe("dt 28/07 | Classe B+C | feta");
    expect(historyRows().some((row) => row.includes(" · amb "))).toBe(false);
    cleanup();
    window.history.replaceState(null, "", "/historic");
    await renderHistory({
      branding: { ...canic, modules: without("FREE_TRAINING").filter((m) => m !== "ACTIVITIES") },
      scenario: "historyNoModules",
    });
    expect(screen.queryByRole("group", { name: "Tipus" })).toBeNull();
    expect(historyRows().some((row) => row.includes("Entrenament"))).toBe(false);
    expect(historyRows().some((row) => row.includes("Seminari"))).toBe(false);
  });

  it("the chips drive `dogId` and `type` (↔ ?dogId= and ?tipus=); arriving with ?dogId= preselects that dog", async () => {
    const lines = requests();
    window.history.replaceState(null, "", "/historic?dogId=dog-rock");
    await renderHistory();
    const dogs = within(screen.getByRole("group", { name: "Gossos" }));
    expect(dogs.getByRole("button", { name: "Rock · D" })).toHaveAttribute("aria-pressed", "true");
    expect(historyRows().map((row) => row.split(" | ")[1])).toEqual([
      "Entrenament · amb Rock",
      "Classe D i sup. · amb Rock",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Entrenaments" }));
    await waitFor(() => {
      expect(window.location.search).toBe("?dogId=dog-rock&tipus=TRAINING");
    });
    await waitFor(() => {
      expect(historyRows()).toHaveLength(1);
    });
    fireEvent.click(dogs.getByRole("button", { name: "Tots" }));
    await waitFor(() => {
      expect(window.location.search).toBe("?tipus=TRAINING");
    });
    expect(lines).toEqual([
      "/api/v1/me/history?dogId=dog-rock",
      "/api/v1/me/history?dogId=dog-rock&type=TRAINING",
      "/api/v1/me/history?type=TRAINING",
    ]);
  });

  it("a dog that is not the member's (404 DOG_NOT_ACCESSIBLE) says so and goes back to «Tots»", async () => {
    window.history.replaceState(null, "", "/historic?dogId=dog-thai");
    await renderPage(<HistoryPage client={apiClient()} />);
    expect(await screen.findByText("No podeu accedir a aquest gos.")).toBeVisible();
    await waitFor(() => {
      expect(historyRows()).toHaveLength(7);
    });
    expect(window.location.search).toBe("");
    expect(
      within(screen.getByRole("group", { name: "Gossos" })).getByRole("button", { name: "Tots" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("the empty history, and a failed read with its retry", async () => {
    window.history.replaceState(null, "", "/historic");
    await renderHistory({ scenario: "historyEmpty" });
    expect(screen.getByText("Encara no hi ha res a l'històric")).toBeVisible();
    let calls = 0;
    server.use(
      http.get("*/api/v1/me/history", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json(
              { code: "INTERNAL_ERROR", details: {}, message: "boom", traceId: "t" },
              { status: 500 },
            )
          : undefined;
      }),
    );
    cleanup();
    window.history.replaceState(null, "", "/historic");
    await renderPage(<HistoryPage client={apiClient()} />, { scenario: "member" });
    expect(await screen.findByRole("alert")).toHaveTextContent("S'ha produït un error inesperat");
    fireEvent.click(screen.getByRole("button", { name: "Torna-ho a provar" }));
    await waitFor(() => {
      expect(historyRows()).toHaveLength(7);
    });
  });

  it("an impersonated session reads 25 with the banner; an instructor-only session does not get the page", async () => {
    const lines = requests();
    await renderApp("/historic", { scenario: "impersonated" });
    expect(await screen.findByRole("heading", { level: 1, name: "Històric" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Laura Serra Vidal");
    await waitFor(() => {
      expect(historyRows()).toHaveLength(7);
    });
    // Mockup 25: «Inici» stays lit.
    expect(screen.getByRole("link", { name: "Inici" })).toHaveAttribute("aria-current", "page");
    cleanup();
    lines.length = 0;
    await renderApp("/historic", { scenario: "instructor" });
    await screen.findByRole("navigation", { name: "Navegació principal" });
    expect(screen.queryByRole("heading", { level: 1, name: "Històric" })).toBeNull();
    expect(lines).toEqual([]);
  });

  it("T-10-32 (25): es and en read the rows with no missing key (the titles are the api's)", async () => {
    for (const [locale, row, caption] of [
      ["es", "Classe B+C · con Duna | hecha", "Últimos 2 meses, del más reciente al más antiguo"],
      ["en", "Classe B+C · with Duna | attended", "Last 2 months, newest first"],
    ] as const) {
      cleanup();
      window.history.replaceState(null, "", "/historic");
      await renderHistory({ locale, scenario: "member" });
      expect(screen.getByText(caption)).toBeVisible();
      expect(historyRows()[0]?.split(" | ").slice(1).join(" | ")).toBe(row);
      expect(document.body.textContent).not.toMatch(/history:|enums:|errors:/u);
    }
  });
});

describe("R-10-12 privacy: no member-facing surface can render the observations", () => {
  it("screens 25 and 13 do not import the observations editor, nor read an `observations` field", () => {
    for (const file of ["HistoryPage.tsx", "HistoryRow.tsx", "../SelfServicePages.tsx"]) {
      const source = readFileSync(resolve(import.meta.dirname, file), "utf8");
      expect(source).not.toMatch(/FollowupEditor|DogFollowupEditor|useDogFollowup/u);
      expect(source).not.toMatch(/\.observations\b|observationsBlock/u);
    }
  });
});
