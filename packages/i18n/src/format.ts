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

/**
 * A date in a presentation. `dayMonthNumeric` is always zero-padded «03/08», as ca and the
 * mockups write it: CLDR's es pattern for a two-digit day and month is `d/M` («3/8»), so the day
 * and the month are padded here, in the locale's own order and separator (E6-W05).
 */
function formatWith(
  formatter: Intl.DateTimeFormat,
  presentation: DatePresentation,
  date: Date | number,
): string {
  if (presentation !== "dayMonthNumeric") return formatter.format(date);
  return formatter
    .formatToParts(date)
    .map((part) =>
      part.type === "day" || part.type === "month" ? part.value.padStart(2, "0") : part.value,
    )
    .join("");
}

export function formatDate(
  value: DateInput,
  locale: Locale,
  timeZone: string,
  presentation: DatePresentation = "short",
): string {
  return formatWith(
    dateFormatter(locale, zoneOf(value, timeZone), presentation),
    presentation,
    toDate(value),
  );
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
  return formatWith(dateFormatter(locale, "UTC", presentation), presentation, date);
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
 * month, otherwise «ds 12/09»; `long` (D7 maintenance) «ds 7 d’agost»; `day` (03) «Dissabte 7» in
 * the current month, otherwise «Dissabte 17 d’octubre»; `history` (25) always «ds 12/07». `list`,
 * `long` and `day` append « · 18:30[–20:30]» (hours without a leading zero) when there are hours.
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
    // 03: «Dissabte 7» in the club's current month, «Dissabte 17 d’octubre» in another one.
    const capitalized = `${weekday.charAt(0).toLocaleUpperCase(locale)}${weekday.slice(1)}`;
    label =
      clubLocalDate(today, timeZone).slice(0, 7) === localDate.slice(0, 7)
        ? translateStatic("common:format.activityDate.currentMonth", locale, {
            day,
            weekday: capitalized,
          })
        : translateStatic("common:format.activityDate.long", locale, {
            dayMonth: formatPlainDate(localDate, locale, "dayMonth"),
            weekday: capitalized,
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

/** Items joined as a list in the reader's language: «dilluns i dimarts», «lunes y martes». */
export function formatList(values: readonly string[], locale: Locale): string {
  return new Intl.ListFormat(intlLocales[locale], { style: "long", type: "conjunction" }).format(
    values,
  );
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
 * The instant (epoch ms) of a club-local `YYYY-MM-DDTHH:mm` read in the club `timeZone`, with the
 * api's `ZonedDateTime.of` rules (R-06-14): an ambiguous time (autumn overlap) takes its first
 * occurrence, and a time inside the spring gap moves forward by the gap length. Never the
 * device's zone.
 */
export function clubLocalInstant(localDateTime: string, timeZone: string): number {
  const local = Date.parse(`${localDateTime.slice(0, 16)}:00Z`);
  // Every offset the zone uses from wall − 26 h to wall + 26 h (hourly samples).
  const samples = Array.from({ length: 53 }, (_, hour) => {
    const instant = local + (hour - 26) * 3_600_000;
    return { instant, offset: zoneOffsetMinutes(instant, timeZone) };
  });
  const valid = [...new Set(samples.map((sample) => sample.offset))]
    .map((offset) => local - offset * 60_000)
    .filter((instant) => local - zoneOffsetMinutes(instant, timeZone) * 60_000 === instant);
  if (valid.length > 0) return Math.min(...valid);
  // Gap: the offset in force before the transition moves the wall time forward.
  const before =
    samples.filter((sample) => sample.instant + sample.offset * 60_000 < local).at(-1) ??
    samples[0];
  return local - (before?.offset ?? 0) * 60_000;
}

/**
 * S08 §10 opening instants: «diumenge 9 a les 20 h» — the club-local weekday and day of an
 * instant, then its time, «20 h» on the hour and «20:30» otherwise (`opensAt`, `nextBookableAt`).
 */
export function formatDayAtTime(value: DateInput, locale: Locale, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone,
  }).formatToParts(toDate(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  const minute = part("minute");
  const hour = String(Number(part("hour")));
  const time =
    minute === "00"
      ? translateStatic("common:format.dayAtTime.wholeHour", locale, { hour })
      : `${hour}:${minute}`;
  const date = translateStatic("common:format.dayAtTime.date", locale, {
    day: part("day"),
    weekday: formatDate(value, locale, timeZone, "weekdayLong"),
  });
  return translateStatic("common:format.dayAtTime.withTime", locale, { date, time });
}

/**
 * The Catalan personal article before a dog's name (S08 §10): «l'» before a vowel or an «h»
 * («l'Ona», «l'Hug»), otherwise «la » for a female and «en » for a male dog («la Duna», «en
 * Rock»). Spanish and English take none («con Duna», «with Duna»), nor a dog of unknown sex.
 */
export function dogArticle(
  name: string,
  sex: "FEMALE" | "MALE" | null | undefined,
  locale: Locale,
): string {
  if (locale !== "ca" || (sex !== "FEMALE" && sex !== "MALE")) return "";
  const initial = name.trim().normalize("NFD").charAt(0).toLocaleLowerCase("ca");
  if (initial === "") return "";
  if ("aeiouh".includes(initial)) return "l'";
  return sex === "FEMALE" ? "la " : "en ";
}

/**
 * The personal article before a person's name in Catalan (S10 §10, sibling of `dogArticle`):
 * «l'» before a vowel or an «h» («l'Anna», «l'Hug»), otherwise «la » for a woman and «en » for a
 * man («la Laura», «en Marc»). Spanish and English take none, nor a person of another or unknown
 * gender.
 */
export function personArticle(
  name: string,
  gender: "FEMALE" | "MALE" | "OTHER" | null | undefined,
  locale: Locale,
): string {
  return gender === "FEMALE" || gender === "MALE" ? dogArticle(name, gender, locale) : "";
}

function instantOf(value: DateInput): number {
  const date = toDate(value);
  return typeof date === "number" ? date : date.getTime();
}

/** «07:10» → «7:10», as the mockups print club times. */
function shortTime(value: DateInput, locale: Locale, timeZone: string): string {
  return formatTime(value, locale, timeZone).replace(/^0(?=\d:)/u, "");
}

function previousPlainDate(date: string): string {
  const day = parsePlainDate(date);
  if (day === undefined) return date;
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

export type DayRelativeKind = "date" | "hours" | "minutes" | "today" | "yesterday";

/** The parts of `formatDayRelative`, for a message that frames them («des d'ahir 21:04»). */
export interface DayRelativeParts {
  /** Minutes or hours ago (`minutes`, `hours`). */
  count: number;
  /** «02/08», the club-local day. */
  date: string;
  kind: DayRelativeKind;
  /** «21:04», the club-local time. */
  time: string;
}

/**
 * How long ago an instant was, in the club's zone (S10 R-10-05, «des d'ahir 21:04» on 21): under
 * an hour in minutes, under six hours in hours, then «today», «yesterday» (club-local days, never
 * the device's) or the day and time. An instant ahead of `now` counts as 0 minutes.
 */
export function dayRelativeParts(
  value: DateInput,
  locale: Locale,
  timeZone: string,
  now: DateInput = new Date(),
): DayRelativeParts {
  const minutes = Math.max(0, Math.floor((instantOf(now) - instantOf(value)) / 60_000));
  const base = {
    date: formatDate(value, locale, timeZone, "dayMonthNumeric"),
    time: shortTime(value, locale, timeZone),
  };
  if (minutes < 60) return { ...base, count: minutes, kind: "minutes" };
  if (minutes < 360) return { ...base, count: Math.floor(minutes / 60), kind: "hours" };
  const day = clubLocalDate(value, timeZone);
  const today = clubLocalDate(now, timeZone);
  if (day === today) return { ...base, count: 0, kind: "today" };
  if (day === previousPlainDate(today)) return { ...base, count: 0, kind: "yesterday" };
  return { ...base, count: 0, kind: "date" };
}

/** «fa 5 min», «fa 3 h», «avui 9:15», «ahir 21:04», «02/08 · 21:04» (see `dayRelativeParts`). */
export function formatDayRelative(
  value: DateInput,
  locale: Locale,
  timeZone: string,
  now: DateInput = new Date(),
): string {
  const parts = dayRelativeParts(value, locale, timeZone, now);
  const values = { count: parts.count, date: parts.date, time: parts.time };
  switch (parts.kind) {
    case "minutes":
      return translateStatic("common:format.dayRelative.minutes", locale, values);
    case "hours":
      return translateStatic("common:format.dayRelative.hours", locale, values);
    case "today":
      return translateStatic("common:format.dayRelative.today", locale, values);
    case "yesterday":
      return translateStatic("common:format.dayRelative.yesterday", locale, values);
    case "date":
      return translateStatic("common:format.dayRelative.date", locale, values);
  }
}

/**
 * «fa 8 mesos» (S10 R-10-09): whole months between an instant and `now`, both read as club-local
 * days; under a month in days («avui» the same day), from 24 months in whole years.
 */
export function formatMonthsSince(
  value: DateInput,
  locale: Locale,
  timeZone: string,
  now: DateInput = new Date(),
): string {
  const since = clubLocalDate(value, timeZone);
  const today = clubLocalDate(now, timeZone);
  const [fromYear, fromMonth, fromDay] = since.split("-").map(Number);
  const [toYear, toMonth, toDay] = today.split("-").map(Number);
  const months =
    ((toYear ?? 0) - (fromYear ?? 0)) * 12 +
    ((toMonth ?? 0) - (fromMonth ?? 0)) -
    ((toDay ?? 0) < (fromDay ?? 0) ? 1 : 0);
  if (months >= 24) {
    const count = Math.floor(months / 12);
    return count === 1
      ? translateStatic("common:format.since.years.one", locale, { count })
      : translateStatic("common:format.since.years.other", locale, { count });
  }
  if (months >= 1) {
    return months === 1
      ? translateStatic("common:format.since.months.one", locale, { count: months })
      : translateStatic("common:format.since.months.other", locale, { count: months });
  }
  const from = parsePlainDate(since)?.getTime() ?? 0;
  const to = parsePlainDate(today)?.getTime() ?? 0;
  const days = Math.max(0, Math.round((to - from) / 86_400_000));
  if (days === 0) return translateStatic("common:format.since.today", locale);
  return days === 1
    ? translateStatic("common:format.since.days.one", locale, { count: days })
    : translateStatic("common:format.since.days.other", locale, { count: days });
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
  /** «diumenge 9 a les 20 h» in the club zone (S08 §10). */
  formatDayAtTime: (value: DateInput) => string;
  /** «fa 5 min», «avui 9:15», «ahir 21:04» in the club zone (S10 R-10-05). */
  formatDayRelative: (value: DateInput, now?: DateInput) => string;
  /** The parts of `formatDayRelative`, for a message that frames them. */
  dayRelativeParts: (value: DateInput, now?: DateInput) => DayRelativeParts;
  formatDuration: (totalMinutes: number, options?: DurationOptions) => string;
  /** A conjunction list in the reader's language («dilluns i dimarts»). */
  formatList: (values: readonly string[]) => string;
  formatMoney: (amount: number) => string;
  formatMonth: (value: DateInput) => string;
  /** «fa 8 mesos» from an instant, in club-local days (S10 R-10-09). */
  formatMonthsSince: (value: DateInput, now?: DateInput) => string;
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
    dayRelativeParts: (value, now) => dayRelativeParts(value, locale, timeZone, now),
    formatDayAtTime: (value) => formatDayAtTime(value, locale, timeZone),
    formatDayRelative: (value, now) => formatDayRelative(value, locale, timeZone, now),
    formatDuration: (totalMinutes, options) => formatDuration(totalMinutes, locale, options),
    formatList: (values) => formatList(values, locale),
    formatMoney: (amount) => formatMoney(amount, locale, currency),
    formatMonth: (value) => formatMonth(value, locale, timeZone),
    formatMonthsSince: (value, now) => formatMonthsSince(value, locale, timeZone, now),
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
export const fmtDayRelative = formatDayRelative;
export const fmtMoney = formatMoney;
export const fmtMonth = formatMonth;
export const fmtMonthsSince = formatMonthsSince;
export const fmtPlainDate = formatPlainDate;
export const fmtRelative = formatDuration;
export const fmtTime = formatTime;
export const fmtWeekRange = formatWeekRange;
