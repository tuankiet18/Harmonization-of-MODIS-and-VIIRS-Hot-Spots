import { useI18n } from '../i18n';
import { BURN } from '../lib/theme';
import type { DayPoint, Source } from '../data/types';
import { btn } from './ui';

interface Props {
  yearMonth: string;
  days: DayPoint[];
  source: Source;
  day: number | null;
  onPick: (day: number | null) => void;
}

const value = (d: DayPoint, source: Source) => (source === 'harmonized' ? d.harmonized : source === 'modis' ? d.modis : d.viirs);

/** Month grid, Monday first. Each day is shaded by its hotspot count and shows the number, so colour is never the only cue. */
export default function DailyCalendar({ yearMonth, days, source, day, onPick }: Props) {
  const { t, weekdays, fmt, fmtCompact, fmtMonth, fmtDay } = useI18n();
  const [y, m] = yearMonth.split('-').map(Number);
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const max = Math.max(1, ...days.map((d) => value(d, source) ?? 0));

  return (
    <section className="border-t border-line py-6" aria-labelledby="daily-h">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="daily-h" className="text-lg font-semibold">
          {t('dailyTitle', { month: fmtMonth(yearMonth) })}
        </h2>
        <button type="button" className={btn} aria-pressed={day === null} onClick={() => onPick(null)} disabled={day === null}>
          {t('wholeMonth')}
        </button>
      </div>

      <div className="grid max-w-xl grid-cols-7 gap-1.5">
        {weekdays.map((w) => (
          <span key={w} className="pb-0.5 text-center text-sm text-muted">
            {w}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} />
        ))}
        {days.map((d) => {
          const v = value(d, source);
          const idx = v === null ? 0 : Math.round((v / max) * (BURN.length - 1));
          const dark = idx >= 4;
          const selected = day === d.day;
          return (
            <button
              key={d.day}
              type="button"
              aria-pressed={selected}
              aria-label={v === null ? fmtDay(yearMonth, d.day) : t('dayTotal', { n: fmt(v), date: fmtDay(yearMonth, d.day) })}
              disabled={v === null}
              onClick={() => onPick(selected ? null : d.day)}
              style={{ background: v === null ? undefined : BURN[idx] }}
              className={`flex aspect-[4/3] min-h-12 flex-col items-start justify-between rounded-lg px-1.5 py-1 text-left leading-none transition-shadow disabled:cursor-not-allowed disabled:bg-page ${
                dark ? 'text-white' : 'text-ink'
              } ${selected ? 'ring-[3px] ring-ink ring-offset-1' : 'hover:ring-2 hover:ring-ink/50'}`}
            >
              <span className="text-sm font-medium">{d.day}</span>
              <span className="text-xs">{v === null ? '' : fmtCompact(Math.round(v))}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-sm text-muted">{t('dailyHint')}</p>
    </section>
  );
}
