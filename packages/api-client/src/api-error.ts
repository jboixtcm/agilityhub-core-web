interface ApiErrorInit {
  code: string;
  details?: unknown;
  message: string;
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

  constructor({ code, details, message, status, traceId }: ApiErrorInit) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
    this.status = status;
    this.traceId = traceId;
  }

  static async fromResponse(response: Response): Promise<ApiError> {
    const payload = await responsePayload(response);
    const code = typeof payload?.code === "string" ? payload.code : "NETWORK";
    const message =
      typeof payload?.message === "string"
        ? payload.message
        : response.statusText || "The API returned an invalid error response";

    return new ApiError({
      code,
      details: payload?.details,
      message,
      status: response.status,
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
