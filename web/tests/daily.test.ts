import { describe, expect, it } from 'vitest';
import { MockDataSource } from '../src/data/MockDataSource';
import { aggregateMonthly } from '../src/lib/aggregate';

const bbox = { west: 98, south: 12, east: 108, north: 22 };

describe('daily split', () => {
  it('days add up to the monthly totals', async () => {
    const ds = new MockDataSource();
    const monthly = aggregateMonthly(await ds.query(bbox));
    for (const ym of ['2005-03', '2019-09', '2026-10']) {
      const m = monthly.find((p) => p.yearMonth === ym)!;
      const days = await ds.daily(bbox, ym);
      const sum = (k: 'modis' | 'viirs' | 'harmonized') => days.reduce((a, d) => a + (d[k] ?? 0), 0);
      expect(sum('modis')).toBe(m.modis ?? 0);
      expect(sum('viirs')).toBe(m.viirs ?? 0);
      expect(sum('harmonized')).toBeCloseTo(m.harmonized ?? 0, 0);
    }
  });
  it('has the right number of days and no VIIRS before 2012', async () => {
    const ds = new MockDataSource();
    await ds.query(bbox);
    expect((await ds.daily(bbox, '2020-02')).length).toBe(29);
    expect((await ds.daily(bbox, '2005-03')).every((d) => d.viirs === null)).toBe(true);
  });
  it('a day on the map reports that day total', async () => {
    const ds = new MockDataSource();
    await ds.query(bbox);
    const days = await ds.daily(bbox, '2019-09');
    const s = await ds.points(bbox, '2019-09', 'modis', 7);
    expect(s.total).toBe(days[6].modis);
  });
});
