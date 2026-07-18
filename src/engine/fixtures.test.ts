/**
 * The two canonical fixture tests demanded by resolutions.md:
 *  (a) Fred again.. insertion on Andrew's 15-ladder → pivots 7, 3, 5, 4 → rank #6
 *  (b) tasteMatch(Maya fixture, now = 2026-07-18) === 87 pre- AND post-log
 */
import { describe, expect, it } from 'vitest';
import { finishInsertion, getNextComparison, recordChoice, startInsertion } from './ranking';
import { tierOf } from './tiers';
import { tasteMatch, tasteMatchDetail } from './tasteMatch';
import {
  ANDREW_LADDER_SHOWS,
  DEMO_NOW,
  DEMO_USER_ID,
  FRED_CHALLENGER,
  MAYA_SHARED_POST,
  MAYA_SHARED_PRE,
  andrewLadder,
} from './fixtures';
import type { ComparisonOutcome } from './types';

describe('demo fixture (a): Fred again.. @ Forest Hills', () => {
  it('Andrew’s seeded ladder auto-buckets at cuts [3,7,10,13]', () => {
    const ladder = andrewLadder();
    expect(ladder.entries).toHaveLength(15);
    expect(ladder.tierBoundaries.cuts).toEqual([3, 7, 10, 13]);
    expect(tierOf(ladder, 0)).toBe('all_timer'); // Rüfüs
    expect(tierOf(ladder, 2)).toBe('all_timer'); // Four Tet
    expect(tierOf(ladder, 14)).toBe('regret'); // Helena Hauff
  });

  it('binary search hits pivots 7→3→5→4 and lands Fred at rank #6, tier great', () => {
    const taps: ComparisonOutcome[] = ['challenger', 'opponent', 'challenger', 'opponent'];
    const expectedPivots = [7, 3, 5, 4]; // Fontaines, Bicep, Jamie xx, Lane 8
    const expectedOpponents = ['log-fontaines', 'log-bicep', 'log-jamie', 'log-lane8'];

    let session = startInsertion(DEMO_USER_ID, FRED_CHALLENGER, andrewLadder());
    const pivots: number[] = [];
    const opponents: string[] = [];
    for (const tap of taps) {
      const prompt = getNextComparison(session)!;
      pivots.push(prompt.pivotIndex);
      opponents.push(prompt.opponentId);
      session = recordChoice(session, tap);
    }

    expect(pivots).toEqual(expectedPivots);
    expect(opponents).toEqual(expectedOpponents);
    expect(session.phase).toBe('done');
    expect(getNextComparison(session)).toBeNull();

    const result = finishInsertion(session);
    expect(result.index).toBe(5); // 0-based index 5 = rank #6
    expect(result.placement).toBe('ranked');
    expect(result.ladder.entries[5]!.showId).toBe('log-fred');
    expect(result.comparisonsToAppend).toHaveLength(4);
    // exactly the tap bound for n=15: ceil(log2(16)) = 4
    expect(result.comparisonsToAppend.length).toBeLessThanOrEqual(Math.ceil(Math.log2(15 + 1)));
    // the money-shot badge: Fred debuts in tier 'great'
    expect(tierOf(result.ladder, 5)).toBe('great');
    // full post-log order stays intact below Fred
    expect(result.ladder.entries.map((e) => e.showId)).toEqual([
      'log-rufus',
      'log-anyma',
      'log-fourtet',
      'log-bicep',
      'log-lane8',
      'log-fred',
      'log-jamie',
      'log-peggy',
      'log-fontaines',
      'log-charli',
      'log-jungle',
      'log-koze',
      'log-sammy',
      'log-kaytranada',
      'log-mj',
      'log-helena',
    ]);
  });
});

describe('demo fixture (b): Maya taste match', () => {
  it('is exactly 87 pre-log (12 shared shows)', () => {
    expect(MAYA_SHARED_PRE).toHaveLength(12);
    expect(tasteMatch(MAYA_SHARED_PRE, DEMO_NOW)).toBe(87);
  });

  it('stays exactly 87 post-log (13 shared shows incl. Fred)', () => {
    expect(MAYA_SHARED_POST).toHaveLength(13);
    expect(tasteMatch(MAYA_SHARED_POST, DEMO_NOW)).toBe(87);
  });

  it('Four Tet is the strict biggest disagreement in both states', () => {
    for (const rows of [MAYA_SHARED_PRE, MAYA_SHARED_POST]) {
      const detail = tasteMatchDetail(rows, DEMO_NOW);
      expect(detail.biggestDisagreement?.eventId).toBe('evt-four-tet-k-bridge');
      const ft = detail.shared.find((s) => s.eventId === 'evt-four-tet-k-bridge')!;
      for (const s of detail.shared) {
        if (s.eventId !== ft.eventId) {
          expect(Math.abs(s.delta)).toBeLessThan(Math.abs(ft.delta));
        }
      }
    }
  });

  it('Fred is a point of agreement: both rank it #6 in the shared subset', () => {
    const detail = tasteMatchDetail(MAYA_SHARED_POST, DEMO_NOW);
    const fred = detail.shared.find((s) => s.eventId === FRED_CHALLENGER.eventId)!;
    expect(fred.subsetRankA).toBe(6);
    expect(fred.subsetRankB).toBe(6);
    expect(fred.delta).toBe(0);
  });

  it('the fixture ladder covers all 15 §4.1 shows in order', () => {
    expect(ANDREW_LADDER_SHOWS.map((s) => s.artist)).toEqual([
      'Rüfüs Du Sol',
      'Anyma',
      'Four Tet',
      'Bicep (CHROMA AV)',
      'Lane 8',
      'Jamie xx',
      'Peggy Gou',
      'Fontaines D.C.',
      'Charli XCX',
      'Jungle',
      'DJ Koze',
      'Sammy Virji',
      'Kaytranada',
      'MJ Lenderman',
      'Helena Hauff',
    ]);
  });
});
