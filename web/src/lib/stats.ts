import type { MonthlyPoint, Source } from '../data/types';
import { valueOf } from './aggregate';

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Median of the same calendar month across all OTHER years (the "historical median").
 * Returns null when there is no other year to compare with.
 */
export function medianForMonth(points: MonthlyPoint[], source: Source, month: number, excludeYear?: number): number | null {
  const vals = points
    .filter((p) => p.month === month && p.year !== excludeYear)
    .map((p) => valueOf(p, source))
    .filter((v): v is number => v !== null);
  return median(vals);
}

/** Relative anomaly in percent vs the historical median; null if median is missing or 0. */
export function anomalyPct(value: number | null, med: number | null): number | null {
  if (value === null || med === null || med === 0) return null;
  return ((value - med) / med) * 100;
}

export type Verdict = 'higher' | 'typical' | 'lower' | 'unknown';

/** Plain-language reading of an anomaly: within +/-10 % of the historical median counts as usual. */
export function verdictOf(anomalyPct: number | null): Verdict {
  if (anomalyPct === null) return 'unknown';
  if (Math.abs(anomalyPct) < 10) return 'typical';
  return anomalyPct > 0 ? 'higher' : 'lower';
}

export interface Kpis {
  currentMonth: string | null;
  currentValue: number | null;
  currentMedian: number | null;
  currentAnomalyPct: number | null;
  peakMonth: number | null; // calendar month (1-12) with the highest median
  peakYear: number | null;
  peakYearTotal: number | null;
  total: number;
}

export function computeKpis(points: MonthlyPoint[], source: Source): Kpis {
  const withValue = points.filter((p) => valueOf(p, source) !== null);
  const last = withValue[withValue.length - 1];
  const currentValue = last ? valueOf(last, source) : null;
  const currentMedian = last ? medianForMonth(points, source, last.month, last.year) : null;

  let peakMonth: number | null = null;
  let best = -Infinity;
  for (let m = 1; m <= 12; m++) {
    const med = medianForMonth(points, source, m);
    if (med !== null && med > best) {
      best = med;
      peakMonth = m;
    }
  }

  const byYear = new Map<number, number>();
  for (const p of withValue) byYear.set(p.year, (byYear.get(p.year) ?? 0) + (valueOf(p, source) ?? 0));
  let peakYear: number | null = null;
  let peakYearTotal: number | null = null;
  for (const [y, t] of byYear) {
    if (peakYearTotal === null || t > peakYearTotal) {
      peakYear = y;
      peakYearTotal = t;
    }
  }

  return {
    currentMonth: last?.yearMonth ?? null,
    currentValue,
    currentMedian,
    currentAnomalyPct: anomalyPct(currentValue, currentMedian),
    peakMonth,
    peakYear,
    peakYearTotal,
    total: [...byYear.values()].reduce((a, b) => a + b, 0),
  };
}
