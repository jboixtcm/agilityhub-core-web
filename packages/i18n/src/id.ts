import type { i18n } from "i18next";

import { idNamespaceBackend } from "./id-resources";
import { createI18nWithBackend, type CreateI18nOptions } from "./setup-base";

export function createIdI18n(options: CreateI18nOptions): Promise<i18n> {
  return createI18nWithBackend(options, idNamespaceBackend);
}
