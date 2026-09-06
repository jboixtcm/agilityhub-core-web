import { describe, expect, it } from "vitest";

import {
  parseUniversalFilter,
  readUniversalListState,
  serializeUniversalFilter,
  UNIVERSAL_FILTER_OPERATORS,
  universalListSearchParams,
  type UniversalListDefaults,
} from "./universal-list";

const defaults: UniversalListDefaults = {
  columns: ["fullName", "dogs", "plan", "displayStatus"],
  filters: [
    { field: "status", operator: "eq", value: "ACTIVE" },
    { field: "planId", operator: "eq", value: "plan-member" },
  ],
  size: 50,
  sort: ["lastName,asc", "firstName,asc"],
};

describe("T-03-38 universal list filter builder", () => {
  it("offers operators by field type from the universal contract", () => {
    expect(UNIVERSAL_FILTER_OPERATORS.text).toEqual(["contains", "startsWith", "eq", "ne"]);
    expect(UNIVERSAL_FILTER_OPERATORS.enum).toEqual(["eq", "ne", "in", "nin"]);
    expect(UNIVERSAL_FILTER_OPERATORS.date).toEqual([
      "eq",
      "ne",
      "lt",
      "lte",
      "gt",
      "gte",
      "between",
      "exists",
    ]);
  });

  it("round-trips filters whose values contain separators", () => {
    const filter = parseUniversalFilter("fullName:contains:Serra:Vidal");
    expect(filter).toEqual({
      field: "fullName",
      operator: "contains",
      value: "Serra:Vidal",
    });
    if (filter === undefined) {
      throw new TypeError("Expected a parsed filter");
    }
    expect(serializeUniversalFilter(filter)).toBe("fullName:contains:Serra:Vidal");
    expect(parseUniversalFilter("fullName:unknown:value")).toBeUndefined();
  });
});

describe("T-03-38 universal list URL sync", () => {
  it("reads repeated filters and sort values without losing column order", () => {
    const state = readUniversalListState(
      "?page=2&size=200&q=Duna&sort=city%2Cdesc&filter=status%3Aeq%3AACTIVE&filter=city%3Aeq%3ACabrera&fields=dogs%2CfullName%2Ccity",
      defaults,
    );

    expect(state).toEqual({
      columns: ["dogs", "fullName", "city"],
      filters: [
        { field: "status", operator: "eq", value: "ACTIVE" },
        { field: "city", operator: "eq", value: "Cabrera" },
      ],
      page: 2,
      q: "Duna",
      size: 200,
      sort: ["city,desc"],
    });
  });

  it("serializes the complete view state for links, reloads, and exports", () => {
    const parameters = universalListSearchParams({
      columns: ["dogs", "fullName"],
      filters: [
        { field: "status", operator: "eq", value: "ACTIVE" },
        { field: "planId", operator: "in", value: "plan-member,plan-family" },
      ],
      page: 1,
      q: "Laura",
      size: 20,
      sort: ["lastName,asc", "firstName,asc"],
    });

    expect(parameters.get("page")).toBe("1");
    expect(parameters.get("size")).toBe("20");
    expect(parameters.get("q")).toBe("Laura");
    expect(parameters.getAll("sort")).toEqual(["lastName,asc", "firstName,asc"]);
    expect(parameters.getAll("filter")).toEqual([
      "status:eq:ACTIVE",
      "planId:in:plan-member,plan-family",
    ]);
    expect(parameters.get("fields")).toBe("dogs,fullName");
  });

  it("falls back to approved defaults for invalid pagination values", () => {
    expect(readUniversalListState("?page=-1&size=12", defaults)).toMatchObject({
      columns: defaults.columns,
      filters: defaults.filters,
      page: 0,
      size: 50,
      sort: defaults.sort,
    });
  });
});
