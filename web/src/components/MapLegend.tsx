import { useI18n } from '../i18n';
import type { HexStep } from '../lib/hex';
import { COLORS } from '../lib/theme';

interface Props {
  hasArea: boolean;
  /** What the hexagons on the map show right now: the chosen period or one day, or nothing. */
  hexMode: 'period' | 'day' | 'tempDay' | 'tempMonth' | null;
  steps: HexStep[];
  /** What the hexagons add up to, e.g. '77 hexagons with fire (about 253 km2 each)'. */
  caption: string;
}

/** Key to the map symbols that are on screen right now. */
export default function MapLegend({ hasArea, hexMode, steps, caption }: Props) {
  const { t } = useI18n();
  const title =
    hexMode === 'tempDay' ? t('legendTempDay') : hexMode === 'tempMonth' ? t('legendTempMonth') : hexMode === 'day' ? t('legendHexDay') : t('legendHexMonth');
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
              <li key={s.min} className="flex min-w-9 flex-col items-center">
                <span className="block h-3 w-full border border-ink/30" style={{ background: s.color }} aria-hidden="true" />
                <span className="px-1 text-xs whitespace-nowrap text-muted">{s.label}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 max-w-56 text-xs text-muted">{caption}</p>
        </div>
      )}
    </div>
  );
}
