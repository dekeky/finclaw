import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { fetchPublicShareBars } from '@/api/agentAssets';
import { api, type PositionSnapshot, type RunDetail } from '@/api/backtest';
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
import {
  actionFillDay,
  isSuccessfulAction,
  type RebalanceEvent,
  type RejectRow,
  RebalancePane,
} from './RebalanceTable';

const HS300: OverlayItem = { code: '000300', name: '沪深300', kind: 'index' };
const PNL_PAGE_SIZE = 20;

export function RunReport({
  detail,
  active = true,
  readOnly = false,
  shareToken,
}: {
  detail: RunDetail;
  active?: boolean;
  readOnly?: boolean;
  shareToken?: string;
}) {
  const [statsOpen, setStatsOpen] = useState(false);
  const [overlays, setOverlays] = useState<OverlayItem[]>([HS300]);
  const [overlayMaps, setOverlayMaps] = useState<Record<string, Map<string, number>>>({});
  const [inspectSymbol, setInspectSymbol] = useState<string | null>(null);
  const [inspectFocusDate, setInspectFocusDate] = useState<string | null>(null);
  const [holdingsDate, setHoldingsDate] = useState<string | null>(null);
  const [holdingBook, setHoldingBook] = useState<PositionSnapshot[]>([]);
  const [orders, setOrders] = useState<Record<string, unknown>[]>([]);
  const [trades, setTrades] = useState<Record<string, unknown>[]>([]);
  const [rebalances, setRebalances] = useState<RebalanceEvent[]>([]);
  const [rejects, setRejects] = useState<RejectRow[]>([]);
  const [fillOrders, setFillOrders] = useState<Record<string, unknown>[]>([]);
  const [fillRebalances, setFillRebalances] = useState<RebalanceEvent[]>([]);
  const [fillActionDays, setFillActionDays] = useState<string[]>([]);
  const [fillsReady, setFillsReady] = useState(false);
  const [holdingsLoading, setHoldingsLoading] = useState(false);
  const [fillsLoading, setFillsLoading] = useState(false);
  const [blotterLoading, setBlotterLoading] = useState(false);
  const [blotterReady, setBlotterReady] = useState(false);
  const [logPane, setLogPane] = useState(false);
  const [boundRunId, setBoundRunId] = useState(detail.id);
  if (detail.id !== boundRunId) {
    setBoundRunId(detail.id);
    setOverlays([HS300]);
    setOverlayMaps({});
    setStatsOpen(false);
    setInspectSymbol(null);
    setInspectFocusDate(null);
    setHoldingsDate(null);
    setHoldingBook([]);
    setOrders([]);
    setTrades([]);
    setRebalances([]);
    setRejects([]);
    setFillOrders([]);
    setFillRebalances([]);
    setFillActionDays([]);
    setFillsReady(false);
    setHoldingsLoading(false);
    setFillsLoading(false);
    setBlotterLoading(false);
    setBlotterReady(false);
    setLogPane(false);
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
    () => collectSymbolStats(symbols, trades, blotterReady ? orders : fillOrders, [], detail.result?.positions),
    [symbols, trades, blotterReady, orders, fillOrders, detail.result?.positions],
  );
  const [symbolNames, setSymbolNames] = useState<Record<string, string>>({});
  const storedBenchmarks = detail.result?.benchmarks;

  useEffect(() => {
    setStatsOpen(false);
    setInspectSymbol(null);
    setInspectFocusDate(null);
    setHoldingsDate(null);
    setHoldingBook([]);
    setOrders([]);
    setTrades([]);
    setRebalances([]);
    setRejects([]);
    setFillOrders([]);
    setFillRebalances([]);
    setFillActionDays([]);
    setFillsReady(false);
    setHoldingsLoading(false);
    setFillsLoading(false);
    setBlotterLoading(false);
    setBlotterReady(false);
    setLogPane(false);
  }, [detail.id]);

  useEffect(() => {
    if (detail.status !== 'succeeded' || !hasResult) {
      setFillOrders([]);
      setFillRebalances([]);
      setFillActionDays([]);
      setFillsReady(false);
      setFillsLoading(false);
      setTrades([]);
      return;
    }
    if (readOnly) {
      const snapshotOrders = detail.result?.orders ?? [];
      const snapshotRebalances = (detail.result?.rebalances as RebalanceEvent[]) ?? [];
      setTrades(detail.result?.trades ?? []);
      setFillOrders(snapshotOrders);
      setFillActionDays(detail.result?.action_days ?? []);
      setFillRebalances(snapshotRebalances);
      setOrders(snapshotOrders);
      setRebalances(snapshotRebalances);
      setFillsReady(true);
      setBlotterReady(true);
      setFillsLoading(false);
      return;
    }
    let cancelled = false;
    setFillsLoading(true);
    api
      .getRunBlotter(detail.id, { fills: true })
      .then((payload) => {
        if (cancelled) return;
        setFillOrders(payload.orders || []);
        setFillRebalances((payload.rebalances as RebalanceEvent[]) || []);
        setFillActionDays(payload.action_days || []);
        setTrades(payload.trades || []);
        setFillsReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setFillOrders([]);
        setFillRebalances([]);
        setFillActionDays([]);
        setTrades([]);
        setFillsReady(true);
      })
      .finally(() => {
        if (!cancelled) setFillsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detail.id, detail.status, hasResult, readOnly, detail.result?.trades, detail.result?.orders, detail.result?.action_days, detail.result?.rebalances]);

  useEffect(() => {
    if (readOnly) return;
    if (detail.status !== 'succeeded' || !hasResult || !logPane || blotterReady) {
      if (detail.status !== 'succeeded' || !hasResult) {
        setOrders([]);
        setRebalances([]);
        setRejects([]);
        setBlotterLoading(false);
        setBlotterReady(false);
      }
      return;
    }
    let cancelled = false;
    setBlotterLoading(true);
    api
      .getRunBlotter(detail.id, { full: true })
      .then((payload) => {
        if (cancelled) return;
        setOrders(payload.orders || []);
        setTrades(payload.trades || []);
        setRebalances((payload.rebalances as RebalanceEvent[]) || []);
        setRejects((payload.rejects as RejectRow[]) || []);
        setBlotterReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setOrders([]);
        setRebalances([]);
        setRejects([]);
        setBlotterReady(true);
      })
      .finally(() => {
        if (!cancelled) setBlotterLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detail.id, detail.status, hasResult, logPane, blotterReady, readOnly]);

  useEffect(() => {
    if (readOnly) {
      setHoldingBook(detail.result?.holdings ?? []);
      setHoldingsLoading(false);
      return;
    }
    if (detail.status !== 'succeeded' || !hasResult) {
      setHoldingBook([]);
      setHoldingsLoading(false);
      return;
    }
    let cancelled = false;
    setHoldingsLoading(true);
    api
      .getRunPositions(detail.id)
      .then((payload) => {
        if (!cancelled) setHoldingBook(payload.items);
      })
      .catch(() => {
        if (!cancelled) setHoldingBook([]);
      })
      .finally(() => {
        if (!cancelled) setHoldingsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detail.id, detail.status, hasResult, readOnly, detail.result?.holdings]);

  useEffect(() => {
    if (readOnly) return;
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
      const stored = storedBenchmarks?.find((bench) => bench.code === item.code);
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
    if (readOnly || !detail.request.start_time || !detail.request.end_time) return;

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
  }, [overlays, storedBenchmarks, detail.request.start_time, detail.request.end_time, readOnly]);

  const series = useMemo(() => {
    const strategy = cumulativePct(equity, Number(detail.request.initial_cash));
    const lastStrategy = equity.length ? equity[equity.length - 1].time : '';
    const axis = axisDays(
      detail.request.start_time,
      detail.request.end_time,
      live ? [] : overlays.flatMap((item) => [...(overlayMaps[item.code]?.keys() ?? [])]),
      live ? [] : strategy.keys(),
    );
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

  const loadSharePrices = useCallback(
    (code: string, start: string, end: string) =>
      shareToken ? fetchPublicShareBars(shareToken, code, start, end) : Promise.resolve([]),
    [shareToken],
  );

  function openSymbol(next: string, focusDate?: string | null) {
    setInspectFocusDate(focusDate ? dayKey(focusDate) : null);
    setInspectSymbol(next);
  }

  function openHoldings(next: string) {
    const day = dayKey(next);
    if (day) setHoldingsDate(day);
  }

  const datedRebalances = useMemo(
    () =>
      rebalances
        .map((row) => {
          const fillDay = actionFillDay(row, orders);
          return fillDay && fillDay !== dayKey(row.time) ? { ...row, time: fillDay } : row;
        })
        .sort((left, right) => dayKey(left.time).localeCompare(dayKey(right.time))),
    [orders, rebalances],
  );
  const chartActions = useMemo(
    () =>
      fillRebalances
        .filter((row) => isSuccessfulAction(row, fillOrders))
        .map((row) => {
          const fillDay = actionFillDay(row, fillOrders);
          return fillDay && fillDay !== dayKey(row.time) ? { ...row, time: fillDay } : row;
        }),
    [fillOrders, fillRebalances],
  );
  const dayActions = useMemo(
    () => (holdingsDate ? chartActions.filter((row) => dayKey(row.time) === holdingsDate) : []),
    [chartActions, holdingsDate],
  );
  const actionDays = fillsReady ? fillActionDays : [];
  const holdingRows = useMemo(
    () => (holdingsDate ? holdingBook.filter((row) => dayKey(row.time) === holdingsDate) : []),
    [holdingBook, holdingsDate],
  );

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
        <div className="report-split">
          {showFull ? (
            <div className={`report-head ${statsOpen ? 'open' : ''}`}>
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
              {!statsOpen ? (
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
              ) : (
                <aside className="stats-pane">
                  <div className="stats-pane-bar">
                    <button type="button" className="stats-pane-close" onClick={() => setStatsOpen(false)} aria-label="关闭">
                      ×
                    </button>
                  </div>
                  <StatsPane metrics={metrics} overlayReturns={series.overlayReturns} />
                </aside>
              )}
            </div>
          ) : null}

          <div className="report-rest">
            <PnlPane
              key={detail.id}
              chart={series.chart}
              overlays={overlays}
              live={live}
              chartActive={active}
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
              hideBenchmarkPicker={readOnly}
              rebalances={datedRebalances}
              rejects={rejects}
              orders={orders}
              actionDays={actionDays}
              logsLoading={logPane && blotterLoading && !blotterReady}
              onOpenLogs={() => setLogPane(true)}
            />
          </div>

          {showFull && holdingsDate ? (
            <PositionHoldingsDialog
              date={holdingsDate}
              rows={holdingRows}
              loading={holdingsLoading && holdingRows.length === 0}
              actionsLoading={fillsLoading && dayActions.length === 0}
              names={symbolNames}
              actions={dayActions}
              orders={fillOrders}
              closeOnEscape={!inspectSymbol}
              onClose={() => setHoldingsDate(null)}
              onSelectSymbol={(code) => openSymbol(code, holdingsDate)}
            />
          ) : null}

          {showFull && inspectSymbol ? (
            <SymbolInspectDialog
              code={inspectSymbol}
              name={formatSymbolLabel(inspectSymbol, symbolNames)}
              startTime={detail.request.start_time}
              endTime={detail.request.end_time}
              orders={blotterReady ? orders : fillOrders}
              rebalances={blotterReady ? rebalances : fillRebalances}
              seedPrices={
                (detail.result?.prices ?? []).filter((point) => point.symbol === inspectSymbol)
              }
              loadPrices={shareToken ? loadSharePrices : undefined}
              focusDate={inspectFocusDate}
              onClose={() => {
                setInspectSymbol(null);
                setInspectFocusDate(null);
              }}
            />
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
  chartActive = true,
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
  rebalances = [],
  rejects = [],
  orders = [],
  actionDays = [],
  logsLoading = false,
  onOpenLogs,
  hideBenchmarkPicker = false,
}: {
  chart: Record<string, string | number | undefined>[];
  overlays: OverlayItem[];
  live?: boolean;
  chartActive?: boolean;
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
  rebalances?: RebalanceEvent[];
  rejects?: RejectRow[];
  orders?: Record<string, unknown>[];
  actionDays?: string[];
  logsLoading?: boolean;
  onOpenLogs?: () => void;
  hideBenchmarkPicker?: boolean;
}) {
  const [pane, setPane] = useState<'pnl' | 'rebalance'>('pnl');
  return (
    <div className="bt-returns">
      <div className="chart-title">
        <span className="return-title">
          <i className="strategy" />
          策略收益率走势
        </span>
        {hideBenchmarkPicker ? null : <BenchmarkPicker selected={overlays} onAdd={onAdd} onRemove={onRemove} />}
      </div>
      {chart.length > 0 ? (
        <div className="chart chart-return">
          <EquityReturnChart
            data={chart}
            overlays={overlays}
            onInspectDay={onInspectDay}
            actionDays={actionDays}
            active={chartActive}
          />
        </div>
      ) : live ? null : (
        <div className="empty muted">没有净值序列。</div>
      )}
      {showBlotter ? (
        <div className="pnl-table">
          <div className="analysis-tabs">
            <button type="button" className={pane === 'pnl' ? 'active' : ''} onClick={() => setPane('pnl')}>
              个股盈亏
            </button>
            <button
              type="button"
              className={pane === 'rebalance' ? 'active' : ''}
              onClick={() => {
                setPane('rebalance');
                onOpenLogs?.();
              }}
            >
              回测日志
            </button>
          </div>
          {pane === 'pnl' ? (
            <SymbolPnlTable
              stats={stats}
              names={names}
              initialCash={initialCash}
              accountPnl={accountPnl}
              accountReturnPct={accountReturnPct}
              onSelectSymbol={onSelectSymbol}
            />
          ) : null}
          {pane === 'rebalance' ? (
            logsLoading ? (
              <div className="empty muted">正在加载回测日志…</div>
            ) : (
              <RebalancePane
                rows={rebalances}
                rejects={rejects}
                orders={orders}
                names={names}
                onSelectSymbol={onSelectSymbol}
              />
            )
          ) : null}
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
  const [page, setPage] = useState(0);
  const visible = useMemo(
    () => [...stats].sort((a, b) => compareSort(pnlSortValue(a, sortKey, names), pnlSortValue(b, sortKey, names), sortDir)),
    [stats, sortKey, sortDir, names],
  );
  const totalPages = Math.max(1, Math.ceil(visible.length / PNL_PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = visible.slice(safePage * PNL_PAGE_SIZE, safePage * PNL_PAGE_SIZE + PNL_PAGE_SIZE);
  useEffect(() => {
    setPage(0);
  }, [sortKey, sortDir, stats.length]);
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
    <>
      <div className="table-wrap blotter">
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
            {pageRows.map((item) => {
              const winRate = item.trades ? item.wins / item.trades : null;
              return (
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
                </tr>
              );
            })}
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
      {visible.length > PNL_PAGE_SIZE ? (
        <div className="blotter-pager">
          <span>共 {visible.length} 条</span>
          <button type="button" disabled={safePage <= 0} onClick={() => setPage(safePage - 1)}>
            上一页
          </button>
          <label>
            第
            <input
              type="number"
              min={1}
              max={totalPages}
              value={safePage + 1}
              onChange={(event) => {
                const next = Number(event.currentTarget.value);
                if (!Number.isFinite(next)) return;
                setPage(Math.min(totalPages, Math.max(1, Math.round(next))) - 1);
              }}
            />
            / {totalPages} 页
          </label>
          <button type="button" disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)}>
            下一页
          </button>
        </div>
      ) : null}
    </>
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
