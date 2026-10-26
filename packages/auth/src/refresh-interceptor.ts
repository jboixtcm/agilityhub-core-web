import { createApiClient, type ApiClient, type ApiClientOptions } from "@agilityhub/api-client";

import type { AuthClient } from "./auth-client";

export type AuthenticatedApiClientOptions = Omit<
  ApiClientOptions,
  "fetch" | "getAccessToken" | "captureRequestGuard"
> & {
  fetch?: typeof globalThis.fetch;
};

/**
 * Retries a 401 once after AuthClient's single-flight refresh rotation. An impersonated session
 * is never refreshed: its 401 ends the impersonation (INC-18). A refresh that fails without the
 * api refusing the session (offline, 5xx) keeps it and returns the original 401 (INC-19).
 */
export function createRefreshInterceptor(
  authClient: AuthClient,
  requestFetch: typeof globalThis.fetch = globalThis.fetch,
): typeof globalThis.fetch {
  return async (input, init) => {
    const generation = authClient.getSessionGeneration();
    const guard = authClient.captureSessionGuard();
    const request = new Request(input, init);
    const body =
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.clone().arrayBuffer();
    const requestInit: RequestInit = {
      ...(body === undefined ? {} : { body }),
      credentials: "include",
      headers: new Headers(request.headers),
      method: request.method,
      signal: request.signal,
    };
    guard();
    const response = await requestFetch(request.url, requestInit);

    if (response.status !== 401) {
      guard();
      return response;
    }

    if (
      authClient.getSessionGeneration() !== generation ||
      !(await authClient.recoverFromUnauthorized(generation)) ||
      authClient.getSessionGeneration() !== generation
    ) {
      return response;
    }

    const headers = new Headers(request.headers);
    const accessToken = authClient.getAccessToken();
    if (accessToken !== null) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }
    const retried = await requestFetch(request.url, { ...requestInit, headers });
    guard();
    return retried;
  };
}

export function createAuthenticatedApiClient(
  authClient: AuthClient,
  options: AuthenticatedApiClientOptions = {},
): ApiClient {
  const requestFetch = options.fetch ?? globalThis.fetch;
  return createApiClient({
    ...options,
    captureRequestGuard: () => authClient.captureSessionGuard(),
    credentials: "include",
    fetch: createRefreshInterceptor(authClient, requestFetch),
    getAccessToken: () => authClient.getAccessToken(),
  });
}
