import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createApiClient } from "../client";
import { requestExport } from "../exports";

import { mockScenario, resetActivityState, resetAuditMockState } from "./handlers";
import { exportQueued, mockExportBody, SYNC_MAX_ROWS } from "./list-exports";
import { server } from "./server";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
// 10:25 in Madrid (CEST) on Tuesday 4 August 2026.
const now = new Date("2026-08-04T08:25:00Z");
const query = { columns: "", filter: [], sort: [] };
const LISTS = [
  ["members", "/members/export", "00000000-0000-4000-8000-000000000403"],
  ["dogs", "/dogs/export", "00000000-0000-4000-8000-000000000404"],
  ["audit-entries", "/audit-entries/export", "00000000-0000-4000-8000-000000000402"],
  ["activities", "/activities/export", "00000000-0000-4000-8000-000000000407"],
  [
    "activity-registrations",
    "/activity-registrations/export",
    "00000000-0000-4000-8000-000000000408",
  ],
] as const;

let client = createApiClient({ baseUrl: "https://core.example.test/api/v1" });

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  client = createApiClient({ baseUrl: "https://core.example.test/api/v1" });
});
beforeEach(() => {
  vi.useFakeTimers({ now, toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
  server.resetHandlers();
  resetAuditMockState();
  resetActivityState();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

describe("E4-W07 MSW list exports answer like the api (R-14-12, CONVENCIONS_API §4)", () => {
  it.each(
    LISTS.flatMap(([listKey, path]) => [
      [listKey, path, "xlsx"] as const,
      [listKey, path, "pdf"] as const,
    ]),
  )(
    "%s %s: 200 with the file, its Content-Type and the api's file name",
    async (listKey, path, format) => {
      const response = await fetch(`https://core.example.test/api/v1${path}?format=${format}`);

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe(
        format === "pdf" ? "application/pdf" : XLSX,
      );
      expect(response.headers.get("Content-Disposition")).toBe(
        `attachment; filename="canic_${listKey}_20260804-1025.${format}"`,
      );
      const bytes = new Uint8Array(await response.arrayBuffer());
      expect(bytes).toEqual(mockExportBody(format));
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe(
        format === "pdf" ? "%PDF-" : "PK\u0003\u0004\u0014",
      );
    },
  );

  it.each(LISTS)(
    "%s: the exportsQueued switch answers 202 {jobId, statusUrl} and the drawer's job turns READY with the api's name",
    async (listKey, path, jobId) => {
      mockScenario("adminExportsQueued");

      await expect(requestExport(client, path, { ...query, format: "pdf" })).resolves.toEqual({
        jobId,
        kind: "queued",
      });
      const queued: unknown = await (
        await fetch(`https://core.example.test/api/v1/exports/${jobId}`)
      ).json();
      expect(queued).toMatchObject({ format: "PDF", listKey, status: "QUEUED" });

      await fetch("https://core.example.test/api/v1/exports?kind=LIST");
      const jobs = (await (
        await fetch("https://core.example.test/api/v1/exports?kind=LIST")
      ).json()) as { fileName?: string; id: string; rows?: number; status: string }[];
      const ready = jobs.find((job) => job.id === jobId);
      // `createdAt` 2026-08-03T10:25:00Z is 12:25 in Madrid.
      expect(ready).toMatchObject({
        fileName: `canic_${listKey}_20260803-1225.pdf`,
        status: "READY",
      });
      expect(ready?.rows).toBeGreaterThanOrEqual(0);

      const download = await fetch(`https://core.example.test/api/v1/exports/${jobId}/download`);
      expect(download.headers.get("Content-Disposition")).toBe(
        `attachment; filename="canic_${listKey}_20260803-1225.pdf"`,
      );
      expect(new Uint8Array(await download.arrayBuffer())).toEqual(mockExportBody("pdf"));
    },
  );

  it("queues above ExportPolicy.syncMaxRows (5000) and answers inline up to it", () => {
    expect(SYNC_MAX_ROWS).toBe(5_000);
    expect(exportQueued(5_000)).toBe(false);
    expect(exportQueued(5_001)).toBe(true);
  });

  it("the registrants export applies q and activityId like the list, and refuses an unknown filter", async () => {
    const all = await client.GET("/activities/{id}/registrations", {
      params: { path: { id: "activity-taller-contactes" }, query: { size: 50 } },
    });
    const first = all.data?.items[0]?.member?.fullName ?? "";
    const searched = await client.GET("/activities/{id}/registrations", {
      params: { path: { id: "activity-taller-contactes" }, query: { q: first, size: 50 } },
    });
    expect(first).not.toBe("");
    expect(searched.data?.items.map((item) => item.member?.fullName)).toEqual([first]);

    mockScenario("adminExportsQueued");
    await requestExport(client, "/activity-registrations/export", {
      ...query,
      filter: ["activityId:eq:activity-taller-contactes"],
      format: "xlsx",
      q: first,
    });
    await fetch("https://core.example.test/api/v1/exports?kind=LIST");
    const jobs = (await (
      await fetch("https://core.example.test/api/v1/exports?kind=LIST")
    ).json()) as { id: string; rows?: number }[];
    expect(jobs.find((job) => job.id === "00000000-0000-4000-8000-000000000408")?.rows).toBe(1);

    const refused = await fetch(
      "https://core.example.test/api/v1/activity-registrations/export?format=xlsx&filter=contact%3Aeq%3Ax",
    );
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ code: "INVALID_FILTER" });
  });

  it("the D5 selection export filters the members by id (x-filterable `id`)", async () => {
    mockScenario("adminExportsQueued");
    await requestExport(client, "/members/export", {
      ...query,
      filter: ["id:in:member-laura"],
      format: "xlsx",
    });
    await fetch("https://core.example.test/api/v1/exports?kind=LIST");
    const jobs = (await (
      await fetch("https://core.example.test/api/v1/exports?kind=LIST")
    ).json()) as { id: string; rows?: number }[];
    expect(jobs.find((job) => job.id === "00000000-0000-4000-8000-000000000403")?.rows).toBe(1);
  });

  it("an INSTRUCTOR cannot export D7 or the registrants (ADMIN only)", async () => {
    mockScenario("instructor");
    const d7 = await fetch("https://core.example.test/api/v1/activities/export?format=xlsx");
    const registrants = await fetch(
      "https://core.example.test/api/v1/activity-registrations/export?format=xlsx",
    );
    expect([d7.status, registrants.status]).toEqual([403, 403]);
  });
});
