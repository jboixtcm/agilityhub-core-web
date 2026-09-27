import { type ApiClient, type components, isApiError } from "@agilityhub/api-client";
import type { SlotCellModel } from "@agilityhub/ui";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

export type TrainingSlots = components["schemas"]["TrainingSlots"];
export type TrainingSlot = components["schemas"]["TrainingSlot"];
export type TrainingRing = components["schemas"]["TrainingRing"];
export type TrainingSummary = components["schemas"]["TrainingSummary"];
export type TrainingBooking = components["schemas"]["TrainingBooking"];
export type CancellableTraining = components["schemas"]["CancellableTraining"];
export type EligibleDog = components["schemas"]["EligibleDog"];
export type SlotCell = components["schemas"]["SlotCell"];

/**
 * S09 §13-12: the morning/afternoon cut of 08 and 24 is a presentation constant of the front
 * (14:00 club-local), not a business rule; an empty section is not drawn.
 */
export const AFTERNOON_STARTS_AT = "14:00";

/**
 * `GET /training-slots` asks for a month: a MEMBER's interval is cut by the api to
 * `[today, today + training.bookingWindowDays]` (R-09-04), a parameter the member cannot read, so
 * the front never computes the window; 31 days is the api's longest interval.
 */
export const TRAINING_REQUEST_DAYS = 31;

export type Band = "afternoon" | "morning";

/** The band of a club-local `HH:mm` (the 14:00 cut above). */
export function bandOf(time: string): Band {
  return time < AFTERNOON_STARTS_AT ? "morning" : "afternoon";
}

/** R-06-14: the club-local calendar date of now, never the device's. */
export function clubToday(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).format(now);
}

/** A business date plus `days`, in pure UTC arithmetic (never formatted in a zone). */
export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** «8:30» from «08:30» (the mockups' times). */
export function shortTime(time: string): string {
  return time.replace(/^0(?=\d:)/u, "");
}

/** The navigator's connection state, kept in sync with the `online`/`offline` events. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("online", onChange);
      window.addEventListener("offline", onChange);
      return () => {
        window.removeEventListener("online", onChange);
        window.removeEventListener("offline", onChange);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

// `setTimeout` holds at most 2^31 − 1 ms (~24.8 days): a later deadline is reached in steps.
const MAX_TIMER_MS = 2_147_483_647;

/**
 * The clock, read again when the next of `deadlines` passes (the detail's `cancellableUntil` and
 * `endsAt`), so the page changes without a remount.
 */
export function useNowUntil(deadlines: readonly number[]): number {
  const [now, setNow] = useState(() => Date.now());
  const next = deadlines
    .filter((deadline) => Number.isFinite(deadline) && deadline > now)
    .sort((left, right) => left - right)[0];
  useEffect(() => {
    if (next === undefined) return undefined;
    const timer = window.setTimeout(
      () => {
        setNow(Date.now());
      },
      Math.min(Math.max(next - Date.now(), 0), MAX_TIMER_MS),
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, [next, now]);
  return now;
}

/** Calls `onFocus` when the tab comes back (S09 §2: the grid is read again on focus). */
export function useWindowFocus(onFocus: () => void): void {
  const latest = useRef(onFocus);
  useEffect(() => {
    latest.current = onFocus;
  }, [onFocus]);
  useEffect(() => {
    const handle = () => {
      if (document.visibilityState !== "hidden") latest.current();
    };
    window.addEventListener("focus", handle);
    document.addEventListener("visibilitychange", handle);
    return () => {
      window.removeEventListener("focus", handle);
      document.removeEventListener("visibilitychange", handle);
    };
  }, []);
}

export type CachedLoad<Data> =
  | { data: Data; error?: undefined; stale: boolean; status: "ready" }
  | { data?: undefined; error: unknown; stale: false; status: "error" }
  | { data?: undefined; error?: undefined; stale: false; status: "loading" };

/** Last answers of this tab, per request key: what 08 shows offline (S09 §2 «sense connexió»). */
const lastAnswers = new Map<string, unknown>();

function networkFailure(error: unknown): boolean {
  return isApiError(error, "NETWORK") || !navigator.onLine;
}

/**
 * A read keyed by `key` (an answer that arrives after the key changed is dropped). A failed read
 * without network falls back to this tab's last answer for the key, marked `stale`; `refetch`
 * keeps the current data on screen while it reloads.
 */
export function useCachedLoad<Data>(key: string | null, load: () => Promise<Data>) {
  const [state, setState] = useState<CachedLoad<Data> & { key: string | null }>({
    key: null,
    stale: false,
    status: "loading",
  });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (key === null) return undefined;
    let current = true;
    setState((previous) =>
      previous.key === key && previous.status === "ready"
        ? previous
        : { key, stale: false, status: "loading" },
    );
    load().then(
      (data) => {
        if (!current) return;
        lastAnswers.set(key, data);
        setState({ data, key, stale: false, status: "ready" });
      },
      (error: unknown) => {
        if (!current) return;
        const cached = lastAnswers.get(key) as Data | undefined;
        setState(
          cached !== undefined && networkFailure(error)
            ? { data: cached, key, stale: true, status: "ready" }
            : { error, key, stale: false, status: "error" },
        );
      },
    );
    return () => {
      current = false;
    };
  }, [key, load, reload]);
  const refetch = useCallback(() => {
    setReload((value) => value + 1);
  }, []);
  // A state of another key is never shown: the new key reads as loading until it lands.
  const view: CachedLoad<Data> = state.key === key ? state : { stale: false, status: "loading" };
  return { ...view, refetch };
}

function required<Data>(data: Data | undefined): Data {
  if (data === undefined) throw new TypeError("The response did not contain data");
  return data;
}

/**
 * `GET /me/training-summary` (S09 §6): without `dogId` the eligible dogs and the default one;
 * with `dogId` and `date` the counter of that day's training week (R-09-05, by session date).
 */
export function useTrainingSummary(
  client: ApiClient,
  dogId: string | null,
  date: string | null,
  enabled = true,
) {
  const load = useCallback(
    async () =>
      required(
        (
          await client.GET("/me/training-summary", {
            params: {
              query: {
                ...(dogId === null ? {} : { dogId }),
                ...(date === null ? {} : { date }),
              },
            },
          })
        ).data,
      ),
    [client, date, dogId],
  );
  return useCachedLoad(enabled ? `summary|${dogId ?? ""}|${date ?? ""}` : null, load);
}

/** `GET /training-slots?from={today}&to=…&dogId=` once for the whole window (S09 §2 step 2). */
export function useTrainingSlots(client: ApiClient, dogId: string | null, today: string) {
  const load = useCallback(
    async () =>
      required(
        (
          await client.GET("/training-slots", {
            params: {
              query: {
                from: today,
                to: addDays(today, TRAINING_REQUEST_DAYS),
                ...(dogId === null ? {} : { dogId }),
              },
            },
          })
        ).data,
      ),
    [client, dogId, today],
  );
  return useCachedLoad(dogId === null ? null : `slots|${dogId}|${today}`, load);
}

export function useTrainingBooking(client: ApiClient, id: string) {
  const load = useCallback(
    async () =>
      required((await client.GET("/training-bookings/{id}", { params: { path: { id } } })).data),
    [client, id],
  );
  return useCachedLoad(`booking|${id}`, load);
}

/**
 * The «Entrenaments» tab (S09 §2 row 08, T-09-37): only with `FREE_TRAINING` and a non-empty
 * `eligibleDogs` of `GET /me/training-summary`; hidden while unknown and after any refusal.
 */
export function useTrainingTab(client: ApiClient, enabled: boolean): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (!enabled) return undefined;
    let current = true;
    client.GET("/me/training-summary").then(
      ({ data }) => {
        if (current) setAvailable((data?.eligibleDogs.length ?? 0) > 0);
      },
      () => {
        if (current) setAvailable(false);
      },
    );
    return () => {
      current = false;
    };
  }, [client, enabled]);
  return enabled && available;
}

/** The rings whose cell is `FREE` at a slot, in the api's (catalog) order (R-09-07). */
export function freeRingsOf(slot: TrainingSlot, rings: readonly TrainingRing[]): TrainingRing[] {
  return rings.filter((ring) => slot.rings[ring.id]?.state === "FREE");
}

export const ANY_COLUMN = "__any__";

/**
 * «Qualsevol» (S09 §6): one cell per slot — free when `anyFree` (and `bookable`), «classe» when
 * every ring is a class, struck otherwise.
 */
export function anyCell(slot: TrainingSlot, rings: readonly TrainingRing[]): SlotCellModel {
  const id = `${ANY_COLUMN}_${slot.startsAt}`;
  if (slot.anyFree) return { bookable: slot.bookable, columnId: ANY_COLUMN, id, state: "FREE" };
  const cells = rings.map((ring) => slot.rings[ring.id]);
  const allClass = cells.length > 0 && cells.every((cell) => cell?.reason === "CLASS");
  // Struck without a reason: the rings may be taken for different ones.
  return allClass
    ? { columnId: ANY_COLUMN, id, reason: "CLASS", state: "BLOCKED" }
    : { columnId: ANY_COLUMN, id, reason: null, state: "BOOKED" };
}

/** A ring's own cell (`{ringId}_{startsAt}`, the api's `slotId`). */
export function ringCell(slot: TrainingSlot, ringId: string): SlotCellModel {
  const cell = slot.rings[ringId];
  return {
    bookable: cell?.state === "FREE" && slot.bookable,
    columnId: ringId,
    id: `${ringId}_${slot.startsAt}`,
    reason: cell?.reason ?? null,
    state: cell?.state ?? "BOOKED",
  };
}

/** The error code of a refusal (`NETWORK` without an answer), never its status or `message`. */
export function codeOf(error: unknown): string {
  return isApiError(error) ? error.code : "INTERNAL_ERROR";
}

export function detailsOf(error: unknown): Record<string, unknown> {
  return isApiError(error) && typeof error.details === "object" && error.details !== null
    ? (error.details as Record<string, unknown>)
    : {};
}
