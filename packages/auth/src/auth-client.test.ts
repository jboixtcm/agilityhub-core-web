// @vitest-environment jsdom

import { delay, http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  AuthClient,
  type Me,
  type OnboardingRequest,
  type OnboardingState,
  type TokenResponse,
} from "./auth-client";
import { MemoryRefreshTokenStore } from "./mock-refresh-token";
import { createAuthenticatedApiClient } from "./refresh-interceptor";

const API_BASE_URL = "https://club.example.test/api/v1";
const IDENTITY_BASE_URL = "https://id.example.test";
const TOKEN_ENDPOINT = "https://id.example.test/oauth2/token";
const REVOKE_ENDPOINT = "https://id.example.test/oauth2/revoke";

const memberMe: Me = {
  account: {
    email: "biel.roca@example.test",
    id: "10000000-0000-4000-8000-000000000002",
    locale: "ca",
    name: "Biel Roca",
    hasPassword: true,
    emailVerifiedAt: "2026-08-01T08:00:00Z",
    onboardingPending: false,
    platformRoles: [],
  },
  membership: {
    clubId: "50000000-0000-4000-8000-000000000001",
    defaultProfile: "MEMBER",
    gender: "MALE",
    activeProfile: "MEMBER",
    profiles: ["MEMBER"],
    rememberProfile: true,
    memberId: "20000000-0000-4000-8000-000000000002",
    roles: ["MEMBER"],
  },
  features: ["FREE_TRAINING", "COURSES"],
};

function tokens(accessToken: string, refreshToken?: string): TokenResponse {
  return {
    access_token: accessToken,
    expires_in: 900,
    ...(refreshToken === undefined ? {} : { refresh_token: refreshToken }),
    scope: "openid profile",
    token_type: "Bearer",
  };
}

const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
  sessionStorage.clear();
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
      identityBaseUrl: IDENTITY_BASE_URL,
      mockMode: true,
      mockRefreshTokenStore: refreshStore,
    });

    await expect(client.login("biel.roca@example.test", "secret-password")).resolves.toEqual(
      memberMe,
    );

    expect(loginForm?.get("grant_type")).toBe("password");
    expect(loginForm?.get("username")).toBe("biel.roca@example.test");
    expect(loginForm?.get("password")).toBe("secret-password");
    expect(meAuthorization).toBe("Bearer access-login");
    expect(client.getAccessToken()).toBe("access-login");
    expect(refreshStore.get()).toBe("refresh-login");
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
  });

  it("normalizes the core's omitted empty scope before loading /me", async () => {
    server.use(
      http.post(TOKEN_ENDPOINT, () =>
        HttpResponse.json({
          access_token: "access-with-empty-scope",
          expires_in: 900,
          token_type: "Bearer",
        }),
      ),
      http.get(`${API_BASE_URL}/me`, () => HttpResponse.json(memberMe)),
    );
    const client = new AuthClient({
      apiBaseUrl: API_BASE_URL,
      identityBaseUrl: IDENTITY_BASE_URL,
    });

    await expect(client.login("biel.roca@example.test", "secret-password")).resolves.toEqual(
      memberMe,
    );
    expect(client.getAccessToken()).toBe("access-with-empty-scope");
  });

  it("routes OAuth2 requests to identity and application auth requests to core", async () => {
    const refreshStore = new MemoryRefreshTokenStore();
    const requestedUrls: string[] = [];
    server.use(
      http.post(TOKEN_ENDPOINT, ({ request }) => {
        requestedUrls.push(request.url);
        return HttpResponse.json(tokens("access-login", "refresh-login"));
      }),
      http.get(`${API_BASE_URL}/me`, () => HttpResponse.json(memberMe)),
      http.post(`${API_BASE_URL}/auth/magic-link`, ({ request }) => {
        requestedUrls.push(request.url);
        return new HttpResponse(null, { status: 202 });
      }),
      http.post(`${API_BASE_URL}/auth/handoff`, ({ request }) => {
        requestedUrls.push(request.url);
        return HttpResponse.json(
          { code: "handoff-code", url: "https://admin.example.test/entrar?handoff=handoff-code" },
          { status: 201 },
        );
      }),
      http.post(REVOKE_ENDPOINT, ({ request }) => {
        requestedUrls.push(request.url);
        return new HttpResponse(null, { status: 200 });
      }),
    );
    const client = new AuthClient({
      apiBaseUrl: API_BASE_URL,
      identityBaseUrl: IDENTITY_BASE_URL,
      mockMode: true,
      mockRefreshTokenStore: refreshStore,
    });

    await client.login("biel.roca@example.test", "secret-password");
    await client.requestMagicLink("biel.roca@example.test", "LOGIN");
    await client.createHandoff("clubs-admin");
    await client.logout();

    expect(requestedUrls).toEqual([
      `${IDENTITY_BASE_URL}/oauth2/token`,
      `${API_BASE_URL}/auth/magic-link`,
      `${API_BASE_URL}/auth/handoff`,
      `${IDENTITY_BASE_URL}/oauth2/revoke`,
    ]);
  });

  it("T-01-12 exchanges the R-01-13 handoff code through the contract token field", async () => {
    let handoffForm: FormData | undefined;
    server.use(
      http.post(TOKEN_ENDPOINT, async ({ request }) => {
        handoffForm = await request.formData();
        return HttpResponse.json(tokens("access-handoff", "refresh-handoff"));
      }),
      http.get(`${API_BASE_URL}/me`, () => HttpResponse.json(memberMe)),
    );
    const client = new AuthClient({
      apiBaseUrl: API_BASE_URL,
      identityBaseUrl: IDENTITY_BASE_URL,
      mockMode: true,
      mockRefreshTokenStore: new MemoryRefreshTokenStore(),
    });

    await expect(client.exchangeHandoff("handoff-code")).resolves.toEqual(memberMe);

    expect(handoffForm?.get("grant_type")).toBe("urn:agilityhub:grant:handoff");
    expect(handoffForm?.get("token")).toBe("handoff-code");
    expect(handoffForm?.has("code")).toBe(false);
  });

  it("T-01-04 refreshes via the cookie and coalesces concurrent 401 responses", async () => {
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
        expect(form.has("refresh_token")).toBe(false);
        expect(request.credentials).toBe("include");
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
      identityBaseUrl: IDENTITY_BASE_URL,
      mockMode: true,
      mockRefreshTokenStore: refreshStore,
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
    expect(refreshStore.get()).toBe("refresh-rotated");
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
  });

  it("preserves mutation bodies while adding cookie credentials and 401 retry support", async () => {
    let receivedBody: unknown;
    server.use(
      http.put(`${API_BASE_URL}/me/profile`, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json(tokens("access-profile"));
      }),
    );
    const client = new AuthClient({
      apiBaseUrl: API_BASE_URL,
      identityBaseUrl: IDENTITY_BASE_URL,
    });
    const apiClient = createAuthenticatedApiClient(client, { baseUrl: API_BASE_URL });

    await apiClient.PUT("/me/profile", {
      body: { activeProfile: "MEMBER", remember: true },
    });

    expect(receivedBody).toEqual({ activeProfile: "MEMBER", remember: true });
  });

  it("emits signedOut and redirects to /entrar when refresh fails", async () => {
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
      identityBaseUrl: IDENTITY_BASE_URL,
      navigate,
      mockMode: true,
      mockRefreshTokenStore: refreshStore,
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
    expect(navigate).toHaveBeenCalledWith("/entrar");
    expect(client.getAccessToken()).toBeNull();
    expect(refreshStore.get()).toBeNull();
  });

  it("revokes the cookie session with an empty body and bearer access token", async () => {
    const refreshStore = new MemoryRefreshTokenStore();
    let revokeAuthorization = "";
    let revokeBody: unknown;
    server.use(
      http.post(TOKEN_ENDPOINT, () => HttpResponse.json(tokens("access-login", "refresh-login"))),
      http.get(`${API_BASE_URL}/me`, () => HttpResponse.json(memberMe)),
      http.post(REVOKE_ENDPOINT, async ({ request }) => {
        revokeAuthorization = request.headers.get("Authorization") ?? "";
        revokeBody = await request.json();
        expect(request.credentials).toBe("include");
        return new HttpResponse(null, { status: 200 });
      }),
    );
    const client = new AuthClient({
      apiBaseUrl: API_BASE_URL,
      identityBaseUrl: IDENTITY_BASE_URL,
      mockMode: true,
      mockRefreshTokenStore: refreshStore,
    });
    await client.login("biel.roca@example.test", "secret-password");
    const signedOut = vi.fn();
    client.addEventListener("signedOut", signedOut);

    await client.logout();

    expect(revokeBody).toEqual({});
    expect(revokeAuthorization).toBe("Bearer access-login");
    expect(client.getAccessToken()).toBeNull();
    expect(refreshStore.get()).toBeNull();
    expect(signedOut).toHaveBeenCalledOnce();
  });

  it("T-01-04 restores a session from the HttpOnly cookie without a body token", async () => {
    let refreshForm: FormData | undefined;
    server.use(
      http.post(TOKEN_ENDPOINT, async ({ request }) => {
        refreshForm = await request.formData();
        return HttpResponse.json(tokens("access-restored"));
      }),
      http.get(`${API_BASE_URL}/me`, ({ request }) => {
        expect(request.credentials).toBe("include");
        return HttpResponse.json(memberMe);
      }),
    );
    const client = new AuthClient({
      apiBaseUrl: API_BASE_URL,
      identityBaseUrl: IDENTITY_BASE_URL,
    });

    await expect(client.restoreSession()).resolves.toEqual(memberMe);

    expect(refreshForm?.get("grant_type")).toBe("refresh_token");
    expect(refreshForm?.has("refresh_token")).toBe(false);
    expect(client.getAccessToken()).toBe("access-restored");
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
  });

  it("T-01-04 coalesces restore calls until both refresh and /me complete", async () => {
    let completeMe: (() => void) | undefined;
    let meRequests = 0;
    let notifyMeStarted: (() => void) | undefined;
    let refreshRequests = 0;
    const meStarted = new Promise<void>((resolve) => {
      notifyMeStarted = resolve;
    });
    const meCanComplete = new Promise<void>((resolve) => {
      completeMe = resolve;
    });
    server.use(
      http.post(TOKEN_ENDPOINT, () => {
        refreshRequests += 1;
        return HttpResponse.json(tokens("access-restored"));
      }),
      http.get(`${API_BASE_URL}/me`, async () => {
        meRequests += 1;
        notifyMeStarted?.();
        await meCanComplete;
        return HttpResponse.json(memberMe);
      }),
    );
    const client = new AuthClient({
      apiBaseUrl: API_BASE_URL,
      identityBaseUrl: IDENTITY_BASE_URL,
    });

    const first = client.restoreSession();
    await meStarted;
    const second = client.restoreSession();
    completeMe?.();

    await expect(Promise.all([first, second])).resolves.toEqual([memberMe, memberMe]);
    expect(refreshRequests).toBe(1);
    expect(meRequests).toBe(1);
  });

  it.each([400, 401])(
    "T-01-04 treats a %i cookie refresh response as an anonymous session",
    async (status) => {
      server.use(
        http.post(TOKEN_ENDPOINT, () =>
          HttpResponse.json(
            { code: "REFRESH_EXPIRED", message: "Refresh unavailable" },
            { status },
          ),
        ),
      );
      const client = new AuthClient({
        apiBaseUrl: API_BASE_URL,
        identityBaseUrl: IDENTITY_BASE_URL,
      });

      await expect(client.restoreSession()).resolves.toBeNull();
      expect(client.getAccessToken()).toBeNull();
    },
  );

  it("rejects a mock refresh store unless the build-time mock flag is enabled", () => {
    expect(
      () =>
        new AuthClient({
          mockRefreshTokenStore: new MemoryRefreshTokenStore(),
        }),
    ).toThrow("only available in mock mode");
  });
});

describe("T-01-26 onboarding contract", () => {
  it("loads, postpones and completes onboarding through the generated operations", async () => {
    const pendingMe: Me = {
      ...memberMe,
      account: { ...memberMe.account, onboardingPending: true },
    };
    const pending: OnboardingState = {
      fields: [{ key: "locale", required: true, value: "ca" }],
      pending: true,
      postponeRemaining: 3,
      requiredConsent: {
        policy: "PLATFORM",
        url: "https://club.example.test/legal/privacy",
        version: "2026-09-01",
      },
    };
    let completion: OnboardingRequest | undefined;
    server.use(
      http.post(TOKEN_ENDPOINT, () => HttpResponse.json(tokens("access-login", "refresh-login"))),
      http.get(`${API_BASE_URL}/me`, () => HttpResponse.json(pendingMe)),
      http.get(`${API_BASE_URL}/me/onboarding`, () => HttpResponse.json(pending)),
      http.post(`${API_BASE_URL}/me/onboarding/postpone`, () =>
        HttpResponse.json({ ...pending, postponeRemaining: 2 }),
      ),
      http.put(`${API_BASE_URL}/me/onboarding`, async ({ request }) => {
        completion = (await request.json()) as OnboardingRequest;
        return HttpResponse.json({ ...pending, pending: false, requiredConsent: null });
      }),
    );
    const client = new AuthClient({
      apiBaseUrl: API_BASE_URL,
      identityBaseUrl: IDENTITY_BASE_URL,
      mockMode: true,
      mockRefreshTokenStore: new MemoryRefreshTokenStore(),
    });
    await client.login("biel.roca@example.test", "secret-password");

    await expect(client.getOnboarding()).resolves.toEqual(pending);
    await expect(client.postponeOnboarding()).resolves.toMatchObject({ postponeRemaining: 2 });
    await client.completeOnboarding({
      consentAccepted: true,
      consentVersion: "2026-09-01",
      fields: { locale: "es", name: "Biel Roca" },
      imageConsent: true,
    });

    expect(completion).toEqual({
      consentAccepted: true,
      consentVersion: "2026-09-01",
      fields: { locale: "es", name: "Biel Roca" },
      imageConsent: true,
    });
    expect(client.getMe()?.account).toMatchObject({
      locale: "es",
      name: "Biel Roca",
      onboardingPending: false,
    });
  });
});
