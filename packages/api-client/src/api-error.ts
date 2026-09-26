interface ApiErrorInit {
  code: string;
  details?: unknown;
  message: string;
  retryAfter?: number;
  status: number;
  traceId?: string;
}

function recordFrom(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

async function responsePayload(response: Response): Promise<Record<string, unknown> | undefined> {
  try {
    return recordFrom(await response.clone().json());
  } catch {
    return undefined;
  }
}

export class ApiError extends Error {
  readonly code: string;
  readonly details: unknown;
  readonly status: number;
  readonly traceId: string | undefined;
  readonly retryAfter: number | undefined;

  constructor({ code, details, message, retryAfter, status, traceId }: ApiErrorInit) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
    this.status = status;
    this.traceId = traceId;
    this.retryAfter = retryAfter;
  }

  static async fromResponse(response: Response): Promise<ApiError> {
    const payload = await responsePayload(response);
    const code = typeof payload?.code === "string" ? payload.code : "NETWORK";
    const message =
      typeof payload?.message === "string"
        ? payload.message
        : response.statusText || "The API returned an invalid error response";
    const retryAfterHeader = response.headers.get("Retry-After");
    const retryAfter =
      retryAfterHeader === null ? undefined : Number.parseInt(retryAfterHeader, 10);

    return new ApiError({
      code,
      details: payload?.details,
      message,
      status: response.status,
      ...(retryAfter !== undefined && Number.isFinite(retryAfter) ? { retryAfter } : {}),
      ...(typeof payload?.traceId === "string" ? { traceId: payload.traceId } : {}),
    });
  }

  static network(error: unknown): ApiError {
    return new ApiError({
      code: "NETWORK",
      details: error,
      message: error instanceof Error ? error.message : "Network request failed",
      status: 0,
    });
  }
}

export function isApiError(error: unknown, code?: string): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}

/** One field of a refused request: the api's field path and the code to translate. */
export interface ApiFieldError {
  code: string;
  field: string;
}

/**
 * The fields an api error names (CONVENCIONS_API §5): every `details.fieldErrors[{field, code}]`
 * entry, and the single `details.field` of a one-field error, which carries the error's own code
 * (`400 VALIDATION_ERROR {field: "reason"}`, `409 DUPLICATE_NAME {field: "shortName"}`). An entry
 * without its own code takes the error's. Empty for anything else.
 */
export function apiFieldErrors(error: unknown): ApiFieldError[] {
  if (!isApiError(error)) return [];
  const details = recordFrom(error.details);
  if (details === undefined) return [];
  const listed = Array.isArray(details.fieldErrors)
    ? details.fieldErrors.flatMap((entry: unknown) => {
        const item = recordFrom(entry);
        return typeof item?.field === "string" && item.field !== ""
          ? [{ code: typeof item.code === "string" ? item.code : error.code, field: item.field }]
          : [];
      })
    : [];
  const single = details.field;
  return typeof single === "string" &&
    single !== "" &&
    !listed.some((entry) => entry.field === single)
    ? [...listed, { code: error.code, field: single }]
    : listed;
}
