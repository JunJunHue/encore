/**
 * Binary-search insertion engine (design-engine.md §§1–2, canonical per
 * resolutions.md). Order-is-truth: the index the user's taps produce is final;
 * Elo scores are derived decoration with a monotonic repair pass.
 *
 * All state is immutable — every function returns new objects; sessions are
 * plain serializable values.
 *
 * Small ladders (n < 10) use the same mechanics: the spec's tier-spread pivot
 * preference collapses to the standard midpoint sequence (design-engine.md §2,
 * "net effect: identical mechanics"), so no special-case code exists.
 */
import {
  DuplicateShowError,
  emptyLadder,
  type ChallengerInput,
  type Comparison,
  type ComparisonKind,
  type ComparisonOutcome,
  type ComparisonPrompt,
  type InsertionResult,
  type InsertionSession,
  type Ladder,
  type LadderEntry,
  type Placement,
  type SessionKind,
  type ShowId,
  type TierBoundaries,
} from './types';
import { autoBucket, clampCuts } from './tiers';
import { applyAuditOutcome, applyEloForSession, initialScoreAt, repairSweep } from './score';

// Convenience re-exports so consumers importing from '@/engine/ranking' get the
// full session vocabulary without reaching into './types'.
export { DuplicateShowError, emptyLadder } from './types';
export type {
  ChallengerInput,
  Comparison,
  ComparisonKind,
  ComparisonOutcome,
  ComparisonPrompt,
  InsertionResult,
  InsertionSession,
  Ladder,
  LadderEntry,
  Placement,
  ScoreUpdate,
  SessionKind,
  ShowId,
  Tier,
  TierBoundaries,
} from './types';

// ---------- ids ----------

function newId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  // fallback v4 (non-crypto envs)
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += '-';
    else if (i === 14) out += '4';
    else if (i === 19) out += hex[8 + Math.floor(Math.random() * 4)];
    else out += hex[Math.floor(Math.random() * 16)];
  }
  return out;
}

// ---------- pivot selection ----------

function isEligiblePivot(s: InsertionSession, index: number): boolean {
  const e = s.ladder.entries[index];
  if (!e) return false;
  if (s.skipped.includes(e.showId)) return false;
  // never compare a show to itself / another night of the same event
  if (e.eventId === s.challenger.eventId) return false;
  return true;
}

/**
 * Midpoint of [lo, hi) not yet skipped; prefers floor((lo+hi)/2), then
 * alternates outward mid+1, mid−1, mid+2, … within the window.
 */
function selectPivot(s: InsertionSession): number | null {
  if (s.lo >= s.hi) return null;
  const mid = Math.floor((s.lo + s.hi) / 2);
  if (isEligiblePivot(s, mid)) return mid;
  for (let d = 1; ; d++) {
    const up = mid + d;
    const down = mid - d;
    const upIn = up < s.hi;
    const downIn = down >= s.lo;
    if (!upIn && !downIn) return null;
    if (upIn && isEligiblePivot(s, up)) return up;
    if (downIn && isEligiblePivot(s, down)) return down;
  }
}

/** Resolve phase/finalIndex/placement after any state change. */
function settle(s: InsertionSession): InsertionSession {
  if (s.phase === 'done') return s;
  if (s.lo >= s.hi) {
    return { ...s, phase: 'done', finalIndex: s.lo, placement: 'ranked' };
  }
  if (selectPivot(s) === null) {
    // no comparable pivot left in a live window → bottom of window, provisional
    return { ...s, phase: 'done', finalIndex: s.hi, placement: 'provisional' };
  }
  return s;
}

// ---------- session API ----------

export function startInsertion(
  userId: string,
  challenger: ChallengerInput,
  ladder: Ladder,
  kind: SessionKind = 'insertion',
): InsertionSession {
  if (ladder.entries.some((e) => e.showId === challenger.showId)) {
    throw new DuplicateShowError(challenger.showId);
  }
  return settle({
    userId,
    challenger,
    ladder,
    lo: 0,
    hi: ladder.entries.length,
    skipped: [],
    comparisons: [],
    phase: 'comparing',
    kind,
    placement: 'ranked',
    finalIndex: null,
  });
}

/** null ⇒ phase 'done'; call finishInsertion. */
export function getNextComparison(s: InsertionSession): ComparisonPrompt | null {
  if (s.phase === 'done') return null;
  const pivotIndex = selectPivot(s);
  if (pivotIndex === null) return null;
  const opponent = s.ladder.entries[pivotIndex]!;
  return {
    challengerId: s.challenger.showId,
    opponentId: opponent.showId,
    pivotIndex,
    progress: {
      done: s.comparisons.length,
      expectedMax: Math.ceil(Math.log2(s.ladder.entries.length + 1)),
    },
  };
}

/** Pure: returns the advanced session. */
export function recordChoice(s: InsertionSession, outcome: ComparisonOutcome): InsertionSession {
  if (s.phase === 'done') throw new Error('session already complete');
  const pivotIndex = selectPivot(s);
  if (pivotIndex === null) throw new Error('no pivot available'); // unreachable after settle
  const opponent = s.ladder.entries[pivotIndex]!;

  const row: Comparison = {
    id: newId(),
    userId: s.userId,
    challengerId: s.challenger.showId,
    opponentId: opponent.showId,
    outcome,
    kind: s.kind,
    createdAt: new Date().toISOString(),
  };

  let next: InsertionSession = { ...s, comparisons: [...s.comparisons, row] };
  if (outcome === 'challenger') {
    next = { ...next, hi: pivotIndex }; // challenger better ⇒ search upper half
  } else if (outcome === 'opponent') {
    next = { ...next, lo: pivotIndex + 1 };
  } else {
    next = { ...next, skipped: [...next.skipped, opponent.showId] }; // window unchanged
  }
  return settle(next);
}

// ---------- placement (shared by live finish + replay) ----------

function placeChallenger(
  ladder: Ladder,
  challenger: ChallengerInput,
  index: number,
  placement: Placement,
  comparisons: readonly Comparison[],
): Ladder {
  const entries: LadderEntry[] = ladder.entries.map((e) => ({ ...e }));
  const score = initialScoreAt(entries, index);
  entries.splice(index, 0, { ...challenger, genre: [...challenger.genre], score, placement });

  // provisional landings had no scored comparison; too_different is never scored anyway
  applyEloForSession(entries, challenger.showId, comparisons);
  repairSweep(entries);

  const tb = ladder.tierBoundaries;
  if (tb.mode === 'manual') {
    const cuts = tb.cuts.map((c) => (c >= index ? c + 1 : c));
    return { entries, tierBoundaries: { cuts: clampCuts(cuts, entries.length), mode: 'manual' } };
  }
  return autoBucket({ entries, tierBoundaries: tb });
}

export function finishInsertion(s: InsertionSession): InsertionResult {
  if (s.phase !== 'done' || s.finalIndex === null) throw new Error('session not complete');
  const before = s.ladder;
  const ladder = placeChallenger(before, s.challenger, s.finalIndex, s.placement, s.comparisons);

  const oldScores = new Map(before.entries.map((e) => [e.showId, e.score]));
  const scoreUpdates = ladder.entries
    .filter((e) => e.showId !== s.challenger.showId && oldScores.get(e.showId) !== e.score)
    .map((e) => ({ showId: e.showId, score: e.score }));

  return {
    index: s.finalIndex,
    placement: s.placement,
    ladder,
    comparisonsToAppend: s.comparisons,
    scoreUpdates,
  };
}

// ---------- maintenance ----------

/** Splice an entry out; scores untouched; auto tiers rebucket, manual cuts shift −1. */
export function removeShow(ladder: Ladder, showId: ShowId): Ladder {
  const index = ladder.entries.findIndex((e) => e.showId === showId);
  if (index < 0) return ladder;
  const entries = ladder.entries.filter((e) => e.showId !== showId);
  const tb = ladder.tierBoundaries;
  if (tb.mode === 'manual') {
    const cuts = tb.cuts.map((c) => (c > index ? c - 1 : c));
    return { entries, tierBoundaries: { cuts: clampCuts(cuts, entries.length), mode: 'manual' } };
  }
  return autoBucket({ entries, tierBoundaries: tb });
}

/** removeShow + startInsertion of the same entry; old log rows stay in history. */
export function startRerank(userId: string, showId: ShowId, ladder: Ladder): InsertionSession {
  const entry = ladder.entries.find((e) => e.showId === showId);
  if (!entry) throw new Error(`show ${showId} not in ladder`);
  const challenger: ChallengerInput = {
    showId: entry.showId,
    eventId: entry.eventId,
    genre: [...entry.genre],
    capacityTier: entry.capacityTier,
    year: entry.year,
    city: entry.city,
  };
  return startInsertion(userId, challenger, removeShow(ladder, showId));
}

// ---------- replay ----------

interface Episode {
  kind: ComparisonKind;
  challengerId: ShowId;
  rows: Comparison[];
}

function byCreatedAt(a: Comparison, b: Comparison): number {
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
}

/** Consecutive rows with the same challenger+kind form one insertion episode; audits are singletons. */
function splitEpisodes(sorted: readonly Comparison[]): Episode[] {
  const episodes: Episode[] = [];
  for (const row of sorted) {
    const last = episodes[episodes.length - 1];
    if (
      row.kind !== 'audit' &&
      last &&
      last.kind === row.kind &&
      last.challengerId === row.challengerId
    ) {
      last.rows.push(row);
    } else {
      episodes.push({ kind: row.kind, challengerId: row.challengerId, rows: [row] });
    }
  }
  return episodes;
}

function replayInsertion(
  ladder: Ladder,
  challenger: ChallengerInput,
  outcomes: readonly ComparisonOutcome[],
  kind: SessionKind,
  userId: string,
): Ladder {
  let s = startInsertion(userId, challenger, ladder, kind);
  for (const outcome of outcomes) {
    if (s.phase === 'done') break; // extra rows (e.g. after deletions) are ignored
    s = recordChoice(s, outcome);
  }
  if (s.phase !== 'done' || s.finalIndex === null) {
    // transcript ran short (deleted opponents shrank the ladder) — best-effort landing
    s = { ...s, phase: 'done', finalIndex: s.lo, placement: 'ranked' };
  }
  return finishInsertion(s).ladder;
}

/**
 * Deterministically rebuild a ladder from the append-only log. Comparisons are
 * sorted by createdAt (stable); each show's LATEST insertion episode wins;
 * rows referencing ids missing from `shows` are ignored (dangling ids —
 * resolutions.md schema amendment 3).
 */
export function recomputeFromLog(
  userId: string,
  shows: ChallengerInput[],
  log: Comparison[],
  boundaries?: TierBoundaries,
): Ladder {
  const showById = new Map(shows.map((sh) => [sh.showId, sh]));
  const sorted = [...log].sort(byCreatedAt);

  const everInserted = new Set<ShowId>();
  for (const row of sorted) if (row.kind !== 'audit') everInserted.add(row.challengerId);

  let ladder = emptyLadder();

  // shows with no insertion rows (the cold-start first show) land first
  for (const show of shows) {
    if (!everInserted.has(show.showId)) {
      ladder = replayInsertion(ladder, show, [], 'insertion', userId);
    }
  }

  for (const ep of splitEpisodes(sorted)) {
    if (ep.kind === 'audit') {
      const row = ep.rows[0]!;
      if (row.outcome === 'too_different') continue; // logged-only
      ladder = applyAuditOutcome(ladder, row.challengerId, row.opponentId, row.outcome);
      continue;
    }
    const challenger = showById.get(ep.challengerId);
    if (!challenger) continue; // deleted show — skip its episode entirely
    if (ladder.entries.some((e) => e.showId === challenger.showId)) {
      ladder = removeShow(ladder, challenger.showId); // re-rank: latest episode supersedes
    }
    ladder = replayInsertion(
      ladder,
      challenger,
      ep.rows.map((r) => r.outcome),
      ep.kind === 'backfill' ? 'backfill' : 'insertion',
      userId,
    );
  }

  if (boundaries) {
    return {
      entries: ladder.entries,
      tierBoundaries: {
        cuts: clampCuts(boundaries.cuts, ladder.entries.length),
        mode: boundaries.mode,
      },
    };
  }
  return ladder;
}
