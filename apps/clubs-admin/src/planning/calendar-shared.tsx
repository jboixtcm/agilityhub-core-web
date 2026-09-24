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

/** `HH:mm` options every `step` minutes between `open` and `close` (both included). */
export function timeOptions(open: string, close: string, step: number): string[] {
  const options: string[] = [];
  for (let value = minutesOf(open); value <= minutesOf(close); value += Math.max(step, 1)) {
    options.push(timeOf(value));
  }
  return options;
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
  // Offsets in force half a day before and after: a zone changes at most once in between.
  const before = zoneOffsetMinutes(local - 12 * 3_600_000, timeZone);
  const after = zoneOffsetMinutes(local + 12 * 3_600_000, timeZone);
  const valid = [before, after]
    .map((offset) => local - offset * 60_000)
    .filter((instant) => local - zoneOffsetMinutes(instant, timeZone) * 60_000 === instant);
  // Gap: no offset matches; the offset before the transition moves the wall time forward.
  const instant = valid.length === 0 ? local - before * 60_000 : Math.min(...valid);
  return new Date(instant).toISOString().replace(".000Z", "Z");
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

export type OpeningHours = Partial<Record<string, { close: string; open: string }>>;

export async function loadOpeningHours(client: ApiClient): Promise<OpeningHours> {
  try {
    const value = (await client.GET("/club/opening-hours")).data?.value;
    return typeof value === "object" && value !== null ? value : {};
  } catch {
    return {};
  }
}

const weekdayKeys = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
] as const;

/** Opening window of a date (`club.openingHours`), 07:00–22:00 when the club has none. */
export function openingOf(hours: OpeningHours, date: string): { close: string; open: string } {
  const key = weekdayKeys[new Date(`${date}T12:00:00Z`).getUTCDay()] ?? "MONDAY";
  return hours[key] ?? { close: "22:00", open: "07:00" };
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
