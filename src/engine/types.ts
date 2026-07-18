/**
 * Engine domain types + constants (design-engine.md §1, resolutions.md).
 * Pure TS — no React, no Supabase, no external deps.
 */

export type ShowId = string; // set_logs id (uuid)

export type Tier = 'all_timer' | 'great' | 'good' | 'fine' | 'regret';

/** provisional = landed without a single real comparison (all pivots skipped) */
export type Placement = 'ranked' | 'provisional';

export type CapacityTier = 'club' | 'theater' | 'arena' | 'stadium';

export type ComparisonOutcome = 'challenger' | 'opponent' | 'too_different';
export type ComparisonKind = 'insertion' | 'audit' | 'backfill';
export type SessionKind = 'insertion' | 'backfill';

// ---------- constants ----------

/** Score of the very first show in an empty ladder. */
export const BASELINE_SCORE = 1500;
/** Minimum Elo-point gap enforced between adjacent ladder entries. */
export const SPACING = 32;
/** Gap at or below which the monotonic repair sweep fires. */
export const EPSILON = SPACING / 2;
/** K-factor for insertion/backfill comparisons (few, high-signal). */
export const K_INSERTION = 64;
/** K-factor for audit comparisons. */
export const K_AUDIT = 24;
/** Adjacent score gap below which a pair becomes an audit candidate. */
export const AUDIT_MAX_GAP = 20;

// ---------- ladder ----------

export interface LadderEntry {
  showId: ShowId;
  eventId: string;
  /** latent Bradley–Terry score, higher = better (derived decoration; order is truth) */
  score: number;
  placement: Placement;
  // denormalized metadata for lenses (caller supplies; engine never fetches)
  genre: string[];
  capacityTier: CapacityTier;
  year: number;
  city: string;
}

/** A challenger before it has a score/placement. */
export type ChallengerInput = Omit<LadderEntry, 'score' | 'placement'>;

export interface TierBoundaries {
  /**
   * cuts[i] = first ladder index belonging to tier i+1.
   * Order: [greatStart, goodStart, fineStart, regretStart].
   * Invariant: 0 <= c0 <= c1 <= c2 <= c3 <= n.
   */
  cuts: [number, number, number, number];
  /** 'auto' recomputes on every insert; 'manual' preserves user drags */
  mode: 'auto' | 'manual';
}

export interface Ladder {
  /** index 0 = best show. Invariant: scores strictly decreasing. */
  entries: LadderEntry[];
  tierBoundaries: TierBoundaries;
}

export function emptyLadder(): Ladder {
  return { entries: [], tierBoundaries: { cuts: [0, 0, 0, 0], mode: 'auto' } };
}

// ---------- comparisons ----------

/** Append-only log row (persisted verbatim by the caller). */
export interface Comparison {
  id: string; // uuid, engine-generated
  userId: string;
  challengerId: ShowId; // the show being inserted (side A / subject_log)
  opponentId: ShowId; // the pivot (side B / opponent_log)
  outcome: ComparisonOutcome;
  kind: ComparisonKind;
  createdAt: string; // ISO timestamp, engine-stamped
}

// ---------- insertion session ----------

export interface InsertionSession {
  userId: string;
  challenger: ChallengerInput;
  /** ladder snapshot at session start */
  ladder: Ladder;
  /** current binary-search window [lo, hi) over ladder indices */
  lo: number;
  hi: number;
  /** pivots rejected via too_different */
  skipped: ShowId[];
  /** comparisons accumulated this session (append-only) */
  comparisons: Comparison[];
  phase: 'comparing' | 'done';
  /** comparison kind stamped on this session's rows */
  kind: SessionKind;
  /** resolved once phase === 'done' */
  placement: Placement;
  finalIndex: number | null;
}

export interface ComparisonPrompt {
  challengerId: ShowId;
  opponentId: ShowId; // pivot to show on the right card
  pivotIndex: number;
  /** expectedMax = ceil(log2(n+1)); done counts comparisons made so far */
  progress: { done: number; expectedMax: number };
}

export interface ScoreUpdate {
  showId: ShowId;
  score: number;
}

export interface InsertionResult {
  /** final slot (0-based) in the NEW ladder */
  index: number;
  placement: Placement;
  /** new ladder with challenger inserted, scores refit, tiers rebucketed */
  ladder: Ladder;
  /** caller persists these to Postgres (via src/lib/persist.ts) */
  comparisonsToAppend: Comparison[];
  /** existing entries whose score the Elo/repair pass moved (challenger excluded) */
  scoreUpdates: ScoreUpdate[];
}

// ---------- audit ----------

export interface AuditPrompt {
  aId: ShowId; // higher-ranked of the pair
  bId: ShowId;
  indexA: number;
  indexB: number;
  scoreGap: number;
}

// ---------- lenses ----------

export interface LensFilter {
  genre?: string;
  capacityTier?: CapacityTier;
  year?: number;
  city?: string;
}

export interface LensEntry extends LadderEntry {
  /** 1-based rank in the full ladder */
  globalRank: number;
  /** 1-based dense rank within the filtered lens */
  lensRank: number;
  tier: Tier;
}

// ---------- errors ----------

export class DuplicateShowError extends Error {
  constructor(public showId: ShowId) {
    super(`show ${showId} is already in the ladder`);
    this.name = 'DuplicateShowError';
  }
}

// ---------- moment tags (shared enum ↔ label map, resolutions.md "UI specifics") ----------

export type MomentTag =
  'the_drop' | 'the_encore' | 'the_crowd' | 'the_visuals' | 'the_guest_appearance';

export const MOMENT_TAGS: readonly MomentTag[] = [
  'the_drop',
  'the_encore',
  'the_crowd',
  'the_visuals',
  'the_guest_appearance',
] as const;

/** 1:1 chip labels for the enrichment sheet. */
export const MOMENT_TAG_LABELS: Record<MomentTag, string> = {
  the_drop: 'The drop',
  the_encore: 'The encore',
  the_crowd: 'The crowd',
  the_visuals: 'The visuals',
  the_guest_appearance: 'The guest appearance',
};

// ---------- tier labels (shared with the ladder UI) ----------

export const TIER_ORDER: readonly Tier[] = [
  'all_timer',
  'great',
  'good',
  'fine',
  'regret',
] as const;

export const TIER_LABELS: Record<Tier, string> = {
  all_timer: 'All-timer',
  great: 'Great',
  good: 'Good',
  fine: 'Fine',
  regret: 'Regret',
};
