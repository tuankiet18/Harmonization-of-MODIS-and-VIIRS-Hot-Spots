import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, CustomChart, HeatmapChart, LineChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';
import { useI18n } from '../i18n';
import { IconDownload } from './Icons';

echarts.use([
  BarChart,
  CustomChart,
  HeatmapChart,
  LineChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
  DataZoomComponent,
  MarkAreaComponent,
  MarkLineComponent,
  CanvasRenderer,
]);

interface Props {
  option: EChartsCoreOption;
  height: number;
  onClick?: (params: { data?: unknown; name?: string }) => void;
  ariaLabel?: string;
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'chart';

/** The chart as a PNG on white, with its title above and the source below, so the picture stands on its own in a report. */
async function chartImage(chart: echarts.ECharts, title: string, footer: string): Promise<Blob | null> {
  const img = new Image();
  img.src = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' });
  await img.decode();
  const head = title ? 76 : 24;
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height + head + 56;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#17221D';
  ctx.font = '600 34px Barlow, system-ui, sans-serif';
  if (title) ctx.fillText(title, 24, 52);
  ctx.drawImage(img, 0, head);
  ctx.fillStyle = '#5B6760';
  ctx.font = '400 24px Barlow, system-ui, sans-serif';
  ctx.fillText(footer, 24, canvas.height - 20);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/** Thin ECharts wrapper: one instance per mount, resizes with its container. */
export default function EChart({ option, height, onClick, ariaLabel }: Props) {
  const { t } = useI18n();
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;

  useEffect(() => {
    const parent = el.current;
    if (!parent) return;
    // Each mount gets its own host element. React may run this effect twice on one element (dev), and a chart that is
    // disposed a frame late must only clear its own host, never the canvas of the instance that replaced it.
    const host = document.createElement('div');
    host.style.cssText = 'width:100%;height:100%';
    parent.appendChild(host);
    const c = echarts.init(host, undefined, { renderer: 'canvas' });
    chart.current = c;
    c.on('click', (p) => clickRef.current?.(p as { data?: unknown; name?: string }));
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(parent);
    return () => {
      ro.disconnect();
      chart.current = null;
      host.remove();
      // A paint may already be queued for the next frame; disposing now would leave it with no canvas layers.
      requestAnimationFrame(() => c.dispose());
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true });
  }, [option]);

  const save = async () => {
    const c = chart.current;
    if (!c) return;
    const blob = await chartImage(c, ariaLabel ?? '', t('imageFooter'));
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `firecalendar_${slug(ariaLabel ?? 'chart')}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="group relative">
      <div ref={el} style={{ width: '100%', height }} role="img" aria-label={ariaLabel} />
      <button
        type="button"
        onClick={save}
        title={t('saveImage')}
        aria-label={`${t('saveImage')}: ${ariaLabel ?? ''}`}
        className="absolute right-0 top-0 z-10 inline-flex size-8 items-center justify-center rounded-md border border-line bg-surface/90 text-muted opacity-60 transition hover:border-ink hover:text-ink hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:size-11 pointer-coarse:opacity-100"
      >
        <IconDownload />
      </button>
    </div>
  );
}
