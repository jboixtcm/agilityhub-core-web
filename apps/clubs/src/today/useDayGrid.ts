import type { ApiClient, components } from "@agilityhub/api-client";
import { parsePlainDate } from "@agilityhub/i18n";
import { useBranding } from "@agilityhub/ui";
import { useCallback, useEffect, useState } from "react";

export type DayGridResponse = components["schemas"]["DayGrid"];
export type DayGridApiCell = components["schemas"]["DayGridCell"];
export type DayGridViewParam = "instructor" | "member";

/** Midnight UTC of a (valid) business date: pure UTC arithmetic, never formatted in a zone. */
function utcDay(date: string): Date {
  const value = parsePlainDate(date);
  if (value === undefined) throw new RangeError(`Invalid plain date: ${date}`);
  return value;
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

export function addDays(date: string, days: number): string {
  const next = utcDay(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/** Monday → Saturday of the ISO week of `date` (the chips dl–ds; Sunday only by the arrows). */
export function weekChipDates(date: string): string[] {
  const offset = (utcDay(date).getUTCDay() + 6) % 7;
  const monday = addDays(date, -offset);
  return [0, 1, 2, 3, 4, 5].map((day) => addDays(monday, day));
}

function writeDateToLocation(date: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set("date", date);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
}

/**
 * `?date=` when it is a real date; otherwise the club-local today. A present but invalid value
 * («2026-13-01», «hola») is replaced in the address so a shared link never crashes the page.
 */
function initialDate(timeZone: string): string {
  const value = new URLSearchParams(window.location.search).get("date");
  if (value === null) return clubToday(timeZone);
  if (parsePlainDate(value) !== undefined) return value;
  const today = clubToday(timeZone);
  writeDateToLocation(today);
  return today;
}

type DayGridState =
  | { error: unknown; grid?: undefined; status: "error" }
  | { error?: undefined; grid: DayGridResponse; status: "ready" }
  | { error?: undefined; grid?: undefined; status: "loading" };

/** Selected day (`?date=` or the club-local today) + `GET /day-grid` of that day. */
export function useDayGrid(client: ApiClient, view: DayGridViewParam) {
  const { timeZone } = useBranding();
  const [date, setDateState] = useState(() => initialDate(timeZone));
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
    writeDateToLocation(next);
  }, []);

  const refetch = useCallback(() => {
    setReload((current) => current + 1);
  }, []);

  return { date, refetch, setDate, ...state };
}
