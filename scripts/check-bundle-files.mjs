// The files every production bundle carries (`scripts/bundle-files.mjs`), checked on each built
// `dist` folder: CFG-04 `content-security-policy.txt`, one line that allows every inline script
// of the folder's `index.html` (its hash recomputed here) and is no other policy than the build's;
// CFG-05 `robots.txt`, `Disallow: /` for every robot; REL-02 `version.json`, the bundle's version
// and commit.
//
// Usage: node scripts/check-bundle-files.mjs [dist directory …]
// (default: the dist folders of apps/clubs, apps/clubs-admin and apps/id).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CONTENT_SECURITY_POLICY_FILE,
  contentSecurityPolicyFor,
  contentSecurityPolicyProblems,
  ROBOTS_FILE,
  ROBOTS_TXT,
  VERSION_FILE,
  versionFileProblem,
} from "./bundle-files.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_DIRECTORIES = ["apps/clubs/dist", "apps/clubs-admin/dist", "apps/id/dist"];

async function text(directory, file) {
  try {
    return await readFile(path.join(directory, file), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

/** The problems of one built `dist` directory's bundle files; empty when they are all right. */
export async function checkBundleFiles(directory) {
  const html = await text(directory, "index.html");
  if (html === null) return [`${directory}: no index.html`];
  const problems = [];
  const policy = await text(directory, CONTENT_SECURITY_POLICY_FILE);
  if (policy === null) {
    problems.push(`${CONTENT_SECURITY_POLICY_FILE}: missing`);
  } else if (/[\r\n]/u.test(policy)) {
    problems.push(`${CONTENT_SECURITY_POLICY_FILE}: not a single line (a header value)`);
  } else {
    problems.push(
      ...contentSecurityPolicyProblems(policy, html).map(
        (problem) => `${CONTENT_SECURITY_POLICY_FILE}: ${problem}`,
      ),
    );
    if (policy !== contentSecurityPolicyFor(html)) {
      problems.push(
        `${CONTENT_SECURITY_POLICY_FILE}: not the policy the build computes for index.html`,
      );
    }
  }
  const robots = await text(directory, ROBOTS_FILE);
  if (robots === null) problems.push(`${ROBOTS_FILE}: missing`);
  else if (robots !== ROBOTS_TXT)
    problems.push(`${ROBOTS_FILE}: not «Disallow: /» for every robot`);
  const version = await text(directory, VERSION_FILE);
  const versionProblem = version === null ? "missing" : versionFileProblem(version);
  if (versionProblem !== null) problems.push(`${VERSION_FILE}: ${versionProblem}`);
  return problems;
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
    const problems = await checkBundleFiles(directory);
    if (problems.length > 0) {
      failed = true;
      console.error(`check-bundle-files: ${problems.length} problem(s) in ${name}:`);
      for (const problem of problems) console.error(`  ${problem}`);
    } else {
      console.log(`check-bundle-files: ${name} carries its bundle files`);
    }
  }
  if (failed) process.exit(1);
}
