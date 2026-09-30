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

  it("R-06-07 sends an Idempotency-Key on POST /weeks/{id}/generation by default", async () => {
    let idempotencyKey = "";
    server.use(
      http.post("https://core.example.test/api/v1/weeks/:id/generation", ({ request }) => {
        idempotencyKey = request.headers.get("Idempotency-Key") ?? "";
        return HttpResponse.json({ classCount: 0, skipped: [], weekId: "week-1" });
      }),
    );
    const client = createApiClient({
      baseUrl: "https://core.example.test/api/v1",
      createIdempotencyKey: () => "123e4567-e89b-42d3-a456-426614174001",
    });

    await client.POST("/weeks/{id}/generation", {
      body: { saturdayTemplateId: null, weekdayTemplateId: "template-a" },
      // @ts-expect-error The contract types the header as required; the default matcher covers callers that omit it.
      params: { path: { id: "week-1" } },
    });

    expect(idempotencyKey).toBe("123e4567-e89b-42d3-a456-426614174001");
  });

  it("R-06-10 / R-06-11 sends an Idempotency-Key on class cancellations and ring blocks by default", async () => {
    const keys: string[] = [];
    server.use(
      http.post(
        "https://core.example.test/api/v1/class-sessions/:id/cancellation",
        ({ request }) => {
          keys.push(`cancellation:${request.headers.get("Idempotency-Key") ?? ""}`);
          return HttpResponse.json({});
        },
      ),
      http.post("https://core.example.test/api/v1/ring-blocks", ({ request }) => {
        keys.push(`ring-block:${request.headers.get("Idempotency-Key") ?? ""}`);
        return HttpResponse.json({}, { status: 201 });
      }),
      http.post("https://core.example.test/api/v1/ring-blocks/:id/cancellation", ({ request }) => {
        keys.push(`ring-block-cancellation:${request.headers.get("Idempotency-Key") ?? ""}`);
        return HttpResponse.json({});
      }),
    );
    const client = createApiClient({
      baseUrl: "https://core.example.test/api/v1",
      createIdempotencyKey: () => "123e4567-e89b-42d3-a456-426614174002",
    });

    await client.POST("/class-sessions/{id}/cancellation", {
      body: { reason: "CLUB_MANUAL" },
      // @ts-expect-error The contract types the header as required; the default matcher covers callers that omit it.
      params: { path: { id: "class-1" } },
    });
    // @ts-expect-error The contract types the header as required; the default matcher covers callers that omit it.
    await client.POST("/ring-blocks", {
      body: {
        from: "2026-08-12T14:00:00Z",
        kind: "BLOCK",
        reason: "MAINTENANCE",
        ringId: "ring-carretera",
        to: "2026-08-12T16:00:00Z",
      },
    });
    await client.POST("/ring-blocks/{id}/cancellation", {
      body: {},
      params: { path: { id: "block-1" } },
    });

    expect(keys).toEqual([
      "cancellation:123e4567-e89b-42d3-a456-426614174002",
      "ring-block:123e4567-e89b-42d3-a456-426614174002",
      "ring-block-cancellation:",
    ]);
  });

  it("E5-W01 step 0 (S08 §6) sends an Idempotency-Key on the seat hold, the booking, the waitlist entry and the claim", async () => {
    const keys: string[] = [];
    const record =
      (name: string) =>
      ({ request }: { request: Request }) => {
        keys.push(`${name}:${request.headers.get("Idempotency-Key") ?? ""}`);
        return HttpResponse.json({}, { status: 201 });
      };
    server.use(
      http.post("https://core.example.test/api/v1/seat-holds", record("seat-hold")),
      http.post("https://core.example.test/api/v1/bookings", record("booking")),
      http.post("https://core.example.test/api/v1/waitlist-entries", record("waitlist")),
      http.post("https://core.example.test/api/v1/waitlist-entries/:id/claim", record("claim")),
      http.post(
        "https://core.example.test/api/v1/bookings/:id/cancellation",
        record("cancellation"),
      ),
    );
    const client = createApiClient({
      baseUrl: "https://core.example.test/api/v1",
      createIdempotencyKey: () => "123e4567-e89b-42d3-a456-426614174003",
    });

    await client.POST("/seat-holds", { body: { classSessionId: "class-1", dogId: "dog-1" } });
    // @ts-expect-error The contract types the header as required; the default matcher covers callers that omit it.
    await client.POST("/bookings", { body: { seatHoldId: "hold-1" } });
    await client.POST("/waitlist-entries", { body: { classSessionId: "class-1", dogId: "dog-1" } });
    await client.POST("/waitlist-entries/{id}/claim", {
      body: { seatHoldId: "hold-1" },
      // @ts-expect-error The contract types the header as required; the default matcher covers callers that omit it.
      params: { path: { id: "entry-1" } },
    });
    await client.POST("/bookings/{id}/cancellation", {
      body: {},
      params: { path: { id: "booking-1" } },
    });

    expect(keys).toEqual([
      "seat-hold:123e4567-e89b-42d3-a456-426614174003",
      "booking:123e4567-e89b-42d3-a456-426614174003",
      "waitlist:123e4567-e89b-42d3-a456-426614174003",
      "claim:123e4567-e89b-42d3-a456-426614174003",
      "cancellation:",
    ]);
  });

  it("E5-W03 step 0 (R-15-09) sends an Idempotency-Key on a job trigger, never on its switch", async () => {
    const keys: string[] = [];
    const record =
      (name: string) =>
      ({ request }: { request: Request }) => {
        keys.push(`${name}:${request.headers.get("Idempotency-Key") ?? ""}`);
        return HttpResponse.json({});
      };
    server.use(
      http.post("https://core.example.test/api/v1/jobs/:name/trigger", record("trigger")),
      http.put("https://core.example.test/api/v1/jobs/:name/switch", record("switch")),
      http.post(
        "https://core.example.test/api/v1/waitlist-entries/:id/cancellation",
        record("waitlist-removal"),
      ),
    );
    const client = createApiClient({
      baseUrl: "https://core.example.test/api/v1",
      createIdempotencyKey: () => "123e4567-e89b-42d3-a456-426614174004",
    });

    await client.POST("/jobs/{name}/trigger", {
      body: { dryRun: true },
      params: { path: { name: "risk-review" } },
    });
    await client.PUT("/jobs/{name}/switch", {
      body: { enabled: false },
      params: { path: { name: "risk-review" } },
    });
    await client.POST("/waitlist-entries/{id}/cancellation", {
      params: { path: { id: "entry-1" } },
    });

    expect(keys).toEqual([
      "trigger:123e4567-e89b-42d3-a456-426614174004",
      "switch:",
      "waitlist-removal:",
    ]);
  });

  it("E6-W01 step 0 (R-10-04, ruling E46) sends a UUID Idempotency-Key on PUT /class-sessions/{id}/attendance, never on its GET", async () => {
    const keys: string[] = [];
    const record =
      (name: string) =>
      ({ request }: { request: Request }) => {
        keys.push(`${name}:${request.headers.get("Idempotency-Key") ?? ""}`);
        return HttpResponse.json({});
      };
    server.use(
      http.get("https://core.example.test/api/v1/class-sessions/:id/attendance", record("get")),
      http.put("https://core.example.test/api/v1/class-sessions/:id/attendance", record("put")),
    );
    const client = createApiClient({ baseUrl: "https://core.example.test/api/v1" });

    await client.GET("/class-sessions/{id}/attendance", { params: { path: { id: "c1" } } });
    await client.PUT("/class-sessions/{id}/attendance", {
      body: { items: [{ bookingId: "b2", state: "PRESENT" }], version: 4 },
      // @ts-expect-error The contract types the header as required; the default matcher covers callers that omit it.
      params: { path: { id: "c1" } },
    });

    expect(keys[0]).toBe("get:");
    expect(keys[1]).toMatch(
      /^put:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(keys).toHaveLength(2);
  });

  it("E6-W01 step 0 keeps a bare path a POST route and matches a route by method", async () => {
    const keys: string[] = [];
    server.use(
      http.put("https://core.example.test/api/v1/ring-blocks/:id", ({ request }) => {
        keys.push(`put:${request.headers.get("Idempotency-Key") ?? ""}`);
        return HttpResponse.json({});
      }),
      http.delete("https://core.example.test/api/v1/ring-blocks/:id", ({ request }) => {
        keys.push(`delete:${request.headers.get("Idempotency-Key") ?? ""}`);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const client = createApiClient({
      baseUrl: "https://core.example.test/api/v1",
      createIdempotencyKey: () => "123e4567-e89b-42d3-a456-426614174005",
      idempotentPaths: [
        /^\/ring-blocks\/[^/]+$/,
        { method: "DELETE", path: /^\/ring-blocks\/[^/]+$/ },
      ],
    });
    const raw = client as unknown as {
      DELETE: (path: string, init: unknown) => Promise<unknown>;
      PUT: (path: string, init: unknown) => Promise<unknown>;
    };

    await raw.PUT("/ring-blocks/{id}", { body: {}, params: { path: { id: "rb1" } } });
    await raw.DELETE("/ring-blocks/{id}", { params: { path: { id: "rb1" } } });

    expect(keys).toEqual(["put:", "delete:123e4567-e89b-42d3-a456-426614174005"]);
  });

  it("E6-W02 step 0 (ruling E46) sends an Idempotency-Key on the S10 task, observation and attachment writes whose contract declares it, never on their reads nor on the completion", async () => {
    const keys: string[] = [];
    const record =
      (name: string, status = 200) =>
      ({ request }: { request: Request }) => {
        keys.push(`${name}:${request.headers.get("Idempotency-Key") ?? ""}`);
        return status === 204 ? new HttpResponse(null, { status }) : HttpResponse.json({});
      };
    const base = "https://core.example.test/api/v1";
    server.use(
      http.get(`${base}/tasks`, record("list")),
      http.post(`${base}/tasks`, record("create")),
      http.patch(`${base}/tasks/:id`, record("patch")),
      http.delete(`${base}/tasks/:id`, record("delete", 204)),
      http.post(`${base}/tasks/:id/completion`, record("completion")),
      http.post(`${base}/tasks/:id/reopening`, record("reopening")),
      http.put(`${base}/dogs/:id/observations`, record("observations")),
      http.post(`${base}/attachments/upload-url`, record("upload-url")),
      http.post(`${base}/attachments`, record("attach")),
      http.delete(`${base}/attachments/:id`, record("detach", 204)),
    );
    let next = 0;
    const client = createApiClient({
      baseUrl: base,
      createIdempotencyKey: () => {
        next += 1;
        return `123e4567-e89b-42d3-a456-42661417010${String(next)}`;
      },
    });
    const raw = client as unknown as Record<
      "DELETE" | "GET" | "PATCH" | "POST" | "PUT",
      (path: string, init: unknown) => Promise<unknown>
    >;
    const path = (id: string) => ({ params: { path: { id } } });

    await raw.GET("/tasks", { params: { query: { dogId: "dog-duna" } } });
    await raw.POST("/tasks", { body: { dogId: "dog-duna", text: "Balancí" } });
    await raw.PATCH("/tasks/{id}", { ...path("t1"), body: { text: "Balancí", version: 1 } });
    await raw.DELETE("/tasks/{id}", path("t1"));
    await raw.POST("/tasks/{id}/completion", path("t2"));
    await raw.POST("/tasks/{id}/reopening", path("t3"));
    await raw.PUT("/dogs/{id}/observations", {
      ...path("dog-duna"),
      body: { text: "", version: 4 },
    });
    await raw.POST("/attachments/upload-url", {
      body: { fileName: "a.jpg", mimeType: "image/jpeg", purpose: "TASK", sizeBytes: 1 },
    });
    await raw.POST("/attachments", {
      body: { entityId: "t1", entityType: "TASK", fileKey: "k", name: "a.jpg" },
    });
    await raw.DELETE("/attachments/{id}", path("a1"));

    expect(keys).toEqual([
      "list:",
      "create:123e4567-e89b-42d3-a456-426614170101",
      "patch:",
      "delete:123e4567-e89b-42d3-a456-426614170102",
      "completion:",
      "reopening:",
      "observations:123e4567-e89b-42d3-a456-426614170103",
      "upload-url:",
      "attach:123e4567-e89b-42d3-a456-426614170104",
      "detach:123e4567-e89b-42d3-a456-426614170105",
    ]);
  });

  it("E6-W03 step 0 (ruling E46) sends an Idempotency-Key on D14's row read and read-all, never on the list or the counter", async () => {
    const keys: string[] = [];
    const record =
      (name: string, status = 200) =>
      ({ request }: { request: Request }) => {
        keys.push(`${name}:${request.headers.get("Idempotency-Key") ?? ""}`);
        return status === 204 ? new HttpResponse(null, { status }) : HttpResponse.json({});
      };
    const base = "https://core.example.test/api/v1";
    server.use(
      http.get(`${base}/followup`, record("list")),
      http.get(`${base}/followup/unread-count`, record("count")),
      http.post(`${base}/followup/:id/read`, record("read", 204)),
      http.post(`${base}/followup/read-all`, record("read-all", 204)),
    );
    let next = 0;
    const client = createApiClient({
      baseUrl: base,
      createIdempotencyKey: () => {
        next += 1;
        return `123e4567-e89b-42d3-a456-42661417020${String(next)}`;
      },
    });
    const raw = client as unknown as Record<
      "GET" | "POST",
      (path: string, init: unknown) => Promise<unknown>
    >;

    await raw.GET("/followup", {});
    await raw.GET("/followup/unread-count", {});
    await raw.POST("/followup/{id}/read", { params: { path: { id: "f1" } } });
    await raw.POST("/followup/read-all", {});

    expect(keys).toEqual([
      "list:",
      "count:",
      "read:123e4567-e89b-42d3-a456-426614170201",
      "read-all:123e4567-e89b-42d3-a456-426614170202",
    ]);
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
    // E5-W02: + the seven S09 handlers of `training-handlers.ts`.
    // E5-W03: + the 13 back-office handlers of `backoffice-handlers.ts` and the register export.
    // E6-W01: + the four S10 handlers of `attendance-handlers.ts` (20, 21 GET and PUT, 22).
    // E6-W02: + the 14 S10 handlers of `followup-handlers.ts` (25's history, the tasks, the
    // observations, the attachments, their two upload purposes and the mock storage's PUT).
    // E6-W03: + D12's week and its PDF (`attendance-handlers.ts`) and D14's list, counter, row
    // read and read-all (`followup-handlers.ts`).
    expect(handlers).toHaveLength(238);

    const [authorizeResponse, sessionResponse, logoutResponse] = await Promise.all([
      fetch("https://id.agilitydoghub.com/oauth2/authorize?client_id=ar-app", {
        redirect: "manual",
      }),
      fetch("https://id.agilitydoghub.com/oauth2/session", {
        body: JSON.stringify({ flow: "mock-flow" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
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
    await expect(sessionResponse.json()).resolves.toEqual({
      redirectUrl: "/products?authorization=complete",
    });
    expect(logoutResponse.status).toBe(302);
    expect(logoutResponse.headers.get("location")).toBe("https://id.agilitydoghub.com/login");
  });

  it("serves branding, current account, club settings, token, and health fixtures", async () => {
    mockScenario("member");

    const [brandingResponse, meResponse, clubResponse, tokenResponse, healthResponse] =
      await Promise.all([
        fetch("https://core.agilitydoghub.com/api/v1/branding"),
        fetch("https://core.agilitydoghub.com/api/v1/me"),
        fetch("https://core.agilitydoghub.com/api/v1/club"),
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
    const clubSettings = (await clubResponse.json()) as unknown;
    expect(clubSettings).toMatchObject({
      paymentProviders: { SEPA_XML: { configured: true, enabled: true } },
    });
    expect(JSON.stringify(clubSettings).toLocaleLowerCase()).not.toContain("iban");
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
