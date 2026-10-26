/** Evidence-only controlled reproduction. The source/helper are imported unchanged. */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { server } from "../../../packages/api-client/src/mocks/server";
import { fireEvent, screen, waitFor, within } from "../../../apps/clubs/node_modules/@testing-library/react/dist/index.js";
import { http } from "msw";
import { afterAll, expect, it, vi } from "../../../apps/clubs/node_modules/vitest/dist/index.js";
import { renderApp, setupBookingWorld } from "../../../apps/clubs/src/booking/test-utils";

setupBookingWorld();

const timeline: Array<Record<string, unknown>> = [];
let finishOldDelete!: () => void;
const delayedOldDelete = new Promise<void>((resolve) => { finishOldDelete = resolve; });
let oldDeleteStarted = false;

async function tapRow(scenario: "bookingLimit" | "bookingLimitDone") {
  await renderApp("/reservar", { scenario });
  await screen.findByRole("heading", { name: "Classes" });
  const row = document.querySelectorAll<HTMLElement>(".class-row")[3];
  fireEvent.click(within(row ?? document.body).getByRole("button"));
  await screen.findByRole("heading", { name: "Confirmar reserva" });
}

it("test A leaves an active hold; its cleanup DELETE is held before MSW", async () => {
  const interceptedFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (request.method === "DELETE" && new URL(request.url).pathname.includes("/seat-holds/")) {
      request.headers.set("X-Evidence-Owner", "test-A-cleanup");
      oldDeleteStarted = true;
      timeline.push({ event: "A cleanup DELETE starts", path: new URL(request.url).pathname });
      await delayedOldDelete;
      timeline.push({ event: "A cleanup DELETE reaches MSW in B" });
    }
    return interceptedFetch(request);
  });
  await tapRow("bookingLimitDone");
  expect(screen.getByRole("button", { name: "CANCEL·LAR LA NOVA RESERVA" })).toBeEnabled();
  timeline.push({ event: "A body ends with its hold mounted" });
});

it("test B observes A's pending cleanup and its own one-click cancellation as two DELETEs", async () => {
  expect(oldDeleteStarted).toBe(true);
  timeline.push({ event: "B starts after original 20 ms teardown with A DELETE pending" });
  const deletes: Array<{ owner: string; path: string }> = [];
  server.use(http.delete("*/api/v1/seat-holds/:id", ({ request }) => {
    const record = {
      owner: request.headers.get("X-Evidence-Owner") ?? "test-B-explicit-cancel",
      path: new URL(request.url).pathname,
    };
    deletes.push(record);
    timeline.push({ event: "B recorder receives DELETE", ...record });
    return undefined;
  }));
  await tapRow("bookingLimit");
  // Release A only after B has a new hold: the reset mock world reuses hold-1.
  finishOldDelete();
  await waitFor(() => expect(deletes).toHaveLength(1));
  fireEvent.click(screen.getByRole("button", { name: "CANCEL·LAR LA NOVA RESERVA" }));
  await screen.findByRole("heading", { name: "Classes" });
  await waitFor(() => expect(deletes).toHaveLength(2));
  expect(deletes.map(({ owner }) => owner)).toEqual(["test-A-cleanup", "test-B-explicit-cancel"]);
  expect(deletes.map(({ path }) => path)).toEqual([
    "/api/v1/seat-holds/hold-1", "/api/v1/seat-holds/hold-1",
  ]);
  expect(window.location.pathname).toBe("/reservar");
});

afterAll(() => {
  finishOldDelete();
  writeFileSync(resolve(import.meta.dirname, "controlled-request-provenance.json"), JSON.stringify(timeline, null, 2) + "\n");
});
