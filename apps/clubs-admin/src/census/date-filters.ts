import { clubLocalInstant } from "@agilityhub/i18n";
import type { UniversalFilter, UniversalListFilterColumn } from "@agilityhub/ui";

function nextDay(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** Compare calendar days in the club's zone, including 23/25-hour DST days. */
export function instantDateFilter(filter: UniversalFilter, timeZone: string): UniversalFilter {
  if (filter.operator === "exists") return { ...filter, value: "true" };
  const [start = "", end = start] = filter.value.split(",");
  const midnight = (day: string) => clubLocalInstant(`${day}T00:00`, timeZone);
  const first = new Date(midnight(start)).toISOString();
  const after = new Date(midnight(nextDay(end))).toISOString();
  if (filter.operator === "eq" || filter.operator === "between") {
    return {
      ...filter,
      operator: "between",
      value: `${first},${new Date(Date.parse(after) - 1).toISOString()}`,
    };
  }
  if (filter.operator === "gt") return { ...filter, operator: "gte", value: after };
  if (filter.operator === "lte") return { ...filter, operator: "lt", value: after };
  return { ...filter, value: first };
}

export function dateFilterInput(
  column: UniversalListFilterColumn,
  timeZone: string,
  from: string,
  to: string,
): UniversalListFilterColumn {
  if (column.type !== "date") return column;
  const instant = ["joinedAt", "registeredAt", "levelAssignedAt"].includes(column.key);
  return {
    ...column,
    inputType: "date",
    ...(instant
      ? { operators: ["eq", "lt", "lte", "gt", "gte", "between", "exists"] as const }
      : {}),
    range: { startLabel: from, endLabel: to, toValue: (start, end) => `${start},${end}` },
    toFilter: (filter) =>
      instant
        ? instantDateFilter(filter, timeZone)
        : filter.operator === "exists"
          ? { ...filter, value: "true" }
          : filter,
  };
}
