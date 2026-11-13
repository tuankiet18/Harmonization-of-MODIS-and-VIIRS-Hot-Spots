import { useEffect, useMemo, useState } from 'react';
import DailyCalendar from './components/DailyCalendar';
import ExplainPanel from './components/ExplainPanel';
import FireCalendar, { type CalendarMode } from './components/FireCalendar';
import { IconDownload, IconNext, IconPrev, Logo } from './components/Icons';
import MapControls from './components/MapControls';
import MapPanel from './components/MapPanel';
import Segmented from './components/Segmented';
import Summary from './components/Summary';
import TrendChart from './components/TrendChart';
import MonthPicker from './components/MonthPicker';
import { btn, btnSolid, toolIcon } from './components/ui';
import { dataSource } from './data';
import { REGIONS } from './data/regions';
import type { Bbox, DataMeta, DateRange, DayPoint, HotspotSample, MonthRecord, Source } from './data/types';
import { useI18n, type Lang } from './i18n';
import { aggregateMonthly, valueOf } from './lib/aggregate';
import { buildCsv, downloadText } from './lib/csv';
import { computeKpis } from './lib/stats';

const NO_POINTS: HotspotSample = { points: [], total: 0 };

export default function App() {
  const { t, lang, setLang, fmt, fmtMonth, fmtDay } = useI18n();
  const [meta, setMeta] = useState<DataMeta | null>(null);
  const [source, setSource] = useState<Source>('harmonized');
  const [mode, setMode] = useState<CalendarMode>('count');
  const [regionId, setRegionId] = useState('amazon');
  const [bbox, setBbox] = useState<Bbox | null>(REGIONS[0].bbox);
  const [fitSignal, setFitSignal] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const [range, setRange] = useState<DateRange>({ start: '2000-11', end: '2026-10' });
  const [limits, setLimits] = useState({ min: '2000-11', max: '2026-10' });
  const [records, setRecords] = useState<MonthRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [sample, setSample] = useState<HotspotSample>(NO_POINTS);
  const [dayPick, setDayPick] = useState<{ ym: string; day: number } | null>(null);
  const [daily, setDaily] = useState<DayPoint[]>([]);

  useEffect(() => {
    dataSource.meta().then((m) => {
      setMeta(m);
      setLimits({ min: m.firstMonth, max: m.lastMonth });
      setRange({ start: m.firstMonth, end: m.lastMonth });
    });
  }, []);

  useEffect(() => {
    if (!bbox) {
      setRecords([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    dataSource
      .query(bbox)
      .then((r) => !cancelled && (setRecords(r), setLoading(false)))
      .catch(() => !cancelled && (setFailed(true), setLoading(false)));
    return () => {
      cancelled = true;
    };
  }, [bbox]);

  const all = useMemo(() => aggregateMonthly(records), [records]);
  const inRange = useMemo(() => all.filter((p) => p.yearMonth >= range.start && p.yearMonth <= range.end), [all, range]);
  const kRange = useMemo(() => computeKpis(inRange, source), [inRange, source]);
  const cells = useMemo(() => new Set(records.map((r) => r.cellId)).size, [records]);
  const hasData = !loading && inRange.length > 0 && kRange.total > 0;

  // One month is always in focus: the one the user picked, otherwise the latest with data.
  const withValue = useMemo(() => inRange.filter((p) => valueOf(p, source) !== null), [inRange, source]);
  const focusPoint = useMemo(
    () => withValue.find((p) => p.yearMonth === selected) ?? withValue[withValue.length - 1] ?? null,
    [withValue, selected],
  );
  const focus = focusPoint?.yearMonth ?? null;
  const focusIdx = focusPoint ? withValue.indexOf(focusPoint) : -1;
  const isLatest = !!focusPoint && focusPoint.yearMonth !== selected;

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

  useEffect(() => {
    if (!bbox || !focus || loading) {
      setSample(NO_POINTS);
      return;
    }
    let cancelled = false;
    dataSource
      .points(bbox, focus, source, day ?? undefined)
      .then((s) => !cancelled && setSample(s))
      .catch(() => !cancelled && setSample(NO_POINTS));
    return () => {
      cancelled = true;
    };
  }, [bbox, focus, source, loading, day]);

  const region = REGIONS.find((r) => r.id === regionId);
  const place = region ? (lang === 'en' && region.enInSentence) || region.name[lang] : t('placeCustom');

  const pickRegion = (id: string) => {
    const r = REGIONS.find((x) => x.id === id);
    if (!r) return;
    setRegionId(id);
    setBbox(r.bbox);
    setFitSignal((n) => n + 1);
    setDrawing(false);
  };
  const applyBbox = (b: Bbox) => {
    setRegionId('custom');
    setBbox(b);
    setFitSignal((n) => n + 1);
  };
  const drawn = (b: Bbox) => {
    setRegionId('custom');
    setBbox(b);
    setDrawing(false);
  };
  const clear = () => {
    setRegionId('none');
    setBbox(null);
    setDrawing(false);
    setSelected(null);
    setFitSignal((n) => n + 1);
  };
  const step = (d: number) => {
    if (day !== null && focus) {
      const dim = daily.length;
      const next = day + d;
      if (next >= 1 && next <= dim) setDayPick({ ym: focus, day: next });
      return;
    }
    const next = withValue[focusIdx + d];
    if (next) setSelected(next.yearMonth);
  };
  const pickMonth = (ym: string) => {
    setSelected(ym);
    setDayPick(null);
  };

  const exportCsv = () => {
    if (!meta || !bbox) return;
    downloadText(`firecalendar_${source}_${range.start}_${range.end}.csv`, buildCsv(inRange, meta, bbox, range, source));
  };

  const caption =
    sample.total === 0
      ? t('mapCaptionNone')
      : sample.points.length < sample.total
        ? t('mapCaptionSample', { shown: fmt(sample.points.length), n: fmt(sample.total) })
        : t('mapCaptionAll', { n: fmt(sample.total) });

  return (
    <div className="flex min-h-full flex-col lg:h-dvh">
      {meta?.isMock && (
        <p className="bg-[#fff1c2] px-4 py-1.5 text-center text-sm text-[#4d3700]" role="status">
          {t('demoBanner')}
        </p>
      )}
      <header className="z-20 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line bg-surface px-4 py-2.5 sm:px-5">
        <div className="flex items-center gap-3">
          <Logo />
          <div>
            <h1 className="font-display text-[26px] font-semibold leading-none tracking-wide">{t('appName')}</h1>
            <p className="text-sm leading-tight text-muted">{t('appSubtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <Segmented<Lang>
            label={t('language')}
            value={lang}
            onChange={setLang}
            options={[
              { value: 'en', label: 'EN' },
              { value: 'vi', label: 'VI' },
            ]}
          />
          <button type="button" className={btnSolid} onClick={exportCsv} disabled={!hasData}>
            <IconDownload />
            {t('downloadCsv')}
          </button>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1.08fr)_minmax(520px,1fr)] lg:grid-rows-[minmax(0,1fr)]">
        <div className="relative h-[62vh] min-h-96 lg:h-auto lg:min-h-0">
          <MapPanel bbox={bbox} fitSignal={fitSignal} drawing={drawing} onDrawn={drawn} points={sample.points} onPickRegion={pickRegion} />
          <MapControls
            regionId={regionId}
            bbox={bbox}
            drawing={drawing}
            onRegion={pickRegion}
            onBbox={applyBbox}
            onDrawToggle={() => setDrawing((d) => !d)}
            onClear={clear}
          />
          {hasData && focusPoint && (
            <div className="absolute bottom-7 left-3 flex max-w-[calc(100%-1.5rem)] items-center gap-2.5 rounded-2xl bg-surface/95 p-1.5 shadow-float backdrop-blur">
              <button type="button" className={toolIcon} aria-label={day !== null ? t('prevDay') : t('prevMonth')} title={day !== null ? t('prevDay') : t('prevMonth')} disabled={day !== null ? day <= 1 : focusIdx <= 0} onClick={() => step(-1)}>
                <IconPrev />
              </button>
              <div aria-live="polite" className="flex min-w-0 flex-col px-1 leading-tight">
                <span className="text-xs font-medium text-muted">{day !== null ? t('mapDayLabel') : t('mapMonthLabel')}</span>
                <b className="font-display text-[22px] font-semibold">{day !== null ? fmtDay(focusPoint.yearMonth, day) : fmtMonth(focusPoint.yearMonth)}</b>
                <span className="text-sm text-muted">{caption}</span>
              </div>
              <button
                type="button"
                className={toolIcon}
                aria-label={day !== null ? t('nextDay') : t('nextMonth')}
                title={day !== null ? t('nextDay') : t('nextMonth')}
                disabled={day !== null ? day >= daily.length : focusIdx >= withValue.length - 1}
                onClick={() => step(1)}
              >
                <IconNext />
              </button>
            </div>
          )}
        </div>

        <div className="min-w-0 bg-surface px-4 lg:overflow-y-auto lg:border-l lg:border-line lg:px-7">
          <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-end gap-3 border-b border-line bg-surface/90 px-4 py-3 backdrop-blur lg:-mx-7 lg:px-7">
            <p className="w-full text-sm font-medium">{t('periodTitle')}</p>
            <MonthPicker
              label={t('from')}
              value={range.start}
              min={limits.min}
              max={limits.max}
              onChange={(v) => setRange({ start: v, end: v > range.end ? v : range.end })}
            />
            <MonthPicker
              label={t('to')}
              value={range.end}
              min={limits.min}
              max={limits.max}
              onChange={(v) => setRange({ start: v < range.start ? v : range.start, end: v })}
            />
            <Segmented<Source>
              label={t('srcLabel')}
              value={source}
              onChange={setSource}
              options={[
                { value: 'harmonized', label: t('srcHarmonized') },
                { value: 'modis', label: t('srcModis') },
                { value: 'viirs', label: t('srcViirs') },
              ]}
            />
          </div>

          {!bbox ? (
            <div className="flex flex-col gap-3 py-12" role="status">
              <h2 className="font-display text-3xl font-semibold leading-tight">{t('emptyTitle')}</h2>
              <p className="text-muted">{t('emptyHint')}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {REGIONS.map((r) => (
                  <button key={r.id} type="button" className={btn} onClick={() => pickRegion(r.id)}>
                    {r.name[lang]}
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
          ) : (
            <>
              <Summary point={focusPoint} all={all} source={source} place={place} range={kRange} cells={cells} monthCount={inRange.length} isLatest={isLatest} />
              <section className="border-t border-line py-6" aria-labelledby="cal-h">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <h2 id="cal-h" className="text-lg font-semibold">{t('calendarTitle')}</h2>
                  <Segmented<CalendarMode>
                    label={t('calendarMode')}
                    value={mode}
                    onChange={setMode}
                    options={[
                      { value: 'count', label: t('modeCount') },
                      { value: 'anomaly', label: t('modeAnomaly') },
                    ]}
                  />
                </div>
                <FireCalendar inRange={inRange} all={all} source={source} mode={mode} focus={focus} onSelect={pickMonth} />
              </section>
              {daily.length > 0 && (
                <DailyCalendar yearMonth={focusPoint.yearMonth} days={daily} source={source} day={day} onPick={(d) => setDayPick(d === null ? null : { ym: focusPoint.yearMonth, day: d })} />
              )}
              <ExplainPanel point={focusPoint} source={source} meta={meta} />
              <section className="border-t border-line py-6" aria-labelledby="trend-h">
                <h2 id="trend-h" className="mb-3 text-lg font-semibold">{t('trendTitle')}</h2>
                <TrendChart points={inRange} source={source} focus={focus} onSelect={pickMonth} />
              </section>
            </>
          )}
          <p className="border-t border-line pb-6 pt-4 text-sm text-muted">{t('footer')}</p>
        </div>
      </main>
    </div>
  );
}
