/**
 * Warning engine — fans out to every Phase 2 rule and concatenates results.
 *
 * The public API is `runWarnings(course, placement, ring)`. Each rule is a
 * pure function `(course, placement, ring) → Warning[]`. Adding a rule
 * means importing it and appending to `ALL_RULES`.
 *
 * Order: critical first, then warning, then info. Within each severity,
 * rules run in `ALL_RULES` order (stable). Stability matters so the
 * planner UI doesn't shuffle the warnings panel on every recalculation.
 */
import type { CourseData } from '../schema/course-data.js';
import type { CoursePlacement } from '../geometry/placement.js';
import type { Ring } from '../geometry/ring.js';
import { checkBorderClearance } from './rules/border-clearance.js';
import { checkCourseLargerThanRing } from './rules/course-larger-than-ring.js';
import { checkCourseNoGo } from './rules/course-no-go.js';
import { checkDoorClearance } from './rules/door-clearance.js';
import { checkObstacleInventory } from './rules/obstacle-inventory.js';
import { checkOutsideRing } from './rules/outside-ring.js';
import { checkRingNoGo } from './rules/ring-no-go.js';
import type { Warning, WarningRuleId, WarningSeverity } from './types.js';

export type WarningRule = (course: CourseData, placement: CoursePlacement, ring: Ring) => Warning[];

export const ALL_RULES: ReadonlyArray<{ id: WarningRuleId; run: WarningRule }> = [
  { id: 'course-larger-than-ring', run: checkCourseLargerThanRing },
  { id: 'obstacle-inventory', run: checkObstacleInventory },
  { id: 'outside-ring', run: checkOutsideRing },
  { id: 'border-clearance', run: checkBorderClearance },
  { id: 'course-no-go', run: checkCourseNoGo },
  { id: 'ring-no-go', run: checkRingNoGo },
  { id: 'door-clearance', run: checkDoorClearance },
];

const SEVERITY_ORDER: Record<WarningSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export interface RunWarningsOptions {
  /** Optional allow-list of rule ids — if set, only those rules run. */
  readonly only?: ReadonlyArray<WarningRuleId>;
}

export function runWarnings(
  course: CourseData,
  placement: CoursePlacement,
  ring: Ring,
  options: RunWarningsOptions = {},
): Warning[] {
  const enabled = options.only ? new Set(options.only) : null;
  const collected: Warning[] = [];
  for (const rule of ALL_RULES) {
    if (enabled && !enabled.has(rule.id)) continue;
    const out = rule.run(course, placement, ring);
    for (const w of out) collected.push(w);
  }
  // Stable sort by severity (critical → warning → info), preserving the
  // per-rule order within each severity bucket.
  return collected
    .map((w, i) => ({ w, i }))
    .sort((a, b) => {
      const s = SEVERITY_ORDER[a.w.severity] - SEVERITY_ORDER[b.w.severity];
      return s !== 0 ? s : a.i - b.i;
    })
    .map(({ w }) => w);
}

/** Quick summary, handy for tests / logging / status badges. */
export interface WarningSummary {
  readonly total: number;
  readonly bySeverity: Readonly<Record<WarningSeverity, number>>;
  readonly byRule: Readonly<Record<WarningRuleId, number>>;
}

export function summarizeWarnings(warnings: readonly Warning[]): WarningSummary {
  const bySeverity: Record<WarningSeverity, number> = { critical: 0, warning: 0, info: 0 };
  const byRule: Partial<Record<WarningRuleId, number>> = {};
  for (const w of warnings) {
    bySeverity[w.severity] += 1;
    byRule[w.ruleId] = (byRule[w.ruleId] ?? 0) + 1;
  }
  return {
    total: warnings.length,
    bySeverity,
    byRule: {
      'course-larger-than-ring': byRule['course-larger-than-ring'] ?? 0,
      'obstacle-inventory': byRule['obstacle-inventory'] ?? 0,
      'outside-ring': byRule['outside-ring'] ?? 0,
      'border-clearance': byRule['border-clearance'] ?? 0,
      'course-no-go': byRule['course-no-go'] ?? 0,
      'ring-no-go': byRule['ring-no-go'] ?? 0,
      'door-clearance': byRule['door-clearance'] ?? 0,
    },
  };
}
