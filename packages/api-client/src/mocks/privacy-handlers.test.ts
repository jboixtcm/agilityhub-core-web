import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApiClient, isApiError } from "../index";

import { MOCK_SUPPORT_TOKEN } from "./console-handlers";
import { mockScenario, resetAuditMockState, resetCensusRecordState } from "./handlers";
import { server } from "./server";

let client = createApiClient({ baseUrl: "https://core.example.test/api/v1" });

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

beforeEach(() => {
  client = createApiClient({ baseUrl: "https://core.example.test/api/v1" });
});

afterEach(() => {
  server.resetHandlers();
  resetAuditMockState();
  resetCensusRecordState();
  mockScenario("admin");
});

afterAll(() => {
  server.close();
});

async function failure(call: Promise<unknown>) {
  try {
    await call;
  } catch (cause) {
    if (isApiError(cause)) return cause;
    throw cause;
  }
  throw new Error("Expected the API call to fail");
}

describe("S14 privacy mock contract", () => {
  it("T-14-17 queues MEMBER_DATA, enforces 24 h and refuses impersonation like the api", async () => {
    mockScenario("member");
    const first = await client.POST("/me/data-export");
    expect(first.response.status).toBe(202);
    expect(first.data?.jobId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(first.data?.statusUrl).toMatch(/^\/api\/v1\/exports\//u);
    const second = await failure(client.POST("/me/data-export"));
    expect(second).toMatchObject({ code: "DATA_EXPORT_TOO_SOON", details: {}, status: 422 });

    resetAuditMockState();
    mockScenario("impersonated");
    const refused = await failure(client.POST("/me/data-export"));
    expect(refused).toMatchObject({ code: "IMPERSONATION_DENIED", details: {}, status: 403 });
  });

  it("T-14-18 returns 422 ERASURE_BLOCKED reasons for ACTIVE and schedules/cancels LEFT", async () => {
    const blocked = await failure(
      client.POST("/members/{id}/erasure", {
        body: {},
        params: { path: { id: "member-laura" } },
      }),
    );
    expect(blocked).toMatchObject({
      code: "ERASURE_BLOCKED",
      details: { reasons: ["MEMBER_NOT_LEFT"] },
      status: 422,
    });

    mockScenario("memberLeft");
    const created = await client.POST("/members/{id}/erasure", {
      body: { reason: "Petició presencial" },
      params: { path: { id: "member-laura" } },
    });
    expect(created.response.status).toBe(201);
    expect(created.data).toEqual({
      accountId: "10000000-0000-4000-8000-000000000002",
      blockReasons: [],
      clubId: "50000000-0000-4000-8000-000000000001",
      clubIds: ["50000000-0000-4000-8000-000000000001"],
      executeAt: "2026-10-31T09:00:00Z",
      id: "72000000-0000-4000-8000-000000000001",
      memberIds: ["member-laura"],
      reason: "Petició presencial",
      requestedAt: "2026-10-18T09:00:00Z",
      requestedByAccountId: "10000000-0000-4000-8000-000000000001",
      scope: "MEMBER",
      source: "ADMIN",
      status: "SCHEDULED",
      version: 1,
    });
    const duplicate = await failure(
      client.POST("/members/{id}/erasure", {
        body: {},
        params: { path: { id: "member-laura" } },
      }),
    );
    expect(duplicate).toMatchObject({ code: "ERASURE_ALREADY_REQUESTED", status: 409 });
    const cancelled = await client.DELETE("/members/{id}/erasure", {
      params: { path: { id: "member-laura" } },
    });
    expect(cancelled.response.status).toBe(204);
  });

  it("R-14-18 returns the complete append-only consent history without inventing nulls", async () => {
    const response = await client.GET("/members/{id}/consents", {
      params: { path: { id: "member-laura" } },
    });
    expect(response.data).toEqual([
      {
        at: "2023-02-14T10:00:00Z",
        granted: true,
        locale: "ca",
        source: "SIGNUP",
        type: "PRIVACY_POLICY",
        version: "2023-01",
      },
      {
        at: "2026-09-01T08:15:00Z",
        granted: false,
        ipHash: "mock-ip-hash",
        locale: "ca",
        source: "PROFILE",
        type: "IMAGE_USE",
        version: "2026-09",
      },
    ]);
  });

  it("T-14-17 another account reads none of the member's package: GET /exports/{id} and its file are 404, and the list leaves it out", async () => {
    mockScenario("member");
    const queued = await client.POST("/me/data-export");
    const jobId = queued.data?.jobId ?? "";
    expect((await client.GET("/exports/{id}", { params: { path: { id: jobId } } })).data?.id).toBe(
      jobId,
    );

    // «Pau → 404»: a second member of the club (the multi-profile account) asks for Laura's job.
    mockScenario("multiProfile");
    const other = await failure(client.GET("/exports/{id}", { params: { path: { id: jobId } } }));
    expect(other).toMatchObject({ code: "NOT_FOUND", details: {}, status: 404 });
    const otherFile = await failure(
      client.GET("/exports/{id}/download", {
        params: { path: { id: jobId }, query: { expires: 0, signature: "x" } },
      }),
    );
    expect(otherFile).toMatchObject({ code: "NOT_FOUND", status: 404 });
    const list = await client.GET("/exports", { params: { query: { kind: "MEMBER_DATA" } } });
    expect(list.data?.map((job) => job.id)).not.toContain(jobId);
  });

  it("R-17-10 closes the admin data package to a support access with 403 SUPPORT_RESTRICTED", async () => {
    const support = createApiClient({
      baseUrl: "https://core.example.test/api/v1",
      getAccessToken: () => MOCK_SUPPORT_TOKEN,
    });
    const refused = await failure(
      support.POST("/members/{id}/data-export", {
        body: { deliverToMember: false },
        params: { path: { id: "member-laura" } },
      }),
    );
    expect(refused).toMatchObject({ code: "SUPPORT_RESTRICTED", status: 403 });
  });

  it("INC-73 (S01 §6, E11-T09): PATCH /me refuses an impersonation token with 403 IMPERSONATION_DENIED", async () => {
    mockScenario("impersonated");
    const refused = await failure(client.PATCH("/me", { body: { locale: "es" } }));
    expect(refused).toMatchObject({ code: "IMPERSONATION_DENIED", details: {}, status: 403 });
    mockScenario("member");
    expect((await client.PATCH("/me", { body: { locale: "es" } })).data?.account.locale).toBe("es");
  });
});
