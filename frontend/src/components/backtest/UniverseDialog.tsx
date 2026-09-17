import { useEffect, useMemo, useState, type ClipboardEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { IconLoader2, IconPlus } from '@tabler/icons-react';
import { Dialog } from 'radix-ui';
import {
  getMarketBars,
  listUniverseIndexes,
  listUniverseStocks,
  type MarketSymbol,
  type UniverseIndex,
  type UniverseKind,
  type UniverseSelection,
} from '@/api/backtest';
import { HintTooltip } from '@/components/HintTooltip';
import '@/components/backtest/fquant-ui.css';
import { inspectOverlayStyle, parentDialogOpenChange } from '@/components/backtest/inspectLayer';
import SymbolInspectDialog from '@/components/backtest/SymbolInspectDialog';
import VirtualList from '@/components/backtest/VirtualList';
import { Button } from '@/components/ui/button';
import {
  loadBacktestRunDraft,
  saveBacktestRunDraft,
  type BacktestRunParams,
} from '@/lib/backtestRunDraft';
import {
  deleteCustomUniverse,
  loadCustomUniverses,
  looksLikeCodeList,
  nextCustomUniverseName,
  resolvePastedSymbols,
  saveCustomUniverse,
  type CustomUniverse,
} from '@/lib/customUniverses';
import { cn } from '@/lib/cn';
import { paperKlineWindow } from '@/lib/paperPicks';
import { PRIMARY_BUTTON_CLASS, PRIMARY_TAB_ACTIVE_CLASS, PRIMARY_TAB_INACTIVE_CLASS } from '@/lib/primaryButton';

const BUILTIN_TABS: { id: UniverseKind; label: string }[] = [
  { id: 'picks', label: '股票选择' },
  { id: 'index', label: '指数成分' },
  { id: 'all', label: 'A股全部' },
];

const PARAM_INPUT =
  'h-[26px] rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60';
const MONO_INPUT = `${PARAM_INPUT} font-mono`;

function isBuiltinTab(tab: string): tab is UniverseKind {
  return tab === 'picks' || tab === 'index' || tab === 'all';
}

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

function CatalogLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-md border border-border text-xs text-muted-foreground">
      <IconLoader2 className="size-5 animate-spin text-violet-500/80" aria-hidden />
      {label}
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

function InspectName({
  name,
  disabled,
  className,
  onInspect,
}: {
  name: string;
  disabled?: boolean;
  className?: string;
  onInspect: () => void;
}) {
  return (
    <button
      type="button"
      className={cn('symbol-link truncate text-left text-[13px] text-[#ff6a00] hover:text-[#ff8533]', className)}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onInspect();
      }}
    >
      {name}
    </button>
  );
}

export function UniverseDialog({
  open,
  busy,
  hideDates = false,
  title = '回测设置',
  description = '设置初始资金、回测区间与费率，并选择标的。',
  confirmLabel = '开始回测',
  confirmBusyLabel = '提交中…',
  confirmHint,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  hideDates?: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
  confirmBusyLabel?: string;
  confirmHint?: (count: number) => string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (selection: UniverseSelection, params: BacktestRunParams) => void;
}) {
  const [seed] = useState(loadBacktestRunDraft);
  const [tab, setTab] = useState(() => {
    if (seed.customPoolId && loadCustomUniverses().some((row) => row.id === seed.customPoolId)) {
      return seed.customPoolId;
    }
    return seed.tab;
  });
  const [query, setQuery] = useState('');
  const [stocks, setStocks] = useState<MarketSymbol[]>([]);
  const [indexes, setIndexes] = useState<UniverseIndex[]>([]);
  const [loadingStocks, setLoadingStocks] = useState(false);
  const [loadingIndexes, setLoadingIndexes] = useState(false);
  const [picked, setPicked] = useState<MarketSymbol[]>(seed.picked);
  const [indexCode, setIndexCode] = useState(seed.indexCode);
  const [params, setParams] = useState<BacktestRunParams>(seed.params);
  const [pools, setPools] = useState<CustomUniverse[]>(loadCustomUniverses);
  const [poolEditor, setPoolEditor] = useState<{ id?: string; name: string } | null>(null);
  const [editorPicked, setEditorPicked] = useState<MarketSymbol[]>([]);
  const [inspect, setInspect] = useState<{ code: string; name: string; kind: 'stock' | 'index' } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const nextPools = loadCustomUniverses();
    setPools(nextPools);
    setPoolEditor(null);
    setInspect(null);
    setTab((current) => {
      if (isBuiltinTab(current)) return current;
      return nextPools.some((row) => row.id === current) ? current : 'picks';
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    if (stocks.length === 0) setLoadingStocks(true);
    if (indexes.length === 0) setLoadingIndexes(true);
    listUniverseStocks()
      .then((stockItems) => {
        if (!cancelled) setStocks(stockItems);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '股票列表加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoadingStocks(false);
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
      })
      .finally(() => {
        if (!cancelled) setLoadingIndexes(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!stocks.length) return;
    const refresh = (current: MarketSymbol[]) => {
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
    };
    setPicked(refresh);
    setEditorPicked(refresh);
  }, [stocks]);

  const activePool = pools.find((row) => row.id === tab);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return stocks;
    return stocks.filter(
      (item) => item.code.toLowerCase().includes(needle) || item.name.toLowerCase().includes(needle),
    );
  }, [stocks, query]);
  const currentIndex = indexes.find((item) => item.code === indexCode);
  const confirmCount = poolEditor
    ? editorPicked.length
    : tab === 'picks'
      ? picked.length
      : tab === 'index'
        ? currentIndex?.size ?? 0
        : tab === 'all'
          ? stocks.length
          : activePool?.symbols.length ?? 0;
  const cashOk = Number(params.initial_cash) > 0;
  const rangeOk =
    hideDates || Boolean(params.start_time && params.end_time && params.start_time <= params.end_time);
  const feesOk = ratesOk(params);
  const selectionOk = poolEditor
    ? editorPicked.length > 0 && Boolean(poolEditor.name.trim())
    : tab === 'picks'
      ? picked.length > 0
      : tab === 'index'
        ? Boolean(indexCode)
        : tab === 'all'
          ? stocks.length > 0
          : Boolean(activePool?.symbols.length);
  const canConfirm = cashOk && rangeOk && feesOk && selectionOk;
  const klineRange = hideDates || !params.start_time || !params.end_time
    ? paperKlineWindow()
    : { start: params.start_time, end: params.end_time };

  function updateParam<K extends keyof BacktestRunParams>(key: K, value: BacktestRunParams[K]) {
    setParams((prev) => ({ ...prev, [key]: value }));
  }

  function setWorkingPicked(next: MarketSymbol[] | ((current: MarketSymbol[]) => MarketSymbol[])) {
    if (poolEditor) setEditorPicked(next);
    else setPicked(next);
  }

  function toggle(item: MarketSymbol) {
    setWorkingPicked((current) =>
      current.some((row) => row.code === item.code)
        ? current.filter((row) => row.code !== item.code)
        : [...current, item],
    );
  }

  function mergePicked(items: MarketSymbol[]) {
    if (!items.length) return;
    setWorkingPicked((current) => {
      const have = new Set(current.map((row) => row.code));
      const extra = items.filter((row) => !have.has(row.code));
      return extra.length ? [...current, ...extra] : current;
    });
  }

  function addFromQuery(raw: string): boolean {
    const text = raw.trim();
    if (!text) return false;
    const { matched, unknown } = resolvePastedSymbols(text, stocks);
    if (matched.length || unknown.length) {
      mergePicked(matched);
      setQuery('');
      setError(unknown.length ? `未识别：${unknown.join('、')}` : null);
      return true;
    }
    if (filtered.length === 1) {
      mergePicked([filtered[0]]);
      setQuery('');
      setError(null);
      return true;
    }
    return false;
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData('text');
    if (!looksLikeCodeList(text)) return;
    event.preventDefault();
    addFromQuery(text);
  }

  function handleQueryKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addFromQuery(query);
  }

  function switchTab(next: string) {
    setPoolEditor(null);
    setQuery('');
    setError(null);
    setTab(next);
  }

  function startCreatePool() {
    setPoolEditor({ name: nextCustomUniverseName(pools) });
    setEditorPicked([]);
    setQuery('');
    setError(null);
  }

  function renderPoolNameField() {
    if (!poolEditor) return null;
    return (
      <input
        key={poolEditor.id ?? 'new-pool'}
        autoFocus
        value={poolEditor.name}
        placeholder="股票池名称"
        disabled={busy}
        aria-label="股票池名称"
        onChange={(event) =>
          setPoolEditor((current) => (current ? { ...current, name: event.target.value } : current))
        }
        className={cn(PARAM_INPUT, 'h-7 w-[8.5rem] shrink-0')}
      />
    );
  }

  function startEditPool(pool: CustomUniverse) {
    setPoolEditor({ id: pool.id, name: pool.name });
    setEditorPicked(pool.symbols);
    setQuery('');
    setError(null);
    setTab(pool.id);
  }

  function persistPoolEditor(): CustomUniverse | null {
    if (!poolEditor) return null;
    try {
      const saved = saveCustomUniverse({
        id: poolEditor.id,
        name: poolEditor.name,
        symbols: editorPicked,
      });
      setPools(loadCustomUniverses());
      setPoolEditor(null);
      setQuery('');
      setError(null);
      setTab(saved.id);
      return saved;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '保存失败');
      return null;
    }
  }

  function handleDeletePool(id: string, event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    deleteCustomUniverse(id);
    const next = loadCustomUniverses();
    setPools(next);
    if (tab === id) setTab('picks');
    if (poolEditor?.id === id) {
      setPoolEditor(null);
      setEditorPicked([]);
    }
    setError(null);
  }

  function confirm() {
    if (!canConfirm) return;
    let nextPicked = picked;
    let nextPoolId = isBuiltinTab(tab) ? '' : tab;
    let nextPoolName = activePool?.name ?? '';
    if (poolEditor) {
      const saved = persistPoolEditor();
      if (!saved) return;
      nextPicked = saved.symbols;
      nextPoolId = saved.id;
      nextPoolName = saved.name;
    } else if (activePool) {
      nextPicked = activePool.symbols;
    }
    const usingCustom = Boolean(poolEditor) || !isBuiltinTab(tab);
    const selection: UniverseSelection = usingCustom
      ? { universe: 'picks', symbols: nextPicked.map((item) => item.code) }
      : tab === 'picks'
        ? { universe: 'picks', symbols: picked.map((item) => item.code) }
        : tab === 'index'
          ? { universe: 'index', symbols: [], index: indexCode }
          : { universe: 'all', symbols: [] };
    saveBacktestRunDraft({
      params,
      tab: usingCustom ? 'picks' : tab,
      indexCode,
      picked,
      customPoolId: usingCustom ? nextPoolId : '',
      customPoolName: usingCustom ? nextPoolName : '',
    });
    onConfirm(selection, params);
  }

  const stocksPending = loadingStocks && stocks.length === 0;
  const indexesPending = loadingIndexes && indexes.length === 0;
  const catalogPending =
    tab === 'index' && !poolEditor
      ? indexesPending
      : tab === 'all' && !poolEditor
        ? stocksPending
        : tab === 'picks' || poolEditor
          ? stocksPending
          : false;

  function requestDialogOpenChange(next: boolean) {
    const action = parentDialogOpenChange(next, Boolean(inspect), busy);
    if (action === 'open') onOpenChange(true);
    else if (action === 'close-inspect') setInspect(null);
    else if (action === 'close') onOpenChange(false);
  }

  const footerHint = catalogPending
    ? '正在加载标的…'
    : !cashOk
      ? '请填写初始资金'
      : !rangeOk
        ? '请选择有效回测区间'
        : !feesOk
          ? '费率必须为不小于 0 的数字'
          : canConfirm
            ? confirmHint?.(confirmCount) ?? `将回测 ${confirmCount} 只标的`
            : poolEditor
              ? '请选择标的'
              : tab === 'picks'
                ? '请选择标的'
                : '请选择标的';

  function renderStockPicker(list: MarketSymbol[]) {
    const codes = new Set(list.map((item) => item.code));
    return (
      <>
        <input
          autoFocus
          value={query}
          placeholder="搜索名称或代码，也可粘贴多只"
          disabled={busy || stocksPending}
          onChange={(event) => setQuery(event.target.value)}
          onPaste={handlePaste}
          onKeyDown={handleQueryKeyDown}
          className={cn(PARAM_INPUT, 'w-full')}
        />
        {list.length ? (
          <div className="flex items-start gap-2">
            <div className="flex max-h-16 min-w-0 flex-1 flex-wrap gap-1.5 overflow-auto">
              {list.map((item) => (
                <span
                  key={item.code}
                  className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-muted/40 px-2 text-[11px]"
                >
                  <InspectName name={item.name} disabled={busy} onInspect={() => setInspect({ ...item, kind: 'stock' })} />
                  <button
                    type="button"
                    className="text-muted-foreground"
                    aria-label={`移除 ${item.name}`}
                    onClick={() => toggle(item)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <button
              type="button"
              className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => setWorkingPicked([])}
            >
              清空
            </button>
          </div>
        ) : null}
        {stocksPending ? (
          <CatalogLoading label="正在加载股票…" />
        ) : filtered.length ? (
          <VirtualList
            className="min-h-[220px] max-h-[320px] overflow-auto rounded-md border border-border bg-background"
            count={filtered.length}
            itemHeight={32}
            renderItem={(index) => {
              const item = filtered[index];
              const active = codes.has(item.code);
              return (
                <div
                  key={item.code}
                  className={cn(
                    'flex h-8 w-full cursor-pointer items-center justify-between border-b border-border px-2.5 text-xs last:border-b-0',
                    active ? 'bg-primary/10' : 'hover:bg-muted',
                  )}
                  onClick={() => toggle(item)}
                >
                  <InspectName
                    name={item.name}
                    disabled={busy}
                    onInspect={() => setInspect({ code: item.code, name: item.name, kind: 'stock' })}
                  />
                  <em className="ml-2 shrink-0 font-mono text-[11px] not-italic text-muted-foreground">{item.code}</em>
                </div>
              );
            }}
          />
        ) : !error ? (
          <div className="min-h-[220px] rounded-md border border-border px-2 py-8 text-center text-xs text-muted-foreground">
            没有匹配项
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <Dialog.Root open={open} onOpenChange={requestDialogOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1200] bg-black/45 supports-backdrop-filter:backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-[1201] flex w-[min(560px,calc(100vw-32px))] max-h-[min(780px,calc(100vh-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden',
            'rounded-xl border border-border bg-background shadow-2xl',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          )}
          onPointerDownOutside={(event) => {
            if (inspect) event.preventDefault();
          }}
          onFocusOutside={(event) => {
            if (inspect) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (inspect) event.preventDefault();
          }}
        >
          <div className="flex min-h-10 shrink-0 items-center justify-between gap-3 border-b border-border px-3">
            <Dialog.Title className="text-sm font-semibold tracking-tight text-foreground">{title}</Dialog.Title>
            <Dialog.Description className="sr-only">{description}</Dialog.Description>
            <button
              type="button"
              className="inline-flex size-[22px] items-center justify-center rounded-md border border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
              onClick={() => requestDialogOpenChange(false)}
              disabled={busy && !inspect}
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
            {hideDates ? null : (
              <>
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
              </>
            )}
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

          <div className="flex shrink-0 items-center gap-2 px-3 pt-2">
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
              {BUILTIN_TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    'h-7 shrink-0 rounded-md px-2.5 text-xs transition-colors',
                    tab === item.id && !poolEditor ? PRIMARY_TAB_ACTIVE_CLASS : PRIMARY_TAB_INACTIVE_CLASS,
                  )}
                  onClick={() => switchTab(item.id)}
                >
                  {item.label}
                </button>
              ))}
              {pools.map((pool) =>
                poolEditor?.id === pool.id ? (
                  renderPoolNameField()
                ) : (
                  <button
                    key={pool.id}
                    type="button"
                    className={cn(
                      'h-7 max-w-[7.5rem] shrink-0 truncate rounded-md px-2.5 text-xs transition-colors',
                      tab === pool.id && !poolEditor ? PRIMARY_TAB_ACTIVE_CLASS : PRIMARY_TAB_INACTIVE_CLASS,
                    )}
                    onClick={() => switchTab(pool.id)}
                  >
                    {pool.name}
                  </button>
                ),
              )}
              {poolEditor && !poolEditor.id ? renderPoolNameField() : null}
              {poolEditor ? null : (
                <button
                  type="button"
                  className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                  onClick={startCreatePool}
                  disabled={busy}
                  aria-label="添加股票池"
                >
                  <IconPlus className="size-3.5" stroke={2} />
                </button>
              )}
            </div>
            {poolEditor ? (
              <div className="flex shrink-0 items-center gap-1">
                <Button type="button" variant="outline" size="xs" disabled={busy} onClick={() => setPoolEditor(null)}>
                  取消
                </Button>
                <Button
                  type="button"
                  size="xs"
                  className={PRIMARY_BUTTON_CLASS}
                  disabled={busy || stocksPending || !poolEditor.name.trim() || editorPicked.length === 0}
                  onClick={() => persistPoolEditor()}
                >
                  保存
                </Button>
              </div>
            ) : null}
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 py-2.5">
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            {poolEditor ? (
              renderStockPicker(editorPicked)
            ) : tab === 'picks' ? (
              renderStockPicker(picked)
            ) : tab === 'index' ? (
              indexesPending ? (
                <CatalogLoading label="正在加载指数…" />
              ) : (
                <div className="min-h-[220px] max-h-[320px] overflow-auto rounded-md border border-border">
                  {indexes.map((item) => (
                    <div
                      key={item.code}
                      className={cn(
                        'flex min-h-8 w-full cursor-pointer items-center justify-between border-b border-border px-2.5 last:border-b-0',
                        item.code === indexCode ? 'bg-primary/10' : 'hover:bg-muted',
                      )}
                      onClick={() => setIndexCode(item.code)}
                    >
                      <InspectName
                        name={item.name}
                        disabled={busy}
                        onInspect={() => setInspect({ code: item.code, name: item.name, kind: 'index' })}
                      />
                      <span className="ml-2 shrink-0 font-mono text-[11px] text-muted-foreground">
                        {item.size == null ? item.code : `${item.size} 只成分股`}
                      </span>
                    </div>
                  ))}
                  {!error && indexes.length === 0 ? (
                    <div className="px-2 py-8 text-center text-xs text-muted-foreground">暂无指数</div>
                  ) : null}
                </div>
              )
            ) : tab === 'all' ? (
              stocksPending ? (
                <CatalogLoading label="正在加载股票…" />
              ) : (
                <div className="space-y-2 py-3 text-sm leading-relaxed">
                  <p>{hideDates ? '覆盖全部在市 A 股' : '回测全部在市 A 股'}，共 {stocks.length} 只。</p>
                  <p className="text-xs text-muted-foreground">标的数量大时耗时会明显增加，也可能触发任务超时。</p>
                </div>
              )
            ) : activePool ? (
              <div className="flex min-h-[220px] flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">{activePool.symbols.length} 只标的</p>
                  <div className="flex gap-1">
                    <Button type="button" variant="outline" size="xs" disabled={busy} onClick={() => startEditPool(activePool)}>
                      编辑
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      disabled={busy}
                      onClick={(event) => handleDeletePool(activePool.id, event)}
                    >
                      删除
                    </Button>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
                  {activePool.symbols.map((item) => (
                    <div
                      key={item.code}
                      className="flex h-8 items-center justify-between border-b border-border px-2.5 text-xs last:border-b-0"
                    >
                      <InspectName
                        name={item.name}
                        disabled={busy}
                        onInspect={() => setInspect({ code: item.code, name: item.name, kind: 'stock' })}
                      />
                      <em className="font-mono text-[11px] not-italic text-muted-foreground">{item.code}</em>
                    </div>
                  ))}
                  {activePool.symbols.length === 0 ? (
                    <div className="px-2 py-8 text-center text-xs text-muted-foreground">这个股票池还没有标的</div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex min-h-10 shrink-0 items-center justify-between gap-3 border-t border-border px-3 py-2">
            <span className="text-xs text-muted-foreground">{footerHint}</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={busy && !inspect} onClick={() => requestDialogOpenChange(false)}>
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                className={PRIMARY_BUTTON_CLASS}
                disabled={busy || catalogPending || !canConfirm}
                onClick={confirm}
              >
                {busy ? confirmBusyLabel : confirmLabel}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
      </Dialog.Root>
      {inspect ? (
        <SymbolInspectDialog
          code={inspect.code}
          name={`${inspect.name}（${inspect.code}）`}
          startTime={klineRange.start}
          endTime={klineRange.end}
          orders={[]}
          seedPrices={[]}
          barKind={inspect.kind}
          klineOnly
          layerStyle={inspectOverlayStyle({ zIndex: 1300 })}
          loadPrices={async (code, startTime, endTime) => {
            const items = await getMarketBars(
              inspect.kind === 'index' ? [] : [code],
              startTime,
              endTime,
              inspect.kind === 'index' ? [code] : [],
            );
            return items.find((item) => item.code === code)?.series ?? [];
          }}
          onClose={() => setInspect(null)}
        />
      ) : null}
    </>
  );
}
