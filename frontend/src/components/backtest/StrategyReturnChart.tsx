import { useEffect, useRef } from 'react';
import {
  type AreaData,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  LineStyle,
  type LogicalRange,
  type Time,
  type WhitespaceData,
  createChart,
} from 'lightweight-charts';
import { type RangeSync, fullLogicalRange, isFullLogicalRange, sameLogicalRange } from './rangeSync';

const CHART_BG = '#000000';

function timeKey(time: Time): string {
  if (typeof time === 'string') return time.slice(0, 10);
  if (typeof time === 'number') return new Date(time * 1000).toISOString().slice(0, 10);
  const month = String(time.month).padStart(2, '0');
  const day = String(time.day).padStart(2, '0');
  return `${time.year}-${month}-${day}`;
}

export type ReturnPoint = {
  time: string;
  value?: number;
};

export default function StrategyReturnChart({
  data,
  height,
  rangeSync,
}: {
  data: ReturnPoint[];
  height?: number;
  rangeSync?: RangeSync;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const rangeSyncRef = useRef(rangeSync);
  const sourceRef = useRef({});
  const applyingRef = useRef(false);
  const fittedRef = useRef(false);
  const userZoomedRef = useRef(false);
  const barCountRef = useRef(0);
  const suppressUntilRef = useRef(0);
  rangeSyncRef.current = rangeSync;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const width = Math.max(host.clientWidth, 320);
    const resolvedHeight = Math.max(host.clientHeight || height || 220, 80);
    const chart = createChart(host, {
      width,
      height: resolvedHeight,
      layout: {
        background: { type: ColorType.Solid, color: CHART_BG },
        textColor: '#8c8c8c',
        fontFamily: '"Noto Sans SC", "Microsoft YaHei UI", sans-serif',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: '#1a1a1a' },
        horzLines: { color: '#1a1a1a' },
      },
      rightPriceScale: {
        borderColor: '#2a2a2a',
        scaleMargins: { top: 0.12, bottom: 0.08 },
        minimumWidth: 72,
      },
      timeScale: {
        borderColor: '#2a2a2a',
        timeVisible: false,
        minBarSpacing: 0.001,
        tickMarkFormatter: (time: Time) => timeKey(time),
      },
      localization: {
        dateFormat: 'yyyy-MM-dd',
        timeFormatter: (time: Time) => timeKey(time),
        priceFormatter: (price: number) => price.toLocaleString('zh-CN', { maximumFractionDigits: 2 }),
      },
      handleScroll: { vertTouchDrag: false, mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    });
    const series = chart.addAreaSeries({
      lineColor: '#e64545',
      topColor: 'rgba(230, 69, 69, 0.28)',
      bottomColor: 'rgba(0, 168, 112, 0.12)',
      lineWidth: 2,
      priceLineVisible: true,
      priceLineColor: '#666666',
      priceLineStyle: LineStyle.Dashed,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
    });
    const markUserZoom = () => {
      if (fittedRef.current) userZoomedRef.current = true;
    };
    const onWheel = (event: WheelEvent) => {
      event.stopPropagation();
      if (fittedRef.current) userZoomedRef.current = true;
    };
    host.addEventListener('wheel', onWheel, { passive: true });
    host.addEventListener('pointerdown', markUserZoom);
    const onRange = (range: LogicalRange | null) => {
      if (!range || applyingRef.current || !rangeSyncRef.current || !fittedRef.current) return;
      if (performance.now() < suppressUntilRef.current) return;
      if (!userZoomedRef.current) return;
      rangeSyncRef.current.publish({ from: range.from, to: range.to }, sourceRef.current);
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    let lastWidth = width;
    let lastHeight = resolvedHeight;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      const nextWidth = Math.floor(rect?.width ?? 0);
      const nextHeight = Math.floor(rect?.height ?? 0);
      const widthChanged = nextWidth >= 160 && Math.abs(nextWidth - lastWidth) >= 2;
      const heightChanged = nextHeight >= 80 && Math.abs(nextHeight - lastHeight) >= 2;
      if (!widthChanged && !heightChanged) return;
      if (widthChanged) lastWidth = nextWidth;
      if (heightChanged) lastHeight = nextHeight;
      chart.applyOptions({ width: lastWidth, height: lastHeight });
      if (userZoomedRef.current) return;
      const full = fullLogicalRange(barCountRef.current);
      if (!full) return;
      applyingRef.current = true;
      suppressUntilRef.current = performance.now() + 200;
      chart.timeScale().setVisibleLogicalRange(full);
      rangeSyncRef.current?.publish(full, sourceRef.current);
      requestAnimationFrame(() => {
        applyingRef.current = false;
      });
    });
    observer.observe(host);
    chartRef.current = chart;
    seriesRef.current = series;
    return () => {
      observer.disconnect();
      host.removeEventListener('wheel', onWheel);
      host.removeEventListener('pointerdown', markUserZoom);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    const points: (AreaData<Time> | WhitespaceData<Time>)[] = [];
    const seen = new Set<string>();
    for (const row of data) {
      const time = row.time.slice(0, 10) as Time;
      const key = String(time);
      if (seen.has(key)) continue;
      seen.add(key);
      if (typeof row.value === 'number' && Number.isFinite(row.value)) {
        points.push({ time, value: row.value });
      } else {
        points.push({ time });
      }
    }
    series.setData(points);
    barCountRef.current = points.length;
    if (!points.length) return;
    const apply = () => {
      const live = chartRef.current;
      if (!live) return;
      const synced = rangeSyncRef.current?.last;
      const full = fullLogicalRange(points.length);
      applyingRef.current = true;
      suppressUntilRef.current = performance.now() + 200;
      if (!userZoomedRef.current && full) {
        live.timeScale().setVisibleLogicalRange(full);
        fittedRef.current = true;
        rangeSyncRef.current?.publish(full, sourceRef.current);
      } else if (synced) {
        live.timeScale().setVisibleLogicalRange(synced);
        fittedRef.current = true;
      } else if (full) {
        live.timeScale().setVisibleLogicalRange(full);
        fittedRef.current = true;
        rangeSyncRef.current?.publish(full, sourceRef.current);
      }
      requestAnimationFrame(() => {
        applyingRef.current = false;
      });
    };
    apply();
    requestAnimationFrame(apply);
  }, [data]);

  useEffect(() => {
    const chart = chartRef.current;
    const sync = rangeSync;
    if (!chart || !sync) return;
    const source = sourceRef.current;
    return sync.subscribe((range, from) => {
      if (from === source) return;
      const current = chart.timeScale().getVisibleLogicalRange();
      if (sameLogicalRange(current, range)) return;
      if (!isFullLogicalRange(range, barCountRef.current)) userZoomedRef.current = true;
      applyingRef.current = true;
      chart.timeScale().setVisibleLogicalRange(range);
      applyingRef.current = false;
    });
  }, [rangeSync]);

  return <div className="strategy-return-chart" ref={hostRef} style={height ? { height } : undefined} />;
}
