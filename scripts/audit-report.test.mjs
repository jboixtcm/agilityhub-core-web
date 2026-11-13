// FE-08: the report-only production audit (audit-report.mjs) and the accepted advisories file.
// Run by `apps/clubs`'s `test`: node --test.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { ACCEPTED_FILE, AUDIT_COMMAND, auditReport, parseAccepted } from "./audit-report.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** A `pnpm audit --json` output with these advisories (the shape pnpm 9 prints). */
function auditOutput(...advisories) {
  const counts = { critical: 0, high: 0, info: 0, low: 0, moderate: 0 };
  for (const advisory of advisories) counts[advisory.severity] += 1;
  return JSON.stringify({
    actions: [],
    advisories: Object.fromEntries(
      advisories.map((advisory, index) => [String(index + 1), advisory]),
    ),
    metadata: { vulnerabilities: counts },
    muted: [],
  });
}

const ZOD = {
  findings: [{ paths: ["packages__course-core>zod"], version: "3.25.76" }],
  github_advisory_id: "GHSA-mrhx-c7xc-m3w5",
  module_name: "zod",
  severity: "high",
  title: "Zod can exhaust memory while validating oversized constrained collections",
  url: "https://github.com/advisories/GHSA-mrhx-c7xc-m3w5",
};
const OTHER = {
  findings: [{ paths: ["apps__clubs>left-pad"], version: "1.0.0" }],
  github_advisory_id: "GHSA-2222-3333-4444",
  module_name: "left-pad",
  severity: "critical",
  title: "An invented advisory",
  url: "https://github.com/advisories/GHSA-2222-3333-4444",
};
const ACCEPTED_ZOD = {
  accepted: "2026-11-13",
  id: "GHSA-mrhx-c7xc-m3w5",
  package: "zod",
  reason: "client-side only",
  severity: "high",
  until: "zod 4",
  versions: "3.25.76",
};

test("FE-08 CI runs pnpm audit --prod --audit-level high", () => {
  assert.deepEqual(AUDIT_COMMAND, ["audit", "--prod", "--audit-level", "high", "--json"]);
});

test("FE-08 the accepted zod advisory is reported as accepted, with its reason, and warns nothing", () => {
  assert.deepEqual(auditReport(auditOutput(ZOD), [ACCEPTED_ZOD]), {
    lines: [
      "pnpm audit --prod --audit-level high: 0 critical, 1 high (report only)",
      "accepted     GHSA-mrhx-c7xc-m3w5 zod@3.25.76 (high): Zod can exhaust memory while validating oversized constrained collections (accepted 2026-11-13: client-side only)",
    ],
    warnings: [],
  });
});

test("FE-08 any other high or critical advisory is a warning, never a failure; a moderate one is not reported", () => {
  const report = auditReport(
    auditOutput(ZOD, OTHER, {
      ...OTHER,
      github_advisory_id: "GHSA-5555-6666-7777",
      severity: "moderate",
    }),
    [ACCEPTED_ZOD],
  );
  assert.equal(report.lines.length, 3);
  assert.equal(
    report.lines[2],
    "NOT ACCEPTED GHSA-2222-3333-4444 left-pad@1.0.0 (critical): An invented advisory https://github.com/advisories/GHSA-2222-3333-4444",
  );
  assert.deepEqual(report.warnings, [
    `GHSA-2222-3333-4444 left-pad@1.0.0 (critical): An invented advisory. Not in ${ACCEPTED_FILE}: fix it, or accept it there with the reason.`,
  ]);
  assert.equal(Object.hasOwn(report, "exitCode"), false);
});

test("FE-08 an accepted advisory no longer reported is pointed out; an audit that could not run is a warning", () => {
  assert.deepEqual(auditReport(auditOutput(), [ACCEPTED_ZOD]).lines, [
    "pnpm audit --prod --audit-level high: 0 critical, 0 high (report only)",
    `no longer reported: GHSA-mrhx-c7xc-m3w5 zod; remove it from ${ACCEPTED_FILE}`,
  ]);
  assert.deepEqual(auditReport("ERR_PNPM_AUDIT_BAD_RESPONSE", [ACCEPTED_ZOD]), {
    lines: [],
    warnings: ["pnpm audit gave no JSON report (registry unreachable?); nothing was checked"],
  });
});

test("FE-08 the accepted advisories file lists the zod advisory with its reason, and nothing malformed", async () => {
  const { accepted, problems } = parseAccepted(
    await readFile(path.join(root, ACCEPTED_FILE), "utf8"),
  );
  assert.deepEqual(problems, []);
  assert.deepEqual(
    accepted.map((entry) => [entry.id, entry.package, entry.severity]),
    [["GHSA-mrhx-c7xc-m3w5", "zod", "high"]],
  );
  assert.match(accepted[0]?.reason ?? "", /browser/u);
  assert.deepEqual(
    parseAccepted('{"advisories":[{"id":"CVE-2023-54404","accepted":"13/11/2026"}]}').problems,
    [
      `${ACCEPTED_FILE} advisories[0]: package is missing`,
      `${ACCEPTED_FILE} advisories[0]: versions is missing`,
      `${ACCEPTED_FILE} advisories[0]: severity is missing`,
      `${ACCEPTED_FILE} advisories[0]: reason is missing`,
      `${ACCEPTED_FILE} advisories[0]: until is missing`,
      `${ACCEPTED_FILE} advisories[0]: id CVE-2023-54404 is not a GHSA id`,
      `${ACCEPTED_FILE} advisories[0]: accepted 13/11/2026 is not YYYY-MM-DD`,
    ],
  );
});
