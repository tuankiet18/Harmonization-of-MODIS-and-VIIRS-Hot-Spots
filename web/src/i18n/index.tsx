import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const en = {
  appName: 'FireCalendar',
  appSubtitle: 'MODIS and VIIRS hotspots on one scale',
  demoBanner: 'Demo data. These numbers are synthetic, for building the interface. They are not NASA FIRMS observations.',
  srcHarmonized: 'Harmonized',
  srcModis: 'MODIS raw',
  srcViirs: 'VIIRS raw',
  srcLabel: 'Data series',
  downloadCsv: 'Download CSV',
  language: 'Language',

  map: 'Map of the selected area and its hotspots',
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
  prevDay: 'Previous day',
  nextDay: 'Next day',
  mapDayLabel: 'Day shown on the map',
  mapCaptionAll: '{n} raw detections',
  mapCaptionSample: '{shown} of {n} raw detections drawn',
  mapCaptionNone: 'No detections this month',

  periodTitle: 'Period for the calendar and totals',
  mapMonthLabel: 'Month shown on the map',
  from: 'From',
  to: 'To',

  headMore: '{month} saw {pct}% more hotspots than a typical {m} in {place}.',
  headFewer: '{month} saw {pct}% fewer hotspots than a typical {m} in {place}.',
  headNear: '{month} was close to a typical {m} in {place}.',
  headNoBase: '{month} in {place}: {n} hotspots.',
  headSub: 'Typical is the median of the same month in other years: {med} hotspots. This month: {val}.',
  latestNote: 'Showing the latest month. Pick any month in the calendar to change it.',
  factPeakMonth: 'Fires usually peak in',
  factPeakYear: 'Most active year',
  factPeakYearSub: '{n} hotspots',
  factTotal: 'Hotspots in this period',
  factTotalSub: '{cells} grid cells, {months} months',
  noBaseline: 'n/a',

  calendarTitle: 'Burning activity calendar',
  calendarMode: 'Calendar display',
  modeCount: 'Counts',
  modeAnomaly: 'Against the median',
  modisOnlyYears: 'Years {from} to {to}: MODIS only',
  legendSelected: 'Month in focus',
  legendNrt: 'Preliminary (NRT)',
  legendNoData: 'No data',
  hotspots: 'hotspots',
  historicalMedian: 'Historical median',
  vsMedian: 'against the median',

  dailyTitle: 'Daily calendar for {month}',
  dailyHint: 'Pick a day to see only its hotspots on the map. Darker means more hotspots; the number is the day total.',
  wholeMonth: 'Whole month',
  dayTotal: '{n} hotspots on {date}',
  weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  trendTitle: 'Monthly hotspots, raw and harmonized',
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
  loading: 'Loading hotspot history',
  noDataTitle: 'No hotspots were detected in this area and period',
  noDataHint: 'Widen the date range or draw a larger area.',
  loadError: 'The data could not be loaded. Reload the page to try again.',
  footer: 'Hotspot source: NASA FIRMS (MODIS and VIIRS). Built for the NASA Space Apps Challenge 2026.',
  months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  monthsLong: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

type Dict = typeof en;

const vi: Dict = {
  appName: 'FireCalendar',
  appSubtitle: 'Điểm cháy MODIS và VIIRS trên cùng một thang đo',
  demoBanner: 'Dữ liệu demo. Các con số là giả, dùng để dựng giao diện, không phải quan trắc của NASA FIRMS.',
  srcHarmonized: 'Đã hiệu chỉnh',
  srcModis: 'MODIS gốc',
  srcViirs: 'VIIRS gốc',
  srcLabel: 'Chuỗi dữ liệu',
  downloadCsv: 'Tải CSV',
  language: 'Ngôn ngữ',

  map: 'Bản đồ vùng đã chọn và các điểm cháy',
  region: 'Vùng',
  chooseRegion: 'Chọn một vùng',
  customArea: 'Vùng tự chọn',
  placeCustom: 'vùng này',
  drawArea: 'Vẽ vùng',
  drawing: 'Kéo trên bản đồ',
  coords: 'Tọa độ',
  clear: 'Xóa vùng',
  south: 'Vĩ độ Nam',
  north: 'Vĩ độ Bắc',
  west: 'Kinh độ Tây',
  east: 'Kinh độ Đông',
  applyBbox: 'Dùng tọa độ này',
  bboxInvalid: 'Kiểm tra lại khung: Nam phải nhỏ hơn Bắc (−90 đến 90) và Tây nhỏ hơn Đông (−180 đến 180).',
  prevMonth: 'Tháng trước',
  nextMonth: 'Tháng sau',
  prevDay: 'Ngày trước',
  nextDay: 'Ngày sau',
  mapDayLabel: 'Ngày đang hiện trên bản đồ',
  mapCaptionAll: '{n} điểm phát hiện gốc',
  mapCaptionSample: 'Vẽ {shown} trên {n} điểm phát hiện gốc',
  mapCaptionNone: 'Không có điểm phát hiện trong tháng này',

  periodTitle: 'Giai đoạn cho lịch và số tổng',
  mapMonthLabel: 'Tháng đang hiện trên bản đồ',
  from: 'Từ',
  to: 'Đến',

  headMore: '{month} có số điểm cháy cao hơn {pct}% so với {m} thông thường ở {place}.',
  headFewer: '{month} có số điểm cháy thấp hơn {pct}% so với {m} thông thường ở {place}.',
  headNear: '{month} gần với mức thông thường của {m} ở {place}.',
  headNoBase: '{month} ở {place}: {n} điểm cháy.',
  headSub: 'Mức thông thường là trung vị của cùng tháng ở các năm khác: {med} điểm cháy. Tháng này: {val}.',
  latestNote: 'Đang hiển thị tháng gần nhất. Chọn một tháng bất kỳ trên lịch để đổi.',
  factPeakMonth: 'Cháy thường đạt đỉnh vào',
  factPeakYear: 'Năm cháy nhiều nhất',
  factPeakYearSub: '{n} điểm cháy',
  factTotal: 'Điểm cháy trong giai đoạn này',
  factTotalSub: '{cells} ô lưới, {months} tháng',
  noBaseline: 'không có',

  calendarTitle: 'Lịch hoạt động cháy',
  calendarMode: 'Cách hiển thị lịch',
  modeCount: 'Số lượng',
  modeAnomaly: 'So với trung vị',
  modisOnlyYears: 'Các năm {from} đến {to}: chỉ có MODIS',
  legendSelected: 'Tháng đang xem',
  legendNrt: 'Sơ bộ (NRT)',
  legendNoData: 'Không có dữ liệu',
  hotspots: 'điểm cháy',
  historicalMedian: 'Trung vị lịch sử',
  vsMedian: 'so với trung vị',

  dailyTitle: 'Lịch theo ngày của {month}',
  dailyHint: 'Chọn một ngày để chỉ xem điểm cháy của ngày đó trên bản đồ. Màu càng đậm càng nhiều điểm cháy; con số là tổng của ngày.',
  wholeMonth: 'Cả tháng',
  dayTotal: '{n} điểm cháy ngày {date}',
  weekdays: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'],
  trendTitle: 'Điểm cháy theo tháng, gốc và đã hiệu chỉnh',
  calibrationOverlap: 'giai đoạn chồng lấn',

  explainTitle: 'Vì sao con số này thay đổi sau hiệu chỉnh?',
  explainSources: 'Nguồn vệ tinh',
  sensorModis: 'Terra/Aqua MODIS',
  sensorViirs: 'S-NPP và NOAA-20 VIIRS',
  explainHarmonized: 'Đã hiệu chỉnh',
  explainConversion: 'Phép quy đổi',
  convModisOnly: 'Không có. Tháng này chỉ có MODIS nên dùng nguyên số đếm của MODIS.',
  convViirsScaled: 'Số đếm VIIRS nhân với {f} để đưa về thang MODIS.',
  convBlend: 'Trung bình của số đếm MODIS và số đếm VIIRS nhân với {f}.',
  convMixed: 'Các ô lưới trong vùng dùng phép quy đổi khác nhau: {list}.',
  notObserved: 'không quan trắc',
  badgeInCalib: 'Trong miền kiểm định',
  badgeOutCalib: 'Ngoài miền kiểm định',
  badgeStandard: 'Dữ liệu chuẩn',
  badgeNrt: 'Sơ bộ (NRT)',
  limitationsTitle: 'Hạn chế',
  limModisOnly: 'Trước 2012 chỉ có MODIS (pixel 1 km, độ nhạy thấp hơn), nên các đám cháy nhỏ bị đếm thiếu so với các năm sau.',
  limOutCalib: 'Tháng này nằm sau giai đoạn kiểm định, nên hệ số quy đổi là ngoại suy.',
  limNrt: 'Đây là dữ liệu gần thời gian thực. Giá trị có thể đổi khi có dữ liệu xử lý chuẩn.',
  limNone: 'Tháng này không có.',
  methodTitle: 'Phương pháp',

  emptyTitle: 'Chọn một nơi để xem lịch sử cháy',
  emptyHint: 'Chọn một vùng bên dưới, hoặc dùng Vẽ vùng trên bản đồ.',
  loading: 'Đang tải lịch sử điểm cháy',
  noDataTitle: 'Không phát hiện điểm cháy trong vùng và giai đoạn này',
  noDataHint: 'Mở rộng khoảng thời gian hoặc vẽ vùng lớn hơn.',
  loadError: 'Không tải được dữ liệu. Tải lại trang để thử lại.',
  footer: 'Nguồn điểm cháy: NASA FIRMS (MODIS và VIIRS). Làm cho NASA Space Apps Challenge 2026.',
  months: ['Th1', 'Th2', 'Th3', 'Th4', 'Th5', 'Th6', 'Th7', 'Th8', 'Th9', 'Th10', 'Th11', 'Th12'],
  monthsLong: ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'],
};

export type Lang = 'en' | 'vi';
const dicts: Record<Lang, Dict> = { en, vi };
type StrKey = { [K in keyof Dict]: Dict[K] extends string ? K : never }[keyof Dict];

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: StrKey, vars?: Record<string, string | number>) => string;
  months: string[];
  monthsLong: string[];
  fmt: (n: number) => string;
  fmtCompact: (n: number) => string;
  fmtPct: (n: number) => string;
  /** 'YYYY-MM' -> 'September 2019' / 'Tháng 9/2019' */
  fmtMonth: (ym: string) => string;
  /** Month name as used mid-sentence: 'September' / 'tháng 9' */
  monthInSentence: (m: number) => string;
  /** 'YYYY-MM' + day -> 'Oct 5, 2026' / '5/10/2026' */
  fmtDay: (ym: string, day: number) => string;
  weekdays: string[];
}

const Ctx = createContext<I18n | null>(null);

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('lang');
    if (saved === 'en' || saved === 'vi') return saved;
  } catch {
    /* storage blocked */
  }
  return navigator.language?.toLowerCase().startsWith('vi') ? 'vi' : 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem('lang', l);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<I18n>(() => {
    const d = dicts[lang];
    const locale = lang === 'vi' ? 'vi-VN' : 'en-US';
    const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
    const cf = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 });
    return {
      lang,
      setLang,
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
        return lang === 'vi' ? `${d.monthsLong[m - 1]}/${y}` : `${d.monthsLong[m - 1]} ${y}`;
      },
      monthInSentence: (m) => (lang === 'vi' ? d.monthsLong[m - 1].toLowerCase() : d.monthsLong[m - 1]),
      fmtDay: (ym, day) => {
        const [y, m] = ym.split('-').map(Number);
        return lang === 'vi' ? `${day}/${m}/${y}` : `${d.months[m - 1]} ${day}, ${y}`;
      },
      weekdays: d.weekdays,
    };
  }, [lang, setLang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n outside provider');
  return v;
}
