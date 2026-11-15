import { cellToBoundary, cellToLatLng, cellToParent } from 'h3-js';
import type { Feature, FeatureCollection, Point, Polygon } from 'geojson';
import type { Bbox, HexCell } from '../data/types';
import { pointInGeometry, type CountryGeometry } from './geo';
import { BURN } from './theme';

/** A hexagon as drawn on the map. Its value is the fire cell-days of every res7 cell inside it (the app's unit). */
export interface HexValue {
  h3: string;
  value: number;
  /** Observations behind the value (temperature map only). */
  n?: number;
}

export interface HexStep {
  min: number;
  color: string;
  label: string;
}

/** Average hexagon area per H3 resolution, in km2. */
export const HEX_AREA_KM2: Record<number, number> = { 3: 12393, 4: 1770, 5: 253, 6: 36, 7: 5.16 };

/**
 * The part of the chosen area to ask the server for: the map's view plus half a screen on every side, snapped outward to a
 * grid so a small pan reuses the same request. Null when the view does not touch the area.
 */
export function viewportBox(area: Bbox, view: Bbox | null): Bbox | null {
  if (!view) return area;
  const w = view.east - view.west;
  const h = view.north - view.south;
  const snap = (v: number, step: number, up: boolean) => (up ? Math.ceil(v / step) * step : Math.floor(v / step) * step);
  const sx = 2 ** Math.floor(Math.log2(Math.max(w, 0.01) / 4));
  const sy = 2 ** Math.floor(Math.log2(Math.max(h, 0.01) / 4));
  const box = {
    west: Math.max(area.west, snap(view.west - w / 2, sx, false)),
    east: Math.min(area.east, snap(view.east + w / 2, sx, true)),
    south: Math.max(area.south, snap(view.south - h / 2, sy, false)),
    north: Math.min(area.north, snap(view.north + h / 2, sy, true)),
  };
  return box.west < box.east && box.south < box.north ? box : null;
}

/** Sum res7 cells into hexagons of the given resolution, busiest first. Nothing is lost: values add up to the same total. */
export function aggregateCells(cells: HexCell[], res: number): HexValue[] {
  const sums = new Map<string, number>();
  for (const c of cells) {
    const id = res === 7 ? c.h3 : cellToParent(c.h3, res);
    sums.set(id, (sums.get(id) ?? 0) + c.days);
  }
  return [...sums].map(([h3, value]) => ({ h3, value })).sort((a, b) => b.value - a.value || (a.h3 < b.h3 ? -1 : 1));
}

/** Up to five steps from 1 to `max`, spaced evenly on a log scale (1, 2, 4, 8, 16 for a month of days). */
export function hexSteps(max: number): HexStep[] {
  const mins = [1];
  for (let k = 1; k < 5; k++) {
    const v = Math.round(Math.max(1, max) ** (k / 5));
    if (v > mins[mins.length - 1]) mins.push(v);
  }
  const n = mins.length;
  return mins.map((min, i) => ({
    min,
    color: BURN[n === 1 ? 4 : 2 + Math.round((i * 4) / (n - 1))],
    label: i === n - 1 ? (n === 1 ? `${min}` : `${min}+`) : mins[i + 1] - 1 === min ? `${min}` : `${min}–${mins[i + 1] - 1}`,
  }));
}

/**
 * Legend steps for the temperature map, in degrees Celsius of the hottest bright_mir reading per cell (the middle half of a
 * day's cells lies between about 55 and 75). The first step has no lower edge.
 */
export const TEMP_STEPS: HexStep[] = [
  { min: -273, color: BURN[2], label: '<55' },
  { min: 55, color: BURN[3], label: '55–64' },
  { min: 65, color: BURN[4], label: '65–74' },
  { min: 75, color: BURN[5], label: '75–84' },
  { min: 85, color: BURN[6], label: '85+' },
];

/** Index of the step a value falls in. */
export function hexStepIndex(value: number, steps: HexStep[]): number {
  let i = 0;
  steps.forEach((s, k) => {
    if (value >= s.min) i = k;
  });
  return i;
}

/** MapLibre fill colour: by step on the hexagon's value, or one plain colour when there is a single step. */
export function hexColorExpression(steps: HexStep[]): string | unknown[] {
  if (steps.length <= 1) return steps[0]?.color ?? BURN[4];
  const expr: unknown[] = ['step', ['get', 'value'], steps[0].color];
  for (const st of steps.slice(1)) expr.push(st.min, st.color);
  return expr;
}

/** Hexagons as GeoJSON polygons ([lng, lat] corners, closed ring) with the value as a property. */
export function hexGeoJson(items: HexValue[]): FeatureCollection<Polygon> {
  const features: Feature<Polygon>[] = items.map((c) => ({
    type: 'Feature',
    properties: { value: c.value, h3: c.h3, n: c.n },
    // With the GeoJSON flag h3-js already returns [lng, lat] corners and repeats the first one to close the ring.
    geometry: { type: 'Polygon', coordinates: [cellToBoundary(c.h3, true)] },
  }));
  return { type: 'FeatureCollection', features };
}

/**
 * Whether a hexagon touches a country: its centre or any corner lies inside the borders. Big hexagons on the coast or the
 * border often have their centre outside, and would otherwise be lost (the veil over the outside hides what overhangs).
 */
export function hexOverlapsGeometry(h3: string, g: CountryGeometry): boolean {
  const [lat, lon] = cellToLatLng(h3);
  if (pointInGeometry(lon, lat, g)) return true;
  return cellToBoundary(h3, true).some(([x, y]) => pointInGeometry(x, y, g));
}

/** Cell centres as GeoJSON points ([lng, lat]) carrying the value; the map draws the busiest on top. */
export function dotsGeoJson(items: HexValue[]): FeatureCollection<Point> {
  const features: Feature<Point>[] = items.map((c) => {
    const [lat, lng] = cellToLatLng(c.h3);
    return { type: 'Feature', properties: { value: c.value, n: c.n }, geometry: { type: 'Point', coordinates: [lng, lat] } };
  });
  return { type: 'FeatureCollection', features };
}
