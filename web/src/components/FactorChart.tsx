import { useMemo } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import EChart from './EChart';
import { useI18n } from '../i18n';
import { COLORS } from '../lib/theme';
import type { MonthlyPoint } from '../data/types';

const FONT = 'Barlow, system-ui, sans-serif';

/** For each calendar month, the average factor that turned a MODIS count into the VIIRS scale in this area (months before the VIIRS era). */
export function factorsByMonth(points: MonthlyPoint[]): (number | null)[] {
  const sums = Array.from({ length: 12 }, () => ({ total: 0, n: 0 }));
  for (const p of points) {
    if (p.scaleFactor === null || !p.methods.includes('modis_scaled')) continue;
    sums[p.month - 1].total += p.scaleFactor;
    sums[p.month - 1].n += 1;
  }
  return sums.map((s) => (s.n ? Math.round((s.total / s.n) * 100) / 100 : null));
}

/** A bar per calendar month: how many times each MODIS count is multiplied to match the VIIRS scale. */
export default function FactorChart({ points }: { points: MonthlyPoint[] }) {
  const { t, months } = useI18n();
  const factors = useMemo(() => factorsByMonth(points), [points]);
  const option = useMemo<EChartsCoreOption>(
    () => ({
      backgroundColor: 'transparent',
      animation: false,
      textStyle: { fontFamily: FONT },
      grid: { left: 36, right: 8, top: 12, bottom: 24 },
      tooltip: {
        confine: true,
        backgroundColor: COLORS.surface,
        borderColor: COLORS.line,
        textStyle: { color: COLORS.ink, fontFamily: FONT, fontSize: 14 },
        valueFormatter: (v: unknown) => (typeof v === 'number' ? `× ${v}` : '–'),
        trigger: 'axis',
      },
      xAxis: { type: 'category', data: months, axisTick: { show: false }, axisLine: { lineStyle: { color: COLORS.line } }, axisLabel: { color: COLORS.muted, fontSize: 12, interval: 0 } },
      yAxis: { type: 'value', axisLabel: { color: COLORS.muted, fontSize: 12, formatter: (v: number) => `×${v}` }, splitLine: { lineStyle: { color: COLORS.line, type: 'dashed' } } },
      series: [{ type: 'bar', data: factors, itemStyle: { color: COLORS.modis, borderRadius: [2, 2, 0, 0] }, barWidth: '60%' }],
    }),
    [factors, months],
  );
  if (!factors.some((f) => f !== null)) return <p className="text-sm text-muted">{t('factorNone')}</p>;
  return <EChart option={option} height={170} ariaLabel={t('factorTitle')} />;
}
