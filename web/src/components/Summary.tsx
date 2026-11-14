import { useI18n } from '../i18n';
import { verdictOf, type Kpis, type PeriodAnomaly, type Verdict } from '../lib/stats';
import type { DateRange } from '../data/types';

interface Props {
  /** The period chosen in the top bar; the verdict, the facts and the map all describe it. */
  period: DateRange;
  anomaly: PeriodAnomaly;
  range: Kpis;
  place: string;
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

/** The answer first: the whole period against the usual, then three facts about it. */
export default function Summary({ period, anomaly, range, place }: Props) {
  const { t, months, fmt, fmtCompact, fmtMonth } = useI18n();
  const verdict = verdictOf(anomaly.pct);
  const v = VERDICT[verdict];
  const label =
    period.start === period.end
      ? fmtMonth(period.start)
      : t('periodSpan', { from: `${months[Number(period.start.slice(5)) - 1]} ${period.start.slice(0, 4)}`, to: `${months[Number(period.end.slice(5)) - 1]} ${period.end.slice(0, 4)}` });
  const vars = { period: label, place, pct: anomaly.pct === null ? '' : fmt(Math.abs(anomaly.pct)), n: fmt(anomaly.total) };
  const headline = verdict === 'unknown' ? t('headNoBase', vars) : verdict === 'typical' ? t('headNear', vars) : verdict === 'higher' ? t('headMore', vars) : t('headFewer', vars);
  const busiest = range.busiest;

  return (
    <section className="py-6" aria-live="polite">
      <p className={`mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-0.5 text-sm font-semibold ${v.pill}`}>
        <span aria-hidden="true">{v.glyph}</span>
        {t(v.label)}
      </p>
      <h2 className={`border-l-4 pl-4 font-display text-[clamp(28px,2.4vw,40px)] font-semibold leading-[1.08] ${v.border}`}>{headline}</h2>
      {anomaly.pct !== null && <p className="mt-3 max-w-[62ch]">{t('headSub', { expected: fmt(Math.round(anomaly.expected)), compared: fmt(anomaly.compared) })}</p>}
      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        <Fact
          label={t('factBusiest')}
          value={busiest ? `${months[Number(busiest.yearMonth.slice(5)) - 1]} ${busiest.yearMonth.slice(0, 4)}` : t('noBaseline')}
          sub={busiest ? t('factBusiestSub', { n: fmtCompact(busiest.value) }) : undefined}
        />
        <Fact label={t('factPeakYear')} value={String(range.peakYear ?? t('noBaseline'))} sub={range.peakYearTotal !== null ? t('factPeakYearSub', { n: fmtCompact(range.peakYearTotal) }) : undefined} />
        <Fact label={t('factTotal')} value={fmtCompact(range.total)} sub={t('factTotalSub')} />
      </dl>
    </section>
  );
}
