/**
 * CompareScreen — route '/compare/:friendId?' (W4).
 * No friendId → friends list with taste-match % badges (every user
 * auto-follows the two seeded friends, so this is never empty in practice).
 * With friendId → FriendDetail (match %, head-to-head).
 */
import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Avatar, EmptyState, Screen } from '@/components';
import { useFriends, usePeople, useSession, useSharedShows } from '@/lib/hooks';
import type { Profile } from '@/lib/auth';
import { matchPct } from './matchModel';
import { FriendDetail } from './FriendDetail';

// ---------- friends index ----------

function MatchBadge({ friendId }: { friendId: string }) {
  const { userId } = useSession();
  const sharedQuery = useSharedShows(userId, friendId);
  const shared = sharedQuery.data;
  const pct = useMemo(() => (shared ? matchPct(shared, new Date()) : null), [shared]);

  if (sharedQuery.isLoading) {
    return <div className="h-8 w-12 animate-pulse rounded-lg bg-surface-2" />;
  }
  if (pct === null) {
    return (
      <span className="max-w-[72px] text-right text-[10px] leading-tight font-semibold tracking-wide text-ink-faint uppercase">
        not enough overlap
      </span>
    );
  }
  return (
    <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-2xl font-black tabular-nums text-transparent">
      {pct}
      <span className="text-sm font-bold">%</span>
    </span>
  );
}

function SharedCount({ friendId }: { friendId: string }) {
  const { userId } = useSession();
  const sharedQuery = useSharedShows(userId, friendId);
  const n = sharedQuery.data?.length;
  return (
    <p className="text-xs text-ink-faint">
      {n === undefined ? '…' : `${n} shared show${n === 1 ? '' : 's'}`}
    </p>
  );
}

function FriendRow({ friend, index }: { friend: Profile; index: number }) {
  const navigate = useNavigate();
  return (
    <motion.li
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
    >
      <button
        type="button"
        onClick={() => void navigate(`/compare/${friend.id}`)}
        className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 text-left active:bg-surface-2"
      >
        <Avatar seed={friend.avatar_seed} name={friend.display_name} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-ink">{friend.display_name}</p>
          <SharedCount friendId={friend.id} />
        </div>
        <MatchBadge friendId={friend.id} />
      </button>
    </motion.li>
  );
}

function FriendsIndex() {
  const { userId } = useSession();
  const friendsQuery = useFriends(userId);
  const peopleQuery = usePeople(userId);
  const friends = friendsQuery.data ?? [];
  const friendIds = new Set(friends.map((f) => f.id));
  // Everyone else on Encore — real signups on the deployed URL land here.
  const others = (peopleQuery.data ?? []).filter((p) => !friendIds.has(p.id));

  return (
    <Screen title="Compare" subtitle="how your taste stacks up">
      {friendsQuery.isLoading ? (
        <ul className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <li key={i} className="h-[76px] animate-pulse rounded-2xl bg-surface" />
          ))}
        </ul>
      ) : friends.length === 0 && others.length === 0 ? (
        <EmptyState
          icon="👯"
          title="No one else here yet"
          body="Every Encore user shows up here automatically — compare ladders and find your taste twin."
        />
      ) : (
        <>
          <ul className="flex flex-col gap-3 pb-6">
            {friends.map((f, i) => (
              <FriendRow key={f.id} friend={f} index={i} />
            ))}
          </ul>
          {others.length > 0 && (
            <section className="pb-6">
              <h2 className="mb-3 text-[10px] font-semibold tracking-[0.14em] text-ink-faint uppercase">
                Everyone on Encore
              </h2>
              <ul className="flex flex-col gap-3">
                {others.map((p, i) => (
                  <FriendRow key={p.id} friend={p} index={friends.length + i} />
                ))}
              </ul>
            </section>
          )}
          <SwitchAccountLink />
        </>
      )}
    </Screen>
  );
}

function SwitchAccountLink() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => void navigate('/welcome?switch=1')}
      className="mx-auto block pb-8 text-xs font-semibold text-ink-faint underline-offset-2 active:underline"
    >
      Not you? Log in with your name + PIN
    </button>
  );
}

// ---------- route switch ----------

export default function CompareScreen() {
  const { friendId } = useParams<{ friendId: string }>();
  return friendId ? <FriendDetail friendId={friendId} /> : <FriendsIndex />;
}
