// E11-W05 step 5 (g): the test titles this task renamed, old → new, from the session commit's diff
// (`0692582a..246d4fc2`, read-only `git diff`): in each hunk, a removed `describe`/`it`/`test` title
// paired with the added one at the same position. Run from the repo root:
//   node roadmap/evidence/E11-W05/61-test-renames.mjs > roadmap/evidence/E11-W05/61-test-renames.md
import { execFileSync } from "node:child_process";

const diff = execFileSync(
  "git",
  ["diff", "-U0", "0692582a", "246d4fc2", "--", "apps", "packages"],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);
const TITLE = /^[-+]\s*(?:describe|it|test)(?:\.each\(.*?\))?\(\s*["`](.+?)["`],/u;
const rows = [];
let file = "";
let removed = [];
let added = [];
const flush = () => {
  const pairs = Math.min(removed.length, added.length);
  for (let index = 0; index < pairs; index += 1) {
    if (removed[index] !== added[index]) rows.push([file, removed[index], added[index]]);
  }
  removed = [];
  added = [];
};
for (const line of diff.split("\n")) {
  if (line.startsWith("+++ b/")) {
    flush();
    file = line.slice("+++ b/".length);
  } else if (line.startsWith("@@")) {
    flush();
  } else {
    const title = TITLE.exec(line)?.[1];
    if (title !== undefined) (line.startsWith("-") ? removed : added).push(title);
  }
}
flush();
const cell = (text) => text.replaceAll("|", "\\|");
console.log("# E11-W05 step 5 (g) · test titles renamed (old → new)\n");
console.log("| file | old | new |\n|---|---|---|");
for (const [path, old, now] of rows) console.log(`| \`${path}\` | ${cell(old)} | ${cell(now)} |`);
console.log(`\n${String(rows.length)} titles.`);
