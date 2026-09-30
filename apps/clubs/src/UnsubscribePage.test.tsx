import {
  mockScenario,
  resetNotificationMockState,
  UNSUBSCRIBE_TOKENS,
} from "@agilityhub/api-client/mocks";
import { server } from "@agilityhub/api-client/mocks/server";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { renderApp } from "./booking/test-utils";

let posts: unknown[] = [];

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  resetNotificationMockState();
  mockScenario("member");
  posts = [];
  server.events.on("request:start", ({ request }) => {
    if (new URL(request.url).pathname !== "/api/v1/email-unsubscribes") return;
    void request
      .clone()
      .json()
      .then((body: unknown) => {
        posts.push(body);
      });
  });
});
afterEach(() => {
  cleanup();
  server.events.removeAllListeners();
  server.resetHandlers();
  resetNotificationMockState();
  window.history.replaceState(null, "", "/");
});
afterAll(() => {
  server.close();
});

describe("E7-W02 step 10 · the e-mail unsubscribe page /comunicats/baixa (S11 R-11-08)", () => {
  it("200: sends the token once and confirms, with a way to the «Avisos» of 12 for a session", async () => {
    await renderApp(`/comunicats/baixa?t=${UNSUBSCRIBE_TOKENS.valid}`);
    expect(
      await screen.findByText("Ja no rebràs els comunicats del club per correu."),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Deixar de rebre aquests comunicats" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Canvia els teus avisos al perfil" })).toHaveAttribute(
      "href",
      "/perfil#avisos",
    );
    await waitFor(() => {
      expect(posts).toEqual([{ token: UNSUBSCRIBE_TOKENS.valid }]);
    });
    // The page never prints the token.
    expect(document.body.textContent).not.toContain(UNSUBSCRIBE_TOKENS.valid);
  });

  it("422 UNSUBSCRIBE_TOKEN_INVALID: the link is no longer valid, change it on 12", async () => {
    await renderApp(`/comunicats/baixa?t=${UNSUBSCRIBE_TOKENS.expired}`);
    expect(await screen.findByRole("alert")).toHaveTextContent("Aquest enllaç ja no és vàlid.");
    expect(screen.getByRole("link", { name: "Canvia els teus avisos al perfil" })).toBeVisible();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("a link without its token is invalid and sends nothing", async () => {
    await renderApp("/comunicats/baixa");
    expect(await screen.findByRole("alert")).toHaveTextContent("Aquest enllaç ja no és vàlid.");
    expect(posts).toEqual([]);
  });

  it("a network error offers a retry, which sends the token again", async () => {
    let calls = 0;
    server.use(
      http.post("*/api/v1/email-unsubscribes", () => {
        calls += 1;
        return calls === 1 ? HttpResponse.error() : undefined;
      }),
    );
    await renderApp(`/comunicats/baixa?t=${UNSUBSCRIBE_TOKENS.valid}`);
    expect(await screen.findByRole("alert")).toHaveTextContent("No s'ha pogut completar la baixa.");
    fireEvent.click(screen.getByRole("button", { name: "Torna-ho a provar" }));
    expect(
      await screen.findByText("Ja no rebràs els comunicats del club per correu."),
    ).toBeVisible();
    expect(calls).toBe(2);
  });
});
