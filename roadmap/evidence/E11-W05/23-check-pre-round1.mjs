// E11-W05 step 5 (E155 #1): the narrowed noun rule still flags all 219 es labels of E11-W02
// round 1 on the pre-round-1 catalog (`85c4b469~1`). Reads the old catalog with `git show` (read
// only) and the 219 keys from E11-W04's table. Run from the repo root:
//   node roadmap/evidence/E11-W05/23-check-pre-round1.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { flaggedActions } from "../../../scripts/check-es-actions.mjs";

const REV = "85c4b469~1";
const DIR = "packages/i18n/src/locales/es";
const files = execFileSync("git", ["ls-tree", "--name-only", `${REV}:${DIR}`], { encoding: "utf8" })
  .split("\n")
  .filter((file) => file.endsWith(".json"))
  .sort();
const catalog = {};
for (const file of files) {
  catalog[file.slice(0, -".json".length)] = JSON.parse(
    execFileSync("git", ["show", `${REV}:${DIR}/${file}`], { encoding: "utf8" }),
  );
}
const flagged = new Set(flaggedActions(catalog).map((entry) => entry.key));
const expected = [
  ...readFileSync("roadmap/evidence/E11-W04/02-es-actions-219.md", "utf8").matchAll(
    /^\| `([^`]+)` \|/gmu,
  ),
].map((match) => match[1]);
const missing = expected.filter((key) => !flagged.has(key));
console.log(`catalog ${REV}: ${files.length} namespaces, ${flagged.size} flagged`);
console.log(`E11-W04's 219 list: ${expected.length} keys, ${expected.length - missing.length} flagged, ${missing.length} missing`);
for (const key of missing) console.log(`  missing ${key}`);
process.exitCode = missing.length === 0 && expected.length === 219 ? 0 : 1;
