import { type ApiClient, type components, isApiError } from "@agilityhub/api-client";
import { type AttendanceState, diffSheet, mergeSheet } from "@agilityhub/ui";
import { useCallback, useEffect, useRef, useState } from "react";

export type AttendanceSheet = components["schemas"]["AttendanceSheet"];
export type AttendanceRow = components["schemas"]["AttendanceRow"];

/** What 21 tells the instructor after a save: a translation key or an api `code` (`errors:`). */
export type SheetNotice = { code: string; kind: "error" } | { kind: "saved" } | { kind: "stale" };

type SheetState =
  | { error: unknown; status: "error" }
  | { sheet: AttendanceSheet; status: "ready" }
  | { status: "loading" };

function isSheet(value: unknown): value is AttendanceSheet {
  return (
    typeof value === "object" &&
    value !== null &&
    "rows" in value &&
    Array.isArray(value.rows) &&
    "sheet" in value
  );
}

/** One `Idempotency-Key` per payload: a retry of the same save replays the api's answer. */
function useIdempotencyKeys() {
  const keys = useRef(new Map<string, string>());
  return (payload: unknown) => {
    const signature = JSON.stringify(payload);
    const known = keys.current.get(signature);
    if (known !== undefined) return known;
    const key = crypto.randomUUID();
    keys.current.set(signature, key);
    return key;
  };
}

/**
 * Screen 21's sheet (S10 R-10-03, R-10-04): the api's list, the caller's local choices (`draft`,
 * nothing is sent on a tap) and [DESA], which sends only the changed rows with the version read.
 * A `409 STALE_VERSION` takes `details.current` and reapplies only the caller's own edits on rows
 * nobody else changed; any other refusal changed nothing (the api rolls the save back), so the
 * list is read again and the caller's choices are rebased on it by the same rule. That read holds
 * the sheet like the save itself, and no answer older than the list on screen is ever shown.
 */
export function useAttendanceSheet(client: ApiClient, classId: string) {
  const [state, setState] = useState<SheetState>({ status: "loading" });
  // Only the caller's own choices (the rows they touched), relative to `base`.
  const [draft, setDraft] = useState<Record<string, AttendanceState>>({});
  // A save in flight, or the read after a refused save: the circles and [DESA] wait for it.
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<SheetNotice>();
  const [reload, setReload] = useState(0);
  const keyFor = useIdempotencyKeys();
  // The rows the draft was chosen on: a row whose state moved since then is someone else's now.
  const base = useRef<readonly AttendanceRow[]>([]);
  // R-10-04: answers (reads and saves) are shown in request order and never below the version on
  // screen, so a late read cannot bring back a list older than a save.
  const order = useRef({ applied: 0, requested: 0, version: -1 });
  // `saving` as a ref: a second tap or [DESA] before the next render is refused as well.
  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Whether the answer to request `seq` is still the newest list to show; if so it is. */
  const accept = useCallback((seq: number, data: AttendanceSheet): boolean => {
    if (!mounted.current) return false;
    if (seq < order.current.applied || data.sheet.version < order.current.version) return false;
    order.current.applied = seq;
    order.current.version = data.sheet.version;
    return true;
  }, []);

  /** Reads the list; the caller's own choices are rebased on it. */
  const read = useCallback(async () => {
    order.current.requested += 1;
    const seq = order.current.requested;
    const { data } = await client.GET("/class-sessions/{id}/attendance", {
      params: { path: { id: classId } },
    });
    if (data === undefined) throw new TypeError("The sheet response did not contain data");
    if (!accept(seq, data)) return;
    const previous = base.current;
    base.current = data.rows;
    setState({ sheet: data, status: "ready" });
    setDraft((current) => mergeSheet(data.rows, current, new Set(Object.keys(current)), previous));
  }, [accept, classId, client]);

  useEffect(() => {
    let active = true;
    read().catch((error: unknown) => {
      if (active) setState({ error, status: "error" });
    });
    return () => {
      active = false;
    };
  }, [read, reload]);

  const refetch = useCallback(() => {
    setReload((value) => value + 1);
  }, []);

  const choose = useCallback((bookingId: string, value: AttendanceState) => {
    if (busy.current) return;
    setDraft((current) => ({ ...current, [bookingId]: value }));
    setNotice(undefined);
  }, []);

  const sheet = state.status === "ready" ? state.sheet : undefined;
  const items = sheet === undefined ? [] : diffSheet(sheet.rows, draft);

  const save = useCallback(async () => {
    if (sheet === undefined || busy.current) return;
    const changes = diffSheet(sheet.rows, draft);
    if (changes.length === 0) return;
    const body = { items: changes, version: sheet.sheet.version };
    busy.current = true;
    setSaving(true);
    setNotice(undefined);
    order.current.requested += 1;
    const seq = order.current.requested;
    try {
      const { data } = await client.PUT("/class-sessions/{id}/attendance", {
        body,
        params: { header: { "Idempotency-Key": keyFor({ body, classId }) }, path: { id: classId } },
      });
      if (data === undefined) throw new TypeError("The save response did not contain data");
      if (accept(seq, data)) {
        base.current = data.rows;
        setState({ sheet: data, status: "ready" });
        setDraft({});
        setNotice({ kind: "saved" });
      }
    } catch (error) {
      const current: unknown = isApiError(error, "STALE_VERSION")
        ? (error.details as { current?: unknown } | null | undefined)?.current
        : undefined;
      if (isSheet(current)) {
        // R-10-04: the list as it is now; the caller's own edits go back on the rows the other
        // person did not change.
        if (accept(seq, current)) {
          const merged = mergeSheet(current.rows, draft, new Set(Object.keys(draft)), sheet.rows);
          base.current = current.rows;
          setState({ sheet: current, status: "ready" });
          setDraft(merged);
          setNotice({ kind: "stale" });
        }
      } else if (mounted.current) {
        setNotice({ code: isApiError(error) ? error.code : "INTERNAL_ERROR", kind: "error" });
        // Nothing was applied, so the list is read again before the sheet is released; a network
        // failure keeps the list (a retry resends the same key). A failed read keeps it as well.
        if (isApiError(error) && error.status !== 0) await read().catch(() => undefined);
      }
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  }, [accept, classId, client, draft, keyFor, read, sheet]);

  return {
    ...state,
    changes: items,
    choose,
    dismissNotice: () => {
      setNotice(undefined);
    },
    draft,
    notice,
    refetch,
    save,
    saving,
  };
}
