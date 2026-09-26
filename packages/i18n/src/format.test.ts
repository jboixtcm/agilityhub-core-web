import { describe, expect, it } from "vitest";

import {
  clubLocalInstant,
  createClubFormats,
  dogArticle,
  formatActivityDate,
  formatDate,
  formatDayAtTime,
  formatDateRange,
  formatDuration,
  formatList,
  formatMoney,
  formatPlainDate,
  formatTime,
  formatWeekRange,
  isPlainDate,
  parsePlainDate,
} from "./format";

describe("E5-W01 S08 §10 the Catalan personal article of a dog (dogArticle)", () => {
  it.each([
    ["Duna", "FEMALE", "ca", "la "],
    ["Rock", "MALE", "ca", "en "],
    ["Ona", "FEMALE", "ca", "l'"],
    ["Àtila", "MALE", "ca", "l'"],
    ["Hug", "MALE", "ca", "l'"],
    ["Duna", "FEMALE", "es", ""],
    ["Rock", "MALE", "en", ""],
    ["Duna", null, "ca", ""],
  ] as const)("%s (%s) in %s → «%s»", (name, sex, locale, article) => {
    expect(dogArticle(name, sex, locale)).toBe(article);
  });
});

describe("E5-W01 R-08-10 a club-local class time as an instant (clubLocalInstant, R-06-14)", () => {
  it.each([
    ["2026-08-03T18:50", "Europe/Madrid", "2026-08-03T16:50:00.000Z"],
    // Autumn overlap: the first occurrence (CEST); spring gap: moved forward by the hour.
    ["2026-10-25T02:30", "Europe/Madrid", "2026-10-25T00:30:00.000Z"],
    ["2026-03-29T02:30", "Europe/Madrid", "2026-03-29T01:30:00.000Z"],
    ["2026-08-03T18:50", "America/Argentina/Buenos_Aires", "2026-08-03T21:50:00.000Z"],
  ] as const)("%s in %s → %s", (local, timeZone, expected) => {
    expect(new Date(clubLocalInstant(local, timeZone)).toISOString()).toBe(expected);
  });
});

describe("E5-W01 S08 §10 opening instants in the club zone (formatDayAtTime)", () => {
  it.each([
    ["ca", "2026-08-09T18:00:00Z", "Europe/Madrid", "diumenge 9 a les 20 h"],
    ["ca", "2026-10-11T18:30:00Z", "Europe/Madrid", "diumenge 11 a les 20:30"],
    ["es", "2026-08-09T18:00:00Z", "Europe/Madrid", "domingo 9 a las 20 h"],
    ["en", "2026-08-09T18:00:00Z", "Europe/Madrid", "Sunday 9 at 20:00"],
    // Buenos Aires reads the same instant five hours earlier, on its own day (CONVENCIONS_I18N §5).
    ["ca", "2026-08-09T18:00:00Z", "America/Argentina/Buenos_Aires", "diumenge 9 a les 15 h"],
  ] as const)("%s %s in %s → «%s»", (locale, instant, timeZone, expected) => {
    expect(formatDayAtTime(instant, locale, timeZone)).toBe(expected);
  });
});

describe("club-aware formats", () => {
  it.each([
    ["ca", "45,00 €"],
    ["es", "45,00 €"],
    ["en", "€45.00"],
  ] as const)("formats money in %s", (locale, expected) => {
    expect(formatMoney(45, locale, "EUR")).toBe(expected);
  });

  it.each([
    ["ca", "dilluns", "dilluns i dimarts", "dilluns, dimarts i dissabte"],
    ["es", "lunes", "lunes y martes", "lunes, martes y sábado"],
    ["en", "Monday", "Monday and Tuesday", "Monday, Tuesday, and Saturday"],
  ] as const)("E4-W11 joins weekday names as a list in %s", (locale, one, two, three) => {
    const days = {
      ca: ["dilluns", "dimarts", "dissabte"],
      en: ["Monday", "Tuesday", "Saturday"],
      es: ["lunes", "martes", "sábado"],
    }[locale];
    expect(formatList(days.slice(0, 1), locale)).toBe(one);
    expect(formatList(days.slice(0, 2), locale)).toBe(two);
    expect(formatList(days, locale)).toBe(three);
    expect(createClubFormats(locale, "Europe/Madrid", "EUR").formatList(days.slice(0, 2))).toBe(
      two,
    );
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

  it.each(zones)(
    "R-06-14 ranges keep business dates whole and refuse mixed ends in %s",
    (timeZone) => {
      expect(formatDateRange("2026-08-03", "2026-08-09", "ca", timeZone).replace(/\s/g, " ")).toBe(
        "3/8/2026 – 9/8/2026",
      );
      expect(() => formatDateRange("2026-08-03", "2026-08-09T10:00:00Z", "ca", timeZone)).toThrow(
        RangeError,
      );
      expect(() => formatDateRange("2026-08-03T10:00:00Z", "2026-08-09", "ca", timeZone)).toThrow(
        RangeError,
      );
    },
  );

  it("accepts real business dates, leap days included", () => {
    expect(parsePlainDate("2028-02-29")?.toISOString()).toBe("2028-02-29T00:00:00.000Z");
    expect(isPlainDate("2026-08-04")).toBe(true);
  });

  describe("R-07-13 activity dates", () => {
    // The D7 list is read in August 2026 (club-local).
    const today = "2026-08-04";

    it.each([
      ["2026-08-07", "18:30", "20:30", "dv 7 · 18:30–20:30"],
      ["2026-09-12", "09:00", "13:00", "ds 12/09 · 9:00–13:00"],
      ["2026-09-19", "09:00", null, "ds 19/09 · 9:00"],
      ["2026-10-04", null, null, "dg 4/10"],
    ] as const)("lists %s %s–%s as «%s»", (date, start, end, expected) => {
      expect(formatActivityDate(date, start, end, "ca", "Europe/Madrid", today)).toBe(expected);
    });

    it("formats the maintenance, 03 and 25 presentations", () => {
      const formats = createClubFormats("ca", "Europe/Madrid", "EUR");
      expect(formats.formatActivityDate("2026-08-07", "18:30", "20:30", "long")).toBe(
        "dv 7 d’agost · 18:30–20:30",
      );
      expect(
        formats.formatActivityDate(
          "2026-08-07T18:30",
          "2026-08-07T18:30",
          "2026-08-07T20:30",
          "day",
          today,
        ),
      ).toBe("Divendres 7 · 18:30–20:30");
      expect(formats.formatActivityDate("2026-07-12T10:00", "10:00", null, "history")).toBe(
        "dg 12/07",
      );
    });

    it.each([
      ["ca", "2026-10-17", "2026-09-26", "Dissabte 17 d’octubre · 18:30–20:30"],
      ["ca", "2026-10-17", "2026-10-01", "Dissabte 17 · 18:30–20:30"],
      ["es", "2026-10-17", "2026-09-26", "Sábado 17 de octubre · 18:30–20:30"],
      ["en", "2026-10-17", "2026-09-26", "Saturday, October 17 · 18:30–20:30"],
      // «Today» is the club's date: 23:30 on 30 September in Madrid is already 1 October there.
      ["ca", "2026-10-17", "2026-09-30T22:30:00Z", "Dissabte 17 · 18:30–20:30"],
    ] as const)(
      "E4-W12 step 7: 03 (`day`) in %s reads %s on %s as «%s»",
      (locale, date, today, expected) => {
        expect(
          formatActivityDate(date, "18:30", "20:30", locale, "Europe/Madrid", today, "day"),
        ).toBe(expected);
      },
    );

    it.each([
      ["es", "sáb 12/09 · 9:00–13:00"],
      ["en", "Sat 09/12 · 9:00–13:00"],
    ] as const)("formats the list date in %s", (locale, expected) => {
      expect(
        formatActivityDate("2026-09-12", "09:00", "13:00", locale, "Europe/Madrid", today),
      ).toBe(expected);
    });

    it("T-07-31 a viewer in America/Bogota reads 18:30 for 2026-08-07T16:30:00Z (club Europe/Madrid)", () => {
      const previous = process.env.TZ;
      process.env.TZ = "America/Bogota";
      try {
        expect(new Date("2026-08-07T16:30:00Z").getHours()).toBe(11);
        expect(
          formatActivityDate(
            "2026-08-07T16:30:00Z",
            "2026-08-07T16:30:00Z",
            "2026-08-07T18:30:00Z",
            "ca",
            "Europe/Madrid",
            "2026-08-04T12:00:00Z",
          ),
        ).toBe("dv 7 · 18:30–20:30");
      } finally {
        process.env.TZ = previous;
      }
    });

    it("decides «the current month» in the club zone", () => {
      // 31/07 23:30 in Madrid is already 1/08 there: the August activity is «this month».
      expect(
        formatActivityDate("2026-08-07", null, null, "ca", "Europe/Madrid", "2026-07-31T22:30:00Z"),
      ).toBe("dv 7");
      expect(
        formatActivityDate(
          "2026-08-07",
          null,
          null,
          "ca",
          "America/Bogota",
          "2026-07-31T22:30:00Z",
        ),
      ).toBe("dv 7/08");
    });
  });
});
