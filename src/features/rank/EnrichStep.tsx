/**
 * Post-reveal Done state: optional enrichment. Moment-tag chips map 1:1 to the
 * moment_tag enum via the shared map in @/engine/types (resolutions.md);
 * Skip is prominent — the rank is already saved before this screen appears.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button, Chip, ShowCard, type ShowCardData } from '@/components';
import { SPRING } from '@/lib/motion';
import type { MomentTag } from '@/lib/database.types';
import { MOMENT_TAG_LABELS } from '@/engine/types';

const MOMENT_TAGS = Object.keys(MOMENT_TAG_LABELS) as MomentTag[];

export interface EnrichStepProps {
  show: ShowCardData;
  rankPos: number;
  onSave: (moment: MomentTag | null, note: string) => Promise<void> | void;
  onSkip: () => void;
}

export function EnrichStep({ show, rankPos, onSave, onSkip }: EnrichStepProps) {
  const [moment, setMoment] = useState<MomentTag | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const dirty = moment !== null || note.trim().length > 0;

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await onSave(moment, note.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      className="flex flex-1 flex-col"
    >
      <div className="pt-2 pb-5 text-center">
        <p className="text-xs font-semibold tracking-[0.3em] text-ink-faint uppercase">
          Ranked #{rankPos}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-ink">Make it a memory</h1>
        <p className="mt-1 text-sm text-ink-faint">
          Totally optional — your rank is already saved.
        </p>
      </div>

      <ShowCard show={show} variant="search" className="pointer-events-none" />

      <div className="mt-6">
        <p className="mb-2 text-xs font-semibold tracking-wide text-ink-soft uppercase">
          The moment
        </p>
        <div className="flex flex-wrap gap-2">
          {MOMENT_TAGS.map((tag) => (
            <Chip
              key={tag}
              selected={moment === tag}
              onClick={() => setMoment((m) => (m === tag ? null : tag))}
            >
              {MOMENT_TAG_LABELS[tag]}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <p className="mb-2 text-xs font-semibold tracking-wide text-ink-soft uppercase">
          One-line review
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={280}
          placeholder="What made it hit?"
          className="w-full resize-none rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink placeholder:text-ink-faint focus:border-accent/60 focus:outline-none"
        />
        {/* Crew tagging is an explicit deferral (resolutions.md) */}
        <div className="mt-2">
          <Chip size="sm" disabled tabIndex={-1}>
            Crew · soon
          </Chip>
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-2 pt-6">
        <Button block size="lg" disabled={!dirty} loading={saving} onClick={() => void save()}>
          Save details
        </Button>
        <Button block size="lg" variant="secondary" onClick={onSkip} disabled={saving}>
          Skip
        </Button>
      </div>
    </motion.div>
  );
}
