import { describe, expect, it } from "vitest";

import { ApiError, apiFieldErrors, isInProgress } from "./api-error";

function apiError(code: string, status: number, details: unknown) {
  return new ApiError({ code, details, message: code, status, traceId: "trace-e4-w11" });
}

describe("E4-W11 CONVENCIONS_API §5 apiFieldErrors reads both field shapes", () => {
  it("reads every details.fieldErrors[{field, code}] entry", () => {
    expect(
      apiFieldErrors(
        apiError("VALIDATION_ERROR", 400, {
          fieldErrors: [
            { code: "REQUIRED", field: "title" },
            { code: "INVALID_TIME_RANGE", field: "registrationTo" },
          ],
        }),
      ),
    ).toEqual([
      { code: "REQUIRED", field: "title" },
      { code: "INVALID_TIME_RANGE", field: "registrationTo" },
    ]);
  });

  it("reads the single details.field with the error's own code (400 VALIDATION_ERROR, 409 DUPLICATE_NAME)", () => {
    expect(apiFieldErrors(apiError("VALIDATION_ERROR", 400, { field: "reason" }))).toEqual([
      { code: "VALIDATION_ERROR", field: "reason" },
    ]);
    expect(apiFieldErrors(apiError("DUPLICATE_NAME", 409, { field: "shortName" }))).toEqual([
      { code: "DUPLICATE_NAME", field: "shortName" },
    ]);
  });

  it("an entry without its own code takes the error's; the same field is never listed twice", () => {
    expect(
      apiFieldErrors(
        apiError("VALIDATION_ERROR", 400, {
          field: "ringIds",
          fieldErrors: [{ field: "ringIds" }, { code: "PATTERN", field: "slug" }],
        }),
      ),
    ).toEqual([
      { code: "VALIDATION_ERROR", field: "ringIds" },
      { code: "PATTERN", field: "slug" },
    ]);
  });

  it("is empty without field details, for malformed entries and for anything but an ApiError", () => {
    expect(apiFieldErrors(apiError("OUTSIDE_OPENING_HOURS", 422, {}))).toEqual([]);
    expect(apiFieldErrors(apiError("VALIDATION_ERROR", 400, null))).toEqual([]);
    expect(
      apiFieldErrors(
        apiError("VALIDATION_ERROR", 400, {
          field: "",
          fieldErrors: [null, { code: "X" }, "title"],
        }),
      ),
    ).toEqual([]);
    expect(apiFieldErrors(new Error("network"))).toEqual([]);
    expect(apiFieldErrors({ code: "VALIDATION_ERROR", details: { field: "reason" } })).toEqual([]);
  });
});

describe("E7-W05 step 4 CONVENCIONS_API §7 (E79, E80) isInProgress", () => {
  it("is only IDEMPOTENCY_KEY_REUSED with reason IN_PROGRESS", () => {
    expect(isInProgress(apiError("IDEMPOTENCY_KEY_REUSED", 409, { reason: "IN_PROGRESS" }))).toBe(
      true,
    );
    expect(
      isInProgress(apiError("IDEMPOTENCY_KEY_REUSED", 409, { reason: "DIFFERENT_REQUEST" })),
    ).toBe(false);
    expect(isInProgress(apiError("IDEMPOTENCY_KEY_REUSED", 409, null))).toBe(false);
    expect(isInProgress(apiError("STALE_VERSION", 409, { reason: "IN_PROGRESS" }))).toBe(false);
    expect(
      isInProgress({ code: "IDEMPOTENCY_KEY_REUSED", details: { reason: "IN_PROGRESS" } }),
    ).toBe(false);
  });
});
