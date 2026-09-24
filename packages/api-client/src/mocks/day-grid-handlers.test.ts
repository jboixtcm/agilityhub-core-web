import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApiClient } from "../client";

import { mockScenario, resetPlanningState } from "./handlers";
import { server } from "./server";

let client = createApiClient({ baseUrl: "https://core.example.test/api/v1" });

const classId = "dg-cls-2026-08-03-1850-ring-central";
const cancelledClassId = "dg-cls-2026-08-03-1740-ring-muntanya";
const blockId = "dg-block-2026-08-03-1600-ring-carretera";

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  resetPlanningState();
  client = createApiClient({ baseUrl: "https://core.example.test/api/v1" });
});
afterEach(() => {
  server.resetHandlers();
  resetPlanningState();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

const getClass = (id: string) =>
  client.GET("/class-sessions/{id}", { params: { path: { id } } }).then(({ data }) => data);
const getBlock = (id: string) =>
  client.GET("/ring-blocks/{id}", { params: { path: { id } } }).then(({ data }) => data);
const cancelBlock = (id: string) =>
  client.POST("/ring-blocks/{id}/cancellation", { body: {}, params: { path: { id } } });
const dayGrid = (date: string, view: "instructor" | "member") =>
  client.GET("/day-grid", { params: { query: { date, view } } }).then(({ data }) => data);

describe("E4-W03 day-grid MSW handlers: roles, impersonation and tenant (S06 §6, MATRIU_PERMISOS)", () => {
  it("gives staff the instructor projection of a class and the full block", async () => {
    mockScenario("instructor");
    expect(await getClass(classId)).toMatchObject({ counters: { booked: 5, waiting: 2 } });
    expect(await getBlock(blockId)).toMatchObject({ createdByName: "Marc" });
  });

  it.each(["member", "impersonated"] as const)(
    "gives the %s the member projection of a class, never a cancelled one",
    async (scenario) => {
      mockScenario(scenario);
      const view = await getClass(classId);
      expect(view).toMatchObject({ displayDescription: "B+C", freeSeats: 0, waiting: 2 });
      expect(view).not.toHaveProperty("counters");
      expect(view).not.toHaveProperty("instructorIds");
      expect(view).not.toHaveProperty("atRisk");
      await expect(getClass(cancelledClassId)).rejects.toMatchObject({
        code: "NOT_FOUND",
        status: 404,
      });
    },
  );

  it("redacts the block for a member (no note, no author) and denies the impersonation", async () => {
    mockScenario("member");
    const view = await getBlock(blockId);
    expect(view).toMatchObject({ id: blockId, reason: "MAINTENANCE" });
    expect(view).not.toHaveProperty("note");
    expect(view).not.toHaveProperty("createdByName");
    mockScenario("impersonated");
    await expect(getBlock(blockId)).rejects.toMatchObject({
      code: "IMPERSONATION_DENIED",
      status: 403,
    });
  });

  it("answers 403 to a member or an impersonation cancelling a block, which stays active", async () => {
    mockScenario("member");
    await expect(cancelBlock(blockId)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    mockScenario("impersonated");
    await expect(cancelBlock(blockId)).rejects.toMatchObject({
      code: "IMPERSONATION_DENIED",
      status: 403,
    });
    mockScenario("instructor");
    expect(await getBlock(blockId)).toMatchObject({ state: "ACTIVE" });
    expect((await cancelBlock(blockId)).data).toMatchObject({ state: "CANCELLED" });
  });

  it("answers 403 to the instructor view for a member and for an impersonation", async () => {
    mockScenario("member");
    await expect(dayGrid("2026-08-03", "instructor")).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    mockScenario("impersonated");
    await expect(dayGrid("2026-08-03", "instructor")).rejects.toMatchObject({
      code: "IMPERSONATION_DENIED",
      status: 403,
    });
    expect((await dayGrid("2026-08-04", "member"))?.rows.length).toBeGreaterThan(0);
  });

  it("scopes the fixtures to their club: another tenant gets 404 and empty days", async () => {
    mockScenario("minimalAdmin");
    await expect(getClass(classId)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    await expect(getBlock(blockId)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    await expect(cancelBlock(blockId)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(await dayGrid("2026-08-03", "instructor")).toMatchObject({ columns: [], rows: [] });
    mockScenario("minimal");
    expect(await dayGrid("2026-08-04", "member")).toMatchObject({ columns: [], rows: [] });
  });

  it.each(["2026-13-01", "2026-08-32", "2026-02-30", "hola"])(
    "answers 400 VALIDATION_ERROR to date=%s",
    async (date) => {
      mockScenario("member");
      await expect(dayGrid(date, "member")).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        status: 400,
      });
    },
  );
});
