export interface DescriptionLevel {
  active: boolean;
  id: string;
  name: string;
  order: number;
  /** `Level.progression` (S05, ruling E29); absent = part of the progression. */
  progression?: boolean | undefined;
}

export type DescriptionTranslate = (
  key: "admin-scheduling:description.andAbove" | "admin-scheduling:description.join",
  values: Record<string, string>,
) => string;

/**
 * R-06-03 preview of the automatic description (the API `displayDescription` always wins once
 * the class exists): 1 level → «{name}»; a contiguous set of ≥ 2 progression levels that reaches
 * the last active progression level → «{first} i sup.» (E29: levels with `progression = false`,
 * such as «Teràpia», neither count for the run nor end it); otherwise the names joined by «+».
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
  const progression = active.filter((level) => level.progression !== false);
  const start = progression.indexOf(first);
  const contiguous =
    start >= 0 && selected.every((level, index) => progression[start + index] === level);
  if (contiguous && selected.at(-1) === progression.at(-1)) {
    return t("admin-scheduling:description.andAbove", { level: first.name });
  }
  return selected.map((level) => level.name).join(t("admin-scheduling:description.join", {}));
}
