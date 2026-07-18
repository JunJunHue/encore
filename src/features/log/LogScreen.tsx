/**
 * /log — event search. Debounced search over seeded NYC events
 * (useEventSearch → .ilike on events.title); tapping a result starts the
 * rank flow at /rank/:eventId (event seeded through router state so the
 * comparison screen paints instantly).
 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { EmptyState, Screen, ShowCard, eventToShowCardData } from '@/components';
import { useEventSearch, type EventJoin } from '@/lib/hooks';
import { SPRING } from '@/lib/motion';
import { cx } from '@/lib/cx';

// NOTE: deliberately duplicated in features/onboarding (no cross-feature imports).
function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function SearchIcon() {
  return (
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
  );
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
        <SearchIcon />
      </span>
      <input
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-line bg-surface py-3 pr-10 pl-11 text-base text-ink placeholder:text-ink-faint focus:border-accent/60 focus:outline-none"
      />
      {value.length > 0 && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-faint active:bg-surface-2 active:text-ink"
        >
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
        </button>
      )}
    </div>
  );
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

export default function LogScreen() {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const debounced = useDebouncedValue(text, 200);
  const search = useEventSearch(debounced);

  const browsing = debounced.trim().length === 0;
  const results: EventJoin[] = search.data ?? [];

  const openRankFlow = (event: EventJoin) => {
    navigate(`/rank/${event.id}`, { state: { event } });
  };

  return (
    <Screen title="Log a show" subtitle="NYC · May '25 – Jul '26">
      <SearchInput value={text} onChange={setText} placeholder="Search artists…" />

      {search.isLoading && <SkeletonList />}

      {search.isError && (
        <EmptyState
          icon="📡"
          title="Search glitched"
          body="Couldn't reach the archive — check your connection and try again."
        />
      )}

      {search.isSuccess && results.length === 0 && (
        <EmptyState icon="🕳️" title="No shows found" body="MVP covers NYC, May '25 – Jul '26." />
      )}

      {results.length > 0 && (
        <div
          className={cx(
            'flex flex-col gap-2.5 pt-4 pb-4 transition-opacity',
            search.isPlaceholderData && 'opacity-60',
          )}
        >
          <p className="text-xs font-semibold tracking-[0.14em] text-ink-faint uppercase">
            {browsing ? 'Recent shows' : 'Results'}
          </p>
          {results.map((event, i) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING, delay: Math.min(i * 0.03, 0.15) }}
            >
              <ShowCard
                show={eventToShowCardData(event)}
                variant="search"
                onClick={() => openRankFlow(event)}
              />
            </motion.div>
          ))}
        </div>
      )}
    </Screen>
  );
}
