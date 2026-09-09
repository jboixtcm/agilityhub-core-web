import createClient, { type Client, type Middleware } from "openapi-fetch";

import { ApiError, isApiError } from "./api-error";
import type { paths } from "./generated/schema";

const DEFAULT_API_URL = "https://core.agilitydoghub.com/api/v1";
const DEFAULT_IDEMPOTENT_PATHS: readonly (string | RegExp)[] = [
  "/bookings",
  "/training-bookings",
  /^\/waitlist-entries\/[^/]+\/claim$/,
  "/checkout-sessions",
];

type MaybePromise<T> = Promise<T> | T;

export interface ApiClientOptions {
  baseUrl?: string;
  credentials?: RequestCredentials;
  createIdempotencyKey?: () => string;
  fetch?: typeof globalThis.fetch;
  getAccessToken?: () => MaybePromise<null | string | undefined>;
  getLocale?: () => MaybePromise<string>;
  idempotentPaths?: readonly (string | RegExp)[];
  middleware?: readonly Middleware[];
}

export type ApiClient = Client<paths>;

function viteApiUrl(): string | undefined {
  const meta = import.meta as ImportMeta & {
    readonly env?: Record<string, string | undefined>;
  };
  return meta.env?.VITE_API_URL;
}

function currentLocale(): string {
  return typeof navigator === "undefined" ? "ca" : navigator.language;
}

function matchesPath(schemaPath: string, matcher: string | RegExp): boolean {
  return typeof matcher === "string" ? schemaPath === matcher : matcher.test(schemaPath);
}

function requestMiddleware(options: ApiClientOptions): Middleware {
  const matchers = options.idempotentPaths ?? DEFAULT_IDEMPOTENT_PATHS;
  const getLocale = options.getLocale ?? currentLocale;
  const createIdempotencyKey = options.createIdempotencyKey ?? (() => crypto.randomUUID());

  return {
    async onRequest({ request, schemaPath }) {
      if (!request.headers.has("Accept-Language")) {
        request.headers.set("Accept-Language", await getLocale());
      }

      const accessToken = await options.getAccessToken?.();
      if (accessToken !== undefined && accessToken !== null && accessToken !== "") {
        request.headers.set("Authorization", `Bearer ${accessToken}`);
      }

      if (
        request.method === "POST" &&
        !request.headers.has("Idempotency-Key") &&
        matchers.some((matcher) => matchesPath(schemaPath, matcher))
      ) {
        request.headers.set("Idempotency-Key", createIdempotencyKey());
      }

      return request;
    },
  };
}

const errorMiddleware: Middleware = {
  async onResponse({ response }) {
    if (!response.ok) {
      throw await ApiError.fromResponse(response);
    }
    return response;
  },
  onError({ error }) {
    return isApiError(error) ? error : ApiError.network(error);
  },
};

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const client = createClient<paths>({
    baseUrl: options.baseUrl ?? viteApiUrl() ?? DEFAULT_API_URL,
    credentials: options.credentials ?? "include",
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });

  client.use(requestMiddleware(options), ...(options.middleware ?? []), errorMiddleware);
  return client;
}

export const apiClient = createApiClient();
