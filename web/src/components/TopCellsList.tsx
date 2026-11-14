import { useI18n } from '../i18n';
import type { TopCell } from '../lib/stats';

interface Props {
  cells: TopCell[];
  onGo: (lat: number, lon: number) => void;
}

const place = (lat: number, lon: number) => `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`;

/** The cells with the most days of fire, as a table whose rows take the map there. */
export default function TopCellsList({ cells, onGo }: Props) {
  const { t, fmt } = useI18n();
  if (!cells.length) return <p className="text-muted">{t('cellsNone')}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-left">
        <caption className="sr-only">{t('cellsTitle')}</caption>
        <thead className="text-sm text-muted">
          <tr>
            <th scope="col" className="w-8 py-1 pr-2 font-normal">
              #
            </th>
            <th scope="col" className="py-1 pr-2 font-normal">
              {t('cellsPlace')}
            </th>
            <th scope="col" className="py-1 pr-2 text-right font-normal">
              {t('cellsDays')}
            </th>
            <th scope="col" className="w-36 py-1 font-normal">
              {t('cellsShare')}
            </th>
          </tr>
        </thead>
        <tbody>
          {cells.map((c, i) => (
            <tr key={c.h3} className="border-t border-line align-top">
              <td className="py-2 pr-2 text-muted">{i + 1}</td>
              <td className="py-2 pr-2">
                <button
                  type="button"
                  className="min-h-9 text-left font-semibold underline decoration-line underline-offset-4 hover:decoration-ink"
                  aria-label={t('cellGo', { place: place(c.lat, c.lon) })}
                  onClick={() => onGo(c.lat, c.lon)}
                >
                  {place(c.lat, c.lon)}
                </button>
                {c.persistent && (
                  <p className="mt-0.5 flex max-w-[34ch] gap-1 text-sm text-warn">
                    <span aria-hidden="true">⚠</span>
                    {t('cellStatic')}
                  </p>
                )}
              </td>
              <td className="py-2 pr-2 text-right font-semibold">{fmt(c.days)}</td>
              <td className="py-2">
                <div className="flex items-center gap-2">
                  <span className="h-2 flex-1 rounded-full bg-page" aria-hidden="true">
                    <span className="block h-2 rounded-full bg-ember" style={{ width: `${Math.max(3, Math.round(c.share * 100))}%` }} />
                  </span>
                  <span className="w-10 text-right text-sm text-muted">{Math.round(c.share * 100)}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
