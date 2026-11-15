import { describe, expect, it } from 'vitest';
import { factorsByMonth } from '../src/components/FactorChart';
import { buildDailyCsv } from '../src/lib/csv';
import type { MonthlyPoint } from '../src/data/types';

const point = (yearMonth: string, scaleFactor: number | null, method: MonthlyPoint['methods'][number]): MonthlyPoint => ({
  yearMonth,
  year: Number(yearMonth.slice(0, 4)),
  month: Number(yearMonth.slice(5)),
  modis: 1,
  viirs: null,
  harmonized: 1,
  cells: 1,
  anyNrt: false,
  allInCalibration: false,
  methods: [method],
  scaleFactor,
});

describe('factorsByMonth', () => {
  it('averages the MODIS to VIIRS factor of each calendar month over the converted years', () => {
    const f = factorsByMonth([point('2004-03', 3, 'modis_scaled'), point('2005-03', 4, 'modis_scaled'), point('2006-04', 2.5, 'modis_scaled')]);
    expect(f[2]).toBe(3.5);
    expect(f[3]).toBe(2.5);
    expect(f[0]).toBeNull();
  });
  it('ignores months that were not converted', () => {
    expect(factorsByMonth([point('2014-03', null, 'viirs_native')]).every((v) => v === null)).toBe(true);
  });
});

describe('buildDailyCsv', () => {
  it('writes one row per day with ISO dates, after a provenance header', () => {
    const meta = { version: 'v1', method: 'm', source: 's', gridDeg: 0, updated: '2026-01-01', firstMonth: '2000-11', lastMonth: '2025-12', isMock: false };
    const csv = buildDailyCsv([{ day: 1, modis: 2, viirs: 5, harmonized: 5 }, { day: 2, modis: null, viirs: null, harmonized: null }], '2023-03', meta, { west: 1, south: 2, east: 3, north: 4 }, 'harmonized');
    const lines = csv.trim().split('\n');
    expect(lines.filter((l) => l.startsWith('#')).length).toBeGreaterThan(5);
    expect(lines.slice(-3)).toEqual(['date,modis_raw,viirs_raw,harmonized', '2023-03-01,2,5,5', '2023-03-02,,,']);
  });
});
