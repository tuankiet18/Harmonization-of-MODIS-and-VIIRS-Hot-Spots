import { latLngToCell } from 'h3-js';
import { aggregateMonthly } from '../lib/aggregate';
import { aggregateCells } from '../lib/hex';
import { REGIONS } from './regions';
import type { Bbox, DataMeta, DataSource, DateRange, DayPoint, HexOptions, HexSample, HotspotPoint, HotspotSample, MonthRecord, MonthlyPoint, Source, TempQuery, TempSample } from './types';

/**
 * Synthetic data with the same shape as the real harmonized dataset.
 * Replace with StaticFileDataSource once the data team delivers (docs/DATA_CONTRACT.md).
 * The numbers are FAKE - the UI shows a "demo data" banner while this source is active.
 */

const FIRST = '2000-11';
const LAST = '2026-10';
const VIIRS_START = '2012-01';
const CALIB_START = '2013-01'; // factors are fitted on 2013-2022 and VIIRS is used as is from 2013
const CALIB_END = '2022-12';
const NRT_START = '2026-08';
const VIIRS_TO_MODIS_RATIO = 3.3; // VIIRS (375 m) detects ~3x more hotspots than MODIS (1 km)

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function gauss(rng: () => number): number {
  const u = Math.max(rng(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

export function monthsBetween(start: string, end: string): string[] {
  const out: string[] = [];
  let [y, m] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

function climateAt(lat: number, lon: number) {
  for (const r of REGIONS) {
    const b = r.bbox;
    if (lon >= b.west - 3 && lon <= b.east + 3 && lat >= b.south - 3 && lat <= b.north + 3) {
      return { key: r.id, peakMonth: r.peakMonth, intensity: r.intensity };
    }
  }
  return { key: 'default', peakMonth: lat > 35 ? 7 : lat >= 0 ? 3 : 9, intensity: 0.2 };
}

const yearFactorCache = new Map<string, number>();
function yearFactor(key: string, year: number): number {
  const id = `${key}:${year}`;
  let v = yearFactorCache.get(id);
  if (v === undefined) {
    const rng = mulberry32(hashStr(id));
    v = Math.exp(0.35 * gauss(rng));
    if (rng() < 0.12) v *= 2.2; // a few extreme fire years
    yearFactorCache.set(id, v);
  }
  return v;
}

function generateCell(lat: number, lon: number): MonthRecord[] {
  const cellId = `${lat.toFixed(2)}_${lon.toFixed(2)}`;
  const rng = mulberry32(hashStr(cellId));
  const { key, peakMonth, intensity } = climateAt(lat, lon);
  const cellFactor = Math.exp(0.5 * gauss(rng));
  const months = monthsBetween(FIRST, LAST);

  const rows = months.map((ym) => {
    const [y, m] = ym.split('-').map(Number);
    const seasonal = Math.exp(2.2 * (Math.cos((2 * Math.PI * (m - peakMonth)) / 12) - 1));
    const truth = 40 * intensity * cellFactor * seasonal * yearFactor(key, y) * (0.8 + 0.4 * rng());
    const modis = Math.round(truth * (0.9 + 0.2 * rng()));
    const viirs = ym >= VIIRS_START ? Math.round(truth * VIIRS_TO_MODIS_RATIO * (0.9 + 0.2 * rng())) : null;
    return { ym, modis, viirs };
  });

  // MODIS -> VIIRS factor per calendar month, fitted on the calibration window (as in the data team's notebook).
  const fit = Array.from({ length: 12 }, () => ({ modis: 0, viirs: 0 }));
  for (const r of rows) {
    if (r.viirs !== null && r.ym >= CALIB_START && r.ym <= CALIB_END) {
      const f = fit[Number(r.ym.slice(5)) - 1];
      f.modis += r.modis;
      f.viirs += r.viirs;
    }
  }
  const factor = (month: number) => (fit[month - 1].modis > 0 && fit[month - 1].viirs > 0 ? fit[month - 1].viirs / fit[month - 1].modis : VIIRS_TO_MODIS_RATIO);

  return rows.map(({ ym, modis, viirs }) => {
    const scaled = ym < CALIB_START;
    const f = factor(Number(ym.slice(5)));
    const harmonized = scaled ? modis * f : (viirs as number);
    const method: MonthRecord['method'] = scaled ? 'modis_scaled' : 'viirs_native';
    const inCalibration = ym >= CALIB_START && ym <= CALIB_END;
    return {
      cellId,
      lat,
      lon,
      yearMonth: ym,
      modisRaw: modis,
      viirsRaw: viirs,
      harmonized: Math.round(harmonized * 10) / 10,
      method,
      scaleFactor: scaled ? Math.round(f * 1000) / 1000 : null,
      inCalibration,
      dataStatus: ym >= NRT_START ? 'nrt' : 'standard',
    };
  });
}

export class MockDataSource implements DataSource {
  async meta(): Promise<DataMeta> {
    return {
      version: 'mock-0.1',
      method:
        'DEMO: before 2013 MODIS is multiplied by a per-month factor onto the VIIRS (S-NPP) scale, fitted on 2013–2022; from 2013 VIIRS is used as is',
      source: 'Synthetic demo data (not NASA FIRMS)',
      gridDeg: 1,
      updated: '2026-11-13',
      firstMonth: FIRST,
      lastMonth: LAST,
      isMock: true,
    };
  }

  private cacheKey = '';
  private cache: MonthRecord[] = [];

  private records(bbox: Bbox): MonthRecord[] {
    const key = JSON.stringify(bbox);
    if (key === this.cacheKey) return this.cache;
    const step = gridStep(bbox);
    const out: MonthRecord[] = [];
    if (step > 0) {
      for (let lat = bbox.south + step / 2; lat < bbox.north; lat += step) {
        for (let lon = bbox.west + step / 2; lon < bbox.east; lon += step) {
          out.push(...generateCell(lat, lon));
        }
      }
    }
    this.cacheKey = key;
    this.cache = out;
    return out;
  }

  async monthly(bbox: Bbox): Promise<MonthlyPoint[]> {
    return aggregateMonthly(await this.query(bbox));
  }

  async query(bbox: Bbox): Promise<MonthRecord[]> {
    await new Promise((r) => setTimeout(r, 120)); // simulate latency so loading states are visible
    return this.records(bbox);
  }

  async daily(bbox: Bbox, yearMonth: string): Promise<DayPoint[]> {
    const cells = this.records(bbox).filter((r) => r.yearMonth === yearMonth);
    const w = dayWeights(JSON.stringify(bbox), yearMonth);
    const sum = (f: (r: MonthRecord) => number | null) => {
      const v = cells.map(f).filter((x): x is number => x !== null);
      return v.length ? v.reduce((a, b) => a + b, 0) : null;
    };
    const modis = sum((r) => r.modisRaw);
    const viirs = sum((r) => r.viirsRaw);
    const harmonized = sum((r) => r.harmonized);
    const m = modis === null ? null : splitTotal(modis, w, true);
    const v = viirs === null ? null : splitTotal(viirs, w, true);
    const h = harmonized === null ? null : splitTotal(harmonized, w, false);
    return w.map((_, i) => ({ day: i + 1, modis: m ? m[i] : null, viirs: v ? v[i] : null, harmonized: h ? h[i] : null }));
  }

  async points(bbox: Bbox, yearMonth: string, source: Source, day?: number): Promise<HotspotSample> {
    const step = gridStep(bbox);
    const cells = this.records(bbox).filter((r) => r.yearMonth === yearMonth);
    const sensors = (['modis', 'viirs'] as const).filter((s) => source === 'harmonized' || source === s);
    const count = (r: MonthRecord, s: 'modis' | 'viirs') => (s === 'modis' ? r.modisRaw : r.viirsRaw) ?? 0;
    // For one day, each cell keeps the share of its month that falls on that day (same split as daily()).
    const w = dayWeights(JSON.stringify(bbox), yearMonth);
    const share: Record<string, number> = { modis: 1, viirs: 1 };
    let total = 0;
    for (const s of sensors) {
      const month = cells.reduce((a, r) => a + count(r, s), 0);
      if (day === undefined) {
        total += month;
      } else {
        const d = splitTotal(month, w, true)[day - 1] ?? 0;
        share[s] = month > 0 ? d / month : 0;
        total += d;
      }
    }
    const keep = Math.min(1, MAX_POINTS / Math.max(1, total));
    const points: HotspotPoint[] = [];
    for (const r of cells) {
      // Fires recur around the same few places inside a cell.
      const place = mulberry32(hashStr(r.cellId));
      const centres = [0, 1, 2].map(() => [(place() - 0.5) * step * 0.7, (place() - 0.5) * step * 0.7]);
      for (const s of sensors) {
        const rng = mulberry32(hashStr(`${r.cellId}:${yearMonth}:${s}:${day ?? 0}`));
        // Random rounding keeps the expected count when a cell's share of one day is below 1.
        const want = count(r, s) * share[s] * keep;
        const n = Math.floor(want) + (rng() < want - Math.floor(want) ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const c = centres[Math.floor(rng() * centres.length)];
          const half = step / 2;
          points.push({
            lat: r.lat + Math.max(-half, Math.min(half, c[0] + gauss(rng) * step * 0.03)),
            lon: r.lon + Math.max(-half, Math.min(half, c[1] + gauss(rng) * step * 0.03)),
            sensor: s,
            day: day ?? pickDay(rng, w),
          });
        }
      }
    }
    return { points, total };
  }

  /**
   * The fire map as H3 res7 hexagons, built from the same synthetic detections as points(). A long period would mean
   * thousands of synthetic months, so at most 12 evenly spaced ones are drawn and their days scaled up to stand in for the rest.
   */
  /** Demo temperatures: a fixed pseudo value per cell (the real ones come from the backend). */
  async temps(bbox: Bbox, query: TempQuery, source: Source): Promise<TempSample> {
    const ym = 'day' in query ? query.day.slice(0, 7) : query.month;
    const day = 'day' in query ? Number(query.day.slice(8)) : undefined;
    const { points } = await this.points(bbox, ym, source, day);
    const hottest = new Map<string, { tempC: number; n: number }>();
    for (const p of points) {
      const id = latLngToCell(p.lat, p.lon, 7);
      const tempC = 50 + ((Math.round((p.lat + 90) * 97 + (p.lon + 180) * 53 + p.day * 31) % 40) + 40) % 40;
      const prev = hottest.get(id);
      hottest.set(id, { tempC: Math.max(prev?.tempC ?? 0, tempC), n: (prev?.n ?? 0) + 1 });
    }
    const cells = [...hottest].map(([h3, v]) => ({ h3, ...v })).sort((a, b) => b.tempC - a.tempC || (a.h3 < b.h3 ? -1 : 1));
    return { cells, total: cells.length, used: cells.length, metric: 'bright_mir' };
  }

  async hexes(bbox: Bbox, range: DateRange, source: Source, day?: number, opts: HexOptions = {}): Promise<HexSample> {
    const months = monthsBetween(range.start, range.end);
    const sample = day !== undefined ? [range.start] : evenly(months, 12);
    const days = new Map<string, number>();
    for (const ym of sample) {
      const { points } = await this.points(bbox, ym, source, day);
      const inMonth = new Map<string, Set<number>>();
      for (const p of points) {
        const id = latLngToCell(p.lat, p.lon, 7);
        const set = inMonth.get(id);
        if (set) set.add(p.day);
        else inMonth.set(id, new Set([p.day]));
      }
      for (const [id, set] of inMonth) days.set(id, (days.get(id) ?? 0) + set.size);
    }
    const scale = day !== undefined ? 1 : months.length / sample.length;
    let cells = [...days]
      .map(([h3, d]) => ({ h3, days: Math.max(1, Math.round(d * scale)) }))
      .sort((a, b) => b.days - a.days || (a.h3 < b.h3 ? -1 : 1));
    if (opts.res !== undefined && opts.res < 7) cells = aggregateCells(cells, opts.res).map((c) => ({ h3: c.h3, days: c.value }));
    const total = cells.length;
    if (opts.limit !== undefined) cells = cells.slice(0, opts.limit);
    return { cells, total, used: cells.length };
  }
}

/** At most n items of the list, evenly spread, always including the first and the last. */
function evenly<T>(list: T[], n: number): T[] {
  if (list.length <= n) return list;
  return Array.from({ length: n }, (_, i) => list[Math.round((i * (list.length - 1)) / (n - 1))]);
}

/** Pick a day of the month with probability proportional to its weight. */
function pickDay(rng: () => number, w: number[]): number {
  let r = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r <= 0) return i + 1;
  }
  return w.length;
}

const MAX_POINTS = 4000;

/** Uneven, clustered day weights for one month (fires flare up for a few days at a time). */
function dayWeights(key: string, yearMonth: string): number[] {
  const [y, m] = yearMonth.split('-').map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const rng = mulberry32(hashStr(`${key}|${yearMonth}|days`));
  const raw = Array.from({ length: n }, () => Math.exp(0.9 * gauss(rng)));
  return raw.map((_, i) => (raw[Math.max(0, i - 1)] + 2 * raw[i] + raw[Math.min(n - 1, i + 1)]) / 4);
}

/** Split `total` across days in proportion to `w`; the parts always add back up to `total`. */
function splitTotal(total: number, w: number[], integer: boolean): number[] {
  const s = w.reduce((a, b) => a + b, 0);
  if (!integer) {
    const out = w.map((x) => Math.round(((total * x) / s) * 10) / 10);
    const rest = out.slice(0, -1).reduce((a, b) => a + b, 0);
    out[out.length - 1] = Math.max(0, Math.round((total - rest) * 10) / 10);
    return out;
  }
  const exact = w.map((x) => (total * x) / s);
  const base = exact.map(Math.floor);
  const missing = Math.round(total) - base.reduce((a, b) => a + b, 0);
  exact
    .map((e, i) => [e - base[i], i] as const)
    .sort((a, b) => b[0] - a[0])
    .slice(0, missing)
    .forEach(([, i]) => base[i]++);
  return base;
}

function gridStep(bbox: Bbox): number {
  const w = bbox.east - bbox.west;
  const h = bbox.north - bbox.south;
  if (w <= 0 || h <= 0) return 0;
  return Math.max(1, Math.ceil(Math.max(w, h) / 15));
}
