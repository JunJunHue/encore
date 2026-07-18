/**
 * Horizontal lens-chip rail: genre · year · capacity tier.
 * City lens is intentionally hidden (NYC-only seed, resolutions.md deferral).
 * One value per dimension; tapping a selected chip clears it.
 */
import { Chip, CAPACITY_TIER_LABELS } from '@/components';
import type { CapacityTier } from '@/lib/database.types';
import type { LensOptions, LensState } from './model';
import { hasActiveLens } from './model';

export interface LensBarProps {
  options: LensOptions;
  lens: LensState;
  onChange: (next: LensState) => void;
}

function Divider() {
  return (
    <span aria-hidden className="mx-0.5 self-center text-xs text-ink-faint/60">
      ·
    </span>
  );
}

export function LensBar({ options, lens, onChange }: LensBarProps) {
  const toggleGenre = (g: string) => onChange({ ...lens, genre: lens.genre === g ? null : g });
  const toggleYear = (y: number) => onChange({ ...lens, year: lens.year === y ? null : y });
  const toggleTier = (t: CapacityTier) =>
    onChange({ ...lens, capacityTier: lens.capacityTier === t ? null : t });

  const showYears = options.years.length > 1;
  const showTiers = options.capacityTiers.length > 1;

  return (
    <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto px-4 pt-1 pb-3">
      {hasActiveLens(lens) && (
        <Chip
          onClick={() => onChange({ genre: null, year: null, capacityTier: null })}
          className="border-accent/40 text-accent"
        >
          ✕ Clear
        </Chip>
      )}
      {options.genres.map((g) => (
        <Chip key={g} selected={lens.genre === g} onClick={() => toggleGenre(g)}>
          {g}
        </Chip>
      ))}
      {showYears && options.genres.length > 0 && <Divider />}
      {showYears &&
        options.years.map((y) => (
          <Chip key={y} selected={lens.year === y} onClick={() => toggleYear(y)}>
            {y}
          </Chip>
        ))}
      {showTiers && (options.genres.length > 0 || showYears) && <Divider />}
      {showTiers &&
        options.capacityTiers.map((t) => (
          <Chip key={t} selected={lens.capacityTier === t} onClick={() => toggleTier(t)}>
            {CAPACITY_TIER_LABELS[t]}
          </Chip>
        ))}
    </div>
  );
}
