// The students' app ships no backoffice or ID text (review E9-W03 #5). `apps/clubs` imports the
// root of `@agilityhub/i18n`, which re-exports the full loader table (`resources.ts`): keeping the
// admin namespaces out depends on tree-shaking. Each locale JSON a build keeps is its own lazy
// chunk named after the namespace (`admin-billing-<hash>.js`, `console-<hash>.js`,
// `id-<hash>.js`), so this check fails the build when one of them reaches `dist/assets`.
//
// A file name is not enough (E9-W05 round 2, review #4): Rollup can merge a namespace's JSON into
// another chunk (`manualChunks`, `experimentalMinChunkSize`, an eager import). So the contents of
// every chunk are searched too, for sentinel strings of each forbidden namespace in each locale:
// values of that namespace's JSON that no other locale file contains (so none the app may ship),
// made of letters, spaces, commas and full stops only (no character a bundler would escape).
//
// Usage: node scripts/check-clubs-bundle.mjs [assets directory] (default: apps/clubs/dist/assets).
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const LOCALES_DIRECTORY = path.join(root, "packages/i18n/src/locales");

// Rollup's chunk names: `[name]-[hash].js`, the hash being 8 base64url characters.
const FORBIDDEN_FILE = /^(?<namespace>admin-[a-z-]+|console|id)-[\w-]{8}\.js$/u;
const SENTINEL = /^[A-Za-z][A-Za-z ,.]{15,}$/u;
const SENTINELS_PER_NAMESPACE = 3;

export function isForbiddenNamespace(namespace) {
  return namespace.startsWith("admin-") || namespace === "console" || namespace === "id";
}

function strings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value).sort()) strings(value[key], out);
  }
  return out;
}

/**
 * `{locale, namespace, sentinels}` for every forbidden namespace of every locale. A forbidden
 * namespace with no usable sentinel is an error: the check must never weaken in silence.
 */
export async function sentinelsOf(localesDirectory = LOCALES_DIRECTORY) {
  const locales = (await readdir(localesDirectory)).sort();
  const files = [];
  for (const locale of locales) {
    for (const file of (await readdir(path.join(localesDirectory, locale))).sort()) {
      if (!file.endsWith(".json")) continue;
      const json = JSON.parse(await readFile(path.join(localesDirectory, locale, file), "utf8"));
      files.push({ locale, namespace: file.slice(0, -".json".length), values: strings(json) });
    }
  }
  return files
    .filter((file) => isForbiddenNamespace(file.namespace))
    .map((own) => {
      const { locale, namespace, values } = own;
      // Text of no other file: never shipped by an allowed namespace, and naming its own file.
      const others = files
        .filter((file) => file !== own)
        .flatMap((file) => file.values)
        .join("\n");
      const sentinels = [...new Set(values)]
        .filter((value) => SENTINEL.test(value) && !others.includes(value))
        .slice(0, SENTINELS_PER_NAMESPACE);
      if (sentinels.length === 0) {
        throw new Error(`no sentinel string for ${locale}/${namespace}.json`);
      }
      return { locale, namespace, sentinels };
    });
}

/** The problems of a built `assets` directory: forbidden chunk names, then forbidden contents. */
export async function checkClubsBundle(assets, localesDirectory = LOCALES_DIRECTORY) {
  let files;
  try {
    files = await readdir(assets);
  } catch (error) {
    return { chunks: 0, problems: [`cannot read ${assets} (${error.code ?? error.message})`] };
  }
  const chunks = files.filter((file) => file.endsWith(".js")).sort();
  if (chunks.length === 0) return { chunks: 0, problems: [`no JavaScript chunk in ${assets}`] };

  const problems = chunks
    .filter((file) => FORBIDDEN_FILE.test(file))
    .map((file) => `${file}: a backoffice/ID namespace chunk`);
  const namespaces = await sentinelsOf(localesDirectory);
  for (const file of chunks) {
    const contents = await readFile(path.join(assets, file), "utf8");
    for (const { locale, namespace, sentinels } of namespaces) {
      const found = sentinels.find((sentinel) => contents.includes(sentinel));
      if (found !== undefined) {
        problems.push(`${file}: contains ${locale}/${namespace}.json («${found}»)`);
      }
    }
  }
  return { chunks: chunks.length, problems };
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const assets = path.resolve(process.argv[2] ?? path.join(root, "apps/clubs/dist/assets"));
  const { chunks, problems } = await checkClubsBundle(assets);
  if (problems.length > 0) {
    console.error(`check-clubs-bundle: ${problems.length} problem(s) in the students' app:`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log(
    `check-clubs-bundle: ${chunks} chunks in ${path.relative(root, assets) || "."}, no admin-*, console or id namespace (by name or contents)`,
  );
}
