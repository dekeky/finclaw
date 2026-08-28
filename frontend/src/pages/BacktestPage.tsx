import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import {
  IconBuildingWarehouse,
  IconChartAreaLine,
  IconCopy,
  IconExternalLink,
  IconPlus,
  IconShare2,
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
import {
  createStrategy,
  pullStrategyFromAgent,
  deleteStrategy,
  getStrategy,
  listStrategies,
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
  const [detailLoading, setDetailLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createPlatform, setCreatePlatform] = useState<StrategyPlatform>(DEFAULT_STRATEGY_PLATFORM);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareTitle, setShareTitle] = useState('');
  const [shareSummary, setShareSummary] = useState('');
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [workspace, setWorkspace] = useState<'strategies' | 'runs'>('strategies');
  const [runParams, setRunParams] = useState({
    initial_cash: '100000',
    start_time: '2020-01-01',
    end_time: '2023-12-31',
    commission_pct: '0.03',
    min_commission: '5',
    stamp_pct: '0.1',
    transfer_pct: '0.001',
    slippage_pct: '0.02',
  });
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
      void loadDetail(selectedName);
    } else {
      setForm(emptyForm());
      setSavedForm(emptyForm());
      setDirty(false);
    }
  }, [selectedName, loadDetail]);

  const resetCreateForm = () => {
    setCreateName('');
    setCreatePlatform(DEFAULT_STRATEGY_PLATFORM);
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
        platform: createPlatform,
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
    const cash = Number(runParams.initial_cash);
    if (!Number.isFinite(cash) || cash <= 0) {
      toast.error('初始资金必须大于 0');
      return;
    }
    setSubmitError(null);
    setUniverseOpen(true);
  };

  const handleConfirmUniverse = async (selection: UniverseSelection) => {
    const cash = Number(runParams.initial_cash);
    setRunBusy(true);
    setSubmitError(null);
    try {
      const strategyName = await persistIfDirty();
      if (!strategyName) return;
      const run = await submitBacktestRun({
        strategy_name: strategyName,
        initial_cash: cash,
        start_time: runParams.start_time,
        end_time: runParams.end_time,
        universe: selection.universe,
        symbols: selection.symbols,
        index: selection.index,
        commission_rate: Number(runParams.commission_pct) / 100,
        min_commission: Number(runParams.min_commission),
        stamp_tax_rate: Number(runParams.stamp_pct) / 100,
        transfer_fee_rate: Number(runParams.transfer_pct) / 100,
        slippage: Number(runParams.slippage_pct) / 100,
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
          <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/50 px-3">
            <span className="text-xs text-muted-foreground">策略管理</span>
            <button
              type="button"
              title="新建策略"
              className="flex size-[22px] items-center justify-center rounded-sm border border-border text-muted-foreground hover:border-primary hover:text-primary"
              onClick={openCreate}
            >
              <IconPlus className="size-3.5" />
            </button>
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
                {sortedFiltered.map((s) => (
                  <div
                    key={s.name}
                    className={cn(
                      'group flex items-center gap-1.5',
                      selectedName === s.name && 'bg-violet-500/10 shadow-[inset_2px_0_0_0] shadow-violet-600',
                    )}
                  >
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
                      <span className="flex min-w-0 items-center gap-1">
                        <span className="min-w-0 truncate text-[13px]">{s.name}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">.py</span>
                      </span>
                      <div className="mt-0.5 flex min-w-0 items-center justify-between gap-2">
                        <StrategyPlatformBadge platform={s.platform} />
                        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
                          {formatUpdatedAt(s.updated_at)}
                        </span>
                      </div>
                    </button>
                    <button
                      type="button"
                      className={cn(
                        'mr-1.5 flex size-[22px] shrink-0 items-center justify-center rounded-sm border border-border',
                        'text-muted-foreground/50 opacity-0 transition-opacity',
                        'group-hover:opacity-100 hover:border-destructive hover:text-destructive',
                        selectedName === s.name && 'opacity-100',
                      )}
                      onClick={() => void handleDelete(s.name)}
                      title="删除"
                      aria-label={`删除策略 ${s.name}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
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
                FinClaw 策略可在本页直接回测；聚宽策略保存后复制到聚宽控制台运行。右侧 AI 可直接修改当前策略文件。点击左侧「策略库」可查看社区分享的策略。
              </p>
              <Button type="button" className={PRIMARY_BUTTON_CLASS} onClick={openCreate}>
                <IconPlus className="size-4" />
                新建策略
              </Button>
            </div>
          ) : (
            <>
              <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/50 px-2.5">
                <label className="flex items-center gap-0.5">
                  <Input
                    placeholder="策略名称"
                    value={form.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    className="h-[26px] max-w-[180px] border-transparent bg-transparent px-1.5 text-[13px] font-medium hover:border-border focus-visible:border-border"
                    disabled={detailLoading}
                  />
                  <span className="text-xs text-muted-foreground">.py</span>
                </label>
                <StrategyPlatformBadge platform={form.platform} />
                {form.path && !platformConfig.nativeBacktest && platformConfig.backtestUrl ? (
                  <Button
                    asChild
                    size="xs"
                    className={cn('shrink-0 gap-1', PRIMARY_BUTTON_CLASS)}
                  >
                    <a
                      href={platformConfig.backtestUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`前往${platformConfig.label}回测`}
                    >
                      {platformConfig.label}回测
                      <IconExternalLink className="size-3" stroke={1.75} />
                    </a>
                  </Button>
                ) : null}
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
                      size="xs"
                      className={cn('gap-1', PRIMARY_BUTTON_CLASS)}
                      disabled={runBusy || submitting || detailLoading || !form.script.trim()}
                      onClick={handleRun}
                    >
                      {runBusy ? '提交中…' : '回测'}
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

              {platformConfig.nativeBacktest ? (
                <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/50 bg-muted/20 px-3 py-1 text-xs">
                  <label className="flex items-center gap-2 text-muted-foreground">
                    初始资金
                    <Input
                      type="number"
                      min="0"
                      step="1000"
                      value={runParams.initial_cash}
                      onChange={(e) => setRunParams((prev) => ({ ...prev, initial_cash: e.target.value }))}
                      className="h-[26px] w-[110px] font-mono text-xs"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-muted-foreground">
                    开始
                    <Input
                      type="date"
                      value={runParams.start_time}
                      onChange={(e) => setRunParams((prev) => ({ ...prev, start_time: e.target.value }))}
                      className="h-[26px] w-[138px] text-xs"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-muted-foreground">
                    结束
                    <Input
                      type="date"
                      value={runParams.end_time}
                      onChange={(e) => setRunParams((prev) => ({ ...prev, end_time: e.target.value }))}
                      className="h-[26px] w-[138px] text-xs"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-muted-foreground" title="买卖都收，聚宽等平台常用万三">
                    佣金%
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={runParams.commission_pct}
                      onChange={(e) => setRunParams((prev) => ({ ...prev, commission_pct: e.target.value }))}
                      className="h-[26px] w-[72px] font-mono text-xs"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-muted-foreground" title="单笔佣金下限，券商常用 5 元">
                    最低佣金
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={runParams.min_commission}
                      onChange={(e) => setRunParams((prev) => ({ ...prev, min_commission: e.target.value }))}
                      className="h-[26px] w-[72px] font-mono text-xs"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-muted-foreground" title="仅卖出收取，回测常用千一">
                    印花税%
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={runParams.stamp_pct}
                      onChange={(e) => setRunParams((prev) => ({ ...prev, stamp_pct: e.target.value }))}
                      className="h-[26px] w-[72px] font-mono text-xs"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-muted-foreground" title="中国结算过户费，买卖都收">
                    过户费%
                    <Input
                      type="number"
                      min="0"
                      step="0.001"
                      value={runParams.transfer_pct}
                      onChange={(e) => setRunParams((prev) => ({ ...prev, transfer_pct: e.target.value }))}
                      className="h-[26px] w-[72px] font-mono text-xs"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-muted-foreground" title="成交价相对信号价的不利偏移，常用万二">
                    滑点%
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={runParams.slippage_pct}
                      onChange={(e) => setRunParams((prev) => ({ ...prev, slippage_pct: e.target.value }))}
                      className="h-[26px] w-[72px] font-mono text-xs"
                    />
                  </label>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="relative shrink-0" style={{ width: chatResize.width }}>
          <PanelResizeHandle {...chatResize.handleProps} side="left" />
          <StrategyChatPanel
            className="h-full"
            platform={form.platform}
            strategyPath={form.path}
            strategyReady={strategyReady}
            onStrategyFileChanged={handleAgentFileChanged}
          />
        </div>
      </div>
      )}

      <StrategyCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        name={createName}
        onNameChange={setCreateName}
        platform={createPlatform}
        onPlatformChange={setCreatePlatform}
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
        onConfirm={(selection) => void handleConfirmUniverse(selection)}
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
