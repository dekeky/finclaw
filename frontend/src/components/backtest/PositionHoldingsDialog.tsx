import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { PositionSnapshot } from '@/api/backtest';
import { formatMetric, formatSymbolLabel, signedClass } from './format';

export default function PositionHoldingsDialog({
  date,
  rows,
  names,
  closeOnEscape = true,
  onClose,
  onSelectSymbol,
}: {
  date: string;
  rows: PositionSnapshot[];
  names: Record<string, string>;
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

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) => Math.abs(Number(b.market_value) || 0) - Math.abs(Number(a.market_value) || 0),
      ),
    [rows],
  );
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
            <strong id="holdings-title">持仓明细 · {date}</strong>
            {Number.isFinite(equity) ? <span className="holdings-equity">净值 {equityText}</span> : null}
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="holdings-body">
          {sorted.length === 0 ? (
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
                  {sorted.map((row) => {
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
        </div>
      </div>
    </div>,
    document.body,
  );
}

function formatShares(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (Math.abs(value - Math.round(value)) < 1e-6) {
    return Math.round(value).toLocaleString('zh-CN');
  }
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}
