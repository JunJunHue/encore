import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/cx';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  /** small = metadata chips on cards; md = tappable filter/moment chips */
  size?: 'sm' | 'md';
  children: ReactNode;
}

/**
 * Pill chip used for genres, capacity tiers, lens filters and moment tags.
 * Renders a <button>; pass `disabled` for display-only chips ("soon", metadata).
 */
export function Chip({ selected = false, size = 'md', className, children, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cx(
        'inline-flex shrink-0 items-center gap-1 rounded-full border font-medium whitespace-nowrap transition-colors select-none',
        size === 'sm' ? 'px-2 py-0.5 text-[10px] tracking-wide uppercase' : 'px-3 py-1.5 text-xs',
        selected
          ? 'border-accent/60 bg-accent/20 text-ink'
          : 'border-line bg-surface-2 text-ink-soft',
        rest.onClick && !rest.disabled && 'active:bg-surface',
        rest.disabled && 'opacity-50',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export const CAPACITY_TIER_LABELS: Record<'club' | 'theater' | 'arena' | 'stadium', string> = {
  club: 'Club',
  theater: 'Theater',
  arena: 'Arena',
  stadium: 'Stadium',
};
