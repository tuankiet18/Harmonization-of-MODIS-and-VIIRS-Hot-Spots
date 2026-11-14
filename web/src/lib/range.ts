import type { DateRange } from '../data/types';

export type PeriodPreset = 'all' | 5 | 10;

interface Limits {
  min: string; // 'YYYY-MM'
  max: string;
}

const toIndex = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return y * 12 + (m - 1);
};
const toYm = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;

/** The range a preset chip stands for: the whole record, or the last N years ending at the latest month. */
export function presetRange(limits: Limits, preset: PeriodPreset): DateRange {
  if (preset === 'all') return { start: limits.min, end: limits.max };
  const start = Math.max(toIndex(limits.min), toIndex(limits.max) - (preset * 12 - 1));
  return { start: toYm(start), end: limits.max };
}

/** Which preset chip a range matches, or null for a custom range. */
export function activePreset(range: DateRange, limits: Limits): PeriodPreset | null {
  for (const p of ['all', 10, 5] as const) {
    const r = presetRange(limits, p);
    if (r.start === range.start && r.end === range.end) return p;
  }
  return null;
}
