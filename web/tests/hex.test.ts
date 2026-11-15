import { cellToParent, getResolution, latLngToCell } from 'h3-js';
import { describe, expect, it } from 'vitest';
import { MockDataSource } from '../src/data/MockDataSource';
import { readFileSync } from 'node:fs';
import { cellToBoundary, cellToLatLng, gridDisk } from 'h3-js';
import { buildCountries } from '../src/lib/countries';
import { pointInGeometry } from '../src/lib/geo';
import { aggregateCells, hexColorExpression, hexGeoJson, hexOverlapsGeometry, hexStepIndex, hexSteps, viewportBox } from '../src/lib/hex';

describe('viewportBox', () => {
  const area = { west: 102, south: 8, east: 110, north: 24 };
  it('is the whole area when the map reports no view yet', () => {
    expect(viewportBox(area, null)).toBe(area);
  });
  it('covers the view with half a screen to spare, and stays inside the area', () => {
    const view = { west: 104, south: 14, east: 106, north: 16 };
    const box = viewportBox(area, view)!;
    expect(box.west).toBeLessThanOrEqual(103);
    expect(box.east).toBeGreaterThanOrEqual(107);
    expect(box.south).toBeLessThanOrEqual(13);
    expect(box.north).toBeGreaterThanOrEqual(17);
    expect(viewportBox(area, { west: 90, south: 0, east: 130, north: 40 })).toEqual(area);
  });
  it('still covers the view after a small pan, so the same request can be reused', () => {
    const a = viewportBox(area, { west: 104, south: 14, east: 106, north: 16 })!;
    expect(a.west).toBeLessThanOrEqual(104 - 0.5);
    expect(a.east).toBeGreaterThanOrEqual(106 + 0.5);
    expect(a.south).toBeLessThanOrEqual(14 - 0.5);
    expect(a.north).toBeGreaterThanOrEqual(16 + 0.5);
  });
  it('is null when the view does not touch the area', () => {
    expect(viewportBox(area, { west: 20, south: 0, east: 30, north: 10 })).toBeNull();
  });
});

describe('aggregateCells', () => {
  const a = latLngToCell(16.05, 108.2, 7);
  const b = latLngToCell(16.06, 108.21, 7);
  const far = latLngToCell(21.0, 105.8, 7);

  it('keeps res7 cells as they are', () => {
    expect(aggregateCells([{ h3: a, days: 3 }], 7)).toEqual([{ h3: a, value: 3 }]);
  });
  it('sums the cell-days of every res7 cell inside a bigger hexagon', () => {
    const out = aggregateCells([{ h3: a, days: 3 }, { h3: b, days: 4 }, { h3: far, days: 2 }], 3);
    const parentA = cellToParent(a, 3);
    expect(getResolution(out[0].h3)).toBe(3);
    expect(out.find((c) => c.h3 === parentA)!.value).toBe(cellToParent(b, 3) === parentA ? 7 : 3);
    expect(out.reduce((s, c) => s + c.value, 0)).toBe(9); // nothing is lost or counted twice
  });
  it('lists the busiest hexagons first', () => {
    const out = aggregateCells([{ h3: a, days: 1 }, { h3: far, days: 9 }], 7);
    expect(out.map((c) => c.value)).toEqual([9, 1]);
  });
});

describe('hexSteps', () => {
  it('gives five doubling steps for a month of days (max 31)', () => {
    expect(hexSteps(31).map((s) => s.min)).toEqual([1, 2, 4, 8, 16]);
    expect(hexSteps(31).map((s) => s.label)).toEqual(['1', '2–3', '4–7', '8–15', '16+']);
  });
  it('spreads five steps over a large range and never repeats a break', () => {
    const mins = hexSteps(5000).map((s) => s.min);
    expect(mins).toHaveLength(5);
    expect(mins[0]).toBe(1);
    expect(new Set(mins).size).toBe(5);
    expect([...mins].sort((x, y) => x - y)).toEqual(mins);
  });
  it('collapses to fewer steps when the values barely vary', () => {
    expect(hexSteps(1).map((s) => s.min)).toEqual([1]);
    expect(hexSteps(2).map((s) => s.min)).toEqual([1, 2]);
  });
  it('finds the step a value belongs to', () => {
    const steps = hexSteps(31);
    expect([1, 2, 3, 4, 7, 8, 15, 16, 31].map((v) => hexStepIndex(v, steps))).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
});

describe('hexColorExpression', () => {
  it('is a plain colour when there is a single step (a MapLibre step expression needs at least one stop)', () => {
    expect(hexColorExpression(hexSteps(1))).toBe(hexSteps(1)[0].color);
  });
  it('colours by step otherwise, one stop per extra step', () => {
    const steps = hexSteps(31);
    expect(hexColorExpression(steps)).toEqual(['step', ['get', 'value'], steps[0].color, 2, steps[1].color, 4, steps[2].color, 8, steps[3].color, 16, steps[4].color]);
  });
});

describe('hexGeoJson', () => {
  it('draws each H3 cell as a closed polygon carrying its value', () => {
    const a = latLngToCell(16.05, 108.2, 7);
    const b = latLngToCell(21.0, 105.8, 7);
    const fc = hexGeoJson([{ h3: a, value: 3 }, { h3: b, value: 12 }]);
    expect(fc.features).toHaveLength(2);
    const ring = (fc.features[0].geometry as GeoJSON.Polygon).coordinates[0];
    expect(ring).toHaveLength(7); // six corners plus the closing point
    expect(ring[0]).toEqual(ring[6]);
    expect(fc.features.map((f) => f.properties!.value)).toEqual([3, 12]);
    // Corners are [lng, lat]: Da Nang is near 108 E, 16 N.
    expect(Math.abs(ring[0][0] - 108.2)).toBeLessThan(0.2);
    expect(Math.abs(ring[0][1] - 16.05)).toBeLessThan(0.2);
  });
});

describe('MockDataSource.hexes', () => {
  const bbox = { west: 98, south: 12, east: 108, north: 22 };
  it('returns H3 res7 cells whose days stay within the month', async () => {
    const h = await new MockDataSource().hexes(bbox, { start: '2026-09', end: '2026-09' }, 'harmonized');
    expect(h.cells.length).toBeGreaterThan(50);
    expect(h.total).toBe(h.cells.length);
    expect(h.used).toBe(h.cells.length);
    for (const c of h.cells) {
      expect(c.h3).toMatch(/^87[0-9a-f]{13}$/); // resolution 7 cell index
      expect(c.days).toBeGreaterThanOrEqual(1);
      expect(c.days).toBeLessThanOrEqual(30);
    }
    expect(h.cells.some((c) => c.days > 1)).toBe(true);
  });
  it('a longer period piles up more days in the busy cells than one month does', async () => {
    const ds = new MockDataSource();
    const month = await ds.hexes(bbox, { start: '2026-09', end: '2026-09' }, 'harmonized');
    const year = await ds.hexes(bbox, { start: '2025-10', end: '2026-09' }, 'harmonized');
    const top = (h: { cells: { days: number }[] }) => Math.max(...h.cells.map((c) => c.days));
    expect(top(year)).toBeGreaterThan(top(month));
    expect(year.cells.length).toBeGreaterThanOrEqual(month.cells.length);
  });
  it('one day gives single-day cells and fewer cells than the whole month', async () => {
    const ds = new MockDataSource();
    const month = await ds.hexes(bbox, { start: '2026-09', end: '2026-09' }, 'harmonized');
    const day = await ds.hexes(bbox, { start: '2026-09', end: '2026-09' }, 'harmonized', 12);
    expect(day.cells.length).toBeGreaterThan(0);
    expect(day.cells.length).toBeLessThan(month.cells.length);
    expect(day.cells.every((c) => c.days === 1)).toBe(true);
  });
});


describe('hexOverlapsGeometry', () => {
  const vietnam = buildCountries(JSON.parse(readFileSync('node_modules/world-atlas/countries-50m.json', 'utf-8'))).find((c) => c.name === 'Vietnam')!.geometry;
  // Walk the coast near Da Nang at res 4 to find a hexagon whose centre is in the sea but which still reaches land.
  const around = gridDisk(latLngToCell(16.05, 108.5, 4), 4);
  const centreIn = (h: string) => { const [lat, lon] = cellToLatLng(h); return pointInGeometry(lon, lat, vietnam); };
  const reachesLand = (h: string) => cellToBoundary(h, true).some(([x, y]) => pointInGeometry(x, y, vietnam));

  it('keeps a hexagon whose centre is inside the country', () => {
    const inside = around.find(centreIn)!;
    expect(hexOverlapsGeometry(inside, vietnam)).toBe(true);
  });
  it('keeps a coastal hexagon whose centre is in the sea but whose edge reaches the land', () => {
    const sliver = around.find((h) => !centreIn(h) && reachesLand(h));
    expect(sliver).toBeDefined();
    expect(hexOverlapsGeometry(sliver!, vietnam)).toBe(true);
  });
  it('drops a hexagon far from the country', () => {
    expect(hexOverlapsGeometry(latLngToCell(40, 10, 4), vietnam)).toBe(false);
  });
});

describe('MockDataSource.hexes at a coarser resolution', () => {
  const bbox = { west: 98, south: 12, east: 108, north: 22 };
  it('merges the cells into bigger hexagons without losing a day', async () => {
    const ds = new MockDataSource();
    const range = { start: '2026-09', end: '2026-09' };
    const fine = await ds.hexes(bbox, range, 'harmonized');
    const coarse = await ds.hexes(bbox, range, 'harmonized', undefined, { res: 4 });
    expect(coarse.cells.length).toBeLessThan(fine.cells.length);
    expect(coarse.cells.every((c) => getResolution(c.h3) === 4)).toBe(true);
    expect(coarse.cells.reduce((s, c) => s + c.days, 0)).toBe(fine.cells.reduce((s, c) => s + c.days, 0));
  });
  it('keeps only the busiest when a limit is given', async () => {
    const ds = new MockDataSource();
    const h = await ds.hexes(bbox, { start: '2026-09', end: '2026-09' }, 'harmonized', undefined, { limit: 5 });
    expect(h.cells).toHaveLength(5);
    expect(h.total).toBeGreaterThan(5);
    expect(h.cells[0].days).toBeGreaterThanOrEqual(h.cells[4].days);
  });
});
