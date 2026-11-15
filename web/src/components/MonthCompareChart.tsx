import { useMemo } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import EChart from './EChart';
import { useI18n } from '../i18n';
import type { MonthVsUsual } from '../lib/stats';
import { COLORS } from '../lib/theme';

interface Props {
  months: MonthVsUsual[];
  focus: string | null;
  onSelect: (yearMonth: string) => void;
}

const FONT = 'Barlow, system-ui, sans-serif';
const BELOW = '#9CC3E6';
const WITHIN = '#7C8A82';

/** For a short period: one bar per month, drawn over the range that same month usually has in other years. */
export default function MonthCompareChart({ months: rows, focus, onSelect }: Props) {
  const { t, months, fmt, fmtCompact, fmtMonth } = useI18n();

  const option = useMemo<EChartsCompatibleOption>(() => {
    const x = rows.map((r) => `${months[Number(r.yearMonth.slice(5)) - 1]} ${r.yearMonth.slice(0, 4)}`);
    const colour = (r: MonthVsUsual) => (r.p90 !== null && r.value > r.p90 ? COLORS.ember : r.p10 !== null && r.value < r.p10 ? BELOW : WITHIN);
    return {
      backgroundColor: 'transparent',
      animation: false,
      textStyle: { fontFamily: FONT },
      grid: { left: 52, right: 16, top: 36, bottom: 28 },
      legend: { top: 0, left: 0, data: [t('usualRange'), t('typicalLabel')], textStyle: { color: COLORS.ink, fontSize: 13 }, icon: 'roundRect', itemWidth: 18, itemHeight: 6 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        confine: true,
        backgroundColor: COLORS.surface,
        borderColor: COLORS.line,
        textStyle: { color: COLORS.ink, fontFamily: FONT, fontSize: 14 },
        formatter: (ps: { dataIndex: number }[]) => {
          const r = rows[ps[0].dataIndex];
          const n = (v: number | null) => (v === null ? '–' : fmt(Math.round(v)));
          return [`<b>${fmtMonth(r.yearMonth)}</b>`, fmt(r.value), `${t('typicalLabel')}: ${n(r.median)}`, `${t('usualRange')}: ${n(r.p10)} – ${n(r.p90)}`].join('<br/>');
        },
      },
      xAxis: { type: 'category', data: x, axisTick: { show: false }, axisLabel: { color: COLORS.muted, fontSize: 12, interval: 0 }, axisLine: { lineStyle: { color: COLORS.line } } },
      yAxis: { type: 'value', axisLabel: { color: COLORS.muted, fontSize: 12, formatter: (v: number) => fmtCompact(v) }, splitLine: { lineStyle: { color: COLORS.line, type: 'dashed' } } },
      series: [
        // The usual range is a tall pale bar built from an invisible base up to p10 and a visible part as high as p90 - p10.
        { name: 'base', type: 'bar', stack: 'range', barWidth: '70%', silent: true, itemStyle: { color: 'transparent' }, data: rows.map((r) => r.p10) },
        { name: t('usualRange'), type: 'bar', stack: 'range', barWidth: '70%', silent: true, itemStyle: { color: 'rgba(23,34,29,0.13)' }, data: rows.map((r) => (r.p10 !== null && r.p90 !== null ? r.p90 - r.p10 : null)) },
        {
          name: t('typicalLabel'),
          type: 'line',
          data: rows.map((r) => r.median),
          symbol: 'rect',
          symbolSize: [46, 3],
          lineStyle: { opacity: 0 },
          itemStyle: { color: COLORS.ink },
          z: 4,
        },
        {
          name: t('monthValue'),
          type: 'bar',
          barWidth: '34%',
          barGap: '-52%',
          z: 3,
          data: rows.map((r) => ({
            value: r.value,
            itemStyle: { color: colour(r), borderColor: r.yearMonth === focus ? COLORS.ink : 'transparent', borderWidth: r.yearMonth === focus ? 2 : 0 },
          })),
        },
      ],
    };
  }, [rows, focus, t, months, fmt, fmtCompact, fmtMonth]);

  return (
    <EChart
      option={option}
      height={230}
      ariaLabel={t('monthCompareTitle')}
      onClick={(p) => {
        const i = typeof (p as { dataIndex?: number }).dataIndex === 'number' ? (p as { dataIndex: number }).dataIndex : -1;
        if (i >= 0 && rows[i]) onSelect(rows[i].yearMonth);
      }}
    />
  );
}

type EChartsCompatibleOption = EChartsCoreOption;
