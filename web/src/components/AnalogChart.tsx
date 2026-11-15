import { useMemo } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import EChart from './EChart';
import { useI18n } from '../i18n';
import type { AnalogResult } from '../data/types';
import { COLORS } from '../lib/theme';

const FONT = 'Barlow, system-ui, sans-serif';
// First week of each month, as in the data team's notebook (weeks are 7-day blocks from 1 January).
const MONTH_START_WEEKS = [1, 5, 10, 14, 18, 23, 27, 31, 36, 40, 44, 49];

/** The target year so far, the closest year over the whole year with its similarity band, and the next closest years. */
export default function AnalogChart({ result }: { result: AnalogResult }) {
  const { t, months, fmt, fmtCompact } = useI18n();

  const option = useMemo<EChartsCoreOption>(() => {
    const weeks = Array.from({ length: 52 }, (_, i) => i + 1);
    const best = result.series[0];
    const margin = result.ranking[0]?.marginPct ?? 100;
    const lower = best.frp.map((v) => Math.max(v * (1 - margin / 100), 0));
    const upper = best.frp.map((v) => v * (1 + margin / 100));
    const target = weeks.map((w) => (w <= result.cutoffWeek ? result.targetFrp[w - 1] : null));
    const targetName = t('analogLegendTarget', { year: result.targetYear });
    const bestName = t('analogLegendBest', { year: best.year });
    const bandName = t('analogLegendBand', { n: Math.round(margin) });
    const none = { lineStyle: { opacity: 0 }, symbol: 'none' as const, silent: true };
    return {
      backgroundColor: 'transparent',
      animation: false,
      textStyle: { fontFamily: FONT },
      grid: { left: 52, right: 12, top: 44, bottom: 28 },
      legend: {
        top: 0,
        left: 0,
        data: [targetName, bestName, bandName, ...result.series.slice(1).map((s) => String(s.year))],
        textStyle: { color: COLORS.ink, fontSize: 13 },
        icon: 'roundRect',
        itemWidth: 18,
        itemHeight: 6,
      },
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: COLORS.surface,
        borderColor: COLORS.line,
        textStyle: { color: COLORS.ink, fontFamily: FONT, fontSize: 14 },
        formatter: (ps: { seriesName: string; value: number | null; marker: string; axisValue: number }[]) => {
          const rows = ps.filter((p) => p.value !== null && p.value !== undefined && !['base', bandName].includes(p.seriesName));
          return [`<b>${t('analogWeek')} ${ps[0].axisValue}</b>`, ...rows.map((p) => `${p.marker} ${p.seriesName}: ${fmt(p.value as number)} ${t('analogMw')}`)].join('<br/>');
        },
      },
      xAxis: {
        type: 'category',
        data: weeks,
        boundaryGap: false,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: COLORS.line } },
        axisLabel: { color: COLORS.muted, fontSize: 12, interval: 0, formatter: (v: string) => (MONTH_START_WEEKS.includes(Number(v)) ? months[MONTH_START_WEEKS.indexOf(Number(v))] : '') },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: COLORS.muted, fontSize: 12, formatter: (v: number) => fmtCompact(v) },
        splitLine: { lineStyle: { color: COLORS.line, type: 'dashed' } },
      },
      series: [
        // The band is two stacked areas: an invisible one up to the lower edge, then a visible one as tall as the band.
        { name: 'base', type: 'line', stack: 'band', data: lower, areaStyle: { opacity: 0 }, ...none },
        { name: bandName, type: 'line', stack: 'band', data: upper.map((u, i) => u - lower[i]), areaStyle: { color: 'rgba(31,95,168,0.16)' }, lineStyle: { opacity: 0 }, symbol: 'none', itemStyle: { color: 'rgba(31,95,168,0.4)' } },
        ...result.series.slice(1).map((s) => ({
          name: String(s.year),
          type: 'line' as const,
          data: s.frp,
          symbol: 'none',
          lineStyle: { color: COLORS.muted, width: 1.25, opacity: 0.7 },
          itemStyle: { color: COLORS.muted },
          z: 1,
        })),
        {
          name: bestName,
          type: 'line',
          data: best.frp,
          symbol: 'none',
          lineStyle: { color: COLORS.modis, width: 2.25, type: 'dashed' },
          itemStyle: { color: COLORS.modis },
          z: 2,
          markLine: {
            silent: true,
            symbol: 'none',
            label: { show: true, formatter: t('analogCutoffLine'), color: COLORS.muted, fontSize: 12, position: 'insideEndTop' },
            lineStyle: { color: COLORS.ink, width: 1.5, type: 'dotted' },
            data: [{ xAxis: result.cutoffWeek }],
          },
        },
        { name: targetName, type: 'line', data: target, symbol: 'circle', symbolSize: 5, lineStyle: { color: COLORS.ember, width: 2.75 }, itemStyle: { color: COLORS.ember }, z: 3 },
      ],
    };
  }, [result, t, months, fmt, fmtCompact]);

  return <EChart option={option} height={320} ariaLabel={t('analogChartTitle')} />;
}
