import {
  ApiError,
  createApiClient,
  isApiError,
  type ApiClient,
  type components,
} from "@agilityhub/api-client";

import type { MockRefreshTokenStore } from "./mock-refresh-token";

const DEFAULT_API_BASE_URL = "/api/v1";
const DEFAULT_IDENTITY_BASE_URL = "";
const DEFAULT_SIGN_IN_PATH = "/entrar";
const REFRESH_MARGIN_MS = 60_000;
/** A focus, `visibilitychange` or `pageshow` refreshes only this close to `refreshAt` (INC-19). */
const FOCUS_REFRESH_SLACK_MS = 30_000;
/** Retries of a refresh or restore that failed without an answer from the api (offline, 5xx). */
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000] as const;
/**
 * S01 D10 and R-01-09 (E47): the impersonated session lives in this tab's session storage only
 * (never `localStorage`), so it survives the app's full-page navigations and dies with the tab.
 * It holds the impersonation access token (never refreshed) or the mark that it has expired.
 */
export const IMPERSONATION_STORAGE_KEY = "agilityhub.impersonation";

interface StoredImpersonation {
  expiresAt?: number;
  state: "active" | "expired";
  token?: string;
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

export interface AuthClientOptions {
  apiBaseUrl?: string;
  clientId?: string;
  fetch?: typeof globalThis.fetch;
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
    if (value.state === "expired") return { state: "expired" };
    if (value.state === "active" && typeof value.token === "string" && value.token !== "") {
      return {
        state: "active",
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
  private exchangeInFlight: Promise<Me> | null = null;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly identityBaseUrl: string;
  /** `active`: an impersonated session (never refreshed); `expired`: it ended in this tab. */
  private impersonation: "active" | "expired" | null = null;
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
    this.identityBaseUrl = options.identityBaseUrl ?? DEFAULT_IDENTITY_BASE_URL;
    if (options.mockRefreshTokenStore !== undefined && options.mockMode !== true) {
      throw new TypeError("The memory refresh-token store is only available in mock mode");
    }
    this.mockRefreshTokenStore = options.mockRefreshTokenStore;
    this.navigate = options.navigate ?? defaultNavigate;
    this.signInPath = options.signInPath ?? DEFAULT_SIGN_IN_PATH;
    this.apiClient = createApiClient({
      baseUrl: this.apiBaseUrl,
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

  /** An impersonated session (R-01-09): it is never refreshed and ends when its token expires. */
  isImpersonated(): boolean {
    return this.impersonation === "active";
  }

  /** The impersonated session of this tab has expired («La sessió com l'abonat ha caducat»). */
  isImpersonationExpired(): boolean {
    return this.impersonation === "expired";
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
    const form = new URLSearchParams({
      client_id: this.clientId,
      grant_type: "password",
      password,
      username: email,
    });
    const tokens = await this.issueToken(form);
    this.leaveImpersonation();
    this.acceptTokens(tokens);

    try {
      const me = await this.loadMe();
      this.currentMe = me;
      this.dispatchEvent(new Event("signedIn"));
      return me;
    } catch (error) {
      this.clearLocalSession();
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
    );
  }

  async exchangeHandoff(token: string): Promise<Me> {
    return this.exchangeOneTimeCode(
      new URLSearchParams({
        client_id: this.clientId,
        grant_type: "urn:agilityhub:grant:handoff",
        token,
      }),
    );
  }

  /** Enters an impersonated session from its access token (R-01-09): no refresh, ever. */
  async acceptImpersonation(token: string): Promise<Me> {
    this.clearLocalSession();
    this.enterImpersonation(token, undefined);
    try {
      const me = await this.loadMe();
      this.currentMe = me;
      this.signedOutNotified = false;
      this.dispatchEvent(new Event("signedIn"));
      return me;
    } catch (error) {
      this.leaveImpersonation();
      this.clearLocalSession();
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
  async recoverFromUnauthorized(): Promise<boolean> {
    if (this.impersonation !== null) {
      this.handleImpersonationExpired();
      return false;
    }
    try {
      await this.refresh();
      return true;
    } catch (error) {
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
    await this.apiClient.PUT("/me/password", { body: request });
    if (this.currentMe !== null) {
      this.currentMe = {
        ...this.currentMe,
        account: { ...this.currentMe.account, hasPassword: true },
      };
      this.dispatchEvent(new Event("signedIn"));
    }
  }

  async updateProfile(activeProfile: Role, remember: boolean): Promise<void> {
    const result = await this.apiClient.PUT("/me/profile", {
      body: { activeProfile, remember },
    });
    if (result.data === undefined) {
      throw new TypeError("The profile response did not contain data", { cause: result.error });
    }
    this.accessToken = result.data.access_token;
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
    const result = await this.apiClient.PATCH("/me", { body: request });
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
    const result = await this.apiClient.GET("/me/onboarding");
    if (result.data === undefined) {
      throw new TypeError("The onboarding response did not contain data", {
        cause: result.error,
      });
    }
    this.applyOnboardingState(result.data);
    return result.data;
  }

  async completeOnboarding(request: OnboardingRequest): Promise<OnboardingState> {
    const result = await this.apiClient.PUT("/me/onboarding", { body: request });
    if (result.data === undefined) {
      throw new TypeError("The onboarding response did not contain data", {
        cause: result.error,
      });
    }
    this.applyOnboardingState(result.data, request);
    return result.data;
  }

  async postponeOnboarding(): Promise<OnboardingState> {
    const result = await this.apiClient.POST("/me/onboarding/postpone");
    if (result.data === undefined) {
      throw new TypeError("The onboarding response did not contain data", {
        cause: result.error,
      });
    }
    this.applyOnboardingState(result.data);
    return result.data;
  }

  async listSessions(): Promise<AccountSession[]> {
    const result = await this.apiClient.GET("/me/sessions");
    if (result.data === undefined) {
      throw new TypeError("The sessions response did not contain data", { cause: result.error });
    }
    return result.data;
  }

  async revokeSession(id: string): Promise<void> {
    await this.apiClient.DELETE("/me/sessions/{id}", { params: { path: { id } } });
  }

  async createHandoff(targetClientId: string): Promise<HandoffResponse> {
    const response = await this.routedRequest("/auth/handoff", {
      body: JSON.stringify({ targetClientId }),
      headers: {
        Authorization: `Bearer ${this.accessToken ?? ""}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    return (await response.json()) as HandoffResponse;
  }

  async resumeOidcFlow(flow: string): Promise<OidcSessionResponse> {
    const response = await this.routedRequest("/oauth2/session", {
      body: JSON.stringify({ flow } satisfies components["schemas"]["OidcSessionRequest"]),
      headers: {
        Authorization: `Bearer ${this.accessToken ?? ""}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const payload: unknown = await response.json();
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
      } catch {
        // A refused code leaves the tab as it was: the usual restore follows.
      }
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
    const stored = readStoredImpersonation();
    if (stored !== undefined) {
      return this.restoreImpersonation(stored);
    }
    try {
      await this.refresh();
      const me = await this.loadMe();
      this.currentMe = me;
      this.retryAttempt = 0;
      this.dispatchEvent(new Event("signedIn"));
      return me;
    } catch (error) {
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
    try {
      const me = await this.loadMe();
      this.currentMe = me;
      this.signedOutNotified = false;
      this.dispatchEvent(new Event("signedIn"));
      return me;
    } catch (error) {
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
    let failure: Error | undefined;
    const impersonated = this.impersonation !== null;

    try {
      if (this.accessToken !== null) {
        let response = await this.revoke();
        if (response.status === 401 && !impersonated) {
          await this.refresh();
          response = await this.revoke();
        }
        if (!response.ok && !(impersonated && response.status === 401)) {
          failure = await ApiError.fromResponse(response);
        }
      }
    } catch (error) {
      failure = isApiError(error) ? error : ApiError.network(error);
    } finally {
      this.leaveImpersonation();
      this.clearLocalSession();
      this.emitSignedOut();
    }

    if (failure !== undefined) {
      throw failure;
    }
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
    this.emitSignedOut();
    this.navigate(this.signInPath);
  }

  private async revoke(): Promise<Response> {
    const headers = new Headers({ "Content-Type": "application/json" });
    headers.set("Authorization", `Bearer ${this.accessToken ?? ""}`);
    try {
      return await this.fetcher(this.endpointFor("/oauth2/revoke"), {
        body: JSON.stringify({}),
        credentials: "include",
        headers,
        method: "POST",
      });
    } catch (error) {
      throw ApiError.network(error);
    }
  }

  private enterImpersonation(token: string, expiresAt: number | undefined): void {
    this.cancelScheduledRefresh();
    this.cancelRetry();
    this.mockRefreshTokenStore?.clear();
    this.accessToken = token;
    this.refreshAt = null;
    this.impersonation = "active";
    writeStoredImpersonation({
      state: "active",
      token,
      ...(expiresAt === undefined ? {} : { expiresAt }),
    });
  }

  private leaveImpersonation(): void {
    this.impersonation = null;
    writeStoredImpersonation(undefined);
  }

  private acceptTokens(tokens: TokenResponse): void {
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
    this.accessToken = null;
    this.currentMe = null;
    this.refreshAt = null;
    this.cancelScheduledRefresh();
    this.cancelRetry();
    this.mockRefreshTokenStore?.clear();
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

  private emitSignedOut(): void {
    if (!this.signedOutNotified) {
      this.signedOutNotified = true;
      this.dispatchEvent(new Event("signedOut"));
    }
  }

  private async issueToken(form: URLSearchParams): Promise<TokenResponse> {
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
      throw await ApiError.fromResponse(response);
    }
    const payload: unknown = await response.json();
    if (!matchesTokenResponse(payload)) {
      throw new TypeError("The token response did not match the OpenAPI contract");
    }
    const tokens = payload as Omit<TokenResponse, "scope"> & { scope?: string };
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

  private async performRefresh(): Promise<TokenResponse> {
    const tokens = await this.issueToken(
      new URLSearchParams({
        client_id: this.clientId,
        grant_type: "refresh_token",
      }),
    );
    this.acceptTokens(tokens);
    return tokens;
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

  private exchangeOneTimeCode(form: URLSearchParams): Promise<Me> {
    const operation = this.performExchange(form);
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
   * A one-time code for this client (`urn:agilityhub:grant:magic-link` or `…:handoff`). A code
   * that opens an impersonated session (`/me` carries `impersonation`, «Entra com l'abonat»,
   * E47) enters the no-refresh mode with its token's expiry.
   */
  private async performExchange(form: URLSearchParams): Promise<Me> {
    const tokens = await this.issueToken(form);
    this.leaveImpersonation();
    this.acceptTokens(tokens);
    try {
      const me = await this.loadMe();
      if (me.impersonation !== undefined) {
        this.enterImpersonation(tokens.access_token, Date.now() + tokens.expires_in * 1_000);
      }
      this.currentMe = me;
      this.dispatchEvent(new Event("signedIn"));
      return me;
    } catch (error) {
      this.leaveImpersonation();
      this.clearLocalSession();
      throw error;
    }
  }
}
