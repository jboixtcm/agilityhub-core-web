import { describe, expect, it } from "vitest";

import {
  createClubFormats,
  formatDate,
  formatDateRange,
  formatDuration,
  formatMoney,
  formatPlainDate,
  formatTime,
  formatWeekRange,
  isPlainDate,
  parsePlainDate,
} from "./format";

describe("club-aware formats", () => {
  it.each([
    ["ca", "45,00 €"],
    ["es", "45,00 €"],
    ["en", "€45.00"],
  ] as const)("formats money in %s", (locale, expected) => {
    expect(formatMoney(45, locale, "EUR")).toBe(expected);
  });

  it.each([
    ["ca", "2 h", "30 min", "4 h abans"],
    ["es", "2 h", "30 min", "4 h antes"],
    ["en", "2 h", "30 min", "4 h before"],
  ] as const)("formats durations in %s", (locale, hours, minutes, before) => {
    expect(formatDuration(120, locale)).toBe(hours);
    expect(formatDuration(30, locale)).toBe(minutes);
    expect(formatDuration(-240, locale)).toBe(before);
  });

  it("uses the club time zone for the same UTC instant", () => {
    const instant = "2026-09-06T23:30:00Z";

    expect(formatDate(instant, "ca", "Europe/Madrid")).toBe("07/09/2026");
    expect(formatTime(instant, "ca", "Europe/Madrid")).toBe("01:30");
    expect(formatDate(instant, "ca", "America/Argentina/Buenos_Aires")).toBe("06/09/2026");
    expect(formatTime(instant, "ca", "America/Argentina/Buenos_Aires")).toBe("20:30");
  });

  it.each([
    ["ca", "24 al 30 d’agost", "28 de setembre al 4 d’octubre"],
    ["es", "24 al 30 de agosto", "28 de septiembre al 4 de octubre"],
    ["en", "August 24–30", "September 28 – October 4"],
  ] as const)(
    "formats ISO week ranges in %s (E4-W01 D3 generation card)",
    (locale, same, different) => {
      expect(formatWeekRange("2026-08-24", "2026-08-30", locale, "Europe/Madrid")).toBe(same);
      expect(formatWeekRange("2026-09-28", "2026-10-04", locale, "Europe/Madrid")).toBe(different);
    },
  );

  it("formats numeric day and month and long weekday names", () => {
    expect(formatDate("2026-08-17T07:12:00Z", "ca", "Europe/Madrid", "dayMonthNumeric")).toBe(
      "17/08",
    );
    expect(formatDate("2026-08-19T12:00:00Z", "ca", "UTC", "weekdayLong")).toBe("dimecres");
    expect(formatDate("2026-08-19T12:00:00Z", "en", "UTC", "weekdayLong")).toBe("Wednesday");
  });

  it("formats date ranges and binds branding values", () => {
    const formats = createClubFormats("en", "Europe/Madrid", "EUR");

    expect(
      formatDateRange(
        "2026-09-06T08:00:00Z",
        "2026-09-08T08:00:00Z",
        "en",
        "Europe/Madrid",
      ).replace(/\s/g, " "),
    ).toBe("9/6/2026 – 9/8/2026");
    expect(formats.formatMoney(45)).toBe("€45.00");
    expect(formats.formatDuration(90)).toBe("1 h 30 min");
  });

  const zones = ["Pacific/Auckland", "Pacific/Kiritimati", "Europe/Madrid", "America/Bogota"];

  it.each(zones)(
    "R-06-14 formats business dates as the calendar day they name in %s",
    (timeZone) => {
      const formats = createClubFormats("ca", timeZone, "EUR");

      expect(formats.formatPlainDate("2026-08-04", "dayMonth")).toBe("4 d’agost");
      expect(formats.formatPlainDate("2026-08-04", "weekdayShort")).toBe("dt.");
      expect(formats.formatPlainDate("2026-08-04")).toBe("04/08/2026");
      expect(formatDate("2026-08-04", "ca", timeZone, "weekday")).toBe("dimarts, 4 d’agost");
      expect(formats.formatMonth("2026-08-01")).toBe("agost del 2026");
      expect(formatWeekRange("2026-08-31", "2026-09-06", "ca", timeZone)).toBe(
        "31 d’agost al 6 de setembre",
      );
    },
  );

  it.each(["2026-13-01", "2026-08-32", "2026-02-30", "hola", ""])(
    "rejects %j as a business date",
    (value) => {
      expect(parsePlainDate(value)).toBeUndefined();
      expect(isPlainDate(value)).toBe(false);
      expect(() => formatPlainDate(value, "ca")).toThrow(RangeError);
    },
  );

  it("accepts real business dates, leap days included", () => {
    expect(parsePlainDate("2028-02-29")?.toISOString()).toBe("2028-02-29T00:00:00.000Z");
    expect(isPlainDate("2026-08-04")).toBe(true);
  });
});
