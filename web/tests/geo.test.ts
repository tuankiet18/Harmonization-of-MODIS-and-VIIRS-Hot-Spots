import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Polygon } from 'geojson';
import { buildCountries } from '../src/lib/countries';
import { countryMask, mainBbox, pointInGeometry } from '../src/lib/geo';

const square = (w: number, s: number, e: number, n: number) => [[w, s], [e, s], [e, n], [w, n], [w, s]];

describe('pointInGeometry', () => {
  const donut: Polygon = { type: 'Polygon', coordinates: [square(0, 0, 10, 10), square(4, 4, 6, 6)] };
  it('is true inside the outer ring and false outside it', () => {
    expect(pointInGeometry(1, 1, donut)).toBe(true);
    expect(pointInGeometry(11, 5, donut)).toBe(false);
    expect(pointInGeometry(-1, -1, donut)).toBe(false);
  });
  it('is false inside a hole', () => {
    expect(pointInGeometry(5, 5, donut)).toBe(false);
    expect(pointInGeometry(3.9, 5, donut)).toBe(true);
  });
  it('checks every polygon of a multipolygon', () => {
    const two = { type: 'MultiPolygon' as const, coordinates: [[square(0, 0, 1, 1)], [square(20, 20, 21, 21)]] };
    expect(pointInGeometry(0.5, 0.5, two)).toBe(true);
    expect(pointInGeometry(20.5, 20.5, two)).toBe(true);
    expect(pointInGeometry(10, 10, two)).toBe(false);
  });
});

describe('rings that cross the date line', () => {
  // A Fiji-like ring: it runs from 178 E over the date line to 179 W.
  const fiji: Polygon = { type: 'Polygon', coordinates: [[[178, -18], [-179, -18], [-179, -16], [178, -16], [178, -18]]] };
  it('keeps the box on one side instead of wrapping the whole world', () => {
    expect(mainBbox(fiji)).toEqual({ west: 178, south: -18, east: 180, north: -16 });
  });
  it('finds points on both sides of the date line', () => {
    expect(pointInGeometry(179, -17, fiji)).toBe(true);
    expect(pointInGeometry(-179.5, -17, fiji)).toBe(true);
    expect(pointInGeometry(0, -17, fiji)).toBe(false);
    expect(pointInGeometry(179, -10, fiji)).toBe(false);
  });
});

describe('countryMask', () => {
  it('is the world with the country cut out, so the outside can be dimmed', () => {
    const m = countryMask({ type: 'MultiPolygon', coordinates: [[square(0, 0, 10, 10)], [square(20, 20, 21, 21)]] })!;
    const rings = (m.geometry as Polygon).coordinates;
    expect(rings).toHaveLength(3); // the world, then one hole per polygon of the country
    expect(rings[0]).toEqual([[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]);
    expect(rings[1]).toEqual(square(0, 0, 10, 10));
  });
  it('is skipped for a country that crosses the date line, where a hole would smear across the map', () => {
    expect(countryMask({ type: 'Polygon', coordinates: [[[178, -18], [-179, -18], [-179, -16], [178, -16], [178, -18]]] })).toBeNull();
  });
});

describe('mainBbox', () => {
  it('leaves far-away islands out of the box, but keeps near ones', () => {
    const g = { type: 'MultiPolygon' as const, coordinates: [[square(0, 0, 10, 10)], [square(12, 2, 14, 4)], [square(100, 50, 101, 51)]] };
    expect(mainBbox(g)).toEqual({ west: 0, south: 0, east: 14, north: 10 });
  });
  it('keeps a lone polygon as is', () => {
    expect(mainBbox({ type: 'Polygon', coordinates: [square(-5, -6, 7, 8)] })).toEqual({ west: -5, south: -6, east: 7, north: 8 });
  });
});

describe('buildCountries (Natural Earth 50m from world-atlas)', () => {
  const topology = JSON.parse(readFileSync('node_modules/world-atlas/countries-50m.json', 'utf-8'));
  const countries = buildCountries(topology);
  const by = (name: string) => countries.find((c) => c.name === name)!;

  it('lists every country once, sorted by name, each with a stable id', () => {
    expect(countries.length).toBeGreaterThan(170);
    expect(new Set(countries.map((c) => c.id)).size).toBe(countries.length);
    expect(by('Australia').id).toBe('036'); // the Ashmore and Cartier Is. share its code and get their name instead
    expect(countries.map((c) => c.name)).toEqual([...countries.map((c) => c.name)].sort((a, b) => a.localeCompare(b)));
    expect(by('Vietnam').id).toBe('704');
  });
  it('gives Vietnam a tight box', () => {
    const b = by('Vietnam').bbox;
    expect(b.west).toBeGreaterThan(101.5);
    expect(b.west).toBeLessThan(103.5);
    expect(b.east).toBeGreaterThan(108.5);
    expect(b.east).toBeLessThan(110);
    expect(b.south).toBeGreaterThan(8);
    expect(b.south).toBeLessThan(9.5);
    expect(b.north).toBeGreaterThan(22.5);
    expect(b.north).toBeLessThan(24);
  });
  it('fits metropolitan France, not its overseas territories', () => {
    const b = by('France').bbox;
    expect(b.west).toBeGreaterThan(-6);
    expect(b.east).toBeLessThan(10);
    expect(b.north).toBeLessThan(52);
  });
  it('never wraps around the date line (west < east, inside -180..180)', () => {
    for (const c of countries) {
      expect(c.bbox.west).toBeLessThan(c.bbox.east);
      expect(c.bbox.west).toBeGreaterThanOrEqual(-180);
      expect(c.bbox.east).toBeLessThanOrEqual(180);
    }
    expect(by('Russia').bbox.west).toBeGreaterThan(15);
    expect(by('United States of America').bbox.north).toBeGreaterThan(70); // Alaska is kept
  });
  it('knows which side of a border a point is on', () => {
    const vn = by('Vietnam').geometry;
    expect(pointInGeometry(105.8, 21.0, vn)).toBe(true); // Hanoi
    expect(pointInGeometry(102.6, 17.97, vn)).toBe(false); // Vientiane, in Laos
    expect(pointInGeometry(104.9, 11.55, vn)).toBe(false); // Phnom Penh, in Cambodia
  });
});
