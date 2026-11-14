import { describe, expect, it } from 'vitest';
import { MockDataSource } from '../src/data/MockDataSource';

const bbox = { west: -66, south: -14, east: -52, north: -4 };

describe('demo data follows the data team method', () => {
  it('before 2013 the series is MODIS times a factor, from 2013 it is VIIRS as is', async () => {
    const recs = await new MockDataSource().query(bbox);
    expect(recs.length).toBeGreaterThan(1000);
    for (const r of recs) {
      if (r.yearMonth < '2013-01') {
        expect(r.method).toBe('modis_scaled');
        expect(r.scaleFactor).toBeGreaterThan(0);
        expect(Math.abs(r.harmonized! - r.modisRaw! * r.scaleFactor!)).toBeLessThan(r.modisRaw! * 0.0006 + 0.06);
      } else {
        expect(r.method).toBe('viirs_native');
        expect(r.scaleFactor).toBeNull();
        expect(r.harmonized).toBe(r.viirsRaw);
      }
    }
  });

  it('the factor belongs to the calendar month, not to the year', async () => {
    const recs = await new MockDataSource().query(bbox);
    const cell = recs[0].cellId;
    const mine = recs.filter((r) => r.cellId === cell && r.method === 'modis_scaled');
    const byMonth = new Map<string, Set<number | null>>();
    for (const r of mine) {
      const m = r.yearMonth.slice(5);
      byMonth.set(m, (byMonth.get(m) ?? new Set()).add(r.scaleFactor));
    }
    expect(byMonth.size).toBe(12);
    for (const s of byMonth.values()) expect(s.size).toBe(1);
  });

  it('marks 2013-2022 as the calibration window', async () => {
    const recs = await new MockDataSource().query(bbox);
    for (const r of recs) expect(r.inCalibration).toBe(r.yearMonth >= '2013-01' && r.yearMonth <= '2022-12');
  });
});
