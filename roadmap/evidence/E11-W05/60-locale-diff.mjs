// E11-W05: every locale string this task changed, key · before · after, by locale and namespace.
// «before» is the tree before the task's code (`0692582a`, the parent of the session commit
// 246d4fc2), read with `git show` (read only); «after» is the working tree. Run from the repo root:
//   node roadmap/evidence/E11-W05/60-locale-diff.mjs > roadmap/evidence/E11-W05/60-locale-diff.md
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";

const BEFORE = "0692582a";
const ROOT = "packages/i18n/src/locales";

function flatten(value, prefix, out) {
  if (typeof value === "string") {
    out.set(prefix, value);
    return out;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix === "" ? key : `${prefix}.${key}`, out);
    }
  }
  return out;
}

function before(path) {
  try {
    return JSON.parse(execFileSync("git", ["show", `${BEFORE}:${path}`], { encoding: "utf8" }));
  } catch {
    return {};
  }
}

const cell = (text) => (text === undefined ? "—" : text.replaceAll("|", "\\|").replaceAll("\n", " "));
let total = 0;
console.log(`# E11-W05 · locale strings changed (before \`${BEFORE}\` → working tree)\n`);
for (const locale of ["ca", "es", "en"]) {
  const lines = [];
  for (const file of readdirSync(`${ROOT}/${locale}`).filter((name) => name.endsWith(".json")).sort()) {
    const namespace = file.slice(0, -".json".length);
    const path = `${ROOT}/${locale}/${file}`;
    const old = flatten(before(path), "", new Map());
    const now = flatten(JSON.parse(readFileSync(path, "utf8")), "", new Map());
    for (const key of [...new Set([...old.keys(), ...now.keys()])].sort()) {
      if (old.get(key) !== now.get(key)) {
        lines.push(`| \`${namespace}:${key}\` | ${cell(old.get(key))} | ${cell(now.get(key))} |`);
      }
    }
  }
  total += lines.length;
  console.log(`## ${locale} (${String(lines.length)} strings)\n\n| key | before | after |\n|---|---|---|`);
  console.log(`${lines.join("\n")}\n`);
}
console.log(`Total: ${String(total)} strings.`);
