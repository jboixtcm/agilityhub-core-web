import { describe, expect, it } from "vitest";

import { clubInstant } from "./calendar-shared";

describe("R-06-14 clubInstant (club-local date + time → UTC instant)", () => {
  it("uses the offset in force on each side of the DST changes", () => {
    expect(clubInstant("2026-08-12", "18:50", "Europe/Madrid")).toBe("2026-08-12T16:50:00Z");
    expect(clubInstant("2026-10-24", "08:30", "Europe/Madrid")).toBe("2026-10-24T06:30:00Z");
    expect(clubInstant("2026-10-26", "08:30", "Europe/Madrid")).toBe("2026-10-26T07:30:00Z");
    expect(clubInstant("2026-03-28", "08:30", "Europe/Madrid")).toBe("2026-03-28T07:30:00Z");
    expect(clubInstant("2026-03-30", "08:30", "Europe/Madrid")).toBe("2026-03-30T06:30:00Z");
  });

  it("resolves an ambiguous local time (autumn overlap) to its first occurrence", () => {
    expect(clubInstant("2026-10-25", "02:30", "Europe/Madrid")).toBe("2026-10-25T00:30:00Z");
    expect(clubInstant("2026-10-25", "02:00", "Europe/Madrid")).toBe("2026-10-25T00:00:00Z");
    expect(clubInstant("2026-10-25", "03:00", "Europe/Madrid")).toBe("2026-10-25T02:00:00Z");
  });

  it("moves a local time inside the spring gap forward by the gap length (ZonedDateTime.of)", () => {
    // 02:30 does not exist on 29 March: it becomes 03:30 CEST.
    expect(clubInstant("2026-03-29", "02:30", "Europe/Madrid")).toBe("2026-03-29T01:30:00Z");
    expect(clubInstant("2026-03-29", "02:00", "Europe/Madrid")).toBe("2026-03-29T01:00:00Z");
    expect(clubInstant("2026-03-29", "03:00", "Europe/Madrid")).toBe("2026-03-29T01:00:00Z");
    expect(clubInstant("2026-03-29", "01:59", "Europe/Madrid")).toBe("2026-03-29T00:59:00Z");
  });

  it("works for other club zones (Canary Islands, one west of UTC)", () => {
    expect(clubInstant("2026-08-12", "18:50", "Atlantic/Canary")).toBe("2026-08-12T17:50:00Z");
    expect(clubInstant("2026-11-01", "01:30", "America/New_York")).toBe("2026-11-01T05:30:00Z");
    expect(clubInstant("2026-03-08", "02:30", "America/New_York")).toBe("2026-03-08T07:30:00Z");
  });
});
