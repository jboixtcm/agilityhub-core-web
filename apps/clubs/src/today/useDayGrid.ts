import type { ApiClient, components } from "@agilityhub/api-client";
import { useBranding } from "@agilityhub/ui";
import { useCallback, useEffect, useState } from "react";

export type DayGridResponse = components["schemas"]["DayGrid"];
export type DayGridApiCell = components["schemas"]["DayGridCell"];
export type DayGridViewParam = "instructor" | "member";

const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/u;

/** Noon UTC keeps the same calendar day in every club time zone between UTC−11 and UTC+11. */
export function dateAtNoon(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

/** R-06-14: «today» is the club's local date, never the device's. */
export function clubToday(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).format(now);
}

export function isPlainDate(value: string | null | undefined): value is string {
  if (value === null || value === undefined || !PLAIN_DATE.test(value)) return false;
  return dateAtNoon(value).toISOString().slice(0, 10) === value;
}

export function addDays(date: string, days: number): string {
  const next = dateAtNoon(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/** Monday → Saturday of the ISO week of `date` (the chips dl–ds; Sunday only by the arrows). */
export function weekChipDates(date: string): string[] {
  const offset = (dateAtNoon(date).getUTCDay() + 6) % 7;
  const monday = addDays(date, -offset);
  return [0, 1, 2, 3, 4, 5].map((day) => addDays(monday, day));
}

function dateFromLocation(): string | undefined {
  const value = new URLSearchParams(window.location.search).get("date");
  return isPlainDate(value) ? value : undefined;
}

type DayGridState =
  | { error: unknown; grid?: undefined; status: "error" }
  | { error?: undefined; grid: DayGridResponse; status: "ready" }
  | { error?: undefined; grid?: undefined; status: "loading" };

/** Selected day (`?date=` or the club-local today) + `GET /day-grid` of that day. */
export function useDayGrid(client: ApiClient, view: DayGridViewParam) {
  const { timeZone } = useBranding();
  const [date, setDateState] = useState(() => dateFromLocation() ?? clubToday(timeZone));
  const [state, setState] = useState<DayGridState>({ status: "loading" });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    client.GET("/day-grid", { params: { query: { date, view } } }).then(
      ({ data, error }) => {
        if (!active) return;
        setState(data === undefined ? { error, status: "error" } : { grid: data, status: "ready" });
      },
      (error: unknown) => {
        if (active) setState({ error, status: "error" });
      },
    );
    return () => {
      active = false;
    };
  }, [client, date, reload, view]);

  const setDate = useCallback((next: string) => {
    setDateState(next);
    const url = new URL(window.location.href);
    url.searchParams.set("date", next);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  }, []);

  const refetch = useCallback(() => {
    setReload((current) => current + 1);
  }, []);

  return { date, refetch, setDate, ...state };
}
