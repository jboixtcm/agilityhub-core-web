// @vitest-environment jsdom

import { delay, http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  AuthClient,
  IMPERSONATION_STORAGE_KEY,
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
  vi.useRealTimers();
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
    const refreshStore = new MemoryRefreshTokenStore();
    const client = new AuthClient({
      apiBaseUrl: API_BASE_URL,
      identityBaseUrl: IDENTITY_BASE_URL,
      mockMode: true,
      mockRefreshTokenStore: refreshStore,
    });

    await expect(client.exchangeHandoff("handoff-code")).resolves.toEqual(memberMe);

    expect(handoffForm?.get("grant_type")).toBe("urn:agilityhub:grant:handoff");
    expect(handoffForm?.get("token")).toBe("handoff-code");
    expect(handoffForm?.has("code")).toBe(false);
    // E4-W16 round 2: a handoff that is not an impersonation is a usual sliding session once /me
    // answers (a BODY client keeps its refresh token in memory), and the tab's mark is gone.
    expect(client.getAccessToken()).toBe("access-handoff");
    expect(refreshStore.get()).toBe("refresh-handoff");
    expect(client.hasPendingHandoff()).toBe(false);
    expect(sessionStorage.getItem(IMPERSONATION_STORAGE_KEY)).toBeNull();
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

const impersonatedMe: Me = { ...memberMe, impersonation: { actorName: "Aina Serra" } };

function unauthenticated() {
  return HttpResponse.json(
    { code: "UNAUTHENTICATED", message: "Authentication required" },
    { status: 401 },
  );
}

/** Lets the event handlers' promises run (a refresh that was about to start, or not). */
async function settle() {
  await new Promise((resolve) => {
    setTimeout(resolve, 20);
  });
}

describe("T-01-11 E4-W16 step 2 (INC-18, E47): an impersonated session never refreshes", () => {
  it("after acceptImpersonation, focus, pageshow and visibilitychange never call /oauth2/token", async () => {
    let tokenRequests = 0;
    server.use(
      http.post(TOKEN_ENDPOINT, () => {
        tokenRequests += 1;
        return HttpResponse.json(tokens("access-of-the-admin-as-member", "refresh"));
      }),
      http.get(`${API_BASE_URL}/me`, () => HttpResponse.json(impersonatedMe)),
    );
    const client = new AuthClient({ apiBaseUrl: API_BASE_URL, identityBaseUrl: IDENTITY_BASE_URL });
    const stop = client.startSlidingRefresh();

    await client.acceptImpersonation("impersonation-token");
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("pageshow"));
    document.dispatchEvent(new Event("visibilitychange"));
    await settle();

    expect(tokenRequests).toBe(0);
    expect(client.isImpersonated()).toBe(true);
    expect(client.getAccessToken()).toBe("impersonation-token");
    await expect(client.refresh()).rejects.toThrow("never refreshed");
    expect(tokenRequests).toBe(0);
    stop();
  });

  it("a 401 ends the impersonation: no refresh, the expired event and mark, and the tab never reads the cookie again", async () => {
    let tokenRequests = 0;
    let meRequests = 0;
    server.use(
      http.post(TOKEN_ENDPOINT, () => {
        tokenRequests += 1;
        return HttpResponse.json(tokens("access-of-the-admin-as-member"));
      }),
      http.get(`${API_BASE_URL}/me`, () => {
        meRequests += 1;
        return meRequests === 1 ? HttpResponse.json(impersonatedMe) : unauthenticated();
      }),
    );
    const navigate = vi.fn();
    const client = new AuthClient({
      apiBaseUrl: API_BASE_URL,
      identityBaseUrl: IDENTITY_BASE_URL,
      navigate,
    });
    await client.acceptImpersonation("impersonation-token");
    const expired = vi.fn();
    const signedOut = vi.fn();
    client.addEventListener("impersonationExpired", expired);
    client.addEventListener("signedOut", signedOut);
    const apiClient = createAuthenticatedApiClient(client, { baseUrl: API_BASE_URL });

    await expect(apiClient.GET("/me")).rejects.toMatchObject({ status: 401 });

    expect(tokenRequests).toBe(0);
    expect(expired).toHaveBeenCalledOnce();
    expect(signedOut).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(client.isImpersonationExpired()).toBe(true);
    expect(client.getAccessToken()).toBeNull();
    // The tab's next page load stays expired: never a silent switch to the admin's own session.
    const reloaded = new AuthClient({
      apiBaseUrl: API_BASE_URL,
      identityBaseUrl: IDENTITY_BASE_URL,
    });
    await expect(reloaded.restoreSession()).resolves.toBeNull();
    expect(reloaded.isImpersonationExpired()).toBe(true);
    expect(tokenRequests).toBe(0);
    expect(localStorage).toHaveLength(0);
  });

  it("step 1: a handoff code whose /me carries `impersonation` enters the mode, wins over the cookie and survives a full-page load of the tab", async () => {
    const grants: string[] = [];
    server.use(
      http.post(TOKEN_ENDPOINT, async ({ request }) => {
        const grant = new URLSearchParams(await request.text()).get("grant_type") ?? "";
        grants.push(grant);
        if (grant === "urn:agilityhub:grant:handoff") {
          await delay(20);
          // The api issues no refresh token for an impersonation (R-01-09).
          return HttpResponse.json({
            access_token: "impersonation-access",
            expires_in: 3600,
            scope: "",
            token_type: "Bearer",
          });
        }
        return HttpResponse.json(tokens("access-of-the-admin-as-member"));
      }),
      http.get(`${API_BASE_URL}/me`, ({ request }) =>
        HttpResponse.json(
          request.headers.get("Authorization") === "Bearer impersonation-access"
            ? impersonatedMe
            : memberMe,
        ),
      ),
    );
    const client = new AuthClient({ apiBaseUrl: API_BASE_URL, identityBaseUrl: IDENTITY_BASE_URL });
    const stop = client.startSlidingRefresh();

    // The provider's restore starts while `/entrar?handoff=` redeems the code: it waits for it.
    const [exchanged, restored] = await Promise.all([
      client.exchangeHandoff("impersonation-code"),
      client.restoreSession(),
    ]);
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("pageshow"));
    await settle();
    stop();

    expect(exchanged).toEqual(impersonatedMe);
    expect(restored).toEqual(impersonatedMe);
    expect(grants).toEqual(["urn:agilityhub:grant:handoff"]);
    expect(client.isImpersonated()).toBe(true);
    const next = new AuthClient({ apiBaseUrl: API_BASE_URL, identityBaseUrl: IDENTITY_BASE_URL });
    await expect(next.restoreSession()).resolves.toEqual(impersonatedMe);
    expect(next.getAccessToken()).toBe("impersonation-access");
    expect(next.isImpersonated()).toBe(true);
    expect(grants).toEqual(["urn:agilityhub:grant:handoff"]);
    expect(localStorage).toHaveLength(0);
  });

  it("an impersonation whose expiry has passed is not restored, and «Surt» revokes it with its own token without refreshing", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-28T10:00:00Z"), toFake: ["Date"] });
    let tokenRequests = 0;
    const revokes: string[] = [];
    server.use(
      http.post(TOKEN_ENDPOINT, async ({ request }) => {
        const grant = (await request.formData()).get("grant_type");
        if (grant !== "urn:agilityhub:grant:handoff") tokenRequests += 1;
        return HttpResponse.json({
          access_token: "impersonation-access",
          expires_in: 3600,
          scope: "",
          token_type: "Bearer",
        });
      }),
      http.get(`${API_BASE_URL}/me`, () => HttpResponse.json(impersonatedMe)),
      http.post(REVOKE_ENDPOINT, ({ request }) => {
        revokes.push(request.headers.get("Authorization") ?? "");
        return unauthenticated();
      }),
    );
    const client = new AuthClient({ apiBaseUrl: API_BASE_URL, identityBaseUrl: IDENTITY_BASE_URL });
    await client.exchangeHandoff("impersonation-code");

    vi.setSystemTime(new Date("2026-09-28T11:00:01Z"));
    const reloaded = new AuthClient({
      apiBaseUrl: API_BASE_URL,
      identityBaseUrl: IDENTITY_BASE_URL,
    });
    await expect(reloaded.restoreSession()).resolves.toBeNull();
    expect(reloaded.isImpersonationExpired()).toBe(true);

    await expect(client.logout()).resolves.toBeUndefined();
    expect(revokes).toEqual(["Bearer impersonation-access"]);
    expect(tokenRequests).toBe(0);
    expect(sessionStorage.getItem(IMPERSONATION_STORAGE_KEY)).toBeNull();
  });
});

describe("T-01-11 E4-W16 round 2 #1 (S01 R-01-09, E47): a transient /me failure after a handoff never falls back to the cookie", () => {
  const unavailable = () =>
    HttpResponse.json(
      { code: "INTERNAL_ERROR", details: {}, message: "Unavailable", traceId: "t" },
      { status: 503 },
    );

  /** The handoff grant answers the impersonation token; any other grant is the admin's cookie. */
  function handoffHandlers(me: () => Response) {
    const calls = { grants: [] as string[], me: 0 };
    server.use(
      http.post(TOKEN_ENDPOINT, async ({ request }) => {
        const grant = new URLSearchParams(await request.text()).get("grant_type") ?? "";
        calls.grants.push(grant);
        if (grant === "urn:agilityhub:grant:handoff") {
          return HttpResponse.json({
            access_token: "impersonation-access",
            expires_in: 3600,
            scope: "",
            token_type: "Bearer",
          });
        }
        return HttpResponse.json(tokens("access-of-the-admin-as-member"));
      }),
      http.get(`${API_BASE_URL}/me`, ({ request }) => {
        calls.me += 1;
        if (request.headers.get("Authorization") !== "Bearer impersonation-access") {
          return HttpResponse.json(memberMe);
        }
        return me();
      }),
    );
    return calls;
  }

  /** Wakes the client's backoff at once (`online`) until `done` holds. */
  async function whileRetrying(done: () => boolean) {
    await vi.waitFor(() => {
      if (done()) return;
      window.dispatchEvent(new Event("online"));
      throw new Error("still retrying");
    });
  }

  it("handoff → /me 503 → no refresh_token call; the retry succeeds and the impersonated session (the banner's /me) is entered", async () => {
    let failures = 1;
    const calls = handoffHandlers(() => {
      if (failures > 0) {
        failures -= 1;
        return unavailable();
      }
      return HttpResponse.json(impersonatedMe);
    });
    const client = new AuthClient({ apiBaseUrl: API_BASE_URL, identityBaseUrl: IDENTITY_BASE_URL });
    const stop = client.startSlidingRefresh();

    // The provider's restore starts while `/entrar?handoff=` redeems the code.
    let settled = false;
    const both = Promise.all([
      client.exchangeHandoff("impersonation-code"),
      client.restoreSession(),
    ]);
    void both.finally(() => {
      settled = true;
    });
    await whileRetrying(() => settled);
    const [exchanged, restored] = await both;
    stop();

    expect(exchanged).toEqual(impersonatedMe);
    expect(restored).toEqual(impersonatedMe);
    expect(calls.me).toBe(2);
    expect(calls.grants).toEqual(["urn:agilityhub:grant:handoff"]);
    expect(client.isImpersonated()).toBe(true);
    expect(client.getAccessToken()).toBe("impersonation-access");
    expect(client.hasPendingHandoff()).toBe(false);
  });

  it("/me keeps failing: the exchange rejects but the tab keeps that session, restores never read the cookie (also after a reload), and retryHandoff enters it", async () => {
    let available = false;
    const calls = handoffHandlers(() =>
      available ? HttpResponse.json(impersonatedMe) : unavailable(),
    );
    const client = new AuthClient({ apiBaseUrl: API_BASE_URL, identityBaseUrl: IDENTITY_BASE_URL });
    const stop = client.startSlidingRefresh();
    const signedIn = vi.fn();
    client.addEventListener("signedIn", signedIn);

    let exchangeError: unknown;
    let restoreError: unknown;
    let settled = 0;
    const exchange = client.exchangeHandoff("impersonation-code").catch((error: unknown) => {
      exchangeError = error;
    });
    const restore = client.restoreSession().catch((error: unknown) => {
      restoreError = error;
    });
    void Promise.all([exchange, restore]).then(() => {
      settled = 1;
    });
    await whileRetrying(() => settled === 1);

    // Three tries (the first and two retries), then the page offers a retry.
    expect(calls.me).toBe(3);
    expect(exchangeError).toMatchObject({ status: 503 });
    expect(restoreError).toMatchObject({ status: 503 });
    expect(client.hasPendingHandoff()).toBe(true);
    expect(client.getMe()).toBeNull();
    expect(signedIn).not.toHaveBeenCalled();
    expect(calls.grants).toEqual(["urn:agilityhub:grant:handoff"]);
    // No refresh from the 401 path or the interceptor either.
    await expect(client.recoverFromUnauthorized()).resolves.toBe(false);
    await expect(client.refresh()).rejects.toThrow("never refreshed");

    // A reload of the tab (a new client; the old page's retries stop) asks /me with that token,
    // never the cookie.
    stop();
    const reloaded = new AuthClient({
      apiBaseUrl: API_BASE_URL,
      identityBaseUrl: IDENTITY_BASE_URL,
    });
    const stopReloaded = reloaded.startSlidingRefresh();
    let reloadError: unknown;
    let reloadSettled = false;
    void reloaded
      .restoreSession()
      .catch((error: unknown) => {
        reloadError = error;
      })
      .finally(() => {
        reloadSettled = true;
      });
    await whileRetrying(() => reloadSettled);
    expect(reloadError).toMatchObject({ status: 503 });
    expect(reloaded.hasPendingHandoff()).toBe(true);
    expect(calls.grants).toEqual(["urn:agilityhub:grant:handoff"]);
    stopReloaded();

    available = true;
    await expect(client.retryHandoff()).resolves.toEqual(impersonatedMe);
    expect(signedIn).toHaveBeenCalledOnce();
    expect(client.isImpersonated()).toBe(true);
    expect(client.hasPendingHandoff()).toBe(false);
    expect(calls.grants).toEqual(["urn:agilityhub:grant:handoff"]);
    expect(localStorage).toHaveLength(0);
  });

  it("a refused /me (401) after a redeemed handoff ends it anonymous: no cookie now, nor after a reload, until the user signs in", async () => {
    const calls = handoffHandlers(unauthenticated);
    const client = new AuthClient({ apiBaseUrl: API_BASE_URL, identityBaseUrl: IDENTITY_BASE_URL });

    const [exchanged, restored] = await Promise.allSettled([
      client.exchangeHandoff("impersonation-code"),
      client.restoreSession(),
    ]);

    expect(exchanged).toMatchObject({ reason: { status: 401 }, status: "rejected" });
    expect(restored).toEqual({ status: "fulfilled", value: null });
    expect(client.hasPendingHandoff()).toBe(false);
    expect(calls.me).toBe(1);
    const reloaded = new AuthClient({
      apiBaseUrl: API_BASE_URL,
      identityBaseUrl: IDENTITY_BASE_URL,
    });
    await expect(reloaded.restoreSession()).resolves.toBeNull();
    expect(calls.grants).toEqual(["urn:agilityhub:grant:handoff"]);

    // Signing in on 01 is the user's choice: the tab then holds that session.
    await reloaded.login("biel.roca@example.test", "secret");
    expect(calls.grants).toEqual(["urn:agilityhub:grant:handoff", "password"]);
    expect(sessionStorage.getItem(IMPERSONATION_STORAGE_KEY)).toBeNull();
  });
});

describe("E4-W16 step 3 (INC-19): a transient refresh or restore failure keeps the session", () => {
  const LOGIN_AT = new Date("2026-09-28T10:00:00Z");

  function loginAndRefreshHandlers(refresh: () => Response | Promise<Response>) {
    const counts = { refresh: 0 };
    server.use(
      http.post(TOKEN_ENDPOINT, async ({ request }) => {
        const grant = (await request.formData()).get("grant_type");
        if (grant === "password") return HttpResponse.json(tokens("access-login"));
        counts.refresh += 1;
        return refresh();
      }),
      http.get(`${API_BASE_URL}/me`, () => HttpResponse.json(memberMe)),
    );
    return counts;
  }

  it("a focus or pageshow refreshes only near refreshAt, and visibilitychange too", async () => {
    vi.useFakeTimers({ now: LOGIN_AT, toFake: ["Date"] });
    const counts = loginAndRefreshHandlers(() => HttpResponse.json(tokens("access-rotated")));
    const client = new AuthClient({ apiBaseUrl: API_BASE_URL, identityBaseUrl: IDENTITY_BASE_URL });
    await client.login("biel.roca@example.test", "secret-password");
    const stop = client.startSlidingRefresh();

    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("pageshow"));
    await settle();
    expect(counts.refresh).toBe(0);
    // expires_in 900 s → refreshAt at +840 s; a focus refreshes from 30 s before it.
    vi.setSystemTime(new Date("2026-09-28T10:13:00Z"));
    window.dispatchEvent(new Event("focus"));
    await settle();
    expect(counts.refresh).toBe(0);

    vi.setSystemTime(new Date("2026-09-28T10:13:40Z"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => {
      expect(client.getAccessToken()).toBe("access-rotated");
    });
    expect(counts.refresh).toBe(1);
    stop();
    Reflect.deleteProperty(document, "visibilityState");
  });

  it("offline, then a 5xx: the background refresh keeps the token and retries when the device is back online", async () => {
    vi.useFakeTimers({ now: LOGIN_AT, toFake: ["Date"] });
    const counts = loginAndRefreshHandlers(() => {
      if (counts.refresh === 1) return HttpResponse.error();
      if (counts.refresh === 2) {
        return HttpResponse.json(
          { code: "INTERNAL_ERROR", message: "Unavailable" },
          { status: 503 },
        );
      }
      return HttpResponse.json(tokens("access-rotated"));
    });
    const navigate = vi.fn();
    const client = new AuthClient({
      apiBaseUrl: API_BASE_URL,
      identityBaseUrl: IDENTITY_BASE_URL,
      navigate,
    });
    await client.login("biel.roca@example.test", "secret-password");
    const signedOut = vi.fn();
    client.addEventListener("signedOut", signedOut);
    const stop = client.startSlidingRefresh();

    vi.setSystemTime(new Date("2026-09-28T10:14:00Z"));
    window.dispatchEvent(new Event("pageshow"));
    await vi.waitFor(() => {
      expect(counts.refresh).toBe(1);
    });
    await settle();
    expect(client.getAccessToken()).toBe("access-login");
    expect(client.getMe()).toEqual(memberMe);

    window.dispatchEvent(new Event("online"));
    await vi.waitFor(() => {
      expect(counts.refresh).toBe(2);
    });
    await settle();
    expect(client.getAccessToken()).toBe("access-login");

    window.dispatchEvent(new Event("online"));
    await vi.waitFor(() => {
      expect(client.getAccessToken()).toBe("access-rotated");
    });
    expect(signedOut).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    stop();
  });

  it("a 400 of the token endpoint ends the session and lands on the app's sign-in path (/login in apps/id)", async () => {
    vi.useFakeTimers({ now: LOGIN_AT, toFake: ["Date"] });
    loginAndRefreshHandlers(() =>
      HttpResponse.json({ code: "REFRESH_EXPIRED", message: "Refresh expired" }, { status: 400 }),
    );
    const navigate = vi.fn();
    const client = new AuthClient({
      apiBaseUrl: API_BASE_URL,
      clientId: "id-web",
      identityBaseUrl: IDENTITY_BASE_URL,
      navigate,
      signInPath: "/login",
    });
    await client.login("biel.roca@example.test", "secret-password");
    const stop = client.startSlidingRefresh();

    vi.setSystemTime(new Date("2026-09-28T10:14:00Z"));
    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/login");
    });
    expect(client.getAccessToken()).toBeNull();
    stop();
  });

  it("restoreSession on a 5xx rejects (the session stays unknown) and signs in when the retry succeeds", async () => {
    let refreshes = 0;
    server.use(
      http.post(TOKEN_ENDPOINT, () => {
        refreshes += 1;
        return refreshes === 1
          ? HttpResponse.json({ code: "INTERNAL_ERROR", message: "Unavailable" }, { status: 502 })
          : HttpResponse.json(tokens("access-restored"));
      }),
      http.get(`${API_BASE_URL}/me`, () => HttpResponse.json(memberMe)),
    );
    const client = new AuthClient({ apiBaseUrl: API_BASE_URL, identityBaseUrl: IDENTITY_BASE_URL });
    const signedIn = vi.fn();
    const signedOut = vi.fn();
    client.addEventListener("signedIn", signedIn);
    client.addEventListener("signedOut", signedOut);

    await expect(client.restoreSession()).rejects.toMatchObject({ status: 502 });
    expect(client.getAccessToken()).toBeNull();

    window.dispatchEvent(new Event("online"));
    await vi.waitFor(() => {
      expect(signedIn).toHaveBeenCalledOnce();
    });
    expect(client.getMe()).toEqual(memberMe);
    expect(signedOut).not.toHaveBeenCalled();
  });

  it("the 401 interceptor keeps the session when the refresh fails offline", async () => {
    let loginComplete = false;
    const counts = loginAndRefreshHandlers(() => HttpResponse.error());
    server.use(
      http.get(`${API_BASE_URL}/me`, () =>
        loginComplete ? unauthenticated() : HttpResponse.json(memberMe),
      ),
    );
    const navigate = vi.fn();
    const client = new AuthClient({
      apiBaseUrl: API_BASE_URL,
      identityBaseUrl: IDENTITY_BASE_URL,
      navigate,
    });
    await client.login("biel.roca@example.test", "secret-password");
    loginComplete = true;
    const signedOut = vi.fn();
    client.addEventListener("signedOut", signedOut);
    const apiClient = createAuthenticatedApiClient(client, { baseUrl: API_BASE_URL });

    await expect(apiClient.GET("/me")).rejects.toMatchObject({ status: 401 });

    expect(counts.refresh).toBe(1);
    expect(signedOut).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(client.getAccessToken()).toBe("access-login");
    expect(client.getMe()).toEqual(memberMe);
  });

  it("logout with a rejected bearer refreshes once and retries the revoke, so the cookie is revoked", async () => {
    const counts = loginAndRefreshHandlers(() => HttpResponse.json(tokens("access-rotated")));
    const revokes: string[] = [];
    server.use(
      http.post(REVOKE_ENDPOINT, ({ request }) => {
        const authorization = request.headers.get("Authorization") ?? "";
        revokes.push(authorization);
        return authorization === "Bearer access-rotated"
          ? new HttpResponse(null, { status: 200 })
          : unauthenticated();
      }),
    );
    const client = new AuthClient({ apiBaseUrl: API_BASE_URL, identityBaseUrl: IDENTITY_BASE_URL });
    await client.login("biel.roca@example.test", "secret-password");

    await expect(client.logout()).resolves.toBeUndefined();

    expect(revokes).toEqual(["Bearer access-login", "Bearer access-rotated"]);
    expect(counts.refresh).toBe(1);
    expect(client.getAccessToken()).toBeNull();
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
