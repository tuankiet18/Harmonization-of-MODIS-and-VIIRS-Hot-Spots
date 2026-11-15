import type { Bbox, DataMeta, DateRange, DayPoint, MonthlyPoint, Source } from '../data/types';
import { pointInGeometry, type CountryGeometry } from './geo';

const f = (v: number | null) => (v === null ? '' : String(Math.round(v * 10) / 10));

/** Monthly-aggregate CSV with a commented provenance header (method, version, source). */
export function buildCsv(points: MonthlyPoint[], meta: DataMeta, bbox: Bbox, range: DateRange, source: Source): string {
  const head = [
    '# FireCalendar export - monthly fire activity',
    '# unit: active cell-days (a cell-day is one ~5 km2 H3 cell with at least one fire detection on one day)',
    `# source: ${meta.source}`,
    `# dataset_version: ${meta.version}${meta.isMock ? ' (DEMO DATA - not real observations)' : ''}`,
    `# harmonization_method: ${meta.method}`,
    `# displayed_series: ${source}`,
    `# aoi_bbox (west,south,east,north): ${bbox.west},${bbox.south},${bbox.east},${bbox.north}`,
    `# date_range: ${range.start}..${range.end}`,
    `# generated: ${new Date().toISOString()}`,
  ];
  const cols = 'year_month,modis_raw,viirs_raw,harmonized,method,scale_factor,in_calibration,data_status,cells';
  const rows = points.map((p) =>
    [
      p.yearMonth,
      f(p.modis),
      f(p.viirs),
      f(p.harmonized),
      p.methods.join('|'),
      p.scaleFactor === null ? '' : p.scaleFactor.toFixed(3),
      p.allInCalibration,
      p.anyNrt ? 'nrt' : 'standard',
      p.cells,
    ].join(','),
  );
  return [...head, cols, ...rows].join('\n') + '\n';
}

/** Daily totals of one month, with the same provenance header. */
export function buildDailyCsv(days: DayPoint[], yearMonth: string, meta: DataMeta, bbox: Bbox, source: Source): string {
  const head = [
    '# FireCalendar export - daily fire activity',
    '# unit: active cell-days (a cell-day is one ~5 km2 H3 cell with at least one fire detection on one day)',
    `# source: ${meta.source}`,
    `# dataset_version: ${meta.version}${meta.isMock ? ' (DEMO DATA - not real observations)' : ''}`,
    `# harmonization_method: ${meta.method}`,
    `# displayed_series: ${source}`,
    `# aoi_bbox (west,south,east,north): ${bbox.west},${bbox.south},${bbox.east},${bbox.north}`,
    `# month: ${yearMonth}`,
    `# generated: ${new Date().toISOString()}`,
  ];
  const rows = days.map((d) => [`${yearMonth}-${String(d.day).padStart(2, '0')}`, f(d.modis), f(d.viirs), f(d.harmonized)].join(','));
  return [...head, 'date,modis_raw,viirs_raw,harmonized', ...rows].join('\n') + '\n';
}

/** The fire-cells CSV from the server holds every cell in the area's box; keep the rows whose cell centre is inside the country's borders. */
export function cutCellsCsv(text: string, geometry: CountryGeometry, country: string): string {
  const lines = text.split('\n');
  const header = lines.findIndex((l) => l.startsWith('date,'));
  if (header < 0) return text;
  const cols = lines[header].split(',');
  const iLat = cols.indexOf('lat');
  const iLon = cols.indexOf('lon');
  const kept = lines.slice(header + 1).filter((l) => {
    if (!l) return false;
    const c = l.split(',');
    return pointInGeometry(Number(c[iLon]), Number(c[iLat]), geometry);
  });
  return [...lines.slice(0, header), `# aoi_country: ${country} (cells with their centre inside its borders)`, lines[header], ...kept].join('\n') + '\n';
}

export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
