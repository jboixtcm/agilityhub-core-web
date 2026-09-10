import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localeRoot = path.join(root, "packages/i18n/src/locales");
const locales = ["ca", "es", "en"];
const sourceRoots = [path.join(root, "apps"), path.join(root, "packages")];
const issues = [];

const forbidden = [
  { label: "parell/parella/parelles", pattern: /\bparell(?:a|es)?\b/iu },
  { label: "amigable", pattern: /\bamigable\b/iu },
  { label: "(paràmetre)", pattern: /\(paràmetre\)/iu },
  { label: "F + digits", pattern: /\bF\d+\b/u },
  { label: "RF-", pattern: /\bRF-/u },
  { label: "BR-", pattern: /\bBR-/u },
  { label: "PAR-", pattern: /\bPAR-/u },
];

function flatten(value, prefix = "", result = new Map()) {
  if (typeof value === "string") {
    result.set(prefix, value);
    return result;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    issues.push(`invalid translation value at ${prefix || "<root>"}`);
    return result;
  }
  for (const [key, child] of Object.entries(value)) {
    flatten(child, prefix === "" ? key : `${prefix}.${key}`, result);
  }
  return result;
}

async function translationCatalog(locale) {
  const directory = path.join(localeRoot, locale);
  const files = (await readdir(directory)).filter((file) => file.endsWith(".json")).sort();
  const catalog = new Map();

  for (const file of files) {
    const namespace = path.basename(file, ".json");
    const filePath = path.join(directory, file);
    let parsed;
    try {
      parsed = JSON.parse(await readFile(filePath, "utf8"));
    } catch (error) {
      issues.push(`${path.relative(root, filePath)}: invalid JSON (${error.message})`);
      continue;
    }

    for (const [key, value] of flatten(parsed)) {
      const fullKey = `${namespace}:${key}`;
      catalog.set(fullKey, { filePath, value });
      if (value.trim() === "") {
        issues.push(`${path.relative(root, filePath)}: empty value for ${fullKey}`);
      }
      for (const rule of forbidden) {
        if (rule.pattern.test(value)) {
          issues.push(`${path.relative(root, filePath)}: forbidden ${rule.label} in ${fullKey}`);
        }
      }
    }
  }

  return catalog;
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (["dist", "node_modules"].includes(entry.name)) {
      continue;
    }
    const item = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (item === localeRoot) {
        continue;
      }
      files.push(...(await sourceFiles(item)));
    } else if (/\.tsx?$/.test(entry.name)) {
      files.push(item);
    }
  }
  return files;
}

const catalogs = new Map();
for (const locale of locales) {
  catalogs.set(locale, await translationCatalog(locale));
}

const canonicalKeys = new Set(catalogs.get("ca").keys());
for (const locale of locales.slice(1)) {
  const localeKeys = new Set(catalogs.get(locale).keys());
  for (const key of canonicalKeys) {
    if (!localeKeys.has(key)) {
      issues.push(`${locale}: missing translation key ${key}`);
    }
  }
  for (const key of localeKeys) {
    if (!canonicalKeys.has(key)) {
      issues.push(`ca: missing translation key ${key} (present in ${locale})`);
    }
  }
}

const usedKeys = new Map();
for (const sourceRoot of sourceRoots) {
  for (const file of await sourceFiles(sourceRoot)) {
    const source = await readFile(file, "utf8");
    const keyPattern = /\b(?:t|translateStatic)\(\s*(["'`])([^"'`]+)\1/g;
    for (const match of source.matchAll(keyPattern)) {
      const rawKey = match[2];
      if (rawKey === undefined || rawKey.includes("${")) {
        continue;
      }
      const key = rawKey.includes(":") ? rawKey : `common:${rawKey}`;
      usedKeys.set(key, path.relative(root, file));
    }

    if (file.endsWith(".tsx")) {
      for (const rule of forbidden) {
        if (rule.pattern.test(source)) {
          issues.push(`${path.relative(root, file)}: forbidden ${rule.label} in TSX source`);
        }
      }
    }
  }
}

for (const [key, file] of usedKeys) {
  for (const locale of locales) {
    if (!catalogs.get(locale).has(key)) {
      issues.push(`${file}: ${key} has no ${locale} translation`);
    }
  }
}

const dynamicKeyPrefixes = [
  "admin-census:signupReview.fields.",
  "admin-census:signupReview.warnings.",
  "admin-census:values.",
  "admin-dashboard:risk.status.",
  "admin-dashboard:signups.payment.",
  "admin-audit:actions.",
  "admin-settings:blocks.",
  "admin-settings:days.",
  "admin-settings:derived.",
  "admin-settings:editor.coverage.",
  "admin-settings:enum.",
  "admin-settings:modules.",
  "admin-settings:param.",
];

const settingsFixture = await readFile(
  path.join(root, "packages/api-client/src/mocks/fixtures/settings.ts"),
  "utf8",
);
const parameterKeys = new Set(
  [...settingsFixture.matchAll(/\bparameter\(\s*"([^"]+)"/gu)].map((match) => match[1]),
);
for (const parameterKey of parameterKeys) {
  for (const suffix of ["help", "label"]) {
    const translationKey = `admin-settings:param.${parameterKey}.${suffix}`;
    for (const locale of locales) {
      if (!catalogs.get(locale).has(translationKey)) {
        issues.push(`${locale}: missing parameter translation key ${translationKey}`);
      }
    }
  }
}

for (const key of canonicalKeys) {
  if (
    !key.startsWith("errors:") &&
    !dynamicKeyPrefixes.some((prefix) => key.startsWith(prefix)) &&
    !usedKeys.has(key)
  ) {
    issues.push(`unused translation key ${key}`);
  }
}

if (issues.length > 0) {
  console.error(`i18n check failed with ${issues.length} issue(s):`);
  for (const issue of [...new Set(issues)].sort()) {
    console.error(`- ${issue}`);
  }
  process.exitCode = 1;
} else {
  console.log("i18n check passed");
  for (const locale of locales) {
    console.log(`${locale}: ${catalogs.get(locale).size} keys`);
  }
  console.log(`${usedKeys.size} statically used keys, 0 unused`);
}
