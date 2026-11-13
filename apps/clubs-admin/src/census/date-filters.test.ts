import { describe, expect, it } from "vitest";

import { instantDateFilter } from "./date-filters";

describe("T-03-38 census calendar-date filters", () => {
  const filter = (value: string, operator: "eq" | "between" | "gt" | "lte" = "eq") =>
    instantDateFilter({ field: "joinedAt", operator, value }, "Europe/Madrid");
  it("matches a whole local day rather than just midnight, including daylight saving transitions", () => {
    expect(filter("2026-03-29")).toEqual({
      field: "joinedAt",
      operator: "between",
      value: "2026-03-28T23:00:00.000Z,2026-03-29T21:59:59.999Z",
    });
    expect(filter("2026-10-25").value).toBe("2026-10-24T22:00:00.000Z,2026-10-25T22:59:59.999Z");
  });
  it("includes the last selected date and excludes or includes complete comparison days", () => {
    expect(filter("2026-11-01,2026-11-13", "between").value).toBe(
      "2026-10-31T23:00:00.000Z,2026-11-13T22:59:59.999Z",
    );
    expect(filter("2026-11-13", "gt")).toMatchObject({
      operator: "gte",
      value: "2026-11-13T23:00:00.000Z",
    });
    expect(filter("2026-11-13", "lte")).toMatchObject({
      operator: "lt",
      value: "2026-11-13T23:00:00.000Z",
    });
  });
});
