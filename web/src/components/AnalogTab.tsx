import { useEffect, useState } from 'react';
import AnalogChart from './AnalogChart';
import ChartCard from './ChartCard';
import { field, fieldLabel } from './ui';
import { dataSource } from '../data';
import { ApiError } from '../data/ApiDataSource';
import type { AnalogResult, Bbox } from '../data/types';
import { useI18n } from '../i18n';

type State = { kind: 'idle' | 'loading' | 'notBuilt' | 'noData' | 'error' } | { kind: 'ok'; result: AnalogResult };

interface Props {
  bbox: Bbox | null;
  place: string;
}

/** "Which past year does this season look like?" for the area chosen in the top bar. */
export default function AnalogTab({ bbox, place }: Props) {
  const { t, months, monthsLong } = useI18n();
  const [year, setYear] = useState<number | undefined>();
  const [cutoff, setCutoff] = useState<number | undefined>();
  const [state, setState] = useState<State>({ kind: 'idle' });
  const supported = typeof dataSource.analog === 'function';

  // A new area starts from the defaults again: the latest comparable year and the latest month it covers.
  useEffect(() => {
    setYear(undefined);
    setCutoff(undefined);
  }, [bbox]);

  useEffect(() => {
    if (!bbox || !dataSource.analog) return;
    let cancelled = false;
    setState((s) => (s.kind === 'ok' ? s : { kind: 'loading' }));
    dataSource
      .analog(bbox, { year, cutoffMonth: cutoff })
      .then((result) => !cancelled && setState({ kind: 'ok', result }))
      .catch((e: unknown) => {
        if (cancelled) return;
        const status = e instanceof ApiError ? e.status : 0;
        setState({ kind: status === 404 || status === 422 ? 'noData' : 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [bbox, year, cutoff]);

  const message = (text: string, busy = false) => (
    <div className="flex flex-col gap-3 py-12" role="status" aria-busy={busy}>
      <p className="text-muted">{text}</p>
    </div>
  );

  let body;
  if (!supported) body = message(t('analogNeedsService'));
  else if (!bbox) body = message(t('analogNoArea'));
  else if (state.kind === 'loading' || state.kind === 'idle') body = message(t('analogLoading'), true);
  else if (state.kind === 'noData') body = message(t('analogNoData'));
  else if (state.kind === 'error') body = message(t('analogError'));
  else if (state.kind === 'ok') {
    const r = state.result;
    const best = r.ranking[0];
    const hasModisEra = r.ranking.some((c) => c.era === 'modis');
    body = (
      <>
        <section className="py-6" aria-live="polite">
          <h2 className="border-l-4 border-ember pl-4 font-display text-[clamp(28px,2.4vw,40px)] font-semibold leading-[1.1] text-ember-dark">
            {t('analogSummary', { year: r.targetYear, month: monthsLong[r.cutoffMonth - 1], place, best: best.year })}
          </h2>
          <p className="mt-2 text-muted">
            {t('analogSimilarity', { score: Math.round(best.scorePct) })}, {t('analogMargin', { n: Math.round(best.marginPct) })}
          </p>
        </section>

        {r.fireSoFarPct < 10 && (
          <p className="mb-4 rounded-lg bg-warn-wash px-3 py-2 text-sm text-warn" role="note">
            {t('analogLowSignal', { pct: r.fireSoFarPct })}
          </p>
        )}

        <div className="flex flex-wrap items-end gap-3 pb-4">
          <label className={`${fieldLabel} w-36`}>
            <span>{t('analogSeason')}</span>
            <select
              className={field}
              value={r.targetYear}
              onChange={(e) => {
                setYear(Number(e.target.value));
                setCutoff(undefined);
              }}
            >
              {[...r.years].reverse().map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className={`${fieldLabel} w-52`}>
            <span>{t('analogUpTo')}</span>
            <select className={field} value={r.cutoffMonth} onChange={(e) => setCutoff(Number(e.target.value))}>
              {months.map((m, i) => (
                <option key={m} value={i + 1}>
                  {monthsLong[i]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <ChartCard id="analog-chart" title={t('analogChartTitle')} hint={t('analogChartHint', { year: r.targetYear, best: best.year })}>
          <AnalogChart result={r} />
        </ChartCard>

        <ChartCard id="analog-rank" title={t('analogRankingTitle')}>
          <ol className="flex flex-col gap-2">
            {r.ranking.map((c, i) => (
              <li key={c.year} className="grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-3">
                <b className={`font-display text-2xl font-semibold ${i === 0 ? 'text-ember-dark' : ''}`}>{c.year}</b>
                <div>
                  <div className="h-3 overflow-hidden rounded-full bg-page" role="img" aria-label={`${Math.round(c.scorePct)}%`}>
                    <div className={`h-full rounded-full ${i === 0 ? 'bg-ember' : 'bg-muted'}`} style={{ width: `${Math.max(c.scorePct, 1)}%` }} />
                  </div>
                  <p className="mt-0.5 text-sm text-muted">
                    {t('analogCosine')} {Math.round(c.cosinePct)}% · {t('analogDtw')} {Math.round(c.dtwPct)}% · {c.era === 'modis' ? t('analogEraModis') : t('analogEraViirs')}
                  </p>
                </div>
                <span className="text-right font-medium">{Math.round(c.scorePct)}%</span>
              </li>
            ))}
          </ol>
          {hasModisEra && <p className="mt-3 text-sm text-muted">{t('analogEraNote')}</p>}
        </ChartCard>

        <details className="border-t border-line py-5 text-sm text-muted">
          <summary className="cursor-pointer text-base font-semibold text-ink">{t('analogHow')}</summary>
          <p className="mt-2 max-w-[70ch]">{t('analogHowBody')}</p>
          {r.method && <p className="mt-2 max-w-[70ch]">{r.method}</p>}
          {r.source && <p className="mt-2">{r.source}</p>}
        </details>
        {r.isMock && (
          <p className="mb-4 rounded-lg bg-warn-wash px-3 py-2 text-sm text-warn" role="note">
            {t('analogDemo')}
          </p>
        )}
      </>
    );
  }

  return (
    <div className="py-4">
      <h1 className="pt-2 font-display text-3xl font-semibold leading-tight">{t('analogTitle')}</h1>
      <p className="mt-1 max-w-[70ch] text-muted">{t('analogIntro')}</p>
      {body}
    </div>
  );
}
