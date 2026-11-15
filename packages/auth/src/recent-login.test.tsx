// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { isApiError } from "@agilityhub/api-client";
import { createI18n } from "@agilityhub/i18n";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { AuthClient, type Me, type TokenResponse } from "./auth-client";
import { MemoryRefreshTokenStore } from "./mock-refresh-token";
import { RecentLoginDialog } from "./recent-login";
import { createAuthenticatedApiClient } from "./refresh-interceptor";
import { installWebLocks } from "./testing";

const API_BASE_URL = "https://club.example.test/api/v1";
const IDENTITY_BASE_URL = "https://id.example.test";
const TOKEN_ENDPOINT = "https://id.example.test/oauth2/token";
const EXPORT_URL = `${API_BASE_URL}/members/export`;

/** An access token with a readable `sid` claim (the session it belongs to), as the api signs. */
function accessToken(sid: string): string {
  const part = (value: object) =>
    btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  return `${part({ alg: "none" })}.${part({ sid, sub: "account-fictional" })}.signature`;
}

function tokens(sid: string): TokenResponse {
  return {
    access_token: accessToken(sid),
    expires_in: 900,
    refresh_token: `refresh-${sid}`,
    scope: "openid profile",
    token_type: "Bearer",
  };
}

function adminMe(
  overrides: Partial<Me["account"]> = {},
  activeProfile: "ADMIN" | "INSTRUCTOR" = "ADMIN",
): Me {
  return {
    account: {
      email: "aina.ferrer@example.test",
      emailVerifiedAt: "2026-08-01T08:00:00Z",
      hasPassword: true,
      id: "10000000-0000-4000-8000-000000000071",
      locale: "ca",
      name: "Aina Ferrer",
      onboardingPending: false,
      platformRoles: [],
      ...overrides,
    },
    features: [],
    membership: {
      activeProfile,
      clubId: "50000000-0000-4000-8000-000000000001",
      defaultProfile: "ADMIN",
      gender: "FEMALE",
      profiles: ["ADMIN", "INSTRUCTOR"],
      rememberProfile: false,
      roles: ["ADMIN", "INSTRUCTOR"],
    },
  };
}

interface World {
  /** Whether the session's sign-in is recent enough for the export. */
  recent: boolean;
  /** Bearer tokens the export saw, in order. */
  exportCalls: string[];
  passwordGrants: URLSearchParams[];
  revoked: string[];
  magicLinks: unknown[];
  profileSwitches: unknown[];
  me: Me;
}

const server = setupServer();
let removeLocks: () => void = () => undefined;

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  removeLocks = installWebLocks();
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  localStorage.clear();
  sessionStorage.clear();
});

afterAll(() => {
  server.close();
  removeLocks();
});

/** The api as the step-up answers it: the export needs a sign-in made through the dialog. */
function serve(me: Me): World {
  const world: World = {
    exportCalls: [],
    magicLinks: [],
    me,
    passwordGrants: [],
    profileSwitches: [],
    recent: false,
    revoked: [],
  };
  server.use(
    http.post(TOKEN_ENDPOINT, async ({ request }) => {
      const form = new URLSearchParams(await request.text());
      if (form.get("grant_type") === "password") {
        world.passwordGrants.push(form);
        if (form.get("password") === "wrong-password") {
          return HttpResponse.json(
            { code: "INVALID_CREDENTIALS", details: {}, message: "Invalid", traceId: "t" },
            { status: 401 },
          );
        }
        if (form.get("password") === "locked-password") {
          return HttpResponse.json(
            { code: "LOGIN_LOCKED", details: {}, message: "Locked", traceId: "t" },
            { status: 429 },
          );
        }
        world.recent = true;
        return HttpResponse.json(tokens("session-new"));
      }
      return HttpResponse.json(tokens("session-old"));
    }),
    http.get(`${API_BASE_URL}/me`, () => HttpResponse.json(world.me)),
    http.put(`${API_BASE_URL}/me/profile`, async ({ request }) => {
      world.profileSwitches.push(await request.json());
      return HttpResponse.json({ access_token: accessToken("session-new"), expires_in: 900 });
    }),
    http.delete(`${API_BASE_URL}/me/sessions/:id`, ({ params }) => {
      world.revoked.push(String(params.id));
      return new HttpResponse(null, { status: 200 });
    }),
    http.post(`${API_BASE_URL}/auth/magic-link`, async ({ request }) => {
      world.magicLinks.push(await request.json());
      return new HttpResponse(null, { status: 202 });
    }),
    http.get(EXPORT_URL, ({ request }) => {
      world.exportCalls.push(request.headers.get("Authorization") ?? "");
      return world.recent
        ? new HttpResponse("number;name\n", {
            headers: { "Content-Type": "text/csv" },
            status: 200,
          })
        : HttpResponse.json(
            {
              code: "RECENT_LOGIN_REQUIRED",
              details: { maxAgeMinutes: 15 },
              message: "Sign in again",
              traceId: "t",
            },
            { status: 403 },
          );
    }),
  );
  return world;
}

async function signedIn(options: { dialog?: boolean; locale?: string } = {}) {
  const client = new AuthClient({
    apiBaseUrl: API_BASE_URL,
    clientId: "clubs-admin",
    identityBaseUrl: IDENTITY_BASE_URL,
    mockMode: true,
    mockRefreshTokenStore: new MemoryRefreshTokenStore(),
  });
  await client.restoreSession();
  const api = createAuthenticatedApiClient(client, { baseUrl: API_BASE_URL });
  if (options.dialog !== false) {
    const i18n = await createI18n({
      branding: { defaultLocale: "ca", locales: ["ca", "es", "en"] },
      browserLanguages: [options.locale ?? "ca"],
      initialNamespaces: ["auth", "common", "errors"],
      storage: undefined,
    });
    render(
      <I18nextProvider i18n={i18n}>
        <RecentLoginDialog client={client} />
      </I18nextProvider>,
    );
  }
  return { api, client };
}

function exportMembers(api: ReturnType<typeof createAuthenticatedApiClient>) {
  return api.GET("/members/export", {
    params: { query: { columns: "number,name", filter: [], format: "xlsx", sort: [] } },
    parseAs: "text",
  });
}

describe("AUTH-01 (S01 R-01-18, decision of 13 Nov 2026): «Confirma que ets tu»", () => {
  it("a refused export asks for the password, signs the same account in again and sends the export once more", async () => {
    const world = serve(adminMe());
    const { api, client } = await signedIn();
    const generation = client.getSessionGeneration();

    const pending = exportMembers(api);
    const dialog = await screen.findByRole("dialog", { name: "Confirma que ets tu" });
    expect(dialog).toHaveTextContent(
      "Per seguretat, torna a escriure la contrasenya per continuar.",
    );
    expect(world.exportCalls).toHaveLength(1);

    fireEvent.change(within(dialog).getByLabelText("Contrasenya"), {
      target: { value: "secret-password" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Continua" }));

    const result = await pending;
    expect(result.response.status).toBe(200);
    expect(world.exportCalls).toEqual([
      `Bearer ${accessToken("session-old")}`,
      `Bearer ${accessToken("session-new")}`,
    ]);
    expect(world.passwordGrants).toHaveLength(1);
    expect(Object.fromEntries(world.passwordGrants[0] ?? [])).toEqual({
      client_id: "clubs-admin",
      grant_type: "password",
      password: "secret-password",
      username: "aina.ferrer@example.test",
    });
    // The new session takes the old one's place: no session change, and the old one is ended.
    expect(client.getSessionGeneration()).toBe(generation);
    expect(client.getAccessToken()).toBe(accessToken("session-new"));
    await waitFor(() => {
      expect(world.revoked).toEqual(["session-old"]);
    });
    expect(world.profileSwitches).toEqual([]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("requests refused together share one question and are each sent once more", async () => {
    const world = serve(adminMe());
    const { api } = await signedIn();

    const first = exportMembers(api);
    const second = exportMembers(api);
    const dialog = await screen.findByRole("dialog", { name: "Confirma que ets tu" });
    await waitFor(() => {
      expect(world.exportCalls).toHaveLength(2);
    });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    fireEvent.change(within(dialog).getByLabelText("Contrasenya"), {
      target: { value: "secret-password" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Continua" }));

    expect((await first).response.status).toBe(200);
    expect((await second).response.status).toBe(200);
    expect(world.passwordGrants).toHaveLength(1);
    expect(world.exportCalls).toHaveLength(4);
  });

  it("a wrong or locked password keeps the dialog open with the usual message, and nothing is sent again", async () => {
    const world = serve(adminMe());
    const { api } = await signedIn();
    const pending = exportMembers(api);
    const dialog = await screen.findByRole("dialog", { name: "Confirma que ets tu" });
    const field = within(dialog).getByLabelText("Contrasenya");

    fireEvent.click(within(dialog).getByRole("button", { name: "Continua" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Escriu la contrasenya.");
    expect(world.passwordGrants).toHaveLength(0);

    fireEvent.change(field, { target: { value: "wrong-password" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Continua" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Correu o contrasenya incorrectes",
    );
    expect(field).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(field, { target: { value: "locked-password" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Continua" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "L'accés està bloquejat temporalment.",
    );
    expect(world.exportCalls).toHaveLength(1);

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel·la" }));
    const result = await pending.catch((error: unknown) => error);
    expect(isApiError(result, "RECENT_LOGIN_REQUIRED")).toBe(true);
    expect(world.exportCalls).toHaveLength(1);
  });

  it("Escape closes the dialog and the action gets the original 403", async () => {
    const world = serve(adminMe());
    const { api } = await signedIn();
    const pending = exportMembers(api).catch((error: unknown) => error);
    await screen.findByRole("dialog", { name: "Confirma que ets tu" });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(isApiError(await pending, "RECENT_LOGIN_REQUIRED")).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(world.passwordGrants).toHaveLength(0);
    expect(world.exportCalls).toHaveLength(1);
  });

  it("an account without a password is sent a sign-in link and told to do the action again from it", async () => {
    const world = serve(adminMe({ hasPassword: false }));
    const { api } = await signedIn();
    const pending = exportMembers(api).catch((error: unknown) => error);
    const dialog = await screen.findByRole("dialog", { name: "Confirma que ets tu" });
    expect(dialog).toHaveTextContent(
      "T'enviarem un enllaç per entrar; obre'l i torna a fer l'acció.",
    );
    expect(within(dialog).queryByLabelText("Contrasenya")).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Envia'm l'enllaç" }));
    expect(await within(dialog).findByRole("status")).toHaveTextContent(
      "Enllaç enviat a aina.ferrer@example.test.",
    );
    expect(world.magicLinks).toEqual([
      { client_id: "clubs-admin", email: "aina.ferrer@example.test", purpose: "LOGIN" },
    ]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Tanca" }));
    expect(isApiError(await pending, "RECENT_LOGIN_REQUIRED")).toBe(true);
    expect(world.passwordGrants).toHaveLength(0);
    expect(world.exportCalls).toHaveLength(1);
  });

  it.each([
    ["es", "Confirma que eres tú", "Contraseña", "Continuar"],
    ["en", "Confirm it's you", "Password", "Continue"],
  ] as const)("reads the dialog in %s", async (locale, title, label, confirm) => {
    serve(adminMe());
    const { api } = await signedIn({ locale });
    const pending = exportMembers(api);
    const dialog = await screen.findByRole("dialog", { name: title });
    fireEvent.change(within(dialog).getByLabelText(label), {
      target: { value: "secret-password" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: confirm }));
    expect((await pending).response.status).toBe(200);
  });

  it("keeps the profile the person was using when the new sign-in opens another one", async () => {
    const world = serve(adminMe({}, "INSTRUCTOR"));
    const { api, client } = await signedIn();
    // The password grant opens the remembered default (ADMIN); the instructor was using INSTRUCTOR.
    world.me = adminMe();
    const pending = exportMembers(api);
    const dialog = await screen.findByRole("dialog", { name: "Confirma que ets tu" });
    fireEvent.change(within(dialog).getByLabelText("Contrasenya"), {
      target: { value: "secret-password" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Continua" }));
    expect((await pending).response.status).toBe(200);
    expect(world.profileSwitches).toEqual([{ activeProfile: "INSTRUCTOR", remember: false }]);
    expect(client.getMe()?.membership?.activeProfile).toBe("INSTRUCTOR");
  });

  it("without the dialog on the page, or for an impersonated session, the action gets the 403 and nothing is asked", async () => {
    const world = serve(adminMe());
    const { api } = await signedIn({ dialog: false });
    expect(
      isApiError(
        await exportMembers(api).catch((error: unknown) => error),
        "RECENT_LOGIN_REQUIRED",
      ),
    ).toBe(true);
    expect(world.exportCalls).toHaveLength(1);

    const impersonated = new AuthClient({
      apiBaseUrl: API_BASE_URL,
      clientId: "clubs-admin",
      identityBaseUrl: IDENTITY_BASE_URL,
    });
    await act(async () => {
      await impersonated.acceptImpersonation(accessToken("support"), "2099-01-01T00:00:00Z");
    });
    const i18n = await createI18n({
      branding: { defaultLocale: "ca", locales: ["ca"] },
      browserLanguages: ["ca"],
      initialNamespaces: ["auth", "common", "errors"],
      storage: undefined,
    });
    render(
      <I18nextProvider i18n={i18n}>
        <RecentLoginDialog client={impersonated} />
      </I18nextProvider>,
    );
    const support = createAuthenticatedApiClient(impersonated, { baseUrl: API_BASE_URL });
    expect(
      isApiError(
        await exportMembers(support).catch((error: unknown) => error),
        "RECENT_LOGIN_REQUIRED",
      ),
    ).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(world.passwordGrants).toHaveLength(0);
  });
});
