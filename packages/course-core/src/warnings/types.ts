/**
 * Warning shape used by every Phase 2 rule.
 *
 * A `Warning` is a structured row consumed by the planner UI ("warnings
 * panel"), the Build Session snapshot, and the admin / support dashboard
 * (Phase 7). The shape must stay backward-compatible — once we persist
 * warnings inside a BuildSession (Phase 3+), changes here are migrations.
 */
import { z } from 'zod';

export const warningSeveritySchema = z.enum(['info', 'warning', 'critical']);
export type WarningSeverity = z.infer<typeof warningSeveritySchema>;

/**
 * Stable rule identifiers. Use a literal union (not a free-form string) so
 * the planner UI can switch on it for icons / dismiss-rules / sorting.
 */
export const warningRuleIdSchema = z.enum([
  'outside-ring',
  'border-clearance',
  'course-no-go',
  'ring-no-go',
  'door-clearance',
  'course-larger-than-ring',
  'obstacle-inventory',
]);
export type WarningRuleId = z.infer<typeof warningRuleIdSchema>;

export const warningSchema = z.object({
  id: z.string(),
  ruleId: warningRuleIdSchema,
  severity: warningSeveritySchema,
  message: z.string(),

  /** Associated obstacle (Smarter sourceId), if the warning is per-obstacle. */
  obstacleSourceId: z.string().nullable(),
  /** Associated course-side NoGoZone id ("at:<n>"), if any. */
  courseNoGoZoneId: z.string().nullable(),
  /** Associated ring-side no-go zone id, if any. */
  ringNoGoZoneId: z.string().nullable(),
  /** Associated door id, if any. */
  doorId: z.string().nullable(),

  /** How close we measured (meters) — depends on rule semantics. */
  distanceMeters: z.number().nullable(),
  /** Threshold we tested against (meters). */
  thresholdMeters: z.number().nullable(),
});
export type Warning = z.infer<typeof warningSchema>;

/** Helper to build a Warning with sensible nullable defaults. */
export function makeWarning(input: {
  id: string;
  ruleId: WarningRuleId;
  severity: WarningSeverity;
  message: string;
  obstacleSourceId?: string | null;
  courseNoGoZoneId?: string | null;
  ringNoGoZoneId?: string | null;
  doorId?: string | null;
  distanceMeters?: number | null;
  thresholdMeters?: number | null;
}): Warning {
  return warningSchema.parse({
    id: input.id,
    ruleId: input.ruleId,
    severity: input.severity,
    message: input.message,
    obstacleSourceId: input.obstacleSourceId ?? null,
    courseNoGoZoneId: input.courseNoGoZoneId ?? null,
    ringNoGoZoneId: input.ringNoGoZoneId ?? null,
    doorId: input.doorId ?? null,
    distanceMeters: input.distanceMeters ?? null,
    thresholdMeters: input.thresholdMeters ?? null,
  });
}
