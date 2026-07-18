/**
 * Big animated taste-match ring: SVG progress arc (accent → magenta gradient)
 * plus a count-up percentage in the center. Pure presentation.
 */
import { useEffect, useId, useState } from 'react';
import { animate, motion } from 'framer-motion';

export interface TasteMatchRingProps {
  pct: number; // 0–100
  size?: number; // px
}

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export function TasteMatchRing({ pct, size = 176 }: TasteMatchRingProps) {
  const gradId = useId();
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const controls = animate(0, pct, {
      duration: 1.2,
      ease: EASE,
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [pct]);

  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--color-accent)" />
            <stop offset="1" stopColor="var(--color-accent-magenta)" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-surface-2)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct / 100) }}
          transition={{ duration: 1.2, ease: EASE }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-black tracking-tight tabular-nums text-ink">
          {display}
          <span className="text-2xl font-bold text-ink-soft">%</span>
        </span>
        <span className="mt-0.5 text-[10px] font-semibold tracking-widest text-ink-faint uppercase">
          taste match
        </span>
      </div>
    </div>
  );
}
