export type Source = 'harmonized' | 'modis' | 'viirs';
/** modis_scaled: MODIS count x a monthly factor, onto the VIIRS scale (before 2013). viirs_native: S-NPP VIIRS as is (from 2013). */
export type HarmonizeMethod = 'modis_scaled' | 'viirs_native';
export type DataStatus = 'standard' | 'nrt';

/** One grid cell × one month. This is the data contract (see docs/DATA_CONTRACT.md). */
export interface MonthRecord {
  cellId: string;
  lat: number; // cell centre
  lon: number;
  yearMonth: string; // 'YYYY-MM'
  modisRaw: number | null; // active cell-days seen by MODIS (null = sensor not operating / no coverage)
  viirsRaw: number | null; // active cell-days seen by S-NPP VIIRS, the reference series
  harmonized: number | null;
  method: HarmonizeMethod;
  scaleFactor: number | null; // MODIS -> VIIRS factor for this calendar month; null when VIIRS is used as is
  inCalibration: boolean; // month lies inside the 2013-2022 overlap used to fit the factors
  dataStatus: DataStatus;
}

export interface Bbox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface DataMeta {
  version: string;
  method: string; // human-readable harmonization method
  source: string;
  gridDeg: number;
  updated: string; // ISO date
  firstMonth: string;
  lastMonth: string;
  isMock: boolean;
}

/** One raw detection, drawn on the map. */
export interface HotspotPoint {
  lat: number;
  lon: number;
  sensor: 'modis' | 'viirs';
  day: number; // day of the month, 1-31
}

/** Detections for one month; `points` may be a sample of `total` to keep the map fast. */
export interface HotspotSample {
  points: HotspotPoint[];
  total: number;
}

/** One day of the month in focus, summed over the area of interest. */
export interface DayPoint {
  day: number; // 1-31
  modis: number | null;
  viirs: number | null;
  harmonized: number | null;
}

/** One H3 res7 cell (~5 km2) on the fire map. */
export interface HexCell {
  h3: string;
  /** Days with a detection, summed over the period and over the res7 cells inside the hexagon (cell-days). */
  days: number;
}

/** Fire map for a period (or one day) as hexagons. */
export interface HexSample {
  cells: HexCell[];
  total: number; // hexagons with fire in the area and period
  used: number; // hexagons returned (less than total when the quietest ones were cut off)
}

/** Hexagon size and count for DataSource.hexes. */
export interface HexOptions {
  /** H3 resolution of the hexagons, 3 (coarsest) to 7 (the data's own ~5 km2 cells, the default). The server adds the cells up. */
  res?: number;
  /** At most this many hexagons, busiest first. */
  limit?: number;
}

/** One res7 cell on the temperature map: the hottest mid-infrared brightness temperature (bright_mir) seen in it. */
export interface TempCell {
  h3: string;
  tempC: number; // degrees Celsius
  n: number; // observations behind it
}

/** Temperature map of one day or one month as hexagons. */
export interface TempSample {
  cells: TempCell[];
  total: number;
  used: number;
  metric: string; // the data column the temperature comes from
}

/** One calendar day ('YYYY-MM-DD') or one month ('YYYY-MM'). */
export type TempQuery = { day: string } | { month: string };

/** One past year scored against the target year's season so far (the data team's burning-calendar notebook). */
export interface AnalogCandidate {
  year: number;
  scorePct: number; // 0-100, 50 % cosine similarity + 50 % banded DTW
  marginPct: number; // 100 - score. How loosely the year matches. NOT a statistical confidence interval.
  cosinePct: number;
  dtwPct: number;
  cumFrpMw: number;
  era: 'modis' | 'viirs';
}

export interface AnalogResult {
  targetYear: number;
  cutoffMonth: number; // 1-12: the season is compared up to the end of this month
  cutoffWeek: number;
  years: number[]; // target years that can be compared (the picker's options)
  ranking: AnalogCandidate[]; // closest first
  targetFrp: number[]; // weekly FRP (MW), weeks 1..cutoffWeek
  fireSoFarPct: number; // the target year's FRP up to the cut-off, as % of a typical whole earlier year
  series: { year: number; frp: number[] }[]; // the closest years, whole years (52 weeks), closest first
  source: string;
  method: string;
  isMock: boolean;
}

export interface AnalogOptions {
  year?: number;
  cutoffMonth?: number;
}

export interface DataSource {
  meta(): Promise<DataMeta>;
  /** One point per month, summed over the cells whose centre lies inside bbox. */
  monthly(bbox: Bbox): Promise<MonthlyPoint[]>;
  /** Fire map inside bbox for a period (or one day of a single month) as H3 res7 hexagons; each cell's days are summed over the period. */
  hexes(bbox: Bbox, range: DateRange, source: Source, day?: number, opts?: HexOptions): Promise<HexSample>;
  /** Day-by-day totals for one month inside bbox. Days add up to the monthly totals. */
  daily(bbox: Bbox, yearMonth: string): Promise<DayPoint[]>;
  /** Past years whose fire season looked most like the target year's so far. Absent when the data source cannot compute it. */
  analog?(bbox: Bbox, opts?: AnalogOptions): Promise<AnalogResult>;
  /** Hottest bright_mir (Celsius) per res7 cell on one day or in one month inside bbox. Absent when the data source has no temperatures. */
  temps?(bbox: Bbox, query: TempQuery, source: Source): Promise<TempSample>;
  /** Every cell-day with a detection in one month inside bbox, as CSV text (the hotspots of a search). Absent without the per-cell data. */
  cellsCsv?(bbox: Bbox, yearMonth: string, source: Source): Promise<string>;
}

/** Aggregated over the AOI for one month. */
export interface MonthlyPoint {
  yearMonth: string;
  year: number;
  month: number; // 1-12
  modis: number | null;
  viirs: number | null;
  harmonized: number | null;
  cells: number;
  anyNrt: boolean;
  allInCalibration: boolean;
  methods: HarmonizeMethod[];
  scaleFactor: number | null; // mean of cell factors
}

export interface DateRange {
  start: string; // 'YYYY-MM'
  end: string;
}
