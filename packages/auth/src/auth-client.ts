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
const REFRESH_MARGIN_MS = 60_000;

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
}

function defaultNavigate(path: string): void {
  if (typeof window !== "undefined") {
    window.location.assign(path);
  }
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
  private readonly fetcher: typeof globalThis.fetch;
  private readonly identityBaseUrl: string;
  private readonly mockRefreshTokenStore: MockRefreshTokenStore | undefined;
  private readonly navigate: (path: string) => void;
  private refreshAt: number | null = null;
  private refreshInFlight: Promise<TokenResponse> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private restoreInFlight: Promise<Me | null> | null = null;
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

  /** Keeps the cookie-backed session sliding while a SessionProvider is mounted. */
  startSlidingRefresh(): () => void {
    this.slidingRefreshActive = true;
    const refreshOnFocus = () => {
      if (this.accessToken !== null) {
        this.refreshInBackground();
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("focus", refreshOnFocus);
    }
    this.scheduleRefresh();

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", refreshOnFocus);
      }
      this.slidingRefreshActive = false;
      this.cancelScheduledRefresh();
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

  async acceptImpersonation(token: string): Promise<Me> {
    this.mockRefreshTokenStore?.clear();
    this.accessToken = token;
    try {
      const me = await this.loadMe();
      this.currentMe = me;
      this.signedOutNotified = false;
      this.dispatchEvent(new Event("signedIn"));
      return me;
    } catch (error) {
      this.clearLocalSession();
      throw error;
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
    try {
      await this.refresh();
      const me = await this.loadMe();
      this.currentMe = me;
      this.dispatchEvent(new Event("signedIn"));
      return me;
    } catch (error) {
      if (isApiError(error) && (error.status === 400 || error.status === 401)) {
        this.clearLocalSession();
        return null;
      }
      throw error;
    }
  }

  async logout(): Promise<void> {
    let failure: Error | undefined;

    try {
      if (this.accessToken !== null) {
        const headers = new Headers({ "Content-Type": "application/json" });
        headers.set("Authorization", `Bearer ${this.accessToken}`);
        const response = await this.routedRequest("/oauth2/revoke", {
          body: JSON.stringify({}),
          headers,
          method: "POST",
        });
        if (!response.ok) {
          failure = await ApiError.fromResponse(response);
        }
      }
    } catch (error) {
      failure = isApiError(error) ? error : ApiError.network(error);
    } finally {
      this.clearLocalSession();
      this.emitSignedOut();
    }

    if (failure !== undefined) {
      throw failure;
    }
  }

  handleRefreshFailure(): void {
    if (this.signedOutNotified) {
      return;
    }
    this.clearLocalSession();
    this.emitSignedOut();
    this.navigate("/entrar");
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
    this.mockRefreshTokenStore?.clear();
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
    void this.refresh().catch(() => {
      this.handleRefreshFailure();
    });
  }

  private scheduleRefresh(): void {
    this.cancelScheduledRefresh();
    if (!this.slidingRefreshActive || this.refreshAt === null) {
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

  private async exchangeOneTimeCode(form: URLSearchParams): Promise<Me> {
    const tokens = await this.issueToken(form);
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
}
