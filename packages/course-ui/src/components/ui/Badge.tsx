import type { WarningSeverity } from '@agilityhub/course-core';
import type { ReactNode } from 'react';

const severityClass: Record<WarningSeverity, string> = {
  critical: 'bg-red-600/20 text-danger border-danger',
  warning: 'bg-warning/10 text-warning border-warning',
  info: 'bg-info/10 text-info border-info',
};

export function SeverityBadge({ severity, label }: { severity: WarningSeverity; label: string }) {
  return (
    <span
      className={[
        'inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border uppercase tracking-wide',
        severityClass[severity],
      ].join(' ')}
    >
      {label}
    </span>
  );
}

export function NeutralBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border border-border bg-surface-2 text-muted">
      {children}
    </span>
  );
}
