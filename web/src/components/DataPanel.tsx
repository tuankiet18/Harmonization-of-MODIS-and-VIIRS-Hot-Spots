import { useState } from 'react';
import { useI18n } from '../i18n';
import { COLORS } from '../lib/theme';
import type { DataMeta, MonthlyPoint } from '../data/types';
import FactorChart from './FactorChart';
import { IconDownload } from './Icons';
import { btn } from './ui';

interface Props {
  meta: DataMeta | null;
  all: MonthlyPoint[];
  focus: string | null;
  /** Download handlers. The cells one is absent when the data source has no per-cell data. */
  onMonthly: () => void;
  onDaily: () => void;
  onCells?: () => Promise<void>;
}

const ym = (v: string) => Number(v.slice(0, 4)) + (Number(v.slice(5)) - 1) / 12;

/** Satellites over time: Terra and Aqua (MODIS) then S-NPP (VIIRS). NOAA-20 is in the data but kept out of the series. */
const SATELLITES = [
  { id: 'terra', from: '2000-11', color: COLORS.modis, muted: false },
  { id: 'aqua', from: '2002-07', color: COLORS.modis, muted: false },
  { id: 'snpp', from: '2012-02', color: COLORS.viirs, muted: false },
  { id: 'noaa20', from: '2018-04', color: COLORS.viirs, muted: true },
] as const;

const SAT_LABEL = { terra: 'sat_terra', aqua: 'sat_aqua', snpp: 'sat_snpp', noaa20: 'sat_noaa20' } as const;

function Timeline({ first, last }: { first: string; last: string }) {
  const { t } = useI18n();
  const start = ym(first);
  const end = ym(last) + 1 / 12;
  const x = (v: string) => `${Math.max(0, Math.min(100, ((ym(v) - start) / (end - start)) * 100))}%`;
  const ticks = [2000, 2005, 2010, 2015, 2020, 2025].filter((y) => y >= start && y <= end);
  return (
    <div role="img" aria-label={t('coverageTitle')}>
      <ul className="flex flex-col gap-1.5">
        {SATELLITES.filter((s) => s.from <= last).map((s) => (
          <li key={s.id} className="grid grid-cols-[9.5rem_1fr] items-center gap-2 text-sm">
            <span className={s.muted ? 'text-muted' : ''}>{t(SAT_LABEL[s.id])}</span>
            <span className="relative h-3.5 rounded-sm bg-line/50">
              <span
                className="absolute inset-y-0 right-0 rounded-sm"
                style={{ left: x(s.from < first ? first : s.from), background: s.muted ? 'transparent' : s.color, border: s.muted ? `1.5px dashed ${s.color}` : undefined }}
              />
            </span>
          </li>
        ))}
      </ul>
      <div className="relative mt-1 ml-[10.25rem] h-5 text-xs text-muted" aria-hidden="true">
        {ticks.map((y) => (
          <span key={y} className="absolute -translate-x-1/2" style={{ left: `${((y - start) / (end - start)) * 100}%` }}>
            {y}
          </span>
        ))}
      </div>
    </div>
  );
}

function DownloadRow({ title, hint, onClick, disabled }: { title: string; hint: string; onClick: () => void | Promise<void>; disabled?: boolean }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const run = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await onClick();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-1">
      <button type="button" className={`${btn} w-64 shrink-0 justify-start`} onClick={run} disabled={disabled || busy}>
        <IconDownload />
        {busy ? t('dlBusy') : title}
      </button>
      <span className="min-w-48 flex-1 pt-2 text-sm text-muted">{failed ? t('dlFailed') : hint}</span>
    </li>
  );
}

/** What a user can take away and how far to trust it: downloads, the satellites over time, how older months were made comparable, and what is in the data. */
export default function DataPanel({ meta, all, focus, onMonthly, onDaily, onCells }: Props) {
  const { t, fmtMonth } = useI18n();
  const first = meta?.firstMonth ?? '2000-11';
  const last = meta?.lastMonth ?? '2025-12';
  const month = focus ? fmtMonth(focus) : '';
  return (
    <div className="mt-6 flex flex-col gap-8">
      <section aria-labelledby="dl-h">
        <h3 id="dl-h" className="text-base font-semibold">
          {t('dlTitle')}
        </h3>
        <ul className="mt-3 flex flex-col gap-3">
          <DownloadRow title={t('dlMonthly')} hint={t('dlMonthlyHint')} onClick={onMonthly} />
          <DownloadRow title={t('dlDaily', { month })} hint={t('dlDailyHint')} onClick={onDaily} disabled={!focus} />
          {onCells && <DownloadRow title={t('dlCells', { month })} hint={t('dlCellsHint')} onClick={onCells} disabled={!focus} />}
        </ul>
      </section>

      <section aria-labelledby="cov-h">
        <h3 id="cov-h" className="text-base font-semibold">
          {t('coverageTitle')}
        </h3>
        <p className="mb-3 mt-1 max-w-[62ch] text-sm text-muted">{t('coverageHint', { first: fmtMonth(first), last: fmtMonth(last) })}</p>
        <Timeline first={first} last={last} />
      </section>

      <section aria-labelledby="fac-h">
        <h3 id="fac-h" className="text-base font-semibold">
          {t('factorTitle')}
        </h3>
        <p className="mb-2 mt-1 max-w-[62ch] text-sm text-muted">{t('factorHint')}</p>
        <FactorChart points={all} />
      </section>

      <section aria-labelledby="inc-h">
        <h3 id="inc-h" className="text-base font-semibold">
          {t('includedTitle')}
        </h3>
        <ul className="mt-2 flex max-w-[66ch] list-disc flex-col gap-1.5 pl-5 text-sm">
          <li>{t('includedFilters')}</li>
          <li>{t('includedUnit')}</li>
          <li>{t('includedGaps')}</li>
          <li>{t('includedEnd', { last: fmtMonth(last) })}</li>
        </ul>
      </section>
    </div>
  );
}
