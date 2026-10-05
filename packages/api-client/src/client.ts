import createClient, { type Client, type Middleware } from "openapi-fetch";

import { ApiError, isApiError } from "./api-error";
import type { paths } from "./generated/schema";

const DEFAULT_API_URL = "https://core.agilitydoghub.com/api/v1";

/** A route that takes an `Idempotency-Key`, by method (ruling E46, INC-23). */
export interface IdempotentRoute {
  method: "DELETE" | "POST" | "PUT";
  path: string | RegExp;
}

/** A bare path or pattern is a `POST` route (the matchers written before E6-W01). */
export type IdempotentMatcher = string | RegExp | IdempotentRoute;

const DEFAULT_IDEMPOTENT_PATHS: readonly IdempotentMatcher[] = [
  "/bookings",
  // Not `POST /seat-holds` nor `POST /waitlist-entries`: their contract declares no key (S08 §6,
  // CONVENCIONS_API §7, E79; E7-W07 step 4).
  "/training-bookings",
  /^\/training-bookings\/[^/]+\/cancellation$/,
  /^\/waitlist-entries\/[^/]+\/claim$/,
  /^\/weeks\/[^/]+\/generation$/,
  /^\/class-sessions\/[^/]+\/cancellation$/,
  "/ring-blocks",
  "/checkout-sessions",
  "/signup",
  "/me/dogs/signup",
  /^\/activities\/[^/]+\/(publication|cancellation)$/,
  "/activity-registrations",
  // S15 [Simula] / [Executa ara] (R-15-09).
  /^\/jobs\/[^/]+\/trigger$/,
  // S10 [DESA] of screens 21 and D12 (R-10-04).
  { method: "PUT", path: /^\/class-sessions\/[^/]+\/attendance$/ },
  // S10 screen 26 and D13 (R-10-10…R-10-12): the routes whose contract declares the header. The
  // completion and the reopening do not (they are idempotent by state: `TASK_ALREADY_DONE`).
  "/tasks",
  "/attachments",
  { method: "PUT", path: /^\/dogs\/[^/]+\/observations$/ },
  { method: "DELETE", path: /^\/tasks\/[^/]+$/ },
  { method: "DELETE", path: /^\/attachments\/[^/]+$/ },
  // S10 D14 (R-10-13): a row read and «Marcar-ho tot com a llegit».
  /^\/followup\/[^/]+\/read$/,
  "/followup/read-all",
  // S11 «Enviar comunicat» and its dryRun (R-11-13).
  /^\/message-templates\/[^/]+\/send$/,
  // S12 D6 and the remittances page (R-12-11, R-12-13…R-12-20, R-12-29): every write the contract
  // keys. Not `POST /billing/simulations`: its contract declares no key.
  /^\/billing\/runs$/,
  /^\/billing\/runs\/[^/]+\/(card-charges|rollback)$/,
  /^\/invoices$/,
  /^\/invoices\/payments$/,
  /^\/invoices\/[^/]+\/(payment|failure|retry|refund|cancellation)$/,
  /^\/remittances\/[^/]+\/submission$/,
  // S12/S13 member lifecycle and D10 writes (E8-W02). These callers still use
  // createSubmissionKeys so a retry after a 5xx keeps the payload's key.
  /^\/me\/inactivity-periods$/,
  /^\/me\/inactivity-periods\/[^/]+\/cancellation$/,
  /^\/me\/leave-requests$/,
  /^\/me\/leave-requests\/[^/]+\/cancellation$/,
  /^\/me\/card-setup$/,
  /^\/upfront-payments$/,
  /^\/pack-balances\/[^/]+\/adjustments$/,
  // Not S11's member writes (screen 11's read and read-all, 12's push subscription): their
  // contract declares no Idempotency-Key, and a key goes only where it is declared (CONVENCIONS_API
  // §7, E79; E7-W02 round 2 #8).
];

type MaybePromise<T> = Promise<T> | T;

export interface ApiClientOptions {
  baseUrl?: string;
  credentials?: RequestCredentials;
  createIdempotencyKey?: () => string;
  fetch?: typeof globalThis.fetch;
  getAccessToken?: () => MaybePromise<null | string | undefined>;
  getLocale?: () => MaybePromise<string>;
  idempotentPaths?: readonly IdempotentMatcher[];
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

function matchesPath(schemaPath: string, path: string | RegExp): boolean {
  return typeof path === "string" ? schemaPath === path : path.test(schemaPath);
}

function matchesRoute(method: string, schemaPath: string, matcher: IdempotentMatcher): boolean {
  if (typeof matcher === "string" || matcher instanceof RegExp) {
    return method === "POST" && matchesPath(schemaPath, matcher);
  }
  return method === matcher.method && matchesPath(schemaPath, matcher.path);
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
        !request.headers.has("Idempotency-Key") &&
        matchers.some((matcher) => matchesRoute(request.method, schemaPath, matcher))
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
