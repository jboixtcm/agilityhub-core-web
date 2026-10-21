import {
  CONSOLE_CLUB_IDS,
  consoleState,
  resetConsoleMockState,
} from "@agilityhub/api-client/mocks";
import { server } from "@agilityhub/api-client/mocks/server";
import { createClubFormats } from "@agilityhub/i18n";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { captureRequests, renderConsole } from "./console-test-utils";
import { formatBytes } from "./shared";

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  resetConsoleMockState();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.events.removeAllListeners();
  resetConsoleMockState();
});
afterAll(() => {
  server.close();
});

function club(id: string) {
  const found = consoleState.clubs.find((candidate) => candidate.id === id);
  if (found === undefined) throw new TypeError(`No fixture club ${id}`);
  return found;
}

function row(name: string) {
  const cell = screen.getByRole("link", { name: `Obre la fitxa de ${name}` });
  const element = cell.closest("tr");
  if (element === null) throw new TypeError("No row");
  return element;
}

describe("E10-W01 step 2 · D19 list (S17 §2 «D19 Llista», universal list)", () => {
  it("shows S17's columns: name, slug, status, country and zone, members, module chips, last admin access, SMS, storage and the checklist", async () => {
    await renderConsole("/consola/clubs");
    const canic = club(CONSOLE_CLUB_IDS.canic);
    expect(await screen.findByRole("heading", { name: "Consola de clubs" })).toBeInTheDocument();
    const canicRow = await waitFor(() => row(canic.name));
    const cells = within(canicRow);
    expect(cells.getByText(canic.slug)).toBeInTheDocument();
    expect(cells.getByText("Actiu")).toBeInTheDocument();
    expect(cells.getByText("ES · Europe/Madrid")).toBeInTheDocument();
    expect(cells.getByText("168")).toBeInTheDocument();
    // Round 2 #3: the first three modules (catalog order) and «+k» naming the rest.
    const chips = canicRow.querySelectorAll(".console-chips .ah-chip");
    expect([...chips].map((chip) => chip.textContent)).toEqual([
      "Entrenaments lliures",
      "Facturació",
      "Packs",
      `+${String(canic.modules.length - 3)}`,
    ]);
    expect(
      cells.getByRole("img", {
        name: new RegExp(`^${String(canic.modules.length - 3)} mòduls més: .*Recorreguts`, "u"),
      }),
    ).toBeInTheDocument();
    expect(cells.queryByText("Recorreguts")).toBeNull();
    expect(cells.getByText("312")).toBeInTheDocument();
    expect(cells.getByText(formatBytes(canic.usage.storageBytes, "ca"))).toBeInTheDocument();
    expect(cells.getByText("7/7")).toBeInTheDocument();
    // Aina's 07:42Z access, in the club's own zone (Madrid, UTC+2 in October).
    expect(
      cells.getByText(
        createClubFormats("ca", "Europe/Madrid", "EUR").formatDateTime("2026-10-15T07:42:00Z"),
      ),
    ).toBeInTheDocument();
    const minim = within(row(club(CONSOLE_CLUB_IDS.minim).name));
    // E11-W05 step 6 (A39.1, E153): ONBOARDING reads «En configuració».
    expect(minim.getByText("En configuració")).toBeInTheDocument();
    // R-17-06: «4/7 · falten: …» (no verified domain, no FAQ, no privacy URL).
    expect(minim.getByText("4/7")).toBeInTheDocument();
    expect(
      minim.getByText(/falten: Dominis verificats, Preguntes freqüents, Política de privacitat/u),
    ).toBeInTheDocument();
    expect(minim.getByText("mai")).toBeInTheDocument();
  });

  it("reads each club's last admin access in that club's zone, never the reader's (Atlantic/Canary)", async () => {
    await renderConsole("/consola/clubs");
    const riera = within(await waitFor(() => row("Club Agility Riera")));
    const canary = createClubFormats("ca", "Atlantic/Canary", "EUR").formatDateTime(
      "2026-09-02T10:00:00Z",
    );
    const madrid = createClubFormats("ca", "Europe/Madrid", "EUR").formatDateTime(
      "2026-09-02T10:00:00Z",
    );
    expect(canary).not.toBe(madrid);
    expect(riera.getByText(canary)).toBeInTheDocument();
    expect(riera.getByText("GENERIC · Atlantic/Canary")).toBeInTheDocument();
  });

  it("filters by the contract's filterable fields and shows the api's appliedFilters as the chip", async () => {
    const requests = captureRequests(
      (method, url) => method === "GET" && url.pathname.endsWith("/platform/clubs"),
    );
    await renderConsole("/consola/clubs");
    await waitFor(() => row("Club Agility Riera"));
    fireEvent.change(screen.getByRole("combobox", { name: "Estat" }), {
      target: { value: "SUSPENDED" },
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("link", {
          name: `Obre la fitxa de ${club(CONSOLE_CLUB_IDS.canic).name}`,
        }),
      ).toBeNull();
    });
    expect(row("Club Agility Riera")).toBeInTheDocument();
    const last = requests.at(-1);
    expect(last?.url.searchParams.getAll("filter")).toEqual(["status:eq:SUSPENDED"]);
    // `fields`: only what the visible columns read, plus the row id.
    expect(last?.url.searchParams.get("fields")?.split(",")).toEqual(
      expect.arrayContaining([
        "id",
        "name",
        "slug",
        "status",
        "usage",
        "onboardingChecklist",
        "timeZone",
      ]),
    );
    expect(last?.url.searchParams.getAll("sort")).toEqual(["name,asc"]);
  });

  it("a row opens the record and [Nou club] opens the wizard", async () => {
    const { navigations } = await renderConsole("/consola/clubs");
    const canic = club(CONSOLE_CLUB_IDS.canic);
    await waitFor(() => row(canic.name));
    fireEvent.click(screen.getByRole("link", { name: `Obre la fitxa de ${canic.name}` }));
    expect(navigations.at(-1)).toBe(`/consola/clubs/${canic.id}/identitat`);
    expect(await screen.findByRole("heading", { level: 1, name: canic.name })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Clubs" }));
    fireEvent.click(await screen.findByRole("button", { name: "Nou club" }));
    expect(navigations.at(-1)).toBe("/consola/clubs/nou");
    expect(await screen.findByRole("heading", { level: 1, name: "Nou club" })).toBeInTheDocument();
  });

  it("es/en: the list reads in the reader's language (R-17-13)", async () => {
    await renderConsole("/consola/clubs", { locale: "en" });
    expect(await screen.findByRole("heading", { name: "Club console" })).toBeInTheDocument();
    expect(
      await screen.findByRole("columnheader", { name: /Active members/u }),
    ).toBeInTheDocument();
    cleanup();
    await renderConsole("/consola/clubs", { locale: "es" });
    expect(await screen.findByRole("heading", { name: "Consola de clubes" })).toBeInTheDocument();
    expect(
      await screen.findByRole("columnheader", { name: /Abonados activos/u }),
    ).toBeInTheDocument();
  });
});
