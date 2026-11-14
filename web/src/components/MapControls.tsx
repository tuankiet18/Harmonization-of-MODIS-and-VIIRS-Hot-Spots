import { useEffect, useState } from 'react';
import { REGIONS } from '../data/regions';
import { useI18n } from '../i18n';
import type { Bbox } from '../data/types';
import type { Country } from '../lib/countries';
import { IconClose, IconCoords, IconDraw } from './Icons';
import { btnSolid, field, fieldLabel, select, tool, toolIcon, toolOn } from './ui';

interface Props {
  regionId: string; // preset id, 'custom', 'country' or 'none'
  /** Country borders, loaded after the page; the list stays empty until then. */
  countries: Country[];
  countryId: string | null;
  bbox: Bbox | null;
  drawing: boolean;
  onRegion: (id: string) => void;
  onBbox: (b: Bbox) => void;
  onDrawToggle: () => void;
  onClear: () => void;
}

type Field = 'north' | 'south' | 'west' | 'east';
const FIELDS: Field[] = ['north', 'south', 'west', 'east'];
const round = (n: number) => Math.round(n * 100) / 100;

export function validBbox(b: Bbox): boolean {
  return (
    [b.west, b.south, b.east, b.north].every(Number.isFinite) &&
    b.south < b.north && b.south >= -90 && b.north <= 90 &&
    b.west < b.east && b.west >= -180 && b.east <= 180
  );
}

/** Floating bar on the map: choose a region, draw one, or type its coordinates. */
export default function MapControls(p: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<Field, string>>({ north: '', south: '', west: '', east: '' });
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    const b = p.bbox;
    setDraft(b ? { north: String(round(b.north)), south: String(round(b.south)), west: String(round(b.west)), east: String(round(b.east)) } : { north: '', south: '', west: '', east: '' });
    setInvalid(false);
  }, [p.bbox]);

  const apply = () => {
    const b: Bbox = { south: parseFloat(draft.south), north: parseFloat(draft.north), west: parseFloat(draft.west), east: parseFloat(draft.east) };
    if (validBbox(b)) {
      setInvalid(false);
      setOpen(false);
      p.onBbox(b);
    } else setInvalid(true);
  };

  return (
    <div className="pointer-events-none absolute left-3 right-14 top-3 flex flex-col items-start gap-2">
      <div className="pointer-events-auto flex max-w-full flex-wrap gap-1.5 rounded-2xl bg-surface/95 p-1.5 shadow-float backdrop-blur">
        <select id="region-select" className={`${select} max-w-full font-semibold`} aria-label={t('region')} value={p.regionId === 'country' ? `country:${p.countryId}` : p.regionId} onChange={(e) => p.onRegion(e.target.value)}>
          {p.regionId === 'none' && <option value="none">{t('chooseRegion')}</option>}
          {p.regionId === 'custom' && <option value="custom">{t('customArea')}</option>}
          {p.regionId === 'country' && !p.countries.some((c) => c.id === p.countryId) && <option value={`country:${p.countryId}`}>{t('loading')}</option>}
          <optgroup label={t('regionsGroup')}>
            {REGIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </optgroup>
          {p.countries.length > 0 && (
            <optgroup label={t('countriesGroup')}>
              {p.countries.map((c) => (
                <option key={c.id} value={`country:${c.id}`}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <button type="button" className={p.drawing ? toolOn : tool} aria-pressed={p.drawing} onClick={p.onDrawToggle}>
          <IconDraw />
          <span>{p.drawing ? t('drawing') : t('drawArea')}</span>
        </button>
        <button type="button" className={open ? toolOn : tool} aria-expanded={open} aria-controls="coords-form" onClick={() => setOpen((o) => !o)}>
          <IconCoords />
          <span>{t('coords')}</span>
        </button>
        {p.bbox && (
          <button type="button" className={toolIcon} aria-label={t('clear')} title={t('clear')} onClick={p.onClear}>
            <IconClose />
          </button>
        )}
      </div>
      {open && (
        <form
          id="coords-form"
          className="pointer-events-auto grid w-[min(320px,100%)] grid-cols-2 gap-3 rounded-2xl bg-surface p-3.5 shadow-float"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          {FIELDS.map((f) => (
            <label key={f} className={fieldLabel}>
              <span>{t(f)}</span>
              <input className={field} type="number" step="0.01" inputMode="decimal" value={draft[f]} onChange={(e) => setDraft({ ...draft, [f]: e.target.value })} />
            </label>
          ))}
          {invalid && (
            <p className="col-span-2 text-sm text-red-700" role="alert">
              {t('bboxInvalid')}
            </p>
          )}
          <button type="submit" className={`${btnSolid} col-span-2 justify-center`}>
            {t('applyBbox')}
          </button>
        </form>
      )}
    </div>
  );
}
