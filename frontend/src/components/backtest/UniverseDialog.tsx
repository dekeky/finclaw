import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Dialog } from 'radix-ui';
import {
  listUniverseIndexes,
  listUniverseStocks,
  type MarketSymbol,
  type UniverseIndex,
  type UniverseKind,
  type UniverseSelection,
} from '@/api/backtest';
import { HintTooltip } from '@/components/HintTooltip';
import VirtualList from '@/components/backtest/VirtualList';
import { Button } from '@/components/ui/button';
import {
  loadBacktestRunDraft,
  saveBacktestRunDraft,
  type BacktestRunParams,
} from '@/lib/backtestRunDraft';
import { cn } from '@/lib/cn';
import { PRIMARY_BUTTON_CLASS, PRIMARY_TAB_ACTIVE_CLASS } from '@/lib/primaryButton';

const TABS: { id: UniverseKind; label: string }[] = [
  { id: 'picks', label: '自选股票' },
  { id: 'index', label: '指数成分' },
  { id: 'all', label: 'A股全部' },
];

const PARAM_INPUT =
  'h-[26px] rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60';
const MONO_INPUT = `${PARAM_INPUT} font-mono`;

function ParamLabel({
  label,
  title,
  hint,
  unit,
  children,
}: {
  label: string;
  title?: string;
  hint?: string;
  unit?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground" title={title}>
      <span className="shrink-0">{label}</span>
      {hint ? <HintTooltip text={hint} /> : null}
      {children}
      {unit ? <span className="shrink-0">{unit}</span> : null}
    </div>
  );
}

function ratesOk(params: BacktestRunParams): boolean {
  const rates = [
    params.commission_pct,
    params.min_commission,
    params.stamp_pct,
    params.transfer_pct,
    params.slippage_pct,
  ];
  return rates.every((value) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0;
  });
}

export function UniverseDialog({
  open,
  busy,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (selection: UniverseSelection, params: BacktestRunParams) => void;
}) {
  const [seed] = useState(loadBacktestRunDraft);
  const [tab, setTab] = useState<UniverseKind>(seed.tab);
  const [query, setQuery] = useState('');
  const [stocks, setStocks] = useState<MarketSymbol[]>([]);
  const [indexes, setIndexes] = useState<UniverseIndex[]>([]);
  const [picked, setPicked] = useState<MarketSymbol[]>(seed.picked);
  const [indexCode, setIndexCode] = useState(seed.indexCode);
  const [params, setParams] = useState<BacktestRunParams>(seed.params);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    listUniverseStocks()
      .then((stockItems) => {
        if (!cancelled) setStocks(stockItems);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '股票列表加载失败');
      });
    listUniverseIndexes()
      .then((indexItems) => {
        if (cancelled) return;
        setIndexes(indexItems);
        if (indexItems[0]) {
          setIndexCode((current) =>
            indexItems.some((item) => item.code === current) ? current : indexItems[0].code,
          );
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError((prev) => prev ?? (err instanceof Error ? err.message : '指数列表加载失败'));
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!stocks.length) return;
    setPicked((current) => {
      if (!current.length) return current;
      let changed = false;
      const next = current.map((item) => {
        const fresh = stocks.find((row) => row.code === item.code);
        if (!fresh || (fresh.name === item.name && fresh.market === item.market && fresh.kind === item.kind)) {
          return item;
        }
        changed = true;
        return fresh;
      });
      return changed ? next : current;
    });
  }, [stocks]);

  const selectedCodes = useMemo(() => new Set(picked.map((item) => item.code)), [picked]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return stocks;
    return stocks.filter(
      (item) => item.code.toLowerCase().includes(needle) || item.name.toLowerCase().includes(needle),
    );
  }, [stocks, query]);
  const currentIndex = indexes.find((item) => item.code === indexCode);
  const confirmCount =
    tab === 'picks' ? picked.length : tab === 'index' ? currentIndex?.size ?? 0 : stocks.length;
  const cashOk = Number(params.initial_cash) > 0;
  const rangeOk = Boolean(params.start_time && params.end_time && params.start_time <= params.end_time);
  const feesOk = ratesOk(params);
  const selectionOk = tab === 'picks' ? picked.length > 0 : tab === 'index' ? Boolean(indexCode) : stocks.length > 0;
  const canConfirm = cashOk && rangeOk && feesOk && selectionOk;

  function updateParam<K extends keyof BacktestRunParams>(key: K, value: BacktestRunParams[K]) {
    setParams((prev) => ({ ...prev, [key]: value }));
  }

  function toggle(item: MarketSymbol) {
    if (selectedCodes.has(item.code)) {
      setPicked((current) => current.filter((row) => row.code !== item.code));
      return;
    }
    setPicked((current) => [...current, item]);
  }

  function confirm() {
    if (!canConfirm) return;
    const selection: UniverseSelection =
      tab === 'picks'
        ? { universe: 'picks', symbols: picked.map((item) => item.code) }
        : tab === 'index'
          ? { universe: 'index', symbols: [], index: indexCode }
          : { universe: 'all', symbols: [] };
    saveBacktestRunDraft({ params, tab, indexCode, picked });
    onConfirm(selection, params);
  }

  const footerHint = !cashOk
    ? '请填写初始资金'
    : !rangeOk
      ? '请选择有效回测区间'
      : !feesOk
        ? '费率必须为不小于 0 的数字'
        : canConfirm
          ? `将回测 ${confirmCount} 只标的`
          : '请选择标的';

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && busy) return;
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1200] bg-black/45 supports-backdrop-filter:backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-[1201] flex w-[min(560px,calc(100vw-32px))] max-h-[min(780px,calc(100vh-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden',
            'rounded-xl border border-border bg-background shadow-2xl',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          )}
        >
          <div className="flex min-h-10 shrink-0 items-center justify-between gap-3 border-b border-border px-3">
            <Dialog.Title className="text-sm font-semibold tracking-tight text-foreground">回测设置</Dialog.Title>
            <Dialog.Description className="sr-only">设置初始资金、回测区间与费率，并选择标的。</Dialog.Description>
            <button
              type="button"
              className="inline-flex size-[22px] items-center justify-center rounded-md border border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
              onClick={() => onOpenChange(false)}
              disabled={busy}
              aria-label="关闭"
            >
              ×
            </button>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-x-3.5 gap-y-2 border-b border-border px-3 py-2.5">
            <ParamLabel label="初始资金">
              <input
                type="number"
                min="0"
                step="1000"
                disabled={busy}
                aria-label="初始资金"
                value={params.initial_cash}
                onChange={(e) => updateParam('initial_cash', e.target.value)}
                className={cn(MONO_INPUT, 'w-[110px]')}
              />
            </ParamLabel>
            <ParamLabel label="开始">
              <input
                type="date"
                disabled={busy}
                aria-label="开始时间"
                value={params.start_time}
                onChange={(e) => updateParam('start_time', e.target.value)}
                className={cn(PARAM_INPUT, 'w-[138px]')}
              />
            </ParamLabel>
            <ParamLabel label="结束">
              <input
                type="date"
                disabled={busy}
                aria-label="结束时间"
                value={params.end_time}
                onChange={(e) => updateParam('end_time', e.target.value)}
                className={cn(PARAM_INPUT, 'w-[138px]')}
              />
            </ParamLabel>
            <ParamLabel
              label="佣金"
              hint="按成交额百分比，买卖都收。默认 0.03%（万三），不是 3%。单笔另受最低佣金约束。"
              unit="%"
            >
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={busy}
                aria-label="佣金百分比"
                value={params.commission_pct}
                onChange={(e) => updateParam('commission_pct', e.target.value)}
                className={cn(MONO_INPUT, 'w-[72px]')}
              />
            </ParamLabel>
            <ParamLabel label="最低佣金" title="单笔佣金下限，券商常用 5 元">
              <input
                type="number"
                min="0"
                step="1"
                disabled={busy}
                aria-label="最低佣金"
                value={params.min_commission}
                onChange={(e) => updateParam('min_commission', e.target.value)}
                className={cn(MONO_INPUT, 'w-[72px]')}
              />
            </ParamLabel>
            <ParamLabel label="印花税" title="仅卖出收取，回测常用千一（现行法定千分之 0.5）" unit="%">
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={busy}
                aria-label="印花税百分比"
                value={params.stamp_pct}
                onChange={(e) => updateParam('stamp_pct', e.target.value)}
                className={cn(MONO_INPUT, 'w-[72px]')}
              />
            </ParamLabel>
            <ParamLabel label="过户费" title="中国结算过户费，买卖都收" unit="%">
              <input
                type="number"
                min="0"
                step="0.001"
                disabled={busy}
                aria-label="过户费百分比"
                value={params.transfer_pct}
                onChange={(e) => updateParam('transfer_pct', e.target.value)}
                className={cn(MONO_INPUT, 'w-[72px]')}
              />
            </ParamLabel>
            <ParamLabel
              label="滑点"
              hint="成交价相对信号价的不利偏移：买入按更高价成交，卖出按更低价成交，用来模拟冲击成本和买卖价差。默认 0.02%（万二）。"
              unit="%"
            >
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={busy}
                aria-label="滑点百分比"
                value={params.slippage_pct}
                onChange={(e) => updateParam('slippage_pct', e.target.value)}
                className={cn(MONO_INPUT, 'w-[72px]')}
              />
            </ParamLabel>
          </div>

          <div className="flex shrink-0 gap-1 px-3 pt-2">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  'h-7 rounded-md px-2.5 text-xs',
                  tab === item.id ? PRIMARY_TAB_ACTIVE_CLASS : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 py-2.5">
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            {tab === 'picks' ? (
              <>
                <input
                  autoFocus
                  value={query}
                  placeholder="搜索名称或代码"
                  disabled={busy}
                  onChange={(event) => setQuery(event.target.value)}
                  className={cn(PARAM_INPUT, 'w-full')}
                />
                {picked.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {picked.map((item) => (
                      <button
                        key={item.code}
                        type="button"
                        className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-muted/40 px-2 text-[11px]"
                        onClick={() => toggle(item)}
                      >
                        {item.name}
                        <span className="text-muted-foreground">×</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {filtered.length ? (
                  <VirtualList
                    className="min-h-[220px] max-h-[320px] overflow-auto rounded-md border border-border bg-background"
                    count={filtered.length}
                    itemHeight={32}
                    renderItem={(index) => {
                      const item = filtered[index];
                      const active = selectedCodes.has(item.code);
                      return (
                        <button
                          key={item.code}
                          type="button"
                          className={cn(
                            'flex h-8 w-full items-center justify-between border-b border-border px-2.5 text-left text-xs last:border-b-0',
                            active ? 'bg-primary/10 text-primary' : 'hover:bg-muted',
                          )}
                          onClick={() => toggle(item)}
                        >
                          <span>{item.name}</span>
                          <em className="font-mono text-[11px] not-italic text-muted-foreground">{item.code}</em>
                        </button>
                      );
                    }}
                  />
                ) : !error ? (
                  <div className="min-h-[220px] rounded-md border border-border px-2 py-8 text-center text-xs text-muted-foreground">
                    没有匹配项
                  </div>
                ) : null}
              </>
            ) : null}
            {tab === 'index' ? (
              <div className="min-h-[220px] max-h-[320px] overflow-auto rounded-md border border-border">
                {indexes.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    className={cn(
                      'flex min-h-8 w-full items-center justify-between border-b border-border px-2.5 text-left last:border-b-0',
                      item.code === indexCode ? 'bg-primary/10' : 'hover:bg-muted',
                    )}
                    onClick={() => setIndexCode(item.code)}
                  >
                    <strong className="text-sm font-medium">{item.name}</strong>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {item.size == null ? item.code : `${item.size} 只成分股`}
                    </span>
                  </button>
                ))}
                {!error && indexes.length === 0 ? (
                  <div className="px-2 py-8 text-center text-xs text-muted-foreground">暂无指数</div>
                ) : null}
              </div>
            ) : null}
            {tab === 'all' ? (
              <div className="space-y-2 py-3 text-sm leading-relaxed">
                <p>回测全部在市 A 股，共 {stocks.length} 只。</p>
                <p className="text-xs text-muted-foreground">标的数量大时耗时会明显增加，也可能触发任务超时。</p>
              </div>
            ) : null}
          </div>

          <div className="flex min-h-10 shrink-0 items-center justify-between gap-3 border-t border-border px-3 py-2">
            <span className="text-xs text-muted-foreground">{footerHint}</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                className={PRIMARY_BUTTON_CLASS}
                disabled={busy || !canConfirm}
                onClick={confirm}
              >
                {busy ? '提交中…' : '开始回测'}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
