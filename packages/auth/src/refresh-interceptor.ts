import { createApiClient, type ApiClient, type ApiClientOptions } from "@agilityhub/api-client";

import type { AuthClient } from "./auth-client";

export type AuthenticatedApiClientOptions = Omit<ApiClientOptions, "fetch" | "getAccessToken"> & {
  fetch?: typeof globalThis.fetch;
};

/** Retries a 401 once after AuthClient's single-flight refresh rotation. */
export function createRefreshInterceptor(
  authClient: AuthClient,
  requestFetch: typeof globalThis.fetch = globalThis.fetch,
): typeof globalThis.fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const retrySource = request.clone();
    const response = await requestFetch(request);

    if (response.status !== 401) {
      return response;
    }

    try {
      await authClient.refresh();
    } catch {
      await authClient.handleRefreshFailure();
      return response;
    }

    const headers = new Headers(retrySource.headers);
    const accessToken = authClient.getAccessToken();
    if (accessToken !== null) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }
    return requestFetch(new Request(retrySource, { headers }));
  };
}

export function createAuthenticatedApiClient(
  authClient: AuthClient,
  options: AuthenticatedApiClientOptions = {},
): ApiClient {
  const requestFetch = options.fetch ?? globalThis.fetch;
  return createApiClient({
    ...options,
    fetch: createRefreshInterceptor(authClient, requestFetch),
    getAccessToken: () => authClient.getAccessToken(),
  });
}
