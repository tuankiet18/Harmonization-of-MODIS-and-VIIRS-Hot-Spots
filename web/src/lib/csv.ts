import type { Bbox, DataMeta, DateRange, MonthlyPoint, Source } from '../data/types';

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
