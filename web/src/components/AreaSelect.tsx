import { REGIONS } from '../data/regions';
import { useI18n } from '../i18n';
import type { Country } from '../lib/countries';
import { select } from './ui';

interface Props {
  regionId: string; // preset id, 'custom', 'country' or 'none'
  /** Country borders, loaded after the page; the list stays empty until then. */
  countries: Country[];
  countryId: string | null;
  onRegion: (id: string) => void;
}

/** Where to look: a ready-made region or a country (a drawn box shows up as "Custom area"). */
export default function AreaSelect({ regionId, countries, countryId, onRegion }: Props) {
  const { t } = useI18n();
  return (
    <div className="flex w-56 max-w-full flex-col gap-0.5 text-sm text-muted">
      <label htmlFor="region-select">{t('areaLabel')}</label>
      <select
        id="region-select"
        className={`${select} w-full font-semibold`}
        value={regionId === 'country' ? `country:${countryId}` : regionId}
        onChange={(e) => onRegion(e.target.value)}
      >
        {regionId === 'none' && <option value="none">{t('chooseRegion')}</option>}
        {regionId === 'custom' && <option value="custom">{t('customArea')}</option>}
        {regionId === 'country' && !countries.some((c) => c.id === countryId) && <option value={`country:${countryId}`}>{t('loading')}</option>}
        <optgroup label={t('regionsGroup')}>
          {REGIONS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </optgroup>
        {countries.length > 0 && (
          <optgroup label={t('countriesGroup')}>
            {countries.map((c) => (
              <option key={c.id} value={`country:${c.id}`}>
                {c.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
}
