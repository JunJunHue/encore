/**
 * Lenses — pure filtered views over the ladder (design-engine.md §1).
 * Never mutate the ladder; global order and tier labels are preserved.
 */
import type { Ladder, LensEntry, LensFilter } from './types';
import { tierOf } from './tiers';

function matches(filter: LensFilter, entry: Ladder['entries'][number]): boolean {
  if (filter.genre !== undefined && !entry.genre.includes(filter.genre)) return false;
  if (filter.capacityTier !== undefined && entry.capacityTier !== filter.capacityTier) return false;
  if (filter.year !== undefined && entry.year !== filter.year) return false;
  if (filter.city !== undefined && entry.city !== filter.city) return false;
  return true;
}

/**
 * Filter the ladder; `globalRank` is the 1-based rank in the full ladder,
 * `lensRank` is dense 1..k within the lens, `tier` matches the global tier.
 */
export function applyLens(ladder: Ladder, filter: LensFilter): LensEntry[] {
  const out: LensEntry[] = [];
  ladder.entries.forEach((entry, index) => {
    if (!matches(filter, entry)) return;
    out.push({
      ...entry,
      genre: [...entry.genre],
      globalRank: index + 1,
      lensRank: out.length + 1,
      tier: tierOf(ladder, index),
    });
  });
  return out;
}
