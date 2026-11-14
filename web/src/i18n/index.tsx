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
  legendPoint: 'Fire detection',

  map: 'Map of the selected area and its fire detections',
  region: 'Region',
  chooseRegion: 'Choose a region',
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
  mapCaptionAll: '{n} raw detections',
  mapCaptionSample: '{shown} of {n} raw detections drawn',
  mapCaptionNone: 'No detections this month',
  mapCaptionLoading: 'Loading fire points',

  periodTitle: 'Period',
  from: 'From',
  to: 'To',

  headMore: '{month} had {pct}% more fire detections than a typical {m} in {place}.',
  headFewer: '{month} had {pct}% fewer fire detections than a typical {m} in {place}.',
  headNear: '{month} was about a typical {m} in {place}.',
  headNoBase: '{month} in {place}: {n} fire detections.',
  headSub: 'Typical means the median of {m} in all other years: {med} detections. This month: {val}.',
  latestNote: 'Showing the latest month. Click any square in the calendar to look at another month.',
  factPeakMonth: 'Fires usually peak in',
  factPeakYear: 'Most active year',
  factPeakYearSub: '{n} detections',
  factTotal: 'Fire detections in this period',
  factTotalSub: 'Across the selected area and dates',
  noBaseline: 'n/a',
  verdictHigher: 'Higher than usual',
  verdictTypical: 'About usual',
  verdictLower: 'Lower than usual',
  verdictUnknown: 'No comparison yet',
  howToReadCount: 'How to read this: each square is one month. Darker means more fire detections.',
  howToReadAnomaly: 'How to read this: each square is one month. Orange is more than usual, blue is less than usual.',
  areaLabel: 'Area',
  noArea: 'No area chosen',
  presetAll: 'All years',
  presetTen: 'Last 10 years',
  presetFive: 'Last 5 years',
  detailsTitle: 'Details and data quality',
  detailsIntro: 'Satellites changed over the years, so older counts were converted to be comparable with recent ones. The calendar uses this combined series.',
  showPoints: 'Show fire points on the map for the selected month',
  rawNotice: 'Showing {series}, not the combined series.',
  rawBack: 'Back to combined series',

  calendarTitle: 'Burning activity calendar',
  calendarMode: 'Calendar display',
  modeCount: 'Fire detections',
  modeAnomaly: 'Compared with usual',
  modisOnlyYears: '{from}–{to}: older, lower-detail record',
  legendSelected: 'Selected month',
  legendNrt: 'Preliminary, may change',
  legendNoData: 'No data',
  hotspots: 'fire detections',
  historicalMedian: 'Typical for this month',
  vsMedian: 'compared with typical',

  dailyTitle: 'Daily calendar for {month}',
  dailyHint: 'Pick a day to see only its fire points on the map. Darker means more fire detections; the number is the day total.',
  wholeMonth: 'Whole month',
  dayTotal: '{n} fire detections on {date}',
  weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  trendTitle: 'Monthly fire detections over time',
  calibrationOverlap: 'calibration overlap',

  explainTitle: 'Why did this number change after harmonization?',
  explainSources: 'Satellite sources',
  sensorModis: 'Terra/Aqua MODIS',
  sensorViirs: 'S-NPP and NOAA-20 VIIRS',
  explainHarmonized: 'Harmonized',
  explainConversion: 'Conversion',
  convModisOnly: 'None. Only MODIS exists for this month, so its count is used as is.',
  convViirsScaled: 'VIIRS count multiplied by {f} to bring it onto the MODIS scale.',
  convBlend: 'Average of the MODIS count and the VIIRS count multiplied by {f}.',
  convMixed: 'Grid cells in this area use different conversions: {list}.',
  notObserved: 'not observed',
  badgeInCalib: 'Inside calibration range',
  badgeOutCalib: 'Outside calibration range',
  badgeStandard: 'Standard data',
  badgeNrt: 'Preliminary (NRT)',
  limitationsTitle: 'Limitations',
  limModisOnly: 'Before 2012 only MODIS is available (1 km pixels, lower sensitivity), so small fires are undercounted compared with later years.',
  limOutCalib: 'This month is after the calibration window, so the scale factor is extrapolated.',
  limNrt: 'This is near-real-time data. Values can change when standard processing is released.',
  limNone: 'None for this month.',
  methodTitle: 'Method',

  emptyTitle: 'Pick a place to read its fire history',
  emptyHint: 'Choose a region below, or use Draw area on the map.',
  loading: 'Loading fire history',
  noDataTitle: 'No fire detections in this area and period',
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
