import type { i18n } from "i18next";

import { clubsNamespaceBackend, type ClubsNamespace } from "./clubs-resources";
import { createI18nWithBackend, type CreateI18nOptions } from "./setup-base";

export { clubsNamespaces, type ClubsNamespace } from "./clubs-resources";

/** The students' app's i18n: only its own namespaces load (no `admin-*`, `console`, `id`). */
export function createClubsI18n(
  options: Omit<CreateI18nOptions, "initialNamespaces"> & {
    initialNamespaces?: readonly ClubsNamespace[] | undefined;
  },
): Promise<i18n> {
  return createI18nWithBackend(options, clubsNamespaceBackend);
}
