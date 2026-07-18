/** Shared helpers for the engine test suites (not part of the public API). */
import type { Comparison, Ladder, LadderEntry } from './types';
import { autoBucket } from './tiers';

export function entry(id: string, score: number, over: Partial<LadderEntry> = {}): LadderEntry {
  return {
    showId: id,
    eventId: `evt-${id}`,
    score,
    placement: 'ranked',
    genre: ['electronic'],
    capacityTier: 'club',
    year: 2025,
    city: 'NYC',
    ...over,
  };
}

/** Build an auto-bucketed ladder from descending scores. */
export function ladderOf(scores: number[], prefix = 's'): Ladder {
  const entries = scores.map((score, i) => entry(`${prefix}${i}`, score));
  return autoBucket({ entries, tierBoundaries: { cuts: [0, 0, 0, 0], mode: 'auto' } });
}

/** Deterministic PRNG so property tests never flake. */
export function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Remap createdAt to strictly increasing timestamps, preserving order. */
export function sequenceTimestamps(
  log: Comparison[],
  startMs = Date.UTC(2026, 0, 1),
): Comparison[] {
  return log.map((c, i) => ({ ...c, createdAt: new Date(startMs + i * 1000).toISOString() }));
}

export function shuffled<T>(arr: readonly T[], rnd: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}
