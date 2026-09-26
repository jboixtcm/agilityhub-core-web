import { apiFieldErrors, isApiError } from "@agilityhub/api-client";

/**
 * Where a D2 error is shown (S04 §2 D2: «els errors 422 es mostren sobre el camp»). The api
 * answers most of these codes bare, with empty `details`, so the target comes from the code; the
 * fields of a `VALIDATION_ERROR` (`details.fieldErrors` or `details.field`) only refine it.
 */
export type SignupReviewError =
  | { code: string; dogIds: readonly string[]; kind: "level" }
  | { code: string; kind: "nextInvoiceDate" }
  | { code: string; kind: "upfront" }
  | { code: string; kind: "plan" }
  | { code: string; kind: "planCard" }
  | { code: string; kind: "banner" }
  | { code: string; kind: "family" }
  | { code: "STALE_VERSION"; kind: "stale" }
  | { code: "INVALID_STATE"; kind: "resolved" }
  | { code: string; kind: "general" };

function detailsOf(error: unknown): Readonly<Record<string, unknown>> {
  return isApiError(error) && typeof error.details === "object" && error.details !== null
    ? (error.details as Record<string, unknown>)
    : {};
}

/** `details.reason` of a `409 INVALID_STATE` (`NOT_PENDING`, `CHECKOUT_PENDING`, …). */
export function errorReason(error: unknown): string | undefined {
  const reason = detailsOf(error).reason;
  return typeof reason === "string" ? reason : undefined;
}

/**
 * Maps an api error of `POST /members/{id}/validation` (also its `dryRun`) and of the rejection to
 * its place on D2. `dogs` are the dogs in the order of the request (`dogs.{index}.levelId`), each
 * with the level currently chosen (`""` = none).
 */
export function classifySignupReviewError(
  error: unknown,
  dogs: readonly { id: string; levelId: string }[] = [],
): SignupReviewError {
  if (!isApiError(error)) return { code: "UNKNOWN", kind: "general" };
  const { code } = error;
  switch (code) {
    case "LEVEL_REQUIRED": {
      const missing = dogs.filter((dog) => dog.levelId === "").map((dog) => dog.id);
      return { code, dogIds: missing.length > 0 ? missing : dogs.map((dog) => dog.id), kind: "level" };
    }
    case "LEVEL_NOT_ACTIVE": {
      const chosen = dogs.filter((dog) => dog.levelId !== "").map((dog) => dog.id);
      return { code, dogIds: chosen.length > 0 ? chosen : dogs.map((dog) => dog.id), kind: "level" };
    }
    case "NEXT_INVOICE_DATE_REQUIRED":
      return { code, kind: "nextInvoiceDate" };
    case "UPFRONT_AMOUNT_EXCEEDS_DUE":
      return { code, kind: "upfront" };
    case "PLAN_NOT_AVAILABLE":
      return { code, kind: "plan" };
    case "MEMBERSHIP_EXISTS":
      return { code, kind: "banner" };
    case "FAMILY_HOLDER_NOT_FOUND":
    case "FAMILY_GROUP_MEMBER_ALREADY_IN_GROUP":
      return { code, kind: "family" };
    case "STALE_VERSION":
      return { code, kind: "stale" };
    case "INVALID_STATE": {
      const reason = errorReason(error);
      if (reason === "NOT_PENDING") return { code, kind: "resolved" };
      if (reason === "CHECKOUT_PENDING") return { code, kind: "planCard" };
      return { code, kind: "general" };
    }
    case "VALIDATION_ERROR": {
      const fields = apiFieldErrors(error);
      if (fields.some((field) => field.field === "nextInvoiceDate")) {
        return { code, kind: "nextInvoiceDate" };
      }
      if (fields.some((field) => field.field === "upfrontAmountPaid")) {
        return { code, kind: "upfront" };
      }
      const levelIndexes = fields
        .map((field) => /^dogs\.(\d+)\.levelId$/u.exec(field.field)?.[1])
        .filter((index): index is string => index !== undefined)
        .map(Number);
      if (levelIndexes.length > 0) {
        return {
          code: "LEVEL_REQUIRED",
          dogIds: levelIndexes
            .map((index) => dogs[index]?.id)
            .filter((id): id is string => id !== undefined),
          kind: "level",
        };
      }
      return { code, kind: "general" };
    }
    default:
      return { code, kind: "general" };
  }
}
