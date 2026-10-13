import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'outline' | 'neutral' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-text hover:opacity-90 active:opacity-100',
  outline:
    'bg-transparent border border-warning text-text hover:bg-warning hover:text-[var(--ah-color-on-warning)]',
  neutral: 'bg-surface text-muted hover:text-text hover:bg-surface/80',
  danger: 'bg-red-700 text-white hover:bg-red-600',
};

const sizeClass: Record<ButtonSize, string> = {
  sm: 'min-h-[34px] px-3 text-xs',
  md: 'min-h-[43px] px-4 text-sm',
  lg: 'min-h-[52px] px-6 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: Props) {
  return (
    <button
      type="button"
      {...rest}
      className={[
        'inline-flex items-center justify-center font-semibold rounded-agh transition border border-transparent disabled:opacity-50 disabled:cursor-not-allowed',
        variantClass[variant],
        sizeClass[size],
        className,
      ].join(' ')}
    >
      {children}
    </button>
  );
}
