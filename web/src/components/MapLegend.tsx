import { useI18n } from '../i18n';
import { COLORS } from '../lib/theme';

interface Props {
  hasArea: boolean;
  showPoints: boolean;
}

/** Key to the map symbols that are on screen right now. */
export default function MapLegend({ hasArea, showPoints }: Props) {
  const { t } = useI18n();
  const swatch = (dashed: string) => (
    <span className="inline-block h-3 w-5 rounded-[2px] border-2" style={{ borderColor: dashed, borderStyle: 'dashed' }} aria-hidden="true" />
  );
  return (
    <ul className="pointer-events-none absolute bottom-6 left-3 z-10 flex flex-col gap-1.5 rounded-lg bg-surface/95 px-3 py-2 text-sm shadow-sm" aria-label={t('legend')}>
      <li className="flex items-center gap-2">
        {swatch(hasArea ? COLORS.ink : COLORS.ember)}
        {hasArea ? t('legendArea') : t('legendPreset')}
      </li>
      {showPoints && (
        <li className="flex items-center gap-2">
          <span className="inline-block size-3 rounded-full" style={{ background: COLORS.ember }} aria-hidden="true" />
          {t('legendPoint')}
        </li>
      )}
    </ul>
  );
}
