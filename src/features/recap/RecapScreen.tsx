/**
 * RecapScreen — route '/recap' (W4 stretch). IG-story-sized (9:16) recap card
 * composed statically from ladder data: top 3 shows, totals, best venue,
 * taste match with a friend. "Save image" renders the card node to PNG via
 * html-to-image. No animation by design — this is a share artifact.
 */
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toPng } from 'html-to-image';
import { Button, EmptyState, Screen } from '@/components';
import { tasteMatch } from '@/engine/tasteMatch';
import {
  useFriends,
  useLadder,
  useProfile,
  useSession,
  useSharedShows,
  type SharedShowRow,
} from '@/lib/hooks';
import { buildRecapStats } from './recapModel';

const PODIUM_COLORS = [
  'var(--color-tier-alltimer)',
  'var(--color-tier-great)',
  'var(--color-tier-good)',
] as const;

function pctFor(rows: SharedShowRow[] | undefined): number | null {
  if (!rows) return null;
  return tasteMatch(
    rows.map((r) => ({
      eventId: r.event_id,
      eventDate: r.event_date,
      rankA: r.a_rank,
      rankB: r.b_rank,
    })),
    new Date(),
  );
}

function firstNameOf(displayName: string): string {
  const head = displayName.trim().split(/\s+/)[0];
  return head && head.length > 0 ? head : displayName;
}

export default function RecapScreen() {
  const navigate = useNavigate();
  const { userId } = useSession();
  const profileQuery = useProfile(userId);
  const ladderQuery = useLadder(userId);
  const friendsQuery = useFriends(userId);

  // Up to the two seeded friends — stable hook order regardless of data.
  const friendA = friendsQuery.data?.[0];
  const friendB = friendsQuery.data?.[1];
  const sharedA = useSharedShows(userId, friendA?.id);
  const sharedB = useSharedShows(userId, friendB?.id);

  const bestMatch = useMemo(() => {
    const candidates = [
      { friend: friendA, pct: pctFor(sharedA.data) },
      { friend: friendB, pct: pctFor(sharedB.data) },
    ].filter((c): c is { friend: NonNullable<typeof friendA>; pct: number } =>
      Boolean(c.friend && c.pct !== null),
    );
    candidates.sort((a, b) => b.pct - a.pct);
    return candidates[0] ?? null;
  }, [friendA, friendB, sharedA.data, sharedB.data]);

  const stats = useMemo(() => buildRecapStats(ladderQuery.data ?? []), [ladderQuery.data]);

  const cardRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const saveImage = async () => {
    const node = cardRef.current;
    if (!node) return;
    setSaving(true);
    setSaveError(false);
    try {
      const dataUrl = await toPng(node, { cacheBust: true, pixelRatio: 3 });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'encore-recap.png';
      a.click();
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  if (ladderQuery.isLoading || profileQuery.isLoading) {
    return (
      <Screen title="Recap">
        <div className="mx-auto aspect-[9/16] w-full max-w-[350px] animate-pulse rounded-[28px] bg-surface" />
      </Screen>
    );
  }

  if (!stats) {
    return (
      <Screen title="Recap">
        <EmptyState
          fullScreen
          icon="✨"
          title="Nothing to recap yet"
          body="Log a few shows first — then flex the year."
          action={
            <Button size="lg" onClick={() => void navigate('/log')}>
              Log a show
            </Button>
          }
        />
      </Screen>
    );
  }

  const name = profileQuery.data ? firstNameOf(profileQuery.data.display_name) : 'Your';

  return (
    <Screen title="Recap" subtitle="story-sized, share-ready">
      {/* ---------- the 9:16 card (capture target) ---------- */}
      <div
        ref={cardRef}
        className="relative mx-auto flex aspect-[9/16] w-full max-w-[350px] flex-col overflow-hidden rounded-[28px] px-6 py-7"
        style={
          {
            background:
              'radial-gradient(120% 60% at 85% -10%, rgba(46,158,123,0.4) 0%, rgba(46,158,123,0) 60%), ' +
              'radial-gradient(100% 50% at 0% 110%, rgba(255,215,94,0.16) 0%, rgba(255,215,94,0) 55%), ' +
              'linear-gradient(165deg, #06211d 0%, #0a332d 45%, #0c5a50 85%, #127a64 100%)',
            // Re-theme the card locally: dark Beli-teal story card with cream ink,
            // regardless of the app's light theme tokens.
            '--color-ink': '#faf7f0',
            '--color-ink-soft': '#bcd6cd',
            '--color-ink-faint': '#7fa398',
            '--color-accent': '#8fe3c3',
            '--color-accent-2': '#ffd75e',
            '--color-tier-alltimer': '#ffd75e',
            '--color-tier-great': '#8fe3c3',
            '--color-tier-good': '#e9b949',
          } as React.CSSProperties
        }
      >
        {/* header */}
        <p className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-xs font-black tracking-[0.3em] text-transparent uppercase">
          Encore
        </p>
        <h2 className="mt-3 text-[26px] leading-[1.1] font-black tracking-tight text-ink uppercase">
          {name}&rsquo;s year
          <br />
          in shows
        </h2>
        <p className="mt-1 text-[11px] font-semibold tracking-widest text-ink-faint uppercase">
          {stats.rangeLabel}
        </p>

        {/* hero stat */}
        <p className="mt-4 text-sm font-semibold text-ink-soft">
          <span className="text-ink">{stats.totalShows} shows</span>
          <span className="mx-1.5 text-ink-faint">·</span>
          <span className="text-ink">{stats.venueCount} venues</span>
          {stats.topGenre && (
            <>
              <span className="mx-1.5 text-ink-faint">·</span>
              {stats.topGenre.pct}% {stats.topGenre.name}
            </>
          )}
        </p>

        {/* podium */}
        <div className="mt-5 flex flex-1 flex-col justify-center gap-4">
          {stats.topThree.map((show, i) => (
            <div key={show.rank} className="flex items-center gap-3.5">
              <span
                className="w-10 shrink-0 text-right text-4xl font-black tabular-nums"
                style={{ color: PODIUM_COLORS[i] ?? 'var(--color-ink-faint)' }}
              >
                {show.rank}
              </span>
              <div className="min-w-0">
                <p className="truncate text-base leading-tight font-bold text-ink">{show.artist}</p>
                <p className="truncate text-[11px] text-ink-soft">
                  {show.venue} · {show.date}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* superlatives + footer */}
        <div className="mt-4 border-t border-white/10 pt-4">
          {stats.bestVenue && (
            <p className="text-[11px] font-semibold tracking-wide text-ink-soft uppercase">
              <span className="text-ink-faint">Home venue</span>{' '}
              <span className="text-ink">{stats.bestVenue.name}</span>
              {stats.bestVenue.visits > 1 && (
                <span className="text-accent"> ×{stats.bestVenue.visits}</span>
              )}
            </p>
          )}
          <div className="mt-2 flex items-end justify-between gap-3">
            <p className="text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
              encore.app
            </p>
            {bestMatch && (
              <p className="text-right text-[11px] leading-snug font-bold text-ink">
                <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-lg font-black text-transparent">
                  {bestMatch.pct}%
                </span>{' '}
                <span className="text-ink-soft">
                  matched with {firstNameOf(bestMatch.friend.display_name)}
                </span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ---------- actions ---------- */}
      <div className="mx-auto mt-5 flex w-full max-w-[350px] flex-col gap-2 pb-6">
        <Button block size="lg" loading={saving} onClick={() => void saveImage()}>
          {saving ? 'Rendering…' : 'Save image'}
        </Button>
        {saveError && (
          <p className="text-center text-xs text-tier-regret">
            Couldn&rsquo;t render the image — try again.
          </p>
        )}
      </div>
    </Screen>
  );
}
