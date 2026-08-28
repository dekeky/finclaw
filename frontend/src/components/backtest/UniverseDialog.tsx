import { useEffect, useMemo, useState } from 'react';
import { Dialog } from 'radix-ui';
import {
  listUniverseIndexes,
  listUniverseStocks,
  type MarketSymbol,
  type UniverseIndex,
  type UniverseKind,
  type UniverseSelection,
} from '@/api/backtest';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { PRIMARY_BUTTON_CLASS, PRIMARY_TAB_ACTIVE_CLASS } from '@/lib/primaryButton';

const TABS: { id: UniverseKind; label: string }[] = [
  { id: 'picks', label: '自选股票' },
  { id: 'index', label: '指数成分' },
  { id: 'all', label: 'A股全部' },
];

export function UniverseDialog({
  open,
  busy,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (selection: UniverseSelection) => void;
}) {
  const [tab, setTab] = useState<UniverseKind>('picks');
  const [query, setQuery] = useState('');
  const [stocks, setStocks] = useState<MarketSymbol[]>([]);
  const [indexes, setIndexes] = useState<UniverseIndex[]>([]);
  const [picked, setPicked] = useState<MarketSymbol[]>([]);
  const [indexCode, setIndexCode] = useState('000300');
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
  const canConfirm = tab === 'picks' ? picked.length > 0 : tab === 'index' ? Boolean(indexCode) : stocks.length > 0;

  function toggle(item: MarketSymbol) {
    if (selectedCodes.has(item.code)) {
      setPicked((current) => current.filter((row) => row.code !== item.code));
      return;
    }
    setPicked((current) => [...current, item]);
  }

  function confirm() {
    if (tab === 'picks') {
      onConfirm({ universe: 'picks', symbols: picked.map((item) => item.code) });
      return;
    }
    if (tab === 'index') {
      onConfirm({ universe: 'index', symbols: [], index: indexCode });
      return;
    }
    onConfirm({ universe: 'all', symbols: [] });
  }

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
            'fixed left-1/2 top-1/2 z-[1201] flex h-[min(36rem,86vh)] w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 flex-col',
            'rounded-xl border border-border bg-background p-5 shadow-2xl',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          )}
        >
          <Dialog.Title className="text-lg font-semibold tracking-tight text-foreground">选择回测标的</Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-muted-foreground">
            标的在提交回测时选择，不必写在策略代码里。
          </Dialog.Description>

          <div className="mt-4 flex rounded-lg bg-muted/50 p-0.5">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  'h-7 flex-1 rounded-md text-xs',
                  tab === item.id ? PRIMARY_TAB_ACTIVE_CLASS : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="mt-3 min-h-0 flex-1">
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            {tab === 'picks' ? (
              <div className="flex h-full flex-col gap-2">
                <Input
                  autoFocus
                  value={query}
                  placeholder="搜索名称或代码"
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-8 text-xs"
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
                <div className="min-h-0 flex-1 overflow-auto">
                  {filtered.map((item) => {
                    const active = selectedCodes.has(item.code);
                    return (
                      <button
                        key={item.code}
                        type="button"
                        className={cn(
                          'flex w-full items-center justify-between px-2 py-1.5 text-left text-xs',
                          active ? 'bg-primary/10 text-primary' : 'hover:bg-muted',
                        )}
                        onClick={() => toggle(item)}
                      >
                        <span>{item.name}</span>
                        <em className="font-mono text-[10px] not-italic text-muted-foreground">{item.code}</em>
                      </button>
                    );
                  })}
                  {!error && filtered.length === 0 ? (
                    <div className="px-2 py-8 text-center text-xs text-muted-foreground">没有匹配项</div>
                  ) : null}
                </div>
              </div>
            ) : null}
            {tab === 'index' ? (
              <div className="flex flex-col gap-1.5">
                {indexes.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    className={cn(
                      'flex items-center justify-between rounded-lg border px-3 py-2 text-left',
                      item.code === indexCode
                        ? 'border-primary/40 bg-primary/8'
                        : 'border-border hover:bg-muted/60',
                    )}
                    onClick={() => setIndexCode(item.code)}
                  >
                    <strong className="text-sm font-medium">{item.name}</strong>
                    <span className="text-[11px] text-muted-foreground">
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
              <div className="space-y-2 pt-3 text-sm">
                <p>回测全部在市 A 股，共 {stocks.length} 只。</p>
                <p className="text-xs text-muted-foreground">标的数量大时耗时会明显增加，也可能触发任务超时。</p>
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {canConfirm ? `将回测 ${confirmCount} 只标的` : '请选择标的'}
            </span>
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
