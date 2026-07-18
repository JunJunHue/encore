/**
 * LadderRow (schema shape from @/lib/hooks) ⇄ engine vocabulary (Ladder /
 * LadderEntry from @/engine/ranking). The rank feature is the only consumer.
 */
import { eventToShowCardData, type ShowCardData } from '@/components';
import type { EventJoin, LadderRow } from '@/lib/hooks';
import type { Ladder, LadderEntry, TierBoundaries } from '@/engine/ranking';

/**
 * Quantile default cuts (engine spec small-n rule). Only used to hand the
 * engine a well-formed Ladder — finishInsertion rebuckets anyway and tier
 * labels are never shown mid-flow.
 */
export function defaultBoundaries(n: number): TierBoundaries {
  const cut = (f: number) => Math.min(n, Math.ceil(n * f));
  return { cuts: [cut(0.1), cut(0.35), cut(0.7), cut(0.9)], mode: 'auto' };
}

function eventMeta(event: EventJoin | null): {
  genre: string[];
  capacityTier: LadderEntry['capacityTier'];
  year: number;
  city: string;
} {
  const headliner = event
    ? [...event.event_artists].sort((a, b) => a.billing_order - b.billing_order)[0]?.artists
    : undefined;
  const genre = [
    ...new Set(
      [event?.primary_genre, ...(headliner?.genres ?? [])].filter(
        (g): g is string => typeof g === 'string' && g.length > 0,
      ),
    ),
  ];
  return {
    genre,
    capacityTier: event?.venues?.capacity_tier ?? 'club',
    year: Number(event?.event_date.slice(0, 4)) || new Date().getFullYear(),
    city: 'New York',
  };
}

export function rowToEntry(row: LadderRow): LadderEntry {
  const meta = eventMeta(row.events);
  return {
    showId: row.id,
    eventId: row.event_id,
    score: row.latent_score,
    placement: 'ranked',
    genre: meta.genre,
    capacityTier: meta.capacityTier,
    year: meta.year,
    city: meta.city,
  };
}

export function rowsToLadder(rows: LadderRow[]): Ladder {
  const ordered = [...rows].sort((a, b) => a.rank_pos - b.rank_pos);
  return { entries: ordered.map(rowToEntry), tierBoundaries: defaultBoundaries(ordered.length) };
}

export function eventToChallenger(
  showId: string,
  event: EventJoin,
): Omit<LadderEntry, 'score' | 'placement'> {
  const meta = eventMeta(event);
  return {
    showId,
    eventId: event.id,
    genre: meta.genre,
    capacityTier: meta.capacityTier,
    year: meta.year,
    city: meta.city,
  };
}

/**
 * Post-insert engine ladder → optimistic LadderRow[] for the Query cache.
 * Existing rows keep their identity (real set_log ids); the challenger gets a
 * synthetic row under its client-minted id until the RPC lands and the ladder
 * query is invalidated.
 */
export function ladderToRows(
  entries: LadderEntry[],
  previous: Map<string, LadderRow>,
  synth: { id: string; userId: string; event: EventJoin },
): LadderRow[] {
  const now = new Date().toISOString();
  return entries.map((entry, i) => {
    const existing = previous.get(entry.showId);
    if (existing) return { ...existing, rank_pos: i + 1, latent_score: entry.score };
    return {
      id: synth.id,
      user_id: synth.userId,
      event_id: synth.event.id,
      latent_score: entry.score,
      rank_pos: i + 1,
      note: null,
      moment: null,
      crew: [],
      created_at: now,
      updated_at: now,
      events: synth.event,
    };
  });
}

export function rowToCardData(row: LadderRow): ShowCardData {
  if (row.events) return eventToShowCardData(row.events);
  return {
    artist: 'Unknown show',
    venue: '—',
    capacityTier: null,
    date: row.created_at.slice(0, 10),
  };
}

export function mapById(rows: LadderRow[]): Map<string, LadderRow> {
  return new Map(rows.map((r) => [r.id, r]));
}
