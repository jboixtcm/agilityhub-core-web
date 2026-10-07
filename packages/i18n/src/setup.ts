import { namespaceBackend } from "./resources";
import { createI18nWithBackend, type CreateI18nOptions } from "./setup-base";

export type { CreateI18nOptions } from "./setup-base";

export function createI18n(options: CreateI18nOptions) {
  return createI18nWithBackend(options, namespaceBackend);
}
