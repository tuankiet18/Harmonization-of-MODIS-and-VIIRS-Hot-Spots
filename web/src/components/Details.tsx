import { useI18n } from '../i18n';
import type { DataMeta, DayPoint, MonthlyPoint, Source } from '../data/types';
import DailyCalendar from './DailyCalendar';
import ExplainPanel from './ExplainPanel';
import Segmented from './Segmented';
import TrendChart from './TrendChart';

interface Props {
  point: MonthlyPoint;
  inRange: MonthlyPoint[];
  source: Source;
  onSource: (s: Source) => void;
  meta: DataMeta | null;
  focus: string | null;
  onSelect: (yearMonth: string) => void;
  daily: DayPoint[];
  day: number | null;
  onPickDay: (day: number | null) => void;
  showHexes: boolean;
  onShowHexes: (v: boolean) => void;
  caption: string;
}

/** Everything secondary, folded away: how the numbers are made, raw series, trend, daily calendar, map hexagons. */
export default function Details({ point, inRange, source, onSource, meta, focus, onSelect, daily, day, onPickDay, showHexes, onShowHexes, caption }: Props) {
  const { t } = useI18n();
  return (
    <details className="group border-t border-line py-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-lg font-semibold [&::-webkit-details-marker]:hidden">
        {t('detailsTitle')}
        <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>

      <p className="mt-3 max-w-[62ch] text-muted">{t('detailsIntro')}</p>

      <ExplainPanel point={point} source={source} meta={meta} />

      <div className="mb-2 mt-2 flex flex-wrap items-center gap-3">
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

      <section className="border-t border-line py-6" aria-labelledby="trend-h">
        <h2 id="trend-h" className="mb-3 text-lg font-semibold">
          {t('trendTitle')}
        </h2>
        <TrendChart points={inRange} source={source} focus={focus} onSelect={onSelect} />
      </section>

      {daily.length > 0 && <DailyCalendar yearMonth={point.yearMonth} days={daily} source={source} day={day} onPick={onPickDay} />}

      <div className="border-t border-line py-4">
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" className="size-5" checked={showHexes} onChange={(e) => onShowHexes(e.target.checked)} />
          <span>{t('showHexes')}</span>
        </label>
        {showHexes && <p className="mt-1 text-sm text-muted">{caption}</p>}
      </div>
    </details>
  );
}
