import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import brandingCanic from "./mocks/fixtures/branding-canic.json";
import { handlers, mockScenario } from "./mocks/handlers";
import { server } from "./mocks/server";

import {
  ApiError,
  createApiClient,
  createQueryClient,
  isApiError,
  normalizeBranding,
  queryKeys,
} from "./index";

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  server.resetHandlers();
  mockScenario("admin");
});

afterAll(() => {
  server.close();
});

describe("typed API client", () => {
  it("uses the configured base URL and injects locale and authorization headers", async () => {
    let requestUrl = "";
    let language = "";
    let authorization = "";
    server.use(
      http.get("https://club.example.test/api/v1/branding", ({ request }) => {
        requestUrl = request.url;
        language = request.headers.get("Accept-Language") ?? "";
        authorization = request.headers.get("Authorization") ?? "";
        return HttpResponse.json(brandingCanic);
      }),
    );

    const client = createApiClient({
      baseUrl: "https://club.example.test/api/v1",
      getAccessToken: () => "test-access-token",
      getLocale: () => "es",
    });
    const { data } = await client.GET("/branding");

    expect(data?.club.slug).toBe("canic");
    expect(requestUrl).toBe("https://club.example.test/api/v1/branding");
    expect(language).toBe("es");
    expect(authorization).toBe("Bearer test-access-token");
    if (data === undefined) {
      throw new TypeError("Expected a branding payload");
    }
    expect(normalizeBranding(data)).toMatchObject({
      club: { name: "Cànic", slug: "canic" },
      theme: {
        mode: "dark",
        colors: {
          background: brandingCanic.theme.colors.background,
          onPrimary: brandingCanic.theme.colors.onPrimary,
          surfaceAlt: brandingCanic.theme.colors.surfaceAlt,
        },
      },
    });
  });

  it("maps every non-2xx response to ApiError", async () => {
    server.use(
      http.get("https://club.example.test/api/v1/me", () =>
        HttpResponse.json(
          {
            code: "MODULE_DISABLED",
            message: "Module unavailable",
            details: { module: "COURSES" },
            traceId: "trace-test-1",
          },
          { status: 404 },
        ),
      ),
    );
    const client = createApiClient({ baseUrl: "https://club.example.test/api/v1" });

    await expect(client.GET("/me")).rejects.toMatchObject({
      name: "ApiError",
      code: "MODULE_DISABLED",
      message: "Module unavailable",
      details: { module: "COURSES" },
      traceId: "trace-test-1",
      status: 404,
    });
  });

  it("maps a fetch failure to the NETWORK ApiError", async () => {
    const client = createApiClient({
      fetch: () => Promise.reject(new TypeError("offline")),
    });

    try {
      await client.GET("/health");
      throw new TypeError("Expected the request to fail");
    } catch (error) {
      expect(error).toMatchObject({
        name: "ApiError",
        code: "NETWORK",
        message: "offline",
        status: 0,
      });
      expect(isApiError(error)).toBe(true);
      expect(isApiError(error, "NETWORK")).toBe(true);
      expect(isApiError(error, "NOT_FOUND")).toBe(false);
    }
  });

  it("adds a UUID idempotency key to configured POST operations", async () => {
    let idempotencyKey = "";
    server.use(
      http.post("https://id.example.test/oauth2/token", ({ request }) => {
        idempotencyKey = request.headers.get("Idempotency-Key") ?? "";
        return HttpResponse.json({
          access_token: "mock-access-token",
          refresh_token: "mock-refresh-token",
          token_type: "Bearer",
          expires_in: 900,
        });
      }),
    );
    const client = createApiClient({
      baseUrl: "https://id.example.test",
      createIdempotencyKey: () => "123e4567-e89b-42d3-a456-426614174000",
      idempotentPaths: ["/oauth2/token"],
    });

    await client.POST("/oauth2/token", {
      body: {
        grant_type: "password",
        username: "admin@example.test",
        password: "test-password",
      },
      bodySerializer: (body) => new URLSearchParams(body),
    });

    expect(idempotencyKey).toBe("123e4567-e89b-42d3-a456-426614174000");
  });
});

describe("TanStack Query defaults", () => {
  it("uses a 30 second stale time and retries only network and 5xx failures", () => {
    const client = createQueryClient();
    const queries = client.getDefaultOptions().queries;
    const retry = queries?.retry;

    expect(queries?.staleTime).toBe(30_000);
    expect(typeof retry).toBe("function");
    if (typeof retry !== "function") {
      throw new TypeError("Expected the query retry option to be a function");
    }

    expect(retry(0, new ApiError({ code: "NETWORK", message: "offline", status: 0 }))).toBe(true);
    expect(retry(0, new ApiError({ code: "NOT_FOUND", message: "missing", status: 404 }))).toBe(
      false,
    );
    expect(retry(0, new ApiError({ code: "NOT_IMPLEMENTED", message: "down", status: 501 }))).toBe(
      true,
    );
    expect(retry(0, new TypeError("not an API failure"))).toBe(false);
    expect(retry(3, new ApiError({ code: "NETWORK", message: "offline", status: 0 }))).toBe(false);
  });

  it("namespaces query keys by host", () => {
    expect(queryKeys.branding("canic.example.test")).not.toEqual(
      queryKeys.branding("minim.example.test"),
    );
    expect(queryKeys.me("canic.example.test")).toEqual(["api", "canic.example.test", "me"]);
  });
});

describe("MSW bootstrap handlers", () => {
  it("exports the bootstrap and dynamic manifest handlers", () => {
    expect(handlers).toHaveLength(5);
  });

  it("serves branding, current account, token, and health fixtures", async () => {
    mockScenario("member");

    const [brandingResponse, meResponse, tokenResponse, healthResponse] = await Promise.all([
      fetch("https://core.agilitydoghub.com/api/v1/branding"),
      fetch("https://core.agilitydoghub.com/api/v1/me"),
      fetch("https://id.agilitydoghub.com/oauth2/token", { method: "POST" }),
      fetch("https://core.agilitydoghub.com/api/v1/health"),
    ]);

    await expect(brandingResponse.json()).resolves.toMatchObject({
      club: { slug: "canic" },
    });
    expect(brandingResponse.headers.get("ETag")).toBe('"mock-branding-v1"');
    await expect(meResponse.json()).resolves.toMatchObject({
      membership: { roles: ["MEMBER"] },
    });
    await expect(tokenResponse.json()).resolves.toMatchObject({
      token_type: "Bearer",
      expires_in: 900,
    });
    await expect(healthResponse.json()).resolves.toMatchObject({ status: "UP" });
  });
});
