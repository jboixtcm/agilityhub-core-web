import { describe, expect, it } from "vitest";

import { attendanceSheetTransport } from "./attendance-sheet";
import { createApiClient } from "./client";

/** A client whose every request gets `respond()`'s answer. */
function clientAnswering(respond: () => Response) {
  return createApiClient({
    baseUrl: "https://app.example.test/api/v1",
    fetch: () => Promise.resolve(respond()),
  });
}

const body = { items: [], version: 3 } as unknown as Parameters<
  ReturnType<typeof attendanceSheetTransport>["save"]
>[0];

describe("E7-W06 review #3 · the attendance save keeps its key by the shared rule (isUnanswered, CONVENCIONS_API §7, E79)", () => {
  it("E7-W06 review #3: a gateway's 504 without the api's body is no answer — the save is «unanswered» and keeps its key, as every other keyed write", async () => {
    const transport = attendanceSheetTransport(
      clientAnswering(() => new Response("Gateway Timeout", { status: 504 })),
      "cls-1",
    );
    expect(await transport.save(body, "key-1")).toMatchObject({ kind: "unanswered" });
  });

  it("E7-W06 review #3: a 500 carrying the api's error body is the api's answer — «refused», the key retired", async () => {
    const transport = attendanceSheetTransport(
      clientAnswering(() =>
        Response.json(
          { code: "INTERNAL_ERROR", details: {}, message: "boom", traceId: "t" },
          { status: 500 },
        ),
      ),
      "cls-1",
    );
    expect(await transport.save(body, "key-1")).toEqual({
      code: "INTERNAL_ERROR",
      kind: "refused",
    });
  });

  it("E7-W06 review #3: 409 IDEMPOTENCY_KEY_REUSED {reason: IN_PROGRESS} is «inProgress»", async () => {
    const transport = attendanceSheetTransport(
      clientAnswering(() =>
        Response.json(
          {
            code: "IDEMPOTENCY_KEY_REUSED",
            details: { reason: "IN_PROGRESS" },
            message: "in progress",
            traceId: "t",
          },
          { status: 409 },
        ),
      ),
      "cls-1",
    );
    expect(await transport.save(body, "key-1")).toMatchObject({ kind: "inProgress" });
  });
});
