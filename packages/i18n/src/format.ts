import { useBranding } from "@agilityhub/ui";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { translateStatic } from "./catalog";
import { normalizeLocale } from "./locale";
import type { Locale } from "./types";

export type DateInput = Date | number | string;
export type DatePresentation =
  | "dayMonth"
  | "dayMonthNumeric"
  | "long"
  | "monthYear"
  | "short"
  | "weekday"
  | "weekdayLong"
  | "weekdayShort";

export interface DurationOptions {
  before?: boolean;
}

const intlLocales: Record<Locale, string> = {
  ca: "ca-ES",
  en: "en-US",
  es: "es-ES",
};

const dateOptions: Record<DatePresentation, Intl.DateTimeFormatOptions> = {
  dayMonth: { day: "numeric", month: "long" },
  dayMonthNumeric: { day: "2-digit", month: "2-digit" },
  long: { day: "numeric", month: "long", year: "numeric" },
  monthYear: { month: "2-digit", year: "numeric" },
  short: { day: "2-digit", month: "2-digit", year: "numeric" },
  weekday: { day: "numeric", month: "long", weekday: "long" },
  weekdayLong: { weekday: "long" },
  weekdayShort: { weekday: "short" },
};

const PLAIN_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;

/**
 * A business date `YYYY-MM-DD` (a calendar day, not an instant) → midnight UTC of that day, or
 * `undefined` when it is not a real date («2026-13-01», «2026-02-30», «hola»).
 */
export function parsePlainDate(value: string | null | undefined): Date | undefined {
  const match = PLAIN_DATE.exec(value ?? "");
  if (match === null) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
    ? undefined
    : date;
}

export function isPlainDate(value: string | null | undefined): value is string {
  return parsePlainDate(value) !== undefined;
}

function toDate(value: DateInput): Date | number {
  if (typeof value !== "string") return value;
  return parsePlainDate(value) ?? new Date(value);
}

/** Business dates are formatted in UTC (the day they name); instants in the club's zone. */
function zoneOf(value: DateInput, timeZone: string): string {
  return typeof value === "string" && isPlainDate(value) ? "UTC" : timeZone;
}

function dateFormatter(
  locale: Locale,
  timeZone: string,
  presentation: DatePresentation,
): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(intlLocales[locale], {
    ...dateOptions[presentation],
    timeZone,
  });
}

export function formatDate(
  value: DateInput,
  locale: Locale,
  timeZone: string,
  presentation: DatePresentation = "short",
): string {
  return dateFormatter(locale, zoneOf(value, timeZone), presentation).format(toDate(value));
}

/**
 * R-06-14: a `YYYY-MM-DD` business date shows the calendar day it names in every club time zone
 * (built with `Date.UTC`, formatted with `timeZone: "UTC"`). Throws `RangeError` when it is not a
 * real date.
 */
export function formatPlainDate(
  value: string,
  locale: Locale,
  presentation: DatePresentation = "short",
): string {
  const date = parsePlainDate(value);
  if (date === undefined) throw new RangeError(`Invalid plain date: ${value}`);
  return dateFormatter(locale, "UTC", presentation).format(date);
}

export function formatTime(value: DateInput, locale: Locale, timeZone: string): string {
  return new Intl.DateTimeFormat(intlLocales[locale], {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone,
  }).format(toDate(value));
}

/**
 * Two business dates (the days they name) or two instants (in the club's zone). A business date
 * mixed with an instant has no single zone that keeps both days (R-06-14), so it throws
 * `RangeError` instead of shifting one end by a day.
 */
export function formatDateRange(
  start: DateInput,
  end: DateInput,
  locale: Locale,
  timeZone: string,
  presentation: DatePresentation = "short",
): string {
  const zone = zoneOf(start, timeZone);
  if (zoneOf(end, timeZone) !== zone) {
    throw new RangeError("formatDateRange mixes a business date with an instant");
  }
  return dateFormatter(locale, zone, presentation).formatRange(toDate(start), toDate(end));
}

/**
 * «24 al 30 d'agost» (same month) · «28 de setembre al 4 d'octubre» (different months). Accepts
 * `YYYY-MM-DD` business dates (formatted as the calendar days they name) or instants.
 */
export function formatWeekRange(
  start: DateInput,
  end: DateInput,
  locale: Locale,
  timeZone: string,
): string {
  const monthKey = (value: DateInput) =>
    new Intl.DateTimeFormat("en-US", {
      month: "numeric",
      timeZone: zoneOf(value, timeZone),
      year: "numeric",
    }).format(toDate(value));
  const dayOnly = (value: DateInput) =>
    new Intl.DateTimeFormat(intlLocales[locale], {
      day: "numeric",
      timeZone: zoneOf(value, timeZone),
    }).format(toDate(value));
  const sameMonth = monthKey(start) === monthKey(end);
  const values = {
    end: formatDate(end, locale, timeZone, "dayMonth"),
    endDay: dayOnly(end),
    start: formatDate(start, locale, timeZone, "dayMonth"),
    startDay: dayOnly(start),
  };
  return sameMonth
    ? translateStatic("common:format.weekRange.sameMonth", locale, values)
    : translateStatic("common:format.weekRange.differentMonth", locale, values);
}

/**
 * R-07-13 presentations of an activity date: `list` (D7 list, 04 block) «ds 7» in the current
 * month, otherwise «ds 12/09»; `long` (D7 maintenance) «ds 7 d’agost»; `day` (03) «Dissabte 7»;
 * `history` (25) always «ds 12/07». `list`, `long` and `day` append « · 18:30[–20:30]» (hours
 * without a leading zero) when there are hours.
 */
export type ActivityDatePresentation = "day" | "history" | "list" | "long";

const LOCAL_DATE_TIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?$/u;
const LOCAL_TIME = /^\d{2}:\d{2}$/u;

function clubLocalDate(value: DateInput, timeZone: string): string {
  if (typeof value === "string") {
    if (isPlainDate(value)) return value;
    const local = LOCAL_DATE_TIME.exec(value);
    if (local?.[1] !== undefined) return local[1];
  }
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).format(toDate(value));
}

/** «18:30» from a club-local `HH:mm`, a club-local `YYYY-MM-DDTHH:mm` or an instant (club zone). */
function clubLocalTime(value: string, locale: Locale, timeZone: string): string {
  const local = LOCAL_TIME.test(value) ? value : LOCAL_DATE_TIME.exec(value)?.[2];
  return (local ?? formatTime(value, locale, timeZone)).replace(/^0(?=\d:)/u, "");
}

/**
 * Activity dates of R-07-13. `date`, `startTime` and `endTime` are club-local values
 * (`YYYY-MM-DD`, `HH:mm`, `YYYY-MM-DDTHH:mm`) or instants, which are read in the club
 * `timeZone` — never in the device's; `today` decides «the current month» in the same zone.
 */
export function formatActivityDate(
  date: string,
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  locale: Locale,
  timeZone: string,
  today: DateInput = new Date(),
  presentation: ActivityDatePresentation = "list",
): string {
  const localDate = clubLocalDate(date, timeZone);
  const day = String(Number(localDate.slice(8, 10)));
  const month = localDate.slice(5, 7);
  const weekday = formatPlainDate(
    localDate,
    locale,
    presentation === "day" ? "weekdayLong" : "weekdayShort",
  ).replaceAll(/[.,]/gu, "");
  let label: string;
  if (presentation === "long") {
    label = translateStatic("common:format.activityDate.long", locale, {
      dayMonth: formatPlainDate(localDate, locale, "dayMonth"),
      weekday,
    });
  } else if (presentation === "day") {
    label = translateStatic("common:format.activityDate.currentMonth", locale, {
      day,
      weekday: `${weekday.charAt(0).toLocaleUpperCase(locale)}${weekday.slice(1)}`,
    });
  } else {
    const sameMonth =
      presentation === "list" &&
      clubLocalDate(today, timeZone).slice(0, 7) === localDate.slice(0, 7);
    label = sameMonth
      ? translateStatic("common:format.activityDate.currentMonth", locale, { day, weekday })
      : translateStatic("common:format.activityDate.otherMonth", locale, { day, month, weekday });
  }
  if (presentation === "history" || startTime === null || startTime === undefined) return label;
  const start = clubLocalTime(startTime, locale, timeZone);
  const time =
    endTime === null || endTime === undefined
      ? start
      : translateStatic("common:format.activityDate.timeRange", locale, {
          end: clubLocalTime(endTime, locale, timeZone),
          start,
        });
  return translateStatic("common:format.activityDate.withTime", locale, { date: label, time });
}

export function formatDateTime(value: DateInput, locale: Locale, timeZone: string): string {
  return new Intl.DateTimeFormat(intlLocales[locale], {
    ...dateOptions.short,
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone,
  }).format(toDate(value));
}

export function formatDuration(
  totalMinutes: number,
  locale: Locale,
  { before = false }: DurationOptions = {},
): string {
  const absoluteMinutes = Math.abs(totalMinutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;
  const number = new Intl.NumberFormat(intlLocales[locale]);
  const parts = [
    ...(hours > 0 ? [`${number.format(hours)} h`] : []),
    ...(minutes > 0 || hours === 0 ? [`${number.format(minutes)} min`] : []),
  ];
  const duration = parts.join(" ");

  return before || totalMinutes < 0
    ? translateStatic("common:format.duration.before", locale, { duration })
    : duration;
}

export function formatMoney(amount: number, locale: Locale, currency: string): string {
  return new Intl.NumberFormat(intlLocales[locale], {
    currency,
    currencyDisplay: "symbol",
    minimumFractionDigits: 2,
    style: "currency",
  })
    .format(amount)
    .replace(/[\u00a0\u202f]/g, " ");
}

export function formatMonth(value: DateInput, locale: Locale, timeZone: string): string {
  return new Intl.DateTimeFormat(intlLocales[locale], {
    month: "long",
    timeZone: zoneOf(value, timeZone),
    year: "numeric",
  }).format(toDate(value));
}

export interface ClubFormats {
  /** R-07-13 activity dates in the club zone (see `formatActivityDate`). */
  formatActivityDate: (
    date: string,
    startTime?: string | null,
    endTime?: string | null,
    presentation?: ActivityDatePresentation,
    today?: DateInput,
  ) => string;
  formatDate: (value: DateInput, presentation?: DatePresentation) => string;
  formatDateRange: (start: DateInput, end: DateInput, presentation?: DatePresentation) => string;
  formatDateTime: (value: DateInput) => string;
  formatDuration: (totalMinutes: number, options?: DurationOptions) => string;
  formatMoney: (amount: number) => string;
  formatMonth: (value: DateInput) => string;
  /** A `YYYY-MM-DD` business date, never shifted by the club's zone (R-06-14). */
  formatPlainDate: (value: string, presentation?: DatePresentation) => string;
  formatTime: (value: DateInput) => string;
  formatWeekRange: (start: DateInput, end: DateInput) => string;
  locale: Locale;
}

export function createClubFormats(locale: Locale, timeZone: string, currency: string): ClubFormats {
  return {
    formatActivityDate: (date, startTime, endTime, presentation, today) =>
      formatActivityDate(date, startTime, endTime, locale, timeZone, today, presentation),
    formatDate: (value, presentation) => formatDate(value, locale, timeZone, presentation),
    formatDateRange: (start, end, presentation) =>
      formatDateRange(start, end, locale, timeZone, presentation),
    formatDateTime: (value) => formatDateTime(value, locale, timeZone),
    formatDuration: (totalMinutes, options) => formatDuration(totalMinutes, locale, options),
    formatMoney: (amount) => formatMoney(amount, locale, currency),
    formatMonth: (value) => formatMonth(value, locale, timeZone),
    formatPlainDate: (value, presentation) => formatPlainDate(value, locale, presentation),
    formatTime: (value) => formatTime(value, locale, timeZone),
    formatWeekRange: (start, end) => formatWeekRange(start, end, locale, timeZone),
    locale,
  };
}

export function useClubFormats(): ClubFormats {
  const branding = useBranding();
  const { i18n } = useTranslation();
  const locale = normalizeLocale(i18n.resolvedLanguage ?? i18n.language, "ca");

  return useMemo(
    () => createClubFormats(locale, branding.timeZone, branding.currency),
    [branding.currency, branding.timeZone, locale],
  );
}

export const fmtDate = formatDate;
export const fmtDateTime = formatDateTime;
export const fmtMoney = formatMoney;
export const fmtMonth = formatMonth;
export const fmtPlainDate = formatPlainDate;
export const fmtRelative = formatDuration;
export const fmtTime = formatTime;
export const fmtWeekRange = formatWeekRange;
