import {
  CONSOLE_CLUB_IDS,
  consoleState,
  mockScenario,
  resetConsoleMockState,
  resetOnboardingMockState,
  supportMe,
} from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import {
  AuthClient,
  IMPERSONATION_STORAGE_KEY,
  MemoryRefreshTokenStore,
  SessionProvider,
} from "@agilityhub/auth";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../App";
import { liveSupportAccesses } from "../audit/SupportAccessesCard";
import { ADMIN_AUTH_OPTIONS } from "../auth-options";
import { API_BASE, captureRequests, renderConsole } from "../console/console-test-utils";

import { SUPPORT_ACCESS, SUPPORT_READY, supportAdminHost } from "./support-access";
import { SupportEntryPage } from "./SupportPages";

const branding: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};
/** The product host the console runs on (production default of `consoleOrigin()`). */
const CONSOLE_ORIGIN = "https://clubsadmin.agilitydoghub.com";
/** The Cànic's verified back-office host (`console.ts` fixture), as `clubAdminOrigin()` opens it. */
const CANIC_ADMIN_ORIGIN = "https://admin.example.test";

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  resetConsoleMockState();
  resetOnboardingMockState();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.events.removeAllListeners();
  resetConsoleMockState();
  mockScenario("admin");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  document.querySelectorAll("iframe").forEach((frame) => {
    frame.remove();
  });
  window.history.pushState(null, "", "/");
});
afterAll(() => {
  server.close();
});

/** Another browsing context to play the other tab (a real `Window`, so `MessageEvent.source` works). */
function fakeTab() {
  const frame = document.createElement("iframe");
  document.body.append(frame);
  const tab = frame.contentWindow;
  if (tab === null) throw new TypeError("No iframe window");
  const postMessage = vi.spyOn(tab, "postMessage").mockImplementation(() => undefined);
  const close = vi.spyOn(tab, "close").mockImplementation(() => undefined);
  return { close, postMessage, tab };
}

function message(data: unknown, origin: string, source: Window) {
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { data, origin, source }));
  });
}

/** Full page loads (`location.replace`), which jsdom cannot do, recorded; the rest real. */
function stubPageLoads() {
  const real = window.location;
  const assign = vi.fn();
  const replace = vi.fn();
  vi.stubGlobal("location", {
    assign,
    get hash() {
      return real.hash;
    },
    get host() {
      return real.host;
    },
    get href() {
      return real.href;
    },
    get origin() {
      return real.origin;
    },
    get pathname() {
      return real.pathname;
    },
    replace,
    get search() {
      return real.search;
    },
  });
  return { assign, replace };
}

function authClient() {
  return new AuthClient({
    ...ADMIN_AUTH_OPTIONS,
    apiBaseUrl: `${window.location.origin}/api/v1`,
    identityBaseUrl: window.location.origin,
    mockMode: true,
    mockRefreshTokenStore: new MemoryRefreshTokenStore(),
  });
}

async function renderApplication(client: AuthClient, ui = <App authClient={client} />) {
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-audit", "auth", "shell"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <SessionProvider client={client}>{ui}</SessionProvider>
      </BrandingProvider>
    </I18nextProvider>,
  );
}

async function openStatus(id: string) {
  await renderConsole(`/consola/clubs/${id}/estat`);
  await screen.findByRole("heading", { level: 2, name: "Accés de suport" });
}

describe("E10-W03 step 2 · «Entra com a administrador del club» from D19 «Estat» (R-17-10)", () => {
  it("T-17-09 opens the club's back-office host on the click, then hands it the token by postMessage only (never in the address)", async () => {
    const posts = captureRequests(
      (method, url) => method === "POST" && url.pathname.endsWith("/support-access"),
    );
    const { postMessage, tab } = fakeTab();
    const open = vi.spyOn(window, "open").mockReturnValue(tab);
    await openStatus(CONSOLE_CLUB_IDS.canic);
    const enter = screen.getByRole("button", { name: "Entra com a administrador del club" });
    expect(enter).toBeDisabled();
    expect(screen.getByText("S'obrirà admin.example.test.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Motiu de l'accés"), {
      target: { value: "Revisar la remesa d'octubre" },
    });
    fireEvent.click(enter);
    // Opened at once (a popup blocker lets only the click's own window through), without any token.
    expect(open).toHaveBeenCalledWith(`${CANIC_ADMIN_ORIGIN}/suport`, "_blank");
    expect(String(open.mock.calls[0]?.[0])).not.toContain("token");
    expect(
      await screen.findByText(/S'ha obert el backoffice del club en una pestanya nova\./u),
    ).toBeInTheDocument();
    expect(posts).toHaveLength(1);
    expect(posts[0]?.body).toEqual({ reason: "Revisar la remesa d'octubre" });
    expect(posts[0]?.headers.get("Idempotency-Key")).toMatch(/[0-9a-f-]{36}/u);

    // A «ready» from another origin, or another window, gets nothing.
    message({ type: SUPPORT_READY }, "https://evil.example.test", tab);
    message({ type: SUPPORT_READY }, CANIC_ADMIN_ORIGIN, window);
    expect(postMessage).not.toHaveBeenCalled();
    // The opened tab's «ready» gets the access, addressed to its exact origin.
    message({ type: SUPPORT_READY }, CANIC_ADMIN_ORIGIN, tab);
    expect(postMessage).toHaveBeenCalledWith(
      {
        expiresAt: expect.any(String) as string,
        token: "mock-support-token",
        type: SUPPORT_ACCESS,
      },
      CANIC_ADMIN_ORIGIN,
    );
  });

  it("a refused access closes the tab it opened and says why in «Estat»; a blocked popup sends nothing", async () => {
    server.use(
      http.post(`${API_BASE}/platform/clubs/:id/support-access`, () =>
        HttpResponse.json(
          { code: "FORBIDDEN", details: {}, message: "Forbidden", traceId: "trace-support" },
          { status: 403 },
        ),
      ),
    );
    const { close, postMessage, tab } = fakeTab();
    const open = vi.spyOn(window, "open").mockReturnValue(tab);
    await openStatus(CONSOLE_CLUB_IDS.canic);
    fireEvent.change(screen.getByLabelText("Motiu de l'accés"), { target: { value: "Suport" } });
    fireEvent.click(screen.getByRole("button", { name: "Entra com a administrador del club" }));
    await waitFor(() => {
      expect(close).toHaveBeenCalled();
    });
    message({ type: SUPPORT_READY }, CANIC_ADMIN_ORIGIN, tab);
    expect(postMessage).not.toHaveBeenCalled();

    const posts = captureRequests(
      (method, url) => method === "POST" && url.pathname.endsWith("/support-access"),
    );
    open.mockReturnValue(null);
    fireEvent.click(screen.getByRole("button", { name: "Entra com a administrador del club" }));
    expect(
      await screen.findByText(/El navegador no ha deixat obrir la pestanya nova\./u),
    ).toBeInTheDocument();
    expect(posts).toEqual([]);
  });

  it("a club without a verified back-office domain cannot be entered (no host to open)", async () => {
    await openStatus(CONSOLE_CLUB_IDS.minim);
    expect(
      screen.getByText(
        "El club no té cap domini del backoffice verificat: afegeix-ne un a la pestanya Dominis.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Entra com a administrador del club" }),
    ).toBeDisabled();
  });

  it("the host is the primary verified clubs-admin domain, else another verified one, never a pending one", () => {
    const domain = (host: string, status: "BROKEN" | "PENDING" | "VERIFIED", primary = false) => ({
      app: "clubs-admin" as const,
      host,
      primary,
      status,
    });
    expect(
      supportAdminHost({
        domains: [domain("a.example.test", "VERIFIED"), domain("b.example.test", "VERIFIED", true)],
      }),
    ).toBe("b.example.test");
    expect(supportAdminHost({ domains: [domain("a.example.test", "VERIFIED")] })).toBe(
      "a.example.test",
    );
    expect(
      supportAdminHost({
        domains: [domain("p.example.test", "PENDING"), domain("x.example.test", "BROKEN")],
      }),
    ).toBeUndefined();
    expect(consoleState.clubs.length).toBeGreaterThan(0);
  });
});

describe("E10-W03 step 2 · the club's back-office tab of a support access (`/suport`)", () => {
  it("T-17-09 says it is ready to its opener (the console's origin only), enters the access as this tab's session and opens D1", async () => {
    const { postMessage, tab } = fakeTab();
    Object.defineProperty(window, "opener", { configurable: true, value: tab });
    const { replace } = stubPageLoads();
    const client = authClient();
    const accept = vi.spyOn(client, "acceptImpersonation");
    await renderApplication(client, <SupportEntryPage authClient={client} />);
    expect(screen.getByText("Obrint el backoffice del club…")).toBeInTheDocument();
    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith({ type: SUPPORT_READY }, CONSOLE_ORIGIN);
    });
    const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
    // Ignored: another origin, another window, another message type.
    message({ expiresAt, token: "forged", type: SUPPORT_ACCESS }, "https://evil.example.test", tab);
    message({ expiresAt, token: "forged", type: SUPPORT_ACCESS }, CONSOLE_ORIGIN, window);
    message({ token: "forged", type: "other" }, CONSOLE_ORIGIN, tab);
    expect(accept).not.toHaveBeenCalled();

    message({ expiresAt, token: "mock-support-token", type: SUPPORT_ACCESS }, CONSOLE_ORIGIN, tab);
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/tauler");
    });
    expect(accept).toHaveBeenCalledWith("mock-support-token", expiresAt);
    // The tab's own session storage, with its expiry; never the persistent storage.
    const stored = JSON.parse(sessionStorage.getItem(IMPERSONATION_STORAGE_KEY) ?? "{}") as {
      expiresAt?: number;
      state?: string;
      token?: string;
    };
    expect(stored).toEqual({
      expiresAt: Date.parse(expiresAt),
      state: "active",
      token: "mock-support-token",
    });
    expect(JSON.stringify(Object.entries(localStorage))).not.toContain("mock-support-token");
  });

  it("a token whose /me is not a support access is never kept (revoked, the tab says so)", async () => {
    const { tab } = fakeTab();
    Object.defineProperty(window, "opener", { configurable: true, value: tab });
    const { replace } = stubPageLoads();
    const revokes = captureRequests(
      (method, url) => method === "POST" && url.pathname.endsWith("/oauth2/revoke"),
    );
    server.use(
      http.get(`${API_BASE}/me`, ({ request }) =>
        request.headers.get("Authorization") === "Bearer some-admin-token"
          ? HttpResponse.json({
              account: {
                email: "aina.serra@example.test",
                hasPassword: true,
                id: "10000000-0000-4000-8000-000000000001",
                locale: "ca",
                name: "Aina Serra",
                onboardingPending: false,
                platformRoles: [],
              },
              features: [],
            })
          : HttpResponse.json(
              { code: "UNAUTHENTICATED", details: {}, message: "No session", traceId: "t" },
              { status: 401 },
            ),
      ),
    );
    const client = authClient();
    await renderApplication(client, <SupportEntryPage authClient={client} />);
    message(
      {
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        token: "some-admin-token",
        type: SUPPORT_ACCESS,
      },
      CONSOLE_ORIGIN,
      tab,
    );
    expect(
      await screen.findByText(
        "No s'ha pogut obrir l'accés de suport. Torna-ho a provar des de la consola de clubs.",
      ),
    ).toBeInTheDocument();
    expect(revokes).toHaveLength(1);
    expect(replace).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(IMPERSONATION_STORAGE_KEY)).toBeNull();
  });

  it("opened without the console (no opener) it only says where the access starts", async () => {
    Object.defineProperty(window, "opener", { configurable: true, value: null });
    const client = authClient();
    await renderApplication(client, <SupportEntryPage authClient={client} />);
    expect(
      screen.getByText(
        "Aquest accés s'obre des de la consola de clubs, amb «Entra com a administrador del club».",
      ),
    ).toBeInTheDocument();
  });
});

describe("E10-W03 step 2 · the support access's banner, its end and its expiry in clubs-admin (R-17-10)", () => {
  it("T-17-09 shows the persistent banner (who, until when in the club's time), no console entry and no exports", async () => {
    const client = authClient();
    const expiresAt = "2030-10-18T15:30:00Z";
    server.use(
      http.get(`${API_BASE}/me`, ({ request }) =>
        request.headers.get("Authorization") === "Bearer mock-support-token"
          ? HttpResponse.json(supportMe(expiresAt))
          : HttpResponse.json(
              { code: "UNAUTHENTICATED", details: {}, message: "No session", traceId: "t" },
              { status: 401 },
            ),
      ),
    );
    await client.acceptImpersonation("mock-support-token", expiresAt);
    window.history.pushState(null, "", "/tauler");
    await renderApplication(client);
    const banner = within(await screen.findByRole("region", { name: "Accés de suport" }));
    // 15:30 UTC is 17:30 in Madrid (the club's zone), whatever the device's.
    expect(
      banner.getByText(/Accés de suport de l'equip AgilityHub · Pol Ferrer · fins al .*17:30/u),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Consola" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Exportacions" })).toBeNull();
  });

  it("«Surt» revokes the support token (POST /oauth2/revoke) and leaves the tab on /suport?sortit=1", async () => {
    const client = authClient();
    await client.acceptImpersonation(
      "mock-support-token",
      new Date(Date.now() + 3_600_000).toISOString(),
    );
    const revokes = captureRequests(
      (method, url) => method === "POST" && url.pathname.endsWith("/oauth2/revoke"),
    );
    window.history.pushState(null, "", "/tauler");
    await renderApplication(client);
    const pageLoads = stubPageLoads();
    const banner = within(await screen.findByRole("region", { name: "Accés de suport" }));
    fireEvent.click(banner.getByRole("button", { name: "Surt" }));
    expect(
      await screen.findByText("Has sortit de l'accés de suport. Ja pots tancar aquesta pestanya."),
    ).toBeInTheDocument();
    expect(`${window.location.pathname}${window.location.search}`).toBe("/suport?sortit=1");
    await waitFor(() => {
      expect(revokes).toHaveLength(1);
    });
    // Signed out on /suport: the shell's sign-in redirect never runs (E10-W03 e2e run 05).
    expect(pageLoads.assign).not.toHaveBeenCalled();
    expect(pageLoads.replace).not.toHaveBeenCalled();
    expect(revokes[0]?.headers.get("Authorization")).toBe("Bearer mock-support-token");
    expect(sessionStorage.getItem(IMPERSONATION_STORAGE_KEY)).toBeNull();
  });

  it("an access that expired or that the club ended (401) shows that it has ended, never another session", async () => {
    const client = authClient();
    await client.acceptImpersonation(
      "mock-support-token",
      new Date(Date.now() + 3_600_000).toISOString(),
    );
    window.history.pushState(null, "", "/tauler");
    await renderApplication(client);
    await screen.findByRole("region", { name: "Accés de suport" });
    act(() => {
      client.handleImpersonationExpired();
    });
    expect(
      await screen.findByText(
        "L'accés de suport ha acabat: ha caducat o l'administrador del club l'ha acabat. Ja pots tancar aquesta pestanya.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Accés de suport" })).toBeNull();
  });
});

describe("E10-W03 step 2 · the club's ADMIN ends a live support access from «Auditoria» (R-17-10, E123)", () => {
  async function openAudit(scenario: "adminSupportAccess") {
    mockScenario(scenario);
    const client = authClient();
    await client.login("aina.serra@example.test", "secret-password");
    window.history.pushState(null, "", "/auditoria");
    await renderApplication(client);
    return within(await screen.findByRole("region", { name: "Accessos de suport en curs" }));
  }

  it("lists only the live access (from the audit's SUPPORT_ACCESS_STARTED/ENDED) and [Acaba l'accés] sends DELETE /support-accesses/{grant}", async () => {
    const deletes = captureRequests((method) => method === "DELETE");
    const card = await openAudit("adminSupportAccess");
    const items = card.getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("Pol Ferrer, de l'equip AgilityHub");
    expect(items[0]).toHaveTextContent("Motiu: Revisar la configuració de la remesa");
    fireEvent.click(card.getByRole("button", { name: "Acaba l'accés" }));
    expect(
      await card.findByText("S'ha acabat l'accés de suport de Pol Ferrer."),
    ).toBeInTheDocument();
    expect(deletes[0]?.url.pathname).toBe(
      "/api/v1/support-accesses/70000000-0000-4000-8000-000000000001",
    );
    await waitFor(() => {
      expect(card.queryByRole("listitem")).toBeNull();
    });
  });

  it("409 INVALID_STATE {status: EXPIRED} (ended meanwhile) says so and reads the list again", async () => {
    server.use(
      http.delete(`${API_BASE}/support-accesses/:id`, () =>
        HttpResponse.json(
          {
            code: "INVALID_STATE",
            details: { status: "EXPIRED" },
            message: "Support access already ended",
            traceId: "trace-support-end",
          },
          { status: 409 },
        ),
      ),
    );
    const card = await openAudit("adminSupportAccess");
    fireEvent.click(card.getByRole("button", { name: "Acaba l'accés" }));
    expect(await card.findByRole("alert")).toHaveTextContent("Aquest accés ja s'havia acabat.");
  });

  it("the live accesses: not expired, not ended, keyed by the grant", () => {
    const now = Date.parse("2026-10-18T10:00:00Z");
    const started = (grant: string, expiresAt: string) => ({
      action: "SUPPORT_ACCESS_STARTED" as const,
      actorName: "Pol Ferrer",
      at: "2026-10-18T09:30:00Z",
      details: { expiresAt },
      entityId: grant,
      id: `entry-${grant}`,
    });
    expect(
      liveSupportAccesses(
        [
          started("live", "2026-10-18T10:30:00Z"),
          started("expired", "2026-10-18T09:59:59Z"),
          started("ended", "2026-10-18T10:30:00Z"),
        ],
        [{ action: "SUPPORT_ACCESS_ENDED", entityId: "ended", id: "end-ended" }],
        now,
      ).map((access) => access.id),
    ).toEqual(["live"]);
  });
});
