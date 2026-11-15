// FE-08: the production dependency audit, as a report only. Runs `pnpm audit --prod --audit-level
// high` (with `--json`), and prints each high or critical advisory it reports: an advisory listed
// in `audit-accepted-advisories.json` as accepted, with its reason; any other as a GitHub Actions
// warning. An accepted entry the audit no longer reports is pointed out for removal. It never
// fails: a run is not stopped by an advisory, nor by an audit that could not run (CI step «Audit
// production dependencies (report only)»).
//
// Usage: node scripts/audit-report.mjs
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const ACCEPTED_FILE = "audit-accepted-advisories.json";
export const AUDIT_COMMAND = ["audit", "--prod", "--audit-level", "high", "--json"];

const REPORTED = new Set(["high", "critical"]);
const GHSA = /^GHSA(?:-[23456789cfghjmpqrvwx]{4}){3}$/u;
const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const REQUIRED = ["id", "package", "versions", "severity", "accepted", "reason", "until"];

/** The accepted advisories of the file's text, or why the file cannot be read as such. */
export function parseAccepted(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return { accepted: [], problems: [`${ACCEPTED_FILE}: not JSON`] };
  }
  const entries = Array.isArray(value?.advisories) ? value.advisories : null;
  if (entries === null) return { accepted: [], problems: [`${ACCEPTED_FILE}: no advisories list`] };
  const problems = [];
  entries.forEach((entry, index) => {
    const where = `${ACCEPTED_FILE} advisories[${String(index)}]`;
    for (const key of REQUIRED) {
      if (typeof entry?.[key] !== "string" || entry[key].trim() === "") {
        problems.push(`${where}: ${key} is missing`);
      }
    }
    if (typeof entry?.id === "string" && !GHSA.test(entry.id)) {
      problems.push(`${where}: id ${entry.id} is not a GHSA id`);
    }
    if (typeof entry?.accepted === "string" && !DAY.test(entry.accepted)) {
      problems.push(`${where}: accepted ${entry.accepted} is not YYYY-MM-DD`);
    }
  });
  return { accepted: problems.length === 0 ? entries : [], problems };
}

/**
 * The report of a `pnpm audit --json` output against the accepted advisories: the lines to print
 * and the warnings to annotate. Pure; the exit code is always 0 (report only).
 */
export function auditReport(output, accepted) {
  let audit;
  try {
    audit = JSON.parse(output);
  } catch {
    return {
      lines: [],
      warnings: ["pnpm audit gave no JSON report (registry unreachable?); nothing was checked"],
    };
  }
  const advisories = Object.values(audit?.advisories ?? {}).filter((advisory) =>
    REPORTED.has(advisory?.severity),
  );
  const byId = new Map(accepted.map((entry) => [entry.id, entry]));
  const reported = new Set();
  const lines = [];
  const warnings = [];
  for (const advisory of advisories) {
    const id = advisory.github_advisory_id ?? String(advisory.id);
    reported.add(id);
    const versions = [...new Set((advisory.findings ?? []).map((finding) => finding.version))];
    const what = `${id} ${advisory.module_name}@${versions.join(", ")} (${advisory.severity}): ${advisory.title}`;
    const entry = byId.get(id);
    if (entry === undefined) {
      lines.push(`NOT ACCEPTED ${what} ${advisory.url ?? ""}`.trimEnd());
      warnings.push(
        `${what}. Not in ${ACCEPTED_FILE}: fix it, or accept it there with the reason.`,
      );
    } else {
      lines.push(`accepted     ${what} (accepted ${entry.accepted}: ${entry.reason})`);
    }
  }
  for (const entry of accepted) {
    if (!reported.has(entry.id)) {
      lines.push(
        `no longer reported: ${entry.id} ${entry.package}; remove it from ${ACCEPTED_FILE}`,
      );
    }
  }
  const counts = audit?.metadata?.vulnerabilities ?? {};
  lines.unshift(
    `pnpm ${AUDIT_COMMAND.slice(0, -1).join(" ")}: ${String(counts.critical ?? 0)} critical, ${String(counts.high ?? 0)} high (report only)`,
  );
  return { lines, warnings };
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  let accepted = [];
  const warnings = [];
  try {
    const parsed = parseAccepted(readFileSync(path.join(root, ACCEPTED_FILE), "utf8"));
    accepted = parsed.accepted;
    warnings.push(...parsed.problems);
  } catch (error) {
    warnings.push(`${ACCEPTED_FILE}: ${error.message}`);
  }
  const audit = spawnSync("pnpm", AUDIT_COMMAND, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const report = auditReport(audit.stdout ?? "", accepted);
  for (const line of report.lines) console.log(line);
  for (const warning of [...warnings, ...report.warnings]) {
    console.log(`::warning title=pnpm audit (report only)::${warning}`);
  }
}
