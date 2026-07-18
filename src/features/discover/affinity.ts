/**
 * Genre-affinity recommendation scoring. Pure, no React/Supabase — computes
 * "shows like the ones you loved" from an already-fetched ladder + catalog.
 *
 * Not part of src/engine/: this isn't W1's tested ranking-engine contract, just
 * a local read-side heuristic for the Discover screen.
 */
import { recencyWeight } from '@/engine';
import { eventToShowCardData } from '@/components';
import type { EventJoin, LadderRow } from '@/lib/hooks';

export interface Recommendation {
  event: EventJoin;
  score: number;
  reason: string;
}

interface GenreSignal {
  affinity: number;
  /** top-weighted logged shows in this genre, for the "because you loved X & Y" reason */
  topArtists: { artist: string; weight: number }[];
}

function recordTopArtist(signal: GenreSignal, artist: string, weight: number): void {
  signal.topArtists.push({ artist, weight });
  signal.topArtists.sort((a, b) => b.weight - a.weight);
  signal.topArtists.length = Math.min(signal.topArtists.length, 2);
}

function reasonFor(signal: GenreSignal | undefined, genre: string): string {
  if (!signal || signal.topArtists.length === 0) return `Matches your ${genre} taste`;
  const names = signal.topArtists.map((a) => a.artist);
  return `Because you loved ${names.join(' & ')}`;
}

/**
 * Recommend catalog shows the user hasn't logged yet, ranked by how much their
 * genre affinity (derived from their own ladder) favors that show's genre.
 * `now` is injected (matches the engine's time-injection convention).
 */
export function recommendShows(
  ladder: readonly LadderRow[],
  catalog: readonly EventJoin[],
  now: Date,
  limit = 10,
): Recommendation[] {
  const n = ladder.length;
  if (n === 0) return [];

  const loggedEventIds = new Set(ladder.map((row) => row.event_id));
  const genreSignals = new Map<string, GenreSignal>();

  for (const row of ladder) {
    const event = row.events;
    const genre = event?.primary_genre;
    if (!event || !genre) continue;

    const goodness = n > 1 ? 1 - (row.rank_pos - 1) / (n - 1) : 1;
    const weight = goodness * recencyWeight(event.event_date, now);

    const signal = genreSignals.get(genre) ?? { affinity: 0, topArtists: [] };
    signal.affinity += weight;
    recordTopArtist(signal, eventToShowCardData(event).artist, weight);
    genreSignals.set(genre, signal);
  }

  return catalog
    .filter((event) => !loggedEventIds.has(event.id))
    .map((event) => {
      const genre = event.primary_genre;
      const signal = genre ? genreSignals.get(genre) : undefined;
      const score = signal?.affinity ?? 0;
      return { event, score, genre };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ event, score, genre }) => ({
      event,
      score,
      reason: reasonFor(genre ? genreSignals.get(genre) : undefined, genre ?? 'this'),
    }));
}
