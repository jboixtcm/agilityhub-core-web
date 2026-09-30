import { type ApiClient, attendanceSheetTransport, type components } from "@agilityhub/api-client";
import { type AttendanceSheetNotice, useAttendanceSheet as useSharedSheet } from "@agilityhub/ui";
import { useMemo } from "react";

export type AttendanceSheet = components["schemas"]["AttendanceSheet"];
export type AttendanceRow = components["schemas"]["AttendanceRow"];

/** What 21 tells the instructor after a save: a translation key or an api `code` (`errors:`). */
export type SheetNotice = AttendanceSheetNotice;

/**
 * Screen 21's sheet (S10 R-10-03, R-10-04): `packages/ui`'s `useAttendanceSheet` (shared with
 * D12's panel) over `attendanceSheetTransport`, the one `GET`/`PUT` contract of both screens.
 */
export function useAttendanceSheet(client: ApiClient, classId: string) {
  const transport = useMemo(() => attendanceSheetTransport(client, classId), [client, classId]);
  return useSharedSheet(transport);
}
