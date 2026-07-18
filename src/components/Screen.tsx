import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

export interface ScreenProps {
  /** big display-scale title (Ladder, Log a show, …) */
  title?: string;
  subtitle?: string;
  /** right-aligned header slot (avatar, action button, …) */
  action?: ReactNode;
  children: ReactNode;
  /** remove default horizontal padding (edge-to-edge lists) */
  bleed?: boolean;
  className?: string;
}

/**
 * Safe-area mobile frame every feature screen renders inside: centers a
 * 390–430px column, applies notch padding and the standard header treatment.
 * Bottom tab-bar clearance is handled by the shell (App.tsx).
 */
export function Screen({
  title,
  subtitle,
  action,
  children,
  bleed = false,
  className,
}: ScreenProps) {
  return (
    <div className={cx('safe-top mx-auto w-full max-w-[430px]', className)}>
      {(title || action) && (
        <header
          className={cx('flex items-end justify-between gap-3 px-4 pt-5 pb-3', bleed && 'px-4')}
        >
          <div className="min-w-0">
            {title && (
              <h1 className="text-3xl leading-tight font-bold tracking-tight text-ink">{title}</h1>
            )}
            {subtitle && (
              <p className="mt-0.5 text-xs font-medium tracking-wide text-ink-faint uppercase">
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="shrink-0 pb-1">{action}</div>}
        </header>
      )}
      <div className={cx(!bleed && 'px-4')}>{children}</div>
    </div>
  );
}
