import {
  ApiError,
  createApiClient,
  isApiError,
  type ApiClient,
  type components,
} from "@agilityhub/api-client";

import { createRefreshTokenStore, type RefreshTokenStore } from "./crypto-store";

const DEFAULT_API_BASE_URL = "https://core.agilitydoghub.com/api/v1";
const DEFAULT_IDENTITY_BASE_URL = "https://id.agilitydoghub.com";

export type Me = components["schemas"]["Me"];
export type Role = components["schemas"]["Profile"];
export type TokenResponse = components["schemas"]["TokenResponse"];
export type AccountSession = components["schemas"]["Session"];
export type HandoffResponse = components["schemas"]["HandoffResponse"];
export type MagicLinkPurpose = components["schemas"]["MagicLinkRequest"]["purpose"];
export type UpdateMeRequest = components["schemas"]["AccountPatchRequest"];
export type UpdatePasswordRequest = components["schemas"]["PasswordRequest"];

export interface AuthClientOptions {
  apiBaseUrl?: string;
  clientId?: string;
  fetch?: typeof globalThis.fetch;
  identityBaseUrl?: string;
  navigate?: (path: string) => void;
  refreshTokenStore?: RefreshTokenStore;
}

function defaultNavigate(path: string): void {
  if (typeof window !== "undefined") {
    window.location.assign(path);
  }
}

function isTokenResponse(value: unknown): value is TokenResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const token = value as Partial<Record<keyof TokenResponse, unknown>>;
  return (
    typeof token.access_token === "string" &&
    (token.refresh_token === undefined || typeof token.refresh_token === "string") &&
    typeof token.token_type === "string" &&
    typeof token.expires_in === "number" &&
    typeof token.scope === "string"
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
  private readonly navigate: (path: string) => void;
  private refreshInFlight: Promise<TokenResponse> | null = null;
  private readonly refreshTokenStore: RefreshTokenStore;
  private signedOutNotified = false;

  constructor(options: AuthClientOptions = {}) {
    super();
    this.apiBaseUrl = options.apiBaseUrl ?? DEFAULT_API_BASE_URL;
    this.clientId = options.clientId ?? "clubs-app";
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.identityBaseUrl = options.identityBaseUrl ?? DEFAULT_IDENTITY_BASE_URL;
    this.navigate = options.navigate ?? defaultNavigate;
    this.refreshTokenStore = options.refreshTokenStore ?? createRefreshTokenStore();
    this.apiClient = createApiClient({
      baseUrl: this.apiBaseUrl,
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

  async login(email: string, password: string): Promise<Me> {
    const form = new URLSearchParams({
      client_id: this.clientId,
      grant_type: "password",
      password,
      username: email,
    });
    const tokens = await this.issueToken(form);
    await this.acceptTokens(tokens);

    try {
      const me = await this.loadMe();
      this.currentMe = me;
      this.dispatchEvent(new Event("signedIn"));
      return me;
    } catch (error) {
      await this.clearLocalSession();
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

  async exchangeHandoff(code: string): Promise<Me> {
    return this.exchangeOneTimeCode(
      new URLSearchParams({
        client_id: this.clientId,
        code,
        grant_type: "urn:agilityhub:grant:handoff",
      }),
    );
  }

  async acceptImpersonation(token: string): Promise<Me> {
    await this.refreshTokenStore.clear();
    this.accessToken = token;
    try {
      const me = await this.loadMe();
      this.currentMe = me;
      this.signedOutNotified = false;
      this.dispatchEvent(new Event("signedIn"));
      return me;
    } catch (error) {
      await this.clearLocalSession();
      throw error;
    }
  }

  async updatePassword(request: UpdatePasswordRequest): Promise<void> {
    await this.apiClient.PUT("/me/password", { body: request });
    if (this.currentMe !== null && this.currentMe.membership !== undefined) {
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
    if (this.currentMe !== null) {
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
    return this.updateAccount({ locale });
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
    if ((await this.refreshTokenStore.get()) === null) {
      return null;
    }

    try {
      await this.refresh();
      const me = await this.loadMe();
      this.currentMe = me;
      this.dispatchEvent(new Event("signedIn"));
      return me;
    } catch (error) {
      if (isApiError(error) && error.status >= 400 && error.status < 500) {
        await this.clearLocalSession();
      }
      throw error;
    }
  }

  async logout(): Promise<void> {
    const refreshToken = await this.refreshTokenStore.get();
    const tokenToRevoke =
      refreshToken ?? (this.currentMe?.impersonation === undefined ? null : this.accessToken);
    let failure: Error | undefined;

    try {
      if (tokenToRevoke !== null) {
        const headers = new Headers({ "Content-Type": "application/json" });
        if (this.accessToken !== null) {
          headers.set("Authorization", `Bearer ${this.accessToken}`);
        }
        const response = await this.routedRequest("/oauth2/revoke", {
          body: JSON.stringify({ token: tokenToRevoke }),
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
      await this.clearLocalSession();
      this.emitSignedOut();
    }

    if (failure !== undefined) {
      throw failure;
    }
  }

  async handleRefreshFailure(): Promise<void> {
    if (this.signedOutNotified) {
      return;
    }
    await this.clearLocalSession();
    this.emitSignedOut();
    this.navigate("/entrar");
  }

  private async acceptTokens(tokens: TokenResponse): Promise<void> {
    this.accessToken = tokens.access_token;
    if (tokens.refresh_token === undefined) {
      await this.refreshTokenStore.clear();
    } else {
      await this.refreshTokenStore.set(tokens.refresh_token);
    }
    this.signedOutNotified = false;
  }

  private async clearLocalSession(): Promise<void> {
    this.accessToken = null;
    this.currentMe = null;
    await this.refreshTokenStore.clear();
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
    if (!isTokenResponse(payload)) {
      throw new TypeError("The token response did not match the OpenAPI contract");
    }
    return payload;
  }

  private async loadMe(): Promise<Me> {
    const result = await this.apiClient.GET("/me");
    if (result.data === undefined) {
      throw new TypeError("The account response did not contain data", { cause: result.error });
    }
    return result.data;
  }

  private async performRefresh(): Promise<TokenResponse> {
    const refreshToken = await this.refreshTokenStore.get();
    if (refreshToken === null) {
      throw new TypeError("No refresh token is available");
    }
    const tokens = await this.issueToken(
      new URLSearchParams({
        client_id: this.clientId,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    );
    await this.acceptTokens(tokens);
    return tokens;
  }

  private endpointFor(path: string): string {
    const identityPath =
      path.startsWith("/oauth2/") ||
      path.startsWith("/.well-known/") ||
      path === "/connect/logout";
    const baseUrl = identityPath ? this.identityBaseUrl : this.apiBaseUrl;
    return new URL(path.replace(/^\//u, ""), `${baseUrl.replace(/\/$/u, "")}/`).href;
  }

  private async routedRequest(path: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetcher(this.endpointFor(path), init);
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
    await this.acceptTokens(tokens);
    try {
      const me = await this.loadMe();
      this.currentMe = me;
      this.dispatchEvent(new Event("signedIn"));
      return me;
    } catch (error) {
      await this.clearLocalSession();
      throw error;
    }
  }
}
