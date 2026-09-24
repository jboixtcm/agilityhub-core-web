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

function toDate(value: DateInput): Date | number {
  return typeof value === "string" ? new Date(value) : value;
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
  return dateFormatter(locale, timeZone, presentation).format(toDate(value));
}

export function formatTime(value: DateInput, locale: Locale, timeZone: string): string {
  return new Intl.DateTimeFormat(intlLocales[locale], {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone,
  }).format(toDate(value));
}

export function formatDateRange(
  start: DateInput,
  end: DateInput,
  locale: Locale,
  timeZone: string,
  presentation: DatePresentation = "short",
): string {
  return dateFormatter(locale, timeZone, presentation).formatRange(toDate(start), toDate(end));
}

/** Accepts `YYYY-MM-DD` business dates (read at noon UTC so no zone can move the day) or instants. */
function toBusinessDate(value: DateInput): DateInput {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value)
    ? `${value}T12:00:00Z`
    : value;
}

/** «24 al 30 d'agost» (same month) · «28 de setembre al 4 d'octubre» (different months). */
export function formatWeekRange(
  start: DateInput,
  end: DateInput,
  locale: Locale,
  timeZone: string,
): string {
  const startDate = toBusinessDate(start);
  const endDate = toBusinessDate(end);
  const monthKey = new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    timeZone,
    year: "numeric",
  });
  const sameMonth = monthKey.format(toDate(startDate)) === monthKey.format(toDate(endDate));
  const dayOnly = new Intl.DateTimeFormat(intlLocales[locale], { day: "numeric", timeZone });
  const values = {
    end: formatDate(endDate, locale, timeZone, "dayMonth"),
    endDay: dayOnly.format(toDate(endDate)),
    start: formatDate(startDate, locale, timeZone, "dayMonth"),
    startDay: dayOnly.format(toDate(startDate)),
  };
  return sameMonth
    ? translateStatic("common:format.weekRange.sameMonth", locale, values)
    : translateStatic("common:format.weekRange.differentMonth", locale, values);
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
    timeZone,
    year: "numeric",
  }).format(toDate(value));
}

export interface ClubFormats {
  formatDate: (value: DateInput, presentation?: DatePresentation) => string;
  formatDateRange: (start: DateInput, end: DateInput, presentation?: DatePresentation) => string;
  formatDateTime: (value: DateInput) => string;
  formatDuration: (totalMinutes: number, options?: DurationOptions) => string;
  formatMoney: (amount: number) => string;
  formatMonth: (value: DateInput) => string;
  formatTime: (value: DateInput) => string;
  formatWeekRange: (start: DateInput, end: DateInput) => string;
  locale: Locale;
}

export function createClubFormats(locale: Locale, timeZone: string, currency: string): ClubFormats {
  return {
    formatDate: (value, presentation) => formatDate(value, locale, timeZone, presentation),
    formatDateRange: (start, end, presentation) =>
      formatDateRange(start, end, locale, timeZone, presentation),
    formatDateTime: (value) => formatDateTime(value, locale, timeZone),
    formatDuration: (totalMinutes, options) => formatDuration(totalMinutes, locale, options),
    formatMoney: (amount) => formatMoney(amount, locale, currency),
    formatMonth: (value) => formatMonth(value, locale, timeZone),
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
export const fmtRelative = formatDuration;
export const fmtTime = formatTime;
export const fmtWeekRange = formatWeekRange;
