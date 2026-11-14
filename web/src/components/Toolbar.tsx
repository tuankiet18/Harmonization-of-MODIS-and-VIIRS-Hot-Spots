import { useI18n } from '../i18n';
import { activePreset, presetRange, type PeriodPreset } from '../lib/range';
import type { Country } from '../lib/countries';
import type { DateRange } from '../data/types';
import AreaSelect from './AreaSelect';
import { IconDownload, Logo } from './Icons';
import ShareButton from './ShareButton';
import MonthInput from './MonthInput';
import { btn, btnSolid } from './ui';

interface Props {
  regionId: string;
  countries: Country[];
  countryId: string | null;
  onRegion: (id: string) => void;
  range: DateRange;
  limits: { min: string; max: string };
  onRange: (r: DateRange) => void;
  canDownload: boolean;
  onDownload: () => void;
  /** The numbers are synthetic: say so with a small badge. */
  isMock: boolean;
}

/** The one bar along the top, for every section: brand, area, period (typed or picked), presets, and the share and CSV buttons. */
export default function Toolbar({ regionId, countries, countryId, onRegion, range, limits, onRange, canDownload, onDownload, isMock }: Props) {
  const { t } = useI18n();
  const active = activePreset(range, limits);
  const presets: { value: PeriodPreset; label: string }[] = [
    { value: 'all', label: t('presetAll') },
    { value: 10, label: t('presetTen') },
    { value: 5, label: t('presetFive') },
  ];

  return (
    <header className="z-20 flex flex-wrap items-end gap-x-3 gap-y-2 border-b border-line bg-surface px-4 py-2 sm:px-5">
      <div className="flex items-center gap-2 self-center pr-1">
        <Logo />
        <h1 className="font-display text-2xl font-semibold leading-none tracking-wide">{t('appName')}</h1>
      </div>
      <AreaSelect regionId={regionId} countries={countries} countryId={countryId} onRegion={onRegion} />
      <MonthInput label={t('from')} value={range.start} min={limits.min} max={limits.max} onChange={(v) => onRange({ start: v, end: v > range.end ? v : range.end })} />
      <MonthInput label={t('to')} value={range.end} min={limits.min} max={limits.max} onChange={(v) => onRange({ start: v < range.start ? v : range.start, end: v })} />
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
      <div className="ml-auto flex items-end gap-2">
        {isMock && (
          <span role="status" title={t('demoBanner')} aria-label={t('demoBanner')} className="mb-2 self-end rounded-full bg-[#fff1c2] px-2.5 py-0.5 text-sm font-semibold text-[#4d3700]">
            {t('demoBadge')}
          </span>
        )}
        <ShareButton />
        <button type="button" className={btnSolid} onClick={onDownload} disabled={!canDownload} title={t('downloadCsv')} aria-label={t('downloadCsv')}>
          <IconDownload />
          <span className="sr-only 2xl:not-sr-only">{t('downloadCsv')}</span>
        </button>
      </div>
    </header>
  );
}
