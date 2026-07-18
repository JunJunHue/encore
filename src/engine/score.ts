/**
 * Internal score math: logistic Elo on a Bradley–Terry model + the monotonic
 * repair sweep (design-engine.md §3). Not exported from the barrel — order is
 * the source of truth; these scores are derived decoration.
 */
import { BASELINE_SCORE, EPSILON, K_AUDIT, K_INSERTION, SPACING } from './types';
import type { Comparison, Ladder, LadderEntry, ShowId } from './types';
import { autoBucket } from './tiers';

/** P(a beats b) under the logistic Bradley–Terry model. */
export function expectedWinProb(sa: number, sb: number): number {
  return 1 / (1 + Math.pow(10, (sb - sa) / 400));
}

/** Initial score for a challenger landing at `index` of the PRE-insert entries. */
export function initialScoreAt(entries: readonly LadderEntry[], index: number): number {
  if (entries.length === 0) return BASELINE_SCORE;
  if (index <= 0) return entries[0]!.score + SPACING;
  if (index >= entries.length) return entries[entries.length - 1]!.score - SPACING;
  return (entries[index - 1]!.score + entries[index]!.score) / 2;
}

/**
 * Apply zero-sum Elo updates for a session's comparisons, in order.
 * `too_different` rows are logged-only and never scored. Mutates `entries`.
 */
export function applyEloForSession(
  entries: LadderEntry[],
  challengerId: ShowId,
  comparisons: readonly Comparison[],
): void {
  const a = entries.find((e) => e.showId === challengerId);
  if (!a) return;
  for (const c of comparisons) {
    if (c.outcome === 'too_different') continue;
    const b = entries.find((e) => e.showId === c.opponentId);
    if (!b || b === a) continue; // dangling opponent — replay ignores
    const k = c.kind === 'audit' ? K_AUDIT : K_INSERTION;
    const result = c.outcome === 'challenger' ? 1 : 0;
    const delta = k * (result - expectedWinProb(a.score, b.score));
    a.score += delta;
    b.score -= delta;
  }
}

/**
 * Monotonic repair, top→bottom: order wins on conflict. Any adjacent pair
 * whose gap is <= EPSILON gets the lower entry pushed to upper − SPACING.
 * Doubles as spacing enforcement. Mutates `entries`.
 */
export function repairSweep(entries: LadderEntry[]): void {
  for (let j = 0; j + 1 < entries.length; j++) {
    const upper = entries[j]!;
    const lower = entries[j + 1]!;
    if (upper.score <= lower.score + EPSILON) {
      lower.score = upper.score - SPACING;
    }
  }
}

/**
 * Apply a scored audit outcome (never 'too_different'): swap the pair when the
 * lower-ranked show won, Elo-update at K_AUDIT, repair, rebucket if auto.
 * Pure — returns a new ladder. Unknown ids are ignored (replay safety).
 */
export function applyAuditOutcome(
  ladder: Ladder,
  aId: ShowId,
  bId: ShowId,
  outcome: 'challenger' | 'opponent',
): Ladder {
  const entries = ladder.entries.map((e) => ({ ...e }));
  const ia = entries.findIndex((e) => e.showId === aId);
  const ib = entries.findIndex((e) => e.showId === bId);
  if (ia < 0 || ib < 0 || ia === ib) return ladder;

  const a = entries[ia]!;
  const b = entries[ib]!;
  const winnerIdx = outcome === 'challenger' ? ia : ib;
  const loserIdx = outcome === 'challenger' ? ib : ia;
  if (winnerIdx > loserIdx) {
    // upset: winner was ranked below loser — swap the two entries
    const tmp = entries[winnerIdx]!;
    entries[winnerIdx] = entries[loserIdx]!;
    entries[loserIdx] = tmp;
  }

  const result = outcome === 'challenger' ? 1 : 0;
  const delta = K_AUDIT * (result - expectedWinProb(a.score, b.score));
  a.score += delta;
  b.score -= delta;

  repairSweep(entries);
  const next: Ladder = { entries, tierBoundaries: ladder.tierBoundaries };
  return next.tierBoundaries.mode === 'auto' ? autoBucket(next) : next;
}
