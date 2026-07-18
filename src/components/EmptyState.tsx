import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

export interface EmptyStateProps {
  /** emoji or custom node shown above the title */
  icon?: ReactNode;
  title: string;
  body?: string;
  /** CTA slot — usually a <Button> */
  action?: ReactNode;
  /** true = fill the viewport (ladder empty state); false = inline block */
  fullScreen?: boolean;
  className?: string;
}

export function EmptyState({
  icon = '🎫',
  title,
  body,
  action,
  fullScreen = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cx(
        'flex flex-col items-center justify-center gap-3 px-8 text-center',
        fullScreen ? 'min-h-[60dvh]' : 'py-12',
        className,
      )}
    >
      <div aria-hidden className="text-4xl">
        {icon}
      </div>
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      {body && <p className="max-w-[28ch] text-sm leading-relaxed text-ink-faint">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
