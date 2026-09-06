import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PositionSnapshot } from '@/api/backtest';
import { formatMetric, formatSymbolLabel, signedClass } from './format';
import { type RebalanceEvent, RebalanceTable } from './RebalanceTable';

const PAGE_SIZE = 20;

export default function PositionHoldingsDialog({
  date,
  rows,
  loading = false,
  actionsLoading = false,
  names,
  actions = [],
  orders = [],
  closeOnEscape = true,
  onClose,
  onSelectSymbol,
}: {
  date: string;
  rows: PositionSnapshot[];
  loading?: boolean;
  actionsLoading?: boolean;
  names: Record<string, string>;
  actions?: RebalanceEvent[];
  orders?: Record<string, unknown>[];
  closeOnEscape?: boolean;
  onClose: () => void;
  onSelectSymbol?: (symbol: string) => void;
}) {
  useEffect(() => {
    if (!closeOnEscape) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeOnEscape, onClose]);

  const [holdingsPage, setHoldingsPage] = useState(0);
  const [actionsPage, setActionsPage] = useState(0);
  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) => Math.abs(Number(b.market_value) || 0) - Math.abs(Number(a.market_value) || 0),
      ),
    [rows],
  );
  useEffect(() => {
    setHoldingsPage(0);
    setActionsPage(0);
  }, [date, rows.length, actions.length]);
  const holdingsPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safeHoldingsPage = Math.min(holdingsPage, holdingsPages - 1);
  const pagedHoldings = sorted.slice(safeHoldingsPage * PAGE_SIZE, safeHoldingsPage * PAGE_SIZE + PAGE_SIZE);
  const actionPages = Math.max(1, Math.ceil(actions.length / PAGE_SIZE));
  const safeActionsPage = Math.min(actionsPage, actionPages - 1);
  const pagedActions = actions.slice(safeActionsPage * PAGE_SIZE, safeActionsPage * PAGE_SIZE + PAGE_SIZE);
  const marketValue = sorted.reduce((sum, row) => sum + (Number(row.market_value) || 0), 0);
  const unrealized = sorted.reduce((sum, row) => sum + (Number(row.unrealized_pnl) || 0), 0);
  const equity = Number(sorted[0]?.equity);
  const equityText = Number.isFinite(equity) ? formatMetric(equity, 'money') : '—';

  return createPortal(
    <div className="fquant-ui modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal holdings-modal"
        role="dialog"
        aria-labelledby="holdings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div className="holdings-title-wrap">
            <strong id="holdings-title">当日明细 · {date}</strong>
            {Number.isFinite(equity) ? <span className="holdings-equity">净值 {equityText}</span> : null}
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="holdings-body">
          <section className="holdings-section holdings-section-book">
            <div className="holdings-section-title">
              收盘持仓
              <span className="holdings-section-count">{sorted.length} 只</span>
            </div>
          {loading ? (
            <div className="empty muted">正在加载持仓…</div>
          ) : sorted.length === 0 ? (
            <div className="empty muted">当日无持仓。</div>
          ) : (
            <div className="table-wrap blotter">
              <table className="blotter-table">
                <thead>
                  <tr>
                    <th>标的</th>
                    <th className="num">数量</th>
                    <th className="num">成本</th>
                    <th className="num">收盘</th>
                    <th className="num">市值</th>
                    <th className="num">浮动盈亏</th>
                    <th className="num">仓位</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedHoldings.map((row) => {
                    const weight =
                      Number.isFinite(equity) && Math.abs(equity) > 1e-8
                        ? ((Number(row.market_value) || 0) / equity) * 100
                        : null;
                    return (
                      <tr key={row.symbol}>
                        <td>
                          {onSelectSymbol ? (
                            <button
                              type="button"
                              className="symbol-link"
                              onClick={() => onSelectSymbol(row.symbol)}
                            >
                              {formatSymbolLabel(row.symbol, names)}
                            </button>
                          ) : (
                            formatSymbolLabel(row.symbol, names)
                          )}
                        </td>
                        <td className="num">{formatShares(row.quantity)}</td>
                        <td className="num">{formatMetric(row.entry_price, 'money')}</td>
                        <td className="num">{formatMetric(row.close, 'money')}</td>
                        <td className="num">{formatMetric(row.market_value, 'money')}</td>
                        <td className={`num ${signedClass(row.unrealized_pnl, true)}`}>
                          {formatMetric(row.unrealized_pnl, 'money')}
                        </td>
                        <td className="num">{formatMetric(weight, 'percent')}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td>合计 {sorted.length} 只</td>
                    <td className="num" />
                    <td className="num" />
                    <td className="num" />
                    <td className="num">{formatMetric(marketValue, 'money')}</td>
                    <td className={`num ${signedClass(unrealized, true)}`}>
                      {formatMetric(unrealized, 'money')}
                    </td>
                    <td className="num">
                      {Number.isFinite(equity) && Math.abs(equity) > 1e-8
                        ? formatMetric((marketValue / equity) * 100, 'percent')
                        : '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {sorted.length > PAGE_SIZE ? (
            <TablePager
              page={safeHoldingsPage}
              totalPages={holdingsPages}
              total={sorted.length}
              onChange={setHoldingsPage}
            />
          ) : null}
          </section>
          <section className="holdings-section holdings-section-actions">
            <div className="holdings-section-title">
              调仓动作
              <span className="holdings-section-count">{actions.length} 笔</span>
            </div>
            {actionsLoading && actions.length === 0 ? (
              <div className="empty muted">正在加载调仓动作…</div>
            ) : (
              <RebalanceTable
                rows={pagedActions}
                names={names}
                orders={orders}
                onSelectSymbol={onSelectSymbol ?? (() => undefined)}
                mode="day"
              />
            )}
            {actions.length > PAGE_SIZE ? (
              <TablePager
                page={safeActionsPage}
                totalPages={actionPages}
                total={actions.length}
                onChange={setActionsPage}
              />
            ) : null}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function TablePager({
  page,
  totalPages,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="blotter-pager holdings-pager">
      <span>共 {total} 条</span>
      <button type="button" disabled={page <= 0} onClick={() => onChange(page - 1)}>
        上一页
      </button>
      <span>
        {page + 1} / {totalPages}
      </span>
      <button type="button" disabled={page >= totalPages - 1} onClick={() => onChange(page + 1)}>
        下一页
      </button>
    </div>
  );
}

function formatShares(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (Math.abs(value - Math.round(value)) < 1e-6) {
    return Math.round(value).toLocaleString('zh-CN');
  }
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}
