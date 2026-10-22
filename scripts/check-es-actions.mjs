// E11-W04 (ruling E137, Jordi 21-10-2026): in Spanish, a label that names an action the reader
// triggers (a button, a menu action, a link that acts, a dialog's confirmation, a form's submit,
// the title of a dialog that names its action, the accessible name of such a control) is written
// in the infinitive, as es-ES software does: «Guardar», «Cancelar», «Volver a intentarlo». `ca`
// keeps the mockups' imperative and `en` is unchanged, so only `es` is read. Key names are too
// diverse to pick the action keys by name, so every es string is read and decided by its text,
// conservatively: an imperative first word, capitalised, not a sentence, not an explanation key,
// not a noun phrase, not in KEEP. Chained in `pnpm i18n:check` after check-parameter-keys.mjs.
//
// Usage: node scripts/check-es-actions.mjs [--locales <dir>] (default packages/i18n/src/locales).
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Second-person-singular imperatives, with their accents. The first words of the 219 labels
 * E11-W02 round 1 converted, the ones the catalog shows since (enclitic forms included), and the
 * imperative of every infinitive the catalog's actions start with, so an action that slips back
 * into the imperative is caught. Not listed: «Apúntame», «Inscríbeme», «Envíame» and «Apúntate»
 * (calls in the reader's own voice), «Da» and «Autoriza» (third person in the catalog), and
 * «Completa», which the catalog uses only as the adjective («Completa», a full class).
 */
export const IMPERATIVES = new Set([
  // E11-W02 round 1 (roadmap/evidence/E11-W02/20-es-en-review.md).
  "vuelve",
  "cierra",
  "busca",
  "guarda",
  "anula",
  "abre",
  "elimina",
  "quita",
  "cancela",
  "crea",
  "retira",
  "envía",
  "añade",
  "cambia",
  "publica",
  "edita",
  "muestra",
  "activa",
  "reserva",
  "elige",
  "aprueba",
  "reactiva",
  "selecciona",
  "valida",
  "desactiva",
  "deniega",
  "ordena",
  "rechaza",
  "restaura",
  "duplica",
  "simula",
  "ejecuta",
  "descarta",
  "bloquea",
  "confirma",
  "coge",
  "descarga",
  "copia",
  "limpia",
  "exporta",
  "borra",
  "acepta",
  "entra",
  "recuerda",
  "actualiza",
  "sal",
  "prueba",
  "continúa",
  "paga",
  "invita",
  "modifica",
  // The catalog since round 1 (E9-W04's `courses`, E10-W03, E11-W01) and what round 1 kept.
  "adjunta",
  "amplía",
  "aprende",
  "clona",
  "consulta",
  "escribe",
  "filtra",
  "finaliza",
  "gira",
  "haz",
  "inserta",
  "marca",
  "márcala",
  "omite",
  "programa",
  "recarga",
  "recupera",
  "recupérala",
  "reduce",
  "registra",
  "repite",
  "revisa",
  "revísala",
  "suspende",
  "únete",
  // The imperative of the catalog's other action infinitives («Generar», «Subir», «Mover»…).
  "cobra",
  "coloca",
  "deja",
  "desbloquea",
  "deshaz",
  "despublica",
  "genera",
  "gestiona",
  "importa",
  "mueve",
  "pide",
  "reembolsa",
  "reenvía",
  "reintenta",
  "restablece",
  "retrocede",
  "solicita",
  "sube",
  "suprime",
  "termina",
  "transfiere",
  "verifica",
]);

/**
 * Imperatives that are also nouns. Followed by «de», a colon or a participle they are the noun:
 * «Reserva de pista», «Copia de AgilityHub», «Marca: logo…», «Reserva confirmada».
 */
const NOUN_HOMOGRAPHS = new Set([
  "busca",
  "consulta",
  "copia",
  "descarga",
  "marca",
  "muestra",
  "paga",
  "programa",
  "prueba",
  "recarga",
  "reserva",
]);
/** The homographs whose noun is masculine («el programa»); the others are feminine. */
const MASCULINE_HOMOGRAPHS = new Set(["programa"]);
const PARTICIPLE =
  /^(?:\p{L}+(?:ad|id)[oa]s?|(?:abiert|cubiert|devuelt|dich|escrit|hech|puest|resuelt|rot|vist|vuelt)[oa]s?)$/u;

/** Keys whose last segment ends like this hold instructions and explanations, not labels. */
const EXPLANATION_SUFFIXES = [
  "help",
  "description",
  "hint",
  "required",
  "placeholder",
  "intro",
  "emptyDescription",
  "loadError",
].map((suffix) => suffix.toLowerCase());

/** A sentence or an instruction to the reader, not a label. */
const SENTENCE_END = /[.…:?!]$/u;

/**
 * The es strings the heuristic catches that are not actions, each with its reason (E11-W04
 * step 2: the component was opened for every one). A label whose action changes leaves this list.
 */
export const KEEP = new Map([
  ["admin-billing:confirm.rollbackKeywordLabel", "D6's rollback field label: an instruction"],
  ["admin-catalogs:common.active", "the adjective: a catalog switch's state («Active»)"],
  ["admin-catalogs:plans.columns.active", "the adjective: D8's column header («Active»)"],
  ["admin-census:common.choose", "a select's empty option: an instruction"],
  ["admin-census:signupReview.confirmNothingPaid", "D2's checkbox statement, not an action"],
  ["admin-courses:doors.active", "the adjective: the door in use"],
  ["admin-courses:import.file", "a file input's label: an instruction"],
  ["admin-messaging:templates.choose", "D9's empty-state title: an instruction"],
  ["admin-scheduling:templates.gridFooter", "D3's grid legend: an instruction"],
  ["auth:profile.iosInstall", "12's hint to add the app to the home screen: an instruction"],
  ["auth:profile.learnLink", "12's row to the AgilityHub learning site: a call to another product"],
  ["auth:profile.pushDenied", "12's hint to allow notifications: an instruction"],
  ["booking:confirm.swapTitle", "06's swap title: an instruction"],
  ["common:gallery.active", "the adjective: the dev gallery's state chip"],
  ["console:theme.logoAlt.mark", "the noun: the alt text of the club's mark"],
  ["console:theme.logos.mark", "the noun: a logo slot's name"],
  ["id:login.title", "the login page's title"],
  ["id:password.repeat", "the second password field's label: an instruction"],
  ["notifications:unsubscribe.toPreferences", "a navigation link written as a sentence"],
  [
    "signup:person.reviewEmailTitle",
    "the signup's heading after the verification mail: an instruction",
  ],
  ["signup:success.addDogTitle", "the add-dog flow's title on its success screen"],
]);

/** `{ namespace: nested object }` → `[["namespace:a.b", value], …]`, the order of the catalog. */
function flatten(catalog) {
  const entries = [];
  const walk = (namespace, value, prefix) => {
    if (typeof value === "string") {
      entries.push([`${namespace}:${prefix}`, value]);
      return;
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) return;
    for (const [key, child] of Object.entries(value)) {
      walk(namespace, child, prefix === "" ? key : `${prefix}.${key}`);
    }
  };
  for (const [namespace, value] of Object.entries(catalog)) walk(namespace, value, "");
  return entries;
}

/** Whether the heuristic reads `value` (at `key`) as an action label in the imperative. */
function looksImperative(key, value) {
  const text = value.trim().replace(/^(?:[＋+·]\s*)+/u, "");
  const word = /^\p{L}+/u.exec(text)?.[0];
  if (word === undefined) return false;
  const lower = word.toLocaleLowerCase("es");
  if (!IMPERATIVES.has(lower)) return false;
  if (word[0] === lower[0]) return false;
  if (SENTENCE_END.test(text)) return false;
  const segment = key.slice(key.lastIndexOf(".") + 1).toLowerCase();
  if (EXPLANATION_SUFFIXES.some((suffix) => segment.endsWith(suffix))) return false;
  if (NOUN_HOMOGRAPHS.has(lower)) {
    const rest = text.slice(word.length);
    const words = /^\s+(\p{L}+)(?:\s+(\p{L}+))?/u.exec(rest);
    const next = words?.[1]?.toLocaleLowerCase("es");
    const after = words?.[2]?.toLocaleLowerCase("es");
    if (rest.startsWith(":")) return false;
    // A noun complement («Reserva de pista»), never the adverb «de nuevo» (E11-W05, E155 #1).
    if ((next === "de" || next === "del") && after !== "nuevo") return false;
    if (next !== undefined && agreesWithHomograph(lower, next)) return false;
  }
  return true;
}

/**
 * A participle that agrees with the noun reading of `homograph` («Descarga completada», «Programa
 * cancelado»): singular, feminine except «programa». A plural or another gender is the action's
 * object («Descarga resultados», «Muestra salidas»).
 */
function agreesWithHomograph(homograph, next) {
  return PARTICIPLE.test(next) && next.endsWith(MASCULINE_HOMOGRAPHS.has(homograph) ? "o" : "a");
}

/** The es action labels still in the imperative: `[{key, value}]`, `[]` when the catalog is clean. */
export function flaggedActions(catalog, keep = KEEP) {
  return flatten(catalog)
    .filter(([key, value]) => !keep.has(key) && looksImperative(key, value))
    .map(([key, value]) => ({ key, value }));
}

/** The strings the heuristic catches that `keep` lets through: `[{key, reason, value}]`. */
export function keptActions(catalog, keep = KEEP) {
  return flatten(catalog)
    .filter(([key, value]) => keep.has(key) && looksImperative(key, value))
    .map(([key, value]) => ({ key, reason: keep.get(key), value }));
}

/** A locale's catalog from `<localesDir>/<locale>/*.json`, by namespace. */
export async function readCatalog(localesDir, locale = "es") {
  const directory = path.join(localesDir, locale);
  const files = (await readdir(directory)).filter((file) => file.endsWith(".json")).sort();
  const catalog = {};
  for (const file of files) {
    catalog[path.basename(file, ".json")] = JSON.parse(
      await readFile(path.join(directory, file), "utf8"),
    );
  }
  return catalog;
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  const option = args.indexOf("--locales");
  const localesDir =
    option === -1
      ? path.join(root, "packages/i18n/src/locales")
      : path.resolve(args[option + 1] ?? "");
  const catalog = await readCatalog(localesDir);
  const flagged = flaggedActions(catalog);
  const kept = keptActions(catalog);
  const keptKeys = new Set(kept.map((entry) => entry.key));
  const unused = [...KEEP.keys()].filter((key) => !keptKeys.has(key));

  console.log(`check-es-actions: ${path.relative(root, localesDir) || "."}/es`);
  for (const { key, reason, value } of kept) console.log(`  kept ${key} · «${value}» — ${reason}`);
  if (unused.length > 0) {
    console.log(`  KEEP entries this catalog does not need: ${unused.join(", ")}`);
  }
  for (const { key, value } of flagged) console.error(`${key} · «${value}»`);
  console.log(`check-es-actions: ${flagged.length} flagged, ${kept.length} kept`);
  if (flagged.length > 0) {
    console.error(
      "check-es-actions: an es action label is written in the infinitive (ruling E137): «Guardar», «Volver a intentarlo»; add a key to KEEP only with its reason",
    );
    process.exit(1);
  }
}
