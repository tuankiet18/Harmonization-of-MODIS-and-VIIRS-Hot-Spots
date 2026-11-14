import { useMemo } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import EChart from './EChart';
import { useI18n } from '../i18n';
import type { SeasonalMonth } from '../lib/stats';
import { COLORS } from '../lib/theme';

interface Props {
  /** Twelve months: the usual (median and p10..p90 of the other years) and the focus year's own value. */
  profile: SeasonalMonth[];
  focusYear: number | null;
  ariaLabel: string;
}

const FONT = 'Barlow, system-ui, sans-serif';

/** The usual year (median and p10..p90 band of the other years) with the focus year drawn over it. */
export default function SeasonalChart({ profile, focusYear, ariaLabel }: Props) {
  const { t, months, monthsLong, fmt, fmtCompact } = useI18n();

  const option = useMemo<EChartsCoreOption>(() => {
    const year = focusYear === null ? '' : String(focusYear);
    const band = profile.map((p) => (p.p10 !== null && p.p90 !== null ? p.p90 - p.p10 : null));
    const none = { lineStyle: { opacity: 0 }, symbol: 'none' as const, silent: true };
    return {
      backgroundColor: 'transparent',
      animation: false,
      textStyle: { fontFamily: FONT },
      grid: { left: 48, right: 8, top: 36, bottom: 24 },
      legend: { top: 0, left: 0, data: [t('typicalLabel'), t('usualRange'), ...(year ? [year] : [])], textStyle: { color: COLORS.ink, fontSize: 13 }, icon: 'roundRect', itemWidth: 18, itemHeight: 6 },
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: COLORS.surface,
        borderColor: COLORS.line,
        textStyle: { color: COLORS.ink, fontFamily: FONT, fontSize: 14 },
        formatter: (ps: { dataIndex: number }[]) => {
          const p = profile[ps[0].dataIndex];
          const n = (v: number | null) => (v === null ? '–' : fmt(v));
          return [
            `<b>${monthsLong[p.month - 1]}</b>`,
            year && `${year}: ${n(p.current)}`,
            `${t('typicalLabel')}: ${n(p.median)}`,
            `${t('usualRange')}: ${n(p.p10)} – ${n(p.p90)}`,
          ]
            .filter(Boolean)
            .join('<br/>');
        },
      },
      xAxis: { type: 'category', data: months, boundaryGap: false, axisTick: { show: false }, axisLabel: { color: COLORS.muted, fontSize: 12 }, axisLine: { lineStyle: { color: COLORS.line } } },
      yAxis: { type: 'value', axisLabel: { color: COLORS.muted, fontSize: 12, formatter: (v: number) => fmtCompact(v) }, splitLine: { lineStyle: { color: COLORS.line, type: 'dashed' } } },
      series: [
        // The band is two stacked areas: an invisible one up to p10, then a visible one as tall as p90 - p10.
        { name: 'base', type: 'line', stack: 'band', data: profile.map((p) => p.p10), areaStyle: { opacity: 0 }, ...none },
        { name: t('usualRange'), type: 'line', stack: 'band', data: band, areaStyle: { color: 'rgba(23,34,29,0.14)' }, lineStyle: { opacity: 0 }, symbol: 'none', itemStyle: { color: 'rgba(23,34,29,0.28)' } },
        { name: t('typicalLabel'), type: 'line', data: profile.map((p) => p.median), symbol: 'none', lineStyle: { color: COLORS.muted, width: 2, type: 'dashed' }, itemStyle: { color: COLORS.muted }, z: 2 },
        ...(year
          ? [{ name: year, type: 'line' as const, data: profile.map((p) => p.current), symbol: 'circle', symbolSize: 7, lineStyle: { color: COLORS.ember, width: 2.75 }, itemStyle: { color: COLORS.ember }, z: 3 }]
          : []),
      ],
    };
  }, [profile, focusYear, t, months, monthsLong, fmt, fmtCompact]);

  return <EChart option={option} height={230} ariaLabel={ariaLabel} />;
}
