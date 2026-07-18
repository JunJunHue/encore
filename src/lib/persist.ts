/**
 * Engine → schema persistence adapter (the ONLY place engine vocabulary meets
 * schema vocabulary — collab.md seam #2).
 *
 * A finished insertion session is buffered and persisted in ONE atomic
 * `rpc('insert_ranked_log', …)` call. Persistence is optimistic-first
 * (resolutions.md P1-4): the caller applies its Query-cache update
 * unconditionally, then hands the payload to `persistRankedLog`, which retries
 * in the background and survives a refresh via a localStorage pending queue.
 *
 * NOTE: engine types are mirrored *structurally* here (no import from
 * @/engine) so the platform compiles before/alongside W1. The engine's
 * `Comparison` objects are assignable to `EngineComparisonInput`.
 */
import { supabase } from '@/lib/supabase';
import { queryClient, qk } from '@/lib/queryClient';
import type { ComparisonKind, ComparisonOutcome, Json, Tables } from '@/lib/database.types';

// ---------- engine vocabulary (structural mirror of src/engine types) ----------

export type EngineOutcome = 'challenger' | 'opponent' | 'too_different';

export interface EngineComparisonInput {
  /** set_logs.id of the existing ladder entry shown as the pivot */
  opponentId: string;
  outcome: EngineOutcome;
  kind: ComparisonKind;
  /** ISO timestamp; engine stamps these — defaults to now */
  createdAt?: string;
}

export interface EngineScoreUpdate {
  /** set_logs.id of an existing ladder entry whose score the repair sweep moved */
  logId: string;
  score: number;
}

/** Everything needed to persist one finished insertion session. */
export interface FinishedInsertion {
  userId: string;
  eventId: string;
  /** uuid minted at session start; groups this session's comparison rows */
  sessionId: string;
  /** 1-based final position (engine index + 1) */
  rankPos: number;
  /** latent score the engine assigned the new show */
  score: number;
  comparisons: EngineComparisonInput[];
  scoreUpdates: EngineScoreUpdate[];
}

// ---------- vocabulary mapping ----------

const OUTCOME_MAP: Record<EngineOutcome, ComparisonOutcome> = {
  challenger: 'a_wins', // subject (side A) = the show being inserted
  opponent: 'b_wins',
  too_different: 'skipped',
};

type RpcArgs = {
  p_event_id: string;
  p_score: number;
  p_rank: number;
  p_session_id: string;
  p_comparisons: Json;
  p_score_updates: Json;
};

export function toRpcArgs(f: FinishedInsertion): RpcArgs {
  return {
    p_event_id: f.eventId,
    p_score: f.score,
    p_rank: f.rankPos,
    p_session_id: f.sessionId,
    p_comparisons: f.comparisons.map((c) => ({
      opponent_log: c.opponentId,
      outcome: OUTCOME_MAP[c.outcome],
      kind: c.kind,
      created_at: c.createdAt ?? new Date().toISOString(),
    })),
    p_score_updates: f.scoreUpdates.map((u) => ({
      log_id: u.logId,
      latent_score: u.score,
    })),
  };
}

// ---------- pending queue (refresh-proof background retry) ----------

const PENDING_KEY = 'encore:pending-logs';

interface PendingEntry {
  userId: string;
  args: RpcArgs;
}

function readPending(): PendingEntry[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingEntry[]) : [];
  } catch {
    return [];
  }
}

function writePending(entries: PendingEntry[]): void {
  try {
    if (entries.length === 0) localStorage.removeItem(PENDING_KEY);
    else localStorage.setItem(PENDING_KEY, JSON.stringify(entries));
  } catch {
    /* storage unavailable — retry lives only in memory */
  }
}

function enqueue(entry: PendingEntry): void {
  writePending([...readPending(), entry]);
}

function dequeue(sessionId: string): void {
  writePending(readPending().filter((e) => e.args.p_session_id !== sessionId));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Postgres codes that mean "this write will never succeed — drop it". */
const PERMANENT_CODES = new Set(['23505' /* unique_violation: already persisted */]);

async function callRpc(entry: PendingEntry, attempts: number): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    const { error } = await supabase.rpc('insert_ranked_log', entry.args);
    if (!error) {
      dequeue(entry.args.p_session_id);
      void queryClient.invalidateQueries({ queryKey: qk.ladder(entry.userId) });
      return true;
    }
    if (error.code && PERMANENT_CODES.has(error.code)) {
      console.warn('[encore] insert_ranked_log permanent failure, dropping:', error.message);
      dequeue(entry.args.p_session_id);
      return false;
    }
    if (i < attempts - 1) await sleep(500 * 2 ** i);
    else console.warn('[encore] insert_ranked_log failed, kept in pending queue:', error.message);
  }
  return false;
}

// ---------- public API ----------

/**
 * Persist one finished insertion session. Fire-and-forget from the caller's
 * perspective: the optimistic ladder cache the caller already wrote stays in
 * place regardless; on success the ladder query is invalidated so real ids
 * replace optimistic ones. Failed payloads stay queued and are retried by
 * `flushPendingLogs()` on next boot.
 */
export async function persistRankedLog(f: FinishedInsertion): Promise<boolean> {
  const entry: PendingEntry = { userId: f.userId, args: toRpcArgs(f) };
  enqueue(entry);
  return callRpc(entry, 3);
}

/** Retry anything left over from a previous session. Called once on app boot. */
export async function flushPendingLogs(): Promise<void> {
  for (const entry of readPending()) {
    await callRpc(entry, 2);
  }
}

/** Direct enrichment update (note / moment / crew) with a simple optimistic patch. */
export async function updateSetLog(
  userId: string,
  logId: string,
  patch: Partial<Pick<Tables<'set_logs'>, 'note' | 'moment' | 'crew'>>,
): Promise<void> {
  const { error } = await supabase.from('set_logs').update(patch).eq('id', logId);
  if (error) throw error;
  void queryClient.invalidateQueries({ queryKey: qk.ladder(userId) });
}
