import { useEffect, useMemo, useState } from 'react';
import Details from './components/Details';
import FireCalendar, { type CalendarMode } from './components/FireCalendar';
import { Logo } from './components/Icons';
import MapControls from './components/MapControls';
import MapLegend from './components/MapLegend';
import MapPanel from './components/MapPanel';
import Segmented from './components/Segmented';
import ShareButton from './components/ShareButton';
import Summary from './components/Summary';
import Toolbar from './components/Toolbar';
import { btn } from './components/ui';
import { dataSource } from './data';
import { REGIONS } from './data/regions';
import type { Bbox, DataMeta, DateRange, DayPoint, HotspotSample, MonthRecord, Source } from './data/types';
import { useI18n } from './i18n';
import { aggregateMonthly, valueOf } from './lib/aggregate';
import { buildCsv, downloadText } from './lib/csv';
import { computeKpis } from './lib/stats';
import { decodeState, encodeState } from './lib/urlState';

const NO_POINTS: HotspotSample = { points: [], total: 0 };
const PRESET_BOXES = Object.fromEntries(REGIONS.map((r) => [r.id, r.bbox]));
// Only the area, series and month are read before the data limits are known; the range is read after.
const WIDE = { min: '0000-01', max: '9999-12' };
const fromUrl = () => decodeState(window.location.search, PRESET_BOXES, WIDE);

export default function App() {
  const { t, fmt } = useI18n();
  const [meta, setMeta] = useState<DataMeta | null>(null);
  const initial = useMemo(fromUrl, []);
  const [source, setSource] = useState<Source>(initial.source ?? 'harmonized');
  const [mode, setMode] = useState<CalendarMode>('count');
  const [regionId, setRegionId] = useState(initial.regionId ?? 'amazon');
  const [bbox, setBbox] = useState<Bbox | null>(initial.bbox !== undefined ? initial.bbox : REGIONS[0].bbox);
  const [fitSignal, setFitSignal] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const [range, setRange] = useState<DateRange>({ start: '2000-11', end: '2026-10' });
  const [limits, setLimits] = useState({ min: '2000-11', max: '2026-10' });
  const [records, setRecords] = useState<MonthRecord[]>([]);
  const [synced, setSynced] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(initial.month ?? null);
  const [sample, setSample] = useState<HotspotSample>(NO_POINTS);
  const [dayPick, setDayPick] = useState<{ ym: string; day: number } | null>(null);
  const [daily, setDaily] = useState<DayPoint[]>([]);
  const [showPoints, setShowPoints] = useState(false);
  const [pointsLoading, setPointsLoading] = useState(false);

  useEffect(() => {
    dataSource.meta().then((m) => {
      setMeta(m);
      setLimits({ min: m.firstMonth, max: m.lastMonth });
      const shared = decodeState(window.location.search, PRESET_BOXES, { min: m.firstMonth, max: m.lastMonth }).range;
      setRange(shared ?? { start: m.firstMonth, end: m.lastMonth });
      setSynced(true);
    });
  }, []);

  // Keep the address bar in step with the view so any state can be shared as a link.
  useEffect(() => {
    if (!synced) return;
    const q = encodeState({ regionId, bbox, range, source, month: selected }, limits);
    window.history.replaceState(null, '', `${window.location.pathname}?${q}`);
  }, [synced, regionId, bbox, range, source, selected, limits]);

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
    if (!showPoints || !bbox || !focus || loading) {
      setSample(NO_POINTS);
      setPointsLoading(false);
      return;
    }
    let cancelled = false;
    setPointsLoading(true);
    const done = (s: HotspotSample) => {
      if (cancelled) return;
      setSample(s);
      setPointsLoading(false);
    };
    dataSource
      .points(bbox, focus, source, day ?? undefined)
      .then(done)
      .catch(() => done(NO_POINTS));
    return () => {
      cancelled = true;
    };
  }, [bbox, focus, source, loading, day, showPoints]);

  const region = REGIONS.find((r) => r.id === regionId);
  const place = (region && (region.enInSentence ?? region.name)) || t('placeCustom');

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
  const step = (dir: -1 | 1) => {
    const next = withValue[focusIdx + dir];
    if (next) {
      setSelected(next.yearMonth);
      setDayPick(null);
    }
  };
  const pickMonth = (ym: string) => {
    setSelected(ym);
    setDayPick(null);
  };

  const exportCsv = () => {
    if (!meta || !bbox) return;
    downloadText(`firecalendar_${source}_${range.start}_${range.end}.csv`, buildCsv(inRange, meta, bbox, range, source));
  };

  const caption = pointsLoading
    ? t('mapCaptionLoading')
    : sample.total === 0
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
        <ShareButton />
      </header>

      <main className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1.08fr)_minmax(520px,1fr)] lg:grid-rows-[minmax(0,1fr)]">
        <div className="relative h-[42vh] min-h-72 lg:h-auto lg:min-h-0">
          <MapPanel bbox={bbox} fitSignal={fitSignal} drawing={drawing} onDrawn={drawn} points={showPoints ? sample.points : []} onPickRegion={pickRegion} />
          <MapLegend hasArea={!!bbox} showPoints={showPoints && sample.points.length > 0} />
          <MapControls
            regionId={regionId}
            bbox={bbox}
            drawing={drawing}
            onRegion={pickRegion}
            onBbox={applyBbox}
            onDrawToggle={() => setDrawing((d) => !d)}
            onClear={clear}
          />
        </div>

        <div className="min-w-0 bg-surface px-4 lg:overflow-y-auto lg:border-l lg:border-line lg:px-7">
          <Toolbar
            areaName={region ? region.name : regionId === 'custom' ? t('customArea') : null}
            range={range}
            limits={limits}
            onRange={setRange}
            canDownload={hasData}
            onDownload={exportCsv}
          />

          {bbox && source !== 'harmonized' && (
            <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-warn-wash px-3 py-2 text-sm" role="status">
              {t('rawNotice', { series: source === 'modis' ? t('srcModis') : t('srcViirs') })}
              <button type="button" className="inline-flex min-h-10 items-center font-semibold underline pointer-coarse:min-h-11" onClick={() => setSource('harmonized')}>
                {t('rawBack')}
              </button>
            </p>
          )}

          {!bbox ? (
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
          ) : (
            <>
              <Summary
                point={focusPoint}
                all={all}
                source={source}
                place={place}
                range={kRange}
                isLatest={isLatest}
                onStep={step}
                canPrev={focusIdx > 0}
                canNext={focusIdx < withValue.length - 1}
              />
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
                <p className="mb-3 text-sm text-muted">{t(mode === 'count' ? 'howToReadCount' : 'howToReadAnomaly')}</p>
                <FireCalendar inRange={inRange} all={all} source={source} mode={mode} focus={focus} onSelect={pickMonth} />
              </section>
              <Details
                point={focusPoint}
                inRange={inRange}
                source={source}
                onSource={setSource}
                meta={meta}
                focus={focus}
                onSelect={pickMonth}
                daily={daily}
                day={day}
                onPickDay={(d) => {
                  setDayPick(d === null ? null : { ym: focusPoint.yearMonth, day: d });
                  if (d !== null) setShowPoints(true);
                }}
                showPoints={showPoints}
                onShowPoints={setShowPoints}
                caption={caption}
              />
            </>
          )}
          <p className="border-t border-line pb-6 pt-4 text-sm text-muted">{t('footer')}</p>
        </div>
      </main>
    </div>
  );
}
