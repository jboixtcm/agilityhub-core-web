import { describe, expect, it } from "vitest";

import {
  createClubFormats,
  formatDate,
  formatDateRange,
  formatDuration,
  formatMoney,
  formatTime,
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
});
