'use client';

import type { UnitSystem, Warning, WarningSeverity } from '@agilityhub/course-core';

import { SeverityBadge } from './ui/Badge.js';
import { Card, CardTitle } from './ui/Card.js';

interface Props {
  warnings: readonly Warning[];
  units: UnitSystem;
  selectedObstacleId: string | null;
  labels: {
    readonly title: (count: number) => string;
    readonly empty: string;
    readonly severity: Readonly<Record<WarningSeverity, string>>;
    readonly warning: (warning: Warning) => string;
    readonly distance: (meters: number, units: UnitSystem) => string;
  };
  onSelectObstacle: (id: string | null) => void;
}

export function WarningsPanel({
  warnings,
  units,
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
                    <span className="text-muted">{w.ruleId}</span>
                    {w.distanceMeters != null ? (
                      <span className="ml-auto text-muted">
                        {labels.distance(w.distanceMeters, units)}
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
