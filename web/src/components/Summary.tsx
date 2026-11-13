import { useI18n } from '../i18n';
import { valueOf } from '../lib/aggregate';
import { anomalyPct, medianForMonth, type Kpis } from '../lib/stats';
import type { MonthlyPoint, Source } from '../data/types';

interface Props {
  point: MonthlyPoint;
  all: MonthlyPoint[];
  source: Source;
  place: string;
  range: Kpis;
  cells: number;
  monthCount: number;
  isLatest: boolean;
}

const TONE = {
  up: 'border-ember text-ember-dark',
  down: 'border-cool text-cool',
  flat: 'border-line text-ink',
};

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-page px-4 py-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-display text-[28px] font-semibold leading-tight">{value}</dd>
      {sub && <dd className="text-sm leading-snug text-muted">{sub}</dd>}
    </div>
  );
}

/** The answer in one sentence, then three facts about the chosen period. */
export default function Summary({ point, all, source, place, range, cells, monthCount, isLatest }: Props) {
  const { t, monthsLong, fmt, fmtCompact, fmtMonth, monthInSentence } = useI18n();
  const value = valueOf(point, source);
  const med = medianForMonth(all, source, point.month, point.year);
  const anom = anomalyPct(value, med);
  const vars = { month: fmtMonth(point.yearMonth), m: monthInSentence(point.month), place, pct: anom === null ? '' : fmt(Math.abs(anom)), n: value === null ? '–' : fmt(value) };
  const headline = anom === null ? t('headNoBase', vars) : Math.abs(anom) < 10 ? t('headNear', vars) : anom > 0 ? t('headMore', vars) : t('headFewer', vars);
  const tone = anom === null || Math.abs(anom) < 10 ? 'flat' : anom > 0 ? 'up' : 'down';

  return (
    <section className="py-6" aria-live="polite">
      <h2 className={`border-l-4 pl-4 font-display text-[clamp(30px,2.6vw,42px)] font-semibold leading-[1.08] ${TONE[tone]}`}>{headline}</h2>
      {med !== null && value !== null && <p className="mt-3 max-w-[62ch]">{t('headSub', { med: fmt(med), val: fmt(value) })}</p>}
      {isLatest && <p className="mt-1 text-sm text-muted">{t('latestNote')}</p>}
      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        <Fact label={t('factPeakMonth')} value={range.peakMonth ? monthsLong[range.peakMonth - 1] : t('noBaseline')} />
        <Fact label={t('factPeakYear')} value={String(range.peakYear ?? t('noBaseline'))} sub={range.peakYearTotal !== null ? t('factPeakYearSub', { n: fmtCompact(range.peakYearTotal) }) : undefined} />
        <Fact label={t('factTotal')} value={fmtCompact(range.total)} sub={t('factTotalSub', { cells: fmt(cells), months: fmt(monthCount) })} />
      </dl>
    </section>
  );
}
