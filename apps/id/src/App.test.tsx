import type { components } from "@agilityhub/api-client";
import { AuthClient, MemoryRefreshTokenStore, SessionProvider } from "@agilityhub/auth";
import { type Locale } from "@agilityhub/i18n";
import { createIdI18n } from "@agilityhub/i18n/id";
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

function testFetcher(account: Me = me) {
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
      return json(account);
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
    if (pathname === "/oauth2/session") {
      const request = JSON.parse(body) as components["schemas"]["OidcSessionRequest"];
      return json({ redirectUrl: `/oidc/callback?flow=${request.flow}` });
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
  return createIdI18n({
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
  vi.unstubAllEnvs();
  cleanup();
  localStorage.clear();
  window.history.replaceState(null, "", "/login");
});

describe("T-01-22 apps/id", () => {
  it("resumes a server-side OIDC flow after password login", async () => {
    window.history.replaceState(
      null,
      "",
      "/login?flow=flow-1&login_hint=biel.roca%40example.test&ui_locales=es",
    );
    const { fetcher, requests } = testFetcher();
    const client = createClient(fetcher);
    const navigate = vi.fn<(destination: string) => void>();
    const { i18n } = await renderApp(client, "ca", navigate);

    await waitFor(() => {
      expect(i18n.resolvedLanguage).toBe("es");
    });
    expect(screen.getByRole("heading", { name: "Entra en tu cuenta" })).toBeInTheDocument();
    expect(screen.getByLabelText("Correo electrónico")).toHaveValue("biel.roca@example.test");
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "secret-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ENTRAR" }));

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/oidc/callback?flow=flow-1");
    });
    const tokenRequest = requests.find(
      (request) =>
        request.url.endsWith("/oauth2/token") &&
        new URLSearchParams(request.body).get("grant_type") === "password",
    );
    expect(tokenRequest?.body).toContain("client_id=id-web");
    expect(tokenRequest?.body).toContain("username=biel.roca%40example.test");
    expect(requests).toContainEqual(
      expect.objectContaining({
        body: JSON.stringify({ flow: "flow-1" }),
        method: "POST",
        url: "http://id.test/oauth2/session",
      }),
    );
  });

  it("remembers the OIDC flow while sending a neutral magic-link request", async () => {
    window.history.replaceState(null, "", "/login?flow=flow-2");
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
    });
    expect(localStorage.getItem("agilityhub.id.pendingOidcFlow")).toBe("flow-2");
  });

  it("resumes the remembered OIDC flow after magic-link exchange", async () => {
    localStorage.setItem("agilityhub.id.pendingOidcFlow", "flow-magic");
    window.history.replaceState(null, "", "/magic-link?t=valid");
    const { fetcher, requests } = testFetcher();
    const navigate = vi.fn<(destination: string) => void>();
    await renderApp(createClient(fetcher), "ca", navigate);

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/oidc/callback?flow=flow-magic");
    });
    expect(requests).toContainEqual(
      expect.objectContaining({
        body: JSON.stringify({ flow: "flow-magic" }),
        method: "POST",
        url: "http://id.test/oauth2/session",
      }),
    );
    expect(localStorage.getItem("agilityhub.id.pendingOidcFlow")).toBeNull();
  });

  it("keeps a same-origin authorize continuation as a fallback", async () => {
    const continuation = "/oauth2/authorize?client_id=ar-app&state=state-fallback";
    window.history.replaceState(null, "", `/login?continue=${encodeURIComponent(continuation)}`);
    const { fetcher } = testFetcher();
    const navigate = vi.fn<(destination: string) => void>();
    await renderApp(createClient(fetcher), "ca", navigate);

    fireEvent.change(await screen.findByLabelText("Correu electrònic"), {
      target: { value: "biel.roca@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Contrasenya"), {
      target: { value: "secret-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ENTRA" }));

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(continuation);
    });
  });

  it("serves the login page in Catalan, Spanish and English", async () => {
    const headings = {
      ca: "Entra al teu compte",
      en: "Sign in to your account",
      es: "Entra en tu cuenta",
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
      await screen.findByRole("heading", { name: "Sign in to your account" }),
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

  it("T-01-13 renders password and products and returns to login after revoking ID's session", async () => {
    const { fetcher, requests } = testFetcher();
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
    expect(screen.getByRole("link", { name: /OBRE CLUBS/u })).toHaveAttribute(
      "href",
      "https://clubs.agilitydoghub.com",
    );
    // E10-W01 step 1: the club console is the AgilityHub team's only (S17 §2 row «Entrada»).
    expect(screen.queryByRole("link", { name: /OBRE LA CONSOLA/u })).toBeNull();
    cleanup();

    window.history.replaceState(null, "", "/logout");
    const navigate = vi.fn<(destination: string) => void>();
    await renderApp(client, "ca", navigate);
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/login");
    });
    expect(requests).toContainEqual(
      expect.objectContaining({ method: "POST", url: "http://id.test/oauth2/revoke" }),
    );
    expect(client.getMe()).toBeNull();
  });

  it("T-01-13 the Clubs product follows its deployment URL without hiding Learn by default", async () => {
    vi.stubEnv("VITE_CLUBS_URL", "https://clubs-demo.example.test");
    try {
      const { fetcher } = testFetcher();
      const client = createClient(fetcher);
      await client.login("biel.roca@example.test", "secret-password");
      window.history.replaceState(null, "", "/products");
      await renderApp(client);
      expect(await screen.findByRole("link", { name: /OBRE CLUBS/u })).toHaveAttribute(
        "href",
        "https://clubs-demo.example.test",
      );
      expect(screen.getByRole("link", { name: /OBRE LEARN/u })).toHaveAttribute(
        "href",
        "https://learn.agilitydoghub.com",
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("T-01-13 an isolated demo hides the entire Learn card and keeps the Clubs default", async () => {
    vi.stubEnv("VITE_LEARN_ENABLED", "false");
    vi.stubEnv("VITE_CLUBS_URL", "");
    try {
      const { fetcher } = testFetcher();
      const client = createClient(fetcher);
      await client.login("biel.roca@example.test", "secret-password");
      window.history.replaceState(null, "", "/account");
      await renderApp(client);
      expect(
        await screen.findByRole("link", { name: /Consulta els teus productes/u }),
      ).toHaveAttribute("href", "/products");
      cleanup();
      window.history.replaceState(null, "", "/products");
      await renderApp(client);
      expect(await screen.findByRole("link", { name: /OBRE CLUBS/u })).toHaveAttribute(
        "href",
        "https://clubs.agilitydoghub.com",
      );
      expect(screen.queryByRole("link", { name: /OBRE LEARN/u })).toBeNull();
      expect(screen.queryByRole("heading", { name: "Learning" })).toBeNull();
      expect(document.querySelector('a[href="https://learn.agilitydoghub.com"]')).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("T-01-13 restores a cold ID logout before revocation and never redirects on a failed attempt", async () => {
    const { fetcher, requests } = testFetcher();
    const client = new AuthClient({
      apiBaseUrl: "http://id.test/api/v1",
      clientId: "id-web",
      fetch: fetcher,
      identityBaseUrl: "http://id.test",
      signInPath: "/login",
    });
    const logout = vi
      .spyOn(client, "logout")
      .mockRejectedValueOnce(new Error("fictional offline failure"));
    const navigate = vi.fn<(destination: string) => void>();
    window.history.replaceState(null, "", "/logout");
    await renderApp(client, "ca", navigate);
    expect(await screen.findByRole("alert")).toHaveTextContent("No s'ha pogut completar l'acció");
    expect(navigate).not.toHaveBeenCalled();
    expect(logout).toHaveBeenCalledOnce();
    expect(requests[0]).toMatchObject({ method: "POST", url: "http://id.test/oauth2/token" });
    expect(new URLSearchParams(requests[0]?.body).get("grant_type")).toBe("refresh_token");
    fireEvent.click(screen.getByRole("button", { name: "Torna-ho a provar" }));
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/login");
    });
    expect(logout).toHaveBeenCalledTimes(2);
    expect(requests).toContainEqual(
      expect.objectContaining({ method: "POST", url: "http://id.test/oauth2/revoke" }),
    );
  });

  it.each(["unmounted", "replaced"] as const)(
    "T-01-13 an %s logout page cannot revoke the replacement account after a late restore",
    async (transition) => {
      const { fetcher } = testFetcher();
      const client = createClient(fetcher);
      let finish: ((value: Me | null) => void) | undefined;
      vi.spyOn(client, "restoreSession").mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      const logout = vi.spyOn(client, "logout");
      const navigate = vi.fn<(destination: string) => void>();
      window.history.replaceState(null, "", "/logout");
      await renderApp(client, "ca", navigate);
      if (transition === "unmounted") cleanup();
      await client.login("biel.roca@example.test", "secret-password");
      finish?.(client.getMe());
      // Drain the late continuation: neither its server mutation nor navigation may run.
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
      expect(logout).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
      expect(client.getMe()?.account.id).toBe(me.account.id);
    },
  );

  it("T-01-13 an already expired cookie leaves logout at login without claiming a server revoke", async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(json({ code: "REFRESH_EXPIRED", message: "Expired" }, 400)),
    );
    const client = new AuthClient({
      apiBaseUrl: "http://id.test/api/v1",
      identityBaseUrl: "http://id.test",
      clientId: "id-web",
      fetch: fetcher,
    });
    const navigate = vi.fn<(destination: string) => void>();
    const logout = vi.spyOn(client, "logout");
    window.history.replaceState(null, "", "/logout");
    await renderApp(client, "ca", navigate);
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/login");
    });
    expect(logout).not.toHaveBeenCalled();
    expect(client.getMe()).toBeNull();
  });

  it("E10-W01 step 1: an AGILITYHUB_ADMIN without a club sees the club console among the products (S17 §2 «Entrada»)", async () => {
    const platformAccount: Me = {
      account: { ...me.account, platformRoles: ["AGILITYHUB_ADMIN"] },
      features: [],
    };
    const { fetcher } = testFetcher(platformAccount);
    const client = createClient(fetcher);
    await client.login("pol.ferrer@example.test", "secret-password");
    window.history.replaceState(null, "", "/products");
    await renderApp(client);
    expect(await screen.findByRole("heading", { name: "Consola de clubs" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /OBRE LA CONSOLA/u })).toHaveAttribute(
      "href",
      "https://clubsadmin.agilitydoghub.com/consola/clubs",
    );
  });

  it("E10-W02 step 1: the console card follows VITE_CONSOLE_URL, the deployment's product host (T-17-12)", async () => {
    vi.stubEnv("VITE_CONSOLE_URL", "http://127.0.0.1:4178/consola/clubs");
    try {
      const platformAccount: Me = {
        account: { ...me.account, platformRoles: ["AGILITYHUB_ADMIN"] },
        features: [],
      };
      const { fetcher } = testFetcher(platformAccount);
      const client = createClient(fetcher);
      await client.login("pol.ferrer@example.test", "secret-password");
      window.history.replaceState(null, "", "/products");
      await renderApp(client);
      expect(await screen.findByRole("link", { name: /OBRE LA CONSOLA/u })).toHaveAttribute(
        "href",
        "http://127.0.0.1:4178/consola/clubs",
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("T-01-18 (E11-W02 round 2, INC-41): apps/id's login after a 429, and the magic link's token", () => {
  it("a 429 on the password login counts down its Retry-After and holds the buttons until it ends", async () => {
    window.history.replaceState(null, "", "/login");
    const { fetcher: base } = testFetcher();
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      if (new URL(request.url).pathname === "/oauth2/token") {
        return new Response(
          JSON.stringify({ code: "LOGIN_LOCKED", message: "Login locked", traceId: "t-429" }),
          { headers: { "Content-Type": "application/json", "Retry-After": "3" }, status: 429 },
        );
      }
      return base(input, init);
    }) as typeof fetch;
    await renderApp(createClient(fetcher));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      fireEvent.change(await screen.findByLabelText("Correu electrònic"), {
        target: { value: "biel.roca@example.test" },
      });
      fireEvent.change(screen.getByLabelText("Contrasenya"), {
        target: { value: "secret-password" },
      });
      fireEvent.click(screen.getByRole("button", { name: "ENTRA" }));
      expect(
        await screen.findByText("Massa intents. Torna-ho a provar d'aquí a 3 s"),
      ).toBeVisible();
      expect(screen.getByRole("button", { name: "ENTRA" })).toBeDisabled();
      await vi.advanceTimersByTimeAsync(3_000);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "ENTRA" })).toBeEnabled();
      });
      expect(screen.queryByText(/Massa intents/u)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("the magic link's token leaves the address bar once read; the continuation stays", async () => {
    window.history.replaceState(null, "", "/magic-link?t=valid&flow=flow-123");
    const { fetcher } = testFetcher();
    const navigate = vi.fn<(destination: string) => void>();
    await renderApp(createClient(fetcher), "ca", navigate);
    await waitFor(() => {
      expect(new URLSearchParams(window.location.search).has("t")).toBe(false);
    });
    expect(new URLSearchParams(window.location.search).get("flow")).toBe("flow-123");
    await waitFor(() => {
      expect(navigate).toHaveBeenCalled();
    });
  });
});

it("Internal access: the identity fallback is neutral and email actions can be disabled", async () => {
  vi.stubEnv("VITE_EMAIL_LOGIN_ENABLED", "false");
  const { fetcher } = testFetcher();
  await renderApp(createClient(fetcher));
  expect(await screen.findByLabelText("Contrasenya")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Envia'm un enllaç per entrar" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Has oblidat la contrasenya? Recupera-la" }),
  ).toBeNull();
  expect(document.body.textContent).not.toMatch(/AgilityHub/u);
  expect(document.title).not.toMatch(/AgilityHub/u);
});
