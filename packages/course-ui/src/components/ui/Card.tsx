import type { HTMLAttributes, ReactNode } from 'react';

/**
 * Phase 12c (audit Step 9 / docs/audit/15) — `density` is an opt-in
 * variant for dense operational pages (live view, build session detail,
 * calendar). Every existing call site (which does NOT pass `density`)
 * keeps the comfortable `rounded-2xl p-4` look unchanged.
 */
export type CardDensity = 'comfortable' | 'compact';

const densityClass: Record<CardDensity, string> = {
  comfortable: 'rounded-2xl p-4',
  compact: 'rounded-lg p-3',
};

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  density?: CardDensity;
}

export function Card({
  children,
  className = '',
  density = 'comfortable',
  ...rest
}: CardProps) {
  return (
    <div
      {...rest}
      className={['bg-surface border border-border', densityClass[density], className].join(' ')}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted mb-3">
      {children}
    </h2>
  );
}
