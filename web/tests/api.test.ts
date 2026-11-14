import { describe, expect, it } from 'vitest';
import { ApiDataSource } from '../src/data/ApiDataSource';

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
    expect(await new ApiDataSource('', a.fn).hexes(bbox, '2026-09', 'viirs', 5)).toEqual(sample);
    expect(a.calls[0]).toBe('/api/hexes?west=98&south=12&east=108&north=22&ym=2026-09&source=viirs&day=5');
    const b = fake(sample);
    await new ApiDataSource('', b.fn).hexes(bbox, '2026-09', 'harmonized');
    expect(b.calls[0]).toBe('/api/hexes?west=98&south=12&east=108&north=22&ym=2026-09&source=harmonized');
  });

  it('reads /api/meta', async () => {
    const meta = { version: 'v', method: 'm', source: 's', gridDeg: 1, updated: '2026-01-01', firstMonth: '2000-11', lastMonth: '2026-10', isMock: true };
    const { fn, calls } = fake(meta);
    expect(await new ApiDataSource('', fn).meta()).toEqual(meta);
    expect(calls).toEqual(['/api/meta']);
  });

  it('throws with the status when the server refuses, so the page can show its error state', async () => {
    const { fn } = fake({ detail: 'Invalid box' }, 422);
    await expect(new ApiDataSource('', fn).monthly(bbox)).rejects.toThrow('422');
  });
});
