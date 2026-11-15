import { cellToLatLng } from 'h3-js';
import type { DateRange, HexCell, MonthlyPoint, Source } from '../data/types';
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
  /** The month of the period with the highest value. */
  busiest: { yearMonth: string; value: number } | null;
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

  let busiest: Kpis['busiest'] = null;
  for (const p of withValue) {
    const v = valueOf(p, source) ?? 0;
    if (busiest === null || v > busiest.value) busiest = { yearMonth: p.yearMonth, value: v };
  }

  return {
    currentMonth: last?.yearMonth ?? null,
    currentValue,
    currentMedian,
    currentAnomalyPct: anomalyPct(currentValue, currentMedian),
    peakMonth,
    peakYear,
    peakYearTotal,
    busiest,
    total: [...byYear.values()].reduce((a, b) => a + b, 0),
  };
}

/** Value at quantile q (0..1) of an ascending list, interpolating between neighbours. Null for an empty list. */
export function quantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export interface SeasonalMonth {
  month: number; // 1-12
  p10: number | null;
  median: number | null;
  p90: number | null;
  /** The focus year's own value for this month. */
  current: number | null;
}

/**
 * A typical year, month by month: the median and the p10..p90 band over the OTHER years (the same baseline as the
 * "usual" verdict), plus the focus year's own line to hold up against it.
 */
export function seasonalProfile(points: MonthlyPoint[], source: Source, focusYear: number | null): SeasonalMonth[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const inMonth = points.filter((p) => p.month === month);
    const others = inMonth
      .filter((p) => p.year !== focusYear)
      .map((p) => valueOf(p, source))
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);
    const mine = inMonth.find((p) => p.year === focusYear);
    return {
      month,
      p10: quantile(others, 0.1),
      median: quantile(others, 0.5),
      p90: quantile(others, 0.9),
      current: mine ? valueOf(mine, source) : null,
    };
  });
}

export interface AnnualTotal {
  year: number;
  total: number;
  /** Months with a value, so a part-year can be told from a full one. */
  months: number;
}

/** The sum of each year's monthly values. */
export function annualTotals(points: MonthlyPoint[], source: Source): AnnualTotal[] {
  const byYear = new Map<number, AnnualTotal>();
  for (const p of points) {
    const v = valueOf(p, source);
    if (v === null) continue;
    const row = byYear.get(p.year) ?? { year: p.year, total: 0, months: 0 };
    row.total += v;
    row.months += 1;
    byYear.set(p.year, row);
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year);
}

export interface PeriodAnomaly {
  /** Everything counted in the period. */
  total: number;
  /** The part of it from months that have the same month in other years to be compared with. */
  compared: number;
  /** What those months would add up to if each were a usual (median) month. */
  expected: number;
  /** compared against expected, in percent; null when nothing could be compared. */
  pct: number | null;
  months: number;
}

/**
 * A period against the usual: each month is set against the median of the same calendar month in the other years
 * (the baseline of the verdict on one month), and the months are added up, so any length of period gets one comparison.
 */
export function periodAnomaly(period: MonthlyPoint[], all: MonthlyPoint[], source: Source): PeriodAnomaly {
  let total = 0;
  let compared = 0;
  let expected = 0;
  let months = 0;
  for (const p of period) {
    const v = valueOf(p, source);
    if (v === null) continue;
    total += v;
    const med = medianForMonth(all, source, p.month, p.year);
    if (med === null) continue;
    compared += v;
    expected += med;
    months += 1;
  }
  return { total, compared, expected, months, pct: anomalyPct(months ? compared : null, months ? expected : null) };
}

export interface MonthAnomaly {
  yearMonth: string;
  value: number;
  /** Median of the same calendar month in the other years; null when there is no other year. */
  median: number | null;
  /** value against median in percent; null when it cannot be told. */
  pct: number | null;
}

/** Every month of the period with its distance from the usual, for the month-by-month anomaly chart. */
export function anomalySeries(period: MonthlyPoint[], all: MonthlyPoint[], source: Source): MonthAnomaly[] {
  const out: MonthAnomaly[] = [];
  for (const p of period) {
    const value = valueOf(p, source);
    if (value === null) continue;
    const median = medianForMonth(all, source, p.month, p.year);
    out.push({ yearMonth: p.yearMonth, value, median, pct: anomalyPct(value, median) });
  }
  return out;
}

/**
 * How a fire season is going: the focus year added up month by month against the same running total of the other years
 * (median and p10..p90). A year only counts for a month while it has every month up to it, so a part-year never drags the usual down.
 */
export function seasonProgress(points: MonthlyPoint[], source: Source, focusYear: number | null): SeasonalMonth[] {
  const slots = new Map<number, (number | null)[]>();
  for (const p of points) {
    const row = slots.get(p.year) ?? Array<number | null>(12).fill(null);
    row[p.month - 1] = valueOf(p, source);
    slots.set(p.year, row);
  }
  const running = (row: (number | null)[]): (number | null)[] => {
    let sum = 0;
    let whole = true;
    return row.map((v) => {
      if (v === null) whole = false;
      else if (whole) sum += v;
      return whole ? sum : null;
    });
  };
  const sums = new Map([...slots].map(([year, row]) => [year, running(row)]));
  const mine = focusYear === null ? undefined : sums.get(focusYear);
  return Array.from({ length: 12 }, (_, i) => {
    const others = [...sums]
      .filter(([year]) => year !== focusYear)
      .map(([, row]) => row[i])
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);
    return { month: i + 1, p10: quantile(others, 0.1), median: quantile(others, 0.5), p90: quantile(others, 0.9), current: mine ? mine[i] : null };
  });
}

/** Real days in the months of a period (leap years included). */
export function daysInPeriod(range: DateRange): number {
  let [y, m] = range.start.split('-').map(Number);
  const [ey, em] = range.end.split('-').map(Number);
  let days = 0;
  while (y < ey || (y === ey && m <= em)) {
    days += new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (++m > 12) {
      m = 1;
      y += 1;
    }
  }
  return days;
}

export interface TopCell {
  h3: string;
  days: number;
  share: number; // of the days in the period
  lat: number;
  lon: number;
  /** Burns on most days of a long period: more likely a gas flare or industrial heat source than a vegetation fire. */
  persistent: boolean;
}

/** The n res7 cells with the most days of fire, busiest first. */
export function topCells(cells: HexCell[], periodDays: number, n: number): TopCell[] {
  return [...cells]
    .sort((a, b) => b.days - a.days || (a.h3 < b.h3 ? -1 : 1))
    .slice(0, n)
    .map((c) => {
      const [lat, lon] = cellToLatLng(c.h3);
      const share = periodDays > 0 ? c.days / periodDays : 0;
      return { h3: c.h3, days: c.days, share, lat, lon, persistent: periodDays >= 30 && share >= 0.6 };
    });
}

export interface MonthVsUsual {
  yearMonth: string;
  value: number;
  /** Median and p10..p90 of the same calendar month in the other years; null when there is no other year. */
  median: number | null;
  p10: number | null;
  p90: number | null;
}

/** Each month of a (short) period with the range its own calendar month usually has, to read them against each other. */
export function monthsVsUsual(period: MonthlyPoint[], all: MonthlyPoint[], source: Source): MonthVsUsual[] {
  const out: MonthVsUsual[] = [];
  for (const p of period) {
    const value = valueOf(p, source);
    if (value === null) continue;
    const others = all
      .filter((q) => q.month === p.month && q.year !== p.year)
      .map((q) => valueOf(q, source))
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);
    out.push({ yearMonth: p.yearMonth, value, median: quantile(others, 0.5), p10: quantile(others, 0.1), p90: quantile(others, 0.9) });
  }
  return out;
}
