import {
  CONSOLE_CLUB_IDS,
  consoleState,
  resetConsoleMockState,
} from "@agilityhub/api-client/mocks";
import { server } from "@agilityhub/api-client/mocks/server";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { captureRequests, renderConsole } from "./console-test-utils";

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
  vi.restoreAllMocks();
});
afterAll(() => {
  server.close();
});

const CANIC = CONSOLE_CLUB_IDS.canic;

async function openParameters() {
  await renderConsole(`/consola/clubs/${CANIC}/parametres`);
  await screen.findByRole("heading", { level: 1, name: "Club Agility Cànic" });
  await screen.findByRole("button", { name: /Edita Llindar d.anul·lació/u });
}

function parameterRow(name: RegExp) {
  const button = screen
    .getAllByRole("button")
    .find(
      (candidate) =>
        candidate.classList.contains("settings-parameter__main") &&
        name.test(candidate.textContent),
    );
  if (button === undefined) throw new TypeError(`No parameter row ${String(name)}`);
  return button;
}

async function openEditor(name: RegExp) {
  fireEvent.click(parameterRow(name));
  return within(await screen.findByRole("dialog"));
}

describe("E10-W03 step 4 · D19 «Paràmetres» on the club's own values (S17 §2, E118, E10-T04)", () => {
  it("reads GET /platform/clubs/{id}/parameters: the club's override, the defaults, and PLATFORM_ONLY keys marked", async () => {
    const reads = captureRequests(
      (method, url) => method === "GET" && url.pathname.endsWith(`/clubs/${CANIC}/parameters`),
    );
    await openParameters();
    expect(reads).toHaveLength(1);
    // The Cànic overrides the late-cancel threshold (240 min); the default (120) is said too.
    const override = parameterRow(/Llindar d.anul·lació/u);
    expect(override).toHaveTextContent("valor del club");
    expect(override).toHaveTextContent("4 h");
    expect(override).toHaveTextContent("Per defecte: 2 h");
    const platformKey = parameterRow(/Durada de la sessió/u);
    expect(platformKey).toHaveTextContent("només plataforma");
    expect(platformKey).toHaveTextContent("per defecte");
    expect(screen.getByRole("heading", { level: 2, name: "Sistema" })).toBeInTheDocument();
    expect(screen.queryByText("auth.sessionDays")).toBeNull();
    // PLATFORM_ONLY keys are editable here (S17 §9), unlike D11.
    expect(platformKey).toBeEnabled();
  });

  it("a key the club overrides is saved with its override's version; one it has not, with version 0", async () => {
    const puts = captureRequests((method) => method === "PUT");
    await openParameters();
    let editor = await openEditor(/Llindar d.anul·lació/u);
    fireEvent.change(editor.getByRole("spinbutton"), { target: { value: "180" } });
    fireEvent.click(editor.getByRole("button", { name: "DESA" }));
    await screen.findByText(/valor desat\./u);
    expect(puts[0]?.url.pathname).toBe(
      `/api/v1/platform/clubs/${CANIC}/parameters/bookings.lateCancelThresholdMinutes`,
    );
    expect(puts[0]?.body).toEqual({ value: 180, version: 3 });

    editor = await openEditor(/Durada de la sessió/u);
    fireEvent.change(editor.getByRole("spinbutton"), { target: { value: "45" } });
    fireEvent.click(editor.getByRole("button", { name: "DESA" }));
    await waitFor(() => {
      expect(puts).toHaveLength(2);
    });
    expect(puts[1]?.body).toEqual({ value: 45, version: 0 });
    // The list is read again: the saved key is the club's now.
    await waitFor(() => {
      expect(parameterRow(/Durada de la sessió/u)).toHaveTextContent("valor del club");
    });
  });

  it("409 STALE_VERSION rereads the row: the editor says the current value, keeps the draft, and resends with the fresh version", async () => {
    const puts = captureRequests((method) => method === "PUT");
    await openParameters();
    const editor = await openEditor(/Llindar d.anul·lació/u);
    // Another session changes the override meanwhile (version 3 → 4).
    const current = consoleState.parameters[CANIC]?.["bookings.lateCancelThresholdMinutes"];
    if (current === undefined) throw new TypeError("No seeded override");
    consoleState.parameters[CANIC] = {
      ...consoleState.parameters[CANIC],
      "bookings.lateCancelThresholdMinutes": { ...current, value: 300, version: 4 },
    };
    fireEvent.change(editor.getByRole("spinbutton"), { target: { value: "180" } });
    fireEvent.click(editor.getByRole("button", { name: "DESA" }));
    expect(
      await editor.findByText(
        "Algú l'ha canviat mentrestant: ara val 5 h. Si deses, el substitueixes pel teu valor.",
      ),
    ).toBeInTheDocument();
    expect(editor.getByRole("spinbutton")).toHaveValue(180);
    fireEvent.click(editor.getByRole("button", { name: "DESA" }));
    await screen.findByText(/valor desat\./u);
    expect(puts.map((request) => request.body)).toEqual([
      { value: 180, version: 3 },
      { value: 180, version: 4 },
    ]);
  });

  it("after STALE_VERSION and a failed reread, it shows the error, keeps the draft and disables save until retry succeeds", async () => {
    const puts = captureRequests((method) => method === "PUT");
    await openParameters();
    const editor = await openEditor(/Llindar d.anul·lació/u);
    const current = consoleState.parameters[CANIC]?.["bookings.lateCancelThresholdMinutes"];
    if (current === undefined) throw new TypeError("No seeded override");
    consoleState.parameters[CANIC] = {
      ...consoleState.parameters[CANIC],
      "bookings.lateCancelThresholdMinutes": { ...current, value: 300, version: 4 },
    };
    server.use(
      http.get(`${window.location.origin}/api/v1/platform/clubs/:id/parameters`, () =>
        HttpResponse.json(
          {
            code: "INTERNAL_ERROR",
            details: {},
            message: "Reread failed",
            traceId: "trace-parameters-reread",
          },
          { status: 500 },
        ),
      ),
    );
    fireEvent.change(editor.getByRole("spinbutton"), { target: { value: "180" } });
    fireEvent.click(editor.getByRole("button", { name: "DESA" }));

    expect(await editor.findByRole("alert")).toHaveTextContent("error inesperat");
    expect(editor.getByRole("spinbutton")).toHaveValue(180);
    expect(editor.getByRole("button", { name: "DESA" })).toBeDisabled();
    expect(puts).toHaveLength(1);

    server.resetHandlers();
    fireEvent.click(editor.getByRole("button", { name: "Torna-ho a provar" }));
    await waitFor(() => {
      expect(editor.getByRole("button", { name: "DESA" })).toBeEnabled();
    });
    expect(editor.getByRole("spinbutton")).toHaveValue(180);
    fireEvent.click(editor.getByRole("button", { name: "DESA" }));
    await screen.findByText(/valor desat\./u);
    expect(puts.map((request) => request.body)).toEqual([
      { value: 180, version: 3 },
      { value: 180, version: 4 },
    ]);
  });

  it("after a successful save and failed reread, it shows retry and blocks every editor until fresh values arrive", async () => {
    await openParameters();
    const editor = await openEditor(/Llindar d.anul·lació/u);
    server.use(
      http.get(`${window.location.origin}/api/v1/platform/clubs/:id/parameters`, () =>
        HttpResponse.json(
          {
            code: "INTERNAL_ERROR",
            details: {},
            message: "Reread failed",
            traceId: "trace-parameters-after-save",
          },
          { status: 500 },
        ),
      ),
    );
    fireEvent.change(editor.getByRole("spinbutton"), { target: { value: "180" } });
    fireEvent.click(editor.getByRole("button", { name: "DESA" }));

    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent("error inesperat");
    expect(parameterRow(/Llindar d.anul·lació/u)).toBeDisabled();
    server.resetHandlers();
    fireEvent.click(within(error).getByRole("button", { name: "Torna-ho a provar" }));
    await waitFor(() => {
      expect(parameterRow(/Llindar d.anul·lació/u)).toBeEnabled();
    });
  });
});
