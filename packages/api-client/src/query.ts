import { QueryClient, useQuery } from "@tanstack/react-query";

import { isApiError } from "./api-error";
import { normalizeBranding } from "./branding-cache";
import { apiClient, type ApiClient } from "./client";

const STALE_TIME_MS = 30_000;

interface HookOptions {
  client?: ApiClient;
  host?: string;
}

function currentHost(): string {
  return typeof window === "undefined" ? "server" : window.location.host;
}

function shouldRetry(failureCount: number, error: unknown): boolean {
  return failureCount < 3 && isApiError(error) && (error.code === "NETWORK" || error.status >= 500);
}

export const queryKeys = {
  branding: (host: string) => ["api", host, "branding"] as const,
  me: (host: string) => ["api", host, "me"] as const,
};

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        staleTime: STALE_TIME_MS,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export function useBranding(options: HookOptions = {}) {
  const client = options.client ?? apiClient;
  const host = options.host ?? currentHost();

  return useQuery({
    queryKey: queryKeys.branding(host),
    select: normalizeBranding,
    queryFn: async () => {
      const result = await client.GET("/branding");
      if (result.data === undefined) {
        throw new TypeError("The branding response did not contain data", {
          cause: result.error,
        });
      }
      return result.data;
    },
  });
}

export function useMe(options: HookOptions = {}) {
  const client = options.client ?? apiClient;
  const host = options.host ?? currentHost();

  return useQuery({
    queryKey: queryKeys.me(host),
    queryFn: async () => {
      const result = await client.GET("/me");
      if (result.data === undefined) {
        throw new TypeError("The account response did not contain data", {
          cause: result.error,
        });
      }
      return result.data;
    },
  });
}
