import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';

const en = {
  tabOverview: 'Overview',
  tabCalendar: 'Calendar',
  navLabel: 'Sections',
  hexToggle: 'Hexagons',
  showOnMap: 'Show this day on the map',
  seasonalTitle: 'A typical year, and {year}',
  seasonalHint: 'The line is {year}. The grey band is the usual range (10th to 90th percentile) of the other years.',
  typicalLabel: 'Typical (median)',
  usualRange: 'Usual range',
  annualTitle: 'Total per year',
  appName: 'FireCalendar',
  demoBadge: 'Demo data',
  demoBanner: 'Demo data. These numbers are synthetic, for building the interface. They are not NASA FIRMS observations.',
  srcHarmonized: 'Combined series (recommended)',
  srcModis: 'MODIS sensor only',
  srcViirs: 'VIIRS sensor only',
  srcLabel: 'Data series',
  downloadCsv: 'Download CSV',
  share: 'Share link',
  shareCopied: 'Link copied',
  shareFallback: 'Copy this link:',
  legend: 'Map key',
  legendArea: 'Selected area',
  legendPreset: 'Ready-made regions',
  legendHexDay: 'Fire on this day',
  legendHexMonthCoarse: 'Fire cell-days per hexagon',
  legendHexDayCoarse: 'Cells with fire per hexagon',
  hexOneDay: 'Fire detected on 1 day',
  hexDays: 'Fire detected on {n} different days',
  hexCellDays: '{n} fire cell-days in this hexagon (about {km2} km²)',

  map: 'Map of the selected area and its fire hexagons',
  chooseRegion: 'Choose a region',
  regionsGroup: 'Ready-made regions',
  countriesGroup: 'Countries',
  customArea: 'Custom area',
  placeCustom: 'this area',
  drawArea: 'Draw area',
  drawing: 'Drag on the map',
  coords: 'Coordinates',
  clear: 'Clear area',
  south: 'South latitude',
  north: 'North latitude',
  west: 'West longitude',
  east: 'East longitude',
  applyBbox: 'Use these coordinates',
  bboxInvalid: 'Check the box: south must be below north (−90 to 90) and west below east (−180 to 180).',
  mapCaptionAll: '{cells} hexagons with fire (about {km2} km² each)',
  mapCaptionSample: '{cells} hexagons (about {km2} km² each), built from the busiest {shown} of {n} cells',
  mapCaptionLoading: 'Loading fire hexagons',

  periodTitle: 'Period',
  periodSpan: '{from} to {to}',
  headMore: '{period} had {pct}% more fire activity than usual in {place}.',
  headFewer: '{period} had {pct}% less fire activity than usual in {place}.',
  headNear: '{period} was about usual for fire activity in {place}.',
  headNoBase: '{period} in {place}: {n} active cell-days.',
  headSub: 'Usual means the median of the same months in other years: {expected} active cell-days expected, {compared} counted.',
  factBusiest: 'Busiest month',
  factBusiestSub: '{n} active cell-days',
  groupLabel: 'Charts',
  groupTime: 'Over time',
  groupUsual: 'Against usual',
  groupWhere: 'Where',
  anomalyTitle: 'Each month against usual',
  anomalyHint: 'Orange bars: more fire activity than the same month in other years. Blue bars: less. Click a month to compare its year below.',
  anomalyNoBase: 'Nothing to compare with',
  progressTitle: 'This season so far',
  progressHint: '{year} added up month by month, against the usual running total (median and 10th to 90th percentile) of the other years.',
  cellsTitle: 'Busiest hexagons',
  cellsHint: 'The cells (about 5 km² each) with the most days on which a fire was detected in this period. A day counts once, however many fires were seen that day. Click a place to go to it on the map.',
  cellsNone: 'No fire hexagons in this period.',
  cellsPlace: 'Place',
  cellsDays: 'Days with a detection',
  cellsShare: 'Share of the period',
  cellGo: 'Go to {place} on the map',
  cellStatic: 'Burns on most days: may be a gas flare or industrial heat source, not a vegetation fire.',
  trendHint: 'Click a month to set the year that is held up against a typical year below.',
  annualHint: 'Click a year to compare it with a typical year. Lighter bars are part-years.',
  mapCaptionNone: 'No fire hexagons in this period. Try a different From to To.',
  legendHexMonth: 'Days with a fire detection in this period',
  pickMonth: 'pick from a calendar',
  monthHint: 'Type a month like 2019-03, 03/2019 or Mar 2019.',
  from: 'From',
  to: 'To',

  factPeakYear: 'Most active year',
  factPeakYearSub: '{n} active cell-days',
  factTotal: 'Active cell-days in this period',
  factTotalSub: 'Across the selected area and dates',
  noBaseline: 'n/a',
  verdictHigher: 'Higher than usual',
  verdictTypical: 'About usual',
  verdictLower: 'Lower than usual',
  verdictUnknown: 'No comparison yet',
  howToReadCount: 'How to read this: each square is one month. Darker means more fire activity. One cell-day is a 5 km² cell with at least one fire detection on one day.',
  howToReadAnomaly: 'How to read this: each square is one month. Orange is more fire activity than usual, blue is less.',
  areaLabel: 'Area',
  presetAll: 'All years',
  presetTen: 'Last 10 years',
  presetFive: 'Last 5 years',
  detailsTitle: 'Details and data quality',
  detailsIntro: 'Satellites changed over the years, so older counts were converted to be comparable with recent ones. The calendar uses this combined series.',
  rawNotice: 'Showing {series}, not the combined series.',
  rawBack: 'Back to combined series',

  calendarTitle: 'Burning activity calendar',
  calendarMode: 'Calendar display',
  modeCount: 'Active cell-days',
  modeAnomaly: 'Compared with usual',
  modisScaledYears: '{from}–{to}: converted from MODIS, less certain',
  legendSelected: 'Selected month',
  legendNrt: 'Preliminary, may change',
  legendNoData: 'No data',
  hotspots: 'cell-days',
  historicalMedian: 'Typical for this month',
  vsMedian: 'compared with typical',

  dailyTitle: 'Daily calendar for {month}',
  dailyHint: 'Pick a day to see only its fire hexagons on the map. Darker means more fire activity; the number is how many cells had fire that day.',
  wholeMonth: 'Whole month',
  dayTotal: '{n} cells with fire on {date}',
  weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  trendTitle: 'Monthly fire activity over time',
  calibrationOverlap: 'calibration overlap',

  explainTitle: 'Why did this number change after harmonization?',
  explainSources: 'Satellite sources',
  sensorModis: 'Terra/Aqua MODIS',
  sensorViirs: 'S-NPP VIIRS',
  explainHarmonized: 'Harmonized',
  explainConversion: 'Conversion',
  convModisScaled: 'MODIS count multiplied by {f} to bring it onto the VIIRS scale.',
  convViirsNative: 'None. VIIRS (S-NPP) is the reference scale, so its count is used as is.',
  convMixed: 'Grid cells in this area use different conversions: {list}.',
  notObserved: 'not observed',
  badgeConverted: 'Converted from MODIS',
  badgeReference: 'Reference series (VIIRS)',
  badgeStandard: 'Standard data',
  badgeNrt: 'Preliminary (NRT)',
  limitationsTitle: 'Limitations',
  limModisScaled: 'Before 2013 the count comes from MODIS (1 km pixels) converted to the VIIRS scale, so single months are less certain than recent ones.',
  limTerraOnly: 'Before July 2002 only the Terra satellite was flying. It sees far fewer fires than Terra and Aqua together, so these counts are too low.',
  limNrt: 'This is near-real-time data. Values can change when standard processing is released.',
  limNone: 'None for this month.',
  methodTitle: 'Method',

  emptyTitle: 'Pick a place to read its fire history',
  emptyHint: 'Choose a region below, or use Draw area on the map.',
  loading: 'Loading fire history',
  noDataTitle: 'No fire activity in this area and period',
  noDataHint: 'Widen the date range or draw a larger area.',
  loadError: 'The data could not be loaded. Reload the page to try again.',
  footer: 'Hotspot source: NASA FIRMS (MODIS and VIIRS). Built for the NASA Space Apps Challenge 2026.',
  months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  monthsLong: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

export type StrKey = { [K in keyof typeof en]: (typeof en)[K] extends string ? K : never }[keyof typeof en];

interface I18n {
  t: (key: StrKey, vars?: Record<string, string | number>) => string;
  months: string[];
  monthsLong: string[];
  fmt: (n: number) => string;
  fmtCompact: (n: number) => string;
  fmtPct: (n: number) => string;
  /** 'YYYY-MM' -> 'September 2019' */
  fmtMonth: (ym: string) => string;
  /** Month name as used mid-sentence: 'September' */
  monthInSentence: (m: number) => string;
  /** 'YYYY-MM' + day -> 'Oct 5, 2026' */
  fmtDay: (ym: string, day: number) => string;
  weekdays: string[];
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = 'en';
  }, []);

  const value = useMemo<I18n>(() => {
    const d = en;
    const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
    const cf = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
    return {
      t: (key, vars) => {
        let s = d[key] as string;
        if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
        return s;
      },
      months: d.months,
      monthsLong: d.monthsLong,
      fmt: (n) => nf.format(n),
      fmtCompact: (n) => cf.format(n),
      fmtPct: (n) => `${n > 0 ? '+' : ''}${nf.format(n)}%`,
      fmtMonth: (ym) => {
        const [y, m] = ym.split('-').map(Number);
        return `${d.monthsLong[m - 1]} ${y}`;
      },
      monthInSentence: (m) => d.monthsLong[m - 1],
      fmtDay: (ym, day) => {
        const [y, m] = ym.split('-').map(Number);
        return `${d.months[m - 1]} ${day}, ${y}`;
      },
      weekdays: d.weekdays,
    };
  }, []);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n outside provider');
  return v;
}
