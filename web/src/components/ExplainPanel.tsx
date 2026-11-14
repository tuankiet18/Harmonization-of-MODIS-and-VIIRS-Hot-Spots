import type { ReactNode } from 'react';
import { useI18n } from '../i18n';
import type { DataMeta, MonthlyPoint, Source } from '../data/types';

interface Props {
  point: MonthlyPoint;
  source: Source;
  meta: DataMeta | null;
}

function Figure({ label, value, empty, active, result }: { label: string; value: string; empty?: boolean; active: boolean; result?: boolean }) {
  return (
    <div className={`flex flex-col px-4 py-2.5 ${result ? 'bg-ember-wash' : ''} ${active ? 'shadow-[inset_0_-3px_0_var(--color-ink)]' : ''}`}>
      <span className="text-sm text-muted">{label}</span>
      <b className={empty ? 'py-1 font-normal text-muted' : `font-display text-[28px] font-semibold leading-tight ${result ? 'text-ember-dark' : ''}`}>{value}</b>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="pt-0.5 text-sm text-muted max-sm:pt-2">{label}</dt>
      <dd className="max-w-[62ch]">{children}</dd>
    </>
  );
}

function Badge({ ok, children }: { ok: boolean; children: ReactNode }) {
  return <span className={`whitespace-nowrap rounded-full border px-2.5 text-sm font-medium ${ok ? 'border-ok text-ok' : 'border-warn bg-warn-wash text-warn'}`}>{children}</span>;
}

/** Aqua joined Terra in July 2002; before that MODIS counts come from Terra alone. */
const TERRA_ONLY_END = '2002-06';

/** How the month in focus got its harmonized number: raw counts, conversion, quality flags. */
export default function ExplainPanel({ point, source, meta }: Props) {
  const { t, fmt, fmtMonth } = useI18n();
  const sensors = [point.modis !== null && t('sensorModis'), point.viirs !== null && t('sensorViirs')].filter(Boolean) as string[];
  const f = point.scaleFactor !== null ? point.scaleFactor.toFixed(2) : '–';
  const method = point.methods[0];
  const conversion =
    point.methods.length > 1
      ? t('convMixed', { list: point.methods.join(', ') })
      : method === 'modis_scaled'
        ? t('convModisScaled', { f })
        : t('convViirsNative');
  const limits: string[] = [];
  if (point.methods.includes('modis_scaled')) limits.push(t('limModisScaled'));
  if (point.yearMonth <= TERRA_ONLY_END) limits.push(t('limTerraOnly'));
  if (point.anyNrt) limits.push(t('limNrt'));
  const num = (v: number | null) => (v === null ? t('notObserved') : fmt(v));

  return (
    <section className="border-t border-line py-6" aria-labelledby="explain-h">
      <h2 id="explain-h" className="text-lg font-semibold leading-snug">
        {t('explainTitle')}
      </h2>
      <p className="mb-4 text-muted">{fmtMonth(point.yearMonth)}</p>

      <div className="grid overflow-hidden rounded-xl border border-line max-sm:divide-y max-sm:divide-line sm:grid-cols-3 sm:divide-x sm:divide-line">
        <Figure label={t('srcModis')} value={num(point.modis)} empty={point.modis === null} active={source === 'modis'} />
        <Figure label={t('srcViirs')} value={num(point.viirs)} empty={point.viirs === null} active={source === 'viirs'} />
        <Figure label={t('explainHarmonized')} value={num(point.harmonized)} active={source === 'harmonized'} result />
      </div>

      <dl className="mt-4 grid gap-x-4 gap-y-2.5 sm:grid-cols-[minmax(96px,132px)_minmax(0,1fr)]">
        <Row label={t('explainConversion')}>{conversion}</Row>
        <Row label={t('explainSources')}>{sensors.join(', ')}</Row>
        <Row label={t('limitationsTitle')}>
          {limits.length ? limits.join(' ') : t('limNone')}
          <span className="mt-2 flex flex-wrap gap-1.5">
            <Badge ok={!point.methods.includes('modis_scaled')}>{point.methods.includes('modis_scaled') ? t('badgeConverted') : t('badgeReference')}</Badge>
            <Badge ok={!point.anyNrt}>{point.anyNrt ? t('badgeNrt') : t('badgeStandard')}</Badge>
          </span>
        </Row>
        {meta && <Row label={t('methodTitle')}>{meta.method}</Row>}
      </dl>
    </section>
  );
}
