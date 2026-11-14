import type { Bbox, DataMeta, DataSource, DateRange, DayPoint, HexSample, MonthlyPoint, Source } from './types';

/** Reads the FastAPI backend (backend/README.md). Field names already match types.ts, so rows pass through untouched. */
export class ApiDataSource implements DataSource {
  constructor(
    private readonly base = '',
    private readonly doFetch: typeof fetch = (...a) => fetch(...a),
  ) {}

  private async get<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v));
    const qs = q.toString();
    const res = await this.doFetch(`${this.base}${path}${qs ? `?${qs}` : ''}`);
    if (!res.ok) throw new Error(`API ${path} failed with ${res.status}`);
    return (await res.json()) as T;
  }

  private box = (b: Bbox) => ({ west: b.west, south: b.south, east: b.east, north: b.north });

  meta(): Promise<DataMeta> {
    return this.get('/api/meta', {});
  }
  monthly(bbox: Bbox): Promise<MonthlyPoint[]> {
    return this.get('/api/monthly', this.box(bbox));
  }
  daily(bbox: Bbox, yearMonth: string): Promise<DayPoint[]> {
    return this.get('/api/daily', { ...this.box(bbox), ym: yearMonth });
  }
  hexes(bbox: Bbox, range: DateRange, source: Source, day?: number): Promise<HexSample> {
    return this.get('/api/hexes', { ...this.box(bbox), from: range.start, to: range.end, source, day });
  }
}
