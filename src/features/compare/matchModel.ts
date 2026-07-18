/**
 * Compare feature model — adapts shared_shows RPC rows into the engine's
 * taste-match input and builds the head-to-head list.
 *
 * Engine seam (W1): tasteMatch / tasteMatchDetail / MIN_OVERLAP from
 * '@/engine/tasteMatch' — canonical formula per resolutions.md (weighted
 * Spearman on the shared subset, subset re-ranking internal, 18-month
 * half-life, null under the 5-show overlap floor). `now` is always injected.
 */
import { tasteMatch, tasteMatchDetail, MIN_OVERLAP, type SharedShow } from '@/engine/tasteMatch';
import type { SharedShowRow } from '@/lib/hooks';

export { MIN_OVERLAP };

/** a = me (I always call shared_shows with user_a = my id), b = the friend. */
export function toSharedShows(rows: SharedShowRow[]): SharedShow[] {
  return rows.map((r) => ({
    eventId: r.event_id,
    eventDate: r.event_date,
    rankA: r.a_rank,
    rankB: r.b_rank,
  }));
}

export function matchPct(rows: SharedShowRow[], now: Date): number | null {
  return tasteMatch(toSharedShows(rows), now);
}

// ---------- head-to-head ----------

export interface HeadToHeadItem {
  eventId: string;
  title: string;
  artist: string;
  venueName: string;
  eventDate: string;
  /** full-ladder positions (displayed — "You: #3 · Maya: #21") */
  myRank: number;
  theirRank: number;
  /** subset re-ranked 1..n positions (engine-computed; drives the sort) */
  mySubsetRank: number;
  theirSubsetRank: number;
  /** |subset delta| — disagreement magnitude (resolutions.md) */
  delta: number;
}

/** Event titles are composed as "Artist at Venue" by the seed pipeline. */
export function artistFromTitle(title: string): string {
  const head = title.split(' at ')[0];
  return head && head.length > 0 ? head : title;
}

/**
 * Engine subset re-rank joined back onto the RPC rows, sorted by disagreement
 * (|subset delta| desc, agreements last). Item 0 is the highlight candidate.
 */
export function buildHeadToHead(rows: SharedShowRow[], now: Date): HeadToHeadItem[] {
  const detail = tasteMatchDetail(toSharedShows(rows), now);
  const rowById = new Map(rows.map((r) => [r.event_id, r]));
  return detail.shared
    .flatMap((d) => {
      const row = rowById.get(d.eventId);
      if (!row) return [];
      return [
        {
          eventId: d.eventId,
          title: row.title,
          artist: artistFromTitle(row.title),
          venueName: row.venue_name,
          eventDate: row.event_date,
          myRank: row.a_rank,
          theirRank: row.b_rank,
          mySubsetRank: d.subsetRankA,
          theirSubsetRank: d.subsetRankB,
          delta: Math.abs(d.delta),
        },
      ];
    })
    .sort((x, y) => y.delta - x.delta || x.myRank - y.myRank);
}

/** First name only — "Maya R." → "Maya" (compact rank labels). */
export function firstName(displayName: string): string {
  const head = displayName.trim().split(/\s+/)[0];
  return head && head.length > 0 ? head : displayName;
}
