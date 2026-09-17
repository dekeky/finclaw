import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { IconLoader2 } from '@tabler/icons-react';
import { api, type PricePoint } from '@/api/backtest';
import KLineChart from './KLineChart';
import StrategyReturnChart from './StrategyReturnChart';
import { inspectOverlayStyle } from './inspectLayer';
import {
  inspectCandleFingerprint,
  inspectPriceLoadPlan,
  inspectPriceRequestKey,
  seedCoversInspectRange,
} from './inspectPrices';
import { buildCandles } from './klineData';
import type { RebalanceEvent } from './RebalanceTable';
import { createRangeSync } from './rangeSync';
import { symbolStrategyPnl } from './symbolStats';

export default function SymbolInspectDialog({
  code,
  name,
  startTime,
  endTime,
  orders,
  rebalances = [],
  seedPrices,
  loadPrices,
  focusDate,
  initialVisibleBars,
  barKind = 'stock',
  klineOnly = false,
  layerStyle,
  onClose,
}: {
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  orders: Record<string, unknown>[];
  rebalances?: RebalanceEvent[];
  seedPrices: PricePoint[];
  loadPrices?: (code: string, startTime: string, endTime: string) => Promise<PricePoint[]>;
  focusDate?: string | null;
  initialVisibleBars?: number;
  barKind?: 'stock' | 'index';
  klineOnly?: boolean;
  layerStyle?: CSSProperties;
  onClose: () => void;
}) {
  const seedCoversRange = seedCoversInspectRange(seedPrices, startTime, endTime);
  const requestKey = inspectPriceRequestKey(code, startTime, endTime);
  const [prices, setPrices] = useState<PricePoint[]>(seedCoversRange ? seedPrices : []);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!seedCoversRange);
  const rangeSync = useMemo(() => createRangeSync(), [code]);
  const requestKeyRef = useRef('');
  const pricesRef = useRef(prices);
  const seedRef = useRef(seedPrices);
  pricesRef.current = prices;
  seedRef.current = seedPrices;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopImmediatePropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  useEffect(() => {
    const prevKey = requestKeyRef.current;
    const prevCode = prevKey.split('|')[0] ?? '';
    const plan = inspectPriceLoadPlan({
      requestKey,
      prevKey,
      codeChanged: !prevKey || prevCode !== code,
      seedCoversRange,
      hasLoadedPrices: pricesRef.current.length > 0,
    });
    requestKeyRef.current = requestKey;
    if (!plan.refetch) return;

    if (seedCoversRange) setPrices(seedRef.current);
    else if (plan.clearPrices) setPrices([]);
    setError(null);
    if (plan.showLoading) setLoading(true);

    let cancelled = false;
    const fetchPrices = loadPrices
      ? loadPrices(code, startTime, endTime)
      : api
          .getBars(
            barKind === 'index' ? [] : [code],
            startTime,
            endTime,
            barKind === 'index' ? [code] : [],
          )
          .then((payload) => payload.items.find((item) => item.code === code)?.series ?? []);
    fetchPrices
      .then((series) => {
        if (cancelled) return;
        if (series.length) setPrices(series);
      })
      .catch((err: unknown) => {
        if (!cancelled && seedRef.current.length === 0 && pricesRef.current.length === 0) {
          setError(err instanceof Error ? err.message : '行情加载失败');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [barKind, code, requestKey, startTime, endTime, loadPrices, seedCoversRange]);

  const candles = useMemo(() => buildCandles(code, prices, orders, rebalances), [code, prices, orders, rebalances]);
  const candleKey = inspectCandleFingerprint(candles);
  const stableCandles = useMemo(() => candles, [candleKey]);
  const returns = useMemo(() => symbolStrategyPnl(code, orders, prices), [code, orders, prices]);
  const alignedReturns = useMemo(() => {
    const byDay = new Map(returns.map((row) => [row.time, row.value]));
    return stableCandles.map((candle) => {
      const time = candle.time.slice(0, 10);
      return byDay.has(time) ? { time, value: byDay.get(time) } : { time };
    });
  }, [stableCandles, returns]);
  const returnKey = inspectCandleFingerprint(alignedReturns.map((row) => ({ time: row.time, close: row.value ?? 0 })));
  const stableReturns = useMemo(() => alignedReturns, [returnKey]);

  return createPortal(
    <div
      className="fquant-ui modal-backdrop inspect-layer"
      style={inspectOverlayStyle(layerStyle)}
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        className="modal symbol-inspect-modal"
        role="dialog"
        aria-labelledby="symbol-inspect-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <strong id="symbol-inspect-title">{name}</strong>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="symbol-inspect-body">
          {error ? <div className="error">{error}</div> : null}
          <div className="chart-title">
            <span>{klineOnly ? 'K 线' : 'K 线买卖点'}</span>
            {klineOnly ? null : (
              <span className="legend">
                <i className="buy" /> 买入
                <i className="sell" /> 卖出
              </span>
            )}
          </div>
          {loading ? (
            <div className="empty muted flex flex-col items-center justify-center gap-2 py-10">
              <IconLoader2 className="size-5 animate-spin text-violet-500/80" aria-hidden />
              正在加载 K 线…
            </div>
          ) : stableCandles.length ? (
            <div className="kline-block inspect-kline">
              <KLineChart
                key={`${code}-${focusDate ?? ''}-${initialVisibleBars ?? ''}`}
                data={stableCandles}
                rangeSync={rangeSync}
                focusDate={focusDate}
                initialVisibleBars={initialVisibleBars}
              />
            </div>
          ) : (
            <div className="empty muted">该标的没有价格序列。</div>
          )}
          {klineOnly ? null : (
            <>
              <div className="chart-title chart-title-sub">
                <span className="return-title">
                  <i className="strategy" />
                  个股收益额走势
                </span>
              </div>
              {loading ? (
                <div className="empty muted flex flex-col items-center justify-center gap-2 py-8">
                  <IconLoader2 className="size-5 animate-spin text-violet-500/80" aria-hidden />
                  正在加载收益曲线…
                </div>
              ) : stableReturns.some((row) => typeof row.value === 'number') ? (
                <div className="inspect-return">
                  <StrategyReturnChart
                    key={`${code}-${focusDate ?? ''}-${initialVisibleBars ?? ''}`}
                    data={stableReturns}
                    rangeSync={rangeSync}
                    focusDate={focusDate}
                    initialVisibleBars={initialVisibleBars}
                  />
                </div>
              ) : (
                <div className="empty muted">没有个股收益额序列。</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
