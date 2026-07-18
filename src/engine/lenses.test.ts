import { describe, expect, it } from 'vitest';
import { applyLens } from './lenses';
import { tierOf } from './tiers';
import { andrewLadder } from './fixtures';

describe('applyLens', () => {
  it('filters by genre, preserving global order with a dense lensRank', () => {
    const ladder = andrewLadder();
    const house = applyLens(ladder, { genre: 'house' });
    expect(house.map((e) => e.showId)).toEqual(['log-lane8', 'log-peggy', 'log-koze', 'log-sammy']);
    expect(house.map((e) => e.globalRank)).toEqual([5, 7, 11, 12]);
    expect(house.map((e) => e.lensRank)).toEqual([1, 2, 3, 4]);
  });

  it('tier labels match the global tiers', () => {
    const ladder = andrewLadder();
    const lens = applyLens(ladder, { year: 2026 });
    for (const e of lens) {
      expect(e.tier).toBe(tierOf(ladder, e.globalRank - 1));
    }
    expect(lens.map((e) => e.showId)).toEqual([
      'log-fourtet',
      'log-peggy',
      'log-jungle',
      'log-koze',
      'log-kaytranada',
      'log-mj',
    ]);
  });

  it('filters by capacityTier and city', () => {
    const ladder = andrewLadder();
    const clubs = applyLens(ladder, { capacityTier: 'club' });
    expect(clubs.map((e) => e.showId)).toEqual(['log-koze', 'log-mj', 'log-helena']);
    expect(applyLens(ladder, { city: 'NYC' })).toHaveLength(15);
    expect(applyLens(ladder, { city: 'LA' })).toHaveLength(0);
  });

  it('combines filters and never mutates the ladder', () => {
    const ladder = andrewLadder();
    const before = ladder.entries.map((e) => e.showId);
    const lens = applyLens(ladder, { genre: 'house', capacityTier: 'theater' });
    expect(lens.map((e) => e.showId)).toEqual(['log-peggy', 'log-sammy']);
    expect(ladder.entries.map((e) => e.showId)).toEqual(before);
  });

  it('empty filter returns the whole ladder with lensRank == globalRank', () => {
    const lens = applyLens(andrewLadder(), {});
    expect(lens).toHaveLength(15);
    lens.forEach((e) => expect(e.lensRank).toBe(e.globalRank));
  });
});
