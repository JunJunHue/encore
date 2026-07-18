import { describe, expect, it } from 'vitest';
import {
  finishInsertion,
  getNextComparison,
  recomputeFromLog,
  recordChoice,
  removeShow,
  startInsertion,
  startRerank,
} from './ranking';
import {
  BASELINE_SCORE,
  DuplicateShowError,
  SPACING,
  emptyLadder,
  type ChallengerInput,
  type Comparison,
  type ComparisonOutcome,
  type InsertionSession,
  type Ladder,
} from './types';
import { ladderOf, mulberry32, sequenceTimestamps, shuffled } from './testUtils';

const USER = 'u1';

function challenger(id: string, over: Partial<ChallengerInput> = {}): ChallengerInput {
  return {
    showId: id,
    eventId: `evt-${id}`,
    genre: ['electronic'],
    capacityTier: 'club',
    year: 2025,
    city: 'NYC',
    ...over,
  };
}

/** Drive a session with a scripted/random outcome source until done. */
function drive(s: InsertionSession, next: () => ComparisonOutcome): InsertionSession {
  while (s.phase !== 'done') {
    s = recordChoice(s, next());
  }
  return s;
}

function assertMonotonic(ladder: Ladder): void {
  for (let i = 0; i + 1 < ladder.entries.length; i++) {
    expect(ladder.entries[i]!.score).toBeGreaterThan(ladder.entries[i + 1]!.score + SPACING / 2);
  }
}

describe('cold start', () => {
  it('insert into empty ladder → index 0, score 1500, zero comparisons', () => {
    const s = startInsertion(USER, challenger('a'), emptyLadder());
    expect(s.phase).toBe('done');
    expect(getNextComparison(s)).toBeNull();
    const res = finishInsertion(s);
    expect(res.index).toBe(0);
    expect(res.placement).toBe('ranked');
    expect(res.ladder.entries[0]!.score).toBe(BASELINE_SCORE);
    expect(res.comparisonsToAppend).toHaveLength(0);
    expect(res.scoreUpdates).toHaveLength(0);
  });

  it('insert into n=1: win → index 0; loss → index 1; exactly 1 comparison logged', () => {
    const base = ladderOf([1500]);

    let s = startInsertion(USER, challenger('win'), base);
    const prompt = getNextComparison(s);
    expect(prompt?.pivotIndex).toBe(0);
    expect(prompt?.opponentId).toBe('s0');
    s = recordChoice(s, 'challenger');
    const win = finishInsertion(s);
    expect(win.index).toBe(0);
    expect(win.comparisonsToAppend).toHaveLength(1);
    expect(win.ladder.entries.map((e) => e.showId)).toEqual(['win', 's0']);
    expect(win.ladder.entries[0]!.score).toBeGreaterThan(win.ladder.entries[1]!.score);

    let s2 = startInsertion(USER, challenger('lose'), base);
    s2 = recordChoice(s2, 'opponent');
    const loss = finishInsertion(s2);
    expect(loss.index).toBe(1);
    expect(loss.comparisonsToAppend).toHaveLength(1);
    expect(loss.ladder.entries.map((e) => e.showId)).toEqual(['s0', 'lose']);
  });

  it('small ladder (n<10): first pivot is the midpoint, expectedMax = ceil(log2(n+1))', () => {
    const s = startInsertion(USER, challenger('x'), ladderOf([1700, 1650, 1600, 1550, 1500]));
    const prompt = getNextComparison(s);
    expect(prompt?.pivotIndex).toBe(2);
    expect(prompt?.progress.expectedMax).toBe(3); // ceil(log2(6))
  });
});

describe('tap bound', () => {
  it('n=300 seeded ladder: any tap sequence completes in ≤ 9 comparisons', () => {
    const scores = Array.from({ length: 300 }, (_, i) => 14000 - i * 40);
    const base = ladderOf(scores);
    const bound = Math.ceil(Math.log2(300 + 1)); // 9
    const rnd = mulberry32(42);
    for (let trial = 0; trial < 50; trial++) {
      let s = startInsertion(USER, challenger(`c${trial}`), base);
      s = drive(s, () => (rnd() < 0.5 ? 'challenger' : 'opponent'));
      expect(s.comparisons.length).toBeLessThanOrEqual(bound);
      const res = finishInsertion(s);
      expect(res.ladder.entries).toHaveLength(301);
      expect(res.index).toBeGreaterThanOrEqual(0);
      expect(res.index).toBeLessThanOrEqual(300);
    }
  });
});

describe('too_different handling', () => {
  it('skips the pivot, redraws an adjacent pivot, window unchanged, skip logged', () => {
    let s = startInsertion(USER, challenger('x'), ladderOf([1700, 1650, 1600, 1550, 1500]));
    const first = getNextComparison(s)!;
    expect(first.pivotIndex).toBe(2);

    s = recordChoice(s, 'too_different');
    expect(s.lo).toBe(0);
    expect(s.hi).toBe(5);
    expect(s.skipped).toEqual(['s2']);
    expect(s.comparisons).toHaveLength(1);
    expect(s.comparisons[0]!.outcome).toBe('too_different');

    const second = getNextComparison(s)!;
    expect(second.pivotIndex).toBe(3); // mid+1 first, then mid−1, outward
    expect(second.opponentId).toBe('s3');
  });

  it('all pivots skipped → provisional placement at window bottom; no Elo deltas applied', () => {
    const base = ladderOf([1600, 1550, 1500]);
    let s = startInsertion(USER, challenger('x'), base);
    s = drive(s, () => 'too_different');

    expect(s.comparisons).toHaveLength(3);
    expect(s.comparisons.every((c) => c.outcome === 'too_different')).toBe(true);

    const res = finishInsertion(s);
    expect(res.index).toBe(3); // bottom of the last live window [0, 3)
    expect(res.placement).toBe('provisional');
    expect(res.ladder.entries[3]!.showId).toBe('x');
    expect(res.ladder.entries[3]!.placement).toBe('provisional');
    // existing scores untouched
    expect(res.ladder.entries.slice(0, 3).map((e) => e.score)).toEqual([1600, 1550, 1500]);
    expect(res.ladder.entries[3]!.score).toBe(1500 - SPACING);
    expect(res.scoreUpdates).toHaveLength(0);
  });

  it('never offers a pivot from the challenger’s own event', () => {
    const base = ladderOf([1500]);
    base.entries[0]!.eventId = 'evt-shared';
    const s = startInsertion(USER, challenger('night2', { eventId: 'evt-shared' }), base);
    expect(s.phase).toBe('done'); // sole pivot ineligible → immediate provisional landing
    const res = finishInsertion(s);
    expect(res.placement).toBe('provisional');
    expect(res.index).toBe(1);
    expect(res.comparisonsToAppend).toHaveLength(0);
  });
});

describe('scores', () => {
  it('monotonic repair: after any insert, gaps stay > SPACING/2 (property)', () => {
    const rnd = mulberry32(7);
    let ladder = emptyLadder();
    for (let i = 0; i < 40; i++) {
      let s = startInsertion(USER, challenger(`p${i}`), ladder);
      s = drive(s, () => {
        const r = rnd();
        return r < 0.12 ? 'too_different' : r < 0.56 ? 'challenger' : 'opponent';
      });
      ladder = finishInsertion(s).ladder;
      assertMonotonic(ladder);
    }
    expect(ladder.entries).toHaveLength(40);
  });

  it('order-beats-score: Elo deltas that would invert ranks are repaired to the binary-search order', () => {
    // tight ladder: losing to B pumps B above A; winning over C pumps the
    // challenger above its own slot — order from taps must win regardless.
    const base = ladderOf([1520, 1502, 1484]); // s0, s1, s2
    let s = startInsertion(USER, challenger('ch'), base);
    s = recordChoice(s, 'opponent'); // worse than mid (s1)
    s = recordChoice(s, 'challenger'); // better than s2
    const res = finishInsertion(s);
    expect(res.index).toBe(2);
    expect(res.ladder.entries.map((e) => e.showId)).toEqual(['s0', 's1', 'ch', 's2']);
    assertMonotonic(res.ladder);
    // repair actually fired: s1's raw Elo score exceeded s0's before the sweep
    expect(res.ladder.entries[0]!.score).toBeGreaterThan(res.ladder.entries[1]!.score);
  });

  it('reports scoreUpdates only for existing entries the Elo/repair pass moved', () => {
    const base = ladderOf([1600, 1550, 1500]);
    let s = startInsertion(USER, challenger('ch'), base);
    s = drive(s, () => 'challenger'); // straight to the top
    const res = finishInsertion(s);
    expect(res.index).toBe(0);
    for (const u of res.scoreUpdates) {
      expect(u.showId).not.toBe('ch');
      const before = base.entries.find((e) => e.showId === u.showId)!;
      expect(u.score).not.toBe(before.score);
    }
  });
});

describe('backfill flow', () => {
  it('seeds 5 shows in ≤ 8 taps total, all rows kind backfill (property)', () => {
    const rnd = mulberry32(99);
    for (let trial = 0; trial < 20; trial++) {
      let ladder = emptyLadder();
      let taps = 0;
      for (let i = 0; i < 5; i++) {
        let s = startInsertion(USER, challenger(`b${trial}-${i}`), ladder, 'backfill');
        s = drive(s, () => (rnd() < 0.5 ? 'challenger' : 'opponent'));
        taps += s.comparisons.length;
        expect(s.comparisons.every((c) => c.kind === 'backfill')).toBe(true);
        ladder = finishInsertion(s).ladder;
      }
      expect(taps).toBeLessThanOrEqual(8);
      expect(ladder.entries).toHaveLength(5);
    }
  });
});

describe('replay from log', () => {
  function buildIncrementally(count: number, seed: number) {
    const rnd = mulberry32(seed);
    const shows: ChallengerInput[] = [];
    let ladder = emptyLadder();
    const log: Comparison[] = [];
    for (let i = 0; i < count; i++) {
      const ch = challenger(`sh${i}`);
      shows.push(ch);
      let s = startInsertion(USER, ch, ladder);
      s = drive(s, () => {
        const r = rnd();
        return r < 0.1 ? 'too_different' : r < 0.55 ? 'challenger' : 'opponent';
      });
      const res = finishInsertion(s);
      log.push(...res.comparisonsToAppend);
      ladder = res.ladder;
    }
    return { shows, ladder, log: sequenceTimestamps(log) };
  }

  it('recomputeFromLog reproduces identical order and scores as incremental inserts', () => {
    const { shows, ladder, log } = buildIncrementally(12, 1234);
    const rnd = mulberry32(5);
    const replayed = recomputeFromLog(USER, shuffled(shows, rnd), shuffled(log, rnd));
    expect(replayed.entries.map((e) => e.showId)).toEqual(ladder.entries.map((e) => e.showId));
    replayed.entries.forEach((e, i) => {
      expect(e.score).toBeCloseTo(ladder.entries[i]!.score, 9);
      expect(e.placement).toBe(ladder.entries[i]!.placement);
    });
    expect(replayed.tierBoundaries.cuts).toEqual(ladder.tierBoundaries.cuts);
  });

  it('ignores dangling ids: deleted shows and unknown challengers are skipped', () => {
    const { shows, log } = buildIncrementally(8, 77);
    const surviving = shows.filter((s) => s.showId !== 'sh3');
    const noise: Comparison = {
      id: 'noise',
      userId: USER,
      challengerId: 'ghost',
      opponentId: 'sh1',
      outcome: 'challenger',
      kind: 'insertion',
      createdAt: '2026-06-01T00:00:00.000Z',
    };
    const replayed = recomputeFromLog(USER, surviving, [...log, noise]);
    expect(replayed.entries).toHaveLength(7);
    expect(replayed.entries.some((e) => e.showId === 'sh3')).toBe(false);
    expect(replayed.entries.some((e) => e.showId === 'ghost')).toBe(false);
    assertMonotonic(replayed);
  });

  it('later insertion episodes supersede earlier ones (re-rank semantics)', () => {
    // sh0 first inserted at the bottom, later re-ranked to the top
    const shows = [challenger('sh0'), challenger('sh1')];
    const log: Comparison[] = sequenceTimestamps([
      // sh1 inserted against sh0 (sh1 loses → sh0 stays top)
      {
        id: '1',
        userId: USER,
        challengerId: 'sh1',
        opponentId: 'sh0',
        outcome: 'opponent',
        kind: 'insertion',
        createdAt: '',
      },
      // sh0 re-ranked: wins against sh1 → back on top (same outcome, later episode)
      {
        id: '2',
        userId: USER,
        challengerId: 'sh0',
        opponentId: 'sh1',
        outcome: 'challenger',
        kind: 'insertion',
        createdAt: '',
      },
    ]);
    const replayed = recomputeFromLog(USER, shows, log);
    expect(replayed.entries.map((e) => e.showId)).toEqual(['sh0', 'sh1']);
  });

  it('applies provided manual tier boundaries', () => {
    const { shows, log } = buildIncrementally(10, 3);
    const replayed = recomputeFromLog(USER, shows, log, { cuts: [1, 3, 5, 8], mode: 'manual' });
    expect(replayed.tierBoundaries).toEqual({ cuts: [1, 3, 5, 8], mode: 'manual' });
  });
});

describe('maintenance & errors', () => {
  it('duplicate showId throws DuplicateShowError', () => {
    const base = ladderOf([1600, 1550]);
    expect(() => startInsertion(USER, challenger('s1'), base)).toThrow(DuplicateShowError);
  });

  it('finishInsertion before done throws', () => {
    const s = startInsertion(USER, challenger('x'), ladderOf([1600, 1550]));
    expect(s.phase).toBe('comparing');
    expect(() => finishInsertion(s)).toThrow('session not complete');
  });

  it('recordChoice on a finished session throws', () => {
    const s = startInsertion(USER, challenger('x'), emptyLadder());
    expect(() => recordChoice(s, 'challenger')).toThrow('session already complete');
  });

  it('startRerank removes the show then yields a valid session', () => {
    const base = ladderOf([1700, 1650, 1600, 1550, 1500]);
    const s = startRerank(USER, 's2', base);
    expect(s.ladder.entries).toHaveLength(4);
    expect(s.ladder.entries.some((e) => e.showId === 's2')).toBe(false);
    expect(s.challenger.showId).toBe('s2');
    expect(getNextComparison(s)).not.toBeNull();
    expect(() => startRerank(USER, 'nope', base)).toThrow('not in ladder');
  });

  it('removeShow of a mid entry keeps order, leaves scores untouched, rebuckets', () => {
    const base = ladderOf([1700, 1650, 1600, 1550, 1500]);
    const next = removeShow(base, 's2');
    expect(next.entries.map((e) => e.showId)).toEqual(['s0', 's1', 's3', 's4']);
    expect(next.entries.map((e) => e.score)).toEqual([1700, 1650, 1550, 1500]);
    expect(next.tierBoundaries.mode).toBe('auto');
    expect(removeShow(base, 'ghost')).toBe(base);
  });

  it('removeShow under manual mode shifts cuts above the deletion by −1', () => {
    const base = ladderOf([1700, 1650, 1600, 1550, 1500]);
    const manual: Ladder = {
      entries: base.entries,
      tierBoundaries: { cuts: [1, 2, 3, 4], mode: 'manual' },
    };
    const next = removeShow(manual, 's1');
    expect(next.tierBoundaries).toEqual({ cuts: [1, 1, 2, 3], mode: 'manual' });
  });

  it('insert under manual mode shifts cuts ≥ insertion index by +1', () => {
    const base = ladderOf([1700, 1650, 1600, 1550]);
    const manual: Ladder = {
      entries: base.entries,
      tierBoundaries: { cuts: [1, 2, 3, 4], mode: 'manual' },
    };
    let s = startInsertion(USER, challenger('ch'), manual);
    s = drive(s, () => 'challenger'); // lands at index 0
    const res = finishInsertion(s);
    expect(res.index).toBe(0);
    expect(res.ladder.tierBoundaries).toEqual({ cuts: [2, 3, 4, 5], mode: 'manual' });
  });

  it('sessions are immutable values: recordChoice never mutates its input', () => {
    const s0 = startInsertion(USER, challenger('x'), ladderOf([1600, 1550, 1500]));
    const s1 = recordChoice(s0, 'challenger');
    expect(s0.comparisons).toHaveLength(0);
    expect(s0.lo).toBe(0);
    expect(s0.hi).toBe(3);
    expect(s1).not.toBe(s0);
    expect(s1.comparisons).toHaveLength(1);
  });
});
