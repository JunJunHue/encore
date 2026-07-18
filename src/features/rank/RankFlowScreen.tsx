/**
 * /rank/:eventId — THE demo centerpiece. Fullscreen (outside the tab shell).
 *
 * Phases: comparing (pairwise gauntlet) → reveal (slot-in) → enrich (insertion
 * mode only). Backfill mode (`?mode=backfill&queue=id,id&i=1&n=5`) chains
 * queued events through the same components, awaiting the RPC between shows so
 * each next session ranks against real server ids.
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LayoutGroup, motion } from 'framer-motion';
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, EmptyState, eventToShowCardData } from '@/components';
import { supabase } from '@/lib/supabase';
import { qk, queryClient } from '@/lib/queryClient';
import { useLadder, useSession, type EventJoin } from '@/lib/hooks';
import type { MomentTag } from '@/lib/database.types';
import { ComparisonPair, ProgressDots } from './ComparisonPair';
import { SlotInReveal } from './SlotInReveal';
import { EnrichStep } from './EnrichStep';
import { rowToCardData } from './engineAdapter';
import { useRankSession, type RankMode } from './useRankSession';

// Same join shape as @/lib/hooks' EVENT_SELECT (not exported there).
const EVENT_SELECT =
  'id, slug, title, event_date, primary_genre, ' +
  'venues(id, name, capacity_tier, neighborhood, borough, capacity), ' +
  'event_artists(billing_order, artists(id, name, genres))';

async function fetchEventById(eventId: string): Promise<EventJoin | null> {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_SELECT)
    .eq('id', eventId)
    .limit(1)
    .returns<EventJoin[]>();
  if (error) throw error;
  return data?.[0] ?? null;
}

const eventQueryKey = (eventId: string) => ['event', eventId] as const;

function useEvent(eventId: string, seed: EventJoin | undefined) {
  return useQuery({
    queryKey: eventQueryKey(eventId),
    queryFn: () => fetchEventById(eventId),
    initialData: seed,
    staleTime: 5 * 60_000,
  });
}

function CloseIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

function RankSplash() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="size-3 animate-pulse rounded-full bg-gradient-to-r from-accent to-accent-2" />
    </div>
  );
}

function RankFlow({ eventId }: { eventId: string }) {
  const { userId } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const mode: RankMode = searchParams.get('mode') === 'backfill' ? 'backfill' : 'insertion';
  const queue = useMemo(
    () => (searchParams.get('queue') ?? '').split(',').filter(Boolean),
    [searchParams],
  );
  const step = Math.max(1, Number(searchParams.get('i')) || 1);
  const total = Math.max(step, Number(searchParams.get('n')) || 1);

  const seeded = (location.state as { event?: EventJoin } | null)?.event;
  const eventQuery = useEvent(eventId, seeded && seeded.id === eventId ? seeded : undefined);
  const ladderQuery = useLadder(userId);

  const rank = useRankSession({
    userId,
    eventId,
    mode,
    event: eventQuery.data,
    ladderRows: ladderQuery.data,
  });
  const advancingRef = useRef(false);

  // While the reveal plays, pre-warm the next queued backfill event so the
  // chain never shows a spinner between shows.
  const nextQueued = queue[0];
  useEffect(() => {
    if (rank.phase === 'reveal' && mode === 'backfill' && nextQueued) {
      void queryClient.prefetchQuery({
        queryKey: eventQueryKey(nextQueued),
        queryFn: () => fetchEventById(nextQueued),
        staleTime: 5 * 60_000,
      });
    }
  }, [rank.phase, mode, nextQueued]);

  const exitHref = mode === 'backfill' ? '/' : '/log';

  const handleRevealDone = () => {
    if (mode === 'insertion') {
      rank.enterEnrich();
      return;
    }
    if (advancingRef.current) return;
    advancingRef.current = true;
    void (async () => {
      // Wait for the RPC so the refetched ladder carries real set_log ids —
      // the next backfill session's comparisons then reference rows that exist.
      const ok = await (rank.result?.persisted ?? Promise.resolve(false)).catch(() => false);
      if (ok) {
        try {
          await queryClient.refetchQueries({ queryKey: qk.ladder(userId) });
        } catch {
          /* keep optimistic rows */
        }
      }
      const [next, ...rest] = queue;
      if (next) {
        const qs = new URLSearchParams({
          mode: 'backfill',
          queue: rest.join(','),
          i: String(step + 1),
          n: String(total),
        });
        navigate(`/rank/${next}?${qs.toString()}`, { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    })();
  };

  const saveEnrichment = async (moment: MomentTag | null, note: string) => {
    // Keyed by (user_id, event_id): the optimistic client id never matches the
    // server-generated set_log id, so we can't use it here.
    await (rank.result?.persisted ?? Promise.resolve(false)).catch(() => false);
    const { error } = await supabase
      .from('set_logs')
      .update({ moment, note: note.length > 0 ? note : null })
      .eq('user_id', userId)
      .eq('event_id', eventId);
    if (error) console.warn('[encore] enrichment save failed:', error.message);
    void queryClient.invalidateQueries({ queryKey: qk.ladder(userId) });
    navigate('/');
  };

  const event = eventQuery.data;
  const loading = (eventQuery.isPending && !event) || ladderQuery.isPending;

  let content: ReactNode;
  if (eventQuery.isError || ladderQuery.isError) {
    content = (
      <EmptyState
        icon="📡"
        title="Couldn't load the show"
        body="Check your connection and try again."
        action={
          <Button
            onClick={() => {
              void eventQuery.refetch();
              void ladderQuery.refetch();
            }}
          >
            Retry
          </Button>
        }
        fullScreen
      />
    );
  } else if (loading || rank.phase === 'boot') {
    content = <RankSplash />;
  } else if (!event) {
    content = (
      <EmptyState
        icon="🕳️"
        title="Show not found"
        body="That event isn't in the archive."
        action={<Button onClick={() => navigate(exitHref)}>Back</Button>}
        fullScreen
      />
    );
  } else if (rank.phase === 'error' || (rank.phase === 'comparing' && !rank.opponentRow)) {
    content = (
      <EmptyState
        icon="🎛️"
        title="That didn't land"
        body="Something glitched mid-rank. Start this show over — your ladder is untouched."
        action={<Button onClick={rank.restart}>Start over</Button>}
        fullScreen
      />
    );
  } else if (rank.phase === 'comparing' && rank.prompt && rank.opponentRow) {
    content = (
      <div className="flex flex-1 flex-col">
        <ProgressDots
          done={rank.prompt.progress.done}
          expectedMax={rank.prompt.progress.expectedMax}
        />
        <div className="pb-2 text-center">
          <h1 className="text-xl font-bold text-ink">Which show was better?</h1>
          <p className="mt-1 text-xs text-ink-faint">Trust your gut — tap the winner.</p>
        </div>
        <div className="flex flex-1 flex-col justify-center pb-4">
          <ComparisonPair
            challenger={eventToShowCardData(event)}
            opponent={rowToCardData(rank.opponentRow)}
            opponentKey={rank.prompt.opponentId}
            chosen={rank.chosen}
            onChoose={rank.choose}
            onTooDifferent={() => rank.choose('too_different')}
          />
        </div>
      </div>
    );
  } else if (rank.phase === 'reveal' && rank.result) {
    content = (
      <SlotInReveal
        rows={rank.result.rows}
        newLogId={rank.result.newLogId}
        rankPos={rank.result.rankPos}
        mode={mode}
        onDone={handleRevealDone}
      />
    );
  } else if (rank.phase === 'enrich' && rank.result) {
    content = (
      <EnrichStep
        show={eventToShowCardData(event)}
        rankPos={rank.result.rankPos}
        onSave={saveEnrichment}
        onSkip={() => navigate('/')}
      />
    );
  } else {
    content = <RankSplash />;
  }

  return (
    <div className="safe-top mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-4 pb-8">
      <header className="flex items-center justify-between py-3">
        <button
          type="button"
          aria-label="Close"
          onClick={() => navigate(exitHref)}
          className="flex size-10 items-center justify-center rounded-full text-ink-faint transition-colors active:bg-surface active:text-ink"
        >
          <CloseIcon />
        </button>
        <motion.span
          key={mode === 'backfill' ? `step-${step}` : 'label'}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs font-semibold tracking-[0.2em] text-ink-faint uppercase"
        >
          {mode === 'backfill' ? `Show ${step} of ${total}` : 'New show'}
        </motion.span>
        <span aria-hidden className="size-10" />
      </header>
      <LayoutGroup>{content}</LayoutGroup>
    </div>
  );
}

export default function RankFlowScreen() {
  const { eventId } = useParams<{ eventId: string }>();
  if (!eventId) return <Navigate to="/log" replace />;
  // key: switching events (backfill chain) remounts the whole flow clean.
  return <RankFlow key={eventId} eventId={eventId} />;
}
