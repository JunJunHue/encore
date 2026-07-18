/**
 * /discover — genre-affinity recommendations: catalog shows not yet on the
 * user's ladder, ranked by how much their own ladder favors that genre.
 * Tapping a card opens the same /rank/:eventId flow as LogScreen.
 */
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Button, EmptyState, Screen, ShowCard, eventToShowCardData } from '@/components';
import { useCatalog, useLadder, useSession, type EventJoin } from '@/lib/hooks';
import { SPRING } from '@/lib/motion';
import { recommendShows, type Recommendation } from './affinity';

interface RecGroup {
  genre: string;
  reason: string;
  items: Recommendation[];
}

/** Recs arrive pre-sorted by score; grouping preserves that order (highest-scoring genre first). */
function groupByGenre(recs: Recommendation[]): RecGroup[] {
  const order: string[] = [];
  const byGenre = new Map<string, Recommendation[]>();
  for (const rec of recs) {
    const genre = rec.event.primary_genre ?? 'other';
    if (!byGenre.has(genre)) {
      byGenre.set(genre, []);
      order.push(genre);
    }
    byGenre.get(genre)!.push(rec);
  }
  return order.map((genre) => {
    const items = byGenre.get(genre)!;
    return { genre, reason: items[0]!.reason, items };
  });
}

function SkeletonList() {
  return (
    <div className="flex flex-col gap-2.5 pt-4" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-[76px] animate-pulse rounded-xl border border-line bg-surface"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
  );
}

export default function DiscoverScreen() {
  const navigate = useNavigate();
  const { userId } = useSession();
  const ladderQuery = useLadder(userId);
  const catalogQuery = useCatalog();

  const ladder = ladderQuery.data ?? [];
  const catalog = catalogQuery.data ?? [];
  const recs = useMemo(() => recommendShows(ladder, catalog, new Date()), [ladder, catalog]);
  const groups = useMemo(() => groupByGenre(recs), [recs]);

  const openRankFlow = (event: EventJoin) => {
    navigate(`/rank/${event.id}`, { state: { event } });
  };

  const loading = ladderQuery.isLoading || catalogQuery.isLoading;

  return (
    <Screen title="Discover" subtitle="shows like the ones you loved">
      {loading && <SkeletonList />}

      {!loading && catalogQuery.isError && (
        <EmptyState
          icon="📡"
          title="Search glitched"
          body="Couldn't reach the archive — check your connection and try again."
        />
      )}

      {!loading && !catalogQuery.isError && ladder.length === 0 && (
        <EmptyState
          icon="🎧"
          title="Log a few shows first"
          body="Once you've ranked a handful of shows, we'll learn your taste and recommend more."
          action={<Button onClick={() => navigate('/log')}>Log a show</Button>}
        />
      )}

      {!loading && !catalogQuery.isError && ladder.length > 0 && recs.length === 0 && (
        <EmptyState
          icon="🔭"
          title="You've covered your favorite genres"
          body="Nothing new to surface yet — try browsing everything in Log instead."
          action={<Button onClick={() => navigate('/log')}>Browse all shows</Button>}
        />
      )}

      {groups.length > 0 && (
        <div className="flex flex-col gap-5 pt-4 pb-4">
          {groups.map((group, gi) => (
            <motion.div
              key={group.genre}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING, delay: Math.min(gi * 0.05, 0.2) }}
            >
              <div className="mb-2 flex items-baseline justify-between">
                <p className="text-xs font-semibold tracking-[0.14em] text-ink-faint uppercase">
                  {group.genre}
                </p>
                <p className="text-xs font-medium text-ink-faint">{group.reason}</p>
              </div>
              <div className="flex flex-col gap-2.5">
                {group.items.map((rec) => (
                  <ShowCard
                    key={rec.event.id}
                    show={eventToShowCardData(rec.event)}
                    variant="search"
                    onClick={() => openRankFlow(rec.event)}
                  />
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </Screen>
  );
}
