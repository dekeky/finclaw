import { useEffect, useRef } from 'react';
import {
  type AutoscaleInfo,
  type BaselineData,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  LineStyle,
  type MouseEventParams,
  type Time,
  type WhitespaceData,
  createChart,
} from 'lightweight-charts';
import { OVERLAY_COLORS, type OverlayItem } from './BenchmarkPicker';
import { fullLogicalRange } from './rangeSync';

export type ReturnChartRow = Record<string, string | number | undefined>;

function timeKey(time: Time): string {
  if (typeof time === 'string') return time.slice(0, 10);
  if (typeof time === 'number') return new Date(time * 1000).toISOString().slice(0, 10);
  const month = String(time.month).padStart(2, '0');
  const day = String(time.day).padStart(2, '0');
  return `${time.year}-${month}-${day}`;
}

function formatPct(value: number): string {
  return `${value.toFixed(2)}%`;
}

function setText(node: HTMLElement | null, value: string, className?: string) {
  if (!node) return;
  node.textContent = value;
  if (className !== undefined) node.className = className;
}

function toneClass(value: number): string {
  if (value > 0) return 'up';
  if (value < 0) return 'down';
  return 'flat';
}

export default function EquityReturnChart({
  data,
  overlays,
  onInspectDay,
}: {
  data: ReturnChartRow[];
  overlays: OverlayItem[];
  onInspectDay?: (day: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const dateRef = useRef<HTMLSpanElement>(null);
  const strategyRef = useRef<HTMLElement>(null);
  const overlayHostRef = useRef<HTMLSpanElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const strategySeriesRef = useRef<ISeriesApi<'Baseline'> | null>(null);
  const overlaySeriesRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map());
  const rowsRef = useRef<Map<string, ReturnChartRow>>(new Map());
  const lastKeyRef = useRef('');
  const labelsRef = useRef<Record<string, string>>({});
  const inspectRef = useRef(onInspectDay);
  inspectRef.current = onInspectDay;

  const paintHud = (row?: ReturnChartRow) => {
    if (!row) return;
    const day = String(row.time ?? '');
    lastKeyRef.current = day;
    setText(dateRef.current, day);
    const strategy = row.strategy;
    if (typeof strategy === 'number' && Number.isFinite(strategy)) {
      setText(strategyRef.current, formatPct(strategy), toneClass(strategy));
    } else {
      setText(strategyRef.current, '—', 'flat');
    }
    const host = overlayHostRef.current;
    if (!host) return;
    host.replaceChildren();
    for (const [code, label] of Object.entries(labelsRef.current)) {
      if (code === 'strategy') continue;
      const raw = row[code];
      const span = document.createElement('span');
      const name = document.createElement('span');
      name.textContent = label;
      const value = document.createElement('b');
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        value.textContent = formatPct(raw);
        value.className = toneClass(raw);
      } else {
        value.textContent = '—';
        value.className = 'flat';
      }
      span.append(name, value);
      host.append(span);
    }
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const width = Math.max(host.clientWidth, 320);
    const height = Math.max(host.clientHeight || 300, 80);
    const chart = createChart(host, {
      width,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#000000' },
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
        scaleMargins: { top: 0.08, bottom: 0.08 },
        minimumWidth: 52,
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
        priceFormatter: (price: number) => `${price.toFixed(0)}%`,
      },
      handleScroll: { vertTouchDrag: false, mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    });
    const strategy = chart.addBaselineSeries({
      baseValue: { type: 'price', price: 0 },
      topLineColor: '#e64545',
      topFillColor1: 'rgba(230, 69, 69, 0.22)',
      topFillColor2: 'rgba(230, 69, 69, 0.04)',
      bottomLineColor: '#00a870',
      bottomFillColor1: 'rgba(0, 168, 112, 0.04)',
      bottomFillColor2: 'rgba(0, 168, 112, 0.22)',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
      autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
        const res = original();
        if (!res?.priceRange) return res;
        return {
          ...res,
          priceRange: {
            minValue: Math.min(res.priceRange.minValue, 0),
            maxValue: Math.max(res.priceRange.maxValue, 0),
          },
        };
      },
    });
    strategy.createPriceLine({
      price: 0,
      color: '#8c8c8c',
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: '0%',
    });
    const onMove = (param: MouseEventParams) => {
      if (!param.time || !param.point || param.point.x < 0 || param.point.y < 0) {
        paintHud(rowsRef.current.get(lastKeyRef.current));
        return;
      }
      paintHud(rowsRef.current.get(timeKey(param.time)));
    };
    const onClick = (param: MouseEventParams) => {
      if (!param.time) return;
      inspectRef.current?.(timeKey(param.time));
    };
    chart.subscribeCrosshairMove(onMove);
    chart.subscribeClick(onClick);
    let lastWidth = width;
    let lastHeight = height;
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
    });
    observer.observe(host);
    chartRef.current = chart;
    strategySeriesRef.current = strategy;
    return () => {
      observer.disconnect();
      chart.unsubscribeCrosshairMove(onMove);
      chart.unsubscribeClick(onClick);
      chart.remove();
      chartRef.current = null;
      strategySeriesRef.current = null;
      overlaySeriesRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const strategySeries = strategySeriesRef.current;
    if (!chart || !strategySeries) return;

    const labels: Record<string, string> = { strategy: '策略' };
    for (const item of overlays) labels[item.code] = item.name;
    labelsRef.current = labels;

    const wanted = new Set(overlays.map((item) => item.code));
    for (const [code, series] of overlaySeriesRef.current) {
      if (wanted.has(code)) continue;
      chart.removeSeries(series);
      overlaySeriesRef.current.delete(code);
    }
    overlays.forEach((item, index) => {
      let series = overlaySeriesRef.current.get(item.code);
      if (!series) {
        series = chart.addLineSeries({
          color: OVERLAY_COLORS[index % OVERLAY_COLORS.length],
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        overlaySeriesRef.current.set(item.code, series);
      } else {
        series.applyOptions({ color: OVERLAY_COLORS[index % OVERLAY_COLORS.length] });
      }
    });

    const rows = new Map<string, ReturnChartRow>();
    const strategyPoints: (BaselineData<Time> | WhitespaceData<Time>)[] = [];
    const overlayPoints = new Map<string, (LineData<Time> | WhitespaceData<Time>)[]>();
    for (const item of overlays) overlayPoints.set(item.code, []);
    const seen = new Set<string>();
    for (const row of data) {
      const day = String(row.time ?? '').slice(0, 10);
      if (!day || seen.has(day)) continue;
      seen.add(day);
      const time = day as Time;
      rows.set(day, { ...row, time: day });
      const strategy = row.strategy;
      if (typeof strategy === 'number' && Number.isFinite(strategy)) {
        strategyPoints.push({ time, value: strategy });
      } else {
        strategyPoints.push({ time });
      }
      for (const item of overlays) {
        const raw = row[item.code];
        const points = overlayPoints.get(item.code);
        if (!points) continue;
        if (typeof raw === 'number' && Number.isFinite(raw)) {
          points.push({ time, value: raw });
        } else {
          points.push({ time });
        }
      }
    }
    rowsRef.current = rows;
    strategySeries.setData(strategyPoints);
    for (const item of overlays) {
      overlaySeriesRef.current.get(item.code)?.setData(overlayPoints.get(item.code) ?? []);
    }
    const rowsList = [...rows.values()];
    const lastWithStrategy = [...rowsList].reverse().find((row) => typeof row.strategy === 'number');
    const last = lastWithStrategy ?? rowsList[rowsList.length - 1];
    if (last) {
      lastKeyRef.current = String(last.time ?? '');
      paintHud(last);
    }
    const full = fullLogicalRange(strategyPoints.length);
    if (full) chart.timeScale().setVisibleLogicalRange(full);
  }, [data, overlays]);

  return (
    <div className={`return-chart-wrap${onInspectDay ? ' clickable' : ''}`}>
      <div className="kline-hud return-chart-hud">
        <div className="kline-hud-row">
          <span className="kline-hud-date" ref={dateRef} />
          <span>
            策略 <b ref={strategyRef} />
          </span>
          <span className="return-chart-overlays" ref={overlayHostRef} />
          {onInspectDay ? (
            <button
              type="button"
              className="return-chart-holdings"
              onClick={() => {
                const day = lastKeyRef.current;
                if (day) onInspectDay(day);
              }}
            >
              持仓明细
            </button>
          ) : null}
        </div>
      </div>
      <div className="return-chart" ref={hostRef} />
    </div>
  );
}
