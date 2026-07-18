/**
 * Recap feature model — derives the story-card stats from ladder rows.
 * Pure functions, trivially testable.
 */
import { formatShowDate } from '@/components';
import type { LadderRow } from '@/lib/hooks';

export interface PodiumShow {
  rank: number;
  artist: string;
  venue: string;
  date: string; // "Jun '26"
}

export interface RecapStats {
  totalShows: number;
  venueCount: number;
  rangeLabel: string; // "Jul '25 – Jul '26"
  topThree: PodiumShow[];
  bestVenue: { name: string; visits: number } | null;
  topGenre: { name: string; pct: number } | null;
}

function artistOf(row: LadderRow): string {
  const ev = row.events;
  if (!ev) return 'Unknown';
  const headliner = [...ev.event_artists].sort((a, b) => a.billing_order - b.billing_order)[0]
    ?.artists;
  return headliner?.name ?? ev.title.split(' at ')[0] ?? ev.title;
}

export function buildRecapStats(rows: LadderRow[]): RecapStats | null {
  if (rows.length === 0) return null;

  const dates = rows
    .map((r) => r.events?.event_date)
    .filter((d): d is string => !!d)
    .sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  const rangeLabel =
    first && last
      ? first === last
        ? formatShowDate(first)
        : `${formatShowDate(first)} – ${formatShowDate(last)}`
      : '';

  // venues: count visits, remember capacity for tie-breaks
  const visits = new Map<string, { name: string; visits: number; capacity: number }>();
  for (const r of rows) {
    const v = r.events?.venues;
    if (!v) continue;
    const cur = visits.get(v.id) ?? { name: v.name, visits: 0, capacity: v.capacity ?? 0 };
    cur.visits += 1;
    visits.set(v.id, cur);
  }
  const bestVenue =
    [...visits.values()].sort((a, b) => b.visits - a.visits || b.capacity - a.capacity)[0] ?? null;

  // genres: mode of primary_genre
  const genreCounts = new Map<string, number>();
  for (const r of rows) {
    const g = r.events?.primary_genre;
    if (g) genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1);
  }
  const topGenreEntry = [...genreCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    totalShows: rows.length,
    venueCount: visits.size,
    rangeLabel,
    topThree: rows.slice(0, 3).map((r) => ({
      rank: r.rank_pos,
      artist: artistOf(r),
      venue: r.events?.venues?.name ?? '—',
      date: r.events ? formatShowDate(r.events.event_date) : '',
    })),
    bestVenue: bestVenue ? { name: bestVenue.name, visits: bestVenue.visits } : null,
    topGenre: topGenreEntry
      ? { name: topGenreEntry[0], pct: Math.round((topGenreEntry[1] / rows.length) * 100) }
      : null,
  };
}
