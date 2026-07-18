import { describe, expect, it } from 'vitest';
import {
  HALF_LIFE_MONTHS,
  MIN_OVERLAP,
  recencyWeight,
  tasteMatch,
  tasteMatchDetail,
  type SharedShow,
} from './tasteMatch';

const NOW = new Date('2026-07-18T00:00:00Z');

function shared(rankA: number, rankB: number, eventDate = '2026-05-01'): SharedShow {
  return { eventId: `evt-${rankA}-${rankB}`, eventDate, rankA, rankB };
}

describe('tasteMatch', () => {
  it('returns null below the overlap floor of 5', () => {
    const four = [shared(1, 1), shared(2, 2), shared(3, 3), shared(4, 4)];
    expect(tasteMatch(four, NOW)).toBeNull();
    const detail = tasteMatchDetail(four, NOW);
    expect(detail.pct).toBeNull();
    expect(detail.overlap).toBe(4);
    expect(MIN_OVERLAP).toBe(5);
  });

  it('perfect agreement → 100, perfect inversion → 0 (clamped)', () => {
    const agree = [1, 2, 3, 4, 5, 6].map((r) => shared(r, r));
    expect(tasteMatch(agree, NOW)).toBe(100);
    const invert = [1, 2, 3, 4, 5, 6].map((r) => shared(r, 7 - r));
    expect(tasteMatch(invert, NOW)).toBe(0);
  });

  it('re-ranks both sides over the subset: full-ladder magnitudes are irrelevant', () => {
    // same relative order, wildly different full-ladder positions
    const dense = [shared(1, 1), shared(2, 2), shared(3, 3), shared(4, 4), shared(5, 5)];
    const sparse = [shared(2, 1), shared(9, 30), shared(40, 31), shared(41, 32), shared(55, 40)];
    expect(tasteMatch(dense, NOW)).toBe(100);
    expect(tasteMatch(sparse, NOW)).toBe(100);

    const scrambledDense = [shared(1, 2), shared(2, 1), shared(3, 5), shared(4, 4), shared(5, 3)];
    const scrambledSparse = [
      shared(10, 21),
      shared(20, 14),
      shared(30, 55),
      shared(40, 44),
      shared(50, 33),
    ];
    expect(tasteMatch(scrambledSparse, NOW)).toBe(tasteMatch(scrambledDense, NOW));
  });

  it('flags the largest |subset-rank delta| as the biggest disagreement', () => {
    const detail = tasteMatchDetail(
      [shared(1, 1), shared(2, 5), shared(3, 2), shared(4, 3), shared(5, 4)],
      NOW,
    );
    expect(detail.biggestDisagreement?.eventId).toBe('evt-2-5');
    expect(detail.biggestDisagreement?.delta).toBe(-3);
  });

  it('recency weight halves at exactly 18 months', () => {
    const halfLifeAgo = new Date(NOW.getTime() - HALF_LIFE_MONTHS * 30.44 * 864e5);
    expect(recencyWeight(halfLifeAgo.toISOString(), NOW)).toBeCloseTo(0.5, 10);
    expect(recencyWeight(NOW.toISOString(), NOW)).toBe(1);
    // future dates clamp to weight 1
    expect(recencyWeight('2027-01-01', NOW)).toBe(1);
  });

  it('recent disagreements weigh more than ancient ones', () => {
    const base = [
      shared(1, 1),
      shared(2, 2),
      shared(3, 3),
      shared(4, 4),
      shared(5, 5),
      shared(6, 6),
    ];
    const recentFlip = [...base];
    recentFlip[0] = shared(1, 6, '2026-07-01'); // fresh disagreement
    recentFlip[5] = shared(6, 1, '2026-07-01');
    const staleFlip = [...base];
    staleFlip[0] = shared(1, 6, '2023-01-01'); // ancient disagreement
    staleFlip[5] = shared(6, 1, '2023-01-01');
    const recentPct = tasteMatch(recentFlip, NOW)!;
    const stalePct = tasteMatch(staleFlip, NOW)!;
    expect(recentPct).toBeLessThan(stalePct);
  });

  it('is deterministic for an injected now', () => {
    const rows = [
      shared(1, 3),
      shared(2, 1),
      shared(3, 2),
      shared(4, 6),
      shared(5, 4),
      shared(6, 5),
    ];
    expect(tasteMatch(rows, NOW)).toBe(tasteMatch(rows, new Date(NOW.getTime())));
  });
});
