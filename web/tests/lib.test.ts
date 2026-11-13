import { describe, expect, it } from 'vitest';
import { aggregateMonthly } from '../src/lib/aggregate';
import { anomalyPct, computeKpis, median, medianForMonth } from '../src/lib/stats';
import { buildCsv } from '../src/lib/csv';
import type { MonthRecord, MonthlyPoint } from '../src/data/types';

const rec = (cellId: string, yearMonth: string, h: number, extra: Partial<MonthRecord> = {}): MonthRecord => ({
  cellId, lat: 0, lon: 0, yearMonth, modisRaw: h, viirsRaw: null, harmonized: h,
  method: 'modis_only', scaleFactor: null, inCalibration: false, dataStatus: 'standard', ...extra,
});

describe('median / anomaly', () => {
  it('handles odd, even and empty', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
  it('anomaly percent', () => {
    expect(anomalyPct(150, 100)).toBe(50);
    expect(anomalyPct(50, 100)).toBe(-50);
    expect(anomalyPct(10, 0)).toBeNull();
    expect(anomalyPct(null, 5)).toBeNull();
  });
});

describe('aggregateMonthly', () => {
  it('sums cells per month, filters range, flags nrt', () => {
    const recs = [
      rec('a', '2020-01', 5), rec('b', '2020-01', 7, { dataStatus: 'nrt' }),
      rec('a', '2020-02', 1), rec('a', '2021-01', 9),
    ];
    const pts = aggregateMonthly(recs, { start: '2020-01', end: '2020-12' });
    expect(pts.map((p) => p.yearMonth)).toEqual(['2020-01', '2020-02']);
    expect(pts[0].harmonized).toBe(12);
    expect(pts[0].cells).toBe(2);
    expect(pts[0].anyNrt).toBe(true);
    expect(pts[1].anyNrt).toBe(false);
  });
});

describe('KPIs', () => {
  const pts: MonthlyPoint[] = aggregateMonthly([
    rec('a', '2019-09', 100), rec('a', '2020-09', 300), rec('a', '2021-09', 200),
    rec('a', '2019-03', 10), rec('a', '2020-03', 10), rec('a', '2021-03', 10),
  ]);
  it('historical median excludes the compared year', () => {
    expect(medianForMonth(pts, 'harmonized', 9, 2021)).toBe(200);
  });
  it('computes current vs median, peak month and year', () => {
    const k = computeKpis(pts, 'harmonized');
    expect(k.currentMonth).toBe('2021-09');
    expect(k.currentAnomalyPct).toBe(0); // 200 vs median(100,300)=200
    expect(k.peakMonth).toBe(9);
    expect(k.peakYear).toBe(2020);
    expect(k.total).toBe(630);
  });
});

describe('csv', () => {
  it('contains provenance header and rows', () => {
    const pts = aggregateMonthly([rec('a', '2020-01', 5)]);
    const csv = buildCsv(
      pts,
      { version: 'v1', method: 'm', source: 's', gridDeg: 1, updated: '', firstMonth: '', lastMonth: '', isMock: false },
      { west: 0, south: 0, east: 1, north: 1 },
      { start: '2020-01', end: '2020-12' },
      'harmonized',
    );
    expect(csv).toContain('# dataset_version: v1');
    expect(csv).toContain('year_month,modis_raw');
    expect(csv).toContain('2020-01,5,,5,modis_only');
  });
});
