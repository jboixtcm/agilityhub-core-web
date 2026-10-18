// E11-W02 round 2 (review #8): an app's «initial JavaScript» budget counts every script its
// `index.html` loads. Run by `apps/clubs`'s `test`: node --test.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { initialBudgetProblems, initialScripts } from "./check-initial-budget.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The members' app's `index.html` as Vite writes it: the entry, then its modulepreloads. */
const CLUBS_HTML = `<!doctype html><html><head>
<script type="module" crossorigin src="/assets/index-l4o8xrna.js"></script>
<link rel="modulepreload" crossorigin href="/assets/jsx-runtime-B-hcVAMW.js">
<link rel="modulepreload" crossorigin href="/assets/shared-DEazxljT.js">
<link rel="stylesheet" crossorigin href="/assets/index-Bq1x.css">
<link rel="manifest" href="/manifest.webmanifest">
</head><body><div id="root"></div></body></html>`;

test("the scripts index.html loads: its module script and its modulepreloads, no stylesheet", () => {
  assert.deepEqual(initialScripts(CLUBS_HTML), [
    "assets/index-l4o8xrna.js",
    "assets/jsx-runtime-B-hcVAMW.js",
    "assets/shared-DEazxljT.js",
  ]);
});

test("a budget that counts only the entry misses the chunks split off it", () => {
  const budgets = [{ name: "clubs initial JavaScript", path: "apps/clubs/dist/assets/index-*.js" }];
  assert.deepEqual(initialBudgetProblems(CLUBS_HTML, "clubs", budgets), [
    "assets/jsx-runtime-B-hcVAMW.js is loaded by apps/clubs/dist/index.html but not counted by «clubs initial JavaScript»",
    "assets/shared-DEazxljT.js is loaded by apps/clubs/dist/index.html but not counted by «clubs initial JavaScript»",
  ]);
});

test("the repository's clubs budget counts every script index.html loads", async () => {
  const budgets = JSON.parse(await readFile(path.join(root, ".size-limit.json"), "utf8"));
  assert.deepEqual(initialBudgetProblems(CLUBS_HTML, "clubs", budgets), []);
});

test("an app without an «initial JavaScript» budget is a problem, not a pass", () => {
  assert.deepEqual(initialBudgetProblems(CLUBS_HTML, "clubs", []), [
    "no «clubs initial JavaScript» budget in .size-limit.json",
  ]);
});
