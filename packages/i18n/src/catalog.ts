import caCommon from "./locales/ca/common.json";
import caShell from "./locales/ca/shell.json";
import enCommon from "./locales/en/common.json";
import enShell from "./locales/en/shell.json";
import esCommon from "./locales/es/common.json";
import esShell from "./locales/es/shell.json";
import type { Locale } from "./types";

type DotKeys<Value> = Value extends string
  ? never
  : {
      [Key in keyof Value & string]: Value[Key] extends string
        ? Key
        : `${Key}.${DotKeys<Value[Key]>}`;
    }[keyof Value & string];

export type MessageKey = `common:${DotKeys<typeof caCommon>}` | `shell:${DotKeys<typeof caShell>}`;

const staticResources = {
  ca: { common: caCommon, shell: caShell },
  en: { common: enCommon, shell: enShell },
  es: { common: esCommon, shell: esShell },
} as const;

function lookup(resource: object, path: string): string | undefined {
  let current: unknown = resource;
  for (const segment of path.split(".")) {
    if (typeof current !== "object" || current === null || !(segment in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" ? current : undefined;
}

export function translateStatic(
  key: MessageKey,
  locale: Locale = "ca",
  values: Readonly<Record<string, number | string>> = {},
): string {
  const separator = key.indexOf(":");
  const namespace = key.slice(0, separator) as "common" | "shell";
  const path = key.slice(separator + 1);
  const value = lookup(staticResources[locale][namespace], path);
  if (value === undefined) {
    return key;
  }

  return value.replace(/\{([A-Za-z][A-Za-z\d]*)\}/g, (match, variable: string) =>
    variable in values ? String(values[variable]) : match,
  );
}
