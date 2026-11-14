import type { Feature, MultiPolygon, Polygon } from 'geojson';
import type { Bbox } from '../data/types';

export type CountryGeometry = Polygon | MultiPolygon;

type Ring = number[][];

/** One polygon with its rings made continuous across the date line, and its box (also continuous, so it may pass 180). */
interface Part {
  rings: Ring[];
  box: Bbox;
}

const prepared = new WeakMap<object, Part[]>();

/** Rings that cross the date line jump from about +180 to -180; add 360 so the ring is continuous again. */
function unwrap(ring: Ring): Ring {
  const out: Ring = [];
  let offset = 0;
  let prev = ring[0]?.[0] ?? 0;
  for (const [x, y] of ring) {
    if (x - prev > 180) offset -= 360;
    else if (x - prev < -180) offset += 360;
    out.push([x + offset, y]);
    prev = x;
  }
  return out;
}

const boxOf = (ring: Ring): Bbox => {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const [x, y] of ring) {
    if (x < west) west = x;
    if (x > east) east = x;
    if (y < south) south = y;
    if (y > north) north = y;
  }
  return { west, south, east, north };
};

function partsOf(g: CountryGeometry): Part[] {
  let parts = prepared.get(g);
  if (!parts) {
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    parts = polys.map((p) => {
      const rings = p.map(unwrap);
      return { rings, box: boxOf(rings[0]) };
    });
    prepared.set(g, parts);
  }
  return parts;
}

/** Move a box by whole turns of 360 degrees so most of it lies inside -180..180, then cut off what still sticks out. */
function toWorld(b: Bbox): Bbox {
  const overlap = (k: number) => Math.max(0, Math.min(b.east + k, 180) - Math.max(b.west + k, -180));
  const k = [0, 360, -360].reduce((best, c) => (overlap(c) > overlap(best) ? c : best), 0);
  return { west: Math.max(b.west + k, -180), south: b.south, east: Math.min(b.east + k, 180), north: b.north };
}

/** Islands further than this many degrees from the main land do not stretch the box (France's Guiana, Hawaii's neighbours...). */
const ISLAND_GAP_DEG = 8;

/**
 * The box a map should fit and the API should be asked for: the biggest polygon plus every polygon within
 * ISLAND_GAP_DEG of it, repeatedly. Far overseas territories and pieces beyond the date line are left out,
 * so the box never wraps around (west < east, inside -180..180).
 */
export function mainBbox(g: CountryGeometry): Bbox {
  const boxes = partsOf(g).map((p) => toWorld(p.box));
  const area = (b: Bbox) => (b.east - b.west) * (b.north - b.south);
  const start = boxes.reduce((a, b) => (area(b) > area(a) ? b : a));
  let box = { ...start };
  const taken = new Set<Bbox>([start]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const p of boxes) {
      if (taken.has(p)) continue;
      const near =
        p.west <= box.east + ISLAND_GAP_DEG && p.east >= box.west - ISLAND_GAP_DEG && p.south <= box.north + ISLAND_GAP_DEG && p.north >= box.south - ISLAND_GAP_DEG;
      if (near) {
        taken.add(p);
        box = { west: Math.min(box.west, p.west), south: Math.min(box.south, p.south), east: Math.max(box.east, p.east), north: Math.max(box.north, p.north) };
        grew = true;
      }
    }
  }
  return box;
}

const inRing = (x: number, y: number, ring: Ring): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/** Whether a point lies inside a country: inside an outer ring and outside its holes (date-line safe). */
export function pointInGeometry(lon: number, lat: number, g: CountryGeometry): boolean {
  for (const part of partsOf(g)) {
    if (lat < part.box.south || lat > part.box.north) continue;
    for (const shift of [0, 360, -360]) {
      const x = lon + shift;
      if (x < part.box.west || x > part.box.east) continue;
      if (inRing(x, lat, part.rings[0]) && !part.rings.slice(1).some((hole) => inRing(x, lat, hole))) return true;
    }
  }
  return false;
}

/**
 * The whole map with the country cut out, to lay a translucent veil over everything outside its borders (so hexagons that
 * overhang the border fade out). Null for a country whose outline crosses the date line: its holes would smear across the map.
 */
export function countryMask(g: CountryGeometry): Feature<Polygon> | null {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const crosses = polys.some((p) => p[0].some((c, i, ring) => i > 0 && Math.abs(c[0] - ring[i - 1][0]) > 180));
  if (crosses) return null;
  const world: Ring = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [world, ...polys.map((p) => p[0])] } };
}
