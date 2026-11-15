import type { Bbox, DateRange, Source } from '../data/types';
import { presetRange } from './range';

export interface ShareState {
  regionId: string; // preset id, 'custom', 'country' or 'none'
  countryId: string | null; // set when regionId is 'country'
  tab: string; // section of the app ('overview' is the default)
  bbox: Bbox | null;
  range: DateRange;
  source: Source;
  month: string | null;
}

interface Limits {
  min: string;
  max: string;
}

const YM = /^\d{4}-(0[1-9]|1[0-2])$/;
const SOURCES: Source[] = ['harmonized', 'modis', 'viirs'];
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Query string (no leading '?') that reproduces the view; anything at its default is left out. */
export function encodeState(s: ShareState, limits: Limits): string {
  const p = new URLSearchParams();
  p.set('area', s.regionId);
  if (s.regionId === 'country' && s.countryId) p.set('country', s.countryId);
  if (s.regionId === 'custom' && s.bbox) p.set('bbox', [s.bbox.west, s.bbox.south, s.bbox.east, s.bbox.north].map(r3).join(','));
  // The default period is the last 5 years, so a link to any other period (all years included) must say so.
  const usual = presetRange(limits, 5);
  if (s.range.start !== usual.start || s.range.end !== usual.end) {
    p.set('from', s.range.start);
    p.set('to', s.range.end);
  }
  if (s.source !== 'harmonized') p.set('src', s.source);
  if (s.month) p.set('month', s.month);
  if (s.tab !== 'overview') p.set('tab', s.tab);
  return p.toString().replaceAll('%2C', ',');
}

/** Read a query string back; every invalid or out-of-range part is dropped rather than raising. */
export function decodeState(search: string, regions: Record<string, Bbox>, limits: Limits): Partial<ShareState> {
  const p = new URLSearchParams(search);
  const out: Partial<ShareState> = {};

  const area = p.get('area');
  if (area === 'none') {
    out.regionId = 'none';
    out.bbox = null;
  } else if (area && regions[area]) {
    out.regionId = area;
    out.bbox = regions[area];
  } else if (area === 'country') {
    // The box comes from the country's borders, which load after the page does.
    const id = p.get('country');
    if (id) {
      out.regionId = 'country';
      out.countryId = id;
    }
  } else if (area === 'custom') {
    const v = (p.get('bbox') ?? '').split(',').map(Number);
    if (v.length === 4 && v.every(Number.isFinite)) {
      const [west, south, east, north] = v;
      if (west < east && south < north && west >= -180 && east <= 180 && south >= -90 && north <= 90) {
        out.regionId = 'custom';
        out.bbox = { west, south, east, north };
      }
    }
  }

  const from = p.get('from');
  const to = p.get('to');
  const okFrom = !!from && YM.test(from);
  const okTo = !!to && YM.test(to);
  const start = okFrom ? from! : limits.min;
  const end = okTo ? to! : limits.max;
  if ((okFrom || okTo) && start >= limits.min && end <= limits.max && start <= end) out.range = { start, end };

  const src = p.get('src') as Source | null;
  if (src && SOURCES.includes(src)) out.source = src;

  const month = p.get('month');
  if (month && YM.test(month)) out.month = month;

  const tab = p.get('tab');
  if (tab && /^[a-z][a-z-]*$/.test(tab)) out.tab = tab;

  return out;
}
