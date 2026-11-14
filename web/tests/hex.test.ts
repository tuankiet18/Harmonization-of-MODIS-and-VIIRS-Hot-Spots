import { cellToParent, getResolution, latLngToCell } from 'h3-js';
import { describe, expect, it } from 'vitest';
import { MockDataSource } from '../src/data/MockDataSource';
import { aggregateCells, hexColorExpression, hexGeoJson, hexResolution, hexResolutionForZoom, hexStepIndex, hexSteps } from '../src/lib/hex';

describe('hexResolution', () => {
  it('uses bigger hexagons for bigger areas so they stay visible on screen', () => {
    const box = (span: number) => ({ west: 100, south: 10, east: 100 + span, north: 10 + span / 2 });
    expect([0.3, 1, 3, 8, 20, 60].map((s) => hexResolution(box(s)))).toEqual([7, 6, 5, 4, 3, 3]);
  });
  it('uses the biggest hexagons when there is no area', () => {
    expect(hexResolution(null)).toBe(3);
  });
});

describe('hexResolutionForZoom', () => {
  it('keeps hexagons about 10 px wide: coarser when zoomed out, down to the data cell (res7) when zoomed in', () => {
    // MapLibre zoom at Vietnam's latitude: a country-sized view is about 4.5.
    expect([[4.5, 16], [6, 16], [7, 16], [8, 16], [10, 16]].map(([z, lat]) => hexResolutionForZoom(z, lat))).toEqual([4, 5, 6, 7, 7]);
  });
  it('never goes coarser than res3, even for a world view', () => {
    expect(hexResolutionForZoom(0.5, 0)).toBe(3);
  });
  it('picks a finer hexagon at the same zoom nearer the poles, where the map is stretched', () => {
    expect(hexResolutionForZoom(5, 70)).toBeGreaterThan(hexResolutionForZoom(5, 0));
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
    const h = await new MockDataSource().hexes(bbox, '2026-09', 'harmonized');
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
  it('one day gives single-day cells and fewer cells than the whole month', async () => {
    const ds = new MockDataSource();
    const month = await ds.hexes(bbox, '2026-09', 'harmonized');
    const day = await ds.hexes(bbox, '2026-09', 'harmonized', 12);
    expect(day.cells.length).toBeGreaterThan(0);
    expect(day.cells.length).toBeLessThan(month.cells.length);
    expect(day.cells.every((c) => c.days === 1)).toBe(true);
  });
});
