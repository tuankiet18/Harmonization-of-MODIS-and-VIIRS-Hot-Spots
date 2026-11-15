import { useMemo } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import EChart from './EChart';
import { useI18n } from '../i18n';
import { valueOf } from '../lib/aggregate';
import { anomalyPct, medianForMonth } from '../lib/stats';
import { ANOMALY_PIECES, BURN, COLORS } from '../lib/theme';
import type { MonthlyPoint, Source } from '../data/types';

export type CalendarMode = 'count' | 'anomaly';

interface Props {
  inRange: MonthlyPoint[];
  all: MonthlyPoint[]; // full history, used as the baseline for medians
  source: Source;
  mode: CalendarMode;
  focus: string | null;
  onSelect: (yearMonth: string) => void;
}

const ROW_H = 19;
const FONT = 'Barlow, system-ui, sans-serif';

export default function FireCalendar({ inRange, all, source, mode, focus, onSelect }: Props) {
  const { t, months, fmt, fmtPct, fmtMonth } = useI18n();

  const { option, height, max, modisScaled } = useMemo(() => {
    const years = [...new Set(inRange.map((p) => p.year))].sort((a, b) => a - b);
    const yIndex = new Map(years.map((y, i) => [y, i]));
    const modisScaledYears = new Set(
      years.filter((y) => inRange.filter((p) => p.year === y).every((p) => p.methods.every((m) => m === 'modis_scaled'))),
    );

    const counts = inRange.map((p) => valueOf(p, source)).filter((v): v is number => v !== null);
    const sorted = [...counts].sort((a, b) => a - b);
    const p98 = Math.max(1, Math.round(sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.98))] : 1));

    // The selected month, drawn on top of the heatmap: a white halo under a dark ring, so it shows on pale and dark squares alike.
    const picked = inRange.find((p) => p.yearMonth === focus && valueOf(p, source) !== null);
    const marker = picked
      ? {
          type: 'custom' as const,
          silent: true,
          z: 10,
          data: [[picked.month - 1, yIndex.get(picked.year)!]],
          renderItem: (_: unknown, api: { coord: (v: number[]) => number[]; size: (v: number[]) => number[]; value: (i: number) => number }) => {
            const [x, y] = api.coord([api.value(0), api.value(1)]);
            const [w, h] = api.size([1, 1]);
            const shape = { x: x - w / 2 + 1.5, y: y - h / 2 + 1.5, width: w - 3, height: h - 3, r: 3 };
            return {
              type: 'group',
              children: [
                { type: 'rect', shape, style: { fill: 'none', stroke: '#ffffff', lineWidth: 7 } },
                { type: 'rect', shape, style: { fill: 'none', stroke: COLORS.ink, lineWidth: 3.5 } },
              ],
            };
          },
        }
      : null;

    const data = inRange.flatMap((p) => {
      const count = valueOf(p, source);
      if (count === null) return [];
      const med = medianForMonth(all, source, p.month, p.year);
      const anom = anomalyPct(count, med);
      const shown = mode === 'count' ? count : anom;
      if (shown === null) return [];
      const itemStyle = p.anyNrt && p.yearMonth !== focus ? { borderColor: COLORS.ink, borderWidth: 1.5, borderType: 'dashed' as const } : undefined;
      return [{ value: [p.month - 1, yIndex.get(p.year)!, shown, count, med, anom, p.yearMonth, p.anyNrt ? 1 : 0], itemStyle }];
    });

    const visualMap =
      mode === 'count'
        ? { type: 'continuous' as const, seriesIndex: 0, dimension: 2, min: 0, max: p98, show: false, inRange: { color: BURN }, outOfRange: { color: BURN[BURN.length - 1] } }
        : { type: 'piecewise' as const, seriesIndex: 0, dimension: 2, show: false, pieces: ANOMALY_PIECES };

    const opt: EChartsCoreOption = {
      backgroundColor: 'transparent',
      animation: false,
      textStyle: { fontFamily: FONT },
      grid: { left: 44, right: 4, top: 26, bottom: 4 },
      tooltip: {
        confine: true,
        backgroundColor: COLORS.surface,
        borderColor: COLORS.line,
        textStyle: { color: COLORS.ink, fontFamily: FONT, fontSize: 14 },
        formatter: (p: { value: (number | string | null)[] }) => {
          const [, , , count, med, anom, ym, nrt] = p.value as [number, number, number, number, number | null, number | null, string, number];
          return [
            `<b>${fmtMonth(ym)}</b>`,
            `${fmt(count)} ${t('hotspots')}`,
            med !== null ? `${t('historicalMedian')}: ${fmt(med)}` : '',
            anom !== null ? `${fmtPct(anom)} ${t('vsMedian')}` : '',
            nrt ? t('legendNrt') : '',
          ]
            .filter(Boolean)
            .join('<br/>');
        },
      },
      xAxis: {
        type: 'category',
        data: months,
        position: 'top',
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: COLORS.muted, fontSize: 13 },
        splitArea: { show: false },
      },
      yAxis: {
        type: 'category',
        data: years.map(String),
        inverse: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          interval: 0,
          // MODIS-only years are set in grey italics; the legend below says why.
          formatter: (val: string) => (modisScaledYears.has(Number(val)) ? `{old|${val}}` : `{y|${val}}`),
          rich: {
            y: { color: COLORS.ink, fontSize: 13, fontFamily: FONT },
            old: { color: COLORS.muted, fontSize: 13, fontFamily: FONT, fontStyle: 'italic' },
          },
        },
      },
      visualMap,
      series: [
        {
          type: 'heatmap',
          data,
          itemStyle: { borderColor: COLORS.surface, borderWidth: 1.5, borderRadius: 2 },
          emphasis: { itemStyle: { borderColor: COLORS.ink, borderWidth: 2 } },
        },
        ...(marker ? [marker] : []),
      ],
    };
    const old = [...modisScaledYears].sort((a, b) => a - b);
    return { option: opt, height: Math.max(160, years.length * ROW_H + 34), max: p98, modisScaled: old.length ? ([old[0], old[old.length - 1]] as const) : null };
  }, [inRange, all, source, mode, focus, t, months, fmt, fmtPct, fmtMonth]);

  return (
    <>
      <EChart
        option={option}
        height={height}
        ariaLabel={t('calendarTitle')}
        onClick={(p) => {
          const v = p.data as { value?: unknown[] } | undefined;
          const ym = v?.value?.[6];
          if (typeof ym === 'string') onSelect(ym);
        }}
      />
      <div className="mt-3 flex flex-wrap justify-between gap-x-6 gap-y-2 text-sm text-muted">
        {mode === 'count' ? (
          <div className="flex items-center gap-2">
            <span>0</span>
            <i className="h-3 w-40 rounded-sm border border-line" style={{ background: `linear-gradient(90deg, ${BURN.join(',')})` }} />
            <span>
              {fmt(max)}+ {t('hotspots')}
            </span>
          </div>
        ) : (
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
            {ANOMALY_PIECES.map((p) => (
              <li key={p.label} className="flex items-center gap-1.5">
                <i className="size-3.5 rounded-sm" style={{ background: p.color }} />
                {p.label}
              </li>
            ))}
          </ul>
        )}
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
          <li className="flex items-center gap-1.5">
            <i className="size-3.5 rounded-sm border-[3px] border-ink shadow-[0_0_0_2px_#fff]" />
            {t('legendSelected')}
          </li>
          <li className="flex items-center gap-1.5">
            <i className="size-3.5 rounded-sm border-[1.5px] border-dashed border-ink" />
            {t('legendNrt')}
          </li>
          <li className="flex items-center gap-1.5">
            <i className="size-3.5 rounded-sm border border-line bg-surface" />
            {t('legendNoData')}
          </li>
          {modisScaled && (
            <li className="flex items-center gap-1.5">
              <i className="italic">{modisScaled[0]}</i>
              {t('modisScaledYears', { from: modisScaled[0], to: modisScaled[1] })}
            </li>
          )}
        </ul>
      </div>
    </>
  );
}
