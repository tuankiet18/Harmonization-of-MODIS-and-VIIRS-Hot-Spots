import { describe, expect, it } from 'vitest';
import { aggregateMonthly } from '../src/lib/aggregate';
import { anomalyPct, computeKpis, median, medianForMonth, verdictOf } from '../src/lib/stats';
import { buildCsv } from '../src/lib/csv';
import { activePreset, presetRange } from '../src/lib/range';
import { decodeState, encodeState } from '../src/lib/urlState';
import type { MonthRecord, MonthlyPoint } from '../src/data/types';

const rec = (cellId: string, yearMonth: string, h: number, extra: Partial<MonthRecord> = {}): MonthRecord => ({
  cellId, lat: 0, lon: 0, yearMonth, modisRaw: h, viirsRaw: null, harmonized: h,
  method: 'modis_scaled', scaleFactor: null, inCalibration: false, dataStatus: 'standard', ...extra,
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
    expect(csv).toContain('2020-01,5,,5,modis_scaled');
  });
});

describe('verdictOf', () => {
  it('unknown when there is no anomaly', () => {
    expect(verdictOf(null)).toBe('unknown');
  });
  it('typical inside +/-10 %', () => {
    expect(verdictOf(0)).toBe('typical');
    expect(verdictOf(9.99)).toBe('typical');
    expect(verdictOf(-9.99)).toBe('typical');
  });
  it('higher and lower at the 10 % boundary and beyond', () => {
    expect(verdictOf(10)).toBe('higher');
    expect(verdictOf(64)).toBe('higher');
    expect(verdictOf(-10)).toBe('lower');
  });
});

describe('period presets', () => {
  const limits = { min: '2000-11', max: '2026-10' };
  it('all years spans the whole record', () => {
    expect(presetRange(limits, 'all')).toEqual({ start: '2000-11', end: '2026-10' });
  });
  it('last N years is exactly 12*N months inclusive', () => {
    expect(presetRange(limits, 10)).toEqual({ start: '2016-11', end: '2026-10' });
    expect(presetRange(limits, 5)).toEqual({ start: '2021-11', end: '2026-10' });
  });
  it('never starts before the first month of data', () => {
    expect(presetRange({ min: '2024-01', max: '2026-10' }, 10).start).toBe('2024-01');
  });
  it('activePreset recognises presets and custom ranges', () => {
    expect(activePreset({ start: '2016-11', end: '2026-10' }, limits)).toBe(10);
    expect(activePreset({ start: '2000-11', end: '2026-10' }, limits)).toBe('all');
    expect(activePreset({ start: '2010-01', end: '2012-01' }, limits)).toBeNull();
  });
});

describe('share-link state', () => {
  const regions = { amazon: { west: -66, south: -14, east: -52, north: -4 } };
  const limits = { min: '2000-11', max: '2026-10' };
  const base = { regionId: 'amazon', countryId: null, bbox: regions.amazon, range: { start: '2000-11', end: '2026-10' }, source: 'harmonized' as const, month: null };

  it('omits everything that is a default', () => {
    expect(encodeState(base, limits)).toBe('area=amazon');
  });
  it('round-trips a preset area with range, series and month', () => {
    const s = { ...base, range: { start: '2015-01', end: '2020-12' }, source: 'viirs' as const, month: '2019-09' };
    expect(decodeState(encodeState(s, limits), regions, limits)).toEqual({
      regionId: 'amazon', bbox: regions.amazon, range: { start: '2015-01', end: '2020-12' }, source: 'viirs', month: '2019-09',
    });
  });
  it('round-trips a custom box and rounds it to 3 decimals', () => {
    const s = { ...base, regionId: 'custom', bbox: { west: 10.12345, south: -3, east: 20, north: 4.5 } };
    expect(encodeState(s, limits)).toBe('area=custom&bbox=10.123,-3,20,4.5');
    expect(decodeState('area=custom&bbox=10.123,-3,20,4.5', regions, limits).bbox).toEqual({ west: 10.123, south: -3, east: 20, north: 4.5 });
  });
  it('ignores junk instead of breaking the page', () => {
    expect(decodeState('area=atlantis&from=banana&src=x&month=2019-13', regions, limits)).toEqual({});
    expect(decodeState('area=custom&bbox=5,5,1,1', regions, limits)).toEqual({});
    expect(decodeState('from=2030-01&to=2031-01', regions, limits)).toEqual({});
  });
  it('round-trips a country by its id; the box is filled in once the borders are loaded', () => {
    const s = { ...base, regionId: 'country', countryId: '704', bbox: { west: 102, south: 8, east: 110, north: 24 } };
    expect(encodeState(s, limits)).toBe('area=country&country=704');
    expect(decodeState('area=country&country=704', regions, limits)).toEqual({ regionId: 'country', countryId: '704' });
    expect(decodeState('area=country', regions, limits)).toEqual({});
  });
  it('encodes no area as an empty area state', () => {
    expect(encodeState({ ...base, regionId: 'none', bbox: null }, limits)).toBe('area=none');
    expect(decodeState('area=none', regions, limits)).toEqual({ regionId: 'none', bbox: null });
  });
});
