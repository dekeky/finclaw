import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { api, type PositionSnapshot, type PricePoint, type RunDetail } from '@/api/backtest';
import BenchmarkPicker, { type OverlayItem } from './BenchmarkPicker';
import EquityReturnChart from './EquityReturnChart';
import Hint from './Hint';
import PositionHoldingsDialog from './PositionHoldingsDialog';
import {
  dayKey,
  formatMetric,
  formatSignedPercent,
  formatSymbolLabel,
  HEAD_KPIS,
  STAT_GROUPS,
  metricClass,
  signedClass,
} from './format';
import { axisDays, cumulativePct, lastMapValue, toEquity } from './series';
import { collectSymbolStats } from './symbolStats';
import { closesToReturn } from './klineData';
import SymbolInspectDialog from './SymbolInspectDialog';
import { virtualWindow } from './VirtualList';

const EMPTY_PRICES: PricePoint[] = [];
const HS300: OverlayItem = { code: '000300', name: '沪深300', kind: 'index' };
const PNL_ROW_HEIGHT = 34;

export function RunReport({ detail }: { detail: RunDetail }) {
  const [statsOpen, setStatsOpen] = useState(false);
  const [overlays, setOverlays] = useState<OverlayItem[]>([HS300]);
  const [overlayMaps, setOverlayMaps] = useState<Record<string, Map<string, number>>>({});
  const [inspectSymbol, setInspectSymbol] = useState<string | null>(null);
  const [holdingsDate, setHoldingsDate] = useState<string | null>(null);
  const [holdingRows, setHoldingRows] = useState<PositionSnapshot[]>([]);
  const [orders, setOrders] = useState<Record<string, unknown>[]>([]);
  const [trades, setTrades] = useState<Record<string, unknown>[]>([]);
  const [boundRunId, setBoundRunId] = useState(detail.id);
  if (detail.id !== boundRunId) {
    setBoundRunId(detail.id);
    setOverlays([HS300]);
    setOverlayMaps({});
    setStatsOpen(false);
    setInspectSymbol(null);
    setHoldingsDate(null);
    setHoldingRows([]);
    setOrders([]);
    setTrades([]);
  }
  const live = detail.status === 'queued' || detail.status === 'running';
  const hasResult = Boolean(detail.result);
  const metrics = detail.result?.metrics ?? {};
  const symbols = useMemo(() => {
    const requested = detail.request.symbols ?? [];
    if (requested.length) return requested;
    return [...new Set((detail.result?.prices ?? []).map((point) => point.symbol))];
  }, [detail.request.symbols, detail.result?.prices]);
  const stats = useMemo(
    () => collectSymbolStats(symbols, trades, orders, [], detail.result?.positions),
    [symbols, trades, orders, detail.result?.positions],
  );
  const [symbolNames, setSymbolNames] = useState<Record<string, string>>({});
  const storedBenchmarks = detail.result?.benchmarks ?? [];

  useEffect(() => {
    setStatsOpen(false);
    setInspectSymbol(null);
    setHoldingsDate(null);
    setHoldingRows([]);
  }, [detail.id]);

  useEffect(() => {
    if (detail.status !== 'succeeded' || !hasResult) {
      setOrders([]);
      setTrades([]);
      return;
    }
    let cancelled = false;
    api
      .getRunBlotter(detail.id)
      .then((payload) => {
        if (cancelled) return;
        setOrders(payload.orders);
        setTrades(payload.trades);
      })
      .catch(() => {
        if (!cancelled) {
          setOrders([]);
          setTrades([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [detail.id, detail.status, hasResult]);

  useEffect(() => {
    if (!holdingsDate || detail.status !== 'succeeded') {
      setHoldingRows([]);
      return;
    }
    let cancelled = false;
    api
      .getRunPositions(detail.id, { date: holdingsDate })
      .then((payload) => {
        if (!cancelled) setHoldingRows(payload.items);
      })
      .catch(() => {
        if (!cancelled) setHoldingRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [detail.id, detail.status, holdingsDate]);

  useEffect(() => {
    const codes = [...new Set([...symbols, ...overlays.map((item) => item.code)])];
    if (!codes.length) return;
    let cancelled = false;
    api
      .listSymbols({ codes: codes.join(',') })
      .then((payload) => {
        if (cancelled) return;
        const names: Record<string, string> = {};
        for (const item of payload.items) {
          if (item.kind === 'stock' || !names[item.code]) names[item.code] = item.name;
        }
        setSymbolNames(names);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [symbols, overlays]);

  const equity = useMemo(
    () =>
      toEquity(
        (detail.result?.equity_curve && detail.result.equity_curve.length
          ? detail.result.equity_curve
          : detail.live_equity) ?? [],
      ),
    [detail.result?.equity_curve, detail.live_equity],
  );

  useEffect(() => {
    if (!overlays.length) return;
    let cancelled = false;
    const missing = overlays.filter((item) => !overlayMaps[item.code]);
    if (!missing.length) return;

    const local: Record<string, Map<string, number>> = {};
    const remote: OverlayItem[] = [];
    for (const item of missing) {
      const stored = storedBenchmarks.find((bench) => bench.code === item.code);
      if (stored) {
        local[item.code] = closesToReturn(stored.series);
        continue;
      }
      remote.push(item);
    }
    if (Object.keys(local).length) {
      setOverlayMaps((prev) => ({ ...prev, ...local }));
    }
    if (!remote.length) return;

    api
      .getBars(
        remote.filter((item) => item.kind !== 'index').map((item) => item.code),
        detail.request.start_time,
        detail.request.end_time,
        remote.filter((item) => item.kind === 'index').map((item) => item.code),
      )
      .then((payload) => {
        if (cancelled) return;
        const next: Record<string, Map<string, number>> = {};
        for (const item of payload.items) next[item.code] = closesToReturn(item.series);
        setOverlayMaps((prev) => ({ ...prev, ...next }));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
    // overlayMaps is read only to skip already-loaded codes; including it would refetch/cancel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlays, storedBenchmarks, detail.request.start_time, detail.request.end_time]);

  const series = useMemo(() => {
    const strategy = cumulativePct(equity, Number(detail.request.initial_cash));
    const overlayDayKeys = overlays.flatMap((item) => [...(overlayMaps[item.code]?.keys() ?? [])]);
    const axis = axisDays(
      detail.request.start_time,
      detail.request.end_time,
      overlayDayKeys,
      strategy.keys(),
    );
    const lastStrategy = equity.length ? equity[equity.length - 1].time : '';
    const chart = axis.map((time) => {
      const row: Record<string, string | number | undefined> = { time };
      const strategyValue = strategy.get(time);
      if (strategyValue !== undefined) row.strategy = strategyValue;
      const reached = !live || Boolean(lastStrategy && time <= lastStrategy);
      if (reached) {
        for (const item of overlays) {
          row[item.code] = overlayMaps[item.code]?.get(time);
        }
      }
      return row;
    });
    return {
      chart,
      overlayReturns: overlays.map((item) => ({
        ...item,
        value: lastMapValue(overlayMaps[item.code] ?? new Map()),
      })),
    };
  }, [equity, overlays, overlayMaps, detail.request.initial_cash, detail.request.start_time, detail.request.end_time, live]);

  function openSymbol(next: string) {
    setInspectSymbol(next);
  }

  function openHoldings(next: string) {
    const day = dayKey(next);
    if (day) setHoldingsDate(day);
  }

  const liveMessage = live
    ? equity.length
      ? `回测进行中，收益率已更新至 ${equity[equity.length - 1].time}。`
      : '回测进行中，正在计算净值…'
    : null;
  const showFull = hasResult && !live;
  const pending = !live && detail.status !== 'failed' && !hasResult;

  return (
    <div className="report">
      {detail.status === 'failed' && detail.error ? <div className="error">{detail.error.message}</div> : null}
      {liveMessage ? <div className="empty">{liveMessage}</div> : null}
      {pending ? <ReportSkeleton /> : null}

      {showFull || live ? (
        <div className={`report-split ${statsOpen && showFull ? 'open' : ''}`}>
          {showFull ? (
            <div className="kpi-grid kpi-grid-6">
              {HEAD_KPIS.map((spec) => {
                const value = metrics[spec.key];
                return (
                  <div className="kpi" key={spec.key}>
                    <div className="label">
                      {spec.label}
                      <Hint text={spec.hint} />
                    </div>
                    <div className={`value ${metricClass(value, spec)}`}>{formatMetric(value, spec.kind)}</div>
                  </div>
                );
              })}
            </div>
          ) : null}
          {showFull && !statsOpen ? (
            <div className="report-side-btns">
              <button
                type="button"
                className="kpi-detail-btn"
                title="绩效详情"
                onClick={() => setStatsOpen(true)}
              >
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                  <path fill="currentColor" d="M2 3.5h12v1.2H2zm0 4h12v1.2H2zm0 4h8v1.2H2z" />
                </svg>
                详情
              </button>
            </div>
          ) : null}

          <div className="report-rest">
            <PnlPane
              chart={series.chart}
              overlays={overlays}
              live={live}
              onAdd={(item) =>
                setOverlays((prev) => (prev.some((row) => row.code === item.code) ? prev : [...prev, item]))
              }
              onRemove={(code) => setOverlays((prev) => prev.filter((row) => row.code !== code))}
              stats={stats}
              names={symbolNames}
              initialCash={Number(detail.request.initial_cash)}
              accountPnl={Number(metrics.total_pnl)}
              accountReturnPct={Number(metrics.total_return_pct)}
              onSelectSymbol={openSymbol}
              onInspectDay={showFull ? openHoldings : undefined}
              showBlotter={showFull}
            />
          </div>

          {showFull && holdingsDate ? (
            <PositionHoldingsDialog
              date={holdingsDate}
              rows={holdingRows}
              names={symbolNames}
              closeOnEscape={!inspectSymbol}
              onClose={() => setHoldingsDate(null)}
              onSelectSymbol={openSymbol}
            />
          ) : null}

          {showFull && inspectSymbol ? (
            <SymbolInspectDialog
              code={inspectSymbol}
              name={formatSymbolLabel(inspectSymbol, symbolNames)}
              startTime={detail.request.start_time}
              endTime={detail.request.end_time}
              orders={orders}
              seedPrices={EMPTY_PRICES}
              onClose={() => setInspectSymbol(null)}
            />
          ) : null}

          {showFull && statsOpen ? (
            <aside className="stats-pane">
              <div className="stats-pane-bar">
                <button type="button" className="stats-pane-close" onClick={() => setStatsOpen(false)} aria-label="关闭">
                  ×
                </button>
              </div>
              <StatsPane metrics={metrics} overlayReturns={series.overlayReturns} />
            </aside>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default memo(RunReport);

function ReportSkeleton() {
  return (
    <div className="report-skeleton">
      <div className="kpi-grid kpi-grid-6">
        {HEAD_KPIS.map((spec) => (
          <div className="kpi" key={spec.key}>
            <div className="label">{spec.label}</div>
            <span className="skeleton-bar" />
          </div>
        ))}
      </div>
      <div className="skeleton-block" />
      <div className="skeleton-block skeleton-table" />
    </div>
  );
}

function PnlPane({
  chart,
  overlays,
  live = false,
  onAdd,
  onRemove,
  stats,
  names,
  initialCash,
  accountPnl,
  accountReturnPct,
  onSelectSymbol,
  onInspectDay,
  showBlotter = true,
}: {
  chart: Record<string, string | number | undefined>[];
  overlays: OverlayItem[];
  live?: boolean;
  onAdd: (item: OverlayItem) => void;
  onRemove: (code: string) => void;
  stats: ReturnType<typeof collectSymbolStats>;
  names: Record<string, string>;
  initialCash: number;
  accountPnl: number;
  accountReturnPct: number;
  onSelectSymbol: (symbol: string) => void;
  onInspectDay?: (day: string) => void;
  showBlotter?: boolean;
}) {
  return (
    <div className="bt-returns">
      <div className="chart-title">
        <span className="return-title">
          <i className="strategy" />
          策略收益率走势
        </span>
        <BenchmarkPicker selected={overlays} onAdd={onAdd} onRemove={onRemove} />
      </div>
      {chart.length > 0 ? (
        <div className="chart chart-return">
          <EquityReturnChart data={chart} overlays={overlays} onInspectDay={onInspectDay} />
        </div>
      ) : live ? null : (
        <div className="empty muted">没有净值序列。</div>
      )}
      {showBlotter ? (
        <div className="pnl-table">
          <SymbolPnlTable
            stats={stats}
            names={names}
            initialCash={initialCash}
            accountPnl={accountPnl}
            accountReturnPct={accountReturnPct}
            onSelectSymbol={onSelectSymbol}
          />
        </div>
      ) : null}
    </div>
  );
}

function StatsPane({
  metrics,
  overlayReturns,
}: {
  metrics: Record<string, unknown>;
  overlayReturns: { code: string; name: string; value?: number }[];
}) {
  return (
    <div className="stats-detail">
      {overlayReturns.length ? (
        <section className="metric-group wide">
          <h4>基准收益</h4>
          <dl>
            {overlayReturns.map((item) => (
              <div key={item.code}>
                <dt>{item.name}</dt>
                <dd className={signedClass(item.value, true)}>{formatSignedPercent(item.value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      {STAT_GROUPS.map((group) => (
        <section className="metric-group" key={group.title}>
          <h4>{group.title}</h4>
          <dl>
            {group.items.map((spec) => (
              <div key={spec.key}>
                <dt>
                  {spec.label}
                  <Hint text={spec.hint} />
                </dt>
                <dd className={metricClass(metrics[spec.key], spec)}>{formatMetric(metrics[spec.key], spec.kind)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

function SymbolPnlTable({
  stats,
  names,
  initialCash,
  accountPnl,
  accountReturnPct,
  onSelectSymbol,
}: {
  stats: ReturnType<typeof collectSymbolStats>;
  names: Record<string, string>;
  initialCash: number;
  accountPnl: number;
  accountReturnPct: number;
  onSelectSymbol: (symbol: string) => void;
}) {
  const [sortKey, setSortKey] = useState<PnlSortKey>('pnl');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(PNL_ROW_HEIGHT * 12);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const visible = useMemo(
    () => [...stats].sort((a, b) => compareSort(pnlSortValue(a, sortKey, names), pnlSortValue(b, sortKey, names), sortDir)),
    [stats, sortKey, sortDir, names],
  );
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => setViewport(el.clientHeight || PNL_ROW_HEIGHT * 12);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [stats.length]);
  if (stats.length === 0) return <div className="empty">没有个股数据。</div>;
  const net = stats.reduce((sum, item) => sum + item.pnl, 0);
  const trades = stats.reduce((sum, item) => sum + item.trades, 0);
  const wins = stats.reduce((sum, item) => sum + item.wins, 0);
  const losses = stats.reduce((sum, item) => sum + item.losses, 0);
  const commissionFee = stats.reduce((sum, item) => sum + item.commissionFee, 0);
  const stampTax = stats.reduce((sum, item) => sum + item.stampTax, 0);
  const transferFee = stats.reduce((sum, item) => sum + item.transferFee, 0);
  const slippageCost = stats.reduce((sum, item) => sum + item.slippageCost, 0);
  const fills = stats.reduce((sum, item) => sum + item.fills, 0);
  const footerPnl = Number.isFinite(accountPnl) ? accountPnl : net;
  const netReturn = Number.isFinite(accountReturnPct)
    ? accountReturnPct
    : initialCash > 1e-8
      ? (footerPnl / initialCash) * 100
      : null;

  function toggleSort(key: PnlSortKey, numeric?: boolean) {
    if (key === sortKey) {
      setSortDir((dir) => (dir === 'desc' ? 'asc' : 'desc'));
      return;
    }
    setSortKey(key);
    setSortDir(numeric ? 'desc' : 'asc');
  }

  return (
    <div
      className="table-wrap blotter virtual-blotter"
      ref={scrollerRef}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <table className="blotter-table">
        <thead>
          <tr>
            {PNL_COLUMNS.map((col) => (
              <th key={col.key} className={col.numeric ? 'num' : undefined}>
                <span className="th-inner">
                  <button type="button" className="sort-btn" onClick={() => toggleSort(col.key, col.numeric)}>
                    {col.label}
                    <span className={`sort-mark ${sortKey === col.key ? 'active' : ''}`}>
                      {sortKey === col.key ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
                    </span>
                  </button>
                  {col.hint ? <Hint text={col.hint} /> : null}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(() => {
            const { start, end } = virtualWindow(visible.length, scrollTop, viewport, PNL_ROW_HEIGHT);
            const rows = [];
            if (start > 0) {
              rows.push(
                <tr key="pad-top" className="virtual-pad">
                  <td colSpan={PNL_COLUMNS.length} style={{ height: start * PNL_ROW_HEIGHT }} />
                </tr>,
              );
            }
            for (let index = start; index < end; index += 1) {
              const item = visible[index];
              const winRate = item.trades ? item.wins / item.trades : null;
              rows.push(
                <tr key={item.symbol}>
                  <td>
                    <button type="button" className="symbol-link" onClick={() => onSelectSymbol(item.symbol)}>
                      {formatSymbolLabel(item.symbol, names)}
                    </button>
                  </td>
                  <td className={`num ${signedClass(item.pnl, true)}`}>{formatMetric(item.pnl, 'money')}</td>
                  <td className={`num ${signedClass(item.returnPct, true)}`}>
                    {formatMetric(item.returnPct, 'percent')}
                  </td>
                  <td className="num">{winRate === null ? '—' : formatMetric(winRate * 100, 'percent')}</td>
                  <td className="num">{formatMetric(item.wins, 'integer')}</td>
                  <td className="num">{formatMetric(item.losses, 'integer')}</td>
                  <td className="num">{formatMetric(item.commissionFee, 'money')}</td>
                  <td className="num">{formatMetric(item.stampTax, 'money')}</td>
                  <td className="num">{formatMetric(item.transferFee, 'money')}</td>
                  <td className="num">{formatMetric(item.slippageCost, 'money')}</td>
                  <td className="num">{formatMetric(item.fills, 'integer')}</td>
                </tr>,
              );
            }
            if (end < visible.length) {
              rows.push(
                <tr key="pad-bottom" className="virtual-pad">
                  <td colSpan={PNL_COLUMNS.length} style={{ height: (visible.length - end) * PNL_ROW_HEIGHT }} />
                </tr>,
              );
            }
            return rows;
          })()}
        </tbody>
        <tfoot>
          <tr>
            <td>合计 {stats.length} 只</td>
            <td className={`num ${signedClass(footerPnl, true)}`}>{formatMetric(footerPnl, 'money')}</td>
            <td className={`num ${signedClass(netReturn, true)}`}>{formatMetric(netReturn, 'percent')}</td>
            <td className="num">{trades ? formatMetric((wins / trades) * 100, 'percent') : '—'}</td>
            <td className="num">{formatMetric(wins, 'integer')}</td>
            <td className="num">{formatMetric(losses, 'integer')}</td>
            <td className="num">{formatMetric(commissionFee, 'money')}</td>
            <td className="num">{formatMetric(stampTax, 'money')}</td>
            <td className="num">{formatMetric(transferFee, 'money')}</td>
            <td className="num">{formatMetric(slippageCost, 'money')}</td>
            <td className="num">{formatMetric(fills, 'integer')}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

type PnlSortKey =
  | 'symbol'
  | 'pnl'
  | 'returnPct'
  | 'winRate'
  | 'wins'
  | 'losses'
  | 'commissionFee'
  | 'stampTax'
  | 'transferFee'
  | 'slippageCost'
  | 'fills';

const PNL_COLUMNS: { key: PnlSortKey; label: string; numeric?: boolean; hint?: string }[] = [
  { key: 'symbol', label: '标的' },
  { key: 'pnl', label: '盈亏', numeric: true, hint: '单只为已平仓净盈亏加期末浮动盈亏。合计与绩效摘要总盈亏相同：期末净值减本金。' },
  {
    key: 'returnPct',
    label: '收益率',
    numeric: true,
    hint: '单只为该股盈亏÷占用资金峰值。合计与绩效摘要累计收益率相同：期末净值÷本金−1。',
  },
  { key: 'winRate', label: '胜率', numeric: true },
  { key: 'wins', label: '盈利', numeric: true },
  { key: 'losses', label: '亏损', numeric: true },
  { key: 'commissionFee', label: '佣金', numeric: true, hint: '券商佣金，含最低佣金。' },
  { key: 'stampTax', label: '印花税', numeric: true, hint: '卖出收取。' },
  { key: 'transferFee', label: '过户费', numeric: true, hint: '买卖都收。' },
  { key: 'slippageCost', label: '滑点费', numeric: true, hint: '成交价相对未滑点价格的不利差额。' },
  { key: 'fills', label: '交易次数', numeric: true, hint: '每笔成交计一次，买入和卖出各算一次。' },
];

function pnlSortValue(
  item: ReturnType<typeof collectSymbolStats>[number],
  key: PnlSortKey,
  names: Record<string, string>,
): string | number {
  switch (key) {
    case 'symbol':
      return formatSymbolLabel(item.symbol, names);
    case 'pnl':
      return item.pnl;
    case 'returnPct':
      return item.returnPct ?? Number.NEGATIVE_INFINITY;
    case 'winRate':
      return item.trades ? item.wins / item.trades : Number.NEGATIVE_INFINITY;
    case 'wins':
      return item.wins;
    case 'losses':
      return item.losses;
    case 'commissionFee':
      return item.commissionFee;
    case 'stampTax':
      return item.stampTax;
    case 'transferFee':
      return item.transferFee;
    case 'slippageCost':
      return item.slippageCost;
    case 'fills':
      return item.fills;
  }
}

function compareSort(a: string | number, b: string | number, dir: 'asc' | 'desc'): number {
  const sign = dir === 'desc' ? -1 : 1;
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * sign;
  return String(a).localeCompare(String(b), 'zh-CN') * sign;
}
