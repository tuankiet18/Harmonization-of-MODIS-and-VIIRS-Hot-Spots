import { useMemo } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import EChart from './EChart';
import { useI18n } from '../i18n';
import { annualTotals } from '../lib/stats';
import { COLORS } from '../lib/theme';
import type { MonthlyPoint, Source } from '../data/types';

interface Props {
  points: MonthlyPoint[]; // the period shown
  source: Source;
  focusYear: number | null;
  onSelectYear: (year: number) => void;
}

const FONT = 'Barlow, system-ui, sans-serif';
const FULL = '#7C8A82';
const PART = '#C9D0CA';

/** One bar per year: the total, with the focus year in the accent colour and part-years drawn lighter. */
export default function AnnualChart({ points, source, focusYear, onSelectYear }: Props) {
  const { t, fmt, fmtCompact } = useI18n();

  const option = useMemo<EChartsCoreOption>(() => {
    const totals = annualTotals(points, source);
    return {
      backgroundColor: 'transparent',
      animation: false,
      textStyle: { fontFamily: FONT },
      grid: { left: 48, right: 8, top: 12, bottom: 24 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        confine: true,
        backgroundColor: COLORS.surface,
        borderColor: COLORS.line,
        textStyle: { color: COLORS.ink, fontFamily: FONT, fontSize: 14 },
        formatter: (ps: { dataIndex: number }[]) => {
          const a = totals[ps[0].dataIndex];
          return `<b>${a.year}</b><br/>${fmt(a.total)}${a.months < 12 ? ` (${a.months}/12)` : ''}`;
        },
      },
      xAxis: { type: 'category', data: totals.map((a) => String(a.year)), axisTick: { show: false }, axisLabel: { color: COLORS.muted, fontSize: 12 }, axisLine: { lineStyle: { color: COLORS.line } } },
      yAxis: { type: 'value', axisLabel: { color: COLORS.muted, fontSize: 12, formatter: (v: number) => fmtCompact(v) }, splitLine: { lineStyle: { color: COLORS.line, type: 'dashed' } } },
      series: [
        {
          type: 'bar',
          barMaxWidth: 30,
          data: totals.map((a) => ({ value: a.total, itemStyle: { color: a.year === focusYear ? COLORS.ember : a.months < 12 ? PART : FULL } })),
        },
      ],
    };
  }, [points, source, focusYear, fmt, fmtCompact]);

  return (
    <EChart
      option={option}
      height={190}
      ariaLabel={t('annualTitle')}
      onClick={(p) => {
        const y = Number(p.name);
        if (Number.isInteger(y)) onSelectYear(y);
      }}
    />
  );
}
