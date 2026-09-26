import type { ApiClient } from "@agilityhub/api-client";
import { useEffect, useState } from "react";

import {
  type BookableClass,
  type BookableDog,
  navigateInApp,
  type SeatHoldResponse,
} from "./shared";

/** A live seat hold (R-08-07) as `/reservar/confirmar` paints it (06/29). */
export interface HeldSeat {
  hold: SeatHoldResponse;
  kind: "hold";
  /** The device clock when the hold arrived: with `serverNow` it cancels a skewed device clock. */
  receivedAt: number;
  /** The claim of a NOTIFIED waiting entry (R-08-15): the confirmation posts `…/claim`. */
  waitlistEntryId: string | null;
}

/** A hold the api refused with an informative 29 variant (limit done, «Properament», held seat). */
export interface RefusedHold {
  classSession: Pick<
    BookableClass,
    "description" | "endsAtLocal" | "id" | "ringColor" | "ringName" | "startsAtLocal"
  >;
  code: "BOOKING_LIMIT_REACHED" | "CLASS_FULL" | "NOT_YET_OPEN";
  details: Record<string, unknown>;
  dog: Pick<BookableDog, "id" | "name" | "sex">;
}

export type ConfirmState = HeldSeat | (RefusedHold & { kind: "refused" });

export const CONFIRM_PATH = "/reservar/confirmar";

/** The confirmation of the current history entry, or `undefined` (a reload without state). */
export function readConfirmState(): ConfirmState | undefined {
  const state: unknown = window.history.state;
  if (typeof state !== "object" || state === null || !("confirm" in state)) return undefined;
  const confirm = (state as { confirm?: unknown }).confirm;
  if (typeof confirm !== "object" || confirm === null || !("kind" in confirm)) return undefined;
  return confirm as ConfirmState;
}

export function openConfirmation(state: ConfirmState, replace = false): void {
  navigateInApp(CONFIRM_PATH, { confirm: state }, replace);
}

function heldSeat(hold: SeatHoldResponse | undefined, waitlistEntryId: string | null): HeldSeat {
  if (hold === undefined) throw new TypeError("The seat hold response did not contain data");
  return { hold, kind: "hold", receivedAt: Date.now(), waitlistEntryId };
}

/** `POST /seat-holds {classSessionId, dogId}` (R-08-07); a refusal is thrown as its `ApiError`. */
export async function holdSeat(
  client: ApiClient,
  classSessionId: string,
  dogId: string,
): Promise<HeldSeat> {
  const response = await client.POST("/seat-holds", { body: { classSessionId, dogId } });
  return heldSeat(response.data, null);
}

/**
 * [AGAFA LA PLAÇA] of N-15 (R-08-15, screen 11): the hold of a NOTIFIED entry's seat, then this
 * confirmation, which posts `POST /waitlist-entries/{id}/claim`. A refusal is thrown.
 */
export async function startClaim(
  client: ApiClient,
  classSessionId: string,
  dogId: string,
  waitlistEntryId: string,
): Promise<void> {
  const response = await client.POST("/seat-holds", {
    body: { classSessionId, dogId, waitlistEntryId },
  });
  openConfirmation(heldSeat(response.data, waitlistEntryId));
}

/** `DELETE /seat-holds/{id}`: 204 also when the hold is gone; a lost release expires by itself. */
export async function releaseHold(client: ApiClient, holdId: string): Promise<void> {
  try {
    await client.DELETE("/seat-holds/{id}", { params: { path: { id: holdId } } });
  } catch {
    // The hold expires with its TTL (30 s): nothing to tell the member.
  }
}

// Releases scheduled by an unmount, cancelled when the same hold mounts again (React StrictMode
// unmounts and remounts every effect once in development).
const scheduledReleases = new Map<string, number>();

/**
 * Releases the hold when the confirmation leaves the screen (the back gesture, a tab, the ×)
 * unless `keep()` says it was consumed or already released.
 */
export function useReleaseOnLeave(
  client: ApiClient,
  holdId: string | undefined,
  keep: () => boolean,
): void {
  useEffect(() => {
    if (holdId === undefined) return undefined;
    const scheduled = scheduledReleases.get(holdId);
    if (scheduled !== undefined) {
      window.clearTimeout(scheduled);
      scheduledReleases.delete(holdId);
    }
    return () => {
      if (keep()) return;
      scheduledReleases.set(
        holdId,
        window.setTimeout(() => {
          scheduledReleases.delete(holdId);
          void releaseHold(client, holdId);
        }, 0),
      );
    };
  }, [client, holdId, keep]);
}

/**
 * Milliseconds left on a hold (T-08-36): the server's «now» is the device clock plus the offset
 * measured when the hold arrived (`serverNow − receivedAt`), so a device clock minutes ahead or
 * behind still counts 30 s. Ticks every 250 ms and stops at 0.
 */
export function useCountdown(seat: HeldSeat | undefined): number {
  const expiresAt = seat === undefined ? 0 : Date.parse(seat.hold.expiresAt);
  const offset = seat === undefined ? 0 : Date.parse(seat.hold.serverNow) - seat.receivedAt;
  const [left, setLeft] = useState(() =>
    seat === undefined ? 0 : Math.max(0, expiresAt - (Date.now() + offset)),
  );
  useEffect(() => {
    if (seat === undefined) return undefined;
    const tick = () => {
      const remaining = Math.max(0, expiresAt - (Date.now() + offset));
      setLeft(remaining);
      if (remaining === 0) window.clearInterval(timer);
    };
    const timer = window.setInterval(tick, 250);
    return () => {
      window.clearInterval(timer);
    };
  }, [expiresAt, offset, seat]);
  return left;
}

/** «0:26»: whole seconds left, rounded up, as m:ss. */
export function formatCountdown(milliseconds: number): string {
  const seconds = Math.ceil(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, "0")}`;
}
