/**
 * Friend detail — big animated taste-match %, shared-show count, and the
 * head-to-head list sorted by disagreement (|subset-rank delta| desc) with the
 * top one highlighted, including the friend's seeded note (the Four Tet beat).
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Avatar, Button, EmptyState, Screen, formatShowDate } from '@/components';
import { useLadder, useProfile, useSession, useSharedShows } from '@/lib/hooks';
import { cx } from '@/lib/cx';
import {
  buildHeadToHead,
  firstName,
  matchPct,
  MIN_OVERLAP,
  type HeadToHeadItem,
} from './matchModel';
import { TasteMatchRing } from './TasteMatchRing';

// ---------- pieces ----------

function BackButton() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => void navigate('/compare')}
      aria-label="Back to friends"
      className="flex size-9 items-center justify-center rounded-full bg-surface-2 text-ink-soft active:bg-surface"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
  );
}

function RankPair({
  name,
  item,
  large = false,
}: {
  name: string;
  item: HeadToHeadItem;
  large?: boolean;
}) {
  return (
    <span
      className={cx('tabular-nums', large ? 'text-lg font-bold' : 'text-xs font-semibold')}
      aria-label={`You ranked it number ${item.myRank}, ${name} number ${item.theirRank}`}
    >
      <span className="text-ink">You: #{item.myRank}</span>
      <span className="mx-1.5 text-ink-faint">·</span>
      <span className="text-ink-soft">
        {name}: #{item.theirRank}
      </span>
    </span>
  );
}

function DisagreementCallout({
  item,
  name,
  note,
}: {
  item: HeadToHeadItem;
  name: string;
  note: string | null;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35 }}
      className="rounded-2xl bg-gradient-to-r from-accent to-accent-2 p-[1.5px] shadow-glow"
    >
      <div className="rounded-[calc(1rem-1.5px)] bg-surface px-4 py-4">
        <p className="text-[10px] font-bold tracking-widest text-accent-2 uppercase">
          Biggest disagreement
        </p>
        <p className="mt-1.5 text-xl leading-tight font-bold text-ink">{item.artist}</p>
        <p className="mt-0.5 text-xs text-ink-soft">
          {item.venueName} · {formatShowDate(item.eventDate)}
        </p>
        <div className="mt-3">
          <RankPair name={name} item={item} large />
        </div>
        {note && (
          <blockquote className="mt-3 border-l-2 border-accent/50 pl-3 text-sm text-ink-soft italic">
            “{note}”
            <span className="mt-0.5 block text-[10px] font-semibold tracking-wide text-ink-faint uppercase not-italic">
              — {name}, on this one
            </span>
          </blockquote>
        )}
      </div>
    </motion.div>
  );
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) {
    return <span className="text-[10px] font-bold tracking-wide text-tier-good uppercase">=</span>;
  }
  return (
    <span
      className={cx(
        'rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
        delta >= 4 ? 'bg-accent-2/20 text-accent-2' : 'bg-surface-2 text-ink-soft',
      )}
    >
      Δ{delta}
    </span>
  );
}

// ---------- screen body ----------

export function FriendDetail({ friendId }: { friendId: string }) {
  const { userId } = useSession();
  const profileQuery = useProfile(friendId);
  const sharedQuery = useSharedShows(userId, friendId);
  const friendLadderQuery = useLadder(friendId); // for the friend's seeded notes

  const friend = profileQuery.data;
  const shared = useMemo(() => sharedQuery.data ?? [], [sharedQuery.data]);
  const pct = useMemo(() => matchPct(shared, new Date()), [shared]);
  const headToHead = useMemo(() => buildHeadToHead(shared, new Date()), [shared]);

  const name = friend ? firstName(friend.display_name) : '…';
  const top = headToHead[0];
  const hasDisagreement = top !== undefined && top.delta > 0;
  const rest = hasDisagreement ? headToHead.slice(1) : headToHead;
  const topNote = useMemo(() => {
    if (!top || top.delta === 0) return null;
    const row = (friendLadderQuery.data ?? []).find((r) => r.event_id === top.eventId);
    return row?.note ?? null;
  }, [top, friendLadderQuery.data]);

  const loading = profileQuery.isLoading || sharedQuery.isLoading;

  return (
    <Screen className="pt-1">
      {/* header */}
      <div className="flex items-center gap-3 pt-4 pb-5">
        <BackButton />
        {friend && (
          <>
            <Avatar seed={friend.avatar_seed} name={friend.display_name} size={40} />
            <div className="min-w-0">
              <h1 className="truncate text-xl leading-tight font-bold text-ink">
                {friend.display_name}
              </h1>
              <p className="text-[10px] font-semibold tracking-wide text-ink-faint uppercase">
                {shared.length} shared show{shared.length === 1 ? '' : 's'}
              </p>
            </div>
          </>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="size-40 animate-pulse rounded-full bg-surface-2" />
        </div>
      ) : (
        <>
          {/* match % */}
          <div className="flex flex-col items-center gap-2 pb-7">
            {pct !== null ? (
              <TasteMatchRing pct={pct} />
            ) : (
              <EmptyState
                icon="🤝"
                title="Not enough shared shows yet"
                body={`${shared.length}/${MIN_OVERLAP} shared shows — the match % unlocks at ${MIN_OVERLAP}.`}
              />
            )}
          </div>

          {/* head-to-head */}
          {shared.length > 0 && (
            <section className="pb-8">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-base font-bold text-ink">Head-to-head</h2>
                <span className="text-[10px] font-semibold tracking-wide text-ink-faint uppercase">
                  sorted by disagreement
                </span>
              </div>

              {hasDisagreement && <DisagreementCallout item={top} name={name} note={topNote} />}

              <ul className={cx(hasDisagreement && 'mt-4')}>
                {rest.map((item, i) => (
                  <motion.li
                    key={item.eventId}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 + Math.min(i, 8) * 0.04 }}
                    className="flex items-center gap-3 border-b border-line py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{item.artist}</p>
                      <p className="truncate text-xs text-ink-faint">
                        {item.venueName} · {formatShowDate(item.eventDate)}
                      </p>
                    </div>
                    <RankPair name={name} item={item} />
                    <DeltaBadge delta={item.delta} />
                  </motion.li>
                ))}
              </ul>
            </section>
          )}

          {shared.length === 0 && (
            <EmptyState
              icon="🎫"
              title="No shows in common yet"
              body="Log more shows — the ones you both saw will show up here."
              action={<GoLogButton />}
            />
          )}
        </>
      )}
    </Screen>
  );
}

function GoLogButton() {
  const navigate = useNavigate();
  return (
    <Button variant="secondary" onClick={() => void navigate('/log')}>
      Log a show
    </Button>
  );
}
