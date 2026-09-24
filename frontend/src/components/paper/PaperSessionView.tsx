import { useEffect, useMemo, useState } from 'react';
import { getMarketBars, listMarketSymbols, runDisplayName, type PricePoint, type RunDetail, type RunListItem } from '@/api/backtest';
import type { PaperSessionDetail } from '@/api/paper';
import '@/components/backtest/fquant-ui.css';
import EquityReturnChart from '@/components/backtest/EquityReturnChart';
import { formatDateMinute, STATUS_LABEL } from '@/components/backtest/format';
import { RebalancePane, type RebalanceEvent } from '@/components/backtest/RebalanceTable';
import { RunReport } from '@/components/backtest/RunReport';
import { cumulativePct, toEquity } from '@/components/backtest/series';
import SymbolInspectDialog from '@/components/backtest/SymbolInspectDialog';
import { StrategyCodeEditor } from '@/components/StrategyCodeEditor';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/cn';
import {
  collectPaperPicks,
  formatPaperWeight,
  PAPER_KLINE_YEAR_BARS,
  paperKlineWindow,
  pickActionLabel,
  quoteFromCloses,
  quoteLookbackStart,
  type PaperPick,
  type PaperPickSet,
  type PaperQuote,
} from '@/lib/paperPicks';
import {
  formatPaperMoney,
  formatPaperPrice,
  formatPaperReturn,
  formatPaperSignedMoney,
  paperDisplayReturn,
  paperSignedClass,
} from '@/lib/paperSession';

export function PaperSessionView({
  session,
  runs,
  onOpenRun,
  selectedRun,
  script,
  emptyRunsText,
  emptyRunsHint,
  canOpenBacktest,
}: {
  session: PaperSessionDetail;
  runs: RunListItem[];
  onOpenRun: (runId?: string) => void;
  selectedRun?: RunDetail | null;
  script?: string;
  emptyRunsText?: string;
  emptyRunsHint?: string;
  canOpenBacktest?: boolean;
}) {
  const openBacktest = canOpenBacktest ?? Boolean(session.strategy_name && !session.strategy_missing);
  const [names, setNames] = useState<Record<string, string>>({});
  const [quotes, setQuotes] = useState<Record<string, PaperQuote>>({});
  const [inspectSymbol, setInspectSymbol] = useState<string | null>(null);
  const [inspectFocus, setInspectFocus] = useState<string | null>(null);

  const pickSet = useMemo(
    () => collectPaperPicks(session.result, session.last_bar_date, session.go_live),
    [session.result, session.last_bar_date, session.go_live],
  );
  const returnPct = paperDisplayReturn(session);
  const orders = session.result?.orders ?? [];
  const rebalances = (session.result?.rebalances ?? []) as RebalanceEvent[];
  const equity = useMemo(() => toEquity(session.result?.equity_curve ?? []), [session.result?.equity_curve]);
  const chart = useMemo(() => {
    const returns = cumulativePct(equity, session.initial_cash);
    return equity.map((point) => ({ time: point.time, strategy: returns.get(point.time) }));
  }, [equity, session.initial_cash]);
  const pnl = Number.isFinite(session.equity) ? session.equity - session.initial_cash : null;
  const kline = paperKlineWindow(session.last_bar_date);
  const catching = session.status === 'catching_up';
  const pickCodes = useMemo(() => pickSet?.picks.map((row) => row.symbol) ?? [], [pickSet]);
  const pickKey = pickCodes.join(',');
  const inspectSeedPrices = useMemo(
    () => (session.result?.prices ?? []).filter((point) => point.symbol === inspectSymbol),
    [session.result?.prices, inspectSymbol],
  );
  const showRuns = Boolean(selectedRun) || runs.length > 0 || Boolean(emptyRunsText);
  const showTrades = rebalances.length > 0 || orders.length > 0;

  useEffect(() => {
    const fromOrders = orders.map((row) => String(row.symbol ?? '').trim()).filter(Boolean);
    const codes = [...new Set([...pickCodes, ...fromOrders])].slice(0, 80);
    if (!codes.length) {
      setNames({});
      return;
    }
    let cancelled = false;
    listMarketSymbols({ codes: codes.join(',') })
      .then((items) => {
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const item of items) {
          if (item.kind === 'stock' || !next[item.code]) next[item.code] = item.name;
        }
        setNames(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pickKey, session.id]);

  useEffect(() => {
    const seeded = quotesFromPrices(session.result?.prices ?? [], pickCodes);
    setQuotes(seeded);
    if (!pickCodes.length) return;
    let cancelled = false;
    const end = session.last_bar_date || kline.end;
    getMarketBars(pickCodes, quoteLookbackStart(end), end)
      .then((items) => {
        if (cancelled) return;
        const next: Record<string, PaperQuote> = { ...seeded };
        for (const item of items) {
          next[item.code] = quoteFromCloses(item.series.map((point) => point.close));
        }
        setQuotes(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pickKey, session.id, session.last_bar_date]);

  function openSymbol(symbol: string, focusDate?: string) {
    setInspectFocus(focusDate || pickSet?.signalDay || session.last_bar_date || null);
    setInspectSymbol(symbol);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {session.last_error && session.status === 'failed' ? (
        <div className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive">
          {session.last_error}
        </div>
      ) : null}
      {session.strategy_missing ? (
        <div className="border-b border-destructive/30 px-4 py-1.5 text-xs text-destructive">来源策略已删除</div>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 pb-16 sm:px-6">
          <section>
            <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
              <div>
                <div className="text-xs text-muted-foreground">累计收益</div>
                <div className={cn('mt-1 text-[40px] leading-none font-semibold tabular-nums tracking-tight', paperSignedClass(returnPct))}>
                  {formatPaperReturn(returnPct)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">总资产</div>
                <div className="mt-1 text-lg font-medium tabular-nums">{formatPaperMoney(session.equity)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">盈亏</div>
                <div className={cn('mt-1 text-lg font-medium tabular-nums', paperSignedClass(pnl))}>{formatPaperSignedMoney(pnl)}</div>
              </div>
              <div className="ml-auto pb-1 text-xs tabular-nums text-muted-foreground">
                {session.last_bar_date ? `同步至 ${session.last_bar_date}` : catching ? '同步中' : '尚未同步'}
              </div>
            </div>
            {chart.length ? (
              <div className="fquant-ui mt-4 overflow-hidden rounded-xl border border-border/70 bg-card">
                <div className="chart chart-return !h-[240px] sm:!h-[280px]">
                  <EquityReturnChart data={chart} overlays={[]} />
                </div>
              </div>
            ) : (
              <p className="mt-6 text-sm text-muted-foreground">{catching ? '净值正在计算' : '还没有收益曲线'}</p>
            )}
          </section>

          <PickPlaza pickSet={pickSet} names={names} quotes={quotes} catching={catching} onSelect={openSymbol} />

          {showTrades ? (
            <section className="mt-10">
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">成交</h2>
              {rebalances.length || orders.length ? (
                <div className="fquant-ui overflow-hidden rounded-xl border border-border/70 bg-card">
                  <RebalancePane
                    rows={rebalances}
                    orders={orders}
                    names={names}
                    onSelectSymbol={(symbol) => openSymbol(symbol)}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{catching ? '成交记录同步中' : '还没有成交'}</p>
              )}
            </section>
          ) : null}

          {showRuns ? (
            <section className="mt-10">
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">回测</h2>
              {selectedRun ? (
                <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
                  <button
                    type="button"
                    className="w-full border-b border-border/60 px-5 py-2.5 text-left text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    onClick={() => onOpenRun()}
                  >
                    返回列表
                  </button>
                  <div className="fquant-ui min-h-[420px]">
                    <RunReport detail={selectedRun} readOnly />
                  </div>
                </div>
              ) : (
                <RunsList
                  runs={runs}
                  canOpen={openBacktest}
                  onOpen={onOpenRun}
                  emptyText={emptyRunsText}
                  emptyHint={emptyRunsHint}
                />
              )}
            </section>
          ) : null}

          {script != null ? (
            <section className="mt-10">
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">代码</h2>
              <div className="overflow-hidden rounded-xl border border-border/70">
                <StrategyCodeEditor value={script} readOnly className="h-[480px]" />
              </div>
            </section>
          ) : null}
        </div>
      </ScrollArea>

      {inspectSymbol ? (
        <SymbolInspectDialog
          code={inspectSymbol}
          name={names[inspectSymbol] ? `${names[inspectSymbol]}（${inspectSymbol}）` : inspectSymbol}
          startTime={kline.start}
          endTime={kline.end}
          orders={orders}
          rebalances={rebalances}
          seedPrices={inspectSeedPrices}
          focusDate={inspectFocus}
          initialVisibleBars={PAPER_KLINE_YEAR_BARS}
          onClose={() => {
            setInspectSymbol(null);
            setInspectFocus(null);
          }}
        />
      ) : null}
    </div>
  );
}

function PickPlaza({
  pickSet,
  names,
  quotes,
  catching,
  onSelect,
}: {
  pickSet: PaperPickSet | null;
  names: Record<string, string>;
  quotes: Record<string, PaperQuote>;
  catching: boolean;
  onSelect: (symbol: string, focusDate?: string) => void;
}) {
  return (
    <section className="mt-10">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">选股</h2>
        {pickSet?.badge ? <span className="text-xs text-muted-foreground/80">{pickSet.badge}</span> : null}
      </div>
      {pickSet?.picks.length ? (
        <ul className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card">
          {pickSet.picks.map((pick) => (
            <PickRow
              key={pick.symbol}
              pick={pick}
              name={names[pick.symbol]}
              quote={quotes[pick.symbol]}
              onSelect={() => onSelect(pick.symbol, pickSet.signalDay)}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{catching ? '正在选股' : '暂无选股'}</p>
      )}
    </section>
  );
}

function PickRow({
  pick,
  name,
  quote,
  onSelect,
}: {
  pick: PaperPick;
  name?: string;
  quote?: PaperQuote;
  onSelect: () => void;
}) {
  const close = quote?.close ?? pick.fillPrice;
  const change = quote?.changePct;
  const action = pickActionLabel(pick);
  const actionClass =
    pick.side === 'sell'
      ? 'text-[#00a870] dark:text-[#3dd68c]'
      : pick.side === 'hold'
        ? 'text-muted-foreground'
        : 'text-[#e11d2e] dark:text-[#ff6b6b]';
  const detail = [pick.reason, pick.weight != null ? formatPaperWeight(pick.weight) : '']
    .filter(Boolean)
    .join(' · ');
  return (
    <li>
      <button
        type="button"
        className="grid w-full grid-cols-[minmax(0,1fr)_auto_4.5rem] items-center gap-4 px-4 py-3 text-left hover:bg-muted/40 sm:px-5"
        onClick={onSelect}
      >
        <div className="min-w-0">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="truncate font-medium leading-tight">{name || pick.symbol}</span>
            {name ? <span className="shrink-0 text-xs text-muted-foreground">{pick.symbol}</span> : null}
          </div>
          {detail ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p> : null}
        </div>
        <div className="text-right tabular-nums">
          <div className="text-sm leading-tight">{formatPaperPrice(close)}</div>
          <div className={cn('text-xs leading-tight', paperSignedClass(change ?? null))}>
            {change == null ? '—' : formatPaperReturn(change)}
          </div>
        </div>
        <div className={cn('text-right text-sm font-medium', actionClass)}>{action}</div>
      </button>
    </li>
  );
}

function RunsList({
  runs,
  canOpen,
  onOpen,
  emptyText,
  emptyHint,
}: {
  runs: RunListItem[];
  canOpen: boolean;
  onOpen: (runId?: string) => void;
  emptyText?: string;
  emptyHint?: string;
}) {
  if (!runs.length) {
    return (
      <p className="text-sm text-muted-foreground">
        {emptyText || '还没有回测'}
        {emptyHint ? <span className="mt-1 block text-xs">{emptyHint}</span> : null}
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
      <ul className="divide-y divide-border/60">
        {runs.map((run) => {
          const when = formatDateMinute(run.started_at || run.created_at);
          const label = runDisplayName(run);
          return (
            <li key={run.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-muted/40"
                onClick={() => onOpen(run.id)}
              >
                <span className="min-w-0 truncate text-sm">{label || when}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {STATUS_LABEL[run.status] ?? run.status}
                  {label ? ` · ${when}` : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {canOpen ? (
        <button
          type="button"
          className="w-full border-t border-border/60 py-2.5 text-center text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          onClick={() => onOpen()}
        >
          打开回测
        </button>
      ) : null}
    </div>
  );
}

function quotesFromPrices(prices: PricePoint[], symbols: string[]): Record<string, PaperQuote> {
  if (!symbols.length || !prices.length) return {};
  const wanted = new Set(symbols);
  const closes = new Map<string, number[]>();
  for (const point of prices) {
    if (!wanted.has(point.symbol)) continue;
    const close = Number(point.close);
    if (!Number.isFinite(close)) continue;
    const rows = closes.get(point.symbol) ?? [];
    rows.push(close);
    closes.set(point.symbol, rows);
  }
  const next: Record<string, PaperQuote> = {};
  for (const [symbol, values] of closes) next[symbol] = quoteFromCloses(values);
  return next;
}
