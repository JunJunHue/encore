import { describe, expect, it } from 'vitest';
import { applyAuditResult, selectAuditComparison } from './audit';
import type { Comparison } from './types';
import { ladderOf } from './testUtils';

const USER = 'u1';

/** gap of 18 between s2 and s3 — the only near-equal adjacent pair. */
const tight = () => ladderOf([1700, 1660, 1620, 1602, 1560]);

function row(challengerId: string, opponentId: string, createdAt: string): Comparison {
  return {
    id: `${challengerId}-${opponentId}-${createdAt}`,
    userId: USER,
    challengerId,
    opponentId,
    outcome: 'challenger',
    kind: 'insertion',
    createdAt,
  };
}

describe('selectAuditComparison', () => {
  it('returns the smallest near-equal adjacent pair', () => {
    const prompt = selectAuditComparison(tight(), []);
    expect(prompt).toEqual({ aId: 's2', bId: 's3', indexA: 2, indexB: 3, scoreGap: 18 });
  });

  it('excludes pairs compared within the last 20 log rows (either orientation)', () => {
    expect(selectAuditComparison(tight(), [row('s3', 's2', '2026-07-01T00:00:00Z')])).toBeNull();
    expect(selectAuditComparison(tight(), [row('s2', 's3', '2026-07-01T00:00:00Z')])).toBeNull();
  });

  it('re-allows a pair once its comparison falls outside the 20-row window', () => {
    const log = [row('s3', 's2', '2026-07-01T00:00:00Z')];
    for (let i = 0; i < 20; i++) {
      log.push(row('x', 'y', `2026-07-02T00:00:${String(i).padStart(2, '0')}Z`));
    }
    expect(selectAuditComparison(tight(), log)).not.toBeNull();
  });

  it('excludes provisional entries', () => {
    const ladder = tight();
    ladder.entries[3]!.placement = 'provisional';
    expect(selectAuditComparison(ladder, [])).toBeNull();
  });

  it('returns null when every gap is comfortable', () => {
    expect(selectAuditComparison(ladderOf([1700, 1650, 1600, 1550]), [])).toBeNull();
  });
});

describe('applyAuditResult', () => {
  it('swaps the adjacent pair on an upset and logs kind audit', () => {
    const ladder = tight();
    const prompt = selectAuditComparison(ladder, [])!;
    const { ladder: next, comparisonsToAppend } = applyAuditResult(
      ladder,
      prompt,
      prompt.bId,
      USER,
    );

    expect(next.entries.map((e) => e.showId)).toEqual(['s0', 's1', 's3', 's2', 's4']);
    for (let i = 0; i + 1 < next.entries.length; i++) {
      expect(next.entries[i]!.score).toBeGreaterThan(next.entries[i + 1]!.score);
    }
    expect(comparisonsToAppend).toHaveLength(1);
    expect(comparisonsToAppend[0]).toMatchObject({
      kind: 'audit',
      challengerId: 's2',
      opponentId: 's3',
      outcome: 'opponent',
    });
  });

  it('keeps the order when the higher-ranked show wins', () => {
    const ladder = tight();
    const prompt = selectAuditComparison(ladder, [])!;
    const { ladder: next, comparisonsToAppend } = applyAuditResult(
      ladder,
      prompt,
      prompt.aId,
      USER,
    );
    expect(next.entries.map((e) => e.showId)).toEqual(['s0', 's1', 's2', 's3', 's4']);
    expect(comparisonsToAppend[0]!.outcome).toBe('challenger');
  });

  it('too_different only logs — the ladder is untouched', () => {
    const ladder = tight();
    const prompt = selectAuditComparison(ladder, [])!;
    const { ladder: next, comparisonsToAppend } = applyAuditResult(
      ladder,
      prompt,
      'too_different',
      USER,
    );
    expect(next).toBe(ladder);
    expect(comparisonsToAppend[0]!.outcome).toBe('too_different');
  });

  it('rejects a winner that is not part of the prompt', () => {
    const ladder = tight();
    const prompt = selectAuditComparison(ladder, [])!;
    expect(() => applyAuditResult(ladder, prompt, 'stranger', USER)).toThrow(
      'not part of the audit',
    );
  });
});
