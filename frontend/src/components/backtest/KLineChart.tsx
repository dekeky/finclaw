import { useEffect, useRef } from 'react';
import {
  type CandlestickData,
  ColorType,
  CrosshairMode,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  LineStyle,
  type LogicalRange,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
  createChart,
} from 'lightweight-charts';
import { placeFocusLine } from './chartFocusLine';
import {
  type RangeSync,
  focusedLogicalRange,
  fullLogicalRange,
  indexForDay,
  isFullLogicalRange,
  sameLogicalRange,
} from './rangeSync';

export type FillMark = {
  price: number;
  quantity: number;
  reason?: string;
};

export type CandlePoint = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  buy?: FillMark;
  sell?: FillMark;
};

const UP = '#ff3232';
const DOWN = '#00d26a';
const CHART_BG = '#000000';
const CHART_HEIGHT = 420;
const MA_PERIODS = [
  { period: 5, color: '#ffffff', key: 'ma5' as const },
  { period: 10, color: '#ffff00', key: 'ma10' as const },
  { period: 20, color: '#ff00ff', key: 'ma20' as const },
];

type MaKey = (typeof MA_PERIODS)[number]['key'];
type MaMaps = Record<MaKey, Map<string, number>>;

function timeKey(time: Time): string {
  if (typeof time === 'string') return time.slice(0, 10);
  if (typeof time === 'number') {
    return new Date(time * 1000).toISOString().slice(0, 10);
  }
  const month = String(time.month).padStart(2, '0');
  const day = String(time.day).padStart(2, '0');
  return `${time.year}-${month}-${day}`;
}

function formatPrice(value: number): string {
  return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function formatMarkPrice(value: number): string {
  const digits = value >= 100 ? 2 : value >= 1 ? 2 : 3;
  return value.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatMarkAmt(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 10000) {
    const wan = abs / 10000;
    const digits = wan >= 100 ? 0 : 1;
    return `${value < 0 ? '-' : ''}${wan.toFixed(digits).replace(/\.0+$/, '')}万`;
  }
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

function formatShareQty(value: number): string {
  return Math.round(Math.abs(value)).toLocaleString('zh-CN');
}

function markerText(mark: FillMark, side: 'B' | 'S'): string {
  const reason = mark.reason?.trim();
  if (!reason) return side;
  const text = reason.length > 18 ? `${reason.slice(0, 18)}…` : reason;
  return `${side} ${text}`;
}

function paintFill(node: HTMLElement | null, side: 'buy' | 'sell', mark?: FillMark) {
  if (!node) return;
  node.replaceChildren();
  if (!mark) {
    node.hidden = true;
    node.title = '';
    return;
  }
  node.hidden = false;
  node.className = `kline-hud-fill ${side}`;
  const action = side === 'buy' ? '买入' : '卖出';
  const price = document.createElement('b');
  price.textContent = formatMarkPrice(mark.price);
  const qty = document.createElement('b');
  qty.textContent = formatShareQty(mark.quantity);
  const amt = document.createElement('b');
  amt.textContent = formatMarkAmt(mark.price * mark.quantity);
  node.append(price, '价格', action, qty, '股，成交金额', amt);
  node.title = mark.reason || `${formatMarkPrice(mark.price)}价格${action}${formatShareQty(mark.quantity)}股`;
}

function formatVolume(value: number): string {
  if (value >= 1e8) return `${(value / 1e8).toFixed(2)}亿`;
  if (value >= 1e4) return `${(value / 1e4).toFixed(2)}万`;
  return Math.round(value).toLocaleString('zh-CN');
}

function formatSigned(value: number, digits = 2): string {
  const text = value.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return value > 0 ? `+${text}` : text;
}

function toneClass(value: number, base?: number): string {
  if (base === undefined) return 'flat';
  if (value > base) return 'up';
  if (value < base) return 'down';
  return 'flat';
}

function setText(node: HTMLElement | null, value: string, className?: string) {
  if (!node) return;
  node.textContent = value;
  if (className !== undefined) node.className = className;
}

function movingAverage(candles: CandlestickData<Time>[], period: number): LineData<Time>[] {
  const out: LineData<Time>[] = [];
  let sum = 0;
  for (let index = 0; index < candles.length; index += 1) {
    sum += candles[index].close;
    if (index >= period) sum -= candles[index - period].close;
    if (index >= period - 1) {
      out.push({ time: candles[index].time, value: sum / period });
    }
  }
  return out;
}

export type { VisibleLogicalRange } from './rangeSync';

export default function KLineChart({
  data,
  height,
  rangeSync,
  timeAxis = true,
  focusDate,
}: {
  data: CandlePoint[];
  height?: number;
  rangeSync?: RangeSync;
  timeAxis?: boolean;
  focusDate?: string | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const focusLineRef = useRef<HTMLDivElement>(null);
  const focusBarRef = useRef('');
  const dateRef = useRef<HTMLSpanElement>(null);
  const openRef = useRef<HTMLElement>(null);
  const highRef = useRef<HTMLElement>(null);
  const lowRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLElement>(null);
  const chgRef = useRef<HTMLSpanElement>(null);
  const chgPctRef = useRef<HTMLSpanElement>(null);
  const volRef = useRef<HTMLSpanElement>(null);
  const ma5Ref = useRef<HTMLElement>(null);
  const ma10Ref = useRef<HTMLElement>(null);
  const ma20Ref = useRef<HTMLElement>(null);
  const buyRef = useRef<HTMLSpanElement>(null);
  const sellRef = useRef<HTMLSpanElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const maRefs = useRef<Partial<Record<MaKey, ISeriesApi<'Line'>>>>({});
  const dataRef = useRef<Map<string, CandlePoint>>(new Map());
  const prevCloseRef = useRef<Map<string, number>>(new Map());
  const maMapsRef = useRef<MaMaps>({ ma5: new Map(), ma10: new Map(), ma20: new Map() });
  const lastKeyRef = useRef('');
  const rangeSyncRef = useRef(rangeSync);
  const sourceRef = useRef({});
  const applyingRef = useRef(false);
  const fittedRef = useRef(false);
  const userZoomedRef = useRef(false);
  const barCountRef = useRef(0);
  const suppressUntilRef = useRef(0);
  rangeSyncRef.current = rangeSync;

  const paintHud = (candle?: CandlePoint) => {
    if (!candle) return;
    const prev = prevCloseRef.current.get(candle.time);
    setText(dateRef.current, candle.time);
    setText(openRef.current, formatPrice(candle.open), toneClass(candle.open, prev));
    setText(highRef.current, formatPrice(candle.high), toneClass(candle.high, prev));
    setText(lowRef.current, formatPrice(candle.low), toneClass(candle.low, prev));
    setText(closeRef.current, formatPrice(candle.close), toneClass(candle.close, prev));
    if (prev && prev !== 0) {
      const change = candle.close - prev;
      const tone = toneClass(change, 0);
      setText(chgRef.current, formatSigned(change, 4), tone);
      setText(chgPctRef.current, `${formatSigned((change / prev) * 100)}%`, tone);
    } else {
      setText(chgRef.current, '--', 'flat');
      setText(chgPctRef.current, '--', 'flat');
    }
    if (candle.volume && candle.volume > 0) {
      setText(volRef.current, `量 ${formatVolume(candle.volume)}`, 'flat');
    } else {
      setText(volRef.current, '', 'flat');
    }
    const mas = maMapsRef.current;
    setText(ma5Ref.current, mas.ma5.has(candle.time) ? formatPrice(mas.ma5.get(candle.time)!) : '--');
    setText(ma10Ref.current, mas.ma10.has(candle.time) ? formatPrice(mas.ma10.get(candle.time)!) : '--');
    setText(ma20Ref.current, mas.ma20.has(candle.time) ? formatPrice(mas.ma20.get(candle.time)!) : '--');
    paintFill(buyRef.current, 'buy', candle.buy);
    paintFill(sellRef.current, 'sell', candle.sell);
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const width = Math.max(host.clientWidth, 320);
    const resolvedHeight = Math.max(host.clientHeight || height || CHART_HEIGHT, 80);
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
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#555555',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#333333',
        },
        horzLine: {
          color: '#555555',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#333333',
        },
      },
      rightPriceScale: {
        borderColor: '#2a2a2a',
        scaleMargins: { top: 0.08, bottom: 0.22 },
        minimumWidth: 56,
      },
      timeScale: {
        visible: timeAxis,
        borderColor: '#2a2a2a',
        timeVisible: false,
        minBarSpacing: 0.001,
        tickMarkFormatter: (time: Time) => timeKey(time),
      },
      localization: {
        dateFormat: 'yyyy-MM-dd',
        timeFormatter: (time: Time) => timeKey(time),
      },
      handleScroll: { vertTouchDrag: false, mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    });
    const series = chart.addCandlestickSeries({
      upColor: 'rgba(0,0,0,0)',
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      lastValueVisible: true,
      priceLineVisible: true,
      priceLineColor: '#666666',
      priceLineStyle: LineStyle.Dashed,
    });
    const volume = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volume.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    const maSeries: Partial<Record<MaKey, ISeriesApi<'Line'>>> = {};
    for (const item of MA_PERIODS) {
      maSeries[item.key] = chart.addLineSeries({
        color: item.color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
    }

    const onMove = (param: MouseEventParams) => {
      if (!param.time || !param.point || param.point.x < 0 || param.point.y < 0) {
        paintHud(dataRef.current.get(lastKeyRef.current));
        return;
      }
      paintHud(dataRef.current.get(timeKey(param.time)));
    };

    chart.subscribeCrosshairMove(onMove);
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
      placeFocusLine(chart, focusLineRef.current, focusBarRef.current);
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
      placeFocusLine(chart, focusLineRef.current, focusBarRef.current);
      if (userZoomedRef.current) return;
      const full = fullLogicalRange(barCountRef.current, chart.timeScale().width());
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
    volumeRef.current = volume;
    maRefs.current = maSeries;
    return () => {
      observer.disconnect();
      host.removeEventListener('wheel', onWheel);
      host.removeEventListener('pointerdown', markUserZoom);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeRef.current = null;
      maRefs.current = {};
    };
  }, [height, timeAxis]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    const volumeSeries = volumeRef.current;
    if (!series || !chart || !volumeSeries) return;

    const candles: CandlestickData<Time>[] = [];
    const volumes: HistogramData<Time>[] = [];
    const markers: SeriesMarker<Time>[] = [];
    const index = new Map<string, CandlePoint>();
    const prevClose = new Map<string, number>();
    const seen = new Set<string>();
    let previous: CandlePoint | undefined;
    for (const point of data) {
      const time = point.time.slice(0, 10) as Time;
      const key = String(time);
      if (seen.has(key)) continue;
      seen.add(key);
      if (![point.open, point.high, point.low, point.close].every(Number.isFinite)) continue;
      index.set(key, point);
      if (previous) prevClose.set(key, previous.close);
      previous = point;
      candles.push({
        time,
        open: point.open,
        high: Math.max(point.high, point.open, point.close),
        low: Math.min(point.low, point.open, point.close),
        close: point.close,
      });
      if (point.volume && point.volume > 0) {
        volumes.push({
          time,
          value: point.volume,
          color: point.close >= point.open ? 'rgba(255,50,50,0.45)' : 'rgba(0,210,106,0.45)',
        });
      }
      if (point.buy) {
        markers.push({
          time,
          position: 'belowBar',
          color: UP,
          shape: 'arrowUp',
          text: markerText(point.buy, 'B'),
          size: 0.7,
        });
      }
      if (point.sell) {
        markers.push({
          time,
          position: 'aboveBar',
          color: DOWN,
          shape: 'arrowDown',
          text: markerText(point.sell, 'S'),
          size: 0.7,
        });
      }
    }

    const maMaps: MaMaps = { ma5: new Map(), ma10: new Map(), ma20: new Map() };
    for (const item of MA_PERIODS) {
      const line = movingAverage(candles, item.period);
      maRefs.current[item.key]?.setData(line);
      for (const row of line) maMaps[item.key].set(timeKey(row.time), row.value);
    }

    dataRef.current = index;
    prevCloseRef.current = prevClose;
    maMapsRef.current = maMaps;
    lastKeyRef.current = previous?.time.slice(0, 10) ?? '';
    series.setData(candles);
    series.setMarkers(markers);
    volumeSeries.setData(volumes);
    const lastCandle = candles[candles.length - 1];
    if (lastCandle) {
      series.applyOptions({
        priceLineColor: lastCandle.close >= lastCandle.open ? UP : DOWN,
      });
    }
    series.priceScale().applyOptions({
      scaleMargins: { top: 0.08, bottom: volumes.length ? 0.22 : 0.04 },
    });
    barCountRef.current = candles.length;
    if (candles.length > 0) {
      const days = candles.map((row) => String(row.time));
      const focusIndex = focusDate ? indexForDay(days, focusDate) : -1;
      const plotWidth = chart.timeScale().width();
      const focused = focusIndex >= 0 ? focusedLogicalRange(candles.length, focusIndex, 45, plotWidth) : null;
      const focusCandle = focusIndex >= 0 ? index.get(days[focusIndex]) : undefined;
      focusBarRef.current = focusIndex >= 0 ? days[focusIndex] : '';
      const apply = () => {
        const live = chartRef.current;
        const liveSeries = seriesRef.current;
        if (!live) return;
        const synced = rangeSyncRef.current?.last;
        const full = fullLogicalRange(candles.length, plotWidth);
        const initial = focused ?? full;
        applyingRef.current = true;
        suppressUntilRef.current = performance.now() + 200;
        if (!userZoomedRef.current && initial) {
          live.timeScale().setVisibleLogicalRange(initial);
          fittedRef.current = true;
          rangeSyncRef.current?.publish(initial, sourceRef.current);
          if (focused) userZoomedRef.current = true;
        } else if (synced) {
          live.timeScale().setVisibleLogicalRange(synced);
          fittedRef.current = true;
        } else if (initial) {
          live.timeScale().setVisibleLogicalRange(initial);
          fittedRef.current = true;
          rangeSyncRef.current?.publish(initial, sourceRef.current);
        }
        if (focusCandle && liveSeries) {
          live.setCrosshairPosition(focusCandle.close, days[focusIndex] as Time, liveSeries);
        }
        placeFocusLine(live, focusLineRef.current, focusBarRef.current);
        requestAnimationFrame(() => {
          applyingRef.current = false;
          placeFocusLine(chartRef.current, focusLineRef.current, focusBarRef.current);
        });
      };
      apply();
      requestAnimationFrame(apply);
      paintHud(focusCandle ?? previous);
      if (focusCandle) lastKeyRef.current = focusCandle.time;
    }
  }, [data, focusDate]);

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
      placeFocusLine(chart, focusLineRef.current, focusBarRef.current);
    });
  }, [rangeSync]);

  return (
    <div className="kline-wrap" style={height ? { height } : undefined}>
      <div className="kline-hud">
        <div className="kline-hud-row">
          <span className="kline-hud-date" ref={dateRef} />
          <span>
            开 <b ref={openRef} />
          </span>
          <span>
            高 <b ref={highRef} />
          </span>
          <span>
            低 <b ref={lowRef} />
          </span>
          <span>
            收 <b ref={closeRef} />
          </span>
          <span ref={chgRef} />
          <span ref={chgPctRef} />
          <span ref={volRef} />
        </div>
        <div className="kline-hud-row kline-hud-ma">
          <span className="ma5">
            MA5:<b ref={ma5Ref} />
          </span>
          <span className="ma10">
            MA10:<b ref={ma10Ref} />
          </span>
          <span className="ma20">
            MA20:<b ref={ma20Ref} />
          </span>
        </div>
        <div className="kline-hud-row">
          <span className="kline-hud-fill buy" ref={buyRef} />
          <span className="kline-hud-fill sell" ref={sellRef} />
        </div>
      </div>
      <div className="kline-pane" style={height ? { height } : undefined}>
        <div className="kline" ref={hostRef} style={height ? { height } : undefined} />
        <div className="chart-focus-line" ref={focusLineRef} hidden />
      </div>
    </div>
  );
}
