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
    let credentials: RequestCredentials | undefined;
    server.use(
      http.get("https://club.example.test/api/v1/branding", ({ request }) => {
        requestUrl = request.url;
        language = request.headers.get("Accept-Language") ?? "";
        authorization = request.headers.get("Authorization") ?? "";
        credentials = request.credentials;
        return HttpResponse.json(brandingCanic);
      }),
    );

    const client = createApiClient({
      baseUrl: "https://club.example.test/api/v1",
      getAccessToken: () => "test-access-token",
      getLocale: () => "es",
    });
    const { data } = await client.GET("/branding");

    if (data === undefined) {
      throw new TypeError("Expected a branding payload");
    }
    expect(data.club.slug).toBe("canic");
    expect(data.theme.logoUrl).toMatch(/^data:image\/png;base64,/u);
    expect(requestUrl).toBe("https://club.example.test/api/v1/branding");
    expect(language).toBe("es");
    expect(authorization).toBe("Bearer test-access-token");
    expect(credentials).toBe("include");
    expect(normalizeBranding(data)).toMatchObject({
      club: { name: "Club Agility Cànic", slug: "canic" },
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
        client_id: "clubs-app",
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
  it("exports the bootstrap, identity continuation, onboarding, and dynamic manifest handlers", async () => {
    expect(handlers).toHaveLength(88);

    const [authorizeResponse, logoutResponse] = await Promise.all([
      fetch("https://id.agilitydoghub.com/oauth2/authorize?client_id=ar-app", {
        redirect: "manual",
      }),
      fetch(
        "https://id.agilitydoghub.com/connect/logout?post_logout_redirect_uri=https%3A%2F%2Fid.agilitydoghub.com%2Flogin",
        { redirect: "manual" },
      ),
    ]);

    expect(authorizeResponse.status).toBe(302);
    expect(authorizeResponse.headers.get("location")).toBe(
      "https://id.agilitydoghub.com/products?authorization=complete",
    );
    expect(logoutResponse.status).toBe(302);
    expect(logoutResponse.headers.get("location")).toBe("https://id.agilitydoghub.com/login");
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

describe("R-03-22 census list handlers", () => {
  it("paginates members, reports applied filters, and resolves facet labels", async () => {
    const client = createApiClient({ baseUrl: "https://core.agilitydoghub.com/api/v1" });
    const [members, plans] = await Promise.all([
      client.GET("/members", {
        params: {
          query: {
            filter: ["status:eq:ACTIVE", "planId:eq:plan-member"],
            page: 0,
            size: 20,
            sort: ["memberNumber,asc"],
          },
        },
      }),
      client.GET("/members/filter-values", {
        params: {
          query: { field: "planId", filter: ["status:eq:ACTIVE"] },
        },
      }),
    ]);

    expect(members.data).toMatchObject({
      page: 0,
      size: 20,
      totalItems: 184,
      totalPages: 10,
      appliedFilters: [
        { field: "status", op: "eq", value: "ACTIVE" },
        {
          field: "planId",
          label: "Modalitat",
          op: "eq",
          value: "plan-member",
          valueLabel: "Abonat",
        },
      ],
    });
    expect(members.data?.items).toHaveLength(20);
    expect(plans.data?.values).toContainEqual({
      count: 184,
      label: "Abonat",
      value: "plan-member",
    });
  });

  it("serves 242 dogs and rejects unknown filter fields", async () => {
    const client = createApiClient({ baseUrl: "https://core.agilitydoghub.com/api/v1" });
    const dogs = await client.GET("/dogs", {
      params: {
        query: {
          filter: ["status:eq:ACTIVE"],
          page: 0,
          size: 50,
          sort: ["registeredAt,asc"],
        },
      },
    });

    expect(dogs.data).toMatchObject({ totalItems: 242, totalPages: 5 });
    await expect(
      client.GET("/dogs", {
        params: {
          query: {
            filter: ["unknown:eq:value"],
            page: 0,
            size: 50,
            sort: [],
          },
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_FILTER", status: 400 });
  });
});
