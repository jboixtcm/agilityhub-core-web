/**
 * Phase 12c (audit Step 9 / docs/audit/15) — EmptyState for the
 * mobile-and-field UX pass.
 *
 * Every list-rendering page on the planner has at least three "empty"
 * branches today (loading / unauthenticated / forbidden / filtered-to-
 * zero). Each one renders bespoke `<Card>` + inline text + a link, and
 * the result drifts across pages — different copy formats, different
 * affordances, inconsistent role for screen readers.
 *
 * EmptyState normalises:
 *   - the visual surface (centered, padded, role="status" for non-error
 *     branches so SR users get a live-region announcement),
 *   - the action affordance (link or onClick — both produce a 44 px
 *     tappable target),
 *   - the icon slot (optional, takes one of `./icons`).
 *
 * Use the `density` prop to opt into the compact Card variant when the
 * empty state sits inside a dense operational page.
 */
import type { ReactNode } from 'react';

import { Button } from './Button.js';
import { Card, type CardDensity } from './Card.js';

/**
 * Discriminated union — exactly one of {href, onClick} must be set.
 * The structural form lets call sites pass `action={{ label, href }}` or
 * `action={{ label, onClick }}` without bothering with `as const`.
 */
export type EmptyStateAction =
  | { readonly label: string; readonly href: string; readonly onClick?: never }
  | { readonly label: string; readonly onClick: () => void; readonly href?: never };

interface Props {
  title: string;
  description?: ReactNode;
  action?: EmptyStateAction;
  /** Slot for an icon component from `./icons`, e.g. `<CalendarIcon className="w-8 h-8" />`. */
  icon?: ReactNode;
  density?: CardDensity;
  /**
   * Override the implicit role. Defaults to `status` (live region) so
   * screen readers announce filter-change → empty transitions; pass
   * `alert` for forbidden / error empties so SRs prioritise them.
   */
  role?: 'status' | 'alert';
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  density = 'comfortable',
  role = 'status',
}: Props) {
  return (
    <Card density={density} role={role} aria-live={role === 'status' ? 'polite' : 'assertive'}>
      <div className="flex flex-col items-center text-center gap-2 py-4">
        {icon && <div className="text-muted">{icon}</div>}
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        {description && (
          <div className="text-xs text-muted max-w-md">{description}</div>
        )}
        {action && (
          <div className="mt-2">
            {'href' in action && action.href !== undefined ? (
              <a
                href={action.href}
                className="inline-flex items-center justify-center min-h-11 px-4 rounded-agh text-sm font-semibold bg-transparent border border-warning text-text hover:bg-warning hover:text-[var(--ah-color-on-warning)] transition"
              >
                {action.label}
              </a>
            ) : (
              <Button variant="outline" size="md" onClick={action.onClick}>
                {action.label}
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
