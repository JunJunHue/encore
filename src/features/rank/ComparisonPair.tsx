/**
 * The pairwise tap UI: challenger (NEW badge, stays mounted the whole gauntlet
 * via layoutId) vs the current pivot (slides out left / in right per choice).
 * Never shows ranks or scores mid-flow (resolutions.md UI specifics).
 * All motion is transform/opacity only — 60fps on a phone.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { Button, ShowCard, type ShowCardData } from '@/components';
import { SPRING, SPRING_SNAP } from '@/lib/motion';
import { cx } from '@/lib/cx';

export type PairChoice = 'challenger' | 'opponent';
type CardState = 'idle' | 'winner' | 'loser';

/** Shared-element id: the challenger card morphs into its ladder row in the reveal. */
export const CHALLENGER_LAYOUT_ID = 'rank-challenger';

function VersusCard({
  show,
  state,
  isNew = false,
  disabled,
  layoutId,
  onPick,
}: {
  show: ShowCardData;
  state: CardState;
  isNew?: boolean;
  disabled: boolean;
  layoutId?: string;
  onPick: () => void;
}) {
  return (
    <motion.div
      layoutId={layoutId}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => {
        if (!disabled) onPick();
      }}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onPick();
        }
      }}
      className="relative cursor-pointer touch-manipulation select-none"
      whileTap={disabled ? undefined : { scale: 0.96 }}
      animate={
        state === 'winner'
          ? { scale: 1.05, y: -4, opacity: 1 }
          : state === 'loser'
            ? { scale: 0.92, y: 0, opacity: 0.3 }
            : { scale: 1, y: 0, opacity: 1 }
      }
      transition={SPRING_SNAP}
    >
      {/* glow layer animated via opacity (composited) instead of box-shadow */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-2xl"
        style={{ boxShadow: '0 0 44px rgba(139, 92, 246, 0.5)' }}
        initial={false}
        animate={{ opacity: state === 'winner' ? 1 : 0 }}
        transition={{ duration: 0.2 }}
      />
      <ShowCard
        show={show}
        variant="versus"
        isNew={isNew}
        className={cx('transition-colors', state === 'winner' && 'border-accent/70')}
      />
    </motion.div>
  );
}

export interface ComparisonPairProps {
  challenger: ShowCardData;
  opponent: ShowCardData;
  /** keys the AnimatePresence swap — the pivot's set_log id */
  opponentKey: string;
  chosen: PairChoice | null;
  onChoose: (choice: PairChoice) => void;
  onTooDifferent: () => void;
}

export function ComparisonPair({
  challenger,
  opponent,
  opponentKey,
  chosen,
  onChoose,
  onTooDifferent,
}: ComparisonPairProps) {
  const disabled = chosen !== null;
  return (
    <div className="flex flex-col gap-3">
      <VersusCard
        show={challenger}
        isNew
        layoutId={CHALLENGER_LAYOUT_ID}
        state={chosen === null ? 'idle' : chosen === 'challenger' ? 'winner' : 'loser'}
        disabled={disabled}
        onPick={() => onChoose('challenger')}
      />

      <div aria-hidden className="flex items-center gap-3 px-2">
        <span className="h-px flex-1 bg-line" />
        <span className="text-[10px] font-black tracking-[0.35em] text-ink-faint uppercase">
          vs
        </span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={opponentKey}
          initial={{ x: 96, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -96, opacity: 0 }}
          transition={SPRING}
        >
          <VersusCard
            show={opponent}
            state={chosen === null ? 'idle' : chosen === 'opponent' ? 'winner' : 'loser'}
            disabled={disabled}
            onPick={() => onChoose('opponent')}
          />
        </motion.div>
      </AnimatePresence>

      <Button
        variant="ghost"
        className="mt-1 self-center text-ink-faint"
        onClick={onTooDifferent}
        disabled={disabled}
      >
        Too different to compare
      </Button>
    </div>
  );
}

export function ProgressDots({ done, expectedMax }: { done: number; expectedMax: number }) {
  const total = Math.max(expectedMax, done + 1);
  return (
    <div
      className="flex items-center justify-center gap-2 py-4"
      aria-label={`Comparison ${done + 1} of about ${total}`}
    >
      {Array.from({ length: total }, (_, i) => {
        const isDone = i < done;
        const isCurrent = i === done;
        return (
          <motion.span
            key={i}
            className={cx(
              'size-2 rounded-full',
              isDone ? 'bg-accent' : isCurrent ? 'bg-accent/70' : 'bg-surface-2',
            )}
            animate={isCurrent ? { scale: [1, 1.4, 1] } : { scale: 1 }}
            transition={
              isCurrent ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' } : undefined
            }
          />
        );
      })}
    </div>
  );
}
