import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconLoader2 } from '@tabler/icons-react';
import { api, type PricePoint } from '@/api/backtest';
import KLineChart from './KLineChart';
import StrategyReturnChart from './StrategyReturnChart';
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
  onClose: () => void;
}) {
  const [prices, setPrices] = useState<PricePoint[]>(seedPrices);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(seedPrices.length === 0);
  const rangeSync = useMemo(() => createRangeSync(), [code]);

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
    setPrices(seedPrices);
    setError(null);
    setLoading(seedPrices.length === 0);
    let cancelled = false;
    const fetchPrices = loadPrices
      ? loadPrices(code, startTime, endTime)
      : api.getBars([code], startTime, endTime).then(
          (payload) => payload.items.find((item) => item.code === code)?.series ?? [],
        );
    fetchPrices
      .then((series) => {
        if (cancelled) return;
        if (series.length) setPrices(series);
      })
      .catch((err: unknown) => {
        if (!cancelled && seedPrices.length === 0) {
          setError(err instanceof Error ? err.message : '行情加载失败');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code, seedPrices, startTime, endTime, loadPrices]);

  const candles = useMemo(() => buildCandles(code, prices, orders, rebalances), [code, prices, orders, rebalances]);
  const returns = useMemo(() => symbolStrategyPnl(code, orders, prices), [code, orders, prices]);
  const alignedReturns = useMemo(() => {
    const byDay = new Map(returns.map((row) => [row.time, row.value]));
    return candles.map((candle) => {
      const time = candle.time.slice(0, 10);
      return byDay.has(time) ? { time, value: byDay.get(time) } : { time };
    });
  }, [candles, returns]);

  return createPortal(
    <div className="fquant-ui modal-backdrop inspect-layer" role="presentation" onMouseDown={onClose}>
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
            <span>K 线买卖点</span>
            <span className="legend">
              <i className="buy" /> 买入
              <i className="sell" /> 卖出
            </span>
          </div>
          {loading ? (
            <div className="empty muted flex flex-col items-center justify-center gap-2 py-10">
              <IconLoader2 className="size-5 animate-spin text-violet-500/80" aria-hidden />
              正在加载 K 线…
            </div>
          ) : candles.length ? (
            <div className="kline-block inspect-kline">
              <KLineChart key={`${code}-${focusDate ?? ''}`} data={candles} rangeSync={rangeSync} focusDate={focusDate} />
            </div>
          ) : (
            <div className="empty muted">该标的没有价格序列。</div>
          )}
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
          ) : alignedReturns.some((row) => typeof row.value === 'number') ? (
            <div className="inspect-return">
              <StrategyReturnChart
                key={`${code}-${focusDate ?? ''}`}
                data={alignedReturns}
                rangeSync={rangeSync}
                focusDate={focusDate}
              />
            </div>
          ) : (
            <div className="empty muted">没有个股收益额序列。</div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
