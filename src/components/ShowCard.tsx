import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Chip, CAPACITY_TIER_LABELS } from '@/components/Chip';
import { TierBadge, type TierId } from '@/components/TierBadge';
import type { CapacityTier } from '@/lib/database.types';
import type { EventJoin } from '@/lib/hooks';

// ---------- data shape + helpers ----------

export interface ShowCardData {
  artist: string;
  venue: string;
  capacityTier: CapacityTier | null;
  /** ISO date (event_date) */
  date: string;
  genre?: string | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2025-10-17" → "Oct '25" (resolutions.md UI specifics). */
export function formatShowDate(iso: string): string {
  const [y, m] = iso.split('-');
  const month = MONTHS[Number(m) - 1];
  if (!y || !month) return iso;
  return `${month} '${y.slice(2)}`;
}

/** Map a joined event row (hooks.EventJoin) to card data. Headliner = lowest billing_order. */
export function eventToShowCardData(event: EventJoin): ShowCardData {
  const headliner = [...event.event_artists].sort((a, b) => a.billing_order - b.billing_order)[0]
    ?.artists;
  const artist = headliner?.name ?? event.title.split(' at ')[0] ?? event.title;
  return {
    artist,
    venue: event.venues?.name ?? 'Unknown venue',
    capacityTier: event.venues?.capacity_tier ?? null,
    date: event.event_date,
    genre: event.primary_genre,
  };
}

// ---------- component ----------

export type ShowCardVariant = 'row' | 'search' | 'versus';

export interface ShowCardProps {
  show: ShowCardData;
  variant?: ShowCardVariant;
  /** 1-based rank badge (row variant) */
  rank?: number;
  tier?: TierId;
  /** subtle "NEW" badge — challenger card in the rank flow */
  isNew?: boolean;
  onClick?: () => void;
  /** right-aligned slot (row variant): score, chevron, … */
  trailing?: ReactNode;
  className?: string;
}

function MetaLine({ show, center = false }: { show: ShowCardData; center?: boolean }) {
  return (
    <div
      className={cx(
        'flex flex-wrap items-center gap-1.5 text-xs text-ink-soft',
        center && 'justify-center',
      )}
    >
      <span className="truncate">{show.venue}</span>
      {show.capacityTier && (
        <Chip size="sm" disabled tabIndex={-1}>
          {CAPACITY_TIER_LABELS[show.capacityTier]}
        </Chip>
      )}
    </div>
  );
}

function NewBadge() {
  return (
    <span className="absolute top-3 right-3 rounded-full bg-accent/25 px-2 py-0.5 text-[10px] font-bold tracking-widest text-accent uppercase">
      New
    </span>
  );
}

/**
 * The one show card. Variants:
 * - `row`    — ladder row: rank number, tier edge bar, compact meta.
 * - `search` — result card in the log flow.
 * - `versus` — big card in the pairwise comparison (never shows rank/score).
 */
export function ShowCard({
  show,
  variant = 'search',
  rank,
  tier,
  isNew = false,
  onClick,
  trailing,
  className,
}: ShowCardProps) {
  const interactive = !!onClick;

  if (variant === 'row') {
    return (
      <div
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        onClick={onClick}
        onKeyDown={interactive ? (e) => e.key === 'Enter' && onClick?.() : undefined}
        className={cx(
          'flex items-center gap-3 border-b border-line bg-transparent px-4 py-3',
          interactive && 'cursor-pointer active:bg-surface',
          className,
        )}
        style={
          tier
            ? {
                boxShadow: `inset 3px 0 0 ${`var(--color-tier-${tier === 'all_timer' ? 'alltimer' : tier})`}`,
              }
            : undefined
        }
      >
        {rank !== undefined && (
          <span className="w-7 shrink-0 text-right text-sm font-bold tabular-nums text-ink-faint">
            {rank}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-ink">{show.artist}</p>
          <MetaLine show={show} />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-xs font-medium text-ink-faint">{formatShowDate(show.date)}</span>
          {trailing}
        </div>
      </div>
    );
  }

  if (variant === 'versus') {
    return (
      <div
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        onClick={onClick}
        onKeyDown={interactive ? (e) => e.key === 'Enter' && onClick?.() : undefined}
        className={cx(
          'relative flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface px-5 py-7 text-center',
          interactive && 'cursor-pointer active:bg-surface-2',
          className,
        )}
      >
        {isNew && <NewBadge />}
        <p className="text-2xl leading-tight font-bold text-ink">{show.artist}</p>
        <MetaLine show={show} center />
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-ink-faint">{formatShowDate(show.date)}</span>
          {show.genre && (
            <Chip size="sm" disabled tabIndex={-1}>
              {show.genre}
            </Chip>
          )}
        </div>
      </div>
    );
  }

  // 'search'
  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={interactive ? (e) => e.key === 'Enter' && onClick?.() : undefined}
      className={cx(
        'relative flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3.5',
        interactive && 'cursor-pointer active:bg-surface-2',
        className,
      )}
    >
      {isNew && <NewBadge />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold text-ink">{show.artist}</p>
        <MetaLine show={show} />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-xs font-medium text-ink-faint">{formatShowDate(show.date)}</span>
        {show.genre ? (
          <Chip size="sm" disabled tabIndex={-1}>
            {show.genre}
          </Chip>
        ) : (
          tier && <TierBadge tier={tier} />
        )}
      </div>
    </div>
  );
}
