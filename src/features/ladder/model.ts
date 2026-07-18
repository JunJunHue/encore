/**
 * Ladder feature model — maps DB rows (LadderRow) into the engine's Ladder
 * shape, derives lens chip options from what the user actually logged, and
 * flattens lensed entries into a tier-sectioned render list.
 *
 * Engine seam (W1, design-engine.md as amended):
 *   - autoBucket(ladder) from '@/engine/tiers'  — index-cut tier bucketing
 *   - applyLens(ladder, filter) from '@/engine/lenses' — pure lens filters
 */
import { autoBucket } from '@/engine/tiers';
import { applyLens } from '@/engine/lenses';
import type { Ladder, LadderEntry, LensEntry, LensFilter, Tier } from '@/engine/types';
import type { LadderRow } from '@/lib/hooks';
import type { CapacityTier } from '@/lib/database.types';

// ---------- DB rows → engine ladder ----------

/** Rows must already be ordered by rank_pos asc (useLadder guarantees this). */
export function toEngineLadder(rows: LadderRow[]): Ladder {
  const entries: LadderEntry[] = rows.map((r) => {
    const ev = r.events;
    const genres: string[] = [];
    if (ev?.primary_genre) genres.push(ev.primary_genre);
    for (const ea of ev?.event_artists ?? []) {
      for (const g of ea.artists?.genres ?? []) {
        if (!genres.includes(g)) genres.push(g);
      }
    }
    return {
      showId: r.id,
      eventId: r.event_id,
      score: r.latent_score,
      placement: 'ranked',
      genre: genres,
      capacityTier: ev?.venues?.capacity_tier ?? 'club',
      year: Number((ev?.event_date ?? '0000').slice(0, 4)),
      city: 'NYC',
    };
  });
  // Read-only auto buckets (boundary dragging is an explicit MVP deferral).
  return autoBucket({ entries, tierBoundaries: { cuts: [0, 0, 0, 0], mode: 'auto' } });
}

// ---------- lens state & options ----------

export interface LensState {
  genre: string | null;
  year: number | null;
  capacityTier: CapacityTier | null;
}

export const EMPTY_LENS: LensState = { genre: null, year: null, capacityTier: null };

export function hasActiveLens(lens: LensState): boolean {
  return lens.genre !== null || lens.year !== null || lens.capacityTier !== null;
}

export function toLensFilter(lens: LensState): LensFilter {
  const f: LensFilter = {};
  if (lens.genre) f.genre = lens.genre;
  if (lens.year !== null) f.year = lens.year;
  if (lens.capacityTier) f.capacityTier = lens.capacityTier;
  // city lens intentionally omitted — NYC-only seed (resolutions.md deferral).
  return f;
}

export interface LensOptions {
  genres: string[];
  years: number[];
  capacityTiers: CapacityTier[];
}

const CAPACITY_ORDER: CapacityTier[] = ['club', 'theater', 'arena', 'stadium'];

/** Chip options derived from the ladder itself — never offer a dead filter. */
export function deriveLensOptions(rows: LadderRow[]): LensOptions {
  const genres = new Set<string>();
  const years = new Set<number>();
  const tiers = new Set<CapacityTier>();
  for (const r of rows) {
    const ev = r.events;
    if (ev?.primary_genre) genres.add(ev.primary_genre);
    if (ev?.event_date) years.add(Number(ev.event_date.slice(0, 4)));
    if (ev?.venues?.capacity_tier) tiers.add(ev.venues.capacity_tier);
  }
  return {
    genres: [...genres].sort(),
    years: [...years].sort((a, b) => b - a),
    capacityTiers: CAPACITY_ORDER.filter((t) => tiers.has(t)),
  };
}

// ---------- lensed entries → tier-sectioned flat list ----------

export type LadderListItem =
  | { kind: 'header'; key: string; tier: Tier; count: number }
  | { kind: 'row'; key: string; entry: LensEntry; row: LadderRow };

export function buildLadderItems(
  ladder: Ladder,
  lens: LensState,
  rowById: Map<string, LadderRow>,
): LadderListItem[] {
  const entries = applyLens(ladder, toLensFilter(lens));
  const counts = new Map<Tier, number>();
  for (const e of entries) counts.set(e.tier, (counts.get(e.tier) ?? 0) + 1);

  const items: LadderListItem[] = [];
  let currentTier: Tier | null = null;
  for (const e of entries) {
    if (e.tier !== currentTier) {
      currentTier = e.tier;
      items.push({
        kind: 'header',
        key: `header-${e.tier}`,
        tier: e.tier,
        count: counts.get(e.tier) ?? 0,
      });
    }
    const row = rowById.get(e.showId);
    if (row) items.push({ kind: 'row', key: e.showId, entry: e, row });
  }
  return items;
}
