import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isApiError } from "./api-error";
import type { ApiClient } from "./client";
import type { components } from "./generated/schema";

export type RingBlockKind = components["schemas"]["RingBlockCreateRequest"]["kind"];
export type RingBlockReason = components["schemas"]["RingBlockCreateRequest"]["reason"];
export type RingBlockCreateRequest = components["schemas"]["RingBlockCreateRequest"];
export type RingBlockResource = components["schemas"]["RingBlock"];
type RingReader = components["schemas"]["RingReaderView"];
type TrainingSlot = components["schemas"]["TrainingSlot"];

/**
 * The reasons each kind takes (S06 §3, S09 §3 and R-09-11): `ACTIVITY` only through S07, never
 * offered by a form.
 */
export const RING_BLOCK_REASONS_BY_KIND: Readonly<
  Record<RingBlockKind, readonly RingBlockReason[]>
> = {
  BLOCK: ["MAINTENANCE", "OTHER"],
  RESERVATION: ["PRIVATE_CLASS", "THERAPY", "PREPARATION", "OTHER"],
};

/** The kinds a form offers: a `RESERVATION` needs `FREE_TRAINING` (S09 §9), a `BLOCK` does not. */
export function ringBlockKinds(modules: readonly string[]): RingBlockKind[] {
  return modules.includes("FREE_TRAINING") ? ["RESERVATION", "BLOCK"] : ["BLOCK"];
}

/** One of `details.conflicts[]` of a `409 RING_BLOCK_CONFLICT`. */
export interface RingBlockConflict {
  from?: string;
  label?: string;
  to?: string;
  type?: string;
}

/**
 * What a refused ring block means for the form (R-06-11, R-09-11), by `code`:
 * - `conflict`: `409 RING_BLOCK_CONFLICT` with the overlaps to mark;
 * - `bookings`: `RING_HAS_BOOKINGS` with the live training bookings (only an ADMIN may resend
 *   with `cancelBookings: true`);
 * - `time`: the times are wrong (`INVALID_TIME_RANGE`, `INVALID_SLOT_GRANULARITY`,
 *   `OUTSIDE_OPENING_HOURS`);
 * - `general`: anything else, shown with its code's message.
 */
export type RingBlockFailure =
  | { code: string; conflicts: RingBlockConflict[]; kind: "conflict" }
  | { bookings: unknown[]; code: string; kind: "bookings" }
  | { code: string; kind: "general" | "time" };

const TIME_CODES = new Set([
  "INVALID_SLOT_GRANULARITY",
  "INVALID_TIME_RANGE",
  "OUTSIDE_OPENING_HOURS",
]);

export function ringBlockFailure(cause: unknown): RingBlockFailure {
  const code = isApiError(cause) ? cause.code : "INTERNAL_ERROR";
  const details =
    isApiError(cause) && typeof cause.details === "object" && cause.details !== null
      ? (cause.details as Record<string, unknown>)
      : {};
  if (code === "RING_BLOCK_CONFLICT") {
    return {
      code,
      conflicts: Array.isArray(details.conflicts) ? (details.conflicts as RingBlockConflict[]) : [],
      kind: "conflict",
    };
  }
  if (code === "RING_HAS_BOOKINGS") {
    return {
      bookings: Array.isArray(details.bookings) ? details.bookings : [],
      code,
      kind: "bookings",
    };
  }
  return { code, kind: TIME_CODES.has(code) ? "time" : "general" };
}

/** The fields of a new ring block: instants in UTC (the caller reads them in the club zone). */
export interface RingBlockFields {
  from: string;
  kind: RingBlockKind;
  note: string;
  reason: RingBlockReason;
  ringId: string;
  to: string;
}

/** The `POST /ring-blocks` body: a blank note is `null`; `cancelBookings` only when asked for. */
export function ringBlockCreateBody(
  fields: RingBlockFields,
  cancelBookings = false,
): RingBlockCreateRequest & { note: string | null } {
  const note = fields.note.trim();
  return {
    from: fields.from,
    kind: fields.kind,
    note: note === "" ? null : note,
    reason: fields.reason,
    ringId: fields.ringId,
    to: fields.to,
    ...(cancelBookings ? { cancelBookings: true } : {}),
  };
}

/**
 * `POST /ring-blocks` (R-06-11, R-09-11). `idempotencyKey` is the payload's key: the caller keeps
 * one key per body (CONVENCIONS_API §7), so a retry of the same body replays its answer and any
 * other body gets a new one.
 */
export async function createRingBlock(
  client: ApiClient,
  body: RingBlockCreateRequest,
  idempotencyKey: string,
) {
  const result = await client.POST("/ring-blocks", {
    body,
    params: { header: { "Idempotency-Key": idempotencyKey } },
  });
  if (result.data === undefined)
    throw new TypeError("The ring block response did not contain data");
  return result.data;
}

/**
 * `ringBlocks.maxHorizonDays` (CATALEG_PARAMETRES, 60): the days screen 24 and the D12 card offer.
 * An INSTRUCTOR cannot read `/parameters`, so the forms use the catalog default and the api
 * refuses a later day (R-09-11).
 */
export const RING_BLOCK_HORIZON_DAYS = 60;

/** The end of the club-local day: a block may end at midnight (the next day's `00:00`). */
export const RING_BLOCK_DAY_END = "24:00";

function minutesOfTime(time: string): number {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function timeOfMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * The times of a form without a grid (`FREE_TRAINING` off, or a ring the api leaves out): every
 * half-hour start in `[from, to)` and every end up to `to` included, so the last half hour can be
 * taken (13:30–14:00 in the morning band). The api validates them (R-09-11).
 */
export function ringBlockFallbackTimes(
  from = "00:00",
  to: string = RING_BLOCK_DAY_END,
): { ends: string[]; starts: string[] } {
  const starts: string[] = [];
  const ends: string[] = [];
  for (let minute = minutesOfTime(from); minute + 30 <= minutesOfTime(to); minute += 30) {
    starts.push(timeOfMinutes(minute));
    ends.push(timeOfMinutes(minute + 30));
  }
  return { ends, starts };
}

/** `{date}T{time}` club-local for a form's time; the day's end (`24:00`) is the next day's `00:00`. */
export function ringBlockLocalDateTime(date: string, time: string): string {
  if (time !== RING_BLOCK_DAY_END) return `${date}T${time}`;
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return `${next.toISOString().slice(0, 10)}T00:00`;
}

/** A ring of the forms: every active ring (R-09-02, blocks go to any active ring). */
export interface RingBlockRing {
  color: string;
  id: string;
  name: string;
  order: number;
}

type Load<Data> =
  | { data: Data; error?: undefined; status: "ready" }
  | { data?: undefined; error: unknown; status: "error" }
  | { data?: undefined; error?: undefined; status: "loading" };

/** A ring of the club's catalog, active or not (a list names the ring of a past block). */
export interface ClubRing extends RingBlockRing {
  active: boolean;
}

/**
 * `GET /rings` (S05) in catalog order (`order`, then the name). `includeInactive` asks for the
 * deactivated rings too (ADMIN only, S05 §6); `activeOnly` keeps the active ones.
 */
function useRingCatalog(client: ApiClient, includeInactive: boolean, activeOnly: boolean) {
  const [state, setState] = useState<Load<ClubRing[]>>({ status: "loading" });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let current = true;
    client
      .GET("/rings", includeInactive ? { params: { query: { includeInactive: true } } } : {})
      .then(
        ({ data }) => {
          if (!current) return;
          const items: readonly RingReader[] = data?.items ?? [];
          setState({
            data: items
              .filter((ring) => !activeOnly || ring.active)
              .sort(
                (left, right) => left.order - right.order || left.name.localeCompare(right.name),
              )
              .map((ring) => ({
                active: ring.active,
                color: ring.color,
                id: ring.id,
                name: ring.name,
                order: ring.order,
              })),
            status: "ready",
          });
        },
        (error: unknown) => {
          if (current) setState({ error, status: "error" });
        },
      );
    return () => {
      current = false;
    };
  }, [activeOnly, client, includeInactive, reload]);
  const refetch = useCallback(() => {
    setState({ status: "loading" });
    setReload((value) => value + 1);
  }, []);
  // One object per answer, so a hook or a memo that reads the catalog is not rebuilt at every
  // render (E5-W05 round 2 #1).
  return useMemo(() => ({ ...state, refetch }), [refetch, state]);
}

/** `GET /rings` (S05): the active rings in catalog order (`order`, then the name). */
export function useActiveRings(client: ApiClient) {
  return useRingCatalog(client, false, true);
}

/**
 * Every ring of the club, a deactivated one included, to name the ring of any block or booking of
 * a list (S09 §13-8). Only an ADMIN may ask for the inactive ones (`includeInactive`, S05 §6); an
 * instructor gets the active ones.
 */
export function useClubRings(client: ApiClient, includeInactive: boolean) {
  return useRingCatalog(client, includeInactive, false);
}

/** One 30-min cell of a ring as the api computed it (INSTRUCTOR projection, R-09-03/R-09-12). */
export interface RingBlockSlot {
  /** `FREE` and not started: a cell the form may take. */
  bookable: boolean;
  cell: components["schemas"]["SlotCell"] | undefined;
  /** Club-local `HH:mm`. */
  end: string;
  /**
   * Taken only by live training bookings and not started: the api answers `RING_HAS_BOOKINGS`,
   * which an ADMIN may force with `cancelBookings` (R-09-13); classes and blocks never.
   */
  forceable: boolean;
  start: string;
  startsAt: string;
}

export type RingBlockGrid =
  | { status: "closed" }
  | { error: unknown; status: "error" }
  | { status: "loading" }
  | { slots: RingBlockSlot[]; status: "ready" }
  /**
   * No grid to draw: `FREE_TRAINING` is off (`/training-slots` answers `404 MODULE_DISABLED`, S09
   * §9) or the api left the ring out of it. The forms then take the times and the api validates.
   */
  | { status: "unavailable" };

function slotOf(slot: TrainingSlot, ringId: string): RingBlockSlot {
  const cell = slot.rings[ringId];
  const future = Date.parse(slot.startsAt) > Date.now();
  return {
    bookable: cell?.state === "FREE" && future,
    cell,
    end: slot.endsAtLocal,
    forceable:
      future &&
      cell?.state === "BOOKED" &&
      (cell.reason === "TRAINING" || cell.reason === "OWN_TRAINING"),
    start: slot.startsAtLocal,
    startsAt: slot.startsAt,
  };
}

/**
 * `GET /training-slots?from={date}&to={date}&ringId=` (S09 §2 row 24): the half-hour cells of one
 * ring on one day. An answer for another day or ring than the fields show now is dropped.
 */
export function useRingBlockGrid(
  client: ApiClient,
  { date, enabled, ringId }: { date: string; enabled: boolean; ringId: string },
) {
  const key = enabled && ringId !== "" && date !== "" ? `${date}|${ringId}` : null;
  const [state, setState] = useState<RingBlockGrid & { key: string | null }>({
    key: null,
    status: "unavailable",
  });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (key === null) return undefined;
    let current = true;
    client.GET("/training-slots", { params: { query: { from: date, ringId, to: date } } }).then(
      ({ data }) => {
        if (!current) return;
        const day = data?.days.find((item) => item.date === date);
        if (!data?.rings.some((ring) => ring.id === ringId)) {
          setState({ key, status: "unavailable" });
        } else if (day === undefined || day.closed) {
          setState({ key, status: "closed" });
        } else {
          setState({ key, slots: day.slots.map((slot) => slotOf(slot, ringId)), status: "ready" });
        }
      },
      (error: unknown) => {
        if (!current) return;
        setState(
          isApiError(error, "MODULE_DISABLED")
            ? { key, status: "unavailable" }
            : { error, key, status: "error" },
        );
      },
    );
    return () => {
      current = false;
    };
  }, [client, date, key, reload, ringId]);
  const refetch = useCallback(() => {
    setReload((value) => value + 1);
  }, []);
  const view: RingBlockGrid =
    key === null ? { status: "unavailable" } : state.key === key ? state : { status: "loading" };
  return { ...view, refetch };
}

export type RingBlockSubmission =
  { block: RingBlockResource; status: "created" } | { failure: RingBlockFailure; status: "failed" };

/**
 * `POST /ring-blocks` for screen 24 and the D12 card (R-09-11): one `Idempotency-Key` per payload,
 * kept only while its outcome is unknown (an answer lost to the network), so a retry replays it
 * instead of creating a second block; any answer drops it, and a changed payload gets its own.
 */
export function useRingBlockSubmit(client: ApiClient) {
  const keys = useRef(new Map<string, string>());
  const [pending, setPending] = useState(false);
  const submit = useCallback(
    async (fields: RingBlockFields, cancelBookings = false): Promise<RingBlockSubmission> => {
      const body = ringBlockCreateBody(fields, cancelBookings);
      const fingerprint = JSON.stringify(body);
      const key = keys.current.get(fingerprint) ?? crypto.randomUUID();
      keys.current.set(fingerprint, key);
      setPending(true);
      try {
        const block = await createRingBlock(client, body, key);
        keys.current.delete(fingerprint);
        return { block, status: "created" };
      } catch (cause) {
        if (!isApiError(cause, "NETWORK")) keys.current.delete(fingerprint);
        return { failure: ringBlockFailure(cause), status: "failed" };
      } finally {
        setPending(false);
      }
    },
    [client],
  );
  return { pending, submit };
}
