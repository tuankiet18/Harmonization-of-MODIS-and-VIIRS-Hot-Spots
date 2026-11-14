import { useI18n } from '../i18n';
import type { DataMeta, DayPoint, MonthlyPoint, Source } from '../data/types';
import DailyCalendar from './DailyCalendar';
import ExplainPanel from './ExplainPanel';
import FireCalendar, { type CalendarMode } from './FireCalendar';
import Segmented from './Segmented';
import { btn } from './ui';

interface Props {
  point: MonthlyPoint;
  inRange: MonthlyPoint[];
  all: MonthlyPoint[];
  source: Source;
  onSource: (s: Source) => void;
  mode: CalendarMode;
  onMode: (m: CalendarMode) => void;
  meta: DataMeta | null;
  focus: string | null;
  onSelect: (yearMonth: string) => void;
  daily: DayPoint[];
  day: number | null;
  onPickDay: (day: number | null) => void;
  onShowOnMap: () => void;
}

/** The detail view: the month-by-year calendar, the days of one month, and how the numbers were made. */
export default function CalendarTab({ point, inRange, all, source, onSource, mode, onMode, meta, focus, onSelect, daily, day, onPickDay, onShowOnMap }: Props) {
  const { t } = useI18n();
  return (
    <>
      <section className="py-6" aria-labelledby="cal-h">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 id="cal-h" className="text-lg font-semibold">
            {t('calendarTitle')}
          </h2>
          <Segmented<CalendarMode>
            label={t('calendarMode')}
            value={mode}
            onChange={onMode}
            options={[
              { value: 'count', label: t('modeCount') },
              { value: 'anomaly', label: t('modeAnomaly') },
            ]}
          />
        </div>
        <p className="mb-3 text-sm text-muted">{t(mode === 'count' ? 'howToReadCount' : 'howToReadAnomaly')}</p>
        <FireCalendar inRange={inRange} all={all} source={source} mode={mode} focus={focus} onSelect={onSelect} />
      </section>

      {daily.length > 0 && <DailyCalendar yearMonth={point.yearMonth} days={daily} source={source} day={day} onPick={onPickDay} />}
      {day !== null && (
        <div className="pb-4">
          <button type="button" className={btn} onClick={onShowOnMap}>
            {t('showOnMap')}
          </button>
        </div>
      )}

      <section className="border-t border-line py-6" aria-labelledby="how-h">
        <h2 id="how-h" className="text-lg font-semibold">
          {t('detailsTitle')}
        </h2>
        <p className="mt-2 max-w-[62ch] text-muted">{t('detailsIntro')}</p>
        <div className="mb-2 mt-4 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">{t('srcLabel')}</span>
          <Segmented<Source>
            label={t('srcLabel')}
            value={source}
            onChange={onSource}
            options={[
              { value: 'harmonized', label: t('srcHarmonized') },
              { value: 'modis', label: t('srcModis') },
              { value: 'viirs', label: t('srcViirs') },
            ]}
          />
        </div>
        <ExplainPanel point={point} source={source} meta={meta} />
      </section>
    </>
  );
}
