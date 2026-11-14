import { mockScenario } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { AuthClient, MemoryRefreshTokenStore, SessionProvider } from "@agilityhub/auth";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { ADMIN_AUTH_OPTIONS } from "./auth-options";

// The unit tests run without a commit (`vite.config.ts`): this file runs as a CI build would.
vi.mock("./build-version", () => ({
  RUNNING_BUILD: { commit: "0123456789abcdef0123456789abcdef01234567", version: "1.0.0" },
}));

const RUNNING_COMMIT = "0123456789abcdef0123456789abcdef01234567";
const DEPLOYED_COMMIT = "89abcdef0123456789abcdef0123456789abcdef";

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
});
afterAll(() => {
  server.close();
});

/** The host's `version.json`, as Caddy serves it (or a 404). */
function deployed(body: { commit: string | null; version: string } | undefined, status = 200) {
  const reads: string[] = [];
  server.use(
    http.get("*/version.json", ({ request }) => {
      reads.push(request.cache);
      return status === 200
        ? HttpResponse.json(body)
        : new HttpResponse("Not found", { status, headers: { "Content-Type": "text/plain" } });
    }),
  );
  return reads;
}

async function renderBackOffice() {
  const client = new AuthClient({
    ...ADMIN_AUTH_OPTIONS,
    apiBaseUrl: `${window.location.origin}/api/v1`,
    identityBaseUrl: window.location.origin,
    mockMode: true,
    mockRefreshTokenStore: new MemoryRefreshTokenStore(),
  });
  await client.login("aina.serra@example.test", "secret-password");
  window.history.pushState(null, "", "/tauler");
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-audit", "auth", "common", "shell"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <SessionProvider client={client}>
          <App authClient={client} />
        </SessionProvider>
      </BrandingProvider>
    </I18nextProvider>,
  );
  await screen.findByRole("heading", { level: 1 }, { timeout: 5_000 });
}

describe("FE-07 «Hi ha una versió nova · Recarrega» in the back office", () => {
  it("offers the reload when the host serves another build, read past every cache", async () => {
    const reads = deployed({ commit: DEPLOYED_COMMIT, version: "1.0.0" });
    await renderBackOffice();
    expect(await screen.findByText("Hi ha una versió nova")).toBeVisible();
    expect(screen.getByRole("button", { name: "Recarrega" })).toBeVisible();
    expect(reads[0]).toBe("no-store");
  });

  it.each([
    ["the same build", { commit: RUNNING_COMMIT, version: "1.0.0" }, 200],
    ["a 404", undefined, 404],
    ["a bundle without a commit", { commit: null, version: "1.0.0" }, 200],
  ])("shows nothing for %s", async (_label, body, status) => {
    const reads = deployed(body, status);
    await renderBackOffice();
    await waitFor(() => {
      expect(reads).toHaveLength(1);
    });
    expect(screen.queryByText("Hi ha una versió nova")).toBeNull();
  });

  it("waits while a drawer or a dialog is open", async () => {
    deployed({ commit: DEPLOYED_COMMIT, version: "1.0.0" });
    await renderBackOffice();
    expect(await screen.findByText("Hi ha una versió nova")).toBeVisible();
    // Any dialog or drawer of the page, with a field the admin is typing in.
    const dialog = document.createElement("section");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const field = document.createElement("input");
    dialog.append(field);
    document.body.append(dialog);
    field.focus();
    await waitFor(() => {
      expect(screen.queryByText("Hi ha una versió nova")).toBeNull();
    });
    dialog.remove();
    await waitFor(
      () => {
        expect(screen.getByText("Hi ha una versió nova")).toBeVisible();
      },
      { timeout: 5_000 },
    );
  });
});
