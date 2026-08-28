import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { api, type MarketSymbol } from '@/api/backtest';
import VirtualList from './VirtualList';

export type OverlayItem = {
  code: string;
  name: string;
  kind?: 'stock' | 'index';
};

export const OVERLAY_COLORS = ['#4c9aff', '#c084fc', '#f5c542', '#38bdf8', '#fb923c', '#e879f9'];

type Tab = 'index' | 'stock';

export default function BenchmarkPicker({
  selected,
  onAdd,
  onRemove,
  defaultTab = 'index',
  options,
}: {
  selected: OverlayItem[];
  onAdd: (item: OverlayItem) => void;
  onRemove: (code: string) => void;
  defaultTab?: Tab;
  options?: OverlayItem[];
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [query, setQuery] = useState('');
  const [indexes, setIndexes] = useState<MarketSymbol[]>([]);
  const [stocks, setStocks] = useState<MarketSymbol[]>([]);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const catalog = options ?? (tab === 'index' ? indexes : stocks);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  useEffect(() => {
    if (options || !open) return;
    let cancelled = false;
    api
      .listSymbols({ kind: 'index' })
      .then((payload) => {
        if (!cancelled) setIndexes(payload.items);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '标的列表加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, [open, options]);

  useEffect(() => {
    if (options || !open || tab !== 'stock') return;
    const needle = query.trim();
    if (needle.length < 1) {
      setStocks([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api
        .listSymbols({ kind: 'stock', q: needle })
        .then((payload) => {
          if (!cancelled) {
            setError(null);
            setStocks(payload.items);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(err instanceof Error ? err.message : '标的列表加载失败');
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, tab, query, options]);

  const kinds = useMemo(() => {
    if (!options) return ['index', 'stock'] as Tab[];
    const present = new Set(catalog.map((item) => item.kind).filter((kind): kind is Tab => kind === 'index' || kind === 'stock'));
    if (!present.size) return ['index', 'stock'] as Tab[];
    return (['index', 'stock'] as Tab[]).filter((kind) => present.has(kind));
  }, [catalog, options]);
  const showTabs = kinds.length > 1;
  const activeTab = kinds.includes(tab) ? tab : kinds[0];

  const selectedCodes = useMemo(() => new Set(selected.map((item) => item.code)), [selected]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalog.filter((item) => {
      if (showTabs && item.kind && item.kind !== activeTab) return false;
      if (!needle) return true;
      return item.code.toLowerCase().includes(needle) || item.name.toLowerCase().includes(needle);
    });
  }, [catalog, query, showTabs, activeTab]);

  function toggle(item: OverlayItem) {
    if (selectedCodes.has(item.code)) {
      onRemove(item.code);
      return;
    }
    onAdd({ code: item.code, name: item.name, kind: item.kind });
  }

  return (
    <div className="bench-picker" ref={rootRef}>
      {selected.map((item, index) => (
        <span className="bench-chip" key={item.code} style={{ '--chip': OVERLAY_COLORS[index % OVERLAY_COLORS.length] } as CSSProperties}>
          <i />
          {item.name}
          <button type="button" aria-label={`移除 ${item.name}`} onClick={() => onRemove(item.code)}>
            ×
          </button>
        </span>
      ))}
      <button
        type="button"
        className={`bench-add ${open ? 'open' : ''}`}
        aria-label="添加对比"
        onClick={() => {
          setOpen((value) => !value);
          setQuery('');
        }}
      >
        +
      </button>
      {open ? (
        <div className="bench-pop">
          {showTabs ? (
            <div className="bench-pop-tabs">
              <button type="button" className={activeTab === 'index' ? 'active' : ''} onClick={() => setTab('index')}>
                大盘
              </button>
              <button type="button" className={activeTab === 'stock' ? 'active' : ''} onClick={() => setTab('stock')}>
                股票
              </button>
            </div>
          ) : null}
          <input
            autoFocus
            value={query}
            placeholder={activeTab === 'index' ? '搜索指数' : options ? '搜索交易过的股票' : '搜索股票'}
            onChange={(event) => setQuery(event.target.value)}
          />
          {error ? <div className="empty muted">{error}</div> : null}
          {filtered.length ? (
            <VirtualList
              className="bench-pop-list"
              count={filtered.length}
              itemHeight={32}
              renderItem={(index) => {
                const item = filtered[index];
                const active = selectedCodes.has(item.code);
                return (
                  <button
                    key={item.code}
                    type="button"
                    className={active ? 'active' : ''}
                    onClick={() => toggle(item)}
                  >
                    <span>{item.name}</span>
                    <em>{item.code}</em>
                  </button>
                );
              }}
            />
          ) : !error ? (
            <div className="bench-pop-list">
              <div className="empty muted">
                {!options && activeTab === 'stock' && !query.trim() ? '输入代码或名称搜索' : '没有匹配项'}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export { BenchmarkPicker };
