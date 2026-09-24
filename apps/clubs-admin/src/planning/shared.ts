import { isApiError, type ApiClient, type components } from "@agilityhub/api-client";
import type { ClubFormats } from "@agilityhub/i18n";
import { useCallback, useEffect, useRef, useState } from "react";

export type WeekTemplate = components["schemas"]["WeekTemplate"];
export type WeekTemplateSummary = components["schemas"]["WeekTemplateSummary"];
export type TemplateClass = components["schemas"]["TemplateClass"];
export type TimeBand = components["schemas"]["TimeBand"];
export type DayOfWeek = TemplateClass["dayOfWeek"];
export type TemplateKind = WeekTemplate["kind"];
export type Ring = components["schemas"]["Ring"];
export type Level = components["schemas"]["Level"];
export type Instructor = components["schemas"]["Instructor"];

export const TEMPLATE_STORAGE_KEY = "agilityhub.planning.templates.v1";

const dayOffsets: Readonly<Record<DayOfWeek, number>> = {
  FRIDAY: 4,
  MONDAY: 0,
  SATURDAY: 5,
  SUNDAY: 6,
  THURSDAY: 3,
  TUESDAY: 1,
  WEDNESDAY: 2,
};

export const daysOfWeek = Object.keys(dayOffsets) as DayOfWeek[];

/**
 * Weekday names come from `Intl` through the club formatters (reference ISO week of 2026-08-17,
 * formatted as calendar dates so no club zone moves the weekday — R-06-14).
 */
export function weekdayLabel(
  day: DayOfWeek,
  formatPlainDate: ClubFormats["formatPlainDate"],
  presentation: "weekdayLong" | "weekdayShort",
): string {
  const reference = `2026-08-${String(17 + dayOffsets[day])}`;
  return formatPlainDate(reference, presentation).replaceAll(/[.,]/gu, "");
}

export function sentenceCase(value: string): string {
  return `${value.charAt(0).toLocaleUpperCase()}${value.slice(1)}`;
}

/** Row label: the band start without its leading zero («08:30» → «8:30»). */
export function bandLabel(startTime: string): string {
  return startTime.replace(/^0(?=\d:)/u, "");
}

export function parseDay(value: string | undefined): DayOfWeek | undefined {
  const upper = value?.toUpperCase();
  return daysOfWeek.find((day) => day === upper);
}

export function sortedBands(bands: readonly TimeBand[]): TimeBand[] {
  return [...bands].sort((left, right) => left.startTime.localeCompare(right.startTime));
}

export interface StoredTemplateChoice {
  SATURDAY?: string;
  WEEKDAYS?: string;
}

export function readTemplateChoice(): StoredTemplateChoice {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(TEMPLATE_STORAGE_KEY) ?? "{}");
    if (typeof value !== "object" || value === null) return {};
    const record = value as Record<string, unknown>;
    return {
      ...(typeof record.WEEKDAYS === "string" ? { WEEKDAYS: record.WEEKDAYS } : {}),
      ...(typeof record.SATURDAY === "string" ? { SATURDAY: record.SATURDAY } : {}),
    };
  } catch {
    return {};
  }
}

export function writeTemplateChoice(choice: StoredTemplateChoice): void {
  localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(choice));
}

/** Club-local calendar date (`YYYY-MM-DD`), never the device date (R-06-14). */
export function clubToday(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).format(now);
}

/** Pure UTC arithmetic on a `YYYY-MM-DD` business date (never formatted in a zone). */
export function mondayOf(date: string): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
  return value.toISOString().slice(0, 10);
}

export function errorCode(error: unknown): string | undefined {
  return isApiError(error) ? error.code : undefined;
}

export function fieldOfValidationError(error: unknown): string | undefined {
  if (!isApiError(error) || error.code !== "VALIDATION_ERROR") return undefined;
  const fieldErrors = (error.details as { fieldErrors?: { field?: unknown }[] } | undefined)
    ?.fieldErrors;
  const field = fieldErrors?.[0]?.field;
  return typeof field === "string" ? field : undefined;
}

export interface Resource<Data> {
  data: Data | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
  setData: (data: Data) => void;
}

/** Loads one resource; `load === undefined` keeps it idle. Stale responses are ignored. */
export function useResource<Data>(load: (() => Promise<Data>) | undefined): Resource<Data> {
  const [data, setData] = useState<Data>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(load !== undefined);
  const [request, setRequest] = useState(0);
  const sequence = useRef(0);

  useEffect(() => {
    if (load === undefined) {
      setLoading(false);
      return;
    }
    sequence.current += 1;
    const current = sequence.current;
    setLoading(true);
    load().then(
      (value) => {
        if (current !== sequence.current) return;
        setData(value);
        setError(undefined);
        setLoading(false);
      },
      (cause: unknown) => {
        if (current !== sequence.current) return;
        setError(cause);
        setLoading(false);
      },
    );
  }, [load, request]);

  const reload = useCallback(() => {
    setRequest((value) => value + 1);
  }, []);
  return { data, error, loading, reload, setData };
}

export interface PlanningCatalogs {
  instructors: Instructor[];
  levels: Level[];
  rings: Ring[];
}

export async function loadPlanningCatalogs(client: ApiClient): Promise<PlanningCatalogs> {
  const query = { params: { query: { includeInactive: true } } };
  const [rings, levels, instructors] = await Promise.all([
    client.GET("/rings", query),
    client.GET("/levels", query),
    client.GET("/instructors", query),
  ]);
  return {
    instructors: instructors.data?.items ?? [],
    levels: [...(levels.data?.items ?? [])].sort((left, right) => left.order - right.order),
    rings: [...(rings.data?.items ?? [])].sort((left, right) => left.order - right.order),
  };
}

export function instructorNames(
  item: Pick<TemplateClass, "instructorIds">,
  instructors: readonly Instructor[],
): string {
  return item.instructorIds
    .map((id) => instructors.find((instructor) => instructor.id === id)?.shortName)
    .filter((name): name is string => name !== undefined)
    .join(", ");
}

/** `FormField.error` under `exactOptionalPropertyTypes`: omit the prop when there is no message. */
export function errorProp(message: string | undefined): { error?: string } {
  return message === undefined ? {} : { error: message };
}
