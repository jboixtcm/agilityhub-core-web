import {
  ApiError,
  createApiClient,
  isApiError,
  type ApiClient,
  type components,
} from "@agilityhub/api-client";

import type { MockRefreshTokenStore } from "./mock-refresh-token";
import { accessPathFor, rememberReturnPath } from "./return-path";

const DEFAULT_API_BASE_URL = "/api/v1";
const DEFAULT_IDENTITY_BASE_URL = "";
const DEFAULT_SIGN_IN_PATH = "/entrar";
const REFRESH_MARGIN_MS = 60_000;
/** A focus, `visibilitychange` or `pageshow` refreshes only this close to `refreshAt` (INC-19). */
const FOCUS_REFRESH_SLACK_MS = 30_000;
/** Retries of a refresh or restore that failed without an answer from the api (offline, 5xx). */
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000] as const;
/** `/me` after a handoff: the first try and two retries (2 s, 5 s) before the page offers a retry. */
const HANDOFF_ME_ATTEMPTS = 3;
/** Cookie writers share one queue per identity origin, including different client IDs. */
const COOKIE_LOCK_PREFIX = "agilityhub.session-cookie:";
const cookieQueues = new Map<string, Promise<void>>();

/** An answer belongs to a session that signed out or was replaced while it was in flight. */
class SessionChangedError extends Error {}
/**
 * S01 D10 and R-01-09 (E47): the impersonated session lives in this tab's session storage only
 * (never `localStorage`), so it survives the app's full-page navigations and dies with the tab.
 * It holds the impersonation access token (never refreshed) or the mark that it has expired.
 * A handoff code sent to the token endpoint marks the tab `exchanging` before the request (E4-W18
 * round 2), holds its token as `pending` until `/me` says whose session it is, and `ended` when the
 * api refused it or never answered: in each state the tab never reads the refresh cookie, which
 * may be the admin's own session. A tab reloaded while `exchanging` ends: the code has left the
 * address and may have been redeemed, so it cannot be sent again.
 */
export const IMPERSONATION_STORAGE_KEY = "agilityhub.impersonation";

interface StoredImpersonation {
  expiresAt?: number;
  state: "active" | "ended" | "exchanging" | "expired" | "pending";
  token?: string;
}

interface PendingHandoff {
  expiresAt: number;
  /** BODY (mock) clients only, kept in memory: never in session storage. */
  refreshToken?: string;
  token: string;
}

export type Me = components["schemas"]["Me"];
export type Role = components["schemas"]["Profile"];
export type TokenResponse = components["schemas"]["TokenResponse"];
export type AccountSession = components["schemas"]["Session"];
export type HandoffResponse = components["schemas"]["HandoffResponse"];
export type OidcSessionResponse = components["schemas"]["OidcSessionResponse"];
export type MagicLinkPurpose = components["schemas"]["MagicLinkRequest"]["purpose"];
export type OnboardingRequest = components["schemas"]["OnboardingRequest"];
export type OnboardingState = components["schemas"]["OnboardingState"];
export type UpdateMeRequest = components["schemas"]["AccountPatchRequest"];
export type UpdatePasswordRequest = components["schemas"]["PasswordRequest"];
type AccountLocale = NonNullable<UpdateMeRequest["locale"]>;

/** The `signedOut` event's detail: `expired` when the session ended by itself (E160 #3). */
export interface SignedOutDetail {
  expired: boolean;
}

/** Whether a `signedOut` event is a session that ended by itself rather than a sign-out. */
export function isSessionExpiry(event: Event): boolean {
  return (
    event instanceof CustomEvent &&
    (event.detail as Partial<SignedOutDetail> | null)?.expired === true
  );
}

export interface AuthClientOptions {
  apiBaseUrl?: string;
  clientId?: string;
  fetch?: typeof globalThis.fetch;
  /**
   * What a handoff code opens in this app (E4-W18 step 2). `impersonation` (the member app, the
   * default): «Entra com l'abonat» (E47) — the code's session is held apart until `/me` says whose
   * it is, and a refused or unanswered code leaves the tab anonymous, never the refresh cookie.
   * `account` (the back office): the caller's own account opened from another app (03b) — a usual
   * session, never kept in session storage, whose unanswered `/me` is asked again.
   */
  handoffSessions?: "account" | "impersonation";
  identityBaseUrl?: string;
  mockMode?: boolean;
  mockRefreshTokenStore?: MockRefreshTokenStore;
  navigate?: (path: string) => void;
  /** Where a session that cannot be refreshed lands: `/entrar` (clubs apps), `/login` (id). */
  signInPath?: string;
}

function defaultNavigate(path: string): void {
  if (typeof window !== "undefined") {
    window.location.assign(path);
  }
}

function tabStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

function readStoredImpersonation(): StoredImpersonation | undefined {
  try {
    const raw = tabStorage()?.getItem(IMPERSONATION_STORAGE_KEY);
    if (raw === null || raw === undefined) return undefined;
    const value = JSON.parse(raw) as Partial<StoredImpersonation>;
    if (value.state === "expired" || value.state === "ended" || value.state === "exchanging") {
      return { state: value.state };
    }
    if (
      (value.state === "active" || value.state === "pending") &&
      typeof value.token === "string" &&
      value.token !== ""
    ) {
      return {
        state: value.state,
        token: value.token,
        ...(typeof value.expiresAt === "number" ? { expiresAt: value.expiresAt } : {}),
      };
    }
  } catch {
    // An unreadable entry is no impersonation.
  }
  return undefined;
}

function writeStoredImpersonation(value: StoredImpersonation | undefined): void {
  try {
    const storage = tabStorage();
    if (value === undefined) {
      storage?.removeItem(IMPERSONATION_STORAGE_KEY);
    } else {
      storage?.setItem(IMPERSONATION_STORAGE_KEY, JSON.stringify(value));
    }
  } catch {
    // Without session storage the impersonation lasts until the next full-page load.
  }
}

/**
 * INC-19: only an answer of the token endpoint that refuses the session (`400`/`401`) ends it; a
 * network failure (status 0), a 5xx or any other hiccup keeps the current token until it expires.
 */
function endsSession(error: unknown): boolean {
  return isApiError(error) && (error.status === 400 || error.status === 401);
}

/** No answer from the api (status 0) or a 5xx: worth another try. */
function isTransient(error: unknown): boolean {
  return isApiError(error) && (error.status === 0 || error.status >= 500);
}

/** The next retry: after `delayMs`, or as soon as the device is back online. */
function waitForRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      if (typeof window !== "undefined") window.removeEventListener("online", done);
      resolve();
    };
    const timer = setTimeout(done, delayMs);
    if (typeof window !== "undefined") window.addEventListener("online", done);
  });
}

/** Web Locks coordinate tabs; the fallback still orders all clients within this page. */
async function withCookieLock<T>(name: string, task: () => Promise<T>): Promise<T> {
  const locks =
    typeof navigator === "undefined"
      ? undefined
      : (navigator as Navigator & { locks?: LockManager }).locks;
  if (locks !== undefined && typeof locks.request === "function") {
    return locks.request(name, task);
  }
  const operation = (cookieQueues.get(name) ?? Promise.resolve()).then(task);
  const settled = operation.then(
    () => undefined,
    () => undefined,
  );
  cookieQueues.set(name, settled);
  void settled.then(() => {
    if (cookieQueues.get(name) === settled) cookieQueues.delete(name);
  });
  return operation;
}

function isAccountLocale(locale: string): locale is AccountLocale {
  return locale === "ca" || locale === "es" || locale === "en";
}

function matchesTokenResponse(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const token = value as Partial<Record<keyof TokenResponse, unknown>>;
  return (
    typeof token.access_token === "string" &&
    (token.refresh_token === undefined || typeof token.refresh_token === "string") &&
    typeof token.token_type === "string" &&
    typeof token.expires_in === "number" &&
    (token.scope === undefined || typeof token.scope === "string")
  );
}

export class AuthClient extends EventTarget {
  private accessToken: null | string = null;
  private readonly apiBaseUrl: string;
  private readonly apiClient: ApiClient;
  private readonly clientId: string;
  private currentMe: Me | null = null;
  /** The tokens last accepted, and how many were (a refresh that waited compares, E11-W06 W3). */
  private currentTokens: TokenResponse | null = null;
  private tokenGeneration = 0;
  /** A superseded grant may already have set its cookie; logout must revoke it after it settles. */
  private lastCookieGrant: { token: string | null } | null = null;
  /** Session identity changes, unlike a routine refresh of the same account. */
  private sessionGeneration = 0;
  private sessionTransition = false;
  private exchangeInFlight: Promise<Me> | null = null;
  private readonly fetcher: typeof globalThis.fetch;
  /** `account` mode: the tokens of a redeemed code whose `/me` has not answered yet (kept in memory). */
  private accountHandoffUnconfirmed = false;
  private handoffConfirmation: Promise<Me> | null = null;
  /** A handoff tried in this tab and refused or unanswered: no cookie until someone signs in. */
  private handoffEnded = false;
  /** This page found the tab reloaded while a handoff code was being exchanged (E4-W18 round 2). */
  private handoffInterrupted = false;
  private readonly handoffSessions: "account" | "impersonation";
  private readonly identityBaseUrl: string;
  /** `active`: an impersonated session (never refreshed); `expired`: it ended in this tab. */
  private impersonation: "active" | "expired" | null = null;
  /** A handoff code redeemed in this tab whose `/me` has not answered yet (E47). */
  private pendingHandoff: PendingHandoff | null = null;
  private readonly mockRefreshTokenStore: MockRefreshTokenStore | undefined;
  private readonly navigate: (path: string) => void;
  private refreshAt: number | null = null;
  private refreshInFlight: Promise<TokenResponse> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private restoreInFlight: Promise<Me | null> | null = null;
  private retryAttempt = 0;
  private retryCancel: (() => void) | undefined;
  private readonly signInPath: string;
  private signedOutNotified = false;
  private slidingRefreshActive = false;

  constructor(options: AuthClientOptions = {}) {
    super();
    this.apiBaseUrl = options.apiBaseUrl ?? DEFAULT_API_BASE_URL;
    this.clientId = options.clientId ?? "clubs-app";
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.handoffSessions = options.handoffSessions ?? "impersonation";
    this.identityBaseUrl = options.identityBaseUrl ?? DEFAULT_IDENTITY_BASE_URL;
    if (options.mockRefreshTokenStore !== undefined && options.mockMode !== true) {
      throw new TypeError("The memory refresh-token store is only available in mock mode");
    }
    this.mockRefreshTokenStore = options.mockRefreshTokenStore;
    this.navigate = options.navigate ?? defaultNavigate;
    this.signInPath = options.signInPath ?? DEFAULT_SIGN_IN_PATH;
    this.apiClient = createApiClient({
      baseUrl: this.apiBaseUrl,
      captureRequestGuard: () => this.captureSessionGuard(),
      credentials: "include",
      fetch: this.fetcher,
      getAccessToken: () => this.accessToken,
    });
  }

  getAccessToken(): null | string {
    return this.accessToken;
  }

  getMe(): Me | null {
    return this.currentMe;
  }

  /** Captures identity for an in-flight API request; routine refresh leaves it unchanged. */
  getSessionGeneration(): number {
    return this.sessionGeneration;
  }

  captureSessionGuard(): () => void {
    const generation = this.sessionGeneration;
    return () => {
      this.requireSessionGeneration(generation);
      if (this.sessionTransition) throw new SessionChangedError("The session is changing");
    };
  }

  /** An impersonated session (R-01-09): it is never refreshed and ends when its token expires. */
  isImpersonated(): boolean {
    return this.impersonation === "active";
  }

  /** The impersonated session of this tab has expired («La sessió com l'abonat ha caducat»). */
  isImpersonationExpired(): boolean {
    return this.impersonation === "expired";
  }

  /**
   * A handoff code was redeemed but `/me` keeps failing (offline, 5xx): the tab still holds that
   * session, and `retryHandoff()` asks again. The cookie is never read meanwhile.
   */
  hasPendingHandoff(): boolean {
    return (
      this.pendingHandoff !== null || (this.accountHandoffUnconfirmed && this.currentMe === null)
    );
  }

  /**
   * The tab was reloaded while an «Entra com l'abonat» code was being exchanged (E4-W18 round 2):
   * the code has left the address and may already be redeemed, so it is ended — 01 says the link
   * is no longer valid. False while this page itself is exchanging a code.
   */
  wasHandoffInterrupted(): boolean {
    return (
      this.exchangeInFlight === null &&
      (this.handoffInterrupted || readStoredImpersonation()?.state === "exchanging")
    );
  }

  /** Asks `/me` again for the session a handoff code opened in this tab (with the same backoff). */
  async retryHandoff(): Promise<Me> {
    if (this.pendingHandoff === null && this.currentMe !== null) {
      // A background retry entered it meanwhile.
      return this.currentMe;
    }
    if (this.handoffSessions === "account") {
      return this.confirmAccountHandoff();
    }
    return this.confirmHandoff();
  }

  /**
   * Keeps the cookie-backed session sliding while a SessionProvider is mounted: the timer, and a
   * check when the page comes back (`focus`, `visibilitychange`, `pageshow` — an iOS standalone
   * PWA only fires the last two), which refreshes only when the token is about to expire.
   */
  startSlidingRefresh(): () => void {
    this.slidingRefreshActive = true;
    const refreshWhenDue = () => {
      if (
        this.accessToken !== null &&
        this.impersonation === null &&
        this.refreshAt !== null &&
        Date.now() >= this.refreshAt - FOCUS_REFRESH_SLACK_MS
      ) {
        this.refreshInBackground();
      }
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshWhenDue();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("focus", refreshWhenDue);
      window.addEventListener("pageshow", refreshWhenDue);
      document.addEventListener("visibilitychange", refreshWhenVisible);
    }
    this.scheduleRefresh();

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", refreshWhenDue);
        window.removeEventListener("pageshow", refreshWhenDue);
        document.removeEventListener("visibilitychange", refreshWhenVisible);
      }
      this.slidingRefreshActive = false;
      this.cancelScheduledRefresh();
      this.cancelRetry();
    };
  }

  async login(email: string, password: string): Promise<Me> {
    const generation = this.beginSessionChange();
    const form = new URLSearchParams({
      client_id: this.clientId,
      grant_type: "password",
      password,
      username: email,
    });
    try {
      const tokens = await this.issueToken(form);
      this.requireSessionGeneration(generation);
      this.leaveImpersonation();
      this.acceptTokens(tokens);
      const me = await this.loadMe();
      this.requireSessionGeneration(generation);
      this.currentMe = me;
      this.dispatchEvent(new Event("signedIn"));
      return me;
    } catch (error) {
      if (this.sessionGeneration === generation) this.clearLocalSession();
      throw error;
    }
  }

  async requestMagicLink(
    email: string,
    purpose: MagicLinkPurpose,
    redirectUri?: string,
  ): Promise<void> {
    await this.routedRequest("/auth/magic-link", {
      body: JSON.stringify({
        client_id: this.clientId,
        email,
        purpose,
        ...(redirectUri === undefined ? {} : { redirect_uri: redirectUri }),
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  }

  async exchangeMagicLink(token: string): Promise<Me> {
    return this.exchangeOneTimeCode(
      new URLSearchParams({
        client_id: this.clientId,
        grant_type: "urn:agilityhub:grant:magic-link",
        token,
      }),
      false,
    );
  }

  async exchangeHandoff(token: string): Promise<Me> {
    return this.exchangeOneTimeCode(
      new URLSearchParams({
        client_id: this.clientId,
        grant_type: "urn:agilityhub:grant:handoff",
        token,
      }),
      true,
    );
  }

  /**
   * Enters an impersonated session from its access token (R-01-09): no refresh, ever. The back
   * office enters an AgilityHub support access the same way (S17 R-17-10: a clubs-admin access
   * token without refresh), with the grant's `expiresAt` so a reload after it never asks again.
   */
  async acceptImpersonation(token: string, expiresAt?: string): Promise<Me> {
    this.clearLocalSession();
    const expiry = expiresAt === undefined ? Number.NaN : Date.parse(expiresAt);
    this.enterImpersonation(token, Number.isNaN(expiry) ? undefined : expiry);
    const generation = this.sessionGeneration;
    try {
      const me = await this.loadMe();
      this.requireSessionGeneration(generation);
      this.currentMe = me;
      this.signedOutNotified = false;
      this.dispatchEvent(new Event("signedIn"));
      return me;
    } catch (error) {
      if (this.sessionGeneration === generation) {
        this.leaveImpersonation();
        this.clearLocalSession();
      }
      throw error;
    }
  }

  /**
   * INC-18: the impersonated session has expired (a `401`, or its expiry passed). The tab keeps
   * the mark and says so; it never refreshes, so it never becomes the admin's own session.
   */
  handleImpersonationExpired(): void {
    if (this.impersonation === null) {
      return;
    }
    this.clearLocalSession();
    this.impersonation = "expired";
    writeStoredImpersonation({ state: "expired" });
    this.dispatchEvent(new Event("impersonationExpired"));
  }

  /**
   * The interceptor's `401` path: an impersonated session ends; any other refreshes once. Returns
   * whether a fresh access token is there to retry the request with.
   */
  async recoverFromUnauthorized(generation = this.sessionGeneration): Promise<boolean> {
    if (this.sessionGeneration !== generation) return false;
    if (this.impersonation !== null) {
      this.handleImpersonationExpired();
      return false;
    }
    if (this.holdsHandoffSession()) {
      return false;
    }
    try {
      await this.refresh();
      return this.sessionGeneration === generation;
    } catch (error) {
      if (error instanceof SessionChangedError || this.sessionGeneration !== generation)
        return false;
      if (endsSession(error)) {
        this.handleRefreshFailure();
      } else {
        this.scheduleRetry(() => {
          this.refreshInBackground();
        });
      }
      return false;
    }
  }

  async updatePassword(request: UpdatePasswordRequest): Promise<void> {
    const generation = this.sessionGeneration;
    await this.apiClient.PUT("/me/password", { body: request });
    this.requireSessionGeneration(generation);
    if (this.currentMe !== null) {
      this.currentMe = {
        ...this.currentMe,
        account: { ...this.currentMe.account, hasPassword: true },
      };
      this.dispatchEvent(new Event("signedIn"));
    }
  }

  async updateProfile(activeProfile: Role, remember: boolean): Promise<void> {
    const generation = this.sessionGeneration;
    const result = await this.apiClient.PUT("/me/profile", {
      body: { activeProfile, remember },
    });
    this.requireSessionGeneration(generation);
    if (result.data === undefined) {
      throw new TypeError("The profile response did not contain data", { cause: result.error });
    }
    this.accessToken = result.data.access_token;
    this.tokenGeneration += 1;
    if (this.currentTokens !== null) {
      this.currentTokens = { ...this.currentTokens, access_token: result.data.access_token };
    }
    if (this.currentMe?.membership !== undefined) {
      this.currentMe = {
        ...this.currentMe,
        membership: {
          ...this.currentMe.membership,
          activeProfile,
          rememberProfile: remember,
          ...(remember ? { defaultProfile: activeProfile } : {}),
        },
      };
      this.dispatchEvent(new Event("signedIn"));
    }
  }

  async updateAccount(request: UpdateMeRequest): Promise<Me> {
    const generation = this.sessionGeneration;
    const result = await this.apiClient.PATCH("/me", { body: request });
    this.requireSessionGeneration(generation);
    if (result.data === undefined) {
      throw new TypeError("The account response did not contain data", { cause: result.error });
    }
    this.currentMe = result.data;
    this.dispatchEvent(new Event("signedIn"));
    return result.data;
  }

  async updateLocale(locale: string): Promise<Me> {
    if (!isAccountLocale(locale)) {
      throw new TypeError(`Unsupported account locale: ${locale}`);
    }
    return this.updateAccount({ locale });
  }

  async getOnboarding(): Promise<OnboardingState> {
    const generation = this.sessionGeneration;
    const result = await this.apiClient.GET("/me/onboarding");
    this.requireSessionGeneration(generation);
    if (result.data === undefined) {
      throw new TypeError("The onboarding response did not contain data", {
        cause: result.error,
      });
    }
    this.applyOnboardingState(result.data);
    return result.data;
  }

  async completeOnboarding(request: OnboardingRequest): Promise<OnboardingState> {
    const generation = this.sessionGeneration;
    const result = await this.apiClient.PUT("/me/onboarding", { body: request });
    this.requireSessionGeneration(generation);
    if (result.data === undefined) {
      throw new TypeError("The onboarding response did not contain data", {
        cause: result.error,
      });
    }
    this.applyOnboardingState(result.data, request);
    return result.data;
  }

  async postponeOnboarding(): Promise<OnboardingState> {
    const generation = this.sessionGeneration;
    const result = await this.apiClient.POST("/me/onboarding/postpone");
    this.requireSessionGeneration(generation);
    if (result.data === undefined) {
      throw new TypeError("The onboarding response did not contain data", {
        cause: result.error,
      });
    }
    this.applyOnboardingState(result.data);
    return result.data;
  }

  async listSessions(): Promise<AccountSession[]> {
    const generation = this.sessionGeneration;
    const result = await this.apiClient.GET("/me/sessions");
    this.requireSessionGeneration(generation);
    if (result.data === undefined) {
      throw new TypeError("The sessions response did not contain data", { cause: result.error });
    }
    return result.data;
  }

  async revokeSession(id: string): Promise<void> {
    const generation = this.sessionGeneration;
    await withCookieLock(this.cookieLockName(), async () => {
      this.requireSessionGeneration(generation);
      await this.apiClient.DELETE("/me/sessions/{id}", { params: { path: { id } } });
      this.requireSessionGeneration(generation);
    });
  }

  async createHandoff(targetClientId: string): Promise<HandoffResponse> {
    const generation = this.sessionGeneration;
    const response = await this.routedRequest("/auth/handoff", {
      body: JSON.stringify({ targetClientId }),
      headers: {
        Authorization: `Bearer ${this.accessToken ?? ""}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const payload = (await response.json()) as HandoffResponse;
    this.requireSessionGeneration(generation);
    return payload;
  }

  async resumeOidcFlow(flow: string): Promise<OidcSessionResponse> {
    const generation = this.sessionGeneration;
    const response = await this.routedRequest("/oauth2/session", {
      body: JSON.stringify({ flow } satisfies components["schemas"]["OidcSessionRequest"]),
      headers: {
        Authorization: `Bearer ${this.accessToken ?? ""}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const payload: unknown = await response.json();
    this.requireSessionGeneration(generation);
    if (
      typeof payload !== "object" ||
      payload === null ||
      typeof (payload as Partial<OidcSessionResponse>).redirectUrl !== "string"
    ) {
      throw new TypeError("The OIDC session response did not match the OpenAPI contract");
    }
    return payload as OidcSessionResponse;
  }

  async refresh(): Promise<TokenResponse> {
    if (this.impersonation !== null) {
      throw new TypeError("An impersonated session is never refreshed");
    }
    if (this.holdsHandoffSession()) {
      throw new TypeError("A handoff session is never refreshed before /me answers");
    }
    if (this.refreshInFlight !== null) {
      return this.refreshInFlight;
    }

    const operation = this.performRefresh();
    this.refreshInFlight = operation;
    try {
      return await operation;
    } finally {
      if (this.refreshInFlight === operation) {
        this.refreshInFlight = null;
      }
    }
  }

  async restoreSession(): Promise<Me | null> {
    if (this.currentMe !== null && this.accessToken !== null) {
      return this.currentMe;
    }
    // A one-time code (`/entrar?handoff=`, a magic link) is being redeemed in this tab: its
    // session wins, and the cookie is not read meanwhile (it may be another account's).
    if (this.exchangeInFlight !== null) {
      try {
        return await this.exchangeInFlight;
      } catch (error) {
        if (error instanceof SessionChangedError) return this.currentMe;
        // A redeemed handoff whose `/me` keeps failing is still this tab's session (unknown yet):
        // the provider stays `loading` while it is asked again later.
        if (this.pendingHandoff !== null) {
          this.scheduleRetry(() => {
            this.retryRestore();
          });
          throw error;
        }
        // A refused magic link, or the back office's own handoff (`account`): the usual restore
        // follows. An «Entra com l'abonat» code that failed has ended the tab (below).
      }
    }
    // A handoff tried in this tab and refused or unanswered: never the cookie instead (E47).
    if (this.handoffEnded) {
      return null;
    }
    if (this.restoreInFlight !== null) {
      return this.restoreInFlight;
    }

    const operation = this.performRestoreSession();
    this.restoreInFlight = operation;
    try {
      return await operation;
    } finally {
      if (this.restoreInFlight === operation) {
        this.restoreInFlight = null;
      }
    }
  }

  private async performRestoreSession(): Promise<Me | null> {
    if (this.pendingHandoff !== null) {
      return this.restorePendingHandoff();
    }
    const stored = readStoredImpersonation();
    if (stored?.state === "ended") {
      this.handoffEnded = true;
      return null;
    }
    if (stored?.state === "exchanging") {
      // Reloaded before the token endpoint answered: the code is gone and may be redeemed.
      this.handoffInterrupted = true;
      this.endHandoff();
      return null;
    }
    if (stored?.state === "pending" && stored.token !== undefined) {
      if (stored.expiresAt !== undefined && Date.now() >= stored.expiresAt) {
        this.endHandoff();
        return null;
      }
      this.pendingHandoff = { expiresAt: stored.expiresAt ?? Date.now(), token: stored.token };
      return this.restorePendingHandoff();
    }
    if (stored !== undefined) {
      return this.restoreImpersonation(stored);
    }
    const generation = this.sessionGeneration;
    try {
      await this.refresh();
      if (this.sessionGeneration !== generation) return this.currentMe;
      const me = await this.loadMe();
      if (this.sessionGeneration !== generation) return this.currentMe;
      this.currentMe = me;
      this.retryAttempt = 0;
      this.dispatchEvent(new Event("signedIn"));
      return me;
    } catch (error) {
      if (error instanceof SessionChangedError || this.sessionGeneration !== generation) {
        return this.currentMe;
      }
      if (endsSession(error)) {
        this.clearLocalSession();
        return null;
      }
      // INC-19: offline or a 5xx: the session is still unknown (the provider stays `loading`);
      // try again later and as soon as the device is back online.
      this.scheduleRetry(() => {
        this.retryRestore();
      });
      throw error;
    }
  }

  /** The tab's impersonated session after a full-page load: its token, never the cookie. */
  private async restoreImpersonation(stored: StoredImpersonation): Promise<Me | null> {
    if (
      stored.state === "expired" ||
      stored.token === undefined ||
      (stored.expiresAt !== undefined && Date.now() >= stored.expiresAt)
    ) {
      this.impersonation = "active";
      this.handleImpersonationExpired();
      return null;
    }
    this.enterImpersonation(stored.token, stored.expiresAt);
    const generation = this.sessionGeneration;
    try {
      const me = await this.loadMe();
      if (this.sessionGeneration !== generation) return this.currentMe;
      this.currentMe = me;
      this.signedOutNotified = false;
      this.dispatchEvent(new Event("signedIn"));
      return me;
    } catch (error) {
      if (this.sessionGeneration !== generation) return this.currentMe;
      if (isApiError(error) && error.status === 401) {
        this.handleImpersonationExpired();
        return null;
      }
      this.accessToken = null;
      this.scheduleRetry(() => {
        this.retryRestore();
      });
      throw error;
    }
  }

  /** The tab's redeemed handoff after a page load, or again after `/me` failed: never the cookie. */
  private async restorePendingHandoff(): Promise<Me | null> {
    const generation = this.sessionGeneration;
    try {
      return await this.confirmHandoff();
    } catch (error) {
      if (error instanceof SessionChangedError || this.sessionGeneration !== generation)
        return this.currentMe;
      if (this.pendingHandoff === null) {
        // Refused (the tab ends anonymous), or another sign-in replaced it meanwhile.
        return this.currentMe;
      }
      // Still that session, still unknown: the provider stays `loading` and tries again later.
      this.scheduleRetry(() => {
        this.retryRestore();
      });
      throw error;
    }
  }

  private retryRestore(): void {
    void this.restoreSession().then(
      (me) => {
        if (me === null && this.impersonation === null) {
          this.emitSignedOut();
        }
      },
      () => undefined,
    );
  }

  /**
   * Revokes the session (`POST /oauth2/revoke` with the bearer; the api clears the HttpOnly
   * cookie). A bearer the api rejects (`401`, the access token expired meanwhile) is refreshed once
   * and the revoke retried, so the cookie really is revoked. An impersonated session is revoked
   * with its own token and never refreshed.
   */
  async logout(): Promise<void> {
    const bearer = this.accessToken;
    const impersonated = this.impersonation !== null || this.holdsHandoffSession();
    const impersonationToken = this.impersonation === "active" ? bearer : null;
    const generation = this.beginSessionChange();
    let failure: Error | undefined;

    try {
      await withCookieLock(this.cookieLockName(), async () => {
        this.requireSessionGeneration(generation);
        // A token request already sent when logout began can set the cookie while we wait.
        // Revoke that issued session, even when it was the first login and had no bearer yet.
        const issued = this.lastCookieGrant;
        let token = !impersonated && issued !== null ? issued.token : bearer;
        if (token === null && !impersonated && issued !== null) {
          // Headers can set a cookie even if parsing the token body failed. Ask for its bearer
          // once under the same lock, so logout can still revoke that session.
          try {
            token = (await this.requestToken(this.refreshForm())).access_token;
          } catch (error) {
            if (!endsSession(error)) throw error;
          }
          this.requireSessionGeneration(generation);
        }
        if (token === null) return;
        let response = await this.requestRevoke(token, impersonationToken ?? undefined);
        this.requireSessionGeneration(generation);
        if (response.status === 401 && !impersonated) {
          const refreshed = await this.requestToken(this.refreshForm());
          this.requireSessionGeneration(generation);
          response = await this.requestRevoke(refreshed.access_token);
          this.requireSessionGeneration(generation);
        }
        if (!response.ok && !(impersonated && response.status === 401)) {
          failure = await ApiError.fromResponse(response);
        }
      });
    } catch (error) {
      if (!(error instanceof SessionChangedError)) {
        failure = isApiError(error) ? error : ApiError.network(error);
      }
    } finally {
      if (this.sessionGeneration === generation) {
        this.leaveImpersonation();
        this.clearLocalSession();
        this.emitSignedOut();
      }
    }

    if (failure !== undefined) throw failure;
  }

  /**
   * Ends a one-time impersonated/support session only after the provider accepted its revoke.
   * Unlike the ordinary logout, a network error or 5xx keeps the bearer and the tab-local
   * handoff record so an explicit retry can revoke the same grant (S17 R-17-10).
   * A page loaded with the access only in this tab's storage (a reload of «Surt», a restored tab)
   * restores it first, before the SessionProvider does: a `401` on `/me` means it had already
   * ended, and no answer fails here, so the page never says it ended without revoking it.
   */
  async revokeImpersonation(): Promise<void> {
    if (this.accessToken === null && readStoredImpersonation()?.state === "active") {
      await this.restoreSession();
    }
    if (this.accessToken === null || (this.impersonation === null && !this.holdsHandoffSession())) {
      return;
    }
    // `RevokeRequest.token` = the impersonation or support JWT, which ends its grant. `{}` revokes
    // only the bearer's session (`sid`), and the core then kept a support grant alive.
    const generation = this.sessionGeneration;
    const response = await this.revoke(this.accessToken);
    if (this.sessionGeneration !== generation) return;
    // A 401 means that this one-time grant has already expired or been ended by the club.
    if (!response.ok && response.status !== 401) {
      throw await ApiError.fromResponse(response);
    }
    this.leaveImpersonation();
    this.clearLocalSession();
    this.emitSignedOut();
  }

  handleRefreshFailure(): void {
    if (this.impersonation !== null) {
      this.handleImpersonationExpired();
      return;
    }
    if (this.signedOutNotified) {
      return;
    }
    this.clearLocalSession();
    this.emitSignedOut(true);
    this.navigate(this.expiredSessionPath());
  }

  /**
   * E160 #3 (S01 §2 01, E11-W06 W1): a session that ended by itself keeps the address it was on,
   * as a cold start does — `/entrar?next=…`, mirrored for the magic link's tab. The ID pages
   * (`/login`) have no return path.
   */
  private expiredSessionPath(): string {
    if (this.signInPath !== DEFAULT_SIGN_IN_PATH || typeof window === "undefined") {
      return this.signInPath;
    }
    const requested = `${window.location.pathname}${window.location.search}`;
    rememberReturnPath(requested);
    return accessPathFor(requested);
  }

  /** `token`: the JWT to revoke in the body (`RevokeRequest.token`); without it, the bearer's `sid`. */
  private async revoke(token?: string): Promise<Response> {
    const generation = this.sessionGeneration;
    const bearer = this.accessToken ?? "";
    return withCookieLock(this.cookieLockName(), async () => {
      this.requireSessionGeneration(generation);
      return this.requestRevoke(bearer, token);
    });
  }

  /** Only called while holding the cookie lock (including the logout refresh/revoke retry). */
  private async requestRevoke(bearer: string, token?: string): Promise<Response> {
    const headers = new Headers({ "Content-Type": "application/json" });
    headers.set("Authorization", `Bearer ${bearer}`);
    try {
      const response = await this.fetcher(this.endpointFor("/oauth2/revoke"), {
        body: JSON.stringify(token === undefined ? {} : { token }),
        credentials: "include",
        headers,
        method: "POST",
      });
      if (response.ok) this.lastCookieGrant = null;
      return response;
    } catch (error) {
      throw ApiError.network(error);
    }
  }

  private enterImpersonation(token: string, expiresAt: number | undefined): void {
    this.beginSessionChange();
    this.cancelScheduledRefresh();
    this.cancelRetry();
    this.mockRefreshTokenStore?.clear();
    this.accessToken = token;
    this.sessionTransition = false;
    this.refreshAt = null;
    this.impersonation = "active";
    this.pendingHandoff = null;
    this.handoffEnded = false;
    writeStoredImpersonation({
      state: "active",
      token,
      ...(expiresAt === undefined ? {} : { expiresAt }),
    });
  }

  /** Leaves any one-time session of the tab (impersonation, pending or ended handoff). */
  private leaveImpersonation(): void {
    this.impersonation = null;
    this.pendingHandoff = null;
    this.handoffEnded = false;
    this.handoffInterrupted = false;
    this.accountHandoffUnconfirmed = false;
    writeStoredImpersonation(undefined);
  }

  private holdsHandoffSession(): boolean {
    return this.pendingHandoff !== null || this.handoffEnded;
  }

  /** The api refused the session a handoff opened in this tab: anonymous, and never the cookie. */
  private endHandoff(): void {
    this.clearLocalSession();
    this.pendingHandoff = null;
    this.handoffEnded = true;
    writeStoredImpersonation({ state: "ended" });
  }

  private acceptTokens(tokens: TokenResponse): void {
    this.sessionTransition = false;
    this.tokenGeneration += 1;
    this.currentTokens = tokens;
    this.accessToken = tokens.access_token;
    const lifetimeMs = tokens.expires_in * 1_000;
    this.refreshAt =
      Date.now() + Math.max(1_000, lifetimeMs - Math.min(REFRESH_MARGIN_MS, lifetimeMs / 2));
    if (this.mockRefreshTokenStore !== undefined && tokens.refresh_token !== undefined) {
      this.mockRefreshTokenStore.set(tokens.refresh_token);
    }
    this.signedOutNotified = false;
    this.scheduleRefresh();
  }

  private applyOnboardingState(state: OnboardingState, request?: OnboardingRequest): void {
    if (this.currentMe === null) {
      return;
    }
    this.currentMe = {
      ...this.currentMe,
      account: {
        ...this.currentMe.account,
        onboardingPending: state.pending,
        ...(request?.fields?.locale === undefined ? {} : { locale: request.fields.locale }),
        ...(request?.fields?.name === undefined ? {} : { name: request.fields.name }),
      },
    };
    this.dispatchEvent(new Event("signedIn"));
  }

  private clearLocalSession(): void {
    this.beginSessionChange();
    this.sessionTransition = false;
    this.mockRefreshTokenStore?.clear();
  }

  private beginSessionChange(): number {
    this.sessionTransition = true;
    this.accessToken = null;
    this.currentTokens = null;
    this.currentMe = null;
    this.refreshAt = null;
    this.cancelScheduledRefresh();
    this.cancelRetry();
    this.sessionGeneration += 1;
    this.tokenGeneration += 1;
    // Single-flight handles belong to one identity. Their old settle callbacks compare their
    // own promise before clearing a handle, so they cannot clear newer work.
    this.exchangeInFlight = null;
    this.handoffConfirmation = null;
    this.refreshInFlight = null;
    this.restoreInFlight = null;
    return this.sessionGeneration;
  }

  private requireSessionGeneration(generation: number): void {
    if (this.sessionGeneration !== generation) {
      throw new SessionChangedError("The session changed while its request was pending");
    }
  }

  /** One retry at a time: after the next backoff delay, or as soon as the device is online. */
  private scheduleRetry(action: () => void): void {
    this.cancelRetry();
    const delay = RETRY_DELAYS_MS[Math.min(this.retryAttempt, RETRY_DELAYS_MS.length - 1)];
    this.retryAttempt += 1;
    const run = () => {
      this.cancelRetry();
      action();
    };
    const timer = setTimeout(run, delay);
    if (typeof window !== "undefined") {
      window.addEventListener("online", run);
    }
    this.retryCancel = () => {
      clearTimeout(timer);
      if (typeof window !== "undefined") {
        window.removeEventListener("online", run);
      }
    };
  }

  private cancelRetry(): void {
    this.retryCancel?.();
    this.retryCancel = undefined;
  }

  private cancelScheduledRefresh(): void {
    if (this.refreshTimer !== undefined) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  /** `expired`: the session ended by itself (a refused refresh), not by a sign-out (E160 #3). */
  private emitSignedOut(expired = false): void {
    if (!this.signedOutNotified) {
      this.signedOutNotified = true;
      this.dispatchEvent(new CustomEvent<SignedOutDetail>("signedOut", { detail: { expired } }));
    }
  }

  private cookieLockName(): string {
    const origin = new URL(
      this.endpointFor("/oauth2/token"),
      typeof location === "undefined" ? "http://localhost" : location.href,
    ).origin;
    return `${COOKIE_LOCK_PREFIX}${origin}`;
  }

  private refreshForm(): URLSearchParams {
    return new URLSearchParams({ client_id: this.clientId, grant_type: "refresh_token" });
  }

  private async issueToken(form: URLSearchParams): Promise<TokenResponse> {
    const generation = this.sessionGeneration;
    return withCookieLock(this.cookieLockName(), async () => {
      this.requireSessionGeneration(generation);
      return this.requestToken(form);
    });
  }

  /** The response/cookie finishes before another grant or revoke enters the shared lock. */
  private async requestToken(form: URLSearchParams): Promise<TokenResponse> {
    const previousGrant = this.lastCookieGrant;
    this.lastCookieGrant = { token: null };
    let response: Response;
    try {
      response = await this.fetcher(this.endpointFor("/oauth2/token"), {
        body: form,
        credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        method: "POST",
      });
    } catch (error) {
      throw ApiError.network(error);
    }

    if (!response.ok) {
      // The token endpoint sets its cookie only on success. A refused grant leaves the prior
      // cookie intact; an unreadable successful body remains unknown and needs logout recovery.
      this.lastCookieGrant = previousGrant;
      throw await ApiError.fromResponse(response);
    }
    const payload: unknown = await response.json();
    if (!matchesTokenResponse(payload)) {
      throw new TypeError("The token response did not match the OpenAPI contract");
    }
    const tokens = payload as Omit<TokenResponse, "scope"> & { scope?: string };
    this.lastCookieGrant = { token: tokens.access_token };
    // The core currently omits the OpenAPI-required field when the granted scope set is empty.
    return { ...tokens, scope: tokens.scope ?? "" };
  }

  private async loadMe(): Promise<Me> {
    const result = await this.apiClient.GET("/me");
    if (result.data === undefined) {
      throw new TypeError("The account response did not contain data", { cause: result.error });
    }
    return result.data;
  }

  /**
   * R-01-06: a refresh waits for all previous cookie writers. A superseded refresh never sends
   * the newer account's cookie. The lock also covers accepting its token before the next writer.
   */
  private async performRefresh(): Promise<TokenResponse> {
    const generation = this.tokenGeneration;
    const supersedingTokens = (): TokenResponse | undefined => {
      if (this.tokenGeneration === generation) return undefined;
      const current = this.currentTokens;
      if (
        current !== null &&
        this.accessToken === current.access_token &&
        this.refreshAt !== null &&
        Date.now() < this.refreshAt
      ) {
        return current;
      }
      throw new SessionChangedError("The session changed while its refresh was pending");
    };
    return withCookieLock(this.cookieLockName(), async () => {
      const current = supersedingTokens();
      if (current !== undefined) return current;
      let tokens: TokenResponse;
      try {
        tokens = await this.requestToken(this.refreshForm());
      } catch (error) {
        // A late refusal belongs to the old session, never the newer sign-in.
        const replacement = supersedingTokens();
        if (replacement !== undefined) return replacement;
        throw error;
      }
      const replacement = supersedingTokens();
      if (replacement !== undefined) return replacement;
      this.acceptTokens(tokens);
      return tokens;
    });
  }

  private refreshInBackground(): void {
    if (this.impersonation !== null) {
      return;
    }
    void this.refresh().then(
      () => {
        this.retryAttempt = 0;
      },
      (error: unknown) => {
        if (error instanceof SessionChangedError) return;
        if (endsSession(error)) {
          this.handleRefreshFailure();
        } else if (this.accessToken !== null) {
          this.scheduleRetry(() => {
            this.refreshInBackground();
          });
        }
      },
    );
  }

  private scheduleRefresh(): void {
    this.cancelScheduledRefresh();
    if (!this.slidingRefreshActive || this.refreshAt === null || this.impersonation !== null) {
      return;
    }
    this.refreshTimer = setTimeout(
      () => {
        this.refreshTimer = undefined;
        this.refreshInBackground();
      },
      Math.max(0, this.refreshAt - Date.now()),
    );
  }

  private endpointFor(path: string): string {
    const identityPath =
      path.startsWith("/oauth2/") || path.startsWith("/.well-known/") || path === "/connect/logout";
    const baseUrl = identityPath ? this.identityBaseUrl : this.apiBaseUrl;
    if (baseUrl === "") {
      return path;
    }
    if (baseUrl.startsWith("/")) {
      return `${baseUrl.replace(/\/$/u, "")}/${path.replace(/^\//u, "")}`;
    }
    return new URL(path.replace(/^\//u, ""), `${baseUrl.replace(/\/$/u, "")}/`).href;
  }

  private async routedRequest(path: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetcher(this.endpointFor(path), { ...init, credentials: "include" });
    } catch (error) {
      throw ApiError.network(error);
    }
    if (!response.ok) {
      throw await ApiError.fromResponse(response);
    }
    return response;
  }

  private exchangeOneTimeCode(form: URLSearchParams, handoff: boolean): Promise<Me> {
    const operation = this.performExchange(form, handoff);
    this.exchangeInFlight = operation;
    const settle = () => {
      if (this.exchangeInFlight === operation) {
        this.exchangeInFlight = null;
      }
    };
    operation.then(settle, settle);
    return operation;
  }

  /**
   * A one-time code for this client (`urn:agilityhub:grant:magic-link` or `…:handoff`). A handoff
   * code holds its session until `/me` says whose it is (`confirmHandoff`).
   */
  private async performExchange(form: URLSearchParams, handoff: boolean): Promise<Me> {
    const generation = this.beginSessionChange();
    const impersonationHandoff = handoff && this.handoffSessions === "impersonation";
    // E47 (E4-W18 round 2): the tab gives up the cookie before the code is sent, so a reload while
    // the token endpoint has not answered never restores the admin's own session.
    if (impersonationHandoff) writeStoredImpersonation({ state: "exchanging" });
    let tokens: TokenResponse;
    try {
      tokens = await this.issueToken(form);
      this.requireSessionGeneration(generation);
    } catch (error) {
      this.requireSessionGeneration(generation);
      // E47 (E4-W18 step 1): an «Entra com l'abonat» code tried in this tab and refused, or left
      // unanswered (5xx, offline), leaves the tab anonymous until someone signs in on 01 — never
      // the refresh cookie, which may be the admin's own session.
      if (impersonationHandoff && this.sessionGeneration === generation) this.endHandoff();
      throw error;
    }
    this.leaveImpersonation();
    if (impersonationHandoff) {
      this.clearLocalSession();
      this.holdHandoff({
        expiresAt: Date.now() + tokens.expires_in * 1_000,
        ...(tokens.refresh_token === undefined ? {} : { refreshToken: tokens.refresh_token }),
        token: tokens.access_token,
      });
      return this.confirmHandoff();
    }
    this.acceptTokens(tokens);
    if (handoff) {
      // The back office (`account`): the caller's own session, asked again while `/me` is down.
      return this.confirmAccountHandoff();
    }
    try {
      const me = await this.loadMe();
      this.requireSessionGeneration(generation);
      this.currentMe = me;
      this.dispatchEvent(new Event("signedIn"));
      return me;
    } catch (error) {
      if (this.sessionGeneration === generation) this.clearLocalSession();
      throw error;
    }
  }

  /**
   * E4-W18 step 2: the back office's handoff (`account`) is the caller's own session: its tokens
   * are a usual sliding session in memory (never in session storage). `/me` is asked again on a
   * network error or a 5xx (2 s, 5 s, or at once when online); after that the tab keeps the tokens
   * and `retryHandoff()` asks again. A refusal (any 4xx) drops them.
   */
  private async confirmAccountHandoff(): Promise<Me> {
    const generation = this.sessionGeneration;
    for (let attempt = 1; ; attempt += 1) {
      this.requireSessionGeneration(generation);
      try {
        const me = await this.loadMe();
        this.requireSessionGeneration(generation);
        this.accountHandoffUnconfirmed = false;
        this.currentMe = me;
        this.retryAttempt = 0;
        this.signedOutNotified = false;
        this.dispatchEvent(new Event("signedIn"));
        return me;
      } catch (error) {
        this.requireSessionGeneration(generation);
        if (!isTransient(error)) {
          this.accountHandoffUnconfirmed = false;
          this.clearLocalSession();
          throw error;
        }
        if (attempt >= HANDOFF_ME_ATTEMPTS) {
          this.accountHandoffUnconfirmed = true;
          throw error;
        }
        await waitForRetry(RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[0]);
      }
    }
  }

  private holdHandoff(pending: PendingHandoff): void {
    this.pendingHandoff = pending;
    this.accessToken = pending.token;
    this.sessionTransition = false;
    writeStoredImpersonation({
      expiresAt: pending.expiresAt,
      state: "pending",
      token: pending.token,
    });
  }

  /**
   * S01 R-01-09 (E47): the session a handoff code opened. `/me` is retried on a network error or
   * a 5xx (after 2 s and 5 s, or at once when the device is online) while the tab keeps that
   * token; it never falls back to the cookie. An impersonation (`/me` carries `impersonation`)
   * enters the no-refresh mode with its token's expiry; any other session slides as usual. A
   * refusal (`401`, or any other 4xx) ends it. One confirmation at a time.
   */
  private confirmHandoff(): Promise<Me> {
    if (this.handoffConfirmation !== null) {
      return this.handoffConfirmation;
    }
    const operation = this.performConfirmHandoff();
    this.handoffConfirmation = operation;
    const settle = () => {
      if (this.handoffConfirmation === operation) {
        this.handoffConfirmation = null;
      }
    };
    operation.then(settle, settle);
    return operation;
  }

  private async performConfirmHandoff(): Promise<Me> {
    const generation = this.sessionGeneration;
    for (let attempt = 1; ; attempt += 1) {
      this.requireSessionGeneration(generation);
      const pending = this.pendingHandoff;
      if (pending === null) {
        throw new TypeError("No handoff session to confirm");
      }
      this.accessToken = pending.token;
      try {
        const me = await this.loadMe();
        this.requireSessionGeneration(generation);
        if (this.pendingHandoff !== pending) {
          throw new TypeError("The handoff session changed while /me was answering");
        }
        this.pendingHandoff = null;
        this.cancelRetry();
        this.retryAttempt = 0;
        if (me.impersonation === undefined) {
          writeStoredImpersonation(undefined);
          this.acceptTokens({
            access_token: pending.token,
            expires_in: Math.max(1, Math.round((pending.expiresAt - Date.now()) / 1_000)),
            ...(pending.refreshToken === undefined ? {} : { refresh_token: pending.refreshToken }),
            scope: "",
            token_type: "Bearer",
          });
        } else {
          this.enterImpersonation(pending.token, pending.expiresAt);
        }
        this.currentMe = me;
        this.signedOutNotified = false;
        this.dispatchEvent(new Event("signedIn"));
        return me;
      } catch (error) {
        this.requireSessionGeneration(generation);
        if (this.pendingHandoff !== pending) {
          throw error;
        }
        if (!isTransient(error)) {
          this.endHandoff();
          throw error;
        }
        if (attempt >= HANDOFF_ME_ATTEMPTS) {
          throw error;
        }
        await waitForRetry(RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[0]);
      }
    }
  }
}
