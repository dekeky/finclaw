import { useEffect, useRef, useState } from 'react';
import { getBacktestRun, listBacktestRuns, type RunDetail, type RunListItem } from '@/api/backtest';
import { PanelResizeHandle } from '@/components/PanelResizeHandle';
import { RunReport } from '@/components/backtest/RunReport';
import RunConfigDialog from '@/components/backtest/RunConfigDialog';
import {
  elapsedSince,
  formatDateMinute,
  formatDuration,
  STATUS_LABEL,
} from '@/components/backtest/format';
import { useHorizontalResize } from '@/hooks/useHorizontalResize';
import {
  PANEL_WIDTH_DEFAULTS,
  PANEL_WIDTH_KEYS,
  PANEL_WIDTH_LIMITS,
} from '@/lib/panelWidths';
import { useAuth } from '@/state/auth';
import './fquant-ui.css';

function isLiveStatus(status?: string | null): boolean {
  return status === 'queued' || status === 'running';
}

function runListDuration(item: RunListItem, now: number): string | null {
  if (isLiveStatus(item.status)) {
    const elapsed = elapsedSince(item.status === 'running' ? item.started_at || item.created_at : item.created_at, now);
    if (elapsed == null) return null;
    return item.status === 'queued' ? `已等待 ${formatDuration(elapsed)}` : formatDuration(elapsed);
  }
  if (item.duration_seconds != null) {
    return `耗时 ${formatDuration(item.duration_seconds)}`;
  }
  return null;
}

function placeholderRun(item: RunListItem): RunDetail {
  const request = item.request;
  return {
    id: item.id,
    status: item.status,
    created_at: item.created_at,
    updated_at: item.updated_at,
    started_at: item.started_at ?? null,
    finished_at: item.finished_at ?? null,
    duration_seconds: item.duration_seconds,
    request: {
      strategy_name: item.strategy_name,
      symbols: item.symbols ?? request?.symbols ?? [],
      initial_cash: request?.initial_cash ?? 0,
      start_time: request?.start_time ?? '',
      end_time: request?.end_time ?? '',
      universe: request?.universe,
      index: request?.index,
      commission_rate: request?.commission_rate,
      min_commission: request?.min_commission,
      stamp_tax_rate: request?.stamp_tax_rate,
      transfer_fee_rate: request?.transfer_fee_rate,
      slippage: request?.slippage,
      lot_size: request?.lot_size,
    },
  };
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none">
      <path
        d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function BacktestRunsPanel({
  refreshKey,
  focusRunId,
}: {
  refreshKey: number;
  focusRunId: string | null;
}) {
  const { user } = useAuth();
  const runResize = useHorizontalResize({
    storageKey: PANEL_WIDTH_KEYS.backtestRuns,
    defaultWidth: PANEL_WIDTH_DEFAULTS.backtestRuns,
    ...PANEL_WIDTH_LIMITS.backtestRuns,
  });
  const [items, setItems] = useState<RunListItem[]>([]);
  const [current, setCurrent] = useState<RunDetail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(focusRunId);
  const [error, setError] = useState<string | null>(null);
  const [configItem, setConfigItem] = useState<RunListItem | null>(null);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const currentRef = useRef(current);
  currentRef.current = current;
  const live = isLiveStatus(current?.status) || items.some((item) => isLiveStatus(item.status));

  useEffect(() => {
    if (focusRunId) setSelectedId(focusRunId);
  }, [focusRunId]);

  useEffect(() => {
    if (!user) {
      setItems([]);
      setCurrent(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setError(null);
    listBacktestRuns()
      .then((list) => {
        if (cancelled) return;
        setItems(list);
        const targetId =
          selectedIdRef.current ||
          list.find((item) => isLiveStatus(item.status))?.id ||
          list[0]?.id ||
          null;
        if (!targetId) {
          setCurrent(null);
          return;
        }
        if (!selectedIdRef.current) setSelectedId(targetId);
        const item = list.find((row) => row.id === targetId);
        if (item && currentRef.current?.id !== targetId) setCurrent(placeholderRun(item));
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, user]);

  useEffect(() => {
    if (!selectedId || !user) return;
    let cancelled = false;
    getBacktestRun(selectedId)
      .then((detail) => {
        if (!cancelled && selectedIdRef.current === selectedId) setCurrent(detail);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, user]);

  useEffect(() => {
    if (!live || !user) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const list = await listBacktestRuns();
          if (cancelled) return;
          setItems(list);
          const targetId = selectedIdRef.current;
          const row = list.find((item) => item.id === targetId);
          if (targetId && (Boolean(row && isLiveStatus(row.status)) || isLiveStatus(currentRef.current?.status))) {
            const detail = await getBacktestRun(targetId);
            if (!cancelled) setCurrent(detail);
          }
        } catch (err) {
          if (!cancelled) setError(err instanceof Error ? err.message : String(err));
        }
      })();
    }, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [live, user]);

  function openRun(id: string) {
    if (id === selectedId) return;
    setError(null);
    setSelectedId(id);
    const item = items.find((row) => row.id === id);
    if (item) setCurrent(placeholderRun(item));
  }

  const nowLive = items.some((item) => isLiveStatus(item.status));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!nowLive) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [nowLive]);

  return (
    <div className="fquant-ui flex min-h-0 flex-1 flex-row overflow-hidden">
      <div
        className="relative flex shrink-0 flex-col border-r"
        style={{ width: runResize.width, borderColor: 'var(--line)', background: 'var(--bg-elev)' }}
      >
        <div className="flex h-9 items-center px-2.5 text-xs" style={{ color: 'var(--muted)', borderBottom: '1px solid var(--line)' }}>
          回测记录
        </div>
        <div className="min-h-0 flex-1 overflow-auto py-1">
          {!user ? (
            <p className="empty muted">登录后查看回测记录。</p>
          ) : error ? (
            <p className="error">{error}</p>
          ) : items.length === 0 ? (
            <p className="empty">暂无回测。在策略页保存 FinClaw 策略后点击「回测」。</p>
          ) : (
            items.map((item) => {
              const duration = runListDuration(item, now);
              return (
                <div
                  key={item.id}
                  className={item.id === selectedId ? 'run-item selected' : 'run-item'}
                  onClick={() => openRun(item.id)}
                >
                  <span className={`dot ${item.status}`} />
                  <span className="run-item-body">
                    <span className="run-item-main">
                      <span className="run-item-name">{item.strategy_name}</span>
                      <span className={`run-status ${item.status}`}>{STATUS_LABEL[item.status] ?? item.status}</span>
                      {duration ? <span className="run-item-duration">{duration}</span> : null}
                    </span>
                    <span className="run-item-meta">
                      <span>{formatDateMinute(item.started_at || item.created_at)}</span>
                      <button
                        className="run-item-config"
                        type="button"
                        title="回测配置"
                        aria-label={`${item.strategy_name} 回测配置`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setConfigItem(item);
                        }}
                      >
                        <SettingsIcon />
                      </button>
                    </span>
                  </span>
                </div>
              );
            })
          )}
        </div>
        <PanelResizeHandle {...runResize.handleProps} />
      </div>
      {current ? (
        <RunReport key={current.id} detail={current} />
      ) : (
        <div className="report empty min-w-0 flex-1">选择一条回测查看报告。</div>
      )}
      {configItem ? <RunConfigDialog item={configItem} onClose={() => setConfigItem(null)} /> : null}
    </div>
  );
}
