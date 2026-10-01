import { isApiError, isInProgress } from "./api-error";
import type { ApiClient } from "./client";
import type { components } from "./generated/schema";
import { createSubmissionKeys, isUnanswered } from "./submission-key";

export type AttendanceSheet = components["schemas"]["AttendanceSheet"];
export type AttendanceSheetRow = components["schemas"]["AttendanceRow"];
export type AttendanceSaveRequest = components["schemas"]["AttendanceSaveRequest"];

/** How the api answered `PUT /class-sessions/{id}/attendance` (R-10-04). */
export type AttendanceSheetSaveOutcome =
  | { kind: "saved"; sheet: AttendanceSheet }
  | { current: AttendanceSheet; kind: "stale" }
  | { code: string; kind: "refused" }
  | { code: string; kind: "unanswered" }
  /** `409 IDEMPOTENCY_KEY_REUSED {reason: IN_PROGRESS}`: the first save of that key still runs. */
  | { code: string; kind: "inProgress" };

function isSheet(value: unknown): value is AttendanceSheet {
  return (
    typeof value === "object" &&
    value !== null &&
    "rows" in value &&
    Array.isArray(value.rows) &&
    "sheet" in value
  );
}

/**
 * One class's attendance sheet on the wire (S10 §6), the same for screen 21 and D12's panel so the
 * two can never disagree: `GET` reads it, and `PUT` saves with the submission's `Idempotency-Key`.
 * Every answer of the save is classified by its `code`, never by its status: `STALE_VERSION` with
 * `details.current` is the 409 merge, any other `ApiError` a refusal (the api changed nothing).
 * One key per submission (its payload), by the shared rule (`createSubmissionKeys`, E7-W07 step
 * 4): a retry reuses it only while the api has not answered (`isUnanswered`) — no answer (a network
 * failure, a gateway's response without the api's body), a `5xx` (the api undid the attempt, E85),
 * or `409 IDEMPOTENCY_KEY_REUSED {reason: IN_PROGRESS}`, the first save of that key still running
 * (CONVENCIONS_API §7, E79). One transport is one class's sheet, held by its screen.
 */
export function attendanceSheetTransport(client: ApiClient, classId: string) {
  const keys = createSubmissionKeys();
  return {
    async read(): Promise<AttendanceSheet> {
      const { data } = await client.GET("/class-sessions/{id}/attendance", {
        params: { path: { id: classId } },
      });
      if (data === undefined) throw new TypeError("The sheet response did not contain data");
      return data;
    },
    async save(body: AttendanceSaveRequest): Promise<AttendanceSheetSaveOutcome> {
      try {
        const { data } = await keys.send(JSON.stringify(body), (key) =>
          client.PUT("/class-sessions/{id}/attendance", {
            body,
            params: { header: { "Idempotency-Key": key }, path: { id: classId } },
          }),
        );
        // Answered without a sheet: nothing to show, so the list is read again.
        if (data === undefined) return { code: "INTERNAL_ERROR", kind: "refused" };
        return { kind: "saved", sheet: data };
      } catch (error) {
        if (isApiError(error) && isInProgress(error)) {
          return { code: error.code, kind: "inProgress" };
        }
        // No answer — a network failure, a gateway's response without the api's body, a `5xx` —
        // keeps the list and the key (`isUnanswered`, the rule every keyed write shares).
        if (isUnanswered(error)) {
          return { code: isApiError(error) ? error.code : "NETWORK", kind: "unanswered" };
        }
        if (!isApiError(error)) return { code: "INTERNAL_ERROR", kind: "refused" };
        const current: unknown =
          error.code === "STALE_VERSION"
            ? (error.details as { current?: unknown } | null | undefined)?.current
            : undefined;
        return isSheet(current)
          ? { current, kind: "stale" }
          : { code: error.code, kind: "refused" };
      }
    },
  };
}
