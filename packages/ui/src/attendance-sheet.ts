import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type AttendanceDraft,
  type AttendanceSheetPermissions,
  type AttendanceSheetRow,
  type AttendanceState,
  diffSheet,
  mergeSheet,
} from "./attendance";

/** What screen 21 and D12 need of `GET /class-sessions/{id}/attendance` (S10 §6). */
export interface AttendanceSheetData {
  rows: readonly AttendanceSheetRow[];
  sheet: AttendanceSheetPermissions & { version: number };
}

/** `PUT /class-sessions/{id}/attendance`'s body (R-10-04). */
export interface AttendanceSaveBody {
  items: { bookingId: string; state: AttendanceState }[];
  version: number;
}

/** How the api answered a save; any refusal changed nothing (R-10-04). */
export type AttendanceSaveOutcome<Sheet> =
  | { kind: "saved"; sheet: Sheet }
  /** `409 STALE_VERSION` with the list as it is now (`details.current`). */
  | { current: Sheet; kind: "stale" }
  /** The api answered with an error (`code`): the list is read again. */
  | { code: string; kind: "refused" }
  /** No answer (status 0): the list stays, and a retry of the same payload keeps its key. */
  | { code: string; kind: "unanswered" }
  /**
   * `409 IDEMPOTENCY_KEY_REUSED {reason: IN_PROGRESS}`: the first save of that key still runs, which
   * is not its answer (CONVENCIONS_API §7, E79): as `unanswered`, said with `common:inProgress`.
   */
  | { code: string; kind: "inProgress" };

/** One class's sheet on the wire; the app builds it from its api client (`attendanceSheetTransport`). */
export interface AttendanceSheetTransport<Sheet extends AttendanceSheetData> {
  read: () => Promise<Sheet>;
  save: (body: AttendanceSaveBody, idempotencyKey: string) => Promise<AttendanceSaveOutcome<Sheet>>;
}

/**
 * What the screen tells the instructor after a save: a translation key or an api `code`;
 * `inProgress` is the shared `common:inProgress` (E80).
 */
export type AttendanceSheetNotice =
  { code: string; kind: "error" } | { kind: "inProgress" } | { kind: "saved" } | { kind: "stale" };

/** Choices made on an earlier visit (D12 before opening D13), rebased on the first read. */
export interface AttendanceSheetStart {
  baseRows: readonly AttendanceSheetRow[];
  draft: AttendanceDraft;
}

type SheetState<Sheet> =
  { error: unknown; status: "error" } | { sheet: Sheet; status: "ready" } | { status: "loading" };

/**
 * One `Idempotency-Key` per payload (CONVENCIONS_API §7), kept only while the api has not
 * answered: a retry after a network failure or an `IN_PROGRESS` (E79) replays the same save, and
 * once the api has answered (a save, a 409 or any refusal) the next attempt is a new request with
 * a new key.
 */
function useIdempotencyKeys() {
  const keys = useRef(new Map<string, string>());
  return useMemo(
    () => ({
      /** Retires `key` only if the payload still holds it (E7-W06 review #7: a late answer). */
      forget(payload: unknown, key: string) {
        const signature = JSON.stringify(payload);
        if (keys.current.get(signature) === key) keys.current.delete(signature);
      },
      keyFor(payload: unknown) {
        const signature = JSON.stringify(payload);
        const known = keys.current.get(signature);
        if (known !== undefined) return known;
        const key = crypto.randomUUID();
        keys.current.set(signature, key);
        return key;
      },
    }),
    [],
  );
}

/**
 * The attendance sheet of screen 21 and of D12's panel (S10 R-10-03, R-10-04): the api's list, the
 * caller's local choices (`draft`, nothing is sent on a tap) and the save, which sends only the
 * changed rows with the version read. A `409 STALE_VERSION` takes `details.current`; any other
 * refusal changed nothing, so the list is read again. Either way the caller's own choices are
 * rebased on the list by `mergeSheet`, which also drops the ones that list no longer allows. The
 * read after a refusal holds the sheet like the save itself, and no answer older than the list on
 * screen is ever shown. One transport is one class: another class is another mount.
 */
export function useAttendanceSheet<Sheet extends AttendanceSheetData>(
  transport: AttendanceSheetTransport<Sheet>,
  start?: AttendanceSheetStart,
) {
  const [state, setState] = useState<SheetState<Sheet>>({ status: "loading" });
  // Only the caller's own choices (the rows they touched), relative to `base`.
  const [draft, setDraft] = useState<Record<string, AttendanceState>>(() => ({
    ...(start?.draft ?? {}),
  }));
  // A save in flight, or the read after a refused save: the controls and the save wait for it.
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<AttendanceSheetNotice>();
  const [reload, setReload] = useState(0);
  const keys = useIdempotencyKeys();
  // The rows the draft was chosen on: a row whose state moved since then is someone else's now.
  const base = useRef<readonly AttendanceSheetRow[]>(start?.baseRows ?? []);
  // R-10-04: answers (reads and saves) are shown in request order and never below the version on
  // screen, so a late read cannot bring back a list older than a save.
  const order = useRef({ applied: 0, requested: 0, version: -1 });
  // `saving` as a ref: a second tap or save before the next render is refused as well.
  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Whether the answer to request `seq` is still the newest list to show; if so it is. */
  const accept = useCallback((seq: number, data: Sheet): boolean => {
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
    const data = await transport.read();
    if (!accept(seq, data)) return;
    const previous = base.current;
    base.current = data.rows;
    setState({ sheet: data, status: "ready" });
    setDraft((current) =>
      mergeSheet(data.rows, current, new Set(Object.keys(current)), previous, data.sheet),
    );
  }, [accept, transport]);

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
  const changes = sheet === undefined ? [] : diffSheet(sheet.rows, draft);

  const save = useCallback(async () => {
    if (sheet === undefined || busy.current) return;
    const items = diffSheet(sheet.rows, draft);
    if (items.length === 0) return;
    const body: AttendanceSaveBody = { items, version: sheet.sheet.version };
    busy.current = true;
    setSaving(true);
    setNotice(undefined);
    order.current.requested += 1;
    const seq = order.current.requested;
    try {
      const key = keys.keyFor(body);
      const outcome = await transport.save(body, key);
      // Answered: a later attempt, even with the same payload, is a new request (step 11). No
      // answer yet (offline, or IN_PROGRESS: the first save still runs, E79) keeps the key.
      if (outcome.kind !== "unanswered" && outcome.kind !== "inProgress") keys.forget(body, key);
      if (outcome.kind === "saved") {
        if (accept(seq, outcome.sheet)) {
          base.current = outcome.sheet.rows;
          setState({ sheet: outcome.sheet, status: "ready" });
          setDraft({});
          setNotice({ kind: "saved" });
        }
      } else if (outcome.kind === "stale") {
        // R-10-04: the list as it is now; the caller's own edits go back on the rows the other
        // person did not change, as far as that list allows them.
        const { current } = outcome;
        if (accept(seq, current)) {
          const merged = mergeSheet(
            current.rows,
            draft,
            new Set(Object.keys(draft)),
            sheet.rows,
            current.sheet,
          );
          base.current = current.rows;
          setState({ sheet: current, status: "ready" });
          setDraft(merged);
          setNotice({ kind: "stale" });
        }
      } else if (outcome.kind === "inProgress") {
        // Not the save's answer: the list and the choices stay, and a retry resends the same key
        // with the shared «L'operació encara està en curs…» (CONVENCIONS_API §7, E80).
        if (mounted.current) setNotice({ kind: "inProgress" });
      } else if (mounted.current) {
        setNotice({ code: outcome.code, kind: "error" });
        // Nothing was applied, so the list is read again before the sheet is released; a network
        // failure keeps the list (a retry resends the same key). A failed read keeps it as well.
        if (outcome.kind === "refused") await read().catch(() => undefined);
      }
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  }, [accept, draft, keys, read, sheet, transport]);

  const dismissNotice = useCallback(() => {
    setNotice(undefined);
  }, []);

  return { ...state, changes, choose, dismissNotice, draft, notice, refetch, save, saving };
}
