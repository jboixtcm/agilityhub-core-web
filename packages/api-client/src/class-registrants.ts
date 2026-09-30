import { useCallback, useEffect, useState } from "react";

import type { ApiClient } from "./client";
import type { components } from "./generated/schema";

export type ClassBookingItem = components["schemas"]["ClassBookingItem"];
export type ClassWaitlistEntry = components["schemas"]["WaitlistEntry"];

/**
 * S10 R-10-00 for a staff-read waiting entry (E5-T29): the «{guia}» of «{guia} + {gos}» is the
 * dog's `handlerName`, else the member's first name (`memberFirstName`); empty when the api sends
 * neither, so the line names the dog alone.
 */
export function waitlistEntryGuide(entry: ClassWaitlistEntry): string {
  return entry.handlerName ?? entry.memberFirstName ?? "";
}

/** The waiting entries that still hold their place (R-08-12): the rest are history. */
export function isLiveWaitlistEntry(entry: ClassWaitlistEntry): boolean {
  return entry.state === "ACTIVE" || entry.state === "NOTIFIED";
}

export type ClassRegistrants =
  | { status: "loading" }
  | { error: unknown; status: "error" }
  | {
      bookings: ClassBookingItem[];
      status: "ready";
      /** `null`: the club has no waiting list (`WAITLIST` off), so it was not asked for. */
      waitlist: ClassWaitlistEntry[] | null;
    };

/**
 * The registrants of a class for D4, screen 23 and D12 (S08 §6): `GET /class-sessions/{id}/bookings`
 * (every booking, any state, as the api orders them) and, with `WAITLIST`, `GET
 * /class-sessions/{id}/waitlist-entries` (every entry in position order). INSTRUCTOR and ADMIN read
 * both; an answer for another class than the one shown now is dropped.
 */
export function useClassRegistrants(
  client: ApiClient,
  classSessionId: string,
  waitlistEnabled: boolean,
) {
  const [reload, setReload] = useState(0);
  const key = `${classSessionId}|${String(waitlistEnabled)}|${String(reload)}`;
  const [state, setState] = useState<ClassRegistrants & { key: string }>({
    key: "",
    status: "loading",
  });

  useEffect(() => {
    let current = true;
    const path = { params: { path: { id: classSessionId } } };
    Promise.all([
      client.GET("/class-sessions/{id}/bookings", path),
      waitlistEnabled
        ? client.GET("/class-sessions/{id}/waitlist-entries", path)
        : Promise.resolve(undefined),
    ]).then(
      ([bookings, waitlist]) => {
        if (!current) return;
        if (
          bookings.data === undefined ||
          (waitlist !== undefined && waitlist.data === undefined)
        ) {
          setState({
            error: new TypeError("Registrants response without data"),
            key,
            status: "error",
          });
          return;
        }
        setState({
          bookings: bookings.data.items,
          key,
          status: "ready",
          waitlist: waitlist === undefined ? null : waitlist.data.items,
        });
      },
      (error: unknown) => {
        if (current) setState({ error, key, status: "error" });
      },
    );
    return () => {
      current = false;
    };
  }, [classSessionId, client, key, waitlistEnabled]);

  const refetch = useCallback(() => {
    setReload((value) => value + 1);
  }, []);
  // A refetch keeps the rows on screen until its answer arrives; another class starts empty.
  const view: ClassRegistrants =
    state.key === key || state.key.startsWith(`${classSessionId}|${String(waitlistEnabled)}|`)
      ? state
      : { status: "loading" };
  return { ...view, refetch };
}

/**
 * [Treu de la llista] (R-08-16, ADMIN): `POST /waitlist-entries/{id}/cancellation`; the api records
 * `cancelReason = ADMIN`. Errors arrive as `ApiError` (`WAITLIST_ENTRY_NOT_LIVE` …).
 */
export async function removeWaitlistEntry(client: ApiClient, entryId: string) {
  const result = await client.POST("/waitlist-entries/{id}/cancellation", {
    params: { path: { id: entryId } },
  });
  if (result.data === undefined) throw new TypeError("The waitlist response did not contain data");
  return result.data;
}
