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

export interface DataSource {
  meta(): Promise<DataMeta>;
  /** One point per month, summed over the cells whose centre lies inside bbox. */
  monthly(bbox: Bbox): Promise<MonthlyPoint[]>;
  /** Raw detections inside bbox for one month, or for one day of it. 'harmonized' returns both sensors. */
  points(bbox: Bbox, yearMonth: string, source: Source, day?: number): Promise<HotspotSample>;
  /** Day-by-day totals for one month inside bbox. Days add up to the monthly totals. */
  daily(bbox: Bbox, yearMonth: string): Promise<DayPoint[]>;
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
