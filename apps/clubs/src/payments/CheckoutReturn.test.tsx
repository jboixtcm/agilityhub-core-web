import { server } from "@agilityhub/api-client/mocks/server";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { e8Client, renderE8, setupE8World } from "../test/e8";

import { CheckoutReturn } from "./CheckoutReturn";

setupE8World();

function returnFrom(sessionId: string): void {
  window.history.replaceState(null, "", `/?checkout=${sessionId}`);
}

describe("E8-W02 round 2 checkout return", () => {
  it("sends the signup capability only for an anonymous signup return", async () => {
    returnFrom("cs_signup_return");
    let header: string | null = null;
    server.use(
      http.get("*/api/v1/checkout-sessions/:id", ({ request }) => {
        header = request.headers.get("X-Signup-Token");
        if (header !== "mock-signup-token") {
          return HttpResponse.json(
            { code: "UNAUTHENTICATED", details: {}, message: "UNAUTHENTICATED" },
            { status: 401 },
          );
        }
        return HttpResponse.json({ checkoutSessionId: "cs_signup_return", status: "EXPIRED" });
      }),
    );
    await renderE8(
      <CheckoutReturn
        client={e8Client()}
        onRetry={() => undefined}
        signupToken="mock-signup-token"
      />,
    );
    expect(await screen.findByText("La sessió de pagament ha caducat.")).toBeVisible();
    expect(header).toBe("mock-signup-token");

    returnFrom("cs_booking_return");
    header = "not-read";
    server.use(
      http.get("*/api/v1/checkout-sessions/:id", ({ request }) => {
        header = request.headers.get("X-Signup-Token");
        return HttpResponse.json({ checkoutSessionId: "cs_booking_return", status: "PAID" });
      }),
    );
    await renderE8(<CheckoutReturn client={e8Client()} onRetry={() => undefined} />);
    expect(await screen.findByText("Pagament rebut")).toBeVisible();
    expect(header).toBeNull();
  });

  it("keeps PENDING after the ten-second budget, offers refresh and keeps the close hint", async () => {
    returnFrom("cs_slow");
    let clock = 0;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    server.use(
      http.get("*/api/v1/checkout-sessions/:id", () => {
        clock = 10_001;
        return HttpResponse.json({ checkoutSessionId: "cs_slow", status: "PENDING" });
      }),
    );
    await renderE8(<CheckoutReturn client={e8Client()} onRetry={() => undefined} />);
    expect(await screen.findByText("Estem confirmant el pagament…")).toBeVisible();
    expect(screen.getByRole("button", { name: "Actualitza" })).toBeEnabled();
    expect(screen.getByText(/Ja pots tancar/u)).toBeVisible();
    expect(screen.queryByText("La sessió de pagament ha caducat.")).not.toBeInTheDocument();
  });

  it("a parent re-render with a new inline onPaid neither restarts the poll nor reads again", async () => {
    returnFrom("cs_parent_render");
    let reads = 0;
    server.use(
      http.get("*/api/v1/checkout-sessions/:id", () => {
        reads += 1;
        return HttpResponse.json({ checkoutSessionId: "cs_parent_render", status: "PAID" });
      }),
    );
    // A stable client, as App and SignupPage pass: only the inline onPaid changes per render.
    const client = e8Client();
    function Parent() {
      const [paidCalls, setPaidCalls] = useState(0);
      return (
        <>
          <output>{`paid ${String(paidCalls)}`}</output>
          <CheckoutReturn
            client={client}
            onPaid={() => {
              setPaidCalls((value) => value + 1);
            }}
            onRetry={() => undefined}
          />
        </>
      );
    }
    await renderE8(<Parent />);
    expect(await screen.findByText("Pagament rebut")).toBeVisible();
    expect(await screen.findByText("paid 1")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(reads).toBe(1);
    expect(screen.getByText("paid 1")).toBeInTheDocument();
  });

  it("shows a failed read locally and retries the same status read", async () => {
    returnFrom("cs_retry_read");
    let reads = 0;
    server.use(
      http.get("*/api/v1/checkout-sessions/:id", () => {
        reads += 1;
        return reads === 1
          ? HttpResponse.error()
          : HttpResponse.json({ checkoutSessionId: "cs_retry_read", status: "PAID" });
      }),
    );
    await renderE8(<CheckoutReturn client={e8Client()} onRetry={() => undefined} />);
    expect(await screen.findByText(/error inesperat/u)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Actualitza" }));
    expect(await screen.findByText("Pagament rebut")).toBeVisible();
    await waitFor(() => {
      expect(reads).toBe(2);
    });
  });
});
