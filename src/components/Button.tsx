import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/cx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** stretch to full width */
  block?: boolean;
  loading?: boolean;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-accent to-accent-2 text-white shadow-glow ' +
    'active:brightness-110 disabled:from-surface-2 disabled:to-surface-2 disabled:text-ink-faint disabled:shadow-none',
  secondary: 'bg-surface-2 text-ink border border-line active:bg-surface disabled:text-ink-faint',
  ghost: 'bg-transparent text-ink-soft active:bg-surface disabled:text-ink-faint',
  danger: 'bg-tier-regret text-ink active:brightness-125 disabled:opacity-50',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-4 py-2.5 text-sm rounded-xl',
  lg: 'px-5 py-3.5 text-base rounded-2xl',
};

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 font-semibold transition-[filter,background-color,transform] duration-100 active:scale-[0.98] select-none',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
        />
      )}
      {children}
    </button>
  );
}
