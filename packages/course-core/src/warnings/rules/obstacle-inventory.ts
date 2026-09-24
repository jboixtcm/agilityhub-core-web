/**
 * Rule: "course needs more of this obstacle than the ring has".
 *
 * Compares the course's per-type obstacle demand against the ring's
 * declared inventory (`ring.obstacleInventory`). Three flavours of warning:
 *
 *   - `severity: 'critical'` — the ring has 0 of a type the course uses
 *     (e.g. course has a 6 m tunnel, ring has no 6 m tunnels). The judge
 *     literally cannot build that obstacle on-site. Tunnels are split by
 *     nominal length (Tunnel3m / 4m / 5m / 6m) in the `ObstacleType`
 *     enum, so this catches "course needs a 6 m tunnel but ring only
 *     stocks 3 m tunnels" without needing a separate length-aware check.
 *   - `severity: 'warning'` — the ring has *some* but not enough (e.g.
 *     course has 12 jumps, ring has 8). The judge needs to decide whether
 *     to swap obstacles, change the course, or borrow equipment.
 *   - `severity: 'info'` — the ring has no obstacle inventory configured.
 *     A single non-blocking row that tells the venue organizer the
 *     inventory hasn't been set up, so they can't get confidence from
 *     the absence of red rows. (Unknown obstacle categories — types we
 *     don't model yet — also surface as `info` so the judge knows the
 *     check skipped them.)
 *
 * Unknown-type obstacles are surfaced as a single aggregated `info` row
 * (not per-obstacle) because they're already orphaned at parse time and
 * we don't want to drown the panel.
 *
 * The rule produces one warning per under-supplied obstacle type. Because
 * the warning is per-type rather than per-obstacle, we leave
 * `obstacleSourceId` null — the warnings panel will surface the message
 * without obstacle-highlighting. (A future iteration can highlight the
 * Nth+1, Nth+2, … of each over-allocated type.)
 *
 * **Empty inventory = opt-out** for the per-type checks. We treat an
 * unconfigured inventory as "not declared" rather than "venue owns
 * nothing" — venues should opt in by populating the inventory through
 * the admin UI, otherwise every course on a new venue would explode
 * with critical warnings. The single `info` row replaces that flood
 * with one clear "inventory not configured" notice that doesn't block
 * save. See feedback memory `obstacle-inventory empty = opt-out`.
 */
import type { CourseData } from '../../schema/course-data.js';
import type { ObstacleType } from '../../schema/primitives.js';
import type { CoursePlacement } from '../../geometry/placement.js';
import { inventoryCount, type Ring } from '../../geometry/ring.js';
import { makeWarning, type Warning } from '../types.js';

export function checkObstacleInventory(
  course: CourseData,
  _placement: CoursePlacement,
  ring: Ring,
): Warning[] {
  const inventory = ring.obstacleInventory ?? {};
  const hasAnyDeclared = Object.values(inventory).some((q) => (q ?? 0) > 0);

  // Count Unknown-typed obstacles for an aggregate info row — we can't
  // validate them against inventory, but the judge deserves a heads-up.
  let unknownCount = 0;
  for (const o of course.obstacles) {
    if (o.obstacleType === 'Unknown') unknownCount += 1;
  }

  // Empty / undeclared inventory → emit a single non-blocking info row
  // ("opt-out" semantics: the per-type validator stays silent). This
  // replaces the previous behaviour of returning an empty array, so the
  // venue organizer can't mistake "no warnings" for "fully validated".
  if (!hasAnyDeclared) {
    const warnings: Warning[] = [
      makeWarning({
        id: 'obstacle-inventory:not-configured',
        ruleId: 'obstacle-inventory',
        severity: 'info',
        message:
          `Ring "${ring.label}" has no obstacle inventory configured — ` +
          `the planner cannot verify the course can be built on-site. ` +
          `Configure the ring inventory in the venue admin to enable validation.`,
      }),
    ];
    if (unknownCount > 0) {
      warnings.push(
        makeWarning({
          id: 'obstacle-inventory:unknown-types',
          ruleId: 'obstacle-inventory',
          severity: 'info',
          message:
            `Course contains ${unknownCount} obstacle(s) of an unrecognized type — ` +
            `inventory check skipped for those.`,
          distanceMeters: unknownCount,
        }),
      );
    }
    return warnings;
  }

  const demand = new Map<ObstacleType, number>();
  for (const o of course.obstacles) {
    if (o.obstacleType === 'Unknown') continue;
    demand.set(o.obstacleType, (demand.get(o.obstacleType) ?? 0) + 1);
  }

  const warnings: Warning[] = [];
  for (const [type, used] of demand) {
    const available = inventoryCount(inventory, type);
    if (used <= available) continue;

    const missing = used - available;
    if (available === 0) {
      warnings.push(
        makeWarning({
          id: `obstacle-inventory:${type}:missing`,
          ruleId: 'obstacle-inventory',
          severity: 'critical',
          message: `Course uses ${used} × ${type} but ring "${ring.label}" has none on hand.`,
          distanceMeters: missing,
          thresholdMeters: available,
        }),
      );
    } else {
      warnings.push(
        makeWarning({
          id: `obstacle-inventory:${type}:short`,
          ruleId: 'obstacle-inventory',
          severity: 'warning',
          message: `Course needs ${used} × ${type}, ring "${ring.label}" has ${available} (short by ${missing}).`,
          distanceMeters: missing,
          thresholdMeters: available,
        }),
      );
    }
  }

  // Stable ordering by type so the warnings panel doesn't shuffle.
  warnings.sort((a, b) => a.id.localeCompare(b.id));

  // Append the aggregated Unknown-types info row last so it doesn't get
  // confused with a hard shortage. Only emitted when the rule is "armed"
  // (some inventory declared) — otherwise the not-configured row above
  // already covers it.
  if (unknownCount > 0) {
    warnings.push(
      makeWarning({
        id: 'obstacle-inventory:unknown-types',
        ruleId: 'obstacle-inventory',
        severity: 'info',
        message:
          `Course contains ${unknownCount} obstacle(s) of an unrecognized type — ` +
          `inventory check skipped for those.`,
        distanceMeters: unknownCount,
      }),
    );
  }

  return warnings;
}
