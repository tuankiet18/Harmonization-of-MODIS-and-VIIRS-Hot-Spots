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
  /** Days with at least one detection in this cell, summed over the period (1 when a single day was asked for). */
  days: number;
}

/** Fire map for one month (or one day) as hexagons. */
export interface HexSample {
  cells: HexCell[];
  total: number; // res7 cells with fire in the area and period
  used: number; // res7 cells returned (less than total when the quietest cells were cut off)
}

export interface DataSource {
  meta(): Promise<DataMeta>;
  /** One point per month, summed over the cells whose centre lies inside bbox. */
  monthly(bbox: Bbox): Promise<MonthlyPoint[]>;
  /** Fire map inside bbox for a period (or one day of a single month) as H3 res7 hexagons; each cell's days are summed over the period. */
  hexes(bbox: Bbox, range: DateRange, source: Source, day?: number): Promise<HexSample>;
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
