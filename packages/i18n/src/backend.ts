import type { BackendModule, ReadCallback } from "i18next";

import { productLocales, type Locale } from "./types";

export type Messages = Record<string, unknown>;
export type ResourceLoader = () => Promise<{ default: Messages }>;
export type LoaderTable<N extends string> = Readonly<
  Record<Locale, Readonly<Record<N, ResourceLoader>>>
>;

function isLocale(value: string): value is Locale {
  return productLocales.includes(value as Locale);
}

/**
 * An i18next backend over tables of dynamic `import()`s: each app hands in only the namespaces it
 * renders, so Vite emits a locale chunk for those and none for the rest (the students' app ships no
 * `admin-*`, the ID pages only `common`/`errors`/`id`). `load` is a function, never a table built
 * at module level (a top-level `{ ...a, ...b }` is kept by the bundler even when unused).
 */
export function createLoaderBackend<N extends string>(
  namespaces: readonly N[],
  load: (locale: Locale, namespace: N) => Promise<{ default: Messages }>,
  label = "i18n",
): BackendModule {
  const isNamespace = (value: string): value is N => namespaces.includes(value as N);
  return {
    type: "backend",
    init: () => undefined,
    read(language: string, namespace: string, callback: ReadCallback): void {
      const baseLanguage = language.toLowerCase().split("-")[0] ?? language;
      if (!isLocale(baseLanguage) || !isNamespace(namespace)) {
        callback(new Error(`Unsupported ${label} resource: ${language}/${namespace}`), false);
        return;
      }

      void load(baseLanguage, namespace).then(
        ({ default: messages }) => {
          callback(null, messages);
        },
        (error: unknown) => {
          callback(error instanceof Error ? error : new Error(String(error)), false);
        },
      );
    },
  };
}
