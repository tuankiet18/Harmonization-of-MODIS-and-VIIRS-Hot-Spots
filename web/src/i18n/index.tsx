import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';

const en = {
  appName: 'FireCalendar',
  appSubtitle: 'Fire history for any place on Earth, 2000 to today',
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
  legendHexMonth: 'Days with fire this month',
  legendHexDay: 'Fire on this day',
  legendHexMonthCoarse: 'Fire cell-days per hexagon',
  legendHexDayCoarse: 'Cells with fire per hexagon',
  legendHexSize: 'Hexagons of about {km2} km²',
  hexOneDay: 'Fire on 1 day',
  hexDays: 'Fire on {n} days',
  hexCellDays: '{n} fire cell-days in this hexagon (about {km2} km²)',

  map: 'Map of the selected area and its fire hexagons',
  region: 'Region',
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
  prevMonth: 'Previous month',
  nextMonth: 'Next month',
  mapCaptionAll: '{cells} hexagons with fire (about {km2} km² each)',
  mapCaptionSample: '{cells} hexagons (about {km2} km² each), built from the busiest {shown} of {n} cells',
  mapCaptionNone: 'No fire hexagons for this month. Pick another month in the calendar.',
  mapCaptionLoading: 'Loading fire hexagons',

  periodTitle: 'Period',
  from: 'From',
  to: 'To',

  headMore: '{month} had {pct}% more fire activity than a typical {m} in {place}.',
  headFewer: '{month} had {pct}% less fire activity than a typical {m} in {place}.',
  headNear: '{month} was about a typical {m} in {place}.',
  headNoBase: '{month} in {place}: {n} active cell-days.',
  headSub: 'Typical means the median of {m} in all other years: {med} active cell-days. This month: {val}.',
  latestNote: 'Showing the latest month. Click any square in the calendar to look at another month.',
  factPeakMonth: 'Fires usually peak in',
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
  noArea: 'No area chosen',
  presetAll: 'All years',
  presetTen: 'Last 10 years',
  presetFive: 'Last 5 years',
  detailsTitle: 'Details and data quality',
  detailsIntro: 'Satellites changed over the years, so older counts were converted to be comparable with recent ones. The calendar uses this combined series.',
  showHexes: 'Show fire hexagons on the map for the selected month',
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

type StrKey = { [K in keyof typeof en]: (typeof en)[K] extends string ? K : never }[keyof typeof en];

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
