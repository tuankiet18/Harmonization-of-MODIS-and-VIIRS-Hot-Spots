import { describe, expect, it } from 'vitest';
import type { MonthlyPoint } from '../src/data/types';
import { annualTotals, quantile, seasonalProfile } from '../src/lib/stats';

const pt = (ym: string, h: number | null): MonthlyPoint => ({
  yearMonth: ym, year: Number(ym.slice(0, 4)), month: Number(ym.slice(5)), modis: h, viirs: null, harmonized: h,
  cells: 1, anyNrt: false, allInCalibration: false, methods: ['modis_scaled'], scaleFactor: null,
});

describe('quantile', () => {
  it('interpolates between neighbours of a sorted list', () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile([1, 2, 3, 4, 5], 0.1)).toBeCloseTo(1.4);
    expect(quantile([1, 2, 3, 4, 5], 0.9)).toBeCloseTo(4.6);
    expect(quantile([7], 0.9)).toBe(7);
    expect(quantile([], 0.5)).toBeNull();
  });
});

describe('seasonalProfile', () => {
  // January over five years: 10, 20, 30, 40, 50 (2020 is the year in focus).
  const points = [10, 20, 30, 40, 50].flatMap((v, i) => [pt(`${2016 + i}-01`, v), pt(`${2016 + i}-02`, v * 2)]);

  it('gives twelve months, with the band built from the OTHER years and the focus year as its own line', () => {
    const p = seasonalProfile(points, 'harmonized', 2020);
    expect(p).toHaveLength(12);
    expect(p[0]).toMatchObject({ month: 1, current: 50 });
    expect(p[0].median).toBe(25); // 10, 20, 30, 40 without 2020
    expect(p[0].p10).toBeCloseTo(13);
    expect(p[0].p90).toBeCloseTo(37);
    expect(p[1].current).toBe(100);
  });
  it('leaves months without data empty instead of zero', () => {
    const p = seasonalProfile(points, 'harmonized', 2020);
    expect(p[5]).toEqual({ month: 6, p10: null, median: null, p90: null, current: null });
  });
  it('uses every year when there is no year in focus, and ignores missing values', () => {
    const p = seasonalProfile([...points, pt('2021-01', null)], 'harmonized', null);
    expect(p[0].median).toBe(30);
    expect(p[0].current).toBeNull();
  });
});

describe('annualTotals', () => {
  it('sums each year and says how many months it holds, so partial years can be told apart', () => {
    const t = annualTotals([pt('2019-11', 5), pt('2019-12', 7), pt('2020-01', 1), pt('2020-02', null), pt('2020-03', 2)], 'harmonized');
    expect(t).toEqual([
      { year: 2019, total: 12, months: 2 },
      { year: 2020, total: 3, months: 2 },
    ]);
  });
  it('is empty for no data', () => {
    expect(annualTotals([], 'harmonized')).toEqual([]);
  });
});

import { computeKpis, periodAnomaly } from '../src/lib/stats';

describe('periodAnomaly', () => {
  // January is 10 in 2018 and 2019 and 40 in 2020; February is 20, 20, 20.
  const all = [pt('2018-01', 10), pt('2019-01', 10), pt('2020-01', 40), pt('2018-02', 20), pt('2019-02', 20), pt('2020-02', 20)];

  it('compares each month of the period with the same month in the other years, then adds it up', () => {
    // 2020: January 40 against a usual 10, February 20 against 20.
    const a = periodAnomaly(all.filter((p) => p.year === 2020), all, 'harmonized');
    expect(a).toMatchObject({ total: 60, compared: 60, expected: 30, months: 2 });
    expect(a.pct).toBeCloseTo(100);
  });
  it('counts the total even for months that have nothing to be compared with', () => {
    const lone = [pt('2020-01', 40)];
    const a = periodAnomaly(lone, lone, 'harmonized');
    expect(a).toMatchObject({ total: 40, compared: 0, expected: 0, months: 0, pct: null });
  });
  it('gives nothing to compare for an empty period', () => {
    expect(periodAnomaly([], all, 'harmonized')).toMatchObject({ total: 0, pct: null, months: 0 });
  });
});

describe('computeKpis busiest month', () => {
  it('names the month of the period with the highest value', () => {
    const k = computeKpis([pt('2020-01', 5), pt('2020-02', 50), pt('2020-03', 7)], 'harmonized');
    expect(k.busiest).toEqual({ yearMonth: '2020-02', value: 50 });
  });
  it('is null when there is no data', () => {
    expect(computeKpis([], 'harmonized').busiest).toBeNull();
  });
});

import { latLngToCell } from 'h3-js';
import { anomalySeries, daysInPeriod, seasonProgress, topCells } from '../src/lib/stats';

describe('anomalySeries', () => {
  const all = [pt('2018-01', 10), pt('2019-01', 10), pt('2020-01', 40), pt('2018-02', 20), pt('2019-02', 20), pt('2020-02', null)];
  it('sets each month of the period against the median of the same month in the other years', () => {
    const s = anomalySeries([pt('2020-01', 40)], all, 'harmonized');
    expect(s).toEqual([{ yearMonth: '2020-01', value: 40, median: 10, pct: 300 }]);
  });
  it('skips months without a value and leaves pct empty when there is nothing to compare with', () => {
    const lone = [pt('2020-01', 5), pt('2020-02', null)];
    expect(anomalySeries(lone, lone, 'harmonized')).toEqual([{ yearMonth: '2020-01', value: 5, median: null, pct: null }]);
  });
});

describe('seasonProgress', () => {
  const y = (year: number, v: (number | null)[]) => v.map((x, i) => pt(`${year}-${String(i + 1).padStart(2, '0')}`, x));
  const points = [...y(2018, [1, 1, 1]), ...y(2019, [2, 2, 2]), ...y(2020, [3, 3]), ...y(2021, [null, 9, 9])];

  it('adds the focus year up month by month and stops where its data stops', () => {
    const p = seasonProgress(points, 'harmonized', 2020);
    expect(p.map((m) => m.current).slice(0, 4)).toEqual([3, 6, null, null]);
  });
  it('builds the usual from the other years that have every month so far', () => {
    const p = seasonProgress(points, 'harmonized', 2020);
    // 2018 adds up to 1, 2, 3 and 2019 to 2, 4, 6; 2021 has no January, so it never counts.
    expect(p.slice(0, 3).map((m) => m.median)).toEqual([1.5, 3, 4.5]);
    expect(p[0].p10).toBeCloseTo(1.1);
    expect(p[0].p90).toBeCloseTo(1.9);
    expect(p[3].median).toBeNull();
  });
});

describe('daysInPeriod', () => {
  it('counts the real days of the months, leap years included', () => {
    expect(daysInPeriod({ start: '2020-02', end: '2020-03' })).toBe(60);
    expect(daysInPeriod({ start: '2021-02', end: '2021-02' })).toBe(28);
  });
});

describe('topCells', () => {
  const a = latLngToCell(16.05, 108.2, 7);
  const b = latLngToCell(21.0, 105.8, 7);
  const c = latLngToCell(10.8, 106.7, 7);
  const cells = [{ h3: b, days: 5 }, { h3: a, days: 30 }, { h3: c, days: 12 }];

  it('lists the busiest cells first, with their place and share of the period', () => {
    const t = topCells(cells, 40, 2);
    expect(t.map((x) => x.h3)).toEqual([a, c]);
    expect(t[0].share).toBeCloseTo(0.75);
    expect(Math.abs(t[0].lat - 16.05)).toBeLessThan(0.1);
    expect(Math.abs(t[0].lon - 108.2)).toBeLessThan(0.1);
  });
  it('flags a cell that burns on most days of a long enough period as a possible static heat source', () => {
    const t = topCells(cells, 40, 3);
    expect(t.map((x) => x.persistent)).toEqual([true, false, false]);
  });
  it('flags nothing for a short period, where a high share proves little', () => {
    expect(topCells([{ h3: a, days: 20 }], 20, 1)[0].persistent).toBe(false);
  });
});
