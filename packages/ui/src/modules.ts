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

export type ModuleUiArea = "menuEntries" | "routes" | "tabs";

export interface ModuleUiRegistration {
  menuEntries: readonly string[];
  routes: readonly string[];
  tabs: readonly string[];
}

/** Single module-to-UI registry shared by the clubs and clubs-admin shells. */
export const moduleUi = {
  FREE_TRAINING: {
    menuEntries: ["training"],
    // Screen 08 and its booking detail. Screen 24 and the D12 card are not gated: a `BLOCK`
    // exists without the module (S09 §9), only the «Reserva de pista» kind needs it.
    routes: ["/entrenaments", "/entrenaments/:id"],
    tabs: ["training"],
  },
  BILLING: {
    menuEntries: ["billing"],
    routes: ["/facturacio", "/facturacio/remeses", "/rebuts", "/rebuts/:id"],
    tabs: [],
  },
  PACKS: { menuEntries: [], routes: [], tabs: [] },
  SINGLE_CLASS: { menuEntries: [], routes: [], tabs: [] },
  ACTIVITIES: {
    menuEntries: ["activities"],
    routes: ["/activitats", "/activitats/:id", "/activitats/:id/inscrits"],
    tabs: [],
  },
  FAMILY_GROUP: { menuEntries: [], routes: [], tabs: [] },
  // S08 §9: without WAITLIST there is no waiting entry to open.
  WAITLIST: { menuEntries: [], routes: ["/espera/:id"], tabs: [] },
  TASKS: {
    menuEntries: ["student-follow-up"],
    // S10 §2: screen 26 (E6-W02) replaces E0-W06's `/instructor/tasques` placeholder.
    routes: ["/seguiment", "/instructor/alumnes/:dogId/tasques"],
    tabs: [],
  },
  FAQ: { menuEntries: [], routes: [], tabs: [] },
  SMS: { menuEntries: [], routes: [], tabs: [] },
  PUSH: { menuEntries: [], routes: [], tabs: [] },
  INACTIVITY: {
    menuEntries: [],
    routes: ["/inactivitat"],
    tabs: [],
  },
  COURSES: {
    menuEntries: ["courses"],
    routes: [
      "/recorreguts/muntat/:ringId",
      "/instructor/pistes/:ringId/muntat",
      "/instructor/muntatge/:sessionId",
      "/recorreguts",
      // E9-W03: a course of D18, its placement editor and D16's «Geometria» of a ring.
      "/recorreguts/:id",
      "/recorreguts/:id/col-locacio",
      "/pistes/:id/geometria",
    ],
    tabs: [],
  },
  LEARN_LINK: { menuEntries: ["learn"], routes: [], tabs: [] },
  STATS: { menuEntries: [], routes: ["/estadistiques"], tabs: [] },
  SOCIAL_LEAGUE: { menuEntries: [], routes: ["/estadistiques/lliga"], tabs: [] },
} as const satisfies Record<ClubModule, ModuleUiRegistration>;

/**
 * «Depèn de» of CATALEG_MODULS.md: a module is enabled only with the ones it requires (the api
 * answers `422 MODULE_DEPENDENCY {module, requires}` otherwise, S17 R-17-04).
 */
export const moduleDependencies: Readonly<Partial<Record<ClubModule, readonly ClubModule[]>>> = {
  PACKS: ["BILLING"],
  SINGLE_CLASS: ["BILLING"],
  SOCIAL_LEAGUE: ["STATS"],
};

/** S17 R-17-04's presets (`PlatformModulesRequest.preset`) and the modules each one enables. */
export const modulePresets = {
  COMPLET: clubModules.filter((module) => module !== "STATS" && module !== "SOCIAL_LEAGUE"),
  MINIM: ["WAITLIST", "FAQ", "PUSH"],
  CANIC: clubModules.filter(
    (module) => module !== "SINGLE_CLASS" && module !== "STATS" && module !== "SOCIAL_LEAGUE",
  ),
} as const satisfies Record<string, readonly ClubModule[]>;

export type ModulePreset = keyof typeof modulePresets;

/** The modules `module` requires that `enabledModules` lacks. */
export function missingModuleDependencies(
  enabledModules: readonly string[],
  module: ClubModule,
): ClubModule[] {
  return (moduleDependencies[module] ?? []).filter(
    (required) => !enabledModules.includes(required),
  );
}

/** The enabled modules that require `module` (it cannot go off while they are on). */
export function moduleDependents(
  enabledModules: readonly string[],
  module: ClubModule,
): ClubModule[] {
  return clubModules.filter(
    (candidate) =>
      enabledModules.includes(candidate) && (moduleDependencies[candidate] ?? []).includes(module),
  );
}

export function isModuleEnabled(enabledModules: readonly string[], module: ClubModule): boolean {
  return enabledModules.includes(module);
}

export function requiredModulesForUiItem(area: ModuleUiArea, item: string): ClubModule[] {
  return clubModules.filter((module) => moduleUi[module][area].some((value) => value === item));
}

export function isModuleUiItemEnabled(
  enabledModules: readonly string[],
  area: ModuleUiArea,
  item: string,
): boolean {
  const required = requiredModulesForUiItem(area, item);
  return (
    required.length === 0 || required.some((module) => isModuleEnabled(enabledModules, module))
  );
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
