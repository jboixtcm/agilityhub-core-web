import type { ApiClient, components } from "@agilityhub/api-client";
import { useCallback, useEffect, useState } from "react";

export type MeActivities = components["schemas"]["MeActivities"];
export type ActivityRow = components["schemas"]["ActivityRow"];
export type ActivityRegistration = components["schemas"]["ActivityRegistration"];
export type ActivityRegistrationSummary = components["schemas"]["ActivityRegistrationSummary"];
export type MemberActivityDetail = components["schemas"]["MemberActivityDetail"];
export type ActivityState = components["schemas"]["Activity"]["state"];

/** A path segment decoded, or as it came when it is malformed (`/activitats/%E0`). */
export function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
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
    setState({ status: "loading" });
    setReload((value) => value + 1);
  }, []);
  return { ...state, refetch };
}
