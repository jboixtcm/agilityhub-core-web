import { describe, expect, it } from "vitest";

import { clubInstant, openingOf, rangeOptions, timeOptions } from "./calendar-shared";

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

  it("finds both sides of a transition that is more than 12 h away from wall-time-as-UTC", () => {
    // Pacific/Auckland: NZDT (+13) → NZST (+12) at 03:00 local on 5 April; 02:30 happens twice.
    expect(clubInstant("2026-04-05", "02:30", "Pacific/Auckland")).toBe("2026-04-04T13:30:00Z");
    expect(clubInstant("2026-04-05", "01:59", "Pacific/Auckland")).toBe("2026-04-04T12:59:00Z");
    expect(clubInstant("2026-04-05", "03:00", "Pacific/Auckland")).toBe("2026-04-04T15:00:00Z");
    // NZST → NZDT at 02:00 local on 27 September: 02:30 does not exist → 03:30 NZDT.
    expect(clubInstant("2026-09-27", "02:30", "Pacific/Auckland")).toBe("2026-09-26T14:30:00Z");
    // Australia/Lord_Howe changes by 30 minutes (+11 → +10:30): 01:45 first occurrence.
    expect(clubInstant("2026-04-05", "01:45", "Australia/Lord_Howe")).toBe("2026-04-04T14:45:00Z");
  });
});

describe("S06 §3 time options on slot boundaries (E4-W09)", () => {
  it("R-06-09 an opening at 07:05 with 10-minute slots starts at 07:10 and never passes the closing time", () => {
    const options = timeOptions("07:05", "21:55", 10);
    expect(options[0]).toBe("07:10");
    expect(options.at(-1)).toBe("21:50");
    expect(options.every((time) => Number(time.slice(3)) % 10 === 0)).toBe(true);
  });

  it("R-06-09 R-06-11 a range keeps at least its minimum length on slot boundaries", () => {
    // Classes: one slot at least.
    const classes = rangeOptions({ close: "21:55", open: "07:05" }, 10, 10);
    expect([classes.starts[0], classes.starts.at(-1)]).toEqual(["07:10", "21:40"]);
    expect([classes.ends[0], classes.ends.at(-1)]).toEqual(["07:20", "21:50"]);
    // Ring blocks: `training.slotMinutes` (30) at least, `to − from` a multiple of 10.
    const blocks = rangeOptions({ close: "22:00", open: "07:05" }, 10, 30);
    expect([blocks.starts[0], blocks.starts.at(-1)]).toEqual(["07:10", "21:30"]);
    expect([blocks.ends[0], blocks.ends.at(-1)]).toEqual(["07:40", "22:00"]);
    // A minimum that is not a whole number of slots is rounded up to one (25 → 30).
    expect(rangeOptions({ close: "22:00", open: "07:00" }, 10, 25).ends[0]).toBe("07:30");
    // A window shorter than the minimum offers nothing.
    expect(rangeOptions({ close: "07:20", open: "07:05" }, 10, 30)).toEqual({
      ends: [],
      starts: [],
    });
  });

  it("R-02-09 a weekday absent from club.openingHours is closed: no window, no options", () => {
    const hours = { MONDAY: { close: "22:00", open: "07:00" } };
    expect(openingOf(hours, "2026-08-17")).toEqual({ close: "22:00", open: "07:00" });
    expect(openingOf(hours, "2026-08-16")).toBeNull();
    expect(rangeOptions(openingOf(hours, "2026-08-16"), 10, 10)).toEqual({ ends: [], starts: [] });
  });
});
