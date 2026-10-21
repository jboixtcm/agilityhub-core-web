// Types of check-es-actions.mjs for the TypeScript that imports it
// (packages/i18n/src/index.test.ts, the E11-W04 guard inside Vitest).

/** An es catalog by namespace, as `packages/i18n/src/locales/es/<namespace>.json` holds it. */
export type Catalog = Readonly<Record<string, unknown>>;

export declare const IMPERATIVES: ReadonlySet<string>;
export declare const KEEP: ReadonlyMap<string, string>;

export declare function flaggedActions(
  catalog: Catalog,
  keep?: ReadonlyMap<string, string>,
): { key: string; value: string }[];

export declare function keptActions(
  catalog: Catalog,
  keep?: ReadonlyMap<string, string>,
): { key: string; reason: string; value: string }[];

export declare function readCatalog(localesDir: string, locale?: string): Promise<Catalog>;
