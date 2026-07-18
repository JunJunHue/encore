/**
 * Taste match % — canonical formula per resolutions.md (overriding D §3 where
 * they differ): Spearman-style weighted correlation on the shared subset with
 * BOTH sides re-ranked 1..n over the subset before correlating, recency
 * weights with an 18-month half-life, MIN_OVERLAP 5 (below → null + UI copy),
 * mapped round(50 + 50·rho) clamped 0–100. Time is always injected via `now`.
 */

export const MIN_OVERLAP = 5;
export const HALF_LIFE_MONTHS = 18;
const MS_PER_MONTH = 30.44 * 864e5;

export interface SharedShow {
  eventId: string;
  /** ISO date of the show (recency weighting) */
  eventDate: string;
  /** full-ladder rank for user A (1 = best) — subset re-ranking happens inside */
  rankA: number;
  /** full-ladder rank for user B (1 = best) */
  rankB: number;
}

export interface SharedShowDetail extends SharedShow {
  subsetRankA: number;
  subsetRankB: number;
  /** subsetRankA − subsetRankB; disagreement = largest |delta| */
  delta: number;
  weight: number;
}

export interface TasteMatchDetail {
  /** null when overlap < MIN_OVERLAP ("Not enough shared shows yet") */
  pct: number | null;
  overlap: number;
  shared: SharedShowDetail[];
  biggestDisagreement: SharedShowDetail | null;
}

/** Re-rank raw (full-ladder) ranks densely 1..n over the subset. Strict order assumed. */
function subsetRanks(values: readonly number[]): number[] {
  const order = values
    .map((value, i) => ({ value, i }))
    .sort((a, b) => a.value - b.value || a.i - b.i);
  const ranks = new Array<number>(values.length).fill(0);
  order.forEach((o, pos) => {
    ranks[o.i] = pos + 1;
  });
  return ranks;
}

export function recencyWeight(eventDate: string, now: Date): number {
  const monthsAgo = (now.getTime() - new Date(eventDate).getTime()) / MS_PER_MONTH;
  return Math.pow(0.5, Math.max(0, monthsAgo) / HALF_LIFE_MONTHS);
}

export function tasteMatchDetail(shared: readonly SharedShow[], now: Date): TasteMatchDetail {
  const n = shared.length;
  const ra = subsetRanks(shared.map((s) => s.rankA));
  const rb = subsetRanks(shared.map((s) => s.rankB));
  const w = shared.map((s) => recencyWeight(s.eventDate, now));

  const detail: SharedShowDetail[] = shared.map((s, i) => ({
    ...s,
    subsetRankA: ra[i]!,
    subsetRankB: rb[i]!,
    delta: ra[i]! - rb[i]!,
    weight: w[i]!,
  }));

  let biggest: SharedShowDetail | null = null;
  for (const d of detail) {
    if (!biggest || Math.abs(d.delta) > Math.abs(biggest.delta)) biggest = d;
  }

  if (n < MIN_OVERLAP) {
    return { pct: null, overlap: n, shared: detail, biggestDisagreement: biggest };
  }

  const W = w.reduce((acc, x) => acc + x, 0);
  const weightedMean = (v: readonly number[]) => v.reduce((acc, x, i) => acc + w[i]! * x, 0) / W;
  const ma = weightedMean(ra);
  const mb = weightedMean(rb);
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    const da = ra[i]! - ma;
    const db = rb[i]! - mb;
    cov += w[i]! * da * db;
    va += w[i]! * da * da;
    vb += w[i]! * db * db;
  }
  const rho = va === 0 || vb === 0 ? 0 : cov / Math.sqrt(va * vb);
  const pct = Math.min(100, Math.max(0, Math.round(50 + 50 * rho)));
  return { pct, overlap: n, shared: detail, biggestDisagreement: biggest };
}

/** Match percentage alone; null under the overlap floor. */
export function tasteMatch(shared: readonly SharedShow[], now: Date): number | null {
  return tasteMatchDetail(shared, now).pct;
}
