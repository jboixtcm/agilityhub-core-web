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

describe("T-10-12 E7-W06 review #3 · the attendance save keeps its key by the shared rule (isUnanswered, CONVENCIONS_API §7, E79)", () => {
  it("E7-W06 review #3: a gateway's 504 without the api's body is no answer — the save is «unanswered» and keeps its key, as every other keyed write", async () => {
    const transport = attendanceSheetTransport(
      clientAnswering(() => new Response("Gateway Timeout", { status: 504 })),
      "cls-1",
    );
    expect(await transport.save(body)).toMatchObject({ kind: "unanswered" });
  });

  it("E7-W07 step 4 (CONVENCIONS_API §7, E85): a 500 carrying the api's error body is not the save's answer — «unanswered», the list kept", async () => {
    const transport = attendanceSheetTransport(
      clientAnswering(() =>
        Response.json(
          { code: "INTERNAL_ERROR", details: {}, message: "boom", traceId: "t" },
          { status: 500 },
        ),
      ),
      "cls-1",
    );
    expect(await transport.save(body)).toEqual({
      code: "INTERNAL_ERROR",
      kind: "unanswered",
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
    expect(await transport.save(body)).toMatchObject({ kind: "inProgress" });
  });
});

/** A client whose requests get `answers` in turn; `keys` records each request's Idempotency-Key. */
function clientScripted(answers: (() => Response)[]) {
  const keys: (string | null)[] = [];
  const client = createApiClient({
    baseUrl: "https://app.example.test/api/v1",
    fetch: (input: RequestInfo | URL) => {
      if (!(input instanceof Request)) throw new TypeError("openapi-fetch sends a Request");
      keys.push(input.headers.get("Idempotency-Key"));
      const answer = answers[keys.length - 1];
      if (answer === undefined) throw new TypeError("No answer left");
      return Promise.resolve(answer());
    },
  });
  return { client, keys };
}

const apiError =
  (status: number, code: string, details: unknown = {}) =>
  () =>
    Response.json({ code, details, message: code, traceId: `t-${code}` }, { status });

describe("E7-W07 step 4 (CONVENCIONS_API §7, E74, E85): the attendance save takes its key from the shared helper (screens 21 and D12)", () => {
  it("T-10-12 E7-W07 step 4: a 503 with the api's body and IN_PROGRESS keep the key for the retry; a 422 ATTENDANCE_WINDOW_CLOSED retires it, so the same payload saved again is a new submission with a new key", async () => {
    const saved = { rows: [], sheet: { canMarkNotice: true, canMarkPresence: true, version: 4 } };
    const { client, keys } = clientScripted([
      apiError(503, "INTERNAL_ERROR"),
      apiError(409, "IDEMPOTENCY_KEY_REUSED", { reason: "IN_PROGRESS" }),
      apiError(422, "ATTENDANCE_WINDOW_CLOSED"),
      () => Response.json(saved),
      () => Response.json(saved),
    ]);
    const transport = attendanceSheetTransport(client, "cls-1");
    expect(await transport.save(body)).toMatchObject({ kind: "unanswered" });
    expect(await transport.save(body)).toMatchObject({ kind: "inProgress" });
    expect(await transport.save(body)).toEqual({
      code: "ATTENDANCE_WINDOW_CLOSED",
      kind: "refused",
    });
    expect(await transport.save(body)).toMatchObject({ kind: "saved" });
    expect(await transport.save(body)).toMatchObject({ kind: "saved" });
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/u);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).toBe(keys[0]);
    // Answered (422): a new submission; answered (2xx): another one again.
    expect(keys[3]).not.toBe(keys[2]);
    expect(keys[4]).not.toBe(keys[3]);
  });

  it("T-10-12 E7-W07 step 4: a 409 STALE_VERSION with the list as it is now is the answer — the key is retired — and another payload never shares a key", async () => {
    const current = { rows: [], sheet: { canMarkNotice: true, canMarkPresence: true, version: 5 } };
    const { client, keys } = clientScripted([
      apiError(409, "STALE_VERSION", { current }),
      apiError(503, "INTERNAL_ERROR"),
      apiError(503, "INTERNAL_ERROR"),
    ]);
    const transport = attendanceSheetTransport(client, "cls-1");
    expect(await transport.save(body)).toEqual({ current, kind: "stale" });
    expect(await transport.save(body)).toMatchObject({ kind: "unanswered" });
    const other = { ...body, version: 5 };
    expect(await transport.save(other)).toMatchObject({ kind: "unanswered" });
    expect(keys[1]).not.toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
  });
});
