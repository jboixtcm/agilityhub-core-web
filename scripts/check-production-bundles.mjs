// FE-05: a production build carries nothing of the mock world. MSW's worker, its scenario switch
// and the fixtures (whose people, hosts and URLs use the reserved `.test` domain) are dev and test
// material; one static import of a dev-only module is enough to pull them into a bundle (the back
// office's UI gallery took the MSW branding fixture into its entry chunk). Searches every text file
// of each built `dist` folder, at any depth, for those sentinels, and refuses MSW's worker file.
//
// Usage: node scripts/check-production-bundles.mjs [dist directory …]
// (default: the dist folders of apps/clubs, apps/clubs-admin and apps/id). Run it after a build
// without VITE_MOCK: a mock build ships MSW on purpose (`copyPublicDir` follows the flag).
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_DIRECTORIES = ["apps/clubs/dist", "apps/clubs-admin/dist", "apps/id/dist"];

/**
 * MSW's worker file (`public/mockServiceWorker.js`, also its registration URL), the mock
 * scenario's storage key (`MOCK_SCENARIO_STORAGE_KEY`), and the fixtures' reserved domain.
 */
export const SENTINELS = ["mockServiceWorker", "agilityhub.mockScenario", "example.test"];
const TEXT_FILE = /\.(?:css|html|js|json|map|mjs|svg|txt|webmanifest)$/iu;

async function filesOf(directory) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)))
    .sort();
}

/** The problems of one built `dist` directory: MSW's worker file, then any sentinel in a text file. */
export async function checkProductionBundle(directory) {
  let files;
  try {
    files = await filesOf(directory);
  } catch (error) {
    return { files: 0, problems: [`cannot read ${directory} (${error.code ?? error.message})`] };
  }
  if (files.length === 0) return { files: 0, problems: [`no file in ${directory}`] };
  const problems = files
    .filter((file) => path.basename(file).startsWith("mockServiceWorker"))
    .map((file) => `${file}: MSW's worker file`);
  for (const file of files.filter((name) => TEXT_FILE.test(name))) {
    const contents = await readFile(path.join(directory, file), "utf8");
    for (const sentinel of SENTINELS) {
      if (contents.includes(sentinel)) problems.push(`${file}: contains «${sentinel}»`);
    }
  }
  return { files: files.length, problems };
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const arguments_ = process.argv.slice(2);
  const directories = (arguments_.length > 0 ? arguments_ : DEFAULT_DIRECTORIES).map((directory) =>
    path.resolve(root, directory),
  );
  let failed = false;
  for (const directory of directories) {
    const name = path.relative(root, directory) || ".";
    const { files, problems } = await checkProductionBundle(directory);
    if (problems.length > 0) {
      failed = true;
      console.error(`check-production-bundles: ${problems.length} problem(s) in ${name}:`);
      for (const problem of problems) console.error(`  ${problem}`);
    } else {
      console.log(`check-production-bundles: ${files} files in ${name}, no mock data`);
    }
  }
  if (failed) process.exit(1);
}
