import { mockScenario, resetOnboardingMockState } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import {
  AuthClient,
  IMPERSONATION_STORAGE_KEY,
  MemoryRefreshTokenStore,
  SessionProvider,
} from "@agilityhub/auth";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider, requiredModulesForUiItem } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ADMIN_ROUTES, AdminNavigation, App } from "./App";
import { ADMIN_AUTH_OPTIONS } from "./auth-options";

const branding: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  resetOnboardingMockState();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  mockScenario("admin");
  resetOnboardingMockState();
});
afterAll(() => {
  server.close();
});

function authClient() {
  return new AuthClient({
    ...ADMIN_AUTH_OPTIONS,
    apiBaseUrl: `${window.location.origin}/api/v1`,
    identityBaseUrl: window.location.origin,
    mockMode: true,
    mockRefreshTokenStore: new MemoryRefreshTokenStore(),
  });
}

async function renderApplication(client: AuthClient) {
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-audit", "auth", "shell"],
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
}

async function renderNavigation(roles: ("ADMIN" | "INSTRUCTOR" | "MEMBER")[]) {
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["shell"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <AdminNavigation modules={branding.modules} pathname="/tauler" roles={roles} />
      </BrandingProvider>
    </I18nextProvider>,
  );
}

describe("T-02-14 clubs-admin shell", () => {
  it("uses the compact mark with the runtime club name", async () => {
    const client = authClient();
    await client.login("aina.serra@example.test", "secret-password");
    window.history.pushState(null, "", "/tauler");
    await renderApplication(client);

    await waitFor(() => {
      expect(document.querySelector(".admin-shell__brand img")).toHaveAttribute(
        "src",
        brandingCanicFixture.theme.markUrl,
      );
    });
    expect(document.querySelector(".admin-shell__brand img")).toHaveAttribute("alt", "");
    expect(screen.getByText(brandingCanicFixture.club.name)).toBeVisible();
  });

  it("hides the Configuració group from instructors", async () => {
    await renderNavigation(["INSTRUCTOR"]);

    expect(screen.queryByRole("heading", { name: "Configuració" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Paràmetres" })).not.toBeInTheDocument();
  });

  it("T-06-26 shows «Plantilla setmanal» to instructors (read-only D3, S06 §13-10)", async () => {
    await renderNavigation(["INSTRUCTOR"]);

    expect(screen.getByRole("link", { name: "Plantilla setmanal" })).toHaveAttribute(
      "href",
      "/plantilles",
    );
  });

  it("T-06-28 shows «Calendari de classes» to instructors (read-only D4, A22 c)", async () => {
    await renderNavigation(["INSTRUCTOR"]);

    expect(screen.getByRole("link", { name: "Calendari de classes" })).toHaveAttribute(
      "href",
      "/calendari",
    );
  });

  it("shows the fixed sidebar groups to administrators", async () => {
    await renderNavigation(["ADMIN"]);

    expect(screen.getByRole("heading", { name: "Persones" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Camp" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Gestió" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Configuració" })).toBeInTheDocument();
  });

  it("registers every desktop route from the frontend plan", () => {
    expect(ADMIN_ROUTES.map((route) => route.path)).toEqual(
      expect.arrayContaining([
        "/tauler",
        "/preinscripcions/:id",
        "/plantilles",
        "/plantilles/:templateId/dia/:dayOfWeek",
        "/calendari",
        "/calendari/dia/:date",
        "/abonats",
        "/abonats/:id",
        "/gossos",
        "/gossos/:id",
        "/facturacio",
        "/facturacio/remeses",
        "/activitats",
        "/modalitats",
        "/comunicats",
        "/parametres",
        "/agenda",
        "/entrenaments",
        "/alumnes/:id",
        "/seguiment",
        "/pistes",
        "/equip",
        "/recorreguts",
        "/inactivitats",
        "/auditoria",
        "/consola/*",
      ]),
    );
  });
});

describe("E8-W01 step 1: D6 «Facturació» is ADMIN only and belongs to BILLING (MATRIU_PERMISOS, R-12-28)", () => {
  async function renderBillingNavigation(
    roles: ("ADMIN" | "INSTRUCTOR")[],
    modules: readonly string[],
    pathname: string,
  ) {
    const i18n = await createI18n({
      branding,
      browserLanguages: ["ca"],
      initialNamespaces: ["shell"],
      storage: undefined,
    });
    render(
      <I18nextProvider i18n={i18n}>
        <BrandingProvider branding={{ ...branding, modules: [...modules] }}>
          <AdminNavigation modules={modules} pathname={pathname} roles={roles} />
        </BrandingProvider>
      </I18nextProvider>,
    );
  }

  it("E8-W01: both routes are ADMIN only and need BILLING; an INSTRUCTOR has no «Facturació» entry", async () => {
    expect(
      ADMIN_ROUTES.filter((route) => route.path.startsWith("/facturacio")).map((route) => [
        route.path,
        route.roles,
        requiredModulesForUiItem("routes", route.path),
      ]),
    ).toEqual([
      ["/facturacio", ["ADMIN"], ["BILLING"]],
      ["/facturacio/remeses", ["ADMIN"], ["BILLING"]],
    ]);
    await renderBillingNavigation(["INSTRUCTOR"], branding.modules, "/agenda");
    expect(screen.queryByRole("link", { name: "Facturació" })).toBeNull();
  });

  it("E8-W01: without BILLING the entry is gone; with it, «Facturació» stays lit on the remittances page", async () => {
    await renderBillingNavigation(
      ["ADMIN"],
      branding.modules.filter((module) => module !== "BILLING"),
      "/tauler",
    );
    expect(screen.queryByRole("link", { name: "Facturació" })).toBeNull();
    cleanup();
    await renderBillingNavigation(["ADMIN"], branding.modules, "/facturacio/remeses");
    expect(screen.getByRole("link", { name: "Facturació" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

describe("E3-W07 step 9 menu counters (S14 R-14-08)", () => {
  function countCounterRequests(): () => number {
    let count = 0;
    server.events.on("request:start", ({ request }) => {
      if (new URL(request.url).pathname.endsWith("/dashboard/counters")) count += 1;
    });
    return () => count;
  }

  afterEach(() => {
    server.events.removeAllListeners();
  });

  it("reads the counters once for an ADMIN, again on focus, and not on every navigation", async () => {
    const counters = countCounterRequests();
    const client = authClient();
    await client.login("aina.serra@example.test", "secret-password");
    window.history.pushState(null, "", "/tauler");
    await renderApplication(client);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Preinscripcions\s*3/u })).toBeVisible();
    });
    expect(
      screen
        .getByRole("link", { name: /Preinscripcions\s*3/u })
        .querySelector(".ah-sidebar__count"),
    ).not.toBeNull();
    expect(counters()).toBe(1);

    window.history.pushState(null, "", "/abonats");
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.history.pushState(null, "", "/tauler");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await screen.findByRole("heading", { level: 1 });
    expect(counters()).toBe(1);

    fireEvent.focus(window);
    await waitFor(() => {
      expect(counters()).toBe(2);
    });
  });

  it("never asks an INSTRUCTOR for the counters (ADMIN only, no 403)", async () => {
    mockScenario("instructor");
    const counters = countCounterRequests();
    const client = authClient();
    await client.login("pere.vidal@example.test", "secret-password");
    window.history.pushState(null, "", "/calendari");
    await renderApplication(client);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Calendari de classes" })).toBeVisible();
    });
    fireEvent.focus(window);
    expect(counters()).toBe(0);
  });
});

describe("T-01-18 clubs-admin access", () => {
  it("offers magic-link and password entry with the shared auth components", async () => {
    window.history.pushState(null, "", "/entrar");
    await renderApplication(authClient());

    expect(screen.getByRole("heading", { name: "Accés al backoffice" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Envia'm l'enllaç" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Tinc contrasenya" })).toBeVisible();
    fireEvent.change(screen.getByLabelText("Correu electrònic"), {
      target: { value: "aina.serra@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Envia'm l'enllaç" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Si el correu és al club, hi rebràs l'enllaç",
    );
    fireEvent.click(screen.getByRole("button", { name: "Tinc contrasenya" }));
    expect(screen.getByLabelText("Contrasenya")).toBeVisible();
  });
});

describe("T-01-20 clubs-admin handoff", () => {
  it("exchanges the one-time handoff code on the landing route", async () => {
    window.history.pushState(null, "", "/entrar?handoff=mock-handoff-code");
    const client = authClient();
    const exchange = vi
      .spyOn(client, "exchangeHandoff")
      .mockImplementation(() => new Promise<never>(() => undefined));
    await renderApplication(client);

    expect(screen.getByRole("status")).toHaveTextContent("Obrint el backoffice…");
    await waitFor(() => {
      expect(exchange).toHaveBeenCalledWith("mock-handoff-code");
    });
  });
});

describe("E4-W18 step 2 (review #3): the back office's handoff is the caller's own session", () => {
  const RETRY_MESSAGE = "No s'ha pogut completar l'accés. Torna-ho a provar.";
  const REFUSED_MESSAGE = "Aquest accés al backoffice no és vàlid o ha caducat.";
  const HANDOFF_GRANT = "urn:agilityhub:grant:handoff";

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
    window.history.pushState(null, "", "/");
  });

  /** `window.location.assign` (a full page load, which jsdom cannot do) recorded; the rest real. */
  function stubPageLoads() {
    const real = window.location;
    const assign = vi.fn();
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
      get search() {
        return real.search;
      },
    });
    return assign;
  }

  /** Waits until the page offers its retry, waking the client's backoff with `online`. */
  async function retryButton() {
    return waitFor(
      () => {
        const button = screen.queryByRole("button", { name: "Torna-ho a provar" });
        if (button === null) {
          window.dispatchEvent(new Event("online"));
          throw new Error("still retrying");
        }
        return button;
      },
      { timeout: 3000 },
    );
  }

  /** Nothing the tab keeps in its session storage carries the handoff's tokens. */
  function sessionStorageValues(): string[] {
    return Array.from({ length: sessionStorage.length }, (_, index) => {
      const key = sessionStorage.key(index) ?? "";
      return `${key}=${sessionStorage.getItem(key) ?? ""}`;
    });
  }

  function unavailable() {
    return HttpResponse.json(
      { code: "INTERNAL_ERROR", details: {}, message: "Unavailable", traceId: "t" },
      { status: 503 },
    );
  }

  it("a transient /me failure shows a retry, never «no és vàlid o ha caducat»: the code leaves the address, no token lands in session storage, and the retry opens /tauler", async () => {
    let down = true;
    server.use(http.get("*/api/v1/me", () => (down ? unavailable() : undefined)));
    window.history.pushState(null, "", "/entrar?handoff=mock-handoff-code");
    const assign = stubPageLoads();
    const client = authClient();
    await renderApplication(client);

    expect(screen.getByRole("status")).toHaveTextContent("Obrint el backoffice…");
    expect(window.location.search).toBe("");
    const retry = await retryButton();
    expect(screen.getByRole("alert")).toHaveTextContent(RETRY_MESSAGE);
    expect(screen.queryByText(REFUSED_MESSAGE)).toBeNull();
    expect(assign).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(IMPERSONATION_STORAGE_KEY)).toBeNull();
    expect(sessionStorageValues().filter((entry) => entry.includes("mock-access-token"))).toEqual(
      [],
    );
    expect(client.hasPendingHandoff()).toBe(true);

    down = false;
    fireEvent.click(retry);
    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith("/tauler");
    });
    expect(client.getMe()?.impersonation).toBeUndefined();
    expect(client.getMe()?.account.email).toBe("aina.serra@example.test");
    expect(client.isImpersonated()).toBe(false);
    expect(sessionStorage.getItem(IMPERSONATION_STORAGE_KEY)).toBeNull();
  });

  it.each([
    { answer: unavailable, name: "a 5xx" },
    { answer: () => HttpResponse.error(), name: "no answer (offline)" },
  ])(
    "$name from /oauth2/token shows a retry that sends the same code again and opens /tauler",
    async ({ answer }) => {
      const grants: string[] = [];
      let down = true;
      server.use(
        http.post("*/oauth2/token", async ({ request }) => {
          const grant = new URLSearchParams(await request.clone().text()).get("grant_type") ?? "";
          grants.push(grant);
          // This tab has no back-office session of its own (no refresh cookie on this host): the
          // usual restore that follows a failed handoff (A1) finds nothing, so the retry stays.
          if (grant === "refresh_token") {
            return HttpResponse.json(
              { code: "REFRESH_EXPIRED", details: {}, message: "No session", traceId: "t" },
              { status: 400 },
            );
          }
          return grant === HANDOFF_GRANT && down ? answer() : undefined;
        }),
      );
      window.history.pushState(null, "", "/entrar?handoff=mock-handoff-code");
      const assign = stubPageLoads();
      await renderApplication(authClient());

      expect(await screen.findByRole("alert")).toHaveTextContent(RETRY_MESSAGE);
      expect(screen.queryByText(REFUSED_MESSAGE)).toBeNull();
      expect(window.location.search).toBe("");
      expect(sessionStorage.getItem(IMPERSONATION_STORAGE_KEY)).toBeNull();

      down = false;
      fireEvent.click(screen.getByRole("button", { name: "Torna-ho a provar" }));
      await waitFor(() => {
        expect(assign).toHaveBeenCalledWith("/tauler");
      });
      expect(grants.filter((grant) => grant === HANDOFF_GRANT)).toHaveLength(2);
    },
  );

  it("round 2 #2 (review #2): three transient /me failures, then the background recovery signs in before the retry card listens — the tab enters /tauler without a click and the card goes", async () => {
    let failures = 3;
    server.use(
      http.get("*/api/v1/me", () => {
        if (failures === 0) return undefined;
        failures -= 1;
        return unavailable();
      }),
    );
    window.history.pushState(null, "", "/entrar?handoff=mock-handoff-code");
    const assign = stubPageLoads();
    const client = authClient();
    const recovered = new Promise<void>((resolve) => {
      client.addEventListener("signedIn", () => {
        resolve();
      });
    });
    // The page hears of the failed code only after the session's own recovery has signed in, so
    // its `signedIn` listener is attached after the event.
    const exchange = client.exchangeHandoff.bind(client);
    vi.spyOn(client, "exchangeHandoff").mockImplementation(async (code) => {
      try {
        return await exchange(code);
      } catch (error) {
        await recovered;
        throw error;
      }
    });
    await renderApplication(client);

    await waitFor(
      () => {
        window.dispatchEvent(new Event("online"));
        expect(assign).toHaveBeenCalledWith("/tauler");
      },
      { timeout: 3000 },
    );
    expect(client.getMe()?.account.email).toBe("aina.serra@example.test");
    expect(screen.queryByRole("button", { name: "Torna-ho a provar" })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Obrint el backoffice…");
  });

  it("a refused code (400 HANDOFF_INVALID) still says «no és vàlid o ha caducat», with no retry", async () => {
    window.history.pushState(null, "", "/entrar?handoff=invalid");
    const assign = stubPageLoads();
    await renderApplication(authClient());

    expect(await screen.findByText(REFUSED_MESSAGE)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Torna-ho a provar" })).toBeNull();
    expect(window.location.search).toBe("");
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("T-01-26 clubs-admin onboarding", () => {
  it("shows profile completion as a non-dismissible backoffice modal", async () => {
    mockScenario("onboardingAdmin");
    const client = authClient();
    await client.login("aina.serra@example.test", "secret-password");
    window.history.pushState(null, "", "/tauler");
    await renderApplication(client);

    const dialog = await screen.findByRole("dialog", { name: "Completa el teu perfil" });
    expect(dialog).toBeVisible();
    expect(screen.getByRole("heading", { name: "Configuració" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Tanca" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ho faré més tard" })).toBeVisible();
  });

  it("removes the postpone action when the policy limit is exhausted", async () => {
    mockScenario("policyReconsent");
    const client = authClient();
    await client.login("aina.serra@example.test", "secret-password");
    await client.postponeOnboarding();
    await client.postponeOnboarding();
    await client.postponeOnboarding();
    window.history.pushState(null, "", "/tauler");
    await renderApplication(client);

    expect(
      await screen.findByRole("dialog", {
        name: "Hem actualitzat la política de privacitat",
      }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Més tard" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tanca" })).not.toBeInTheDocument();
  });
});
