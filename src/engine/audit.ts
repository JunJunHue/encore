/**
 * Audit comparisons (design-engine.md §3). Kept per resolutions.md deferrals:
 * the engine ships selectAuditComparison/applyAuditResult with tests, but the
 * MVP UI never triggers them.
 */
import { AUDIT_MAX_GAP } from './types';
import type { AuditPrompt, Comparison, Ladder, ShowId } from './types';
import { applyAuditOutcome } from './score';

const RECENT_WINDOW = 20;

function pairKey(a: ShowId, b: ShowId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Smallest-gap adjacent pair with scoreGap < AUDIT_MAX_GAP, no comparison
 * between the pair within the last 20 log rows, and neither entry provisional.
 * Caller surfaces at most one audit per app session.
 */
export function selectAuditComparison(ladder: Ladder, recentLog: Comparison[]): AuditPrompt | null {
  const recent = [...recentLog]
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
    .slice(-RECENT_WINDOW);
  const recentPairs = new Set(recent.map((c) => pairKey(c.challengerId, c.opponentId)));

  let best: AuditPrompt | null = null;
  const { entries } = ladder;
  for (let i = 0; i + 1 < entries.length; i++) {
    const a = entries[i]!;
    const b = entries[i + 1]!;
    if (a.placement === 'provisional' || b.placement === 'provisional') continue;
    const gap = a.score - b.score;
    if (gap >= AUDIT_MAX_GAP) continue;
    if (recentPairs.has(pairKey(a.showId, b.showId))) continue;
    if (!best || gap < best.scoreGap) {
      best = { aId: a.showId, bId: b.showId, indexA: i, indexB: i + 1, scoreGap: gap };
    }
  }
  return best;
}

function newId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `audit-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

/**
 * Apply the user's audit verdict. An upset (lower-ranked show wins) swaps the
 * two adjacent entries, then Elo-updates at K=24 + repair. 'too_different'
 * only logs.
 */
export function applyAuditResult(
  ladder: Ladder,
  prompt: AuditPrompt,
  winner: ShowId | 'too_different',
  userId: string,
): { ladder: Ladder; comparisonsToAppend: Comparison[] } {
  if (winner !== 'too_different' && winner !== prompt.aId && winner !== prompt.bId) {
    throw new Error(`winner ${winner} is not part of the audit prompt`);
  }
  const outcome =
    winner === 'too_different'
      ? 'too_different'
      : winner === prompt.aId
        ? 'challenger'
        : 'opponent';

  const row: Comparison = {
    id: newId(),
    userId,
    challengerId: prompt.aId,
    opponentId: prompt.bId,
    outcome,
    kind: 'audit',
    createdAt: new Date().toISOString(),
  };

  if (outcome === 'too_different') {
    return { ladder, comparisonsToAppend: [row] };
  }
  return {
    ladder: applyAuditOutcome(ladder, prompt.aId, prompt.bId, outcome),
    comparisonsToAppend: [row],
  };
}
