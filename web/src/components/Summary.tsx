import { useI18n } from '../i18n';
import { valueOf } from '../lib/aggregate';
import { anomalyPct, medianForMonth, verdictOf, type Kpis, type Verdict } from '../lib/stats';
import type { MonthlyPoint, Source } from '../data/types';
import { IconNext, IconPrev } from './Icons';
import { toolIcon } from './ui';

interface Props {
  point: MonthlyPoint;
  all: MonthlyPoint[];
  source: Source;
  place: string;
  range: Kpis;
  isLatest: boolean;
  onStep: (dir: -1 | 1) => void;
  canPrev: boolean;
  canNext: boolean;
}

// Text + glyph + colour, so the verdict never depends on colour alone.
const VERDICT: Record<Verdict, { glyph: string; label: 'verdictHigher' | 'verdictTypical' | 'verdictLower' | 'verdictUnknown'; border: string; pill: string }> = {
  higher: { glyph: '▲', label: 'verdictHigher', border: 'border-ember', pill: 'border-ember bg-ember-wash text-ember-dark' },
  typical: { glyph: '■', label: 'verdictTypical', border: 'border-line', pill: 'border-line bg-page text-ink' },
  lower: { glyph: '▼', label: 'verdictLower', border: 'border-cool', pill: 'border-cool text-cool' },
  unknown: { glyph: '–', label: 'verdictUnknown', border: 'border-line', pill: 'border-line bg-page text-muted' },
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

/** The answer first: a verdict on the selected month, then three facts about the chosen period. */
export default function Summary({ point, all, source, place, range, isLatest, onStep, canPrev, canNext }: Props) {
  const { t, monthsLong, fmt, fmtCompact, fmtMonth, monthInSentence } = useI18n();
  const value = valueOf(point, source);
  const med = medianForMonth(all, source, point.month, point.year);
  const anom = anomalyPct(value, med);
  const verdict = verdictOf(anom);
  const v = VERDICT[verdict];
  const vars = { month: fmtMonth(point.yearMonth), m: monthInSentence(point.month), place, pct: anom === null ? '' : fmt(Math.abs(anom)), n: value === null ? '–' : fmt(value) };
  const headline = verdict === 'unknown' ? t('headNoBase', vars) : verdict === 'typical' ? t('headNear', vars) : verdict === 'higher' ? t('headMore', vars) : t('headFewer', vars);

  return (
    <section className="py-6" aria-live="polite">
      <p className={`mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-0.5 text-sm font-semibold ${v.pill}`}>
        <span aria-hidden="true">{v.glyph}</span>
        {t(v.label)}
      </p>
      <div className="flex items-start justify-between gap-3">
        <h2 className={`border-l-4 pl-4 font-display text-[clamp(30px,2.6vw,42px)] font-semibold leading-[1.08] ${v.border}`}>{headline}</h2>
        <div className="flex shrink-0 gap-1.5">
          <button type="button" className={toolIcon} aria-label={t('prevMonth')} title={t('prevMonth')} disabled={!canPrev} onClick={() => onStep(-1)}>
            <IconPrev />
          </button>
          <button type="button" className={toolIcon} aria-label={t('nextMonth')} title={t('nextMonth')} disabled={!canNext} onClick={() => onStep(1)}>
            <IconNext />
          </button>
        </div>
      </div>
      {med !== null && value !== null && <p className="mt-3 max-w-[62ch]">{t('headSub', { med: fmt(med), val: fmt(value), m: monthInSentence(point.month) })}</p>}
      {isLatest && <p className="mt-1 text-sm text-muted">{t('latestNote')}</p>}
      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        <Fact label={t('factPeakMonth')} value={range.peakMonth ? monthsLong[range.peakMonth - 1] : t('noBaseline')} />
        <Fact label={t('factPeakYear')} value={String(range.peakYear ?? t('noBaseline'))} sub={range.peakYearTotal !== null ? t('factPeakYearSub', { n: fmtCompact(range.peakYearTotal) }) : undefined} />
        <Fact label={t('factTotal')} value={fmtCompact(range.total)} sub={t('factTotalSub')} />
      </dl>
    </section>
  );
}
