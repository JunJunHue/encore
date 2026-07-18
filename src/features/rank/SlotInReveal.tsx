/**
 * The finale: the ladder slice renders with a rank gap where the new show
 * belongs, then the row slides in (shared layoutId with the challenger card →
 * FLIP morph from center stage), neighbors spring apart, the big rank counter
 * rolls to its final number, confetti-lite bursts, Done fades in.
 * Backfill mode auto-advances instead of showing a button.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { Button, ShowCard } from '@/components';
import { SPRING } from '@/lib/motion';
import { cx } from '@/lib/cx';
import type { LadderRow } from '@/lib/hooks';
import { rowToCardData } from './engineAdapter';
import { CHALLENGER_LAYOUT_ID } from './ComparisonPair';
import type { RankMode } from './useRankSession';

const WINDOW = 2; // ladder rows shown above/below the new slot
const INSERT_AT_MS = 480;
const READY_AT_MS = 1750;

function RollingRank({ from, to }: { from: number; to: number }) {
  const mv = useMotionValue(Math.max(from, to));
  const text = useTransform(mv, (v) => `#${Math.max(1, Math.round(v))}`);
  useEffect(() => {
    const controls = animate(mv, to, {
      duration: 0.9,
      delay: INSERT_AT_MS / 1000 - 0.05,
      ease: [0.16, 1, 0.3, 1],
    });
    return () => controls.stop();
  }, [mv, to]);
  return <motion.span>{text}</motion.span>;
}

const PARTICLES = [
  { x: -72, y: -36, c: '#8b5cf6' },
  { x: 66, y: -42, c: '#ec4899' },
  { x: -48, y: 32, c: '#ffd75e' },
  { x: 54, y: 38, c: '#38bdf8' },
  { x: -86, y: -6, c: '#ec4899' },
  { x: 82, y: 8, c: '#8b5cf6' },
];

function ConfettiBurst() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      {PARTICLES.map((p, i) => (
        <motion.span
          key={i}
          className="absolute size-1.5 rounded-full"
          style={{ backgroundColor: p.c }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: p.x, y: p.y, opacity: 0, scale: 0.4 }}
          transition={{ duration: 0.7, delay: 0.25, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}

function EdgeHint({ count, side }: { count: number; side: 'above' | 'below' }) {
  return (
    <div
      className={cx(
        'py-1.5 text-center text-[10px] font-medium tracking-wide text-ink-faint uppercase',
        side === 'above' ? 'border-b border-line' : 'border-t border-line',
      )}
    >
      {side === 'above' ? '↑' : '↓'} {count} more
    </div>
  );
}

export interface SlotInRevealProps {
  /** full post-insert ladder (rank_pos already 1..n) */
  rows: LadderRow[];
  newLogId: string;
  rankPos: number;
  mode: RankMode;
  onDone: () => void;
}

export function SlotInReveal({ rows, newLogId, rankPos, mode, onDone }: SlotInRevealProps) {
  const [inserted, setInserted] = useState(false);
  const [ready, setReady] = useState(false);
  const firedRef = useRef(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  const fire = useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    onDoneRef.current();
  }, []);

  useEffect(() => {
    const t1 = window.setTimeout(() => setInserted(true), INSERT_AT_MS);
    const t2 = window.setTimeout(() => {
      setReady(true);
      if (mode === 'backfill') fire();
    }, READY_AT_MS);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [mode, fire]);

  const index = rankPos - 1;
  const start = Math.max(0, index - WINDOW);
  const end = Math.min(rows.length, index + WINDOW + 1);
  const slice = rows.slice(start, end);
  // Pre-insert beat: neighbors render with the rank gap (…5, 7…) — the missing
  // number is the tease. Final ranks are shown throughout, so nothing re-labels.
  const visible = inserted ? slice : slice.filter((r) => r.id !== newLogId);
  const newRow = rows[index];
  const artist = newRow ? rowToCardData(newRow).artist : '';

  return (
    <div className="flex flex-1 flex-col">
      <div className="pt-4 pb-6 text-center">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING}
          className="text-xs font-semibold tracking-[0.3em] text-ink-faint uppercase"
        >
          Locked in
        </motion.p>
        <p className="mt-1 bg-gradient-to-r from-accent to-accent-magenta bg-clip-text text-6xl font-black tracking-tight text-transparent tabular-nums">
          <RollingRank from={rows.length} to={rankPos} />
        </p>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55 }}
          className="mt-2 text-sm text-ink-soft"
        >
          {artist} · of {rows.length} {rows.length === 1 ? 'show' : 'shows'}
        </motion.p>
      </div>

      <motion.div layout className="overflow-hidden rounded-2xl border border-line bg-surface">
        {start > 0 && <EdgeHint count={start} side="above" />}
        {visible.map((row) => {
          const isNewRow = row.id === newLogId;
          return (
            <motion.div
              key={row.id}
              layout
              layoutId={isNewRow ? CHALLENGER_LAYOUT_ID : undefined}
              transition={SPRING}
              initial={isNewRow ? { opacity: 0, scale: 0.95 } : false}
              animate={{ opacity: 1, scale: 1 }}
              className="relative"
            >
              {isNewRow && (
                <motion.div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-accent/25"
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 1.2, delay: 0.2 }}
                />
              )}
              <ShowCard show={rowToCardData(row)} variant="row" rank={row.rank_pos} />
              {isNewRow && <ConfettiBurst />}
            </motion.div>
          );
        })}
        {end < rows.length && <EdgeHint count={rows.length - end} side="below" />}
      </motion.div>

      <div className="mt-auto pt-8">
        {mode === 'insertion' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={ready ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
            transition={SPRING}
          >
            <Button block size="lg" onClick={fire} disabled={!ready}>
              Continue
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
