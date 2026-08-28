import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, type RunListItem, type RunRequest } from '@/api/backtest';
import { formatMetric } from './format';

const UNIVERSE_LABEL: Record<string, string> = {
  picks: '自选股票',
  index: '指数成分',
  all: 'A股全部',
};

function formatRatePct(value?: number | null): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const pct = Number(value) * 100;
  const text = pct.toFixed(4).replace(/\.?0+$/, '');
  return `${text}%`;
}

function requestOf(item: RunListItem): RunRequest {
  return {
    strategy_name: item.strategy_name,
    ...item.request,
    initial_cash: item.request?.initial_cash ?? 0,
    start_time: item.request?.start_time ?? '',
    end_time: item.request?.end_time ?? '',
  };
}

export default function RunConfigDialog({
  item,
  onClose,
}: {
  item: RunListItem;
  onClose: () => void;
}) {
  const request = requestOf(item);
  const symbols = item.symbols ?? request.symbols ?? [];
  const [indexName, setIndexName] = useState<string | null>(null);
  const [symbolNames, setSymbolNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const code = request.index?.trim();
    if (request.universe !== 'index' || !code) {
      setIndexName(null);
      return;
    }
    let cancelled = false;
    api
      .listUniverseIndexes()
      .then((payload) => {
        if (cancelled) return;
        const found = payload.items.find((row) => row.code === code);
        setIndexName(found?.name ?? null);
      })
      .catch(() => {
        if (!cancelled) setIndexName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [request.index, request.universe]);

  useEffect(() => {
    const codes = item.symbols ?? item.request?.symbols ?? [];
    if (!codes.length) {
      setSymbolNames({});
      return;
    }
    let cancelled = false;
    api
      .listUniverseStocks()
      .then((payload) => {
        if (cancelled) return;
        const names: Record<string, string> = {};
        for (const row of payload.items) names[row.code] = row.name;
        setSymbolNames(names);
      })
      .catch(() => {
        if (!cancelled) setSymbolNames({});
      });
    return () => {
      cancelled = true;
    };
  }, [item]);

  const universeText = useMemo(() => {
    const kind = request.universe || '';
    const label = UNIVERSE_LABEL[kind] ?? (kind || '—');
    if (kind === 'index' && request.index) {
      const name = indexName ? `${indexName}（${request.index}）` : request.index;
      return `${label} · ${name}`;
    }
    return label;
  }, [indexName, request.index, request.universe]);

  const rows: { label: string; value: string }[] = [
    { label: '策略', value: request.strategy_name || item.strategy_name },
    { label: '回测区间', value: `${request.start_time || '—'} 至 ${request.end_time || '—'}` },
    { label: '初始资金', value: formatMetric(request.initial_cash, 'money') },
    { label: '标的范围', value: universeText },
    { label: '标的数量', value: formatMetric(symbols.length, 'integer') },
    { label: '佣金', value: formatRatePct(request.commission_rate) },
    { label: '最低佣金', value: request.min_commission == null ? '—' : `${formatMetric(request.min_commission, 'money')} 元` },
    { label: '印花税', value: formatRatePct(request.stamp_tax_rate) },
    { label: '过户费', value: formatRatePct(request.transfer_fee_rate) },
    { label: '滑点', value: formatRatePct(request.slippage) },
    { label: '手数', value: request.lot_size == null ? '—' : String(request.lot_size) },
  ];

  return createPortal(
    <div className="fquant-ui modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal run-config-modal"
        role="dialog"
        aria-labelledby="run-config-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <strong id="run-config-title">回测配置</strong>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="run-config-body">
          <dl className="run-config-grid">
            {rows.map((row) => (
              <div key={row.label} className="run-config-row">
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
          <div className="run-config-symbols">
            <div className="run-config-symbols-head">标的列表</div>
            {symbols.length === 0 ? (
              <div className="empty muted">无标的</div>
            ) : (
              <div className="universe-chips">
                {symbols.map((code) => {
                  const name = symbolNames[code];
                  return (
                    <span key={code} className="universe-chip">
                      {name || code}
                      {name ? <em>{code}</em> : null}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
