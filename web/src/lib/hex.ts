import { cellToBoundary, cellToParent } from 'h3-js';
import type { Feature, FeatureCollection, Polygon } from 'geojson';
import type { Bbox, HexCell } from '../data/types';
import { BURN } from './theme';

/** A hexagon as drawn on the map. Its value is the fire cell-days of every res7 cell inside it (the app's unit). */
export interface HexValue {
  h3: string;
  value: number;
}

export interface HexStep {
  min: number;
  color: string;
  label: string;
}

/** Average hexagon area per H3 resolution, in km2. */
export const HEX_AREA_KM2: Record<number, number> = { 3: 12393, 4: 1770, 5: 253, 6: 36, 7: 5.16 };

/**
 * Resolution that keeps a hexagon roughly 25 px wide when the map is fitted to the area:
 * res7 (~5 km2, the data team's cell) for small areas, bigger hexagons for bigger areas.
 */
export function hexResolution(bbox: Bbox | null): number {
  if (!bbox) return 3;
  const span = Math.max(bbox.east - bbox.west, bbox.north - bbox.south);
  if (span <= 0.8) return 7;
  if (span <= 2) return 6;
  if (span <= 5.4) return 5;
  if (span <= 14) return 4;
  return 3;
}

/** Hexagon width (flat side to flat side) per resolution, in metres. */
const HEX_WIDTH_M: Record<number, number> = { 3: 103_600, 4: 39_100, 5: 14_800, 6: 5_600, 7: 2_100 };

/**
 * Resolution whose hexagons come out closest to `targetPx` wide at this zoom and latitude (web-mercator pixels),
 * from res3 (coarsest) to res7 (the data's own cells). `zoom` is MapLibre's. Zooming in gives smaller hexagons that follow borders more closely.
 */
export function hexResolutionForZoom(zoom: number, lat: number, targetPx = 10): number {
  // MapLibre's zoom counts 512 px tiles (one level less than Leaflet's 256 px), hence 78271 rather than 156543.
  const metresPerPx = (78271.51696 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
  let best = 3;
  let bestErr = Infinity;
  for (const res of [3, 4, 5, 6, 7]) {
    const err = Math.abs(Math.log(HEX_WIDTH_M[res] / metresPerPx / targetPx));
    if (err < bestErr) {
      best = res;
      bestErr = err;
    }
  }
  return best;
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
    properties: { value: c.value, h3: c.h3 },
    // With the GeoJSON flag h3-js already returns [lng, lat] corners and repeats the first one to close the ring.
    geometry: { type: 'Polygon', coordinates: [cellToBoundary(c.h3, true)] },
  }));
  return { type: 'FeatureCollection', features };
}
