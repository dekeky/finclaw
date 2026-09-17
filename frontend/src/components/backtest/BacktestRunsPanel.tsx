import { IconPlayerStop, IconTrash } from '@tabler/icons-react';
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  cancelBacktestRun,
  deleteBacktestRun,
  getBacktestRun,
  getFquantBacktestRun,
  listBacktestRuns,
  renameBacktestRun,
  runDisplayName,
  type RunDetail,
  type RunListItem,
} from '@/api/backtest';
import { runBelongsToStrategy, runConflictsWithStrategy } from '@/lib/backtestStrategy';
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
import { saveBacktestViewState } from '@/lib/backtestViewState';
import { withReturnTo } from '@/lib/navigationReturn';
import { createPaperSession, listPaperSessions, type PaperSession } from '@/api/paper';
import { Button } from '@/components/ui/button';
import { PRIMARY_BUTTON_CLASS } from '@/lib/primaryButton';
import { useAuth } from '@/state/auth';
import { toast } from 'sonner';
import {
  isLiveStatus,
  mergeLiveDetail,
  recalledRunDetail,
  rememberRunDetail,
  sameLiveSnapshot,
  seedCurrentRun,
  shouldContinueLivePoll,
  shouldFetchLiveRun,
  shouldSkipStoredRefetch,
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

export function BacktestRunsPanel({
  strategyId,
  strategyName,
  strategyPlatform,
  refreshKey,
  focusRunId,
  active = true,
}: {
  strategyId?: string;
  strategyName: string;
  strategyPlatform?: string;
  refreshKey: number;
  focusRunId: string | null;
  active?: boolean;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const runResize = useHorizontalResize({
    storageKey: PANEL_WIDTH_KEYS.backtestRuns,
    defaultWidth: PANEL_WIDTH_DEFAULTS.backtestRuns,
    ...PANEL_WIDTH_LIMITS.backtestRuns,
  });
  const [items, setItems] = useState<RunListItem[]>([]);
  const [current, setCurrent] = useState<RunDetail | null>(() => recalledRunDetail(focusRunId));
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
  const strategyIdRef = useRef(strategyId);
  strategyIdRef.current = strategyId;
  const strategyRef = () => ({ id: strategyIdRef.current, name: strategyNameRef.current });
  const belongs = (item: RunListItem) => runBelongsToStrategy(item, strategyRef());
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const live = isLiveStatus(current?.status) || items.some((item) => isLiveStatus(item.status));
  const liveRef = useRef(live);
  liveRef.current = live;
  const [paperSessions, setPaperSessions] = useState<PaperSession[]>([]);
  const [paperBusy, setPaperBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);

  useEffect(() => {
    if (!user || !strategyName) {
      setPaperSessions([]);
      return;
    }
    let cancelled = false;
    listPaperSessions({ strategy_name: strategyName, strategy_id: strategyId })
      .then((rows) => {
        if (!cancelled) setPaperSessions(rows);
      })
      .catch(() => {
        if (!cancelled) setPaperSessions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user, strategyName, strategyId, refreshKey]);

  function commitCurrent(detail: RunDetail | null) {
    const next = detail ? rememberRunDetail(detail) : null;
    setCurrent(next);
    return next;
  }

  useEffect(() => {
    if (focusRunId) setSelectedId(focusRunId);
  }, [focusRunId]);

  useEffect(() => {
    if (selectedId) saveBacktestViewState({ selectedRunId: selectedId });
  }, [selectedId]);

  useEffect(() => {
    // Re-seed from focusRunId when strategy changes (caller clears focus when switching strategies).
    setSelectedId(focusRunId);
    commitCurrent(focusRunId ? recalledRunDetail(focusRunId) : null);
    setEditingId(null);
    setConfigItem(null);
    setSourceView(null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset when strategy changes
  }, [strategyId, strategyName]);

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
        const scoped = list.filter((item) => belongs(item));
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
        const seeded = seedCurrentRun({
          selectedId: targetId,
          current: currentRef.current,
          item,
        });
        if (seeded && currentRef.current !== seeded) commitCurrent(seeded);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, user, strategyId, strategyName]);

  useEffect(() => {
    if (!selectedId || !user) return;
    const listed = itemsRef.current.find((row) => row.id === selectedId);
    const seeded = seedCurrentRun({
      selectedId,
      current: currentRef.current,
      item: listed,
    });
    if (seeded && currentRef.current !== seeded) commitCurrent(seeded);
    if (shouldSkipStoredRefetch(seeded, listed?.status)) return;
    let cancelled = false;
    const fetchRun = shouldFetchLiveRun(seeded, selectedId, listed?.status)
      ? getFquantBacktestRun
      : getBacktestRun;
    fetchRun(selectedId)
      .then((detail) => {
        if (cancelled || selectedIdRef.current !== selectedId) return;
        if (runConflictsWithStrategy(detail.request, strategyRef())) {
          return;
        }
        commitCurrent(mergeLiveDetail(currentRef.current, detail));
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
  }, [selectedId, user, strategyId, strategyName]);

  useEffect(() => {
    if (!live || !user || !active) return;
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
            commitCurrent(mergeLiveDetail(currentRef.current, detail));
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
                commitCurrent(mergeLiveDetail(currentRef.current, stored));
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
          setItems(list.filter((item) => belongs(item)));
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
  }, [live, user, strategyId, strategyName, active]);

  function openRun(id: string) {
    if (id === selectedId) return;
    setError(null);
    setEditingId(null);
    setSelectedId(id);
    const item = items.find((row) => row.id === id);
    commitCurrent(
      seedCurrentRun({
        selectedId: id,
        current: currentRef.current?.id === id ? currentRef.current : null,
        item,
      }),
    );
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
        if (selectedIdRef.current === item.id) commitCurrent(mergeLiveDetail(currentRef.current, detail));
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
      setCurrent((detail) => {
        if (detail?.id !== item.id) return detail;
        return rememberRunDetail({ ...detail, name: next });
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '重命名失败');
    }
  }

  async function handleStartPaper() {
    if (!current || current.status !== 'succeeded' || paperBusy) return;
    if (strategyPlatform && strategyPlatform !== 'finclaw') {
      toast.error('仅 FinClaw 策略可开启实盘模拟');
      return;
    }
    setPaperBusy(true);
    try {
      const session = await createPaperSession({
        strategy_name: strategyName,
        strategy_id: strategyId,
        from_run_id: current.id,
      });
      toast.success('已开启实盘模拟');
      navigate(`/paper/${session.id}`, { state: withReturnTo('/backtest') });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '开启实盘模拟失败');
    } finally {
      setPaperBusy(false);
    }
  }

  async function handleCancel() {
    const run = currentRef.current;
    if (!run || !isLiveStatus(run.status) || cancelBusy) return;
    setCancelBusy(true);
    try {
      const detail = await cancelBacktestRun(run.id);
      const next = commitCurrent(mergeLiveDetail(currentRef.current, detail));
      if (next) {
        setItems((rows) =>
          rows.map((row) => (row.id === next.id ? patchListItemFromDetail(row, next) : row)),
        );
      }
      toast.success('已中断回测');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '中断失败');
    } finally {
      setCancelBusy(false);
    }
  }

  function openPaperSessions() {
    const origin = withReturnTo('/backtest');
    if (paperSessions.length === 1) {
      navigate(`/paper/${paperSessions[0].id}`, { state: origin });
      return;
    }
    navigate(`/paper?strategy=${encodeURIComponent(strategyName)}`, { state: origin });
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
        const next = remaining.filter((row) => belongs(row))[0] ?? remaining[0] ?? null;
        setSelectedId(next?.id ?? null);
        commitCurrent(
          next
            ? seedCurrentRun({
                selectedId: next.id,
                current: null,
                item: next,
              })
            : null,
        );
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

  const showPaperSessions = paperSessions.length > 0;
  const showStartPaper = current?.status === 'succeeded';
  const showCancel = isLiveStatus(current?.status);
  const showRunToolbar = strategyPlatform === 'finclaw' && (showPaperSessions || showStartPaper || showCancel);

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
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {showRunToolbar ? (
            <div className="flex shrink-0 items-center justify-end gap-2 border-b border-border/60 px-3 py-1.5">
              {showPaperSessions ? (
                <Button type="button" size="xs" variant="outline" onClick={openPaperSessions}>
                  查看实盘模拟
                </Button>
              ) : null}
              {showStartPaper ? (
                <Button
                  type="button"
                  size="xs"
                  className={PRIMARY_BUTTON_CLASS}
                  disabled={paperBusy}
                  onClick={() => void handleStartPaper()}
                >
                  开启实盘模拟
                </Button>
              ) : null}
              {showCancel ? (
                <Button
                  type="button"
                  size="xs"
                  variant="destructive"
                  disabled={cancelBusy}
                  title="中断当前回测"
                  aria-label="中断回测"
                  onClick={() => void handleCancel()}
                >
                  <IconPlayerStop className="size-3.5" stroke={1.75} />
                  {cancelBusy ? '中断中…' : '中断'}
                </Button>
              ) : null}
            </div>
          ) : null}
          <RunReport key={current.id} detail={current} active={active} />
        </div>
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
