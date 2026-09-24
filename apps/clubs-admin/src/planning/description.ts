export interface DescriptionLevel {
  active: boolean;
  id: string;
  name: string;
  order: number;
}

export type DescriptionTranslate = (
  key: "admin-scheduling:description.andAbove" | "admin-scheduling:description.join",
  values: Record<string, string>,
) => string;

/**
 * R-06-03 preview of the automatic description (the API `displayDescription` always wins once
 * the class exists): 1 level → «{name}»; a contiguous set of ≥ 2 levels that reaches the last
 * active level → «{first} i sup.»; otherwise the names joined by «+».
 */
export function automaticDescription(
  levels: readonly DescriptionLevel[],
  levelIds: readonly string[],
  t: DescriptionTranslate,
): string {
  const active = levels
    .filter((level) => level.active)
    .sort((left, right) => left.order - right.order);
  const selected = active.filter((level) => levelIds.includes(level.id));
  const first = selected[0];
  if (first === undefined) {
    return "";
  }
  if (selected.length === 1) {
    return first.name;
  }
  const start = active.indexOf(first);
  const contiguous = selected.every((level, index) => active[start + index] === level);
  if (contiguous && selected.at(-1) === active.at(-1)) {
    return t("admin-scheduling:description.andAbove", { level: first.name });
  }
  return selected.map((level) => level.name).join(t("admin-scheduling:description.join", {}));
}
