import { describe, expect, it } from 'vitest';
import { dragBoundary, tierOf } from './tiers';
import { ladderOf } from './testUtils';

/** n=20 ladder with unmistakable 100-point chasms before indices 4, 8, 12, 16. */
function gappedLadder() {
  const bigBefore = new Set([4, 8, 12, 16]);
  const scores: number[] = [];
  let s = 2000;
  for (let i = 0; i < 20; i++) {
    if (i > 0) s -= bigBefore.has(i) ? 130 : 30;
    scores.push(s);
  }
  return ladderOf(scores);
}

describe('autoBucket', () => {
  it('places cuts on the 4 largest score gaps; every tier non-empty at n=20', () => {
    const ladder = gappedLadder();
    expect(ladder.tierBoundaries.cuts).toEqual([4, 8, 12, 16]);
    expect(ladder.tierBoundaries.mode).toBe('auto');
    expect(tierOf(ladder, 0)).toBe('all_timer');
    expect(tierOf(ladder, 3)).toBe('all_timer');
    expect(tierOf(ladder, 4)).toBe('great');
    expect(tierOf(ladder, 8)).toBe('good');
    expect(tierOf(ladder, 12)).toBe('fine');
    expect(tierOf(ladder, 16)).toBe('regret');
    expect(tierOf(ladder, 19)).toBe('regret');
  });

  it('enforces the minimum tier size ceil(n/20) by rejecting crowded cuts', () => {
    // n=24 → min size 2; gaps at cuts 5 and 6 collide, so 6 is skipped
    const gapAt: Record<number, number> = { 5: 200, 6: 190, 12: 180, 18: 170, 21: 160 };
    const scores: number[] = [];
    let s = 4000;
    for (let i = 0; i < 24; i++) {
      if (i > 0) s -= 30 + (gapAt[i] ?? 0);
      scores.push(s);
    }
    const ladder = ladderOf(scores);
    expect(ladder.tierBoundaries.cuts).toEqual([5, 12, 18, 21]);
  });

  it('uses fixed quantile cuts for n < 10', () => {
    const ladder = ladderOf([1700, 1650, 1600, 1550, 1500]);
    // ceil(5·[0.1, 0.35, 0.7, 0.9]) = [1, 2, 4, 5]
    expect(ladder.tierBoundaries.cuts).toEqual([1, 2, 4, 5]);
    expect(tierOf(ladder, 0)).toBe('all_timer');
    expect(tierOf(ladder, 1)).toBe('great');
    expect(tierOf(ladder, 4)).toBe('fine');
  });
});

describe('dragBoundary', () => {
  it('clamps to neighboring cuts and switches mode to manual', () => {
    const ladder = gappedLadder(); // cuts [4, 8, 12, 16]
    const up = dragBoundary(ladder, 1, 99);
    expect(up.tierBoundaries.cuts).toEqual([4, 12, 12, 16]); // clamped to cuts[2]
    expect(up.tierBoundaries.mode).toBe('manual');

    const down = dragBoundary(ladder, 1, 2);
    expect(down.tierBoundaries.cuts).toEqual([4, 4, 12, 16]); // clamped to cuts[0]

    const edge = dragBoundary(ladder, 0, -5);
    expect(edge.tierBoundaries.cuts).toEqual([0, 8, 12, 16]);

    const bottom = dragBoundary(ladder, 3, 999);
    expect(bottom.tierBoundaries.cuts).toEqual([4, 8, 12, 20]); // clamped to n
  });

  it('does not mutate the input ladder', () => {
    const ladder = gappedLadder();
    dragBoundary(ladder, 2, 0);
    expect(ladder.tierBoundaries.cuts).toEqual([4, 8, 12, 16]);
    expect(ladder.tierBoundaries.mode).toBe('auto');
  });
});
