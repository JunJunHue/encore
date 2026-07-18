import { useId } from 'react';
import { cx } from '@/lib/cx';

export interface AvatarProps {
  /** profiles.avatar_seed — deterministic art, no network (dicebear-style, local) */
  seed: string;
  /** display name; first letter is drawn on the orb */
  name?: string;
  /** px */
  size?: number;
  className?: string;
}

/** FNV-1a — tiny deterministic hash for seed → palette/geometry. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Local generative avatar: gradient orb + orbiting accent dot, hue pair and
 * geometry derived from the seed hash. Zero network requests.
 */
export function Avatar({ seed, name, size = 40, className }: AvatarProps) {
  const gradId = useId();
  const h = fnv1a(seed);
  const hue1 = h % 360;
  const hue2 = (hue1 + 60 + ((h >> 8) % 120)) % 360;
  const angle = (h >> 16) % 360;
  const rad = (angle * Math.PI) / 180;
  const dotX = 32 + Math.cos(rad) * 20;
  const dotY = 32 + Math.sin(rad) * 20;
  const initial = name?.trim().charAt(0).toUpperCase() ?? '';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={name ? `${name}'s avatar` : 'avatar'}
      className={cx('shrink-0 rounded-full', className)}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={`hsl(${hue1} 70% 55%)`} />
          <stop offset="1" stopColor={`hsl(${hue2} 70% 40%)`} />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="32" fill={`url(#${gradId})`} />
      <circle cx={dotX} cy={dotY} r="6" fill="rgba(255,255,255,0.35)" />
      {initial && (
        <text
          x="32"
          y="33"
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="var(--font-sans)"
          fontWeight="700"
          fontSize="28"
          fill="rgba(255,255,255,0.92)"
        >
          {initial}
        </text>
      )}
    </svg>
  );
}
