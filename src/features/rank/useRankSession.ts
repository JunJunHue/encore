/**
 * The insertion-session state machine behind /rank/:eventId.
 *
 * - Wraps the engine API (startInsertion / getNextComparison / recordChoice /
 *   finishInsertion) — the screen is a dumb renderer of `prompt` + `phase`.
 * - Mirrors the session to localStorage on every tap so a mid-demo refresh
 *   resumes exactly where it left off (design-client.md §6).
 * - Persists NOTHING per tap: at finalize it writes the optimistic ladder into
 *   the Query cache unconditionally, then fires ONE atomic
 *   rpc('insert_ranked_log') through @/lib/persist (resolutions.md P1-4).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { qk, queryClient } from '@/lib/queryClient';
import {
  persistRankedLog,
  type EngineComparisonInput,
  type EngineScoreUpdate,
} from '@/lib/persist';
import type { EventJoin, LadderRow } from '@/lib/hooks';
import { finishInsertion, getNextComparison, recordChoice, startInsertion } from '@/engine/ranking';
import type { ComparisonPrompt, InsertionSession } from '@/engine/ranking';
import { eventToChallenger, ladderToRows, mapById, rowsToLadder } from './engineAdapter';

export type RankMode = 'insertion' | 'backfill';
export type RankOutcome = 'challenger' | 'opponent' | 'too_different';
export type RankPhase = 'boot' | 'comparing' | 'reveal' | 'enrich' | 'error';

const DRAFT_KEY = 'encore:rank-draft';
/** How long the winner-glow beat plays before the next opponent slides in. */
const CHOICE_BEAT_MS = 280;

interface Draft {
  eventId: string;
  mode: RankMode;
  sessionId: string;
  challengerId: string;
  session: InsertionSession;
  /** ladder snapshot at session start — opponent lookup survives refresh */
  rows: LadderRow[];
}

interface Live {
  sessionId: string;
  challengerId: string;
  session: InsertionSession;
  rows: LadderRow[];
  rowsById: Map<string, LadderRow>;
}

export interface RankResult {
  rankPos: number;
  totalShows: number;
  score: number;
  /** optimistic set_log id of the new show (client-minted uuid) */
  newLogId: string;
  /** full post-insert ladder, rank_pos reassigned 1..n */
  rows: LadderRow[];
  /** resolves true once the RPC has landed (backfill awaits this) */
  persisted: Promise<boolean>;
}

function saveDraft(d: Draft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* private mode — session lives in memory only */
  }
}

function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

function restoreDraft(eventId: string, mode: RankMode): Live | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<Draft>;
    if (
      d.eventId !== eventId ||
      d.mode !== mode ||
      !d.sessionId ||
      !d.challengerId ||
      !d.session ||
      !Array.isArray(d.rows)
    ) {
      return null;
    }
    return {
      sessionId: d.sessionId,
      challengerId: d.challengerId,
      session: d.session,
      rows: d.rows,
      rowsById: mapById(d.rows),
    };
  } catch {
    return null;
  }
}

export interface UseRankSessionArgs {
  userId: string;
  eventId: string;
  mode: RankMode;
  event: EventJoin | null | undefined;
  ladderRows: LadderRow[] | undefined;
}

export function useRankSession({ userId, eventId, mode, event, ladderRows }: UseRankSessionArgs) {
  const [phase, setPhase] = useState<RankPhase>('boot');
  const [prompt, setPrompt] = useState<ComparisonPrompt | null>(null);
  const [chosen, setChosen] = useState<'challenger' | 'opponent' | null>(null);
  const [result, setResult] = useState<RankResult | null>(null);
  const liveRef = useRef<Live | null>(null);
  const timerRef = useRef<number | null>(null);
  /** StrictMode double-invokes effects in dev — never boot/persist twice. */
  const bootedRef = useRef(false);
  const finalizedRef = useRef(false);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const finalize = useCallback(
    (session: InsertionSession) => {
      const live = liveRef.current;
      if (!live || !event || finalizedRef.current) return;
      finalizedRef.current = true;
      try {
        const res = finishInsertion(session);
        const entry = res.ladder.entries[res.index];
        if (!entry) throw new Error('insertion produced no ladder entry');

        const rows = ladderToRows(res.ladder.entries, live.rowsById, {
          id: live.challengerId,
          userId,
          event,
        });

        // Optimistic-first: the reveal animation runs off this cache write,
        // before the network round-trip (resolutions.md P1-4).
        queryClient.setQueryData(qk.ladder(userId), rows);

        const before = new Map(live.rows.map((r) => [r.id, r.latent_score]));
        const scoreUpdates: EngineScoreUpdate[] = [];
        for (const e of res.ladder.entries) {
          if (e.showId === live.challengerId) continue;
          const prev = before.get(e.showId);
          if (prev !== undefined && Math.abs(prev - e.score) > 1e-9) {
            scoreUpdates.push({ logId: e.showId, score: e.score });
          }
        }

        // `kind` comes from the flow mode we own, not the engine object —
        // immune to engine-side drift on how backfill sessions are tagged.
        const comparisons: EngineComparisonInput[] = res.comparisonsToAppend.map((c) => ({
          opponentId: c.opponentId,
          outcome: c.outcome,
          kind: mode,
          createdAt: c.createdAt,
        }));

        const persisted = persistRankedLog({
          userId,
          eventId,
          sessionId: live.sessionId,
          rankPos: res.index + 1,
          score: entry.score,
          comparisons,
          scoreUpdates,
        });

        clearDraft();
        setResult({
          rankPos: res.index + 1,
          totalShows: rows.length,
          score: entry.score,
          newLogId: live.challengerId,
          rows,
          persisted,
        });
        setPrompt(null);
        setChosen(null);
        setPhase('reveal');
      } catch (err) {
        console.error('[encore] finalize failed:', err);
        clearDraft();
        setPhase('error');
      }
    },
    [event, eventId, mode, userId],
  );

  // Boot: restore a matching draft or start a fresh engine session.
  useEffect(() => {
    if (phase !== 'boot' || !event || ladderRows === undefined || bootedRef.current) return;
    bootedRef.current = true;
    let live = restoreDraft(eventId, mode);
    if (!live) {
      try {
        const rows = [...ladderRows].sort((a, b) => a.rank_pos - b.rank_pos);
        const challengerId = uuidv4();
        const session = startInsertion(
          userId,
          eventToChallenger(challengerId, event),
          rowsToLadder(rows),
        );
        live = {
          sessionId: uuidv4(),
          challengerId,
          session,
          rows,
          rowsById: mapById(rows),
        };
        saveDraft({
          eventId,
          mode,
          sessionId: live.sessionId,
          challengerId,
          session,
          rows,
        });
      } catch (err) {
        console.error('[encore] failed to start ranking session:', err);
        setPhase('error');
        return;
      }
    }
    liveRef.current = live;
    const p = getNextComparison(live.session);
    if (p) {
      setPrompt(p);
      setPhase('comparing');
    } else {
      finalize(live.session); // empty ladder → straight to the reveal
    }
  }, [phase, event, ladderRows, eventId, mode, userId, finalize]);

  const choose = useCallback(
    (outcome: RankOutcome) => {
      const live = liveRef.current;
      if (!live || phase !== 'comparing' || chosen !== null) return;

      const advance = () => {
        timerRef.current = null;
        const next = recordChoice(live.session, outcome);
        live.session = next;
        saveDraft({
          eventId,
          mode,
          sessionId: live.sessionId,
          challengerId: live.challengerId,
          session: next,
          rows: live.rows,
        });
        setChosen(null);
        const p = getNextComparison(next);
        if (p) setPrompt(p);
        else finalize(next);
      };

      if (outcome === 'too_different') {
        advance(); // redraw the pivot immediately — no winner beat
        return;
      }
      setChosen(outcome);
      timerRef.current = window.setTimeout(advance, CHOICE_BEAT_MS);
    },
    [phase, chosen, eventId, mode, finalize],
  );

  const enterEnrich = useCallback(() => setPhase('enrich'), []);

  /** Hard reset after an engine error: drop the draft and re-boot. */
  const restart = useCallback(() => {
    clearDraft();
    liveRef.current = null;
    bootedRef.current = false;
    finalizedRef.current = false;
    setPrompt(null);
    setChosen(null);
    setResult(null);
    setPhase('boot');
  }, []);

  const opponentRow = prompt ? (liveRef.current?.rowsById.get(prompt.opponentId) ?? null) : null;

  return { phase, prompt, chosen, opponentRow, result, choose, enterEnrich, restart };
}
