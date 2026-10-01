import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AttendanceState } from "./attendance";
import {
  type AttendanceSaveOutcome,
  type AttendanceSheetData,
  type AttendanceSheetTransport,
  useAttendanceSheet,
} from "./attendance-sheet";

interface Row {
  bookingId: string;
  final: boolean;
  state: AttendanceState;
}
interface Sheet extends AttendanceSheetData {
  rows: Row[];
  sheet: { canMarkNotice: boolean; canMarkPresence: boolean; version: number };
}

function sheet(version: number, open: boolean, rows: Row[] = defaultRows()): Sheet {
  return { rows, sheet: { canMarkNotice: open, canMarkPresence: open, version } };
}

function defaultRows(): Row[] {
  return [
    { bookingId: "b1", final: false, state: "PRESENT" },
    { bookingId: "b2", final: false, state: "PENDING" },
  ];
}

/**
 * A transport whose reads answer `reads` in turn (the last one again) and saves answer `saves`. Its
 * `Idempotency-Key`s are the real transport's (api-client's `attendanceSheetTransport`, tested
 * there, E7-W07 step 4): this hook only says what to save.
 */
function fakeTransport(reads: Sheet[], saves: AttendanceSaveOutcome<Sheet>[]) {
  let read = 0;
  let saved = 0;
  const calls: { body: unknown }[] = [];
  const transport: AttendanceSheetTransport<Sheet> = {
    read: vi.fn(() => {
      const answer = reads[Math.min(read, reads.length - 1)];
      read += 1;
      return answer === undefined ? Promise.reject(new Error("no read")) : Promise.resolve(answer);
    }),
    save: vi.fn((body: unknown) => {
      calls.push({ body });
      const answer = saves[Math.min(saved, saves.length - 1)];
      saved += 1;
      return answer === undefined ? Promise.reject(new Error("no save")) : Promise.resolve(answer);
    }),
  };
  return { calls, reads: () => read, transport };
}

describe("E6-W03 step 11 (E6-W01 round-2 review #1, R-10-03, R-10-04): the draft after a refusal", () => {
  it("a 422 ATTENDANCE_WINDOW_CLOSED whose re-read comes back closed empties the draft and disables the save; a later save is sent again", async () => {
    const fake = fakeTransport(
      [sheet(4, true), sheet(4, false), sheet(4, true)],
      [
        { code: "ATTENDANCE_WINDOW_CLOSED", kind: "refused" },
        { kind: "saved", sheet: sheet(5, true) },
      ],
    );
    const { result } = renderHook(() => useAttendanceSheet(fake.transport));
    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });
    act(() => {
      result.current.choose("b2", "PRESENT");
    });
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.notice).toEqual({ code: "ATTENDANCE_WINDOW_CLOSED", kind: "error" });
    // The list read again is closed: the choice it no longer allows is gone, nothing to save.
    expect(fake.reads()).toBe(2);
    expect(result.current.draft).toEqual({});
    expect(result.current.changes).toEqual([]);

    // The window opens again (an ADMIN, or a correction): the same choice is a new request.
    act(() => {
      result.current.refetch();
    });
    await waitFor(() => {
      expect(fake.reads()).toBe(3);
    });
    act(() => {
      result.current.choose("b2", "PRESENT");
    });
    await act(async () => {
      await result.current.save();
    });
    expect(fake.calls.map((call) => call.body)).toEqual([
      { items: [{ bookingId: "b2", state: "PRESENT" }], version: 4 },
      { items: [{ bookingId: "b2", state: "PRESENT" }], version: 4 },
    ]);
    expect(result.current.notice).toEqual({ kind: "saved" });
  });

  it("an unanswered save (offline, a 5xx) keeps the list and the draft and reads nothing: the retry sends the same payload (the transport keeps its key, E7-W07 step 4)", async () => {
    const fake = fakeTransport(
      [sheet(4, true)],
      [
        { code: "INTERNAL_ERROR", kind: "unanswered" },
        { kind: "saved", sheet: sheet(5, true) },
      ],
    );
    const { result } = renderHook(() => useAttendanceSheet(fake.transport));
    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });
    act(() => {
      result.current.choose("b2", "NO_SHOW");
    });
    await act(async () => {
      await result.current.save();
    });
    expect(fake.reads()).toBe(1);
    expect(result.current.draft).toEqual({ b2: "NO_SHOW" });
    await act(async () => {
      await result.current.save();
    });
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[1]?.body).toEqual(fake.calls[0]?.body);
  });

  it("409 STALE_VERSION rebases on details.current with its permissions, and the next save sends the caller's rows with the new version", async () => {
    const current = sheet(5, true, [
      { bookingId: "b1", final: false, state: "NO_SHOW" },
      { bookingId: "b2", final: false, state: "PENDING" },
    ]);
    const fake = fakeTransport(
      [sheet(4, true)],
      [
        { current, kind: "stale" },
        { kind: "saved", sheet: sheet(6, true) },
      ],
    );
    const { result } = renderHook(() => useAttendanceSheet(fake.transport));
    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });
    act(() => {
      result.current.choose("b1", "PENDING");
      result.current.choose("b2", "PRESENT");
    });
    await act(async () => {
      await result.current.save();
    });
    // b1 was changed by the other person (PRESENT → NO_SHOW): theirs; b2 stays the caller's.
    expect(result.current.notice).toEqual({ kind: "stale" });
    expect(result.current.draft).toEqual({ b2: "PRESENT" });
    await act(async () => {
      await result.current.save();
    });
    expect(fake.calls[1]?.body).toEqual({
      items: [{ bookingId: "b2", state: "PRESENT" }],
      version: 5,
    });
  });

  it("choices made before leaving (D12 → D13 → back) are rebased on the first read like any other", async () => {
    const fresh = sheet(5, true, [
      { bookingId: "b1", final: false, state: "NO_SHOW" },
      { bookingId: "b2", final: false, state: "PENDING" },
    ]);
    const fake = fakeTransport([fresh], []);
    const { result } = renderHook(() =>
      useAttendanceSheet(fake.transport, {
        baseRows: defaultRows(),
        draft: { b1: "PENDING", b2: "PRESENT" },
      }),
    );
    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });
    expect(result.current.draft).toEqual({ b2: "PRESENT" });
    expect(result.current.changes).toEqual([{ bookingId: "b2", state: "PRESENT" }]);
  });
});
