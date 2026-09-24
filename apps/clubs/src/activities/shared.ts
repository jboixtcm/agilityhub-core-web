import type { ApiClient, components } from "@agilityhub/api-client";
import { useCallback, useEffect, useState } from "react";

export type MeActivities = components["schemas"]["MeActivities"];
export type ActivityRow = components["schemas"]["ActivityRow"];
export type ActivityRegistration = components["schemas"]["ActivityRegistration"];
export type ActivityRegistrationSummary = components["schemas"]["ActivityRegistrationSummary"];
export type MemberActivityDetail = components["schemas"]["MemberActivityDetail"];
export type ActivityState = components["schemas"]["Activity"]["state"];

const LOCAL_DATE_TIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/u;

/**
 * Hours of a club-local `startsAtLocal`/`endsAtLocal` pair (S07 form B): the api writes
 * `T00:00` without hours and repeats the start (or `T23:59`) without an end.
 */
export function localHours(
  startsAtLocal: string,
  endsAtLocal: string,
): { end: string | null; start: string | null } {
  const start = LOCAL_DATE_TIME.exec(startsAtLocal)?.[2] ?? null;
  const end = LOCAL_DATE_TIME.exec(endsAtLocal)?.[2] ?? null;
  if (start === null || start === "00:00") return { end: null, start: null };
  return { end: end === null || end === start || end === "23:59" ? null : end, start };
}

export type LoadState<Data> =
  | { data: Data; error?: undefined; status: "ready" }
  | { data?: undefined; error: unknown; status: "error" }
  | { data?: undefined; error?: undefined; status: "loading" };

/** `GET /me/activities` (S07 §6): the open activities (04) and the member's live ones (03). */
export function useMeActivities(client: ApiClient, enabled: boolean) {
  const [state, setState] = useState<LoadState<MeActivities>>({ status: "loading" });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    let current = true;
    void client.GET("/me/activities").then(
      (result) => {
        if (!current) return;
        setState(
          result.data === undefined
            ? { error: new TypeError("Missing activities"), status: "error" }
            : { data: result.data, status: "ready" },
        );
      },
      (error: unknown) => {
        if (current) setState({ error, status: "error" });
      },
    );
    return () => {
      current = false;
    };
  }, [client, enabled, reload]);
  const refetch = useCallback(() => {
    setReload((value) => value + 1);
  }, []);
  return { ...state, refetch };
}
