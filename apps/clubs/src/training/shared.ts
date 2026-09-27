import { type ApiClient, type components, isApiError } from "@agilityhub/api-client";
import { useSession } from "@agilityhub/auth";
import { type SlotCellModel, useBranding } from "@agilityhub/ui";
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

const LOADING: CachedLoad<never> = { stale: false, status: "loading" };

/**
 * Whose answers the offline copy holds (S09 §6, tenant isolation): the club, the session's account
 * and member, and whether the session is an impersonation (the admin's own answers are never read
 * as the member's). Signed out it is `null`, and nothing is read or kept.
 */
export function useTrainingCacheScope(): string | null {
  const { me, status } = useSession();
  const branding = useBranding();
  if (status !== "signedIn" || me === null) return null;
  return JSON.stringify([
    branding.club.slug,
    me.membership?.clubId ?? null,
    me.account.id,
    me.membership?.memberId ?? null,
    me.impersonation === undefined ? "self" : "impersonated",
  ]);
}

/** Last answers of this tab, per scope and request key: what 08 shows offline (S09 §2). */
const lastAnswers = new Map<string, unknown>();
let cacheScope: string | null = null;

function scopedKey(scope: string, key: string): string {
  return `${scope}\n${key}`;
}

/**
 * The identity changed (logout, another account, the start or the end of an impersonation): every
 * kept answer and the shared eligibility are dropped. The first reader of the new scope clears.
 */
export function syncTrainingCacheScope(scope: string | null): void {
  if (scope === cacheScope) return;
  cacheScope = scope;
  lastAnswers.clear();
  resetEligibility(scope);
}

/** The app shell's guard: clears the training cache on every identity change, even off 08. */
export function useTrainingCacheIdentity(): void {
  const scope = useTrainingCacheScope();
  useEffect(() => {
    syncTrainingCacheScope(scope);
  }, [scope]);
}

function networkFailure(error: unknown): boolean {
  return isApiError(error, "NETWORK") || !navigator.onLine;
}

/**
 * The refusals that say the member's training rights changed (R-09-01, S09 §7 and §9): the module
 * is off, the dog lost the right or is no longer the member's, or the route is forbidden.
 */
const RIGHTS_REFUSALS = new Set([
  "DOG_NOT_ACCESSIBLE",
  "DOG_NOT_ALLOWED",
  "FORBIDDEN",
  "MODULE_DISABLED",
]);

/** Any training read or write that ends in a rights refusal asks the eligibility again. */
export function reportTrainingRefusal(error: unknown): void {
  if (RIGHTS_REFUSALS.has(codeOf(error))) loadEligibility(true);
}

/**
 * A read keyed by `key` and by the session's scope (an answer that arrives after either changed is
 * dropped). A failed read without network falls back to this tab's last answer for the same scope
 * and key, marked `stale`; `refetch` keeps the current data on screen while it reloads.
 */
export function useCachedLoad<Data>(key: string | null, load: () => Promise<Data>) {
  const scope = useTrainingCacheScope();
  const fullKey = key === null || scope === null ? null : scopedKey(scope, key);
  const [state, setState] = useState<CachedLoad<Data> & { key: string | null }>({
    key: null,
    stale: false,
    status: "loading",
  });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (fullKey === null) return undefined;
    syncTrainingCacheScope(scope);
    let current = true;
    setState((previous) =>
      previous.key === fullKey && previous.status === "ready"
        ? previous
        : { key: fullKey, stale: false, status: "loading" },
    );
    load().then(
      (data) => {
        if (!current) return;
        // An answer for a scope that is no longer the session's is not kept.
        if (cacheScope === scope) lastAnswers.set(fullKey, data);
        setState({ data, key: fullKey, stale: false, status: "ready" });
      },
      (error: unknown) => {
        if (!current) return;
        const cached = lastAnswers.get(fullKey) as Data | undefined;
        setState(
          cached !== undefined && networkFailure(error)
            ? { data: cached, key: fullKey, stale: true, status: "ready" }
            : { error, key: fullKey, stale: false, status: "error" },
        );
        reportTrainingRefusal(error);
      },
    );
    return () => {
      current = false;
    };
  }, [fullKey, load, reload, scope]);
  const refetch = useCallback(() => {
    setReload((value) => value + 1);
  }, []);
  // A state of another key or scope is never shown: the new one reads as loading until it lands.
  const view: CachedLoad<Data> = fullKey !== null && state.key === fullKey ? state : LOADING;
  return { ...view, refetch };
}

interface EligibilitySnapshot {
  /** The app instance's api client the answer belongs to (a remount brings its own). */
  client: ApiClient | undefined;
  scope: string | null;
  state: CachedLoad<TrainingSummary>;
}

/**
 * The shared eligibility query (S09 §2 row 08, R-09-01): one `GET /me/training-summary` without a
 * dog for the shell's tab and for 08, read again on focus and after a rights refusal.
 */
const eligibility: {
  /** The newest request: an older answer is dropped. */
  generation: number;
  inflight: boolean;
  /** Asked again (forced) while a request was out: one more after it. */
  queued: boolean;
  requested: boolean;
  snapshot: EligibilitySnapshot;
} = {
  generation: 0,
  inflight: false,
  queued: false,
  requested: false,
  snapshot: { client: undefined, scope: null, state: LOADING },
};
const eligibilityListeners = new Set<() => void>();

function publishEligibility(state: CachedLoad<TrainingSummary>): void {
  eligibility.snapshot = { ...eligibility.snapshot, state };
  for (const listener of eligibilityListeners) listener();
}

function resetEligibility(
  scope: string | null,
  client: ApiClient | undefined = eligibility.snapshot.client,
): void {
  eligibility.generation += 1;
  eligibility.inflight = false;
  eligibility.queued = false;
  eligibility.requested = false;
  eligibility.snapshot = { client, scope, state: LOADING };
  for (const listener of eligibilityListeners) listener();
}

function loadEligibility(force: boolean): void {
  const { client, scope } = eligibility.snapshot;
  if (client === undefined || scope === null) return;
  if (eligibility.inflight) {
    // A focus while a read is out shares it; a refusal needs an answer given after it.
    if (force) eligibility.queued = true;
    return;
  }
  eligibility.inflight = true;
  eligibility.requested = true;
  eligibility.generation += 1;
  const generation = eligibility.generation;
  const key = scopedKey(scope, "eligibility");
  const settle = (state: CachedLoad<TrainingSummary>) => {
    if (generation !== eligibility.generation) return;
    eligibility.inflight = false;
    publishEligibility(state);
    if (eligibility.queued) {
      eligibility.queued = false;
      loadEligibility(false);
    }
  };
  client.GET("/me/training-summary").then(
    ({ data }) => {
      if (data === undefined) {
        settle({
          error: new TypeError("The response did not contain data"),
          stale: false,
          status: "error",
        });
        return;
      }
      if (generation === eligibility.generation) lastAnswers.set(key, data);
      settle({ data, stale: false, status: "ready" });
    },
    (error: unknown) => {
      const cached = lastAnswers.get(key) as TrainingSummary | undefined;
      settle(
        cached !== undefined && networkFailure(error)
          ? { data: cached, stale: true, status: "ready" }
          : { error, stale: false, status: "error" },
      );
    },
  );
}

function subscribeEligibility(listener: () => void): () => void {
  eligibilityListeners.add(listener);
  return () => {
    eligibilityListeners.delete(listener);
  };
}

function eligibilitySnapshot(): EligibilitySnapshot {
  return eligibility.snapshot;
}

/**
 * The member's dogs with the right to train alone and the default one (R-09-01, R-09-09), shared
 * by the shell and 08; `enabled = false` reads nothing (a staff-only session).
 */
export function useTrainingEligibility(client: ApiClient, enabled = true) {
  const scope = useTrainingCacheScope();
  const snapshot = useSyncExternalStore(
    subscribeEligibility,
    eligibilitySnapshot,
    eligibilitySnapshot,
  );
  const active = enabled && scope !== null;
  useEffect(() => {
    if (!active) return;
    syncTrainingCacheScope(scope);
    // Another app instance (its own api client) asks again: it never shows the previous
    // instance's answer (the offline copy of the same scope is kept).
    if (eligibility.snapshot.client !== client) resetEligibility(scope, client);
    if (!eligibility.requested) loadEligibility(false);
  }, [active, client, scope]);
  const refetch = useCallback(() => {
    const current = eligibility.snapshot;
    if (active && current.scope === scope && current.client === client) loadEligibility(false);
  }, [active, client, scope]);
  useWindowFocus(refetch);
  const view: CachedLoad<TrainingSummary> =
    active && snapshot.scope === scope && snapshot.client === client ? snapshot.state : LOADING;
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
 * `eligibleDogs` of the shared eligibility (read again on focus and after a rights refusal);
 * hidden while unknown and after any refusal.
 */
export function useTrainingTab(client: ApiClient, enabled: boolean): boolean {
  const eligibility = useTrainingEligibility(client, enabled);
  return enabled && eligibility.status === "ready" && eligibility.data.eligibleDogs.length > 0;
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
