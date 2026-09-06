/** Module keys from CATALEG_MODULS.md. */
export const clubModules = [
  "FREE_TRAINING",
  "BILLING",
  "PACKS",
  "SINGLE_CLASS",
  "ACTIVITIES",
  "FAMILY_GROUP",
  "WAITLIST",
  "TASKS",
  "FAQ",
  "SMS",
  "PUSH",
  "INACTIVITY",
  "COURSES",
  "LEARN_LINK",
  "STATS",
  "SOCIAL_LEAGUE",
] as const;

export type ClubModule = (typeof clubModules)[number];

export interface ModuleGatedItem {
  module?: ClubModule;
}

export function isModuleEnabled(enabledModules: readonly string[], module: ClubModule): boolean {
  return enabledModules.includes(module);
}

/** Use for route, tab, and menu registration so disabled modules create no dead links. */
export function filterEnabledModuleItems<Item extends ModuleGatedItem>(
  items: readonly Item[],
  enabledModules: readonly string[],
): Item[] {
  return items.filter(
    (item) => item.module === undefined || isModuleEnabled(enabledModules, item.module),
  );
}
