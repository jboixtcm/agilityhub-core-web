import type { components } from "@agilityhub/api-client";
import { AuthClient, MemoryRefreshTokenStore, SessionProvider } from "@agilityhub/auth";
import { createI18n, type Locale } from "@agilityhub/i18n";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App, oidcContinuation } from "./App";

type Me = components["schemas"]["Me"];

const me: Me = {
  account: {
    email: "biel.roca@example.test",
    hasPassword: true,
    id: "10000000-0000-4000-8000-000000000002",
    locale: "ca",
    name: "Biel Roca",
    onboardingPending: false,
    platformRoles: [],
  },
  membership: {
    activeProfile: "MEMBER",
    clubId: "50000000-0000-4000-8000-000000000001",
    gender: "MALE",
    profiles: ["MEMBER"],
    rememberProfile: true,
    roles: ["MEMBER"],
  },
  features: [],
};

const sessions: components["schemas"]["Session"][] = [
  {
    clientId: "id-web",
    createdAt: "2026-08-18T08:41:00Z",
    deviceLabel: "Safari · iPhone",
    expiresAt: "2026-10-06T08:41:00Z",
    id: "40000000-0000-4000-8000-000000000001",
    lastUsedAt: "2026-09-06T08:41:00Z",
  },
  {
    clientId: "id-web",
    createdAt: "2026-08-17T17:20:00Z",
    deviceLabel: "Chrome · Mac",
    expiresAt: "2026-10-05T17:20:00Z",
    id: "40000000-0000-4000-8000-000000000002",
    lastUsedAt: "2026-09-05T17:20:00Z",
  },
];

interface RecordedRequest {
  body: string;
  method: string;
  url: string;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function testFetcher() {
  const requests: RecordedRequest[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const body = request.method === "GET" ? "" : await request.clone().text();
    requests.push({ body, method: request.method, url: request.url });
    const pathname = new URL(request.url).pathname;

    if (pathname === "/oauth2/token") {
      return json({
        access_token: "mock-access-token",
        expires_in: 900,
        refresh_token: "mock-refresh-token",
        scope: "openid profile",
        token_type: "Bearer",
      });
    }
    if (pathname === "/api/v1/me" && request.method === "GET") {
      return json(me);
    }
    if (pathname === "/api/v1/me" && request.method === "PATCH") {
      const patch = JSON.parse(body) as components["schemas"]["AccountPatchRequest"];
      return json({ ...me, account: { ...me.account, ...patch } });
    }
    if (pathname === "/api/v1/me/sessions") {
      return json(sessions);
    }
    if (
      pathname.startsWith("/api/v1/me/sessions/") ||
      pathname === "/api/v1/me/password" ||
      pathname === "/oauth2/revoke"
    ) {
      return new Response(null, { status: 200 });
    }
    if (pathname === "/api/v1/auth/magic-link") {
      return new Response(null, { status: 202 });
    }
    return json({ code: "NOT_FOUND", message: "Not found" }, 404);
  }) as typeof fetch;

  return { fetcher, requests };
}

function createClient(fetcher: typeof fetch) {
  return new AuthClient({
    apiBaseUrl: "http://id.test/api/v1",
    clientId: "id-web",
    fetch: fetcher,
    identityBaseUrl: "http://id.test",
    mockMode: true,
    mockRefreshTokenStore: new MemoryRefreshTokenStore(),
  });
}

async function createTestI18n(locale: Locale = "ca") {
  return createI18n({
    branding: { defaultLocale: locale, locales: ["ca", "es", "en"] },
    browserLanguages: [locale],
    initialNamespaces: ["errors", "id"],
    storage: undefined,
  });
}

async function renderApp(
  client: AuthClient,
  locale: Locale = "ca",
  navigate = vi.fn<(destination: string) => void>(),
) {
  const i18n = await createTestI18n(locale);
  render(
    <I18nextProvider i18n={i18n}>
      <SessionProvider client={client}>
        <App authClient={client} navigate={navigate} />
      </SessionProvider>
    </I18nextProvider>,
  );
  return { i18n, navigate };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.history.replaceState(null, "", "/login");
});

describe("T-01-22 apps/id", () => {
  it("honours OIDC login_hint, ui_locales and the safe authorize continuation", async () => {
    const continuation =
      "/oauth2/authorize?client_id=ar-app&redirect_uri=https%3A%2F%2Far.example.test%2Fcallback&ui_locales=es&state=state-1";
    window.history.replaceState(
      null,
      "",
      `/login?login_hint=biel.roca%40example.test&continue=${encodeURIComponent(continuation)}`,
    );
    const { fetcher, requests } = testFetcher();
    const client = createClient(fetcher);
    const navigate = vi.fn<(destination: string) => void>();
    await renderApp(client, "ca", navigate);

    expect(await screen.findByRole("heading", { name: "Entra en AgilityHub" })).toBeInTheDocument();
    expect(screen.getByLabelText("Correo electrónico")).toHaveValue("biel.roca@example.test");
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "secret-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ENTRAR" }));

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(continuation);
    });
    const tokenRequest = requests.find(
      (request) =>
        request.url.endsWith("/oauth2/token") &&
        new URLSearchParams(request.body).get("grant_type") === "password",
    );
    expect(tokenRequest?.body).toContain("client_id=id-web");
    expect(tokenRequest?.body).toContain("username=biel.roca%40example.test");
  });

  it("sends the authorize continuation with a neutral magic-link request", async () => {
    const continuation = "/oauth2/authorize?client_id=ar-app&state=state-2";
    window.history.replaceState(null, "", `/login?continue=${encodeURIComponent(continuation)}`);
    const { fetcher, requests } = testFetcher();
    await renderApp(createClient(fetcher));

    fireEvent.change(await screen.findByLabelText("Correu electrònic"), {
      target: { value: "biel.roca@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Envia'm un enllaç per entrar" }));

    expect(
      await screen.findByText("Si el compte existeix, hi rebràs l'enllaç"),
    ).toBeInTheDocument();
    const magicRequest = requests.find((request) => request.url.endsWith("/auth/magic-link"));
    expect(JSON.parse(magicRequest?.body ?? "{}")).toEqual({
      client_id: "id-web",
      email: "biel.roca@example.test",
      purpose: "LOGIN",
      redirect_uri: `${window.location.origin}${continuation}`,
    });
  });

  it("serves the login page in Catalan, Spanish and English", async () => {
    const headings = {
      ca: "Entra a AgilityHub",
      en: "Sign in to AgilityHub",
      es: "Entra en AgilityHub",
    } as const;

    for (const locale of ["ca", "es", "en"] as const) {
      const { fetcher } = testFetcher();
      await renderApp(createClient(fetcher), locale);
      expect(await screen.findByRole("heading", { name: headings[locale] })).toBeInTheDocument();
      cleanup();
    }
  });

  it("falls back unsupported product locales to English", async () => {
    window.history.replaceState(null, "", "/login?ui_locales=fr");
    const { fetcher } = testFetcher();
    await renderApp(createClient(fetcher), "ca");

    expect(
      await screen.findByRole("heading", { name: "Sign in to AgilityHub" }),
    ).toBeInTheDocument();
  });

  it("exchanges a magic link and rejects off-origin continuations", async () => {
    window.history.replaceState(
      null,
      "",
      "/magic-link?t=valid&continue=https%3A%2F%2Fevil.example%2Foauth2%2Fauthorize",
    );
    const { fetcher } = testFetcher();
    const navigate = vi.fn<(destination: string) => void>();
    await renderApp(createClient(fetcher), "ca", navigate);

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/account");
    });
    expect(oidcContinuation()).toBeNull();
  });

  it("lists active account sessions and closes the selected session", async () => {
    const { fetcher, requests } = testFetcher();
    const client = createClient(fetcher);
    await client.login("biel.roca@example.test", "secret-password");
    window.history.replaceState(null, "", "/account");
    await renderApp(client);

    expect(await screen.findByRole("heading", { name: "Sessions actives" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nom")).toHaveValue("Biel Roca");
    expect(await screen.findByText("Safari · iPhone")).toBeInTheDocument();
    const chromeRow = screen.getByText("Chrome · Mac").closest("li");
    expect(chromeRow).not.toBeNull();
    if (chromeRow === null) {
      throw new Error("The Chrome session row was not rendered");
    }
    fireEvent.click(within(chromeRow).getByRole("button"));

    await waitFor(() => {
      expect(screen.queryByText("Chrome · Mac")).not.toBeInTheDocument();
    });
    expect(requests).toContainEqual(
      expect.objectContaining({
        method: "DELETE",
        url: "http://id.test/api/v1/me/sessions/40000000-0000-4000-8000-000000000002",
      }),
    );
  });

  it("renders password and product pages and completes global logout", async () => {
    const { fetcher } = testFetcher();
    const client = createClient(fetcher);
    await client.login("biel.roca@example.test", "secret-password");

    window.history.replaceState(null, "", "/set-password");
    await renderApp(client);
    expect(await screen.findByRole("heading", { name: "Contrasenya" })).toBeInTheDocument();
    cleanup();

    window.history.replaceState(null, "", "/products");
    await renderApp(client);
    expect(await screen.findByRole("heading", { name: "Els teus productes" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /OBRE LEARN/u })).toHaveAttribute(
      "href",
      "https://learn.agilitydoghub.com",
    );
    cleanup();

    window.history.replaceState(null, "", "/logout");
    const navigate = vi.fn<(destination: string) => void>();
    await renderApp(client, "ca", navigate);
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(
        `/connect/logout?post_logout_redirect_uri=${encodeURIComponent(`${window.location.origin}/login`)}`,
      );
    });
  });
});
