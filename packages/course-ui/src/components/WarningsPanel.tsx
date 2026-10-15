'use client';

import {
  formatLength,
  type UnitSystem,
  type Warning,
  type WarningRuleId,
  type WarningSeverity,
} from '@agilityhub/course-core';

import { SeverityBadge } from './ui/Badge.js';
import { Card, CardTitle } from './ui/Card.js';

interface Props {
  warnings: readonly Warning[];
  units: UnitSystem;
  /** The club's locale for the measured distances («0,80 m» in `ca`, R-16-17). */
  locale: string;
  selectedObstacleId: string | null;
  labels: {
    readonly title: (count: number) => string;
    readonly empty: string;
    readonly severity: Readonly<Record<WarningSeverity, string>>;
    /** The rule's name in the reader's language (`enums:courseWarningRule.*`), never its id. */
    readonly rule: (ruleId: WarningRuleId) => string;
    readonly warning: (warning: Warning) => string;
  };
  onSelectObstacle: (id: string | null) => void;
}

/**
 * The rules whose `distanceMeters` is a length. `obstacle-inventory` reuses the field for the
 * missing (or unknown) equipment count, which must never read as metres or feet (review #12).
 */
const LENGTH_RULES: ReadonlySet<WarningRuleId> = new Set<WarningRuleId>([
  'outside-ring',
  'border-clearance',
  'course-no-go',
  'ring-no-go',
  'door-clearance',
  'course-larger-than-ring',
]);

export function WarningsPanel({
  warnings,
  units,
  locale,
  selectedObstacleId,
  labels,
  onSelectObstacle,
}: Props) {
  return (
    <Card>
      <CardTitle>{labels.title(warnings.length)}</CardTitle>

      {warnings.length === 0 ? (
        <p className="text-sm text-muted">{labels.empty}</p>
      ) : (
        <ul className="space-y-2 max-h-[40vh] overflow-auto pr-1">
          {warnings.map((w) => {
            const isSelected =
              w.obstacleSourceId != null && w.obstacleSourceId === selectedObstacleId;
            const isClickable = w.obstacleSourceId != null;
            return (
              <li key={w.id}>
                <button
                  type="button"
                  disabled={!isClickable}
                  className={[
                    'block w-full p-2 rounded border text-xs leading-snug text-left',
                    isSelected
                      ? 'border-warning bg-warning/10'
                      : 'border-border bg-surface',
                    isClickable ? 'cursor-pointer hover:bg-surface-2' : '',
                  ].join(' ')}
                  onClick={() => {
                    if (isClickable) onSelectObstacle(isSelected ? null : w.obstacleSourceId);
                  }}
                >
                  <span className="flex items-center gap-2 mb-1">
                    <SeverityBadge severity={w.severity} label={labels.severity[w.severity]} />
                    <span className="text-muted">{labels.rule(w.ruleId)}</span>
                    {w.distanceMeters != null && LENGTH_RULES.has(w.ruleId) ? (
                      <span className="ml-auto text-muted">
                        {formatLength(w.distanceMeters, units, { locale })}
                      </span>
                    ) : null}
                  </span>
                  <span className="block text-text">{labels.warning(w)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
