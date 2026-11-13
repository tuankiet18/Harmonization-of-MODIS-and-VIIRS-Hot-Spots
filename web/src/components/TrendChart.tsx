import { useMemo } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import EChart from './EChart';
import { useI18n } from '../i18n';
import { COLORS } from '../lib/theme';
import type { MonthlyPoint, Source } from '../data/types';

interface Props {
  points: MonthlyPoint[];
  source: Source;
  focus: string | null;
  onSelect: (yearMonth: string) => void;
}

const FONT = 'Barlow, system-ui, sans-serif';

export default function TrendChart({ points, source, focus, onSelect }: Props) {
  const { t, fmt, fmtCompact, fmtMonth } = useI18n();

  const option = useMemo<EChartsCoreOption>(() => {
    const x = points.map((p) => p.yearMonth);
    const calib = points.filter((p) => p.allInCalibration);
    const markArea = calib.length
      ? {
          silent: true,
          itemStyle: { color: 'rgba(23,34,29,0.06)' },
          label: { color: COLORS.muted, position: 'insideTop', fontSize: 12, fontFamily: FONT },
          data: [[{ xAxis: calib[0].yearMonth, name: t('calibrationOverlap') }, { xAxis: calib[calib.length - 1].yearMonth }]],
        }
      : undefined;
    const markLine =
      focus && x.includes(focus)
        ? { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: COLORS.ink, width: 1.5, type: 'solid' as const }, data: [{ xAxis: focus }] }
        : undefined;
    const line = (name: string, key: 'modis' | 'viirs' | 'harmonized', color: string, dashed: boolean) => ({
      name,
      type: 'line' as const,
      showSymbol: false,
      connectNulls: false,
      data: points.map((p) => p[key]),
      lineStyle: { color, width: source === key ? 2.5 : 1.25, type: dashed ? ('dashed' as const) : ('solid' as const), opacity: source === key ? 1 : 0.75 },
      itemStyle: { color },
      z: source === key ? 3 : 2,
      markArea: key === 'harmonized' ? markArea : undefined,
      markLine: key === 'harmonized' ? markLine : undefined,
    });
    return {
      backgroundColor: 'transparent',
      animation: false,
      textStyle: { fontFamily: FONT },
      grid: { left: 48, right: 8, top: 40, bottom: 62 },
      legend: { top: 0, left: 0, textStyle: { color: COLORS.ink, fontSize: 13 }, icon: 'roundRect', itemWidth: 18, itemHeight: 4 },
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: COLORS.surface,
        borderColor: COLORS.line,
        textStyle: { color: COLORS.ink, fontFamily: FONT, fontSize: 14 },
        valueFormatter: (v: unknown) => (typeof v === 'number' ? fmt(v) : '–'),
        axisPointer: { label: { formatter: (p: { value: string }) => fmtMonth(p.value) } },
      },
      xAxis: {
        type: 'category',
        data: x,
        axisLabel: { color: COLORS.muted, fontSize: 12, formatter: (v: string) => v.slice(0, 4) },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: COLORS.line } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: COLORS.muted, fontSize: 12, formatter: (v: number) => fmtCompact(v) },
        splitLine: { lineStyle: { color: COLORS.line, type: 'dashed' } },
      },
      dataZoom: [
        { type: 'inside' },
        {
          type: 'slider',
          height: 20,
          bottom: 8,
          borderColor: COLORS.line,
          textStyle: { color: COLORS.muted },
          fillerColor: 'rgba(200,64,10,0.12)',
          dataBackground: { lineStyle: { color: COLORS.muted }, areaStyle: { color: COLORS.line } },
          labelFormatter: (_: number, v: string) => v,
        },
      ],
      series: [
        line(t('srcModis'), 'modis', COLORS.modis, false),
        line(t('srcViirs'), 'viirs', COLORS.viirs, true),
        line(t('srcHarmonized'), 'harmonized', COLORS.ember, false),
      ],
    };
  }, [points, source, focus, t, fmt, fmtCompact, fmtMonth]);

  return (
    <EChart
      option={option}
      height={300}
      ariaLabel={t('trendTitle')}
      onClick={(p) => {
        if (typeof p.name === 'string' && /^\d{4}-\d{2}$/.test(p.name)) onSelect(p.name);
      }}
    />
  );
}
