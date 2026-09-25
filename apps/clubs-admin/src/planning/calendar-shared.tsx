import { isApiError, type ApiClient, type components } from "@agilityhub/api-client";
import { type ClubFormats, isPlainDate } from "@agilityhub/i18n";
import { type ReactNode, useCallback } from "react";
import { useTranslation } from "react-i18next";

import { bandLabel, errorCode } from "./shared";

export type ClassSession = components["schemas"]["ClassSession"];
export type RingBlock = components["schemas"]["RingBlock"];
export type WeekCalendar = components["schemas"]["WeekCalendar"];
export type WeekListItem = components["schemas"]["WeekListItem"];
export type CancellationPreview = components["schemas"]["CancellationPreview"];
export type DayGrid = components["schemas"]["DayGrid"];
export type DayGridCell = components["schemas"]["DayGridCell"];
export type Inconsistency = components["schemas"]["Inconsistency"];

/** Values of `?estat=` (the «·» travels URL-encoded). */
export type CalendarFilter = "actives" | "anul·lades" | "esborrany";

export const calendarFilters: readonly CalendarFilter[] = ["actives", "esborrany", "anul·lades"];

export const apiFilter: Readonly<Record<CalendarFilter, "ACTIVE" | "CANCELLED" | "DRAFT">> = {
  actives: "ACTIVE",
  "anul·lades": "CANCELLED",
  esborrany: "DRAFT",
};

export function parseFilter(value: string | null): CalendarFilter {
  return calendarFilters.find((filter) => filter === value) ?? "actives";
}

/** A real `YYYY-MM-DD` calendar date («2026-02-30» and «2026-13-01» are not). */
export function isIsoDate(value: string | null | undefined): value is string {
  return isPlainDate(value);
}

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function minutesOf(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

export function timeOf(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** `value` rounded up to a multiple of `step`. */
function ceilTo(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

function slotTimes(from: number, to: number, step: number): string[] {
  const options: string[] = [];
  for (let value = ceilTo(from, step); value <= to; value += step) options.push(timeOf(value));
  return options;
}

/**
 * `HH:mm` options on `step` boundaries (multiples of `step` from midnight, S06 §3) between `open`
 * and `close`, both included: an opening at 07:05 with 10-minute slots starts at 07:10.
 */
export function timeOptions(open: string, close: string, step: number): string[] {
  return slotTimes(minutesOf(open), minutesOf(close), Math.max(step, 1));
}

/** One day's window of `club.openingHours` (a closed day has none: R-02-09). */
export interface OpeningWindow {
  close: string;
  open: string;
}

/**
 * Start and end options of a range inside an opening window, both on `step` boundaries (S06 §3):
 * the shortest range is `minimum` rounded up to whole steps (so `to − from` stays a multiple of
 * `step`), the first start is the opening rounded up and the last end is at or before the closing
 * time. A closed day offers none.
 */
export function rangeOptions(
  opening: OpeningWindow | null,
  step: number,
  minimum: number,
): { ends: string[]; starts: string[] } {
  if (opening === null) return { ends: [], starts: [] };
  const size = Math.max(step, 1);
  const shortest = ceilTo(Math.max(minimum, 1), size);
  const open = minutesOf(opening.open);
  const close = minutesOf(opening.close);
  return {
    ends: slotTimes(ceilTo(open, size) + shortest, close, size),
    starts: slotTimes(open, close - shortest, size),
  };
}

/** `value` when it is an option; otherwise the first option after it, or the last one. */
export function clampTime(value: string, options: readonly string[]): string {
  if (options.length === 0 || options.includes(value)) return value;
  return options.find((option) => option > value) ?? options.at(-1) ?? value;
}

function zoneOffsetMinutes(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value ?? 0);
  const local = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );
  return Math.round((local - instant) / 60_000);
}

/**
 * UTC instant of a club-local date + time, computed with the club `timeZone` (R-06-14), with the
 * api's `ZonedDateTime.of` rules: an ambiguous local time (autumn overlap) takes its first
 * occurrence, and a local time inside the spring gap moves forward by the gap length.
 */
export function clubInstant(date: string, time: string, timeZone: string): string {
  const local = Date.parse(`${date}T${time}:00Z`);
  // Every offset the zone uses from wall − 26 h to wall + 26 h (hourly samples): offsets stay
  // within ±14 h, so the samples cover every transition around the real instant.
  const samples = Array.from({ length: 53 }, (_, hour) => {
    const instant = local + (hour - 26) * 3_600_000;
    return { instant, offset: zoneOffsetMinutes(instant, timeZone) };
  });
  const offsets = [...new Set(samples.map((sample) => sample.offset))];
  const valid = offsets
    .map((offset) => local - offset * 60_000)
    .filter((instant) => local - zoneOffsetMinutes(instant, timeZone) * 60_000 === instant);
  if (valid.length > 0) {
    return new Date(Math.min(...valid)).toISOString().replace(".000Z", "Z");
  }
  // Gap: the offset in force before the transition (the last sample whose local time is still
  // earlier than the wall time) moves the wall time forward by the gap length.
  const before =
    samples.filter((sample) => sample.instant + sample.offset * 60_000 < local).at(-1) ??
    samples[0];
  return new Date(local - (before?.offset ?? 0) * 60_000).toISOString().replace(".000Z", "Z");
}

/**
 * The ring, date and times a `RING_HAS_BOOKINGS` answer was computed for (R-06-11): its booking
 * list and [Anul·la les reserves i desa] only apply while the fields still show that placement.
 */
export function placementKey(
  ringId: string | null,
  date: string | undefined,
  start: string,
  end: string,
): string {
  return [ringId ?? "", date ?? "", start, end].join("|");
}

/** «12/08/2026» → «2026-08-12»; `undefined` when it is not a real date. */
export function parseMaskedDate(value: string): string | undefined {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/u.exec(value.trim());
  if (match === null) return undefined;
  const [, day, month, year] = match;
  const iso = `${year ?? ""}-${month ?? ""}-${day ?? ""}`;
  return isIsoDate(iso) && new Date(`${iso}T12:00:00Z`).toISOString().startsWith(iso)
    ? iso
    : undefined;
}

/** Masked typing for `dd/mm/aaaa` (digits only, slashes inserted). */
export function maskDate(value: string): string {
  const digits = value.replace(/\D/gu, "").slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)]
    .filter((part) => part !== "")
    .join("/");
}

export function formatMaskedDate(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

/** «dc 12»: short weekday of the club formatter (as a calendar date, R-06-14) + day number. */
export function dayLabel(date: string, formatPlainDate: ClubFormats["formatPlainDate"]): string {
  const weekday = formatPlainDate(date, "weekdayShort").replaceAll(/[.,]/gu, "");
  return `${weekday} ${String(Number(date.slice(8, 10)))}`;
}

export function timeLabel(time: string): string {
  return bandLabel(time);
}

/** Dates of `club.holidays` (plain dates or `{date}` entries). */
export function holidayDates(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((entry: unknown) =>
        typeof entry === "string"
          ? [entry]
          : typeof entry === "object" &&
              entry !== null &&
              "date" in entry &&
              typeof entry.date === "string"
            ? [entry.date]
            : [],
      )
    : [];
}

export interface CalendarSettings {
  levelsEnabled: boolean;
  maxInstructors: number;
  slotMinutes: number;
  trainingSlotMinutes: number;
}

export const defaultCalendarSettings: CalendarSettings = {
  levelsEnabled: true,
  maxInstructors: 1,
  slotMinutes: 10,
  trainingSlotMinutes: 30,
};

async function parameterValue(client: ApiClient, key: string): Promise<unknown> {
  try {
    return (await client.GET("/parameters/{key}", { params: { path: { key } } })).data?.value;
  } catch {
    return undefined;
  }
}

export async function loadCalendarSettings(client: ApiClient): Promise<CalendarSettings> {
  const [levelsEnabled, maxInstructors, slotMinutes, trainingSlotMinutes] = await Promise.all([
    parameterValue(client, "levels.enabled"),
    parameterValue(client, "classes.maxInstructorsPerClass"),
    parameterValue(client, "classes.slotMinutes"),
    parameterValue(client, "training.slotMinutes"),
  ]);
  const number = (value: unknown, fallback: number) =>
    typeof value === "number" && value > 0 ? value : fallback;
  return {
    levelsEnabled: levelsEnabled !== false,
    maxInstructors: number(maxInstructors, defaultCalendarSettings.maxInstructors),
    slotMinutes: number(slotMinutes, defaultCalendarSettings.slotMinutes),
    trainingSlotMinutes: number(trainingSlotMinutes, defaultCalendarSettings.trainingSlotMinutes),
  };
}

/** `club.openingHours` (R-02-09): one window per weekday; a weekday that is absent is closed. */
export type OpeningHours = Partial<Record<string, OpeningWindow>>;

const weekdayKeys = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
] as const;

/**
 * `club.openingHours` of the club. A read that fails rejects: the page shows the error with a
 * retry and offers no times meanwhile, instead of assuming dl–dg 07:00–22:00 (which re-opens the
 * closed days the api refuses).
 */
export async function loadOpeningHours(client: ApiClient): Promise<OpeningHours> {
  const value = (await client.GET("/club/opening-hours")).data?.value;
  if (typeof value !== "object" || value === null) {
    throw new TypeError("Missing club.openingHours");
  }
  return value;
}

/** Opening window of a date (`club.openingHours`); `null` when the club is closed that weekday. */
export function openingOf(hours: OpeningHours, date: string): OpeningWindow | null {
  const key = weekdayKeys[new Date(`${date}T12:00:00Z`).getUTCDay()] ?? "MONDAY";
  return hours[key] ?? null;
}

export function useCalendarErrorMessage() {
  const { t } = useTranslation(["admin-scheduling", "errors"]);
  return useCallback(
    (error: unknown) =>
      isApiError(error)
        ? t(`errors:${error.code}`, { defaultValue: t("admin-scheduling:common.error") })
        : t("admin-scheduling:common.error"),
    [t],
  );
}

export { errorCode };

/** Renders `text` with its first occurrence of `phrase` in bold (mockup emphasis of counts). */
export function Emphasized({ phrase, text }: { phrase: string; text: string }): ReactNode {
  const index = phrase === "" ? -1 : text.indexOf(phrase);
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <strong>{phrase}</strong>
      {text.slice(index + phrase.length)}
    </>
  );
}

/** Splits a translated text around a marker value to place an icon where `{icon}` was. */
export const ICON_MARKER = "⁣";

export function WithIcon({ icon, text }: { icon: ReactNode; text: string }): ReactNode {
  const [before, ...rest] = text.split(ICON_MARKER);
  return rest.length === 0 ? (
    text
  ) : (
    <>
      {before}
      {icon}
      {rest.join("")}
    </>
  );
}
