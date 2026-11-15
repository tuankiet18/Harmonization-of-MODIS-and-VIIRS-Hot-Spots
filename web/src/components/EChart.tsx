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

/** Thin ECharts wrapper: one instance per mount, resizes with its container. */
export default function EChart({ option, height, onClick, ariaLabel }: Props) {
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

  return <div ref={el} style={{ width: '100%', height }} role="img" aria-label={ariaLabel} />;
}
