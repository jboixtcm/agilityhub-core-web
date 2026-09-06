import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(root, "docs/specs/00-transversal/CATALEG_ERRORS.md");
const locales = ["ca", "es", "en"];

const catalog = await readFile(catalogPath, "utf8");
const codes = [
  ...new Set(
    [...catalog.matchAll(/`([A-Z][A-Z\d_]+)`/g)]
      .map((match) => match[1])
      .filter((code) => code !== undefined && !code.endsWith("_")),
  ),
].sort();
const missing = [];

for (const locale of locales) {
  const file = path.join(root, "packages/i18n/src/locales", locale, "errors.json");
  const messages = JSON.parse(await readFile(file, "utf8"));
  for (const code of codes) {
    if (typeof messages[code] !== "string" || messages[code].trim() === "") {
      missing.push(`${locale}: errors:${code}`);
    }
  }
}

console.log(`${codes.length} codes, ${missing.length} missing`);
if (missing.length > 0) {
  for (const item of missing) {
    console.error(`- ${item}`);
  }
  process.exitCode = 1;
}
