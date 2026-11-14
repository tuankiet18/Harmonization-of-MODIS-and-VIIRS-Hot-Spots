import { useI18n } from '../i18n';
import { activePreset, presetRange, type PeriodPreset } from '../lib/range';
import type { DateRange } from '../data/types';
import { IconDownload } from './Icons';
import MonthPicker from './MonthPicker';
import { btn, btnSolid } from './ui';

interface Props {
  areaName: string | null;
  range: DateRange;
  limits: { min: string; max: string };
  onRange: (r: DateRange) => void;
  canDownload: boolean;
  onDownload: () => void;
}

/** Where and when: the chosen area, the period, quick presets, and the CSV download. */
export default function Toolbar({ areaName, range, limits, onRange, canDownload, onDownload }: Props) {
  const { t } = useI18n();
  const active = activePreset(range, limits);
  const presets: { value: PeriodPreset; label: string }[] = [
    { value: 'all', label: t('presetAll') },
    { value: 10, label: t('presetTen') },
    { value: 5, label: t('presetFive') },
  ];

  return (
    <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-end gap-x-3 gap-y-2 border-b border-line bg-surface/90 px-4 py-3 backdrop-blur lg:-mx-7 lg:px-7">
      <button
        type="button"
        className={`${btn} flex-col items-start gap-0 py-1 leading-tight`}
        onClick={() => document.getElementById('region-select')?.focus()}
      >
        <span className="text-xs font-normal text-muted">{t('areaLabel')}</span>
        <span className="font-semibold">{areaName ?? t('noArea')}</span>
      </button>
      <MonthPicker
        label={t('from')}
        value={range.start}
        min={limits.min}
        max={limits.max}
        onChange={(v) => onRange({ start: v, end: v > range.end ? v : range.end })}
      />
      <MonthPicker
        label={t('to')}
        value={range.end}
        min={limits.min}
        max={limits.max}
        onChange={(v) => onRange({ start: v < range.start ? v : range.start, end: v })}
      />
      <div role="group" aria-label={t('periodTitle')} className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={String(p.value)}
            type="button"
            aria-pressed={active === p.value}
            className={`${active === p.value ? btnSolid : btn} text-sm`}
            onClick={() => onRange(presetRange(limits, p.value))}
          >
            {p.label}
          </button>
        ))}
      </div>
      <button type="button" className={`${btnSolid} ml-auto`} onClick={onDownload} disabled={!canDownload}>
        <IconDownload />
        {t('downloadCsv')}
      </button>
    </div>
  );
}
