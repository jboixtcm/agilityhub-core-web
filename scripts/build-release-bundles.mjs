// REL-03: builds the production bundles that are deployed, as CI's «Production bundles» job does
// once every check has passed on a push to main (.github/workflows/ci.yml), which then publishes
// the three `dist` folders as the run's artifact. Each app is built with the release configuration
// committed in `release/`:
//   release/clubs.env, release/clubs-admin.env, release/id.env: that bundle's `VITE_*` values
//     (public build configuration, docs/DEPLOYMENT.md), one `KEY=value` per line, `#` comments;
//   release/member-pwa/: the member app's reviewed install files, required exactly when clubs.env
//     sets VITE_MEMBER_PWA_NAME (apps/clubs/vite.config.ts emits them from apps/clubs/public/pwa).
// Nothing else reaches the build: `VITE_*` variables in the environment and the apps' own `.env`
// files are refused, `VITE_MOCK` is never allowed, and the build needs CI's commit (`GITHUB_SHA`,
// REL-02). The FE-05 mock-data check and the bundle-files check then run on the three dists.
//
// Usage: node scripts/build-release-bundles.mjs
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildCommit, VERSION_FILE } from "./bundle-files.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const RELEASE_APPS = ["clubs", "clubs-admin", "id"];
/** The files apps/clubs/vite.config.ts emits under `pwa/` when VITE_MEMBER_PWA_NAME is set. */
export const MEMBER_PWA_FILES = [
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
  "maskable-512.png",
  "apple-touch-icon.png",
];

const LINE = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u;
const RELEASE_KEY = /^VITE_[A-Z0-9_]+$/u;

/** The values of a release `.env` file, or the problems that keep it from being used. */
export function parseReleaseEnv(text, file) {
  const values = {};
  const problems = [];
  text.split(/\r?\n/u).forEach((raw, index) => {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) return;
    const where = `${file}:${String(index + 1)}`;
    const match = LINE.exec(line);
    if (match === null) {
      problems.push(`${where}: not KEY=value`);
      return;
    }
    const [, key, rawValue] = match;
    if (!RELEASE_KEY.test(key)) {
      problems.push(`${where}: ${key} is not a VITE_* build value`);
    } else if (key === "VITE_MOCK") {
      problems.push(`${where}: VITE_MOCK is never part of a production bundle`);
    } else if (Object.hasOwn(values, key)) {
      problems.push(`${where}: ${key} is set twice`);
    } else {
      const quoted = /^(["'])(.*)\1$/u.exec(rawValue.trim());
      values[key] = quoted === null ? rawValue.trim() : quoted[2];
    }
  });
  return { problems, values };
}

/** The `.env` files of an app folder that Vite would read besides the release values. */
function appEnvFiles(appDirectory) {
  if (!existsSync(appDirectory)) return [];
  return readdirSync(appDirectory).filter(
    (name) => name.startsWith(".env") && name !== ".env.example",
  );
}

/**
 * The release plan (each app's values, whether the member PWA files go in, the commit) or the
 * problems that stop the release before anything is built.
 */
export function releasePlan({ environment = process.env, root = repositoryRoot } = {}) {
  const problems = [];
  const values = {};
  for (const app of RELEASE_APPS) {
    const file = path.join("release", `${app}.env`);
    if (!existsSync(path.join(root, file))) {
      problems.push(`${file}: missing (the VITE_* values of the ${app} bundle; may be empty)`);
      continue;
    }
    const parsed = parseReleaseEnv(readFileSync(path.join(root, file), "utf8"), file);
    problems.push(...parsed.problems);
    values[app] = parsed.values;
    for (const name of appEnvFiles(path.join(root, "apps", app))) {
      problems.push(`apps/${app}/${name}: Vite would read it too; the release takes release/ only`);
    }
  }
  const inherited = Object.keys(environment).filter((key) => key.startsWith("VITE_"));
  if (inherited.length > 0) {
    problems.push(`the environment sets ${inherited.join(", ")}; the release takes release/ only`);
  }
  const commit = buildCommit(environment);
  if (commit === null) {
    problems.push("GITHUB_SHA is not a full commit id: the production bundles are CI's builds");
  }
  const pwaName = (values.clubs?.VITE_MEMBER_PWA_NAME ?? "") !== "";
  const pwaFolder = path.join(root, "release", "member-pwa");
  if (pwaName) {
    for (const file of MEMBER_PWA_FILES) {
      if (!existsSync(path.join(pwaFolder, file))) {
        problems.push(`release/member-pwa/${file}: missing (clubs.env sets VITE_MEMBER_PWA_NAME)`);
      }
    }
    if (existsSync(path.join(root, "apps", "clubs", "public", "pwa"))) {
      problems.push("apps/clubs/public/pwa: exists; the release copies release/member-pwa there");
    }
  } else if (existsSync(pwaFolder)) {
    problems.push("release/member-pwa: present, but clubs.env does not set VITE_MEMBER_PWA_NAME");
  }
  return { commit, memberPwa: pwaName, problems, values };
}

function run(command, args, environment) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: environment,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${String(result.status ?? result.signal)})`,
    );
  }
}

/** Builds the three bundles of a plan and checks them; throws on the first failure. */
function buildRelease(plan) {
  const pwaTarget = path.join(repositoryRoot, "apps", "clubs", "public", "pwa");
  try {
    if (plan.memberPwa) {
      mkdirSync(pwaTarget, { recursive: true });
      for (const file of MEMBER_PWA_FILES) {
        cpSync(
          path.join(repositoryRoot, "release", "member-pwa", file),
          path.join(pwaTarget, file),
        );
      }
    }
    for (const app of RELEASE_APPS) {
      console.log(
        `build-release-bundles: ${app} with ${Object.keys(plan.values[app]).join(", ") || "no VITE_* value"}`,
      );
      run("pnpm", ["--filter", app, "build"], { ...process.env, ...plan.values[app] });
    }
  } finally {
    if (plan.memberPwa) rmSync(pwaTarget, { force: true, recursive: true });
  }
  run("node", ["scripts/check-production-bundles.mjs"], process.env);
  run("node", ["scripts/check-bundle-files.mjs"], process.env);
  for (const app of RELEASE_APPS) {
    const file = path.join(repositoryRoot, "apps", app, "dist", VERSION_FILE);
    const { commit } = JSON.parse(readFileSync(file, "utf8"));
    if (commit !== plan.commit) {
      throw new Error(
        `apps/${app}/dist/${VERSION_FILE}: commit ${String(commit)}, not ${plan.commit}`,
      );
    }
  }
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const plan = releasePlan();
  if (plan.problems.length > 0) {
    console.error(`build-release-bundles: ${String(plan.problems.length)} problem(s):`);
    for (const problem of plan.problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  try {
    buildRelease(plan);
  } catch (error) {
    console.error(`build-release-bundles: ${error.message}`);
    process.exit(1);
  }
  console.log(`build-release-bundles: apps/{clubs,clubs-admin,id}/dist built from ${plan.commit}`);
}
