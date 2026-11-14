import { useMemo } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import EChart from './EChart';
import { useI18n } from '../i18n';
import type { MonthAnomaly } from '../lib/stats';
import { ANOMALY_PIECES, COLORS } from '../lib/theme';

interface Props {
  series: MonthAnomaly[];
  focus: string | null;
  onSelect: (yearMonth: string) => void;
}

const FONT = 'Barlow, system-ui, sans-serif';
/** The most a bar may stretch; a month far beyond it is clipped at the edge and the tooltip still gives its real value. */
const CAP = 400;

const colourOf = (pct: number) =>
  (ANOMALY_PIECES.find((p) => (p.min === undefined || pct >= p.min) && (p.max === undefined || pct < p.max)) ?? ANOMALY_PIECES[2]).color;

/** Each month's distance from the usual, as bars above (more fire) and below (less) the zero line. */
export default function AnomalyChart({ series, focus, onSelect }: Props) {
  const { t, fmt, fmtPct, fmtMonth } = useI18n();

  const option = useMemo<EChartsCoreOption>(() => {
    const x = series.map((a) => a.yearMonth);
    return {
      backgroundColor: 'transparent',
      animation: false,
      textStyle: { fontFamily: FONT },
      grid: { left: 52, right: 8, top: 12, bottom: 28 },
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: COLORS.surface,
        borderColor: COLORS.line,
        textStyle: { color: COLORS.ink, fontFamily: FONT, fontSize: 14 },
        formatter: (ps: { dataIndex: number }[]) => {
          const a = series[ps[0].dataIndex];
          return [`<b>${fmtMonth(a.yearMonth)}</b>`, a.pct === null ? t('anomalyNoBase') : fmtPct(a.pct), a.median === null ? '' : `${fmt(a.value)} / ${fmt(Math.round(a.median))}`].filter(Boolean).join('<br/>');
        },
      },
      xAxis: { type: 'category', data: x, axisTick: { show: false }, axisLabel: { color: COLORS.muted, fontSize: 12, formatter: (v: string) => v.slice(0, 4) }, axisLine: { show: false } },
      yAxis: {
        type: 'value',
        min: -100,
        max: (v: { max: number }) => Math.min(Math.ceil(v.max / 50) * 50, CAP),
        axisLabel: { color: COLORS.muted, fontSize: 12, formatter: (v: number) => `${v}%` },
        splitLine: { lineStyle: { color: COLORS.line, type: 'dashed' } },
      },
      dataZoom: [{ type: 'inside' }],
      series: [
        {
          type: 'bar',
          barCategoryGap: '15%',
          barMaxWidth: 10,
          data: series.map((a) => (a.pct === null ? null : { value: a.pct, itemStyle: { color: colourOf(a.pct) } })),
          markLine: {
            silent: true,
            symbol: 'none',
            label: { show: false },
            data: [{ yAxis: 0, lineStyle: { color: COLORS.ink, width: 1 } }, ...(focus && x.includes(focus) ? [{ xAxis: focus, lineStyle: { color: COLORS.ink, width: 1.5, type: 'solid' as const } }] : [])],
          },
        },
      ],
    };
  }, [series, focus, t, fmt, fmtPct, fmtMonth]);

  return (
    <EChart
      option={option}
      height={210}
      ariaLabel={t('anomalyTitle')}
      onClick={(p) => {
        if (typeof p.name === 'string' && /^\d{4}-\d{2}$/.test(p.name)) onSelect(p.name);
      }}
    />
  );
}
