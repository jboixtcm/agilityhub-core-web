/**
 * Phase 12c (audit Step 9 / docs/audit/15) — IconButton for the
 * mobile-and-field UX pass.
 *
 * The 44×44 px touch target (WCAG 2.5.5) is enforced by construction
 * via `min-h-11 min-w-11` — the field pass needs phones being held
 * one-handed at a ring barrier to reliably hit any interactive
 * element. `aria-label` is required because the visible content is
 * just an icon; the label is the only thing screen readers will read.
 *
 * Three variants:
 *   - ghost   — transparent, hover background (default; nav-row affordances)
 *   - filled  — solid background (primary actions)
 *   - danger  — red-tinted (destructive)
 *
 * Sizes:
 *   - md      — 44 px (default, satisfies WCAG)
 *   - sm      — 36 px (only for inline rows on `md:`+ where the touch
 *               floor doesn't apply, e.g. dense desktop tables)
 *
 * Use Button (not IconButton) when there's a visible text label — the
 * icon+label pattern is `<Button>...<Icon /> Label</Button>`, not two
 * components stacked.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type IconButtonVariant = 'ghost' | 'filled' | 'danger';
export type IconButtonSize = 'md' | 'sm';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** REQUIRED. Single source of truth for screen readers. */
  'aria-label': string;
  /** Slot for the icon component (from `./icons`). */
  children: ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
}

const variantClass: Record<IconButtonVariant, string> = {
  ghost: 'bg-transparent text-muted hover:text-text hover:bg-surface-2',
  filled: 'bg-primary text-primary-fg hover:opacity-90 active:opacity-100',
  danger: 'bg-transparent text-danger hover:text-danger hover:bg-danger/10',
};

const sizeClass: Record<IconButtonSize, string> = {
  md: 'min-h-11 min-w-11', // 44 px — WCAG 2.5.5
  sm: 'min-h-9 min-w-9',   // 36 px — desktop-only, intentional opt-out
};

export function IconButton({
  variant = 'ghost',
  size = 'md',
  className = '',
  type = 'button',
  children,
  ...rest
}: Props) {
  return (
    <button
      type={type}
      {...rest}
      className={[
        'inline-flex items-center justify-center rounded-agh transition',
        'border border-transparent',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variantClass[variant],
        sizeClass[size],
        className,
      ].join(' ')}
    >
      {children}
    </button>
  );
}
