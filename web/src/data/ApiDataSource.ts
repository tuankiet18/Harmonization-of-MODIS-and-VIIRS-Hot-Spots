import type { AnalogOptions, AnalogResult, Bbox, DataMeta, DataSource, DateRange, DayPoint, HexOptions, HexSample, MonthlyPoint, Source, TempQuery, TempSample } from './types';

/** A failed API call. `status` lets a view tell "no data here" (404, 422) from a broken service. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

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
    if (!res.ok) throw new ApiError(`API ${path} failed with ${res.status}`, res.status);
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
  analog(bbox: Bbox, opts: AnalogOptions = {}): Promise<AnalogResult> {
    return this.get('/api/analog', { ...this.box(bbox), year: opts.year, cutoff: opts.cutoffMonth });
  }
  temps(bbox: Bbox, query: TempQuery, source: Source): Promise<TempSample> {
    return this.get('/api/temps', { ...this.box(bbox), day: 'day' in query ? query.day : undefined, month: 'month' in query ? query.month : undefined, source });
  }
  async cellsCsv(bbox: Bbox, yearMonth: string, source: Source): Promise<string> {
    const q = new URLSearchParams({ ...Object.fromEntries(Object.entries(this.box(bbox)).map(([k, v]) => [k, String(v)])), level: 'cells', start: yearMonth, end: yearMonth, series: source });
    const res = await this.doFetch(`${this.base}/api/export.csv?${q}`);
    if (!res.ok) throw new ApiError(`API /api/export.csv failed with ${res.status}`, res.status);
    return res.text();
  }
  hexes(bbox: Bbox, range: DateRange, source: Source, day?: number, opts: HexOptions = {}): Promise<HexSample> {
    return this.get('/api/hexes', { ...this.box(bbox), from: range.start, to: range.end, source, day, res: opts.res, limit: opts.limit });
  }
}
