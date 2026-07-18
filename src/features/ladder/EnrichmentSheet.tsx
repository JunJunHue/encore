/**
 * Enrichment bottom sheet — opens on ladder-row tap (resolutions.md UI
 * specifics). Moment chips map 1:1 onto the moment_tag enum via the shared
 * map in the engine (src/engine/types.ts); note is free text; crew tagging is
 * a disabled "soon" chip (explicit MVP deferral).
 *
 * Saving is optimistic: the ladder Query cache is patched immediately, then
 * updateSetLog persists in the background (and re-invalidates on settle).
 */
import { useState } from 'react';
import { Button, Chip, ScoreBubble, Sheet, formatShowDate } from '@/components';
import { MOMENT_TAGS, MOMENT_TAG_LABELS } from '@/engine/types';
import { updateSetLog } from '@/lib/persist';
import { queryClient, qk } from '@/lib/queryClient';
import { useSession, type LadderRow } from '@/lib/hooks';
import type { MomentTag } from '@/lib/database.types';

export interface EnrichmentSheetProps {
  /** null = closed */
  row: LadderRow | null;
  rank: number | null;
  score: number | null;
  onClose: () => void;
}

interface SheetBodyProps {
  row: LadderRow;
  rank: number | null;
  score: number | null;
  onClose: () => void;
}

function SheetBody({ row, rank, score, onClose }: SheetBodyProps) {
  const { userId } = useSession();
  const [moment, setMoment] = useState<MomentTag | null>(row.moment);
  const [note, setNote] = useState(row.note ?? '');
  const ev = row.events;
  const artist = ev
    ? (ev.event_artists
        .slice()
        .sort((a, b) => a.billing_order - b.billing_order)
        .find((ea) => ea.artists)?.artists?.name ??
      ev.title.split(' at ')[0] ??
      ev.title)
    : 'Unknown show';

  const save = () => {
    const patch = { moment, note: note.trim() === '' ? null : note.trim() };
    // optimistic cache patch — the row updates before the network round trip
    queryClient.setQueryData<LadderRow[]>(qk.ladder(userId), (old) =>
      old?.map((r) => (r.id === row.id ? { ...r, ...patch } : r)),
    );
    void updateSetLog(userId, row.id, patch).catch(() => {
      void queryClient.invalidateQueries({ queryKey: qk.ladder(userId) });
    });
    onClose();
  };

  return (
    <div className="flex flex-col gap-5">
      {/* show header */}
      <div>
        <div className="flex items-center gap-2">
          {rank !== null && (
            <span className="text-sm font-bold tabular-nums text-ink-faint">#{rank}</span>
          )}
          {score !== null && <ScoreBubble score={score} size="sm" />}
        </div>
        <p className="mt-1 text-xl leading-tight font-bold text-ink">{artist}</p>
        {ev && (
          <p className="mt-0.5 text-xs text-ink-soft">
            {ev.venues?.name ?? 'Unknown venue'} · {formatShowDate(ev.event_date)}
          </p>
        )}
      </div>

      {/* moment chips */}
      <div>
        <p className="mb-2 text-xs font-semibold tracking-wide text-ink-faint uppercase">
          The moment
        </p>
        <div className="flex flex-wrap gap-1.5">
          {MOMENT_TAGS.map((m) => (
            <Chip
              key={m}
              selected={moment === m}
              onClick={() => setMoment((cur) => (cur === m ? null : m))}
            >
              {MOMENT_TAG_LABELS[m]}
            </Chip>
          ))}
        </div>
      </div>

      {/* note */}
      <div>
        <p className="mb-2 text-xs font-semibold tracking-wide text-ink-faint uppercase">Note</p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={280}
          placeholder="One line you'll want to remember…"
          className="w-full resize-none rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-sm text-ink placeholder:text-ink-faint focus:border-accent/60 focus:outline-none"
        />
      </div>

      {/* crew — deferred */}
      <div>
        <p className="mb-2 text-xs font-semibold tracking-wide text-ink-faint uppercase">Crew</p>
        <Chip disabled>+ Tag your crew — soon</Chip>
      </div>

      <Button block size="lg" onClick={save}>
        Save
      </Button>
    </div>
  );
}

export function EnrichmentSheet({ row, rank, score, onClose }: EnrichmentSheetProps) {
  // Retain the last non-null row so content stays visible during the exit slide.
  const [retained, setRetained] = useState<{
    row: LadderRow;
    rank: number | null;
    score: number | null;
  } | null>(null);
  if (row && row !== retained?.row) setRetained({ row, rank, score });
  const display = row ? { row, rank, score } : retained;

  return (
    <Sheet open={row !== null} onClose={onClose}>
      {display && (
        <SheetBody
          key={display.row.id}
          row={display.row}
          rank={display.rank}
          score={display.score}
          onClose={onClose}
        />
      )}
    </Sheet>
  );
}
