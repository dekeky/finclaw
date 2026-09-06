import { IconTrash } from '@tabler/icons-react';
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import {
  deleteBacktestRun,
  getBacktestRun,
  getFquantBacktestRun,
  listBacktestRuns,
  renameBacktestRun,
  runDisplayName,
  type RunDetail,
  type RunListItem,
} from '@/api/backtest';
import { PanelResizeHandle } from '@/components/PanelResizeHandle';
import { RunReport } from '@/components/backtest/RunReport';
import RunConfigDialog from '@/components/backtest/RunConfigDialog';
import SourceDialog from '@/components/backtest/SourceDialog';
import {
  elapsedBetween,
  elapsedSince,
  formatDateMinute,
  formatDuration,
  STATUS_LABEL,
} from '@/components/backtest/format';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useHorizontalResize } from '@/hooks/useHorizontalResize';
import {
  PANEL_WIDTH_DEFAULTS,
  PANEL_WIDTH_KEYS,
  PANEL_WIDTH_LIMITS,
} from '@/lib/panelWidths';
import { useAuth } from '@/state/auth';
import { toast } from 'sonner';
import {
  isLiveStatus,
  mergeLiveDetail,
  sameLiveSnapshot,
  shouldContinueLivePoll,
  shouldFetchLiveRun,
} from './liveRun';
import './fquant-ui.css';

function patchListItemFromDetail(row: RunListItem, detail: RunDetail): RunListItem {
  return {
    ...row,
    status: detail.status,
    updated_at: detail.updated_at,
    name: detail.name ?? row.name,
    started_at: detail.started_at ?? row.started_at,
    finished_at: detail.finished_at ?? row.finished_at,
    duration_seconds: detail.duration_seconds ?? row.duration_seconds,
  };
}

function finishedDurationSeconds(item: RunListItem): number | null {
  if (item.duration_seconds != null && Number.isFinite(item.duration_seconds)) {
    return item.duration_seconds;
  }
  return elapsedBetween(item.started_at || item.created_at, item.finished_at || item.updated_at);
}

function runListDuration(item: RunListItem, now: number): string | null {
  if (isLiveStatus(item.status)) {
    const elapsed = elapsedSince(item.status === 'running' ? item.started_at || item.created_at : item.created_at, now);
    if (elapsed == null) return null;
    return item.status === 'queued' ? `已等待 ${formatDuration(elapsed)}` : formatDuration(elapsed);
  }
  const seconds = finishedDurationSeconds(item);
  if (seconds == null) return null;
  return `耗时 ${formatDuration(seconds)}`;
}

function placeholderRun(item: RunListItem): RunDetail {
  const request = item.request;
  return {
    id: item.id,
    name: runDisplayName(item),
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
      extra: request?.extra,
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

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none">
      <path
        d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SourceIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none">
      <path
        d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function belongsToStrategy(item: RunListItem, strategyName: string): boolean {
  return item.strategy_name === strategyName;
}

export function BacktestRunsPanel({
  strategyName,
  refreshKey,
  focusRunId,
  active = true,
}: {
  strategyName: string;
  refreshKey: number;
  focusRunId: string | null;
  active?: boolean;
}) {
  const { user } = useAuth();
  const { confirm, dialog: confirmDialog } = useConfirm();
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
  const [sourceView, setSourceView] = useState<{ id: string; title: string; source: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const ignoreBlurRef = useRef(false);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const currentRef = useRef(current);
  currentRef.current = current;
  const strategyNameRef = useRef(strategyName);
  strategyNameRef.current = strategyName;
  const live = isLiveStatus(current?.status) || items.some((item) => isLiveStatus(item.status));
  const liveRef = useRef(live);
  liveRef.current = live;

  useEffect(() => {
    if (focusRunId) setSelectedId(focusRunId);
  }, [focusRunId]);

  useEffect(() => {
    // Re-seed from focusRunId when strategy changes (caller clears focus when switching strategies).
    setSelectedId(focusRunId);
    setCurrent(null);
    setEditingId(null);
    setConfigItem(null);
    setSourceView(null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset when strategy changes
  }, [strategyName]);

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
        const scoped = list.filter((item) => belongsToStrategy(item, strategyNameRef.current));
        setItems(scoped);
        const targetId =
          (selectedIdRef.current && scoped.some((item) => item.id === selectedIdRef.current)
            ? selectedIdRef.current
            : null) ||
          scoped.find((item) => isLiveStatus(item.status))?.id ||
          scoped[0]?.id ||
          null;
        if (!targetId) {
          setSelectedId(null);
          setCurrent(null);
          return;
        }
        if (selectedIdRef.current !== targetId) setSelectedId(targetId);
        const item = scoped.find((row) => row.id === targetId);
        if (item && currentRef.current?.id !== targetId) setCurrent(placeholderRun(item));
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, user, strategyName]);

  useEffect(() => {
    if (!selectedId || !user) return;
    let cancelled = false;
    const fetchRun = shouldFetchLiveRun(currentRef.current, selectedId)
      ? getFquantBacktestRun
      : getBacktestRun;
    fetchRun(selectedId)
      .then((detail) => {
        if (cancelled || selectedIdRef.current !== selectedId) return;
        if (detail.request?.strategy_name && detail.request.strategy_name !== strategyNameRef.current) {
          return;
        }
        setCurrent((prev) => mergeLiveDetail(prev, detail));
        setItems((list) => {
          const index = list.findIndex((row) => row.id === detail.id);
          if (index < 0) return list;
          const next = list.slice();
          next[index] = patchListItemFromDetail(list[index], detail);
          return next;
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, user, strategyName]);

  useEffect(() => {
    if (!live || !user) return;
    let cancelled = false;
    let timer = 0;
    const tick = async () => {
      const started = Date.now();
      try {
        const targetId = selectedIdRef.current;
        if (targetId && shouldFetchLiveRun(currentRef.current, targetId)) {
          const detail = await getFquantBacktestRun(targetId);
          if (cancelled) return;
          if (!sameLiveSnapshot(currentRef.current, detail)) {
            setCurrent(mergeLiveDetail(currentRef.current, detail));
          }
          setItems((list) => {
            const index = list.findIndex((row) => row.id === detail.id);
            if (index < 0) return list;
            const patched = patchListItemFromDetail(list[index], detail);
            const row = list[index];
            if (
              row.status === patched.status &&
              row.updated_at === patched.updated_at &&
              row.started_at === patched.started_at &&
              row.finished_at === patched.finished_at &&
              row.duration_seconds === patched.duration_seconds &&
              row.name === patched.name
            ) {
              return list;
            }
            const next = list.slice();
            next[index] = patched;
            return next;
          });
          if (!isLiveStatus(detail.status)) {
            void getBacktestRun(targetId)
              .then((stored) => {
                if (cancelled || selectedIdRef.current !== targetId) return;
                setCurrent(stored);
                setItems((list) => {
                  const index = list.findIndex((row) => row.id === stored.id);
                  if (index < 0) return list;
                  const next = list.slice();
                  next[index] = patchListItemFromDetail(list[index], stored);
                  return next;
                });
              })
              .catch(() => undefined);
          }
        } else {
          const list = await listBacktestRuns();
          if (cancelled) return;
          setItems(list.filter((item) => belongsToStrategy(item, strategyNameRef.current)));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (
          shouldContinueLivePoll({
            cancelled,
            currentStatus: currentRef.current?.status,
            hasLiveItems: liveRef.current,
          })
        ) {
          timer = window.setTimeout(tick, Math.max(0, 1000 - (Date.now() - started)));
        }
      }
    };
    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [live, user, strategyName]);

  function openRun(id: string) {
    if (id === selectedId) return;
    setError(null);
    setEditingId(null);
    setSelectedId(id);
    const item = items.find((row) => row.id === id);
    if (item) setCurrent(placeholderRun(item));
  }

  function openSource(item: RunListItem, event: MouseEvent) {
    event.stopPropagation();
    const title = runDisplayName(item);
    if (current?.id === item.id && current.source) {
      setSourceView({ id: item.id, title, source: current.source });
      return;
    }
    void getBacktestRun(item.id)
      .then((detail) => {
        if (!detail.source) {
          toast.error('该回测没有源码快照');
          return;
        }
        setSourceView({ id: item.id, title: runDisplayName(detail) || title, source: detail.source });
        if (selectedIdRef.current === item.id) setCurrent(detail);
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : '加载源码失败');
      });
  }

  function startRename(item: RunListItem, event?: MouseEvent) {
    event?.stopPropagation();
    ignoreBlurRef.current = false;
    if (item.id !== selectedId) openRun(item.id);
    setEditingId(item.id);
    setDraftName(runDisplayName(item));
  }

  async function commitRename(item: RunListItem) {
    if (ignoreBlurRef.current) {
      ignoreBlurRef.current = false;
      return;
    }
    const next = draftName.trim();
    const previous = runDisplayName(item);
    setEditingId(null);
    if (!next || next === previous) return;
    try {
      const updated = await renameBacktestRun(item.id, next);
      setItems((list) => list.map((row) => (row.id === item.id ? { ...row, ...updated, name: next } : row)));
      setCurrent((detail) => (detail?.id === item.id ? { ...detail, name: next } : detail));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '重命名失败');
    }
  }

  async function handleDelete(item: RunListItem, event: MouseEvent) {
    event.stopPropagation();
    if (item.status === 'running') {
      toast.error('回测进行中，结束后再删除');
      return;
    }
    const label = runDisplayName(item);
    if (!(await confirm({ title: `删除回测「${label}」`, description: '删除后无法恢复。', danger: true, confirmText: '删除' }))) {
      return;
    }
    try {
      await deleteBacktestRun(item.id);
      const remaining = items.filter((row) => row.id !== item.id);
      setItems(remaining);
      if (selectedId === item.id) {
        const next = remaining.filter((row) => belongsToStrategy(row, strategyName))[0] ?? remaining[0] ?? null;
        setSelectedId(next?.id ?? null);
        setCurrent(next ? placeholderRun(next) : null);
      }
      if (configItem?.id === item.id) setConfigItem(null);
      if (sourceView?.id === item.id) setSourceView(null);
      toast.success('已删除回测');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  }

  function onRenameKey(event: KeyboardEvent<HTMLInputElement>, item: RunListItem) {
    if (event.key === 'Enter') {
      event.preventDefault();
      ignoreBlurRef.current = false;
      void commitRename(item);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      ignoreBlurRef.current = true;
      setEditingId(null);
    }
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
        className="rail run-rail relative shrink-0"
        style={{ width: runResize.width }}
      >
        <div className="rail-list">
          {user && error && items.length > 0 ? <p className="error">{error}</p> : null}
          {!user ? (
            <p className="empty muted">登录后查看回测记录。</p>
          ) : items.length === 0 ? (
            <p className="empty">{error || '还没有回测记录。'}</p>
          ) : (
            items.map((item) => {
              const duration = runListDuration(item, now);
              const label = runDisplayName(item);
              const editing = editingId === item.id;
              return (
                <div
                  key={item.id}
                  className={item.id === selectedId ? 'run-item selected' : 'run-item'}
                  onClick={() => openRun(item.id)}
                >
                  <span className={`dot ${item.status}`} />
                  <span className="run-item-body">
                    <span className="run-item-main">
                      {editing ? (
                        <input
                          className="run-item-rename"
                          value={draftName}
                          autoFocus
                          maxLength={64}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => setDraftName(event.target.value)}
                          onBlur={() => void commitRename(item)}
                          onKeyDown={(event) => onRenameKey(event, item)}
                          aria-label="回测名称"
                        />
                      ) : (
                        <span
                          className="run-item-name"
                          title="双击重命名"
                          onDoubleClick={(event) => startRename(item, event)}
                        >
                          {label}
                        </span>
                      )}
                      <span className="run-item-name-actions">
                        <button
                          className="run-item-config"
                          type="button"
                          title="重命名"
                          aria-label={`重命名 ${label}`}
                          onClick={(event) => startRename(item, event)}
                        >
                          <PencilIcon />
                        </button>
                        <button
                          className="run-item-config"
                          type="button"
                          title="回测源码"
                          aria-label={`${label} 回测源码`}
                          onClick={(event) => openSource(item, event)}
                        >
                          <SourceIcon />
                        </button>
                        <button
                          className="run-item-config"
                          type="button"
                          title="回测配置"
                          aria-label={`${label} 回测配置`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setConfigItem(item);
                          }}
                        >
                          <SettingsIcon />
                        </button>
                        <button
                          className="run-item-config danger"
                          type="button"
                          title={item.status === 'running' ? '回测进行中，结束后再删除' : '删除'}
                          aria-label={`删除 ${label}`}
                          onClick={(event) => void handleDelete(item, event)}
                        >
                          <IconTrash size={13} stroke={1.75} />
                        </button>
                      </span>
                    </span>
                    <span className="run-item-meta">
                      <span>{formatDateMinute(item.started_at || item.created_at)}</span>
                      <span className="run-item-meta-end">
                        <span className={`run-status ${item.status}`}>{STATUS_LABEL[item.status] ?? item.status}</span>
                        {duration ? <span className="run-item-duration">{duration}</span> : null}
                      </span>
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
        <RunReport key={current.id} detail={current} active={active} />
      ) : (
        <div className="report empty min-w-0 flex-1">选择一条回测查看报告。</div>
      )}
      {configItem ? <RunConfigDialog item={configItem} onClose={() => setConfigItem(null)} /> : null}
      {sourceView ? (
        <SourceDialog
          source={sourceView.source}
          title={sourceView.title}
          onClose={() => setSourceView(null)}
        />
      ) : null}
      {confirmDialog}
    </div>
  );
}
