import { server } from "@agilityhub/api-client/mocks/server";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http } from "msw";
import { describe, expect, it, vi } from "vitest";

import { renderApp, setupBookingWorld } from "./test-utils";

setupBookingWorld();

async function openSwapConfirmation(scenario: "bookingLimit" | "bookingLimitDone") {
  await renderApp("/reservar", { scenario });
  await screen.findByRole("heading", { name: "Classes" });
  const row = document.querySelectorAll<HTMLElement>(".class-row")[3];
  fireEvent.click(within(row ?? document.body).getByRole("button"));
  await screen.findByRole("heading", { name: "Confirmar reserva" });
}

describe("booking world teardown keeps a slow hold release in its own test", () => {
  let previousReleaseStatus: number | undefined;
  let finishPreviousRelease: () => void;
  const previousRelease = new Promise<void>((resolve) => {
    finishPreviousRelease = resolve;
  });

  it("leaves a live confirmation whose unmount DELETE takes longer than 20 ms", async () => {
    const interceptedFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const delayedRelease =
        request.method === "DELETE" && new URL(request.url).pathname.includes("/seat-holds/");
      if (delayedRelease) {
        await new Promise((resolve) => {
          setTimeout(resolve, 300);
        });
      }
      try {
        const response = await interceptedFetch(request);
        if (delayedRelease) previousReleaseStatus = response.status;
        return response;
      } finally {
        if (delayedRelease) finishPreviousRelease();
      }
    });
    await openSwapConfirmation("bookingLimitDone");
    expect(screen.getByRole("button", { name: "CANCEL·LAR LA NOVA RESERVA" })).toBeEnabled();
    // setupBookingWorld's actual afterEach unmounts this hold and must await its DELETE.
  });

  it("starts after the previous release finishes and records only its own cancellation", async () => {
    try {
      expect(previousReleaseStatus).toBe(204);
      const deletes: string[] = [];
      server.use(
        http.delete("*/api/v1/seat-holds/:id", ({ request }) => {
          deletes.push(new URL(request.url).pathname);
          return undefined;
        }),
      );
      await openSwapConfirmation("bookingLimit");
      fireEvent.click(screen.getByRole("button", { name: "CANCEL·LAR LA NOVA RESERVA" }));
      await screen.findByRole("heading", { name: "Classes" });
      await waitFor(() => {
        expect(deletes).toEqual(["/api/v1/seat-holds/hold-1"]);
      });
    } finally {
      // Also settle the deliberate slow transport when this regression fails before the fix.
      await previousRelease;
    }
  });
});
