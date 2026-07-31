import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import {
  IconBuildingWarehouse,
  IconChartAreaLine,
  IconCopy,
  IconExternalLink,
  IconPlus,
  IconShare2,
  IconTrash,
} from '@tabler/icons-react';
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
  PRIMARY_LIST_ITEM_SELECTED_CLASS,
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
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/50 px-4">
        <SidebarExpandTrigger />
        <h1 className="min-w-0 flex-1 text-base font-medium tracking-tight text-foreground/90">量化回测</h1>
        <ThemeToggle />
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          className="relative flex shrink-0 flex-col border-r border-border/50 bg-muted/20"
          style={{ width: listResize.width }}
        >
          <div className="space-y-2 border-b border-border/50 p-3">
            <Input
              placeholder="搜索策略…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm"
            />
            <Button
              type="button"
              size="sm"
              className={cn('h-8 w-full gap-1', PRIMARY_BUTTON_CLASS)}
              onClick={openCreate}
            >
              <IconPlus className="size-4" />
              新建策略
            </Button>
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
              <ul className="space-y-0.5 p-2">
                {sortedFiltered.map((s) => (
                  <li
                    key={s.name}
                    className={cn(
                      'group flex items-stretch gap-0.5 rounded-lg transition-colors',
                      selectedName === s.name && PRIMARY_LIST_ITEM_SELECTED_CLASS,
                    )}
                  >
                    <button
                      type="button"
                      className={cn(
                        'min-w-0 flex-1 rounded-lg px-3 py-2.5 text-left',
                        selectedName !== s.name && 'hover:bg-muted/60',
                      )}
                      onClick={() => {
                        setSelectedName(s.name);
                        setShowLibrary(false);
                        setLibraryEntry(null);
                      }}
                    >
                      <span className="block min-w-0 truncate text-sm font-medium">{s.name}</span>
                      <div className="mt-1 flex min-w-0 items-center justify-between gap-2">
                        <StrategyPlatformBadge platform={s.platform} />
                        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
                          {formatUpdatedAt(s.updated_at)}
                        </span>
                      </div>
                    </button>
                    <button
                      type="button"
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center self-center rounded-md',
                        'text-muted-foreground/50 opacity-0 transition-opacity',
                        'group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive',
                        selectedName === s.name && 'opacity-100',
                      )}
                      onClick={() => void handleDelete(s.name)}
                      title="删除策略"
                      aria-label={`删除策略 ${s.name}`}
                    >
                      <IconTrash className="size-3.5" stroke={1.75} />
                    </button>
                  </li>
                ))}
              </ul>
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
                每个策略对应一个 Python 文件。保存后可通过右侧 AI 对话让 Agent 直接修改策略文件，再复制到
                {' '}
                <a
                  href={getStrategyPlatformConfig(DEFAULT_STRATEGY_PLATFORM).backtestUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  聚宽回测平台
                </a>
                {' '}
                运行验证。点击左侧「策略库」可查看社区分享的策略。
              </p>
              <Button type="button" className={PRIMARY_BUTTON_CLASS} onClick={openCreate}>
                <IconPlus className="size-4" />
                新建策略
              </Button>
            </div>
          ) : (
            <>
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/50 px-4 py-3">
                <Input
                  placeholder="策略名称"
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  className="h-8 max-w-[220px] text-sm font-medium"
                  disabled={detailLoading}
                />
                <StrategyPlatformBadge platform={form.platform} />
                {form.path && (
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="hidden truncate font-mono text-[11px] text-muted-foreground sm:inline">
                      {form.path}
                    </span>
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
                  </div>
                )}
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  {dirty && (
                    <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400">
                      未保存
                    </Badge>
                  )}
                  <Button
                    type="button"
                    size="sm"
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
                    size="sm"
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
                    size="sm"
                    disabled={!dirty || submitting || detailLoading}
                    onClick={handleRevert}
                  >
                    撤销
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className={cn(dirty ? PRIMARY_BUTTON_CLASS : SAVE_BUTTON_IDLE_CLASS)}
                    disabled={submitting || detailLoading || !dirty}
                    onClick={() => void handleSave()}
                  >
                    {submitting ? '保存中…' : '保存'}
                  </Button>
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
