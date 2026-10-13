'use client';

import type { UnitSystem } from '@agilityhub/course-core';

interface Props {
  units: UnitSystem;
  onChange: (units: UnitSystem) => void;
  labels: {
    readonly feet: string;
    readonly group: string;
    readonly meters: string;
  };
}

export function UnitsToggle({ labels, units, onChange }: Props) {
  return (
    <div
      aria-label={labels.group}
      className="inline-flex border border-border rounded-agh overflow-hidden text-xs"
      role="group"
    >
      {(['M', 'FT'] as const).map((u) => (
        <button
          key={u}
          type="button"
          aria-label={u === 'M' ? labels.meters : labels.feet}
          onClick={() => { onChange(u); }}
          className={[
            'px-2 py-1 transition',
            u === units
              ? 'bg-primary text-text'
              : 'bg-surface text-muted hover:text-text',
          ].join(' ')}
        >
          {u === 'M' ? labels.meters : labels.feet}
        </button>
      ))}
    </div>
  );
}
