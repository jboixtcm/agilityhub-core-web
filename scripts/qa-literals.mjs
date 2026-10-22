// E11-W03 (DECISIONS_PENDENTS B24, B25): the table of every literal Josep checks on staging, the
// ones that are not in an approved mockup, with the screens whose code shows them.
//
//   node scripts/qa-literals.mjs            writes docs/qa/LITERALS_QA.md
//   node scripts/qa-literals.mjs --check    exits 1 when that file is not what the script writes
//
// A `ca` string is «from the mockup» when every static fragment of it (the text outside ICU
// arguments, plus every branch of a plural or select, nested ones too) appears in the visible
// text of one mockup (`docs/pantalles/**/*.html`, case-insensitive, quotes and spaces normalised),
// so a message with one branch in no mockup stays in the table. Every other string is a literal
// for Josep: B24 when all the screens that use it have no mockup, B25 when one of them has one (a
// literal proposed for a screen with a mockup) or when it is transversal.
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localeRoot = path.join(root, "packages/i18n/src/locales");
const mockupRoots = ["docs/pantalles/mobil", "docs/pantalles/escriptori"].map((item) =>
  path.join(root, item),
);
const registerFile = path.join(root, "docs/DECISIONS_COPY_A39-A41.md");
const outputFile = path.join(root, "docs/qa/LITERALS_QA.md");
const locales = ["ca", "es", "en"];

/**
 * Where a source file shows its strings: the first rule whose path prefix matches. `mockups` are
 * the mockup ids of those screens; an empty list means the screens have no mockup (B24).
 */
const SCREENS = [
  [
    "apps/clubs/src/booking/",
    "03 · 04 · 06 · 07 · 29 — inici, reservar, confirmar, reserva i espera",
    ["03", "04", "06", "07", "29"],
  ],
  ["apps/clubs/src/activities/", "04 — activitats", ["04"]],
  ["apps/clubs/src/training/", "08 · 24 — entrenaments i pista", ["08", "24"]],
  ["apps/clubs/src/today/", "10 · 23 — avui (quadre del dia)", ["10", "23"]],
  ["apps/clubs/src/NotificationsPage", "11 — notificacions", ["11"]],
  ["apps/clubs/src/notifications/", "11 · 12 — notificacions i preferències", ["11", "12"]],
  ["apps/clubs/src/profile/", "12 — perfil, preferències i dades", ["12"]],
  ["apps/clubs/src/SelfServicePages", "13 · 28 — els meus gossos, les meves dades", ["13", "28"]],
  ["apps/clubs/src/billing/", "12 · 13 — rebuts i pack", ["12", "13"]],
  ["apps/clubs/src/inactivity/", "14 — inactivitat", ["14"]],
  ["apps/clubs/src/leave/", "15 — baixa", ["15"]],
  ["apps/clubs/src/SignupPage", "16–19 — alta pública", ["16", "17", "18", "19"]],
  ["apps/clubs/src/payments/", "19 — pagament amb targeta", ["19"]],
  ["apps/clubs/src/PublicFooter", "01 · 16 — peu de les pàgines públiques", ["01", "16"]],
  ["apps/clubs/src/instructor/", "20 · 21 · 22 · 26 — instructor", ["20", "21", "22", "26"]],
  ["apps/clubs/src/history/", "25 — historial", ["25"]],
  ["apps/clubs/src/InfoPage", "30 — info i preguntes freqüents", ["30"]],
  ["apps/clubs/src/courses/", "Recorreguts a l'app (visor, registre, sessió de muntatge)", []],
  ["apps/clubs/src/UnsubscribePage", "Baixa dels avisos per correu (enllaç del correu)", []],
  [
    "apps/clubs/src/",
    "01 · 02 · 03b — accés, activació, tria de perfil i marc de l'app",
    ["01", "02", "03b"],
  ],
  ["apps/clubs-admin/src/dashboard/SignupReview", "D2 — validació d'una preinscripció", ["D2"]],
  ["apps/clubs-admin/src/dashboard/SignupEdit", "D2 — validació d'una preinscripció", ["D2"]],
  ["apps/clubs-admin/src/dashboard/", "D1 — tauler", ["D1"]],
  ["apps/clubs-admin/src/planning/Template", "D3 · D3b — plantilles", ["D3", "D3b"]],
  ["apps/clubs-admin/src/planning/", "D4 · D4b · D4c — calendari de classes", ["D4", "D4b", "D4c"]],
  ["apps/clubs-admin/src/census/InactivityLeavePage", "Inactivitats i baixes (pàgina nova)", []],
  [
    "apps/clubs-admin/src/census/CensusList",
    "D5 · D15 — llistats d'abonats i de gossos",
    ["D5", "D15"],
  ],
  ["apps/clubs-admin/src/census/", "D10 — fitxa d'abonat", ["D10"]],
  ["apps/clubs-admin/src/lists/", "D5 · D15 — llistat universal", ["D5", "D15"]],
  ["apps/clubs-admin/src/billing/", "D6 — facturació i remeses", ["D6"]],
  ["apps/clubs-admin/src/activities/", "D7 — activitats", ["D7"]],
  ["apps/clubs-admin/src/catalogs/Plans", "D8 — modalitats i tarifes", ["D8"]],
  ["apps/clubs-admin/src/catalogs/Rings", "D16 — pistes", ["D16"]],
  ["apps/clubs-admin/src/catalogs/Team", "D17 — instructors i administradors", ["D17"]],
  ["apps/clubs-admin/src/catalogs/", "D11 — paràmetres del club", ["D11"]],
  ["apps/clubs-admin/src/messaging/", "D9 — comunicats i plantilles d'avís", ["D9"]],
  ["apps/clubs-admin/src/instructor/", "D12 · D13 — agenda i fitxa d'alumne", ["D12", "D13"]],
  ["apps/clubs-admin/src/followup/", "D14 — seguiment d'alumnes", ["D14"]],
  ["apps/clubs-admin/src/training/", "Entrenaments i bloquejos de pista (backoffice)", []],
  ["apps/clubs-admin/src/courses/", "D18 — recorreguts", []],
  ["apps/clubs-admin/src/console/", "D19 — consola de clubs", []],
  ["apps/clubs-admin/src/audit/", "Auditoria", []],
  ["apps/clubs-admin/src/support/", "Accés de suport", []],
  ["apps/clubs-admin/src/", "Marc del backoffice (accés, menú, estats de càrrega i d'error)", []],
  ["apps/id/src/", "AgilityHub ID (accés, compte, productes)", []],
  ["packages/auth/src/", "01 · 02 · 12 — accés i sessió", ["01", "02", "12"]],
  ["packages/course-ui/src/", "Recorreguts (components compartits)", []],
  ["packages/ui/src/", "Components compartits (transversal)", ["*"]],
  ["packages/api-client/src/", "Missatges de l'api (transversal)", ["*"]],
  ["packages/", "Paquets compartits (transversal)", ["*"]],
];

function flatten(value, prefix, result) {
  if (typeof value === "string") {
    result.set(prefix, value);
    return result;
  }
  for (const [key, child] of Object.entries(value)) {
    flatten(child, prefix === "" ? key : `${prefix}.${key}`, result);
  }
  return result;
}

async function catalog(locale) {
  const directory = path.join(localeRoot, locale);
  const result = new Map();
  for (const file of (await readdir(directory)).filter((item) => item.endsWith(".json")).sort()) {
    const namespace = path.basename(file, ".json");
    const parsed = JSON.parse(await readFile(path.join(directory, file), "utf8"));
    for (const [key, value] of flatten(parsed, "", new Map())) {
      result.set(`${namespace}:${key}`, value);
    }
  }
  return result;
}

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (
      ["dist", "node_modules", "locales", "mocks", "test", "dev", "generated"].includes(entry.name)
    ) {
      continue;
    }
    const item = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(item)));
    else if (/\.tsx?$/u.test(entry.name) && !/\.test\.tsx?$/u.test(entry.name)) files.push(item);
  }
  return files;
}

function normalise(text) {
  return text
    .normalize("NFC")
    .replace(/[\u00a0\u202f\u2007]/gu, " ")
    .replace(/[‘’ʼ]/gu, "'")
    .replace(/\.\.\./gu, "…")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("ca");
}

const ENTITIES = {
  amp: "&",
  apos: "'",
  gt: ">",
  laquo: "«",
  lt: "<",
  nbsp: " ",
  quot: '"',
  raquo: "»",
  rsquo: "’",
  lsquo: "‘",
  hellip: "…",
  middot: "·",
  mdash: "—",
  ndash: "–",
  euro: "€",
};

function decode(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (whole, name) => {
    if (name.startsWith("#x") || name.startsWith("#X"))
      return String.fromCodePoint(parseInt(name.slice(2), 16));
    if (name.startsWith("#")) return String.fromCodePoint(Number(name.slice(1)));
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** The visible text of a mockup: its text nodes and its placeholder, title, aria-label and alt values. */
export function mockupText(html) {
  const body = html
    .replace(/<(style|script)\b[\s\S]*?<\/\1>/giu, " ")
    .replace(/<!--[\s\S]*?-->/gu, " ");
  const attributes = [
    ...body.matchAll(/\b(?:placeholder|title|aria-label|alt|value)="([^"]*)"/giu),
  ].map((match) => match[1]);
  const text = body.replace(/<[^>]+>/gu, " ");
  return normalise(decode(`${text} ${attributes.join(" ")}`));
}

/** The index of the `}` that closes the `{` at `open`. */
function closing(text, open) {
  let depth = 0;
  let end = open;
  for (; end < text.length; end += 1) {
    if (text[end] === "{") depth += 1;
    if (text[end] === "}") depth -= 1;
    if (depth === 0) break;
  }
  return end;
}

/**
 * The branches of a plural/select argument (`count, plural, =0 {…} one {…} other {…}`, without
 * its outer braces), each with `#` as a variable for a plural; `[]` for a plain argument.
 */
function branches(argument) {
  const head = /^\s*[^,{}]+,\s*(plural|select|selectordinal)\s*,/u.exec(argument);
  if (head === null) return [];
  const result = [];
  let index = head[0].length;
  for (let open = argument.indexOf("{", index); open !== -1; open = argument.indexOf("{", index)) {
    const end = closing(argument, open);
    const branch = argument.slice(open + 1, end);
    result.push(head[1] === "select" ? branch : branch.replaceAll("#", "{n}"));
    index = end + 1;
  }
  return result;
}

/** The text of a message outside its ICU arguments, plus every branch of each plural/select. */
export function fragments(message) {
  const pieces = [];
  let current = "";
  let index = 0;
  while (index < message.length) {
    const character = message[index];
    if (character === "'" && message[index + 1] === "{") {
      const end = message.indexOf("'", index + 1);
      current += message.slice(index + 1, end === -1 ? undefined : end);
      index = end === -1 ? message.length : end + 1;
      continue;
    }
    if (character !== "{") {
      current += character;
      index += 1;
      continue;
    }
    const end = closing(message, index);
    pieces.push(current);
    current = "";
    for (const branch of branches(message.slice(index + 1, end))) pieces.push(...fragments(branch));
    index = end + 1;
  }
  pieces.push(current);
  return pieces
    .flatMap((piece) => piece.split(/<\/?[A-Za-z0-9]+\s*\/?>/u))
    .map((piece) => normalise(piece).replace(/^[\s.,:;·—–-]+|[\s.,:;·—–-]+$/gu, ""))
    .filter((piece) => (piece.match(/\p{L}/gu) ?? []).length >= 3);
}

const SHARED_GROUP = "Transversal — textos de més de tres pantalles";
const ERRORS_GROUP = "Missatges d'error (surten a la pantalla de l'acció que falla)";

/**
 * The mockup a `ca` message comes from: the first one whose visible text holds every fragment of
 * the message, `undefined` when none does. `null` when the message is only variables or signs.
 */
export function matchingMockup(message, mockups) {
  const parts = fragments(message);
  if (parts.length === 0) return null;
  return mockups.find((mockup) => parts.every((part) => mockup.text.includes(part)));
}

function cell(text) {
  return text.replace(/\|/gu, "\\|").replace(/</gu, "&lt;").replace(/\n/gu, " ↵ ");
}

async function main() {
  const catalogs = new Map();
  for (const locale of locales) catalogs.set(locale, await catalog(locale));
  const ca = catalogs.get("ca");
  const namespaces = new Set([...ca.keys()].map((key) => key.split(":")[0]));

  // Where each key is used: static `ns:key` strings, `t("key")` of the default namespace, and the
  // template prefixes (`ns:prefix.${…}`) the dynamic keys start with.
  const usage = new Map();
  const prefixUsage = [];
  const use = (key, file) => {
    if (!usage.has(key)) usage.set(key, new Set());
    usage.get(key).add(file);
  };
  for (const directory of ["apps", "packages"]) {
    for (const file of await sourceFiles(path.join(root, directory))) {
      const relative = path.relative(root, file);
      const source = await readFile(file, "utf8");
      for (const match of source.matchAll(/["'`]([a-z][a-z0-9-]*):([A-Za-z0-9_.-]+)["'`]/gu)) {
        if (namespaces.has(match[1])) use(`${match[1]}:${match[2]}`, relative);
      }
      for (const match of source.matchAll(/\bt\(\s*["']([A-Za-z0-9_.-]+)["']/gu)) {
        use(`common:${match[1]}`, relative);
      }
      for (const match of source.matchAll(/`([a-z][a-z0-9-]*):([A-Za-z0-9_.-]*)\$\{/gu)) {
        if (namespaces.has(match[1])) prefixUsage.push([`${match[1]}:${match[2]}`, relative]);
      }
    }
  }

  function filesOf(key) {
    const files = new Set(usage.get(key) ?? []);
    if (files.size === 0) {
      for (const [prefix, file] of prefixUsage) if (key.startsWith(prefix)) files.add(file);
    }
    return [...files].sort();
  }

  function screensOf(files) {
    const found = new Map();
    for (const file of files) {
      const rule = SCREENS.find(([prefix]) => file.startsWith(prefix));
      if (rule !== undefined) found.set(rule[1], rule[2]);
    }
    return found;
  }

  const mockups = [];
  for (const directory of mockupRoots) {
    for (const file of (await readdir(directory)).filter((item) => item.endsWith(".html")).sort()) {
      const id = file.split("-")[0];
      mockups.push({ id, text: mockupText(await readFile(path.join(directory, file), "utf8")) });
    }
  }

  // The A39 register: the approved literals (Jordi, E153), by key.
  const register = new Map();
  for (const line of (await readFile(registerFile, "utf8")).split("\n")) {
    const id = /^\| (A39\.[0-9A-Z.]+) \|/u.exec(line)?.[1];
    if (id === undefined) continue;
    for (const match of line.matchAll(/`([a-z][a-z0-9-]*:[A-Za-z0-9_.*-]+)`/gu)) {
      if (!register.has(match[1])) register.set(match[1], id);
    }
  }
  function registerId(key) {
    if (register.has(key)) return register.get(key);
    for (const [pattern, id] of register) {
      if (pattern.endsWith("*") && key.startsWith(pattern.slice(0, -1))) return id;
    }
    return null;
  }

  const groups = new Map();
  const totals = { b24: 0, b25: 0, mockup: 0, variablesOnly: 0, unused: 0 };
  for (const [key, value] of [...ca.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const fromMockup = matchingMockup(value, mockups);
    if (fromMockup === null) {
      totals.variablesOnly += 1;
      continue;
    }
    if (fromMockup !== undefined) {
      totals.mockup += 1;
      continue;
    }
    const files = filesOf(key);
    const screens = screensOf(files);
    if (screens.size === 0) {
      totals.unused += 1;
      screens.set("Sense pantalla localitzada (clau calculada al codi)", ["*"]);
    }
    const withMockup = [...screens.values()].some((ids) => ids.length > 0);
    const source = withMockup ? "B25" : "B24";
    totals[source === "B24" ? "b24" : "b25"] += 1;
    const labels = [...screens.keys()].sort(
      (a, b) =>
        SCREENS.findIndex(([, label]) => label === a) -
        SCREENS.findIndex(([, label]) => label === b),
    );
    // An error message shows wherever the action that fails is; a key of more than three screens is
    // listed once, as transversal, with its screens.
    const group = key.startsWith("errors:")
      ? ERRORS_GROUP
      : labels.length > 3
        ? SHARED_GROUP
        : labels[0];
    const also = group === labels[0] ? labels.slice(1) : labels;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push({
      also: key.startsWith("errors:") ? [] : also,
      key,
      registerId: registerId(key),
      source,
      value,
    });
  }

  const order = [
    ...new Set([
      ...SCREENS.map(([, label]) => label),
      SHARED_GROUP,
      ERRORS_GROUP,
      "Sense pantalla localitzada (clau calculada al codi)",
    ]),
  ];
  const lines = [
    "# Literals per revisar a staging — B24 · B25 (E11-W03)",
    "",
    "> Fitxer generat per `node scripts/qa-literals.mjs` (no l'editis a mà; `--check` comprova que és al dia).",
    "> Font: els locals `packages/i18n/src/locales/{ca,es,en}`, els mockups `docs/pantalles/**/*.html` i el registre `docs/DECISIONS_COPY_A39-A41.md`.",
    "",
    "**Què hi ha**: cada text de la interfície (en català) que **no surt tal qual en cap mockup** aprovat, agrupat per la pantalla on el codi el mostra. Són els textos que DECISIONS_PENDENTS B24 (pantalles sense mockup) i B25 (literals proposats) diuen que es validen a staging. Els textos dels mockups no hi són: ja estan aprovats.",
    "",
    "**Com es llegeix**: «B24» = totes les pantalles on surt no tenen mockup; «B25» = literal proposat en una pantalla que sí que en té (o transversal: errors, components). «Aprovat» = el Jordi ja el va aprovar al registre A39 (només cal mirar que es vegi bé); «—» = no és al registre, cal llegir-lo. Les variables entre claus (`{name}`) les omple l'app. Els textos en castellà i anglès són a les mateixes claus dels fitxers `es` i `en`.",
    "",
    "**Com es fa la comparació**: un text compta com a «del mockup» quan tots els seus trossos fixos (fora de les variables) apareixen al text visible d'un mateix mockup, sense distingir majúscules. Un text que el mockup diu amb una paraula diferent surt aquí.",
    "",
    `**Recompte**: ${String(totals.b24 + totals.b25)} literals per revisar (${String(totals.b24)} B24 · ${String(totals.b25)} B25); ${String(totals.mockup)} textos surten d'un mockup; ${String(totals.variablesOnly)} són només variables o signes; ${String(totals.unused)} dels de la taula no tenen pantalla localitzada (claus que el codi calcula).`,
    "",
    "## Índex",
    "",
  ];
  for (const label of order) {
    if (groups.has(label)) lines.push(`- ${label} (${String(groups.get(label).length)})`);
  }
  for (const label of order) {
    const rows = groups.get(label);
    if (rows === undefined) continue;
    lines.push(
      "",
      `## ${label}`,
      "",
      "| Clau | Text (ca) | Font | Registre | També a |",
      "|---|---|---|---|---|",
    );
    for (const row of rows) {
      lines.push(
        `| \`${row.key}\` | ${cell(row.value)} | ${row.source} | ${row.registerId === null ? "—" : `aprovat (${row.registerId})`} | ${cell(row.also.join("; "))} |`,
      );
    }
  }
  const output = `${lines.join("\n")}\n`;

  if (process.argv.includes("--check")) {
    const current = await readFile(outputFile, "utf8").catch(() => "");
    if (current !== output) {
      console.error("docs/qa/LITERALS_QA.md is not up to date: run node scripts/qa-literals.mjs");
      process.exit(1);
    }
    console.log("docs/qa/LITERALS_QA.md is up to date");
  } else {
    await writeFile(outputFile, output);
    console.log(
      `docs/qa/LITERALS_QA.md: ${String(totals.b24 + totals.b25)} literals (B24 ${String(totals.b24)}, B25 ${String(totals.b25)}), ${String(totals.mockup)} from mockups, ${String(totals.variablesOnly)} variables only`,
    );
  }
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
