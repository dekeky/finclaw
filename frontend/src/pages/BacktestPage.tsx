import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { useLocation } from 'react-router-dom';
import {
  IconArrowLeft,
  IconBuildingWarehouse,
  IconChartAreaLine,
  IconCopy,
  IconLoader2,
  IconPencil,
  IconPlayerPlay,
  IconPlus,
  IconLink,
  IconShare2,
  IconSparkles,
} from '@tabler/icons-react';
import { BacktestRunsPanel } from '@/components/backtest/BacktestRunsPanel';
import '@/components/backtest/fquant-ui.css';
import { PanelResizeHandle } from '@/components/PanelResizeHandle';
import { StrategyChatPanel } from '@/components/StrategyChatPanel';
import { StrategyCodeEditor } from '@/components/StrategyCodeEditor';
import { StrategyCreateDialog } from '@/components/StrategyCreateDialog';
import { StrategyLinkShareDialog } from '@/components/StrategyLinkShareDialog';
import { StrategyShareDialog } from '@/components/StrategyShareDialog';
import { StrategyPlatformBadge } from '@/components/StrategyPlatformField';
import { StrategyGallerySkeleton } from '@/components/strategy/StrategyGallerySkeleton';
import { StrategyGalleryTile } from '@/components/strategy/StrategyGalleryTile';
import { galleryShellClassName } from '@/components/strategy/strategyGallery';
import { SidebarExpandTrigger } from '@/components/chrome/SidebarExpandTrigger';
import { ThemeToggle } from '@/components/chrome/ThemeToggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SegmentedControl } from '@/components/ui/segmented-control';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/cn';
import { copyToClipboard } from '@/lib/clipboard';
import {
  PRIMARY_BUTTON_CLASS,
  PRIMARY_ICON_GRADIENT_CLASS,
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
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [form, setForm] = useState<EditorForm>(() => emptyForm());
  const [savedForm, setSavedForm] = useState<EditorForm>(() => emptyForm());
  const [dirty, setDirty] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [renameSurface, setRenameSurface] = useState<'card' | 'header' | null>(null);
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
  const [linkShareOpen, setLinkShareOpen] = useState(false);
  const [strategyPane, setStrategyPane] = useState<'code' | 'runs'>('code');
  const [runsReady, setRunsReady] = useState(false);
  const [runBusy, setRunBusy] = useState(false);
  const [universeOpen, setUniverseOpen] = useState(false);
  const [runsRefreshKey, setRunsRefreshKey] = useState(0);
  const [focusRunId, setFocusRunId] = useState<string | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryEntry, setLibraryEntry] = useState<StrategyLibrarySummary | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const existingStrategyNames = useMemo(() => strategies.map((s) => s.name), [strategies]);

  useEffect(() => {
    if (strategyPane === 'runs') setRunsReady(true);
  }, [strategyPane]);

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
        return null;
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

  const sortedStrategies = useMemo(() => {
    const rows = [...strategies];
    rows.sort((a, b) => {
      const tb = new Date(b.updated_at).getTime();
      const ta = new Date(a.updated_at).getTime();
      if (tb !== ta) return tb - ta;
      return a.name.localeCompare(b.name, 'zh-Hans-CN');
    });
    return rows;
  }, [strategies]);

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
      setShowLibrary(false);
      setLibraryEntry(null);
      setStrategyPane('code');
      setFocusRunId(null);
      setSelectedName(detail.name);
      await refresh();
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
      setStrategyPane('runs');
    } catch (err) {
      const message = err instanceof Error ? err.message : '提交回测失败';
      setSubmitError(message);
      toast.error(message);
    } finally {
      setRunBusy(false);
    }
  };

  function startRename(name: string, surface: 'card' | 'header', event?: MouseEvent) {
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

  const openLibrary = () => {
    setShowLibrary(true);
    setSelectedName(null);
    setLibraryEntry(null);
    setStrategyPane('code');
    setFocusRunId(null);
  };

  const backToBrowse = () => {
    setSelectedName(null);
    setShowLibrary(false);
    setLibraryEntry(null);
    setStrategyPane('code');
    setFocusRunId(null);
  };

  const browseMode = showLibrary ? 'library' : 'mine';
  const browsing = !selectedName && !libraryEntry;
  // 仅「我的策略」详情展示右侧 AI；列表页与策略市场全程不展示。
  const showChatColumn = Boolean(selectedName);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border/50 px-3">
        <SidebarExpandTrigger />
        {browsing ? (
          <SegmentedControl
            aria-label="策略视图"
            value={browseMode}
            options={[
              { value: 'mine', label: '我的策略' },
              { value: 'library', label: '策略市场' },
            ]}
            onChange={(mode) => {
              if (mode === 'library') openLibrary();
              else backToBrowse();
            }}
          />
        ) : selectedName ? (
          <div className="flex min-w-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              onClick={backToBrowse}
              aria-label="返回策略列表"
            >
              <IconArrowLeft className="size-4" />
            </Button>
            <div className="flex min-w-0 items-center gap-0.5">
              {editingName === selectedName && renameSurface === 'header' ? (
                <input
                  className="h-[26px] max-w-[200px] rounded-sm border border-violet-500 bg-background px-1.5 text-[13px] font-medium"
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
                    className="max-w-[200px] truncate px-1.5 text-[13px] font-medium"
                    title="双击重命名"
                    onDoubleClick={(event) => startRename(selectedName, 'header', event)}
                  >
                    {form.name}
                  </span>
                  <button
                    type="button"
                    className="flex size-[22px] shrink-0 items-center justify-center rounded-sm text-muted-foreground/70 hover:bg-muted hover:text-foreground"
                    disabled={detailLoading}
                    title="重命名"
                    aria-label={`重命名 ${form.name}`}
                    onClick={(event) => startRename(selectedName, 'header', event)}
                  >
                    <IconPencil className="size-3.5" stroke={1.75} />
                  </button>
                </>
              )}
              <span className="text-xs text-muted-foreground">.py</span>
            </div>
            <Button
              type="button"
              size="xs"
              className={cn('ml-0.5 shrink-0 gap-1', PRIMARY_BUTTON_CLASS)}
              disabled={dirty || detailLoading}
              title={dirty ? '请先保存后再发布' : '发布整个策略到策略市场'}
              aria-label="发布至市场"
              onClick={openShare}
            >
              <IconShare2 className="size-3.5" stroke={1.75} />
              发布至市场
            </Button>
            <Button
              type="button"
              size="xs"
              variant="outline"
              className="ml-0.5 shrink-0 gap-1"
              disabled={detailLoading}
              title="生成无需登录即可查看的分享链接"
              aria-label="分享策略"
              onClick={() => {
                if (!requireAuth() || !selectedName) return;
                setLinkShareOpen(true);
              }}
            >
              <IconLink className="size-3.5" stroke={1.75} />
              分享
            </Button>
          </div>
        ) : null}
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
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
                setStrategyPane('code');
                void refresh();
              }}
            />
          ) : browsing ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {showLibrary ? (
                <StrategyLibraryPanel
                  variant="cards"
                  hideTitle
                  hideHeader
                  existingStrategyNames={existingStrategyNames}
                  onSelectEntry={(entry) => {
                    if (entry) setLibraryEntry(entry);
                  }}
                  onInstalled={(name) => {
                    setShowLibrary(false);
                    setLibraryEntry(null);
                    setSelectedName(name);
                    setStrategyPane('code');
                    void refresh();
                  }}
                />
              ) : (
                <ScrollArea className="min-h-0 flex-1">
                  <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
                    {loading ? (
                      <StrategyGallerySkeleton />
                    ) : loadError ? (
                      <div className="space-y-3 py-16 text-center">
                        <p className="text-sm text-destructive">{loadError}</p>
                        <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>
                          重试
                        </Button>
                      </div>
                    ) : sortedStrategies.length === 0 ? (
                      <div className="px-4 py-16 text-center">
                        <div className="mx-auto flex max-w-md flex-col items-center gap-4">
                          <div className="flex size-16 items-center justify-center rounded-2xl border border-border/60 bg-card shadow-sm">
                            <IconChartAreaLine className="size-7 text-primary" stroke={1.5} />
                          </div>
                          <div className="space-y-1.5">
                            <h3 className="text-base font-semibold tracking-tight">开始你的第一个策略</h3>
                            <p className="text-sm leading-relaxed text-muted-foreground">
                              从空白策略起步，或从策略市场安装社区验证过的模板，随后即可编辑、回测与迭代。
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            <Button type="button" className={PRIMARY_BUTTON_CLASS} onClick={openCreate}>
                              <IconPlus className="size-4" />
                              新建策略
                            </Button>
                            <Button type="button" variant="outline" onClick={openLibrary}>
                              <IconBuildingWarehouse className="size-4" stroke={1.75} />
                              浏览策略市场
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {sortedStrategies.map((s) => {
                          const editing = editingName === s.name && renameSurface === 'card';
                          return (
                            <StrategyGalleryTile
                              key={s.name}
                              title={s.name}
                              platform={s.platform}
                              updatedAt={s.updated_at}
                              editing={editing}
                              draftName={draftName}
                              onDraftNameChange={setDraftName}
                              onCommitRename={() => void commitRename(s.name)}
                              onRenameKeyDown={(event) => onRenameKey(event, s.name)}
                              onOpen={() => {
                                setSelectedName(s.name);
                                setShowLibrary(false);
                                setLibraryEntry(null);
                                setFocusRunId(null);
                              }}
                              onRename={(event) => startRename(s.name, 'card', event)}
                              onDelete={() => void handleDelete(s.name)}
                            />
                          );
                        })}
                        <button
                          type="button"
                          onClick={openCreate}
                          className={cn(
                            galleryShellClassName(),
                            'min-h-[120px] items-center justify-center border-dashed bg-transparent p-4 text-muted-foreground',
                            'hover:border-primary/40 hover:bg-muted/30 hover:text-foreground',
                          )}
                        >
                          <span className="flex flex-col items-center gap-2">
                            <span className="flex size-10 items-center justify-center rounded-xl border border-dashed border-current/30">
                              <IconPlus className="size-5" stroke={1.75} />
                            </span>
                            <span className="text-sm font-medium">新建策略</span>
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              )}
            </div>
          ) : (
            <>
              <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/50 bg-card/80 px-2.5 backdrop-blur-sm">
                {form.platform !== 'finclaw' ? <StrategyPlatformBadge platform={form.platform} /> : null}
                <nav className="flex h-full items-stretch gap-0 self-stretch">
                  {([
                    ['code', '策略代码'],
                    ['runs', '回测记录'],
                  ] as const).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={cn(
                        'h-full px-3 text-[12px] transition-colors',
                        strategyPane === id
                          ? 'border-b-2 border-violet-600 font-medium text-violet-700 dark:border-violet-400 dark:text-violet-300'
                          : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground',
                      )}
                      onClick={() => setStrategyPane(id)}
                    >
                      {label}
                    </button>
                  ))}
                </nav>
                {strategyPane === 'code' ? (
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
                        size="xs"
                        className={cn('gap-1', PRIMARY_BUTTON_CLASS)}
                        disabled={runBusy || submitting || detailLoading || !form.script.trim()}
                        title={runBusy ? '提交中…' : '运行回测'}
                        onClick={handleRun}
                      >
                        {runBusy ? (
                          <IconLoader2 className="size-3.5 animate-spin" />
                        ) : (
                          <IconPlayerPlay className="size-3.5" stroke={1.75} />
                        )}
                        {runBusy ? '提交中…' : '回测'}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {submitError && (
                <div className="mx-4 mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {submitError}
                </div>
              )}

              <div className="relative flex min-h-0 flex-1 flex-col">
                <div
                  className={
                    strategyPane === 'code' ? 'relative flex min-h-0 flex-1 flex-col' : 'hidden'
                  }
                >
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
                {selectedName && runsReady ? (
                  <div className={strategyPane === 'runs' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
                    <BacktestRunsPanel
                      strategyName={selectedName}
                      refreshKey={runsRefreshKey}
                      focusRunId={focusRunId}
                      active={strategyPane === 'runs'}
                    />
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>

        {showChatColumn ? (
          chatOpen ? (
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
            <div className="flex h-full w-14 shrink-0 flex-col items-center border-l border-border/50 pt-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="flex shrink-0 items-center rounded-md border-none bg-transparent p-0 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/35"
                    onClick={() => persistChatOpen(true)}
                    aria-label="展开 AI"
                  >
                    <span
                      className={cn(
                        'flex size-6 items-center justify-center rounded-md',
                        PRIMARY_ICON_GRADIENT_CLASS,
                      )}
                    >
                      <IconSparkles className="size-3.5" stroke={1.75} aria-hidden />
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left">展开 AI</TooltipContent>
              </Tooltip>
            </div>
          )
        ) : null}
      </div>

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
      <StrategyLinkShareDialog
        open={linkShareOpen}
        onOpenChange={setLinkShareOpen}
        strategyName={selectedName ?? ''}
      />
      {confirmDialog}
    </div>
  );
}
