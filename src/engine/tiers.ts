/**
 * Tier auto-bucketing over index cuts (design-engine.md §3, resolutions.md).
 *
 * cuts are INDEX positions, not score cutoffs: cuts[i] = first index of tier
 * i+1. Auto mode places cuts at the 4 largest adjacent score gaps (n >= 10,
 * each tier >= ceil(n/20) entries) or fixed quantiles (n < 10).
 */
import type { Ladder, Tier } from './types';

/** Normalize any 4 candidate cuts into a sorted, clamped tuple. */
export function clampCuts(cuts: readonly number[], n: number): [number, number, number, number] {
  const c = [...cuts];
  while (c.length < 4) c.push(c.length > 0 ? c[c.length - 1]! : 0);
  const sorted = c
    .slice(0, 4)
    .map((x) => Math.max(0, Math.min(n, Math.round(x))))
    .sort((a, b) => a - b);
  return [sorted[0]!, sorted[1]!, sorted[2]!, sorted[3]!];
}

const QUANTILES = [0.1, 0.35, 0.7, 0.9] as const;

/** Recompute cuts from score gaps; returns a ladder in 'auto' mode. */
export function autoBucket(ladder: Ladder): Ladder {
  const { entries } = ladder;
  const n = entries.length;

  let cuts: number[];
  if (n < 10) {
    // fixed quantile cuts at ranks ceil(n·[0.1, 0.35, 0.7, 0.9])
    cuts = QUANTILES.map((q) => Math.ceil(n * q));
  } else {
    const minTier = Math.ceil(n / 20);
    // candidate cut c sits between entries[c-1] and entries[c]
    const gaps: { cut: number; gap: number }[] = [];
    for (let i = 0; i + 1 < n; i++) {
      gaps.push({ cut: i + 1, gap: entries[i]!.score - entries[i + 1]!.score });
    }
    gaps.sort((a, b) => b.gap - a.gap || a.cut - b.cut);

    const chosen: number[] = [];
    for (const g of gaps) {
      if (chosen.length === 4) break;
      if (g.cut < minTier || g.cut > n - minTier) continue;
      if (chosen.some((c) => Math.abs(c - g.cut) < minTier)) continue;
      chosen.push(g.cut);
    }
    // degenerate ladders (all gaps colliding): fall back to quantiles
    for (const q of QUANTILES) {
      if (chosen.length === 4) break;
      const cut = Math.max(1, Math.min(n - 1, Math.ceil(n * q)));
      if (!chosen.includes(cut)) chosen.push(cut);
    }
    cuts = chosen;
  }

  return { entries, tierBoundaries: { cuts: clampCuts(cuts, n), mode: 'auto' } };
}

/** Move one boundary; clamps to its neighbors and switches to manual mode. */
export function dragBoundary(ladder: Ladder, boundary: 0 | 1 | 2 | 3, newCut: number): Ladder {
  const n = ladder.entries.length;
  const cuts = ladder.tierBoundaries.cuts;
  const prev = boundary === 0 ? 0 : cuts[boundary - 1]!;
  const next = boundary === 3 ? n : cuts[boundary + 1]!;
  const clamped = Math.max(prev, Math.min(next, Math.round(newCut)));
  const nextCuts: [number, number, number, number] = [...cuts];
  nextCuts[boundary] = clamped;
  return { entries: ladder.entries, tierBoundaries: { cuts: nextCuts, mode: 'manual' } };
}

export function tierOf(ladder: Ladder, index: number): Tier {
  const [c0, c1, c2, c3] = ladder.tierBoundaries.cuts;
  if (index < c0) return 'all_timer';
  if (index < c1) return 'great';
  if (index < c2) return 'good';
  if (index < c3) return 'fine';
  return 'regret';
}
