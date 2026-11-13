import type { DateRange, MonthRecord, MonthlyPoint, Source } from '../data/types';

const sumOrNull = (vals: (number | null)[]): number | null => {
  const nums = vals.filter((v): v is number => v !== null);
  return nums.length ? nums.reduce((a, b) => a + b, 0) : null;
};

/** Sum cell records into one point per month (records are already limited to the AOI). */
export function aggregateMonthly(records: MonthRecord[], range?: DateRange): MonthlyPoint[] {
  const groups = new Map<string, MonthRecord[]>();
  for (const r of records) {
    if (range && (r.yearMonth < range.start || r.yearMonth > range.end)) continue;
    const g = groups.get(r.yearMonth);
    if (g) g.push(r);
    else groups.set(r.yearMonth, [r]);
  }
  return [...groups.keys()]
    .sort()
    .map((ym) => {
      const g = groups.get(ym)!;
      const [y, m] = ym.split('-').map(Number);
      const factors = g.map((r) => r.scaleFactor).filter((v): v is number => v !== null);
      return {
        yearMonth: ym,
        year: y,
        month: m,
        modis: sumOrNull(g.map((r) => r.modisRaw)),
        viirs: sumOrNull(g.map((r) => r.viirsRaw)),
        harmonized: sumOrNull(g.map((r) => r.harmonized)),
        cells: g.length,
        anyNrt: g.some((r) => r.dataStatus === 'nrt'),
        allInCalibration: g.every((r) => r.inCalibration),
        methods: [...new Set(g.map((r) => r.method))],
        scaleFactor: factors.length ? factors.reduce((a, b) => a + b, 0) / factors.length : null,
      };
    });
}

export function valueOf(p: MonthlyPoint, source: Source): number | null {
  return source === 'harmonized' ? p.harmonized : source === 'modis' ? p.modis : p.viirs;
}
