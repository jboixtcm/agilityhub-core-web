import { createClubFormats } from "@agilityhub/i18n";
import { describe, expect, it } from "vitest";

import { dayLabel, isIsoDate, parseMaskedDate } from "./calendar-shared";
import { weekdayLabel } from "./shared";

describe("R-06-14 planning business dates are calendar dates in every club zone", () => {
  it.each(["Pacific/Auckland", "Pacific/Kiritimati", "Europe/Madrid", "America/Bogota"])(
    "labels days and weekdays without shifting them in %s",
    (timeZone) => {
      const { formatPlainDate, formatWeekRange } = createClubFormats("ca", timeZone, "EUR");

      expect(dayLabel("2026-08-12", formatPlainDate)).toBe("dc 12");
      expect(weekdayLabel("MONDAY", formatPlainDate, "weekdayLong")).toBe("dilluns");
      expect(weekdayLabel("SATURDAY", formatPlainDate, "weekdayShort")).toBe("ds");
      expect(formatPlainDate("2026-08-10", "dayMonthNumeric")).toBe("10/08");
      expect(formatWeekRange("2026-08-10", "2026-08-16")).toBe("10 al 16 d’agost");
    },
  );

  it.each(["2026-13-01", "2026-08-32", "2026-02-30", "hola"])("rejects %s", (value) => {
    expect(isIsoDate(value)).toBe(false);
  });

  it("parses masked dates only when they are real", () => {
    expect(parseMaskedDate("12/08/2026")).toBe("2026-08-12");
    expect(parseMaskedDate("30/02/2026")).toBeUndefined();
  });
});
