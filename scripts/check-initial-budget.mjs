// E11-W02 round 2 (review #8): the «<app> initial JavaScript» budget of `.size-limit.json` is what
// the app's first load fetches, so it must count every script `dist/index.html` loads: its module
// script and its modulepreloads. Vite splits chunks off the entry (`shared-*.js`,
// `jsx-runtime-*.js`); one the budget's globs miss would grow without a limit. Run after the
// build: a loaded script the budget does not count fails it.
//
// Usage: node scripts/check-initial-budget.mjs <app> (e.g. clubs).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The scripts an `index.html` loads (`assets/…js`): its module scripts and modulepreloads. */
export function initialScripts(html) {
  const scripts = [];
  for (const tag of html.match(/<(?:script|link)\b[^>]*>/giu) ?? []) {
    const isScript = /^<script\b/iu.test(tag) && /\btype="module"/iu.test(tag);
    const isPreload = /^<link\b/iu.test(tag) && /\brel="modulepreload"/iu.test(tag);
    if (!isScript && !isPreload) continue;
    const url = /\b(?:src|href)="\/?([^"]+\.js)"/iu.exec(tag)?.[1];
    if (url !== undefined) scripts.push(url);
  }
  return scripts;
}

/** size-limit's glob (`*` within one path segment) as a regular expression. */
function globPattern(glob) {
  const escaped = glob.replaceAll(/[.+?^${}()|[\]\\]/gu, "\\$&").replaceAll("*", "[^/]*");
  return new RegExp(`^${escaped}$`, "u");
}

/** Whether a budget's `path` (one glob or a list, `!` excluding) counts `file`. */
function counts(budget, file) {
  const globs = Array.isArray(budget.path) ? budget.path : [budget.path];
  const included = globs.some((glob) => !glob.startsWith("!") && globPattern(glob).test(file));
  const excluded = globs.some(
    (glob) => glob.startsWith("!") && globPattern(glob.slice(1)).test(file),
  );
  return included && !excluded;
}

/** What the app's «initial JavaScript» budget misses of what `html` loads (none: it is right). */
export function initialBudgetProblems(html, app, budgets) {
  const name = `${app} initial JavaScript`;
  const budget = budgets.find((item) => item.name === name);
  if (budget === undefined) return [`no «${name}» budget in .size-limit.json`];
  return initialScripts(html)
    .filter((script) => !counts(budget, `apps/${app}/dist/${script}`))
    .map(
      (script) => `${script} is loaded by apps/${app}/dist/index.html but not counted by «${name}»`,
    );
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const app = process.argv[2] ?? "clubs";
  const html = await readFile(path.join(root, "apps", app, "dist/index.html"), "utf8");
  const budgets = JSON.parse(await readFile(path.join(root, ".size-limit.json"), "utf8"));
  const problems = initialBudgetProblems(html, app, budgets);
  if (problems.length > 0) {
    console.error(`check-initial-budget: ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log(
    `check-initial-budget: «${app} initial JavaScript» counts the ${initialScripts(html).length} scripts apps/${app}/dist/index.html loads`,
  );
}
