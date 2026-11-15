import { cellToLatLng } from 'h3-js';
import { useEffect, useMemo, useState } from 'react';
import AnalogTab from './components/AnalogTab';
import AnnualChart from './components/AnnualChart';
import MonthCompareChart from './components/MonthCompareChart';
import AnomalyChart from './components/AnomalyChart';
import CalendarTab from './components/CalendarTab';
import ChartCard from './components/ChartCard';
import { type CalendarMode } from './components/FireCalendar';
import MapControls from './components/MapControls';
import MapLegend from './components/MapLegend';
import MapPanel from './components/MapPanel';
import NavRail from './components/NavRail';
import Segmented from './components/Segmented';
import SeasonalChart from './components/SeasonalChart';
import TopCellsList from './components/TopCellsList';
import Summary from './components/Summary';
import Toolbar from './components/Toolbar';
import TrendChart from './components/TrendChart';
import { btn } from './components/ui';
import { dataSource } from './data';
import { REGIONS } from './data/regions';
import type { Bbox, DataMeta, DateRange, DayPoint, HexCell, HexSample, MonthlyPoint, Source, TempSample } from './data/types';
import { useI18n } from './i18n';
import { valueOf } from './lib/aggregate';
import { buildCsv, buildDailyCsv, downloadText } from './lib/csv';
import { loadCountries, type Country } from './lib/countries';
import { pointInGeometry } from './lib/geo';
import { HEX_AREA_KM2, TEMP_STEPS, hexSteps, viewportBox, type HexStep, type HexValue } from './lib/hex';
import { monthCount, nearestMonth } from './lib/months';
import { anomalySeries, computeKpis, daysInPeriod, monthsVsUsual, periodAnomaly, seasonalProfile, seasonProgress, topCells } from './lib/stats';
import { DEFAULT_TAB, isTab, TABS } from './tabs';
import { decodeState, encodeState } from './lib/urlState';

const NO_HEXES: HexSample = { cells: [], total: 0, used: 0 };
const NO_TEMPS: TempSample = { cells: [], total: 0, used: 0, metric: 'bright_mir' };
const pad2 = (n: number) => String(n).padStart(2, '0');
const PRESET_BOXES = Object.fromEntries(REGIONS.map((r) => [r.id, r.bbox]));
// Only the area, series and month are read before the data limits are known; the range is read after.
const WIDE = { min: '0000-01', max: '9999-12' };
const fromUrl = () => decodeState(window.location.search, PRESET_BOXES, WIDE);

export default function App() {
  const { t, fmt, fmtMonth } = useI18n();
  const [meta, setMeta] = useState<DataMeta | null>(null);
  const initial = useMemo(fromUrl, []);
  const [source, setSource] = useState<Source>(initial.source ?? 'harmonized');
  const [mode, setMode] = useState<CalendarMode>('count');
  const [group, setGroup] = useState<'time' | 'usual' | 'where'>('time');
  const [flyTo, setFlyTo] = useState<{ lat: number; lon: number; n: number } | null>(null);
  const [tab, setTab] = useState<string>(isTab(initial.tab) ? initial.tab : DEFAULT_TAB);
  const [regionId, setRegionId] = useState(initial.regionId ?? 'amazon');
  // A shared country link has no box until the borders have loaded.
  const [bbox, setBbox] = useState<Bbox | null>(initial.regionId === 'country' ? null : initial.bbox !== undefined ? initial.bbox : REGIONS[0].bbox);
  // Zoom and latitude of the map once it settles; hexagon size follows it.
  const [view, setView] = useState<{ zoom: number; lat: number; bounds: Bbox } | null>(null);
  const [countries, setCountries] = useState<Country[]>([]);
  const [country, setCountry] = useState<Country | null>(null);
  const [fitSignal, setFitSignal] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const [range, setRange] = useState<DateRange>({ start: '2000-11', end: '2026-10' });
  const [limits, setLimits] = useState({ min: '2000-11', max: '2026-10' });
  const [all, setAll] = useState<MonthlyPoint[]>([]);
  const [synced, setSynced] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(initial.month ?? null);
  const [hexes, setHexes] = useState<HexSample>(NO_HEXES);
  const [dayPick, setDayPick] = useState<{ ym: string; day: number } | null>(null);
  const [daily, setDaily] = useState<DayPoint[]>([]);
  // On by default: the hexagons are the point of the map, so they should not hide behind a folded section.
  const [showHexes, setShowHexes] = useState(true);
  const [hexesLoading, setHexesLoading] = useState(true);
  const [temps, setTemps] = useState<TempSample>(NO_TEMPS);
  const [tempsLoading, setTempsLoading] = useState(false);

  useEffect(() => {
    dataSource.meta().then((m) => {
      setMeta(m);
      setLimits({ min: m.firstMonth, max: m.lastMonth });
      const shared = decodeState(window.location.search, PRESET_BOXES, { min: m.firstMonth, max: m.lastMonth }).range;
      setRange(shared ?? { start: m.firstMonth, end: m.lastMonth });
      setSynced(true);
    });
  }, []);

  // Country borders are a separate download (about 750 KB), so they load after the first paint.
  useEffect(() => {
    let alive = true;
    loadCountries().then((list) => {
      if (!alive) return;
      setCountries(list);
      if (initial.regionId !== 'country') return;
      const found = list.find((c) => c.id === initial.countryId);
      if (found) {
        setCountry(found);
        setBbox(found.bbox);
        setFitSignal((n) => n + 1);
      } else {
        setRegionId('none');
      }
    });
    return () => {
      alive = false;
    };
  }, [initial]);

  // Keep the address bar in step with the view so any state can be shared as a link.
  useEffect(() => {
    if (!synced) return;
    const q = encodeState({ regionId, countryId: country?.id ?? null, tab, bbox, range, source, month: selected }, limits);
    window.history.replaceState(null, '', `${window.location.pathname}?${q}`);
  }, [synced, regionId, country, tab, bbox, range, source, selected, limits]);

  useEffect(() => {
    if (!bbox) {
      setAll([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    dataSource
      .monthly(bbox)
      .then((r) => !cancelled && (setAll(r), setLoading(false)))
      .catch(() => !cancelled && (setFailed(true), setLoading(false)));
    return () => {
      cancelled = true;
    };
  }, [bbox]);

  const inRange = useMemo(() => all.filter((p) => p.yearMonth >= range.start && p.yearMonth <= range.end), [all, range]);
  const kRange = useMemo(() => computeKpis(inRange, source), [inRange, source]);
  const anomaly = useMemo(() => periodAnomaly(inRange, all, source), [inRange, all, source]);
  const hasData = !loading && inRange.length > 0 && kRange.total > 0;

  // One month is always in focus: the one the user picked, otherwise the latest with data.
  const withValue = useMemo(() => inRange.filter((p) => valueOf(p, source) !== null), [inRange, source]);
  const focusPoint = useMemo(
    () => withValue.find((p) => p.yearMonth === selected) ?? withValue[withValue.length - 1] ?? null,
    [withValue, selected],
  );
  const focus = focusPoint?.yearMonth ?? null;

  // A picked day only counts while its month is still the month in focus.
  const day = dayPick && dayPick.ym === focus ? dayPick.day : null;

  useEffect(() => {
    if (!bbox || !focus || loading) {
      setDaily([]);
      return;
    }
    let cancelled = false;
    dataSource
      .daily(bbox, focus)
      .then((d) => !cancelled && setDaily(d))
      .catch(() => !cancelled && setDaily([]));
    return () => {
      cancelled = true;
    };
  }, [bbox, focus, loading]);

  // The map always shows the data's own res7 cells, but only those in view (plus a margin): panning asks for the next part.
  const hexBox = useMemo(() => (bbox ? viewportBox(bbox, view ? view.bounds : null) : null), [bbox, view]);
  // The box as text, so the effect below only runs when the requested part really changes (a pan inside the margin keeps it).
  const boxKey = hexBox ? `${hexBox.west}|${hexBox.south}|${hexBox.east}|${hexBox.north}` : '';
  // The map follows the period chosen in the top bar. Only a single day (picked on the Calendar tab) narrows it to its month.
  // Over more than a year the map shows the month in focus (a year-long map of 25 years is slow and an unreadable blur);
  // the charts and the calendar keep the whole period.
  const mapMonthOnly = monthCount(range) > 12;
  const oneMonth = (day !== null || mapMonthOnly) && !!focus;
  const hexStart = oneMonth && focus ? focus : range.start;
  const hexEnd = oneMonth && focus ? focus : range.end;
  useEffect(() => {
    if (!showHexes || !hexBox || !synced) {
      setHexes(NO_HEXES);
      setHexesLoading(false);
      return;
    }
    let cancelled = false;
    setHexesLoading(true);
    const done = (s: HexSample) => {
      if (cancelled) return;
      setHexes(s);
      setHexesLoading(false);
    };
    dataSource
      .hexes(hexBox, { start: hexStart, end: hexEnd }, source, day ?? undefined, { res: 7 })
      .then(done)
      .catch(() => done(NO_HEXES));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxKey, hexStart, hexEnd, source, day, showHexes, synced]);

  // The Calendar tab colours the map by temperature: the hottest reading of the picked day, or of the whole month when no day is picked.
  const tempQuery = focus ? (day !== null ? { day: `${focus}-${pad2(day)}` } : { month: focus }) : null;
  const tempKey = tempQuery ? ('day' in tempQuery ? tempQuery.day : tempQuery.month) : '';
  useEffect(() => {
    if (tab !== 'calendar' || !hexBox || !synced || !tempQuery || !showHexes || !dataSource.temps) {
      setTemps(NO_TEMPS);
      setTempsLoading(false);
      return;
    }
    let cancelled = false;
    setTempsLoading(true);
    const done = (s: TempSample) => {
      if (cancelled) return;
      setTemps(s);
      setTempsLoading(false);
    };
    dataSource
      .temps(hexBox, tempQuery, source)
      .then(done)
      .catch(() => done(NO_TEMPS));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, boxKey, tempKey, source, showHexes, synced]);

  // The busiest-cells list needs the cells themselves (res7), a few hundred of the busiest is plenty to pick ten from.
  const [whereRaw, setWhereRaw] = useState<HexCell[]>([]);
  useEffect(() => {
    if (group !== 'where' || !bbox || !synced) return;
    let cancelled = false;
    dataSource
      .hexes(bbox, { start: hexStart, end: hexEnd }, source, day ?? undefined, { res: 7, limit: 300 })
      .then((h) => !cancelled && setWhereRaw(h.cells))
      .catch(() => !cancelled && setWhereRaw([]));
    return () => {
      cancelled = true;
    };
  }, [group, bbox, hexStart, hexEnd, source, day, synced]);

  const region = REGIONS.find((r) => r.id === regionId);
  const place = country ? country.name : (region && (region.enInSentence ?? region.name)) || t('placeCustom');

  const pickRegion = (id: string) => {
    const r = REGIONS.find((x) => x.id === id);
    if (!r) return;
    setRegionId(id);
    setCountry(null);
    setBbox(r.bbox);
    setFitSignal((n) => n + 1);
    setDrawing(false);
  };
  const pickCountry = (id: string) => {
    const c = countries.find((x) => x.id === id);
    if (!c) return;
    setRegionId('country');
    setCountry(c);
    setBbox(c.bbox);
    setFitSignal((n) => n + 1);
    setDrawing(false);
  };
  const applyBbox = (b: Bbox) => {
    setRegionId('custom');
    setCountry(null);
    setBbox(b);
    setFitSignal((n) => n + 1);
  };
  const drawn = (b: Bbox) => {
    setRegionId('custom');
    setCountry(null);
    setBbox(b);
    setDrawing(false);
  };
  const clear = () => {
    setRegionId('none');
    setCountry(null);
    setBbox(null);
    setDrawing(false);
    setSelected(null);
    setFitSignal((n) => n + 1);
  };
  // A month typed by hand may have no data; move to the closest one that has.
  const pickMonth = (ym: string) => {
    setSelected(nearestMonth(withValue.map((p) => p.yearMonth), ym) ?? ym);
    setDayPick(null);
  };
  // A year clicked on the totals chart: the same calendar month of that year if it has data, otherwise its last month.
  const pickYear = (year: number) => {
    const inYear = withValue.filter((p) => p.year === year);
    if (!inYear.length) return;
    pickMonth((inYear.find((p) => p.month === focusPoint?.month) ?? inYear[inYear.length - 1]).yearMonth);
  };

  const exportCsv = () => {
    if (!meta || !bbox) return;
    downloadText(`firecalendar_${source}_${range.start}_${range.end}.csv`, buildCsv(inRange, meta, bbox, range, source));
  };

  const exportDaily = () => {
    if (!meta || !bbox || !focus) return;
    downloadText(`firecalendar_daily_${source}_${focus}.csv`, buildDailyCsv(daily, focus, meta, bbox, source));
  };
  // Every cell-day of the month in focus, read on demand (a few thousand to a few hundred thousand rows).
  const exportCells = dataSource.cellsCsv
    ? async () => {
        if (!bbox || !focus || !dataSource.cellsCsv) return;
        downloadText(`firecalendar_cells_${source}_${focus}.csv`, await dataSource.cellsCsv(bbox, focus, source));
      }
    : undefined;

  const hexView = useMemo(() => {
    // A country keeps the cells whose centre is inside its borders (the box also holds its neighbours' cells).
    const cells = country
      ? hexes.cells.filter((c) => {
          const [lat, lon] = cellToLatLng(c.h3);
          return pointInGeometry(lon, lat, country.geometry);
        })
      : hexes.cells;
    const items = cells.map((c) => ({ h3: c.h3, value: c.days }));
    const max = items.reduce((m, c) => Math.max(m, c.value), 1);
    return { res: 7, items, steps: hexSteps(max), km2: Math.round(HEX_AREA_KM2[7]).toLocaleString('en-US') };
  }, [hexes, country]);

  const tempView = useMemo(() => {
    const cells = country
      ? temps.cells.filter((c) => {
          const [lat, lon] = cellToLatLng(c.h3);
          return pointInGeometry(lon, lat, country.geometry);
        })
      : temps.cells;
    return cells.map((c) => ({ h3: c.h3, value: c.tempC, n: c.n }));
  }, [temps, country]);
  const tempWhen = focus ? (day !== null ? `${day} ${fmtMonth(focus)}` : fmtMonth(focus)) : '';
  const tempCaption = tempsLoading
    ? t('tempLoading')
    : !dataSource.temps
      ? t('tempUnavailable')
      : tempView.length === 0
        ? t('tempNone', { when: day !== null ? `on ${tempWhen}` : `in ${tempWhen}` })
        : t('tempCaption', { when: tempWhen, cells: fmt(tempView.length) });

  const focusYear = focusPoint?.year ?? null;
  const shortPeriod = monthCount(range) <= 12;
  const monthRows = useMemo(() => monthsVsUsual(inRange, all, source), [inRange, all, source]);
  const anomalies = useMemo(() => anomalySeries(inRange, all, source), [inRange, all, source]);
  const seasonal = useMemo(() => seasonalProfile(all, source, focusYear), [all, source, focusYear]);
  const progress = useMemo(() => seasonProgress(all, source, focusYear), [all, source, focusYear]);
  const busiestCells = useMemo(() => {
    const cells = country
      ? whereRaw.filter((c) => {
          const [lat, lon] = cellToLatLng(c.h3);
          return pointInGeometry(lon, lat, country.geometry);
        })
      : whereRaw;
    return topCells(cells, daysInPeriod({ start: hexStart, end: hexEnd }), 10);
  }, [whereRaw, country, hexStart, hexEnd]);

  const monthNote = mapMonthOnly && focus ? ` ${t('mapMonthNote', { month: fmtMonth(focus) })}` : '';
  const captionBase = hexesLoading
    ? t('mapCaptionLoading')
    : hexes.total === 0
      ? t('mapCaptionNone')
      : hexes.used < hexes.total
        ? t('mapCaptionSample', { cells: fmt(hexView.items.length), km2: hexView.km2, shown: fmt(hexes.used), n: fmt(hexes.total) })
        : t('mapCaptionAll', { cells: fmt(hexView.items.length), km2: hexView.km2, n: fmt(hexes.total) });
  const caption = captionBase + monthNote;

  const areaProps = {
    regionId,
    countries,
    countryId: country?.id ?? null,
    onRegion: (id: string) => (id.startsWith('country:') ? pickCountry(id.slice('country:'.length)) : pickRegion(id)),
  };

  const rawNotice =
    bbox && source !== 'harmonized' ? (
      <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-warn-wash px-3 py-2 text-sm" role="status">
        {t('rawNotice', { series: source === 'modis' ? t('srcModis') : t('srcViirs') })}
        <button type="button" className="inline-flex min-h-10 items-center font-semibold underline pointer-coarse:min-h-11" onClick={() => setSource('harmonized')}>
          {t('rawBack')}
        </button>
      </p>
    ) : null;

  // What both sections show instead of their content when there is nothing to show yet.
  const status = !bbox ? (
    <div className="flex flex-col gap-3 py-12" role="status">
      <h2 className="font-display text-3xl font-semibold leading-tight">{t('emptyTitle')}</h2>
      <p className="text-muted">{t('emptyHint')}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {REGIONS.map((r) => (
          <button key={r.id} type="button" className={btn} onClick={() => pickRegion(r.id)}>
            {r.name}
          </button>
        ))}
      </div>
    </div>
  ) : failed ? (
    <div className="flex flex-col gap-3 py-12" role="alert">
      <h2 className="font-display text-3xl font-semibold leading-tight">{t('loadError')}</h2>
    </div>
  ) : loading ? (
    <div className="flex flex-col gap-3 py-12" role="status" aria-busy="true">
      <div className="skeleton" style={{ height: 96 }} />
      <div className="skeleton" style={{ height: 320 }} />
      <p className="text-muted">{t('loading')}</p>
    </div>
  ) : !hasData || !focusPoint ? (
    <div className="flex flex-col gap-3 py-12" role="status">
      <h2 className="font-display text-3xl font-semibold leading-tight">{t('noDataTitle')}</h2>
      <p className="text-muted">{t('noDataHint')}</p>
    </div>
  ) : null;

  const footer = <p className="border-t border-line pb-6 pt-4 text-sm text-muted">{t('footer')}</p>;

  // The map beside the results: the Overview colours it by days with fire, the Calendar by temperature.
  const mapArea = (p: { cells: HexValue[]; steps: HexStep[]; kind: 'days' | 'tempC'; sparse?: boolean; legend: 'period' | 'day' | 'tempDay' | 'tempMonth'; caption: string; empty: boolean }) => (
    <div className="relative h-[46vh] min-h-72 lg:h-auto lg:min-h-0">
      <MapPanel bbox={bbox} fitSignal={fitSignal} drawing={drawing} onDrawn={drawn} cells={showHexes ? p.cells : []} outline={country ? country.geometry : null} onView={setView} flyTo={flyTo} steps={p.steps} valueKind={p.kind} sparse={p.sparse} onPickRegion={pickRegion} />
      {showHexes && bbox && p.empty && (
        <p className="pointer-events-none absolute bottom-10 right-3 z-10 max-w-64 rounded-lg bg-surface/95 px-3 py-2 text-sm shadow-sm" role="status">
          {t('mapCaptionNone')}
        </p>
      )}
      <MapLegend hasArea={!!bbox} hexMode={showHexes && p.cells.length > 0 ? p.legend : null} steps={p.steps} caption={p.caption} />
      <MapControls bbox={bbox} drawing={drawing} onBbox={applyBbox} onDrawToggle={() => setDrawing((d) => !d)} onClear={clear} showHexes={showHexes} onShowHexes={setShowHexes} />
    </div>
  );

  return (
    <div className="flex min-h-full flex-col lg:h-dvh">
      <Toolbar {...areaProps} range={range} limits={limits} onRange={setRange} canDownload={hasData} onDownload={exportCsv} isMock={!!meta?.isMock} />

      <div className="flex min-h-0 flex-1 flex-col pb-16 lg:flex-row lg:pb-0">
        <NavRail tabs={TABS} active={tab} onChange={setTab} />

        <main className="min-h-0 min-w-0 flex-1">
          {tab === 'overview' && (
            <div role="tabpanel" id="panel-overview" aria-labelledby="tab-overview" className="grid h-full lg:grid-cols-[minmax(0,1.1fr)_minmax(420px,1fr)] lg:grid-rows-[minmax(0,1fr)]">
              {mapArea({ cells: hexView.items, steps: hexView.steps, kind: 'days', legend: day !== null ? 'day' : 'period', caption, empty: !loading && !hexesLoading && hexes.total === 0 })}

              <div className="min-w-0 bg-surface px-4 lg:overflow-y-auto lg:border-l lg:border-line lg:px-7">
                {rawNotice}
                {status ?? (
                  focusPoint && (
                    <>
                      <Summary period={range} anomaly={anomaly} range={kRange} place={place} />
                      <div className="border-t border-line pt-4">
                        <Segmented<'time' | 'usual' | 'where'>
                          label={t('groupLabel')}
                          value={group}
                          onChange={setGroup}
                          options={[
                            { value: 'time', label: t('groupTime') },
                            { value: 'usual', label: t('groupUsual') },
                            { value: 'where', label: t('groupWhere') },
                          ]}
                        />
                      </div>
                      {group === 'time' && (
                        <>
                          <ChartCard id="trend-h" title={t('trendTitle')} hint={inRange.some((p) => p.modis !== null && p.harmonized === null) ? `${t('trendHint')} ${t('noCombinedNote')}` : t('trendHint')}>
                            <TrendChart points={inRange} source={source} focus={focus} onSelect={pickMonth} />
                          </ChartCard>
                          {shortPeriod ? (
                            <ChartCard id="months-h" title={t('monthCompareTitle')} hint={t('monthCompareHint')}>
                              <MonthCompareChart months={monthRows} focus={focus} onSelect={pickMonth} />
                            </ChartCard>
                          ) : (
                            <ChartCard id="annual-h" title={t('annualTitle')} hint={t('annualHint')}>
                              <AnnualChart points={inRange} source={source} focusYear={focusPoint.year} onSelectYear={pickYear} />
                            </ChartCard>
                          )}
                        </>
                      )}
                      {group === 'usual' && (
                        <>
                          <ChartCard id="anomaly-h" title={t('anomalyTitle')} hint={t('anomalyHint')}>
                            <AnomalyChart series={anomalies} focus={focus} onSelect={pickMonth} />
                          </ChartCard>
                          <ChartCard id="seasonal-h" title={t('seasonalTitle', { year: String(focusPoint.year) })} hint={t('seasonalHint', { year: String(focusPoint.year) })}>
                            <SeasonalChart profile={seasonal} focusYear={focusPoint.year} ariaLabel={t('seasonalTitle', { year: String(focusPoint.year) })} />
                          </ChartCard>
                          <ChartCard id="progress-h" title={t('progressTitle')} hint={t('progressHint', { year: String(focusPoint.year) })}>
                            <SeasonalChart profile={progress} focusYear={focusPoint.year} ariaLabel={t('progressTitle')} />
                          </ChartCard>
                        </>
                      )}
                      {group === 'where' && (
                        <ChartCard id="cells-h" title={t('cellsTitle')} hint={t('cellsHint')}>
                          <TopCellsList cells={busiestCells} onGo={(lat, lon) => setFlyTo((f) => ({ lat, lon, n: (f?.n ?? 0) + 1 }))} />
                        </ChartCard>
                      )}
                    </>
                  )
                )}
                {footer}
              </div>
            </div>
          )}

          {tab === 'analog' && (
            <div role="tabpanel" id="panel-analog" aria-labelledby="tab-analog" className="h-full bg-surface px-4 sm:px-7 lg:overflow-y-auto">
              <div className="mx-auto max-w-5xl">
                <AnalogTab bbox={bbox} place={place} />
                {footer}
              </div>
            </div>
          )}

          {tab === 'calendar' && (
            <div role="tabpanel" id="panel-calendar" aria-labelledby="tab-calendar" className="grid h-full lg:grid-cols-[minmax(0,1.1fr)_minmax(420px,1fr)] lg:grid-rows-[minmax(0,1fr)]">
              {mapArea({ cells: tempView, steps: TEMP_STEPS, kind: 'tempC', sparse: day !== null, legend: day !== null ? 'tempDay' : 'tempMonth', caption: tempCaption, empty: !!tempQuery && !tempsLoading && !!dataSource.temps && temps.total === 0 })}

              <div className="min-w-0 bg-surface px-4 lg:overflow-y-auto lg:border-l lg:border-line lg:px-7">
                {rawNotice}
                {status ?? (
                  focusPoint && (
                    <CalendarTab
                      point={focusPoint}
                      inRange={inRange}
                      all={all}
                      source={source}
                      onSource={setSource}
                      mode={mode}
                      onMode={setMode}
                      meta={meta}
                      focus={focus}
                      onSelect={pickMonth}
                      daily={daily}
                      day={day}
                      onPickDay={(d) => setDayPick(d === null ? null : { ym: focusPoint.yearMonth, day: d })}
                      onDownloadMonthly={exportCsv}
                      onDownloadDaily={exportDaily}
                      onDownloadCells={exportCells}
                    />
                  )
                )}
                {footer}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
