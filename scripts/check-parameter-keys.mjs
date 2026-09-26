// D11 labels of the parameter catalog (E4-W06 step 4). Every parameter of
// docs/specs/00-transversal/CATALEG_PARAMETRES.md that D11 renders needs
// `admin-settings:param.<key>.label` and `.help`, every D11 block its `admin-settings:blocks.<key>`
// and every listed enum value its `admin-settings:enum.<key>.<VALUE>`, in ca, es and en.
// Chained in `pnpm i18n:check` after check-error-codes.mjs.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(root, "docs/specs/00-transversal/CATALEG_PARAMETRES.md");
const locales = ["ca", "es", "en"];

// The catalog's «Bloc D11» names → the block keys the published core sends in `GET /parameters`
// (recorded from the core by e2e/core/d11-core.spec.ts). A new block name fails the check until
// it is mapped here and labelled.
const blockKeys = new Map([
  ["Alta i consentiments", "signup"],
  ["Classes", "classes"],
  ["Club i pistes", "club"],
  ["Comunicacions", "messaging"],
  ["Entrenaments", "training"],
  ["Llista d'espera", "waitlist"],
  ["Privacitat i auditoria", "privacy"],
  ["Processos automàtics", "jobs"],
  ["Quotes i remesa", "billing"],
  ["Recorreguts", "courses"],
]);

// System-only parameters: the core sends them in its `system` block (`editableBy: PLATFORM`), which
// D11 never renders, so they need no label. Keep in step with the catalog's «bloc sistema» rows
// and the core; a catalog key that is neither here nor labelled fails the check.
const systemOnly = new Set([
  "auth.checkCompromisedPasswords",
  "auth.impersonationMinutes",
  "auth.lockoutMaxAttempts",
  "auth.lockoutMinutes",
  "auth.magicLinkMinutes",
  "auth.maxSessions",
  "auth.passwordMinLength",
  "auth.sessionDays",
  "auth.welcomeLinkDays",
  "dashboard.pendingSignupAgeWarnDays",
  "files.allowedTypes",
  "files.dogPhotoMaxMb",
  "files.maxAttachmentsPerEntity",
  "files.maxSizeMb",
  "history.monthsVisible",
  "jobs.retention.domainEventsDays",
  "jobs.retention.exportFilesDays",
  "jobs.retention.jobRunsDays",
  "jobs.retention.orphanUploadsHours",
  "jobs.retention.stripeEventsDays",
  "messaging.push.ttlMinutes",
  "migration.exportRetentionDays",
  "migration.leftMaxYears",
  "migration.playoffReadOnlyMonths",
  "migration.reconciliationTolerancePct",
  "platform.domainRecheckDays",
  "platform.supportAccessMinutes",
  "security.eventRetentionDays",
  "signup.rateLimit",
]);

const keyPattern = /^[a-z][A-Za-z\d]*(\.[A-Za-z\d<>]+)+$/u;

function backticked(cell) {
  return [...cell.matchAll(/`([^`]+)`/gu)].map((match) => match[1] ?? "");
}

/** The parameter keys of a «Clau» cell: `a.b` · `c` (= `a.c`) · `jobs.<nom>.enabled` (x · y). */
function cellKeys(cell) {
  const keys = [];
  let prefix = "";
  for (const token of backticked(cell)) {
    if (keyPattern.test(token)) {
      if (token.includes("<nom>")) {
        const names = /\(([^)]+)\)/u.exec(cell)?.[1]?.split("·") ?? [];
        keys.push(...names.map((name) => token.replace("<nom>", name.trim())));
      } else {
        keys.push(token);
      }
      prefix = token.slice(0, token.lastIndexOf(".") + 1);
    } else if (/^[a-z][A-Za-z\d]*$/u.test(token) && prefix !== "") {
      keys.push(`${prefix}${token}`);
    }
  }
  return keys;
}

/** Enum values listed in a «Tipus» cell: enum `A`/`B` or enum `A · B`. */
function enumValues(cell) {
  if (!cell.trimStart().startsWith("enum")) return [];
  return backticked(cell)
    .flatMap((token) => token.split(/[·/]/u))
    .map((value) => value.trim())
    .filter((value) => /^[A-Z][A-Z\d_]*$/u.test(value));
}

const catalog = await readFile(catalogPath, "utf8");
const parameters = new Map(); // key → { block, enumValues }
const blockNames = new Set();
let sectionBlock;

for (const line of catalog.split("\n")) {
  if (line.startsWith("## ")) {
    sectionBlock = /— bloc (.+)$/u.exec(line)?.[1]?.trim();
    continue;
  }
  if (!line.startsWith("| `")) continue;
  const cells = line.split("|").slice(1, -1);
  const [keyCell = "", typeCell = ""] = cells;
  // CLUB fields shown in D11 but stored in CLUB (`(CLUB)`, `(CLUB.legal)`…) are not parameters.
  if (typeCell.trim().startsWith("(CLUB")) continue;
  // Annex A: | Clau | Tipus | Defecte | Bloc D11 | Spec | (a few rows add a note before «Bloc
  // D11»): the block is the cell before the spec. The other tables take the section's block.
  const block = cells.length >= 5 ? (cells.at(-2) ?? "").trim() : sectionBlock;
  for (const key of cellKeys(keyCell)) {
    const known = parameters.get(key);
    parameters.set(key, {
      block: known?.block ?? block,
      enumValues: [...new Set([...(known?.enumValues ?? []), ...enumValues(typeCell)])],
    });
  }
}

const catalogs = new Map();
for (const locale of locales) {
  catalogs.set(
    locale,
    JSON.parse(
      await readFile(
        path.join(root, "packages/i18n/src/locales", locale, "admin-settings.json"),
        "utf8",
      ),
    ),
  );
}

function translation(locale, dotted) {
  let node = catalogs.get(locale);
  for (const part of dotted.split(".")) {
    if (typeof node !== "object" || node === null || !(part in node)) return undefined;
    node = node[part];
  }
  return typeof node === "string" && node.trim() !== "" ? node : undefined;
}

const missing = [];
let rendered = 0;
for (const [key, { block, enumValues: values }] of [...parameters].sort()) {
  if (systemOnly.has(key)) continue;
  rendered += 1;
  const blockName = block?.replace(/\s*\(.*$/u, "").trim();
  if (blockName !== undefined && !blockName.startsWith("sistema")) blockNames.add(blockName);
  for (const locale of locales) {
    for (const suffix of ["label", "help"]) {
      if (translation(locale, `param.${key}.${suffix}`) === undefined) {
        missing.push(`${locale}: admin-settings:param.${key}.${suffix}`);
      }
    }
    for (const value of values) {
      if (translation(locale, `enum.${key}.${value}`) === undefined) {
        missing.push(`${locale}: admin-settings:enum.${key}.${value}`);
      }
    }
  }
}

for (const name of [...blockNames].sort()) {
  const blockKey = blockKeys.get(name);
  if (blockKey === undefined) {
    missing.push(`block «${name}» has no core key in scripts/check-parameter-keys.mjs`);
    continue;
  }
  for (const locale of locales) {
    if (translation(locale, `blocks.${blockKey}`) === undefined) {
      missing.push(`${locale}: admin-settings:blocks.${blockKey}`);
    }
  }
}

// `node scripts/check-parameter-keys.mjs --list`: the parsed keys, to compare with the core.
if (process.argv.includes("--list")) {
  for (const [key, { block }] of [...parameters].sort()) {
    const name = block?.replace(/\s*\(.*$/u, "").trim() ?? "";
    console.log(`${key}\t${systemOnly.has(key) ? "system" : (blockKeys.get(name) ?? name)}`);
  }
}

console.log(
  `${parameters.size} catalog parameters (${rendered} in D11, ${systemOnly.size} system-only), ${blockNames.size} blocks, ${missing.length} missing`,
);
if (missing.length > 0) {
  for (const item of missing) {
    console.error(`- ${item}`);
  }
  process.exitCode = 1;
}
