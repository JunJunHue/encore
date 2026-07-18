import { cx } from '@/lib/cx';

/** Engine tier vocabulary (structural mirror of src/engine — see persist.ts note). */
export type TierId = 'all_timer' | 'great' | 'good' | 'fine' | 'regret';

export const TIER_ORDER: TierId[] = ['all_timer', 'great', 'good', 'fine', 'regret'];

export const TIER_META: Record<TierId, { label: string; cssVar: string }> = {
  all_timer: { label: 'All-timer', cssVar: 'var(--color-tier-alltimer)' },
  great: { label: 'Great', cssVar: 'var(--color-tier-great)' },
  good: { label: 'Good', cssVar: 'var(--color-tier-good)' },
  fine: { label: 'Fine', cssVar: 'var(--color-tier-fine)' },
  regret: { label: 'Regret', cssVar: 'var(--color-tier-regret)' },
};

export interface TierBadgeProps {
  tier: TierId;
  size?: 'sm' | 'md';
  className?: string;
}

/** Colored dot + tier label, used on ladder rows / show cards / tier headers. */
export function TierBadge({ tier, size = 'sm', className }: TierBadgeProps) {
  const meta = TIER_META[tier];
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 font-semibold tracking-wide uppercase',
        size === 'sm' ? 'text-[10px]' : 'text-xs',
        className,
      )}
      style={{ color: meta.cssVar }}
    >
      <span
        aria-hidden
        className={cx('rounded-full', size === 'sm' ? 'size-1.5' : 'size-2')}
        style={{ backgroundColor: meta.cssVar }}
      />
      {meta.label}
    </span>
  );
}
