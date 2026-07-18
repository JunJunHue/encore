import { cx } from '@/lib/cx';

/**
 * Beli-style 0–10 display score, derived purely from rank order (order is
 * truth — latent scores are decoration and shift as the ladder grows).
 * #1 of n → 10.0, last of n → 1.0, linear in between.
 */
export function displayScore(rank: number, total: number): number {
  if (total <= 1) return 10;
  return Math.round((10 - (9 * (rank - 1)) / (total - 1)) * 10) / 10;
}

/** Score band → color, reusing the tier tokens (green best → red worst). */
export function scoreColorVar(score: number): string {
  if (score >= 8) return 'var(--color-tier-alltimer)';
  if (score >= 6.5) return 'var(--color-tier-great)';
  if (score >= 5) return 'var(--color-tier-good)';
  if (score >= 3.5) return 'var(--color-tier-fine)';
  return 'var(--color-tier-regret)';
}

export interface ScoreBubbleProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/** Filled circular score bubble, Beli-style. */
export function ScoreBubble({ score, size = 'md', className }: ScoreBubbleProps) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-bold tabular-nums text-white',
        size === 'sm' && 'size-7 text-[11px]',
        size === 'md' && 'size-9 text-sm',
        size === 'lg' && 'size-12 text-lg',
        className,
      )}
      style={{ backgroundColor: scoreColorVar(score) }}
    >
      {score.toFixed(1)}
    </span>
  );
}
