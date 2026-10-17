// The students' app ships no backoffice or ID text (review E9-W03 #5). `apps/clubs` imports the
// root of `@agilityhub/i18n`, which re-exports the full loader table (`resources.ts`): keeping the
// admin namespaces out depends on tree-shaking. Each locale JSON a build keeps is its own lazy
// chunk named after the namespace (`admin-billing-<hash>.js`, `console-<hash>.js`,
// `id-<hash>.js`), so this check fails the build when one of them reaches `dist/assets`.
//
// Usage: node scripts/check-clubs-bundle.mjs [assets directory] (default: apps/clubs/dist/assets).
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.resolve(process.argv[2] ?? path.join(root, "apps/clubs/dist/assets"));

// Rollup's chunk names: `[name]-[hash].js`, the hash being 8 base64url characters.
const FORBIDDEN = /^(?<namespace>admin-[a-z-]+|console|id)-[\w-]{8}\.js$/u;

let files;
try {
  files = await readdir(assets);
} catch (error) {
  console.error(`check-clubs-bundle: cannot read ${assets} (${error.code ?? error.message})`);
  process.exit(1);
}

const chunks = files.filter((file) => file.endsWith(".js"));
if (chunks.length === 0) {
  console.error(`check-clubs-bundle: no JavaScript chunk in ${assets}`);
  process.exit(1);
}

const leaked = chunks.filter((file) => FORBIDDEN.test(file));
if (leaked.length > 0) {
  console.error(
    `check-clubs-bundle: ${leaked.length} backoffice/ID namespace chunk(s) in the students' app:`,
  );
  for (const file of leaked) console.error(`  ${file}`);
  process.exit(1);
}

console.log(
  `check-clubs-bundle: ${chunks.length} chunks in ${path.relative(root, assets) || "."}, no admin-*, console or id namespace`,
);
