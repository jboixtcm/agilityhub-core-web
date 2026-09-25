import { HttpResponse } from "msw";

import { currentMockScenario } from "./scenarios";

/** `ExportPolicy.syncMaxRows` (R-14-12, CONVENCIONS_API §4): above it the export is queued (`202`). */
export const SYNC_MAX_ROWS = 5_000;

export type MockExportFormat = "pdf" | "xlsx";

const CONTENT_TYPES: Readonly<Record<MockExportFormat, string>> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

// Tiny files with the real magic bytes (`%PDF-`, `PK\x03\x04`) and bytes that are not valid UTF-8,
// so a client that reads the body as text corrupts them.
const BODIES: Readonly<Record<MockExportFormat, readonly number[]>> = {
  pdf: [
    0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a, 0x25,
    0x25, 0x45, 0x4f, 0x46, 0x0a,
  ],
  xlsx: [
    0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00, 0xff, 0xfe, 0x80, 0x00, 0x50, 0x4b,
    0x05, 0x06, 0x00, 0x00,
  ],
};

export function mockExportBody(format: MockExportFormat): Uint8Array {
  return Uint8Array.from(BODIES[format]);
}

export function exportFormat(request: Request): MockExportFormat {
  return new URL(request.url).searchParams.get("format") === "pdf" ? "pdf" : "xlsx";
}

/** `{club.slug}_{listKey}_{yyyyMMdd-HHmm}.{ext}`, local time of the club (R-14-12). */
export function exportFileName(listKey: string, format: MockExportFormat, at: Date): string {
  const { club, timeZone } = currentMockScenario().branding;
  const parts = new Map(
    new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      timeZone,
      year: "numeric",
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  const stamp = `${parts.get("year") ?? ""}${parts.get("month") ?? ""}${parts.get("day") ?? ""}-${
    parts.get("hour") ?? ""
  }${parts.get("minute") ?? ""}`;
  return `${club.slug}_${listKey}_${stamp}.${format}`;
}

/** Queued like the api above `SYNC_MAX_ROWS`, or always under the `exportsQueued` scenario switch. */
export function exportQueued(rows: number): boolean {
  return rows > SYNC_MAX_ROWS || currentMockScenario().exportsQueued === true;
}

/** The api's inline answer: `200` with the file, its `Content-Type` and `Content-Disposition`. */
export function exportFileResponse(listKey: string, format: MockExportFormat, at: Date) {
  return new HttpResponse(mockExportBody(format), {
    headers: {
      "Content-Disposition": `attachment; filename="${exportFileName(listKey, format, at)}"`,
      "Content-Type": CONTENT_TYPES[format],
    },
    status: 200,
  });
}
