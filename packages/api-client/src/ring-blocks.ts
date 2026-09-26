import { isApiError } from "./api-error";
import type { ApiClient } from "./client";
import type { components } from "./generated/schema";

export type RingBlockKind = components["schemas"]["RingBlockCreateRequest"]["kind"];
export type RingBlockReason = components["schemas"]["RingBlockCreateRequest"]["reason"];
export type RingBlockCreateRequest = components["schemas"]["RingBlockCreateRequest"];

/**
 * The reasons each kind takes (S06 §3, S09 §3 and R-09-11): `ACTIVITY` only through S07, never
 * offered by a form.
 */
export const RING_BLOCK_REASONS_BY_KIND: Readonly<Record<RingBlockKind, readonly RingBlockReason[]>> = {
  BLOCK: ["MAINTENANCE", "OTHER"],
  RESERVATION: ["PRIVATE_CLASS", "THERAPY", "PREPARATION", "OTHER"],
};

/** The kinds a form offers: a `RESERVATION` needs `FREE_TRAINING` (S09 §9), a `BLOCK` does not. */
export function ringBlockKinds(modules: readonly string[]): RingBlockKind[] {
  return modules.includes("FREE_TRAINING") ? ["RESERVATION", "BLOCK"] : ["BLOCK"];
}

/** One of `details.conflicts[]` of a `409 RING_BLOCK_CONFLICT`. */
export interface RingBlockConflict {
  from?: string;
  label?: string;
  to?: string;
  type?: string;
}

/**
 * What a refused ring block means for the form (R-06-11, R-09-11), by `code`:
 * - `conflict`: `409 RING_BLOCK_CONFLICT` with the overlaps to mark;
 * - `bookings`: `RING_HAS_BOOKINGS` with the live training bookings (only an ADMIN may resend
 *   with `cancelBookings: true`);
 * - `time`: the times are wrong (`INVALID_TIME_RANGE`, `INVALID_SLOT_GRANULARITY`,
 *   `OUTSIDE_OPENING_HOURS`);
 * - `general`: anything else, shown with its code's message.
 */
export type RingBlockFailure =
  | { code: string; conflicts: RingBlockConflict[]; kind: "conflict" }
  | { bookings: unknown[]; code: string; kind: "bookings" }
  | { code: string; kind: "general" | "time" };

const TIME_CODES = new Set(["INVALID_SLOT_GRANULARITY", "INVALID_TIME_RANGE", "OUTSIDE_OPENING_HOURS"]);

export function ringBlockFailure(cause: unknown): RingBlockFailure {
  const code = isApiError(cause) ? cause.code : "INTERNAL_ERROR";
  const details =
    isApiError(cause) && typeof cause.details === "object" && cause.details !== null
      ? (cause.details as Record<string, unknown>)
      : {};
  if (code === "RING_BLOCK_CONFLICT") {
    return {
      code,
      conflicts: Array.isArray(details.conflicts) ? (details.conflicts as RingBlockConflict[]) : [],
      kind: "conflict",
    };
  }
  if (code === "RING_HAS_BOOKINGS") {
    return { bookings: Array.isArray(details.bookings) ? details.bookings : [], code, kind: "bookings" };
  }
  return { code, kind: TIME_CODES.has(code) ? "time" : "general" };
}

/** The fields of a new ring block: instants in UTC (the caller reads them in the club zone). */
export interface RingBlockFields {
  from: string;
  kind: RingBlockKind;
  note: string;
  reason: RingBlockReason;
  ringId: string;
  to: string;
}

/** The `POST /ring-blocks` body: a blank note is `null`; `cancelBookings` only when asked for. */
export function ringBlockCreateBody(
  fields: RingBlockFields,
  cancelBookings = false,
): RingBlockCreateRequest & { note: string | null } {
  const note = fields.note.trim();
  return {
    from: fields.from,
    kind: fields.kind,
    note: note === "" ? null : note,
    reason: fields.reason,
    ringId: fields.ringId,
    to: fields.to,
    ...(cancelBookings ? { cancelBookings: true } : {}),
  };
}

/**
 * `POST /ring-blocks` (R-06-11, R-09-11). `idempotencyKey` is the payload's key: the caller keeps
 * one key per body (CONVENCIONS_API §7), so a retry of the same body replays its answer and any
 * other body gets a new one.
 */
export async function createRingBlock(
  client: ApiClient,
  body: RingBlockCreateRequest,
  idempotencyKey: string,
) {
  const result = await client.POST("/ring-blocks", {
    body,
    params: { header: { "Idempotency-Key": idempotencyKey } },
  });
  if (result.data === undefined) throw new TypeError("The ring block response did not contain data");
  return result.data;
}
