import { useI18n } from '../i18n';
import { HEX_AREA_KM2, type HexStep } from '../lib/hex';
import { COLORS } from '../lib/theme';

interface Props {
  hasArea: boolean;
  /** What the hexagons on the map show right now: a month or one day, or nothing. */
  hexMode: 'month' | 'day' | null;
  steps: HexStep[];
  res: number;
}

/** Key to the map symbols that are on screen right now. */
export default function MapLegend({ hasArea, hexMode, steps, res }: Props) {
  const { t } = useI18n();
  const fine = res === 7;
  const title = hexMode === 'day' ? (fine ? t('legendHexDay') : t('legendHexDayCoarse')) : fine ? t('legendHexMonth') : t('legendHexMonthCoarse');
  return (
    <div className="pointer-events-none absolute bottom-6 left-3 z-10 flex flex-col gap-1.5 rounded-lg bg-surface/95 px-3 py-2 text-sm shadow-sm" role="group" aria-label={t('legend')}>
      <p className="flex items-center gap-2">
        <span
          className="inline-block h-3 w-5 rounded-[2px] border-2"
          style={{ borderColor: hasArea ? COLORS.ink : COLORS.ember, borderStyle: 'dashed' }}
          aria-hidden="true"
        />
        {hasArea ? t('legendArea') : t('legendPreset')}
      </p>
      {hexMode && (
        <div>
          <p>{title}</p>
          <ul className="mt-1 flex">
            {steps.map((s) => (
              <li key={s.min} className="flex flex-col items-center">
                <span className="block h-3 w-9 border border-ink/30" style={{ background: s.color }} aria-hidden="true" />
                <span className="text-xs text-muted">{s.label}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted">{t('legendHexSize', { km2: Math.round(HEX_AREA_KM2[res] ?? 0).toLocaleString('en-US') })}</p>
        </div>
      )}
    </div>
  );
}
