import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { useLocation } from 'react-router-dom';
import {
  IconBuildingWarehouse,
  IconChartAreaLine,
  IconCopy,
  IconLoader2,
  IconPencil,
  IconPlayerPlay,
  IconPlus,
  IconShare2,
  IconSparkles,
  IconTrash,
} from '@tabler/icons-react';
import { BacktestRunsPanel } from '@/components/backtest/BacktestRunsPanel';
import '@/components/backtest/fquant-ui.css';
import { PanelResizeHandle } from '@/components/PanelResizeHandle';
import { StrategyChatPanel } from '@/components/StrategyChatPanel';
import { StrategyCodeEditor } from '@/components/StrategyCodeEditor';
import { StrategyCreateDialog } from '@/components/StrategyCreateDialog';
import { StrategyShareDialog } from '@/components/StrategyShareDialog';
import { StrategyPlatformBadge } from '@/components/StrategyPlatformField';
import { SidebarExpandTrigger } from '@/components/chrome/SidebarExpandTrigger';
import { ThemeToggle } from '@/components/chrome/ThemeToggle';
import { useHorizontalResize } from '@/hooks/useHorizontalResize';
import {
  PANEL_WIDTH_DEFAULTS,
  PANEL_WIDTH_KEYS,
  PANEL_WIDTH_LIMITS,
} from '@/lib/panelWidths';
import { submitBacktestRun, type UniverseSelection } from '@/api/backtest';
import { UniverseDialog } from '@/components/backtest/UniverseDialog';
import type { BacktestRunParams } from '@/lib/backtestRunDraft';
import {
  createStrategy,
  pullStrategyFromAgent,
  deleteStrategy,
  getStrategy,
  listStrategies,
  renameStrategy,
  strategyRelPath,
  updateStrategy,
  type StrategySummary,
} from '@/api/strategies';
import {
  DEFAULT_STRATEGY_PLATFORM,
  getStrategyPlatformConfig,
  normalizeStrategyPlatform,
  type StrategyPlatform,
} from '@/lib/strategyPlatforms';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/cn';
import { copyToClipboard } from '@/lib/clipboard';
import {
  PRIMARY_BUTTON_CLASS,
  SAVE_BUTTON_IDLE_CLASS,
} from '@/lib/primaryButton';
import { toast } from 'sonner';
import { useAgents } from '@/state/agents';
import { useAuth } from '@/state/auth';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { shareStrategyToLibrary, type StrategyLibrarySummary } from '@/api/strategyLibrary';
import { StrategyLibraryDetailView, StrategyLibraryPanel } from '@/components/StrategyLibraryPanel';

type EditorForm = {
  name: string;
  platform: StrategyPlatform;
  script: string;
  path: string;
};

function emptyForm(): EditorForm {
  return {
    name: '',
    platform: DEFAULT_STRATEGY_PLATFORM,
    script: '',
    path: '',
  };
}

function formatUpdatedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function formFromDetail(detail: {
  name: string;
  platform: string;
  script: string;
  path?: string;
}): EditorForm {
  return {
    name: detail.name,
    platform: normalizeStrategyPlatform(detail.platform),
    script: detail.script,
    path: detail.path || strategyRelPath(detail.name),
  };
}

export default function BacktestPage() {
  const location = useLocation();
  const { user } = useAuth();
  const { requireAuth } = useRequireAuth();
  const { refresh: refreshAgents, currentAgent } = useAgents();
  const [strategies, setStrategies] = useState<StrategySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [form, setForm] = useState<EditorForm>(() => emptyForm());
  const [savedForm, setSavedForm] = useState<EditorForm>(() => emptyForm());
  const [dirty, setDirty] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [renameSurface, setRenameSurface] = useState<'list' | 'header' | null>(null);
  const [draftName, setDraftName] = useState('');
  const ignoreRenameBlurRef = useRef(false);
  const skipLoadRef = useRef(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareTitle, setShareTitle] = useState('');
  const [shareSummary, setShareSummary] = useState('');
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [workspace, setWorkspace] = useState<'strategies' | 'runs'>('strategies');
  const [runBusy, setRunBusy] = useState(false);
  const [universeOpen, setUniverseOpen] = useState(false);
  const [runsRefreshKey, setRunsRefreshKey] = useState(0);
  const [focusRunId, setFocusRunId] = useState<string | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryEntry, setLibraryEntry] = useState<StrategyLibrarySummary | null>(null);
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const existingStrategyNames = useMemo(() => strategies.map((s) => s.name), [strategies]);

  const listResize = useHorizontalResize({
    storageKey: PANEL_WIDTH_KEYS.backtestList,
    defaultWidth: PANEL_WIDTH_DEFAULTS.backtestList,
    ...PANEL_WIDTH_LIMITS.backtestList,
  });

  const chatResize = useHorizontalResize({
    storageKey: PANEL_WIDTH_KEYS.backtestChat,
    defaultWidth: PANEL_WIDTH_DEFAULTS.backtestChat,
    ...PANEL_WIDTH_LIMITS.backtestChat,
    invertDelta: true,
  });
  const [chatOpen, setChatOpen] = useState(() => {
    try {
      return localStorage.getItem('finclaw.backtestChatOpen') !== '0';
    } catch {
      return true;
    }
  });

  function persistChatOpen(open: boolean) {
    setChatOpen(open);
    try {
      localStorage.setItem('finclaw.backtestChatOpen', open ? '1' : '0');
    } catch {
      // ignore quota
    }
  }

  const refresh = useCallback(async () => {
    if (!user) {
      setStrategies([]);
      setLoading(false);
      setLoadError(null);
      setSelectedName(null);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const list = await listStrategies();
      setStrategies(list);
      setSelectedName((prev) => {
        if (prev && list.some((s) => s.name === prev)) return prev;
        return list[0]?.name ?? null;
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
    void refreshAgents();
  }, [refresh, refreshAgents]);

  useEffect(() => {
    const state = location.state as { selectedStrategy?: string } | null;
    if (state?.selectedStrategy) {
      setSelectedName(state.selectedStrategy);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return strategies;
    return strategies.filter((s) => s.name.toLowerCase().includes(q));
  }, [strategies, search]);

  const sortedFiltered = useMemo(
    () => [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN')),
    [filtered],
  );

  const createNameConflict = useMemo(() => {
    const trimmed = createName.trim();
    if (!trimmed) return false;
    return strategies.some((s) => s.name === trimmed);
  }, [createName, strategies]);

  const loadDetail = useCallback(async (name: string, opts?: { preserveDirty?: boolean }) => {
    setDetailLoading(true);
    setSubmitError(null);
    try {
      const detail = await getStrategy(name);
      const nextForm = formFromDetail(detail);
      setForm(nextForm);
      if (!opts?.preserveDirty) {
        setSavedForm(nextForm);
        setDirty(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载策略失败');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedName) {
      if (skipLoadRef.current) {
        skipLoadRef.current = false;
        return;
      }
      void loadDetail(selectedName);
    } else {
      setForm(emptyForm());
      setSavedForm(emptyForm());
      setDirty(false);
    }
  }, [selectedName, loadDetail]);

  const resetCreateForm = () => {
    setCreateName('');
    setCreateError(null);
  };

  const openCreate = () => {
    if (!requireAuth()) return;
    resetCreateForm();
    setCreateOpen(true);
  };

  const resetShareForm = () => {
    setShareTitle('');
    setShareSummary('');
    setShareError(null);
    setShareSuccess(false);
  };

  const openShare = () => {
    if (!requireAuth() || !selectedName) return;
    resetShareForm();
    setShareTitle(form.name.trim() || selectedName);
    setShareOpen(true);
  };

  const handleCopyScript = async () => {
    if (!form.script.trim()) {
      toast.error('策略内容为空');
      return;
    }
    try {
      await copyToClipboard(form.script);
      toast.success('策略代码已复制到剪贴板');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '复制失败');
    }
  };

  const handleShareSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!requireAuth() || !selectedName || shareBusy) return;
    setShareBusy(true);
    setShareError(null);
    try {
      await shareStrategyToLibrary({
        strategy_name: selectedName,
        title: shareTitle.trim() || selectedName,
        summary: shareSummary.trim() || undefined,
      });
      setShareSuccess(true);
      setLibraryRefreshKey((k) => k + 1);
      toast.success('已发布到策略库');
    } catch (err) {
      setShareError(err instanceof Error ? err.message : '发布失败');
    } finally {
      setShareBusy(false);
    }
  };

  const handleCreateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!requireAuth()) return;
    const name = createName.trim();
    if (!name) {
      setCreateError('策略名称不能为空');
      return;
    }
    if (createNameConflict) return;

    setCreateBusy(true);
    setCreateError(null);
    try {
      const detail = await createStrategy({
        name,
        platform: DEFAULT_STRATEGY_PLATFORM,
        agent: currentAgent ?? undefined,
      });
      setCreateOpen(false);
      resetCreateForm();
      setSelectedName(detail.name);
      await refresh();
      toast.success('策略已创建');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setCreateBusy(false);
    }
  };

  const handleSave = async () => {
    if (!requireAuth() || !selectedName) return;
    const name = form.name.trim();
    if (!name) {
      setSubmitError('策略名称不能为空');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const detail = await updateStrategy(selectedName, {
        name,
        platform: form.platform,
        script: form.script,
      });
      if (name !== selectedName) {
        setSelectedName(name);
      }
      const nextForm = formFromDetail(detail);
      setForm(nextForm);
      setSavedForm(nextForm);
      setDirty(false);
      toast.success('策略已保存');
      await refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  const persistIfDirty = async (): Promise<string | null> => {
    if (!selectedName) return null;
    if (!dirty) return selectedName;
    const name = form.name.trim();
    if (!name) {
      setSubmitError('策略名称不能为空');
      return null;
    }
    const detail = await updateStrategy(selectedName, {
      name,
      platform: form.platform,
      script: form.script,
    });
    if (name !== selectedName) setSelectedName(name);
    const nextForm = formFromDetail(detail);
    setForm(nextForm);
    setSavedForm(nextForm);
    setDirty(false);
    await refresh();
    return detail.name;
  };

  const handleRun = () => {
    if (!requireAuth() || !selectedName) return;
    if (form.platform !== 'finclaw') {
      toast.error('仅 FinClaw 策略支持内置回测');
      return;
    }
    setSubmitError(null);
    setUniverseOpen(true);
  };

  const handleConfirmUniverse = async (selection: UniverseSelection, params: BacktestRunParams) => {
    const cash = Number(params.initial_cash);
    setRunBusy(true);
    setSubmitError(null);
    try {
      const strategyName = await persistIfDirty();
      if (!strategyName) return;
      const run = await submitBacktestRun({
        strategy_name: strategyName,
        initial_cash: cash,
        start_time: params.start_time,
        end_time: params.end_time,
        universe: selection.universe,
        symbols: selection.symbols,
        index: selection.index,
        commission_rate: Number(params.commission_pct) / 100,
        min_commission: Number(params.min_commission),
        stamp_tax_rate: Number(params.stamp_pct) / 100,
        transfer_fee_rate: Number(params.transfer_pct) / 100,
        slippage: Number(params.slippage_pct) / 100,
      });
      setUniverseOpen(false);
      setFocusRunId(run.id);
      setRunsRefreshKey((value) => value + 1);
      setWorkspace('runs');
      toast.success('已提交回测');
    } catch (err) {
      const message = err instanceof Error ? err.message : '提交回测失败';
      setSubmitError(message);
      toast.error(message);
    } finally {
      setRunBusy(false);
    }
  };

  function startRename(name: string, surface: 'list' | 'header', event?: MouseEvent) {
    event?.stopPropagation();
    if (!requireAuth()) return;
    ignoreRenameBlurRef.current = false;
    setRenameSurface(surface);
    setEditingName(name);
    setDraftName(name);
  }

  async function commitRename(oldName: string) {
    if (ignoreRenameBlurRef.current) {
      ignoreRenameBlurRef.current = false;
      return;
    }
    const next = draftName.trim();
    setEditingName(null);
    setRenameSurface(null);
    if (!next || next === oldName) return;
    if (strategies.some((s) => s.name === next && s.name !== oldName)) {
      toast.error('已有同名策略');
      return;
    }
    try {
      const keep =
        selectedName === oldName && savedForm.name === oldName && !detailLoading
          ? { platform: savedForm.platform, script: savedForm.script }
          : undefined;
      const detail = await renameStrategy(oldName, next, keep);
      setStrategies((list) =>
        list.map((row) =>
          row.name === oldName
            ? { ...row, name: detail.name, path: detail.path, updated_at: detail.updated_at }
            : row,
        ),
      );
      setSelectedName((prev) => {
        if (prev !== oldName) return prev;
        skipLoadRef.current = true;
        return detail.name;
      });
      setForm((prev) => (prev.name === oldName ? { ...prev, name: detail.name, path: detail.path } : prev));
      setSavedForm((prev) => (prev.name === oldName ? { ...prev, name: detail.name, path: detail.path } : prev));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '重命名失败');
    }
  }

  function onRenameKey(event: KeyboardEvent<HTMLInputElement>, name: string) {
    if (event.key === 'Enter') {
      event.preventDefault();
      ignoreRenameBlurRef.current = false;
      void commitRename(name);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      ignoreRenameBlurRef.current = true;
      setEditingName(null);
      setRenameSurface(null);
    }
  }

  const handleDelete = async (name: string) => {
    if (!requireAuth()) return;
    const ok = await confirm({
      title: `删除策略「${name}」`,
      description: '将永久删除该策略文件，操作不可恢复。',
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteStrategy(name);
      toast.success('策略已删除');
      if (selectedName === name) {
        setSelectedName(null);
        setForm(emptyForm());
        setSavedForm(emptyForm());
      }
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleAgentFileChanged = useCallback(async (agentName: string) => {
    if (!selectedName) return;
    try {
      const detail = await pullStrategyFromAgent(selectedName, agentName);
      const nextForm = formFromDetail(detail);
      setForm(nextForm);
      setSavedForm(nextForm);
      setDirty(false);
    } catch (err) {
      // Agent 运行中文件可能尚未就绪，静默失败，不打断用户
      console.warn('[Backtest] pull strategy after agent run failed:', err);
    }
  }, [selectedName]);

  const handleRevert = () => {
    setForm(savedForm);
    setDirty(false);
    setSubmitError(null);
  };

  const updateField = <K extends keyof EditorForm>(key: K, value: EditorForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const strategyReady = !dirty && Boolean(form.path);
  const platformConfig = getStrategyPlatformConfig(form.platform);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border/50 px-3">
        <SidebarExpandTrigger />
        <nav className="-mb-px flex h-full items-stretch gap-0">
          {([
            ['strategies', '策略'],
            ['runs', '回测'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={cn(
                'h-full px-4 text-[13px]',
                workspace === id
                  ? 'border-b-2 border-primary font-medium text-primary'
                  : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setWorkspace(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>

      {workspace === 'runs' ? (
        <BacktestRunsPanel refreshKey={runsRefreshKey} focusRunId={focusRunId} />
      ) : (
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          className="relative flex shrink-0 flex-col border-r border-border/50 bg-muted/20"
          style={{ width: listResize.width }}
        >
          <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border/50 px-2.5">
            <span className="text-xs text-muted-foreground">策略管理</span>
            <Button
              type="button"
              size="xs"
              className={cn('h-6 gap-0.5 px-2 text-[11px]', PRIMARY_BUTTON_CLASS)}
              onClick={openCreate}
            >
              <IconPlus className="size-3.5" stroke={2} />
              新建策略
            </Button>
          </div>
          <div className="border-b border-border/50 p-2">
            <Input
              placeholder="搜索策略…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ScrollArea className="min-h-0 flex-1">
            {loading ? (
              <p className="p-4 text-center text-xs text-muted-foreground">加载中…</p>
            ) : loadError ? (
              <div className="space-y-2 p-4 text-center">
                <p className="text-xs text-destructive">{loadError}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>
                  重试
                </Button>
              </div>
            ) : sortedFiltered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-6 text-center">
                <IconChartAreaLine className="size-8 text-muted-foreground/50" />
                <p className="text-xs text-muted-foreground">暂无策略</p>
                <Button type="button" size="sm" variant="outline" onClick={openCreate}>
                  创建第一个策略
                </Button>
              </div>
            ) : (
              <div className="py-1">
                {sortedFiltered.map((s) => {
                  const editing = editingName === s.name && renameSurface === 'list';
                  return (
                  <div
                    key={s.name}
                    className={cn(
                      'group flex items-start gap-1.5',
                      selectedName === s.name && 'bg-violet-500/10 shadow-[inset_2px_0_0_0] shadow-violet-600',
                    )}
                  >
                    {editing ? (
                      <div className="min-w-0 flex-1 px-2.5 py-[7px]">
                        <input
                          className="h-[22px] w-full min-w-0 rounded-sm border border-violet-500 bg-background px-1 text-[13px]"
                          value={draftName}
                          autoFocus
                          maxLength={64}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => setDraftName(event.target.value)}
                          onBlur={() => void commitRename(s.name)}
                          onKeyDown={(event) => onRenameKey(event, s.name)}
                          aria-label="策略名称"
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={cn(
                          'min-w-0 flex-1 px-2.5 py-[7px] text-left',
                          selectedName !== s.name && 'hover:bg-muted/60',
                        )}
                        onClick={() => {
                          setSelectedName(s.name);
                          setShowLibrary(false);
                          setLibraryEntry(null);
                        }}
                      >
                        <span
                          className="flex min-w-0 items-center gap-1"
                          title="双击重命名"
                          onDoubleClick={(event) => startRename(s.name, 'list', event)}
                        >
                          <span className="min-w-0 truncate text-[13px]">{s.name}</span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">.py</span>
                        </span>
                        <div className="mt-0.5 flex min-w-0 items-center gap-2">
                          <span className="min-w-0 truncate text-[10px] tabular-nums text-muted-foreground/70">
                            {formatUpdatedAt(s.updated_at)}
                          </span>
                          {s.platform !== 'finclaw' ? (
                            <StrategyPlatformBadge platform={s.platform} />
                          ) : null}
                        </div>
                      </button>
                    )}
                    <span
                      className={cn(
                        'mr-1.5 mt-[7px] flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity',
                        'group-hover:opacity-100',
                        (selectedName === s.name || editing) && 'opacity-100',
                      )}
                    >
                      <button
                        type="button"
                        className="flex size-[22px] items-center justify-center rounded-sm border border-border text-muted-foreground/50 hover:border-primary hover:text-primary"
                        onClick={(event) => startRename(s.name, 'list', event)}
                        title="重命名"
                        aria-label={`重命名 ${s.name}`}
                      >
                        <IconPencil className="size-3.5" stroke={1.75} />
                      </button>
                      <button
                        type="button"
                        className="flex size-[22px] items-center justify-center rounded-sm border border-border text-muted-foreground/50 hover:border-destructive hover:text-destructive"
                        onClick={() => void handleDelete(s.name)}
                        title="删除"
                        aria-label={`删除策略 ${s.name}`}
                      >
                        <IconTrash className="size-3.5" stroke={1.75} />
                      </button>
                    </span>
                  </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
          <div className="shrink-0 border-t border-border/50 p-3">
            <Button
              type="button"
              size="sm"
              className={cn(
                'h-8 w-full gap-1.5',
                PRIMARY_BUTTON_CLASS,
                (showLibrary || libraryEntry) && 'ring-2 ring-violet-400/60 ring-offset-1 ring-offset-background',
              )}
              onClick={() => {
                setShowLibrary(true);
                setSelectedName(null);
                setLibraryEntry(null);
              }}
            >
              <IconBuildingWarehouse className="size-4" stroke={1.75} />
              策略库
            </Button>
          </div>
          </div>
          <PanelResizeHandle {...listResize.handleProps} />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {libraryEntry ? (
            <StrategyLibraryDetailView
              entry={libraryEntry}
              existingStrategyNames={existingStrategyNames}
              onBack={() => setLibraryEntry(null)}
              onInstalled={(name) => {
                setShowLibrary(false);
                setLibraryEntry(null);
                setSelectedName(name);
                void refresh();
              }}
            />
          ) : showLibrary ? (
            <StrategyLibraryPanel
              variant="cards"
              hideTitle
              existingStrategyNames={existingStrategyNames}
              refreshKey={libraryRefreshKey}
              onSelectEntry={(entry) => {
                if (entry) setLibraryEntry(entry);
              }}
              onInstalled={(name) => {
                setShowLibrary(false);
                setLibraryEntry(null);
                setSelectedName(name);
                void refresh();
              }}
            />
          ) : !selectedName ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
                <IconChartAreaLine className="size-7 text-primary" />
              </div>
              <h2 className="text-base font-medium">量化策略管理</h2>
              <p className="max-w-md text-sm text-muted-foreground">
                FinClaw 策略用 akquant 格式，可在本页直接回测。右侧 AI 可直接修改当前策略文件。点击左侧「策略库」可查看社区分享的策略。
              </p>
              <Button type="button" className={PRIMARY_BUTTON_CLASS} onClick={openCreate}>
                <IconPlus className="size-4" />
                新建策略
              </Button>
            </div>
          ) : (
            <>
              <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/50 px-2.5">
                <div className="flex min-w-0 items-center gap-0.5">
                  {selectedName && editingName === selectedName && renameSurface === 'header' ? (
                    <input
                      className="h-[26px] max-w-[180px] rounded-sm border border-violet-500 bg-background px-1.5 text-[13px] font-medium"
                      value={draftName}
                      autoFocus
                      maxLength={64}
                      onChange={(event) => setDraftName(event.target.value)}
                      onBlur={() => void commitRename(selectedName)}
                      onKeyDown={(event) => onRenameKey(event, selectedName)}
                      aria-label="策略名称"
                    />
                  ) : (
                    <>
                      <span
                        className="max-w-[180px] truncate px-1.5 text-[13px] font-medium"
                        title="双击重命名"
                        onDoubleClick={(event) => selectedName && startRename(selectedName, 'header', event)}
                      >
                        {form.name}
                      </span>
                      <button
                        type="button"
                        className="flex size-[22px] shrink-0 items-center justify-center rounded-sm text-muted-foreground/70 hover:bg-muted hover:text-foreground"
                        disabled={detailLoading || !selectedName}
                        title="重命名"
                        aria-label={`重命名 ${form.name}`}
                        onClick={(event) => selectedName && startRename(selectedName, 'header', event)}
                      >
                        <IconPencil className="size-3.5" stroke={1.75} />
                      </button>
                    </>
                  )}
                  <span className="text-xs text-muted-foreground">.py</span>
                </div>
                {form.platform !== 'finclaw' ? <StrategyPlatformBadge platform={form.platform} /> : null}
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                  {dirty && (
                    <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400">
                      未保存
                    </Badge>
                  )}
                  <Button
                    type="button"
                    size="xs"
                    className={cn('gap-1', PRIMARY_BUTTON_CLASS)}
                    disabled={detailLoading || !form.script.trim()}
                    title="复制策略代码到剪贴板"
                    onClick={() => void handleCopyScript()}
                  >
                    <IconCopy className="size-3.5" stroke={1.75} />
                    复制
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    className={cn('gap-1', PRIMARY_BUTTON_CLASS)}
                    disabled={dirty || detailLoading}
                    title={dirty ? '请先保存后再分享' : '分享到策略库'}
                    onClick={openShare}
                  >
                    <IconShare2 className="size-3.5" stroke={1.75} />
                    分享
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    disabled={!dirty || submitting || detailLoading}
                    onClick={handleRevert}
                  >
                    撤销
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    className={cn(dirty ? PRIMARY_BUTTON_CLASS : SAVE_BUTTON_IDLE_CLASS)}
                    disabled={submitting || detailLoading || !dirty}
                    onClick={() => void handleSave()}
                  >
                    {submitting ? '保存中…' : '保存'}
                  </Button>
                  {platformConfig.nativeBacktest ? (
                    <Button
                      type="button"
                      size="icon-xs"
                      className={PRIMARY_BUTTON_CLASS}
                      disabled={runBusy || submitting || detailLoading || !form.script.trim()}
                      title={runBusy ? '提交中…' : '运行回测'}
                      aria-label={runBusy ? '提交中…' : '运行回测'}
                      onClick={handleRun}
                    >
                      {runBusy ? (
                        <IconLoader2 className="size-3.5 animate-spin" />
                      ) : (
                        <IconPlayerPlay className="size-3.5" stroke={1.75} />
                      )}
                    </Button>
                  ) : null}
                </div>
              </div>

              {submitError && (
                <div className="mx-4 mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {submitError}
                </div>
              )}

              <div className="relative flex min-h-0 flex-1 flex-col">
                {detailLoading ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    加载策略…
                  </div>
                ) : (
                  <StrategyCodeEditor
                    value={form.script}
                    onChange={(script) => updateField('script', script)}
                  />
                )}
              </div>
            </>
          )}
        </div>

        {chatOpen ? (
          <div className="relative shrink-0" style={{ width: chatResize.width }}>
            <PanelResizeHandle {...chatResize.handleProps} side="left" />
            <StrategyChatPanel
              className="h-full"
              platform={form.platform}
              strategyPath={form.path}
              strategyReady={strategyReady}
              onStrategyFileChanged={handleAgentFileChanged}
              onCollapse={() => persistChatOpen(false)}
            />
          </div>
        ) : (
          <div className="flex h-full w-9 shrink-0 flex-col items-center gap-2 border-l border-border/50 bg-muted/20 pt-1.5">
            <button
              type="button"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-violet-500/10 hover:text-violet-600 dark:hover:text-violet-300"
              onClick={() => persistChatOpen(true)}
              title="展开 AI"
              aria-label="展开 AI"
            >
              <IconSparkles className="size-4" stroke={1.75} />
            </button>
            <span className="select-none text-[10px] tracking-[0.18em] text-muted-foreground [writing-mode:vertical-rl]">
              AI
            </span>
          </div>
        )}
      </div>
      )}

      <StrategyCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        name={createName}
        onNameChange={setCreateName}
        nameConflict={createNameConflict}
        busy={createBusy}
        error={createError}
        onSubmit={handleCreateSubmit}
        onCancel={resetCreateForm}
      />
      <UniverseDialog
        open={universeOpen}
        busy={runBusy}
        onOpenChange={setUniverseOpen}
        onConfirm={(selection, params) => void handleConfirmUniverse(selection, params)}
      />
      <StrategyShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        strategyName={selectedName ?? ''}
        title={shareTitle}
        onTitleChange={setShareTitle}
        summary={shareSummary}
        onSummaryChange={setShareSummary}
        busy={shareBusy}
        error={shareError}
        success={shareSuccess}
        onSubmit={handleShareSubmit}
        onCancel={resetShareForm}
      />
      {confirmDialog}
    </div>
  );
}
