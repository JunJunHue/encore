/**
 * /welcome — fullscreen onboarding (outside the tab shell).
 *
 * Step 1: name picker with live generative-avatar preview → upsertProfile
 *         (+ auto-follow of seeded friends inside @/lib/auth).
 * Step 2: "your 5 best shows ever" picker → hands the queue to /rank in
 *         backfill mode (`?mode=backfill&queue=…`) so the SAME comparison
 *         components rank them. Route guard per resolutions.md: profile exists
 *         AND ladder non-empty → skip to /. "Skip for now" always visible.
 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Avatar, Button, Chip, ShowCard, eventToShowCardData } from '@/components';
import { NameTakenError, loginWithName, upsertProfile, type Profile } from '@/lib/auth';
import { qk, queryClient } from '@/lib/queryClient';
import { useEventSearch, useLadder, useProfile, useSession, type EventJoin } from '@/lib/hooks';
import { SPRING } from '@/lib/motion';

const MAX_PICKS = 5;
const SUGGESTIONS = ['Front Row Phantom', 'Encore Chaser', 'Rail Rider', 'Basement Believer'];

function randomGuestName(): string {
  return `Guest ${Math.floor(100 + Math.random() * 900)}`;
}

// NOTE: deliberately duplicated in features/log (no cross-feature imports).
function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-faint">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="16.5" y1="16.5" x2="21" y2="21" />
        </svg>
      </span>
      <input
        type="search"
        inputMode="search"
        enterKeyHint="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-line bg-surface py-3 pr-4 pl-11 text-base text-ink placeholder:text-ink-faint focus:border-accent/60 focus:outline-none"
      />
    </div>
  );
}

function RemoveIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden
    >
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

function OnboardingSplash() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <p className="animate-pulse bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-3xl font-black tracking-tight text-transparent">
        Encore
      </p>
    </div>
  );
}

function NameStep({ userId, switching }: { userId: string; switching: boolean }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState<'go' | 'skip' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();
  const ready = trimmed.length >= 2 && pin.length >= 6;

  const submit = async (kind: 'go' | 'skip') => {
    if (busy) return;
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'go') {
        // Name + PIN = the account. Full reload so the AuthGate re-boots
        // with the (possibly different) signed-in user and fresh caches.
        await loginWithName(trimmed, pin);
        window.location.assign('/welcome');
        return;
      }
      // Guest: device-only anonymous ladder (existing behavior).
      const profile = await upsertProfile(randomGuestName());
      queryClient.setQueryData(qk.profile(userId), profile);
      navigate('/', { replace: true });
    } catch (e) {
      setError(
        e instanceof NameTakenError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Something went wrong — try again.',
      );
      setBusy(null);
    }
  };

  return (
    <div className="safe-top mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-6 pb-10">
      <div className="flex flex-1 flex-col items-center justify-center gap-7 text-center">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING}
        >
          <p className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-5xl font-black tracking-tight text-transparent">
            Encore
          </p>
          <p className="mt-2 text-sm text-ink-soft">Every show you&apos;ve seen. Ranked.</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...SPRING, delay: 0.08 }}
          className="flex w-full flex-col items-center gap-4"
        >
          <Avatar seed={trimmed || 'encore'} name={trimmed || undefined} size={96} />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && ready) void submit('go');
            }}
            placeholder="What do your friends call you?"
            autoFocus
            maxLength={32}
            className="w-full rounded-xl border border-line bg-surface px-4 py-3.5 text-center text-lg font-semibold text-ink placeholder:text-base placeholder:font-normal placeholder:text-ink-faint focus:border-accent/60 focus:outline-none"
          />
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && ready) void submit('go');
            }}
            type="password"
            autoComplete="current-password"
            placeholder="PIN (6+ characters)"
            maxLength={64}
            className="w-full rounded-xl border border-line bg-surface px-4 py-3.5 text-center text-base font-semibold text-ink placeholder:font-normal placeholder:text-ink-faint focus:border-accent/60 focus:outline-none"
          />
          <p className="max-w-[300px] text-xs leading-relaxed text-ink-faint">
            New name? This creates your account. Coming back? The same name + PIN opens your
            ladder on any device.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <Chip key={s} selected={name === s} onClick={() => setName(s)}>
                {s}
              </Chip>
            ))}
          </div>
        </motion.div>
      </div>

      {error && <p className="pb-3 text-center text-xs text-accent-2">{error}</p>}

      <div className="flex flex-col gap-2">
        <Button
          block
          size="lg"
          loading={busy === 'go'}
          disabled={!ready || busy === 'skip'}
          onClick={() => void submit('go')}
        >
          That&apos;s me
        </Button>
        {switching ? (
          <Button block variant="ghost" disabled={busy === 'go'} onClick={() => navigate('/')}>
            Cancel
          </Button>
        ) : (
          <Button
            block
            variant="ghost"
            loading={busy === 'skip'}
            disabled={busy === 'go'}
            onClick={() => void submit('skip')}
          >
            Skip for now
          </Button>
        )}
      </div>
    </div>
  );
}

function BackfillPicker({ profile }: { profile: Profile }) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const debounced = useDebouncedValue(text, 200);
  const search = useEventSearch(debounced);
  const [picks, setPicks] = useState<EventJoin[]>([]);

  const active = debounced.trim().length >= 2;
  const results = (search.data ?? []).filter((e) => !picks.some((p) => p.id === e.id)).slice(0, 8);

  const addPick = (event: EventJoin) => {
    if (picks.length >= MAX_PICKS) return;
    setPicks((p) => [...p, event]);
    setText('');
  };

  const start = () => {
    const [first, ...rest] = picks;
    if (!first) return;
    const qs = new URLSearchParams({
      mode: 'backfill',
      queue: rest.map((e) => e.id).join(','),
      i: '1',
      n: String(picks.length),
    });
    navigate(`/rank/${first.id}?${qs.toString()}`, { state: { event: first } });
  };

  return (
    <div className="safe-top mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-4 pb-8">
      <header className="flex items-center gap-3 pt-6">
        <Avatar seed={profile.avatar_seed} name={profile.display_name} size={44} />
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-ink-faint uppercase">
            Hey {profile.display_name}
          </p>
          <h1 className="text-2xl leading-tight font-bold text-ink">Your 5 best shows, ever</h1>
        </div>
      </header>
      <p className="pt-2 pb-4 text-sm text-ink-soft">
        Pick up to five — a few quick taps ranks them, and that&apos;s your ladder&apos;s backbone.
      </p>

      {picks.length > 0 && (
        <div className="mb-4 overflow-hidden rounded-2xl border border-line bg-surface">
          {picks.map((event, i) => (
            <motion.div
              key={event.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={SPRING}
            >
              <ShowCard
                show={eventToShowCardData(event)}
                variant="row"
                rank={i + 1}
                trailing={
                  <button
                    type="button"
                    aria-label={`Remove ${eventToShowCardData(event).artist}`}
                    onClick={() => setPicks((p) => p.filter((x) => x.id !== event.id))}
                    className="-mr-1 rounded-full p-1 text-ink-faint transition-colors active:text-ink"
                  >
                    <RemoveIcon />
                  </button>
                }
              />
            </motion.div>
          ))}
        </div>
      )}

      {picks.length < MAX_PICKS ? (
        <>
          <SearchInput
            value={text}
            onChange={setText}
            placeholder={picks.length === 0 ? 'Search your #1 — artist name…' : 'Add another…'}
          />
          <div className="mt-3 flex flex-col gap-2">
            {active && search.isSuccess && results.length === 0 && (
              <p className="py-6 text-center text-sm text-ink-faint">
                No shows found — MVP covers NYC, Jul &apos;25 – Jul &apos;26.
              </p>
            )}
            {results.map((event) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={SPRING}
              >
                <ShowCard
                  show={eventToShowCardData(event)}
                  variant="search"
                  onClick={() => addPick(event)}
                />
              </motion.div>
            ))}
          </div>
        </>
      ) : (
        <p className="py-2 text-center text-xs text-ink-faint">
          That&apos;s five — ready when you are.
        </p>
      )}

      <div className="mt-auto flex flex-col gap-2 pt-6">
        <Button block size="lg" disabled={picks.length === 0} onClick={start}>
          {picks.length === 0
            ? 'Pick a show to start'
            : picks.length === 1
              ? 'Rank it'
              : `Rank all ${picks.length}`}
        </Button>
        <Button block variant="ghost" onClick={() => navigate('/')}>
          Skip for now
        </Button>
      </div>
    </div>
  );
}

export default function OnboardingScreen() {
  const { userId } = useSession();
  const [params] = useSearchParams();
  const switching = params.has('switch'); // /welcome?switch=1 → force the login form
  const profileQuery = useProfile(userId);
  const ladderQuery = useLadder(userId);

  if (profileQuery.isPending || ladderQuery.isPending) return <OnboardingSplash />;

  const profile = profileQuery.data ?? null;
  const ladder = ladderQuery.data ?? [];

  if (switching) return <NameStep userId={userId} switching />;
  // Route guard (resolutions.md): already onboarded → straight to the ladder.
  if (profile && ladder.length > 0) return <Navigate to="/" replace />;
  if (profile) return <BackfillPicker profile={profile} />;
  return <NameStep userId={userId} switching={false} />;
}
