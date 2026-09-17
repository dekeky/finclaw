import { useEffect, useMemo, useState } from 'react';
import { getMarketBars, listMarketSymbols, runDisplayName, type PricePoint, type RunListItem } from '@/api/backtest';
import type { PaperSessionDetail } from '@/api/paper';
import '@/components/backtest/fquant-ui.css';
import EquityReturnChart from '@/components/backtest/EquityReturnChart';
import { formatDateMinute, STATUS_LABEL } from '@/components/backtest/format';
import { RebalancePane, type RebalanceEvent } from '@/components/backtest/RebalanceTable';
import { cumulativePct, toEquity } from '@/components/backtest/series';
import SymbolInspectDialog from '@/components/backtest/SymbolInspectDialog';
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

type PlazaTab = 'curve' | 'trades' | 'runs';

const TABS: { id: PlazaTab; label: string }[] = [
  { id: 'curve', label: '收益' },
  { id: 'trades', label: '成交' },
  { id: 'runs', label: '回测' },
];

export function PaperSessionView({
  session,
  runs,
  onOpenRun,
}: {
  session: PaperSessionDetail;
  runs: RunListItem[];
  onOpenRun: (runId?: string) => void;
}) {
  const [tab, setTab] = useState<PlazaTab>('curve');
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
  const sparkline = useMemo(() => equity.map((point) => point.value), [equity]);
  const pnl = Number.isFinite(session.equity) ? session.equity - session.initial_cash : null;
  const kline = paperKlineWindow(session.last_bar_date);
  const catching = session.status === 'catching_up';
  const pickCodes = useMemo(() => pickSet?.picks.map((row) => row.symbol) ?? [], [pickSet]);
  const pickKey = pickCodes.join(',');
  const inspectSeedPrices = useMemo(
    () => (session.result?.prices ?? []).filter((point) => point.symbol === inspectSymbol),
    [session.result?.prices, inspectSymbol],
  );

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
      {catching ? (
        <div className="border-b border-border/50 px-4 py-1.5 text-xs text-muted-foreground">正在追赶最新日线…</div>
      ) : null}
      {session.strategy_missing ? (
        <div className="border-b border-destructive/30 px-4 py-1.5 text-xs text-destructive">来源策略已删除</div>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-2xl px-4 py-4 pb-10">
          <HeroReturn session={session} returnPct={returnPct} pnl={pnl} sparkline={sparkline} />

          <PickPlaza
            pickSet={pickSet}
            names={names}
            quotes={quotes}
            catching={catching}
            onSelect={openSymbol}
          />

          <div className="mt-5">
            <div className="mb-3 flex rounded-lg bg-muted/60 p-0.5">
              {TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    'h-8 flex-1 rounded-md text-sm font-medium transition-colors',
                    tab === item.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                  {item.id === 'runs' && runs.length ? (
                    <span className="ml-1 text-[11px] text-muted-foreground">{runs.length}</span>
                  ) : null}
                </button>
              ))}
            </div>

            {tab === 'curve' ? (
              chart.length ? (
                <div className="fquant-ui overflow-hidden rounded-xl border border-border/70 bg-card">
                  <div className="chart chart-return !h-[240px]">
                    <EquityReturnChart data={chart} overlays={[]} />
                  </div>
                </div>
              ) : (
                <EmptyNote text={catching ? '净值正在计算' : '还没有收益曲线'} />
              )
            ) : null}

            {tab === 'trades' ? (
              rebalances.length || orders.length ? (
                <div className="fquant-ui overflow-hidden rounded-xl border border-border/70 bg-card">
                  <RebalancePane
                    rows={rebalances}
                    orders={orders}
                    names={names}
                    onSelectSymbol={(symbol) => openSymbol(symbol)}
                  />
                </div>
              ) : (
                <EmptyNote text={catching ? '成交记录同步中' : '还没有成交记录'} />
              )
            ) : null}

            {tab === 'runs' ? (
              <RunsList
                runs={runs}
                canOpen={Boolean(session.strategy_name) && !session.strategy_missing}
                onOpen={onOpenRun}
              />
            ) : null}
          </div>
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

function HeroReturn({
  session,
  returnPct,
  pnl,
  sparkline,
}: {
  session: PaperSessionDetail;
  returnPct: number;
  pnl: number | null;
  sparkline: number[];
}) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card px-5 py-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-xs text-muted-foreground">累计收益</div>
          <div className={cn('mt-1 text-[40px] leading-none font-semibold tabular-nums tracking-tight', paperSignedClass(returnPct))}>
            {formatPaperReturn(returnPct)}
          </div>
        </div>
        <PaperSparkline values={sparkline} className="mb-1 h-12 w-[132px] shrink-0" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border/60 pt-3 text-xs">
        <HeroStat label="权益" value={formatPaperMoney(session.equity)} />
        <HeroStat label="盈亏" value={formatPaperSignedMoney(pnl)} tone={pnl} />
        <HeroStat label="同步" value={session.last_bar_date || '尚未同步'} />
      </div>
    </section>
  );
}

function HeroStat({ label, value, tone }: { label: string; value: string; tone?: number | null }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className={cn('mt-0.5 text-sm font-medium tabular-nums', tone != null ? paperSignedClass(tone) : 'text-foreground')}>
        {value}
      </div>
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
    <section className="mt-4 overflow-hidden rounded-2xl border border-border/70 bg-card">
      <div className="flex items-end justify-between gap-3 px-4 pt-3.5 pb-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold">最新选股</h2>
            {pickSet?.badge ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{pickSet.badge}</span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {pickSet?.hint || (catching ? '同步完成后会显示下一交易日待买入标的' : '用当前交易日信号找待买入标的')}
          </p>
        </div>
        {pickSet?.picks.length ? (
          <span className="text-xs text-muted-foreground">{pickSet.picks.length} 只</span>
        ) : null}
      </div>
      {pickSet?.picks.length ? (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)_72px_56px] gap-2 px-4 pb-1.5 text-[11px] text-muted-foreground">
            <span>名称</span>
            <span className="text-right">现价/涨跌</span>
            <span className="text-right">操作</span>
          </div>
          <ul className="divide-y divide-border/60">
            {pickSet.picks.map((pick, index) => (
              <PickRow
                key={pick.symbol}
                rank={index + 1}
                pick={pick}
                name={names[pick.symbol]}
                quote={quotes[pick.symbol]}
                onSelect={() => onSelect(pick.symbol, pickSet.signalDay)}
              />
            ))}
          </ul>
        </>
      ) : (
        <EmptyNote
          className="border-0 py-10"
          text={catching ? '正在用当前交易日数据选股' : '暂无待买入标的'}
          hint="首次启动只看今天的信号，列出下一交易日开盘应买入的股票。"
        />
      )}
    </section>
  );
}

function PickRow({
  rank,
  pick,
  name,
  quote,
  onSelect,
}: {
  rank: number;
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
  return (
    <li>
      <button
        type="button"
        className="grid w-full grid-cols-[minmax(0,1fr)_72px_56px] items-center gap-2 px-4 py-3 text-left hover:bg-muted/40"
        onClick={onSelect}
      >
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 w-4 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{rank}</span>
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="truncate text-[15px] font-semibold leading-tight">{name || pick.symbol}</span>
              {name ? <span className="shrink-0 text-[11px] text-muted-foreground">{pick.symbol}</span> : null}
            </div>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {pick.reason || formatPaperWeight(pick.weight)}
              {pick.reason && pick.weight != null ? ` · ${formatPaperWeight(pick.weight)}` : ''}
            </p>
          </div>
        </div>
        <div className="text-right tabular-nums">
          <div className="text-sm leading-tight">{formatPaperPrice(close)}</div>
          <div className={cn('text-[11px] leading-tight', paperSignedClass(change ?? null))}>
            {change == null ? '—' : formatPaperReturn(change)}
          </div>
        </div>
        <div className={cn('text-right text-xs font-semibold', actionClass)}>{action}</div>
      </button>
    </li>
  );
}

function RunsList({
  runs,
  canOpen,
  onOpen,
}: {
  runs: RunListItem[];
  canOpen: boolean;
  onOpen: (runId?: string) => void;
}) {
  if (!runs.length) {
    return <EmptyNote text="当前策略还没有回测" hint="去量化页跑一次回测，记录会显示在这里。" />;
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
      <ul className="divide-y divide-border/60">
        {runs.slice(0, 12).map((run) => (
          <li key={run.id}>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-muted/40"
              onClick={() => onOpen(run.id)}
            >
              <span className="min-w-0 truncate text-sm">{runDisplayName(run) || formatDateMinute(run.started_at || run.created_at)}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatDateMinute(run.started_at || run.created_at)}
                <span className="ml-2">{STATUS_LABEL[run.status] ?? run.status}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {canOpen ? (
        <button
          type="button"
          className="w-full border-t border-border/60 py-2 text-center text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          onClick={() => onOpen()}
        >
          打开回测
        </button>
      ) : null}
    </div>
  );
}

function EmptyNote({ text, hint, className }: { text: string; hint?: string; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-dashed border-border/70 px-4 py-8 text-center', className)}>
      <p className="text-sm text-foreground/80">{text}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function PaperSparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return <div className={className} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const width = 132;
  const height = 48;
  const path = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * (height - 4) - 2;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  const up = values[values.length - 1] >= values[0];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden>
      <path d={path} fill="none" stroke={up ? '#e11d2e' : '#00a870'} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
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
