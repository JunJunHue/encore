/**
 * LadderScreen — route '/' (W4). The home screen: every show the user has
 * logged, best → worst, sectioned into read-only auto-bucketed tiers with
 * lens chips (genre / year / capacity tier). Row tap opens the enrichment
 * sheet. Lens state lives in the URL (shareable, back-button friendly).
 */
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import {
  Button,
  Chip,
  EmptyState,
  Screen,
  ShowCard,
  TierBadge,
  eventToShowCardData,
  type TierId,
} from '@/components';
import { MOMENT_TAG_LABELS } from '@/engine/types';
import { SPRING } from '@/lib/motion';
import { useLadder, useSession } from '@/lib/hooks';
import type { CapacityTier } from '@/lib/database.types';
import { buildLadderItems, deriveLensOptions, toEngineLadder, type LensState } from './model';
import { LensBar } from './LensBar';
import { EnrichmentSheet } from './EnrichmentSheet';

const CAPACITY_TIERS: readonly CapacityTier[] = ['club', 'theater', 'arena', 'stadium'];

// ---------- URL lens state ----------

function useLensParams(): [LensState, (next: LensState) => void] {
  const [params, setParams] = useSearchParams();
  const lens = useMemo<LensState>(() => {
    const genre = params.get('genre');
    const yearRaw = params.get('year');
    const year = yearRaw && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null;
    const tierRaw = params.get('tier');
    const capacityTier = CAPACITY_TIERS.find((t) => t === tierRaw) ?? null;
    return { genre, year, capacityTier };
  }, [params]);

  const setLens = (next: LensState) => {
    const p = new URLSearchParams();
    if (next.genre) p.set('genre', next.genre);
    if (next.year !== null) p.set('year', String(next.year));
    if (next.capacityTier) p.set('tier', next.capacityTier);
    setParams(p, { replace: true });
  };
  return [lens, setLens];
}

// ---------- loading skeleton ----------

function LadderSkeleton() {
  return (
    <div className="animate-pulse px-4">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-line py-3">
          <div className="h-4 w-6 rounded bg-surface-2" />
          <div className="flex-1">
            <div className="h-4 w-2/3 rounded bg-surface-2" />
            <div className="mt-2 h-3 w-1/3 rounded bg-surface" />
          </div>
          <div className="h-3 w-10 rounded bg-surface" />
        </div>
      ))}
    </div>
  );
}

// ---------- screen ----------

export default function LadderScreen() {
  const navigate = useNavigate();
  const { userId } = useSession();
  const ladderQuery = useLadder(userId);
  const [lens, setLens] = useLensParams();
  const [activeLogId, setActiveLogId] = useState<string | null>(null);

  const rows = useMemo(() => ladderQuery.data ?? [], [ladderQuery.data]);
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const options = useMemo(() => deriveLensOptions(rows), [rows]);
  const items = useMemo(() => {
    if (rows.length === 0) return [];
    return buildLadderItems(toEngineLadder(rows), lens, rowById);
  }, [rows, lens, rowById]);

  const activeItem = useMemo(() => {
    if (!activeLogId) return null;
    for (const it of items) if (it.kind === 'row' && it.row.id === activeLogId) return it;
    // row may be filtered out of the current lens — fall back to the raw row
    const row = rowById.get(activeLogId);
    return row ? ({ kind: 'row', key: row.id, entry: null, row } as const) : null;
  }, [activeLogId, items, rowById]);

  if (ladderQuery.isLoading) {
    return (
      <Screen title="The Ladder" subtitle="every show, ranked" bleed>
        <LadderSkeleton />
      </Screen>
    );
  }

  if (ladderQuery.isError) {
    return (
      <Screen title="The Ladder">
        <EmptyState
          icon="🎛️"
          title="Couldn't load your ladder"
          body="Check your connection and try again."
          action={<Button onClick={() => void ladderQuery.refetch()}>Retry</Button>}
        />
      </Screen>
    );
  }

  // ---------- empty state (resolutions.md UI specifics) ----------
  if (rows.length === 0) {
    return (
      <Screen>
        <EmptyState
          fullScreen
          icon="🎟️"
          title="Log your first show"
          body="No stars, no reviews — one gut call at a time, and your ladder builds itself."
          action={
            <Button size="lg" onClick={() => void navigate('/log')}>
              Log a show
            </Button>
          }
        />
      </Screen>
    );
  }

  const rowCount = items.filter((it) => it.kind === 'row').length;

  return (
    <Screen
      title="The Ladder"
      subtitle={`${rows.length} show${rows.length === 1 ? '' : 's'} · NYC`}
      action={
        <Button variant="ghost" size="sm" onClick={() => void navigate('/recap')}>
          Recap ✨
        </Button>
      }
      bleed
    >
      <LensBar options={options} lens={lens} onChange={setLens} />

      {rowCount === 0 ? (
        <EmptyState
          icon="🔍"
          title="No shows in this lens"
          body="Try clearing a filter — your ladder is still all here."
          action={
            <Button
              variant="secondary"
              onClick={() => setLens({ genre: null, year: null, capacityTier: null })}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <LayoutGroup>
          <motion.ul layout className="pb-4">
            <AnimatePresence initial={false} mode="popLayout">
              {items.map((item) =>
                item.kind === 'header' ? (
                  <motion.li
                    key={item.key}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={SPRING}
                    className="flex items-baseline justify-between bg-bg/95 px-4 pt-5 pb-1.5"
                  >
                    <TierBadge tier={item.tier as TierId} size="md" />
                    <span className="text-[10px] font-semibold tracking-wide text-ink-faint uppercase">
                      {item.count} show{item.count === 1 ? '' : 's'}
                    </span>
                  </motion.li>
                ) : (
                  <motion.li
                    key={item.key}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={SPRING}
                  >
                    <ShowCard
                      variant="row"
                      show={item.row.events ? eventToShowCardData(item.row.events) : fallbackCard()}
                      rank={item.row.rank_pos}
                      tier={item.entry.tier as TierId}
                      onClick={() => setActiveLogId(item.row.id)}
                      trailing={
                        item.row.moment ? (
                          <Chip size="sm" disabled tabIndex={-1} className="border-accent/30">
                            {MOMENT_TAG_LABELS[item.row.moment]}
                          </Chip>
                        ) : undefined
                      }
                    />
                  </motion.li>
                ),
              )}
            </AnimatePresence>
          </motion.ul>
        </LayoutGroup>
      )}

      <EnrichmentSheet
        row={activeItem?.row ?? null}
        rank={activeItem?.row.rank_pos ?? null}
        tier={(activeItem?.entry?.tier as TierId | undefined) ?? null}
        onClose={() => setActiveLogId(null)}
      />
    </Screen>
  );
}

function fallbackCard() {
  return { artist: 'Unknown show', venue: '—', capacityTier: null, date: '2026-01-01' };
}
