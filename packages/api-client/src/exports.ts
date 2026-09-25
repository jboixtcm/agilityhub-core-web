import type { ApiClient } from "./client";
import type { paths } from "./generated/schema";

export type ListExportFormat = "pdf" | "xlsx";

/** The list's parameters that every `GET /{resource}/export` takes (CONVENCIONS_API §4, R-14-12). */
export interface ListExportQuery {
  columns: string;
  filter: string[];
  format: ListExportFormat;
  q?: string;
  sort: string[];
}

type GetQuery<Path extends keyof paths> = paths[Path] extends {
  get: { parameters: { query: infer Query } };
}
  ? Query
  : never;

/** The list export paths (`/members/export`, `/audit-entries/export`, …) that take `ListExportQuery`. */
export type ListExportPath = {
  [Path in keyof paths]: Path extends `/${string}/export`
    ? ListExportQuery extends GetQuery<Path>
      ? Path
      : never
    : never;
}[keyof paths];

/**
 * `file`: the api answered `200` with the file (up to `ExportPolicy.syncMaxRows`);
 * `queued`: it answered `202 {jobId, statusUrl}` and a worker builds it (the exports drawer).
 */
export type ExportResult =
  { blob: Blob; fileName: string; kind: "file" } | { jobId: string; kind: "queued" };

// Some browsers still read the object URL after `click()` returns; the revocation waits for them.
const REVOKE_DELAY_MS = 40_000;

function baseName(value: string): string | undefined {
  const name = value
    .split(/[/\\]/u)
    .at(-1)
    ?.replaceAll(/\p{Cc}/gu, "")
    .trim();
  return name === undefined || name === "" || name === "." || name === ".." ? undefined : name;
}

/** The file name of a `Content-Disposition` header: `filename*` (RFC 6266/5987) first, then `filename`. */
export function contentDispositionFileName(header: string | null): string | undefined {
  if (header === null) return undefined;
  const extended = /(?:^|;)\s*filename\*\s*=\s*([^']*)'[^']*'([^;]+)/iu.exec(header)?.[2];
  if (extended !== undefined) {
    try {
      const name = baseName(decodeURIComponent(extended.trim()));
      if (name !== undefined) return name;
    } catch {
      // A malformed percent-encoding falls back to `filename`.
    }
  }
  const quoted = /(?:^|;)\s*filename\s*=\s*"((?:[^"\\]|\\.)*)"/iu.exec(header)?.[1];
  if (quoted !== undefined) return baseName(quoted.replaceAll(/\\(.)/gu, "$1"));
  const token = /(?:^|;)\s*filename\s*=\s*([^;\s]+)/iu.exec(header)?.[1];
  return token === undefined ? undefined : baseName(token);
}

function queuedJobId(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("jobId" in body)) return undefined;
  return typeof body.jobId === "string" && body.jobId !== "" ? body.jobId : undefined;
}

/**
 * Runs a list export (CONVENCIONS_API §4, S14 R-14-12). The body is read as a Blob, never as text,
 * so the file keeps its bytes; errors (`EXPORT_LIMIT`, `EXPORT_TOO_LARGE`, …) arrive as `ApiError`
 * from the client's middleware.
 */
export async function requestExport(
  client: ApiClient,
  path: ListExportPath,
  query: ListExportQuery,
): Promise<ExportResult> {
  // openapi-fetch types one path per call; every `ListExportPath` takes the same `ListExportQuery`.
  const { data, response } = await client.GET(path as "/members/export", {
    params: { query },
    parseAs: "blob",
  });
  if (response.status === 202) {
    const jobId = queuedJobId(data === undefined ? undefined : JSON.parse(await data.text()));
    if (jobId === undefined) throw new TypeError("The queued export answer has no job id");
    return { jobId, kind: "queued" };
  }
  if (data === undefined) throw new TypeError("The export answer has no file");
  const type = response.headers.get("Content-Type") ?? data.type;
  return {
    blob: data.type === type ? data : new Blob([await data.arrayBuffer()], { type }),
    fileName:
      contentDispositionFileName(response.headers.get("Content-Disposition")) ??
      `${path.slice(1, -"/export".length)}.${query.format}`,
    kind: "file",
  };
}

/** Saves a downloaded file: object URL, hidden link, click, revoke. */
export function saveFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, REVOKE_DELAY_MS);
  }
}
