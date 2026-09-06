import { delay, http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { AuthClient, type Me, type TokenResponse } from "./auth-client";
import { MemoryRefreshTokenStore } from "./crypto-store";
import { createAuthenticatedApiClient } from "./refresh-interceptor";

const API_BASE_URL = "https://club.example.test/api/v1";
const TOKEN_ENDPOINT = "https://id.example.test/oauth2/token";
const REVOKE_ENDPOINT = "https://id.example.test/oauth2/revoke";

const memberMe: Me = {
  account: {
    email: "biel.roca@example.test",
    id: "10000000-0000-4000-8000-000000000002",
    locale: "ca",
    name: "Biel Roca",
  },
  membership: {
    defaultProfile: "MEMBER",
    memberId: "20000000-0000-4000-8000-000000000002",
    roles: ["MEMBER"],
  },
  modules: ["FREE_TRAINING", "COURSES"],
};

function tokens(accessToken: string, refreshToken: string): TokenResponse {
  return {
    access_token: accessToken,
    expires_in: 900,
    refresh_token: refreshToken,
    token_type: "Bearer",
  };
}

const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

describe("T-01-21 AuthClient session flow", () => {
  it("logs in with the password grant, keeps access in memory, and loads /me", async () => {
    const refreshStore = new MemoryRefreshTokenStore();
    let loginForm: FormData | undefined;
    let meAuthorization = "";
    server.use(
      http.post(TOKEN_ENDPOINT, async ({ request }) => {
        loginForm = await request.formData();
        return HttpResponse.json(tokens("access-login", "refresh-login"));
      }),
      http.get(`${API_BASE_URL}/me`, ({ request }) => {
        meAuthorization = request.headers.get("Authorization") ?? "";
        return HttpResponse.json(memberMe);
      }),
    );
    const client = new AuthClient({
      apiBaseUrl: API_BASE_URL,
      refreshTokenStore: refreshStore,
      revokeEndpoint: REVOKE_ENDPOINT,
      tokenEndpoint: TOKEN_ENDPOINT,
    });

    await expect(client.login("biel.roca@example.test", "secret-password")).resolves.toEqual(
      memberMe,
    );

    expect(loginForm?.get("grant_type")).toBe("password");
    expect(loginForm?.get("username")).toBe("biel.roca@example.test");
    expect(loginForm?.get("password")).toBe("secret-password");
    expect(meAuthorization).toBe("Bearer access-login");
    expect(client.getAccessToken()).toBe("access-login");
    await expect(refreshStore.get()).resolves.toBe("refresh-login");
  });

  it("queues concurrent 401 responses behind one refresh and retries every request once", async () => {
    const refreshStore = new MemoryRefreshTokenStore();
    let loginComplete = false;
    let protectedRequests = 0;
    let refreshRequests = 0;
    server.use(
      http.post(TOKEN_ENDPOINT, async ({ request }) => {
        const form = await request.formData();
        if (form.get("grant_type") === "password") {
          return HttpResponse.json(tokens("access-expired", "refresh-original"));
        }
        refreshRequests += 1;
        expect(form.get("grant_type")).toBe("refresh_token");
        expect(form.get("refresh_token")).toBe("refresh-original");
        await delay(20);
        return HttpResponse.json(tokens("access-rotated", "refresh-rotated"));
      }),
      http.get(`${API_BASE_URL}/me`, ({ request }) => {
        if (!loginComplete) {
          return HttpResponse.json(memberMe);
        }
        protectedRequests += 1;
        return request.headers.get("Authorization") === "Bearer access-rotated"
          ? HttpResponse.json(memberMe)
          : HttpResponse.json(
              { code: "UNAUTHENTICATED", message: "Authentication required" },
              { status: 401 },
            );
      }),
    );
    const client = new AuthClient({
      apiBaseUrl: API_BASE_URL,
      refreshTokenStore: refreshStore,
      tokenEndpoint: TOKEN_ENDPOINT,
    });
    await client.login("biel.roca@example.test", "secret-password");
    loginComplete = true;
    const apiClient = createAuthenticatedApiClient(client, { baseUrl: API_BASE_URL });

    const [first, second] = await Promise.all([apiClient.GET("/me"), apiClient.GET("/me")]);

    expect(first.data).toEqual(memberMe);
    expect(second.data).toEqual(memberMe);
    expect(refreshRequests).toBe(1);
    expect(protectedRequests).toBe(4);
    expect(client.getAccessToken()).toBe("access-rotated");
    await expect(refreshStore.get()).resolves.toBe("refresh-rotated");
  });

  it("emits signedOut and redirects to /acces when refresh fails", async () => {
    const refreshStore = new MemoryRefreshTokenStore();
    const navigate = vi.fn();
    let loginComplete = false;
    server.use(
      http.post(TOKEN_ENDPOINT, async ({ request }) => {
        const form = await request.formData();
        return form.get("grant_type") === "password"
          ? HttpResponse.json(tokens("access-expired", "refresh-expired"))
          : HttpResponse.json(
              { code: "REFRESH_EXPIRED", message: "Refresh expired" },
              { status: 400 },
            );
      }),
      http.get(`${API_BASE_URL}/me`, () =>
        loginComplete
          ? HttpResponse.json(
              { code: "UNAUTHENTICATED", message: "Authentication required" },
              { status: 401 },
            )
          : HttpResponse.json(memberMe),
      ),
    );
    const client = new AuthClient({
      apiBaseUrl: API_BASE_URL,
      navigate,
      refreshTokenStore: refreshStore,
      tokenEndpoint: TOKEN_ENDPOINT,
    });
    await client.login("biel.roca@example.test", "secret-password");
    loginComplete = true;
    const signedOut = vi.fn();
    client.addEventListener("signedOut", signedOut);
    const apiClient = createAuthenticatedApiClient(client, { baseUrl: API_BASE_URL });

    await expect(apiClient.GET("/me")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      status: 401,
    });

    expect(signedOut).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith("/acces");
    expect(client.getAccessToken()).toBeNull();
    await expect(refreshStore.get()).resolves.toBeNull();
  });

  it("revokes the refresh token and clears the local session on logout", async () => {
    const refreshStore = new MemoryRefreshTokenStore();
    let revokedToken = "";
    server.use(
      http.post(TOKEN_ENDPOINT, () => HttpResponse.json(tokens("access-login", "refresh-login"))),
      http.get(`${API_BASE_URL}/me`, () => HttpResponse.json(memberMe)),
      http.post(REVOKE_ENDPOINT, async ({ request }) => {
        const body = (await request.json()) as { token: string };
        revokedToken = body.token;
        return new HttpResponse(null, { status: 200 });
      }),
    );
    const client = new AuthClient({
      apiBaseUrl: API_BASE_URL,
      refreshTokenStore: refreshStore,
      revokeEndpoint: REVOKE_ENDPOINT,
      tokenEndpoint: TOKEN_ENDPOINT,
    });
    await client.login("biel.roca@example.test", "secret-password");
    const signedOut = vi.fn();
    client.addEventListener("signedOut", signedOut);

    await client.logout();

    expect(revokedToken).toBe("refresh-login");
    expect(client.getAccessToken()).toBeNull();
    await expect(refreshStore.get()).resolves.toBeNull();
    expect(signedOut).toHaveBeenCalledOnce();
  });
});
