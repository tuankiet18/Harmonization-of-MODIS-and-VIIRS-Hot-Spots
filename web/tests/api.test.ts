import { describe, expect, it } from 'vitest';
import { ApiDataSource, ApiError } from '../src/data/ApiDataSource';

const bbox = { west: 98, south: 12, east: 108, north: 22 };

/** A fake fetch that records the URL it was given and answers with `body`. */
function fake(body: unknown, status = 200) {
  const calls: string[] = [];
  const fn = (async (url: string) => {
    calls.push(url);
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('ApiDataSource', () => {
  it('asks /api/monthly for the box and returns the rows untouched', async () => {
    const rows = [{ yearMonth: '2020-03', year: 2020, month: 3, modis: 1, viirs: null, harmonized: 1, cells: 4, anyNrt: false, allInCalibration: true, methods: ['modis_scaled'], scaleFactor: null }];
    const { fn, calls } = fake(rows);
    expect(await new ApiDataSource('', fn).monthly(bbox)).toEqual(rows);
    expect(calls).toEqual(['/api/monthly?west=98&south=12&east=108&north=22']);
  });

  it('uses the base URL and asks for one month of daily totals', async () => {
    const { fn, calls } = fake([{ day: 1, modis: 2, viirs: null, harmonized: 2 }]);
    const days = await new ApiDataSource('https://x.test', fn).daily(bbox, '2024-03');
    expect(days).toHaveLength(1);
    expect(calls[0]).toBe('https://x.test/api/daily?west=98&south=12&east=108&north=22&ym=2024-03');
  });

  it('passes series and day to /api/hexes only when given', async () => {
    const sample = { cells: [{ h3: '8765a8d9bffffff', days: 3 }], total: 9, used: 9 };
    const a = fake(sample);
    expect(await new ApiDataSource('', a.fn).hexes(bbox, { start: '2026-09', end: '2026-09' }, 'viirs', 5)).toEqual(sample);
    expect(a.calls[0]).toBe('/api/hexes?west=98&south=12&east=108&north=22&from=2026-09&to=2026-09&source=viirs&day=5');
    const b = fake(sample);
    await new ApiDataSource('', b.fn).hexes(bbox, { start: '2020-01', end: '2022-12' }, 'harmonized');
    expect(b.calls[0]).toBe('/api/hexes?west=98&south=12&east=108&north=22&from=2020-01&to=2022-12&source=harmonized');
  });

  it('asks the server for hexagons of a resolution and for at most so many', async () => {
    const { fn, calls } = fake({ cells: [], total: 0, used: 0 });
    await new ApiDataSource('', fn).hexes(bbox, { start: '2020-01', end: '2020-12' }, 'harmonized', undefined, { res: 4, limit: 300 });
    expect(calls[0]).toBe('/api/hexes?west=98&south=12&east=108&north=22&from=2020-01&to=2020-12&source=harmonized&res=4&limit=300');
  });

  it('reads /api/meta', async () => {
    const meta = { version: 'v', method: 'm', source: 's', gridDeg: 1, updated: '2026-01-01', firstMonth: '2000-11', lastMonth: '2026-10', isMock: true };
    const { fn, calls } = fake(meta);
    expect(await new ApiDataSource('', fn).meta()).toEqual(meta);
    expect(calls).toEqual(['/api/meta']);
  });

  it('asks /api/analog for the box, and for a year and month only when given', async () => {
    const result = { targetYear: 2026, cutoffMonth: 10, cutoffWeek: 43, years: [2001, 2026], ranking: [], targetFrp: [], series: [], source: 's', method: 'm', isMock: true };
    const a = fake(result);
    expect(await new ApiDataSource('', a.fn).analog(bbox)).toEqual(result);
    expect(a.calls[0]).toBe('/api/analog?west=98&south=12&east=108&north=22');
    const b = fake(result);
    await new ApiDataSource('', b.fn).analog(bbox, { year: 2018, cutoffMonth: 6 });
    expect(b.calls[0]).toBe('/api/analog?west=98&south=12&east=108&north=22&year=2018&cutoff=6');
  });

  it('keeps the status on the error, so a view can tell "no data here" from a broken service', async () => {
    const { fn } = fake({ detail: 'No data' }, 404);
    const err = await new ApiDataSource('', fn).analog(bbox).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(404);
  });

  it('throws with the status when the server refuses, so the page can show its error state', async () => {
    const { fn } = fake({ detail: 'Invalid box' }, 422);
    await expect(new ApiDataSource('', fn).monthly(bbox)).rejects.toThrow('422');
  });
});
