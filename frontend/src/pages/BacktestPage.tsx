import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { IconChartAreaLine, IconPlus, IconTrash } from '@tabler/icons-react';
import { PanelResizeHandle } from '@/components/PanelResizeHandle';
import { StrategyChatPanel } from '@/components/StrategyChatPanel';
import { StrategyCodeEditor } from '@/components/StrategyCodeEditor';
import { StrategyCreateDialog } from '@/components/StrategyCreateDialog';
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
  normalizeStrategyPlatform,
  type StrategyPlatform,
} from '@/lib/strategyPlatforms';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/cn';
import {
  PRIMARY_BUTTON_CLASS,
  PRIMARY_LIST_ITEM_SELECTED_CLASS,
} from '@/lib/primaryButton';
import { toast } from 'sonner';
import { useAgents } from '@/state/agents';

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

export default function BacktestPage() {
  const { refresh: refreshAgents, currentAgent } = useAgents();
  const [strategies, setStrategies] = useState<StrategySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [form, setForm] = useState<EditorForm>(() => emptyForm());
  const [dirty, setDirty] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

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
  }, []);

  useEffect(() => {
    void refresh();
    void refreshAgents();
  }, [refresh, refreshAgents]);

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
      const platform = normalizeStrategyPlatform(detail.platform);
      setForm({
        name: detail.name,
        platform,
        script: detail.script,
        path: detail.path || strategyRelPath(detail.name),
      });
      if (!opts?.preserveDirty) {
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
      setDirty(false);
    }
  }, [selectedName, loadDetail]);

  const resetCreateForm = () => {
    setCreateName('');
    setCreateError(null);
  };

  const openCreate = () => {
    resetCreateForm();
    setCreateOpen(true);
  };

  const handleCreateSubmit = async (e: FormEvent) => {
    e.preventDefault();
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
    if (!selectedName) return;
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
      setForm({
        name: detail.name,
        platform: normalizeStrategyPlatform(detail.platform),
        script: detail.script,
        path: detail.path || strategyRelPath(detail.name),
      });
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
      const platform = normalizeStrategyPlatform(detail.platform);
      setForm({
        name: detail.name,
        platform,
        script: detail.script,
        path: detail.path || strategyRelPath(detail.name),
      });
      setDirty(false);
    } catch (err) {
      // Agent 运行中文件可能尚未就绪，静默失败，不打断用户
      console.warn('[Backtest] pull strategy after agent run failed:', err);
    }
  }, [selectedName]);

  const updateField = <K extends keyof EditorForm>(key: K, value: EditorForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const strategyReady = !dirty && Boolean(form.path);

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
                      onClick={() => setSelectedName(s.name)}
                    >
                      <div className="truncate text-sm font-medium">{s.name}</div>
                      <div className="mt-1 text-[10px] text-muted-foreground/70">
                        更新于 {formatUpdatedAt(s.updated_at)}
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
          <PanelResizeHandle {...listResize.handleProps} />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!selectedName ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
                <IconChartAreaLine className="size-7 text-primary" />
              </div>
              <h2 className="text-base font-medium">量化策略管理</h2>
              <p className="max-w-md text-sm text-muted-foreground">
                每个策略对应一个 Python 文件。保存后可通过右侧 AI 对话，让 Agent 直接修改策略文件。
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
                {form.path && (
                  <span className="hidden truncate font-mono text-[11px] text-muted-foreground sm:inline">
                    {form.path}
                  </span>
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
                    className={PRIMARY_BUTTON_CLASS}
                    disabled={submitting || detailLoading}
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
            strategyName={selectedName}
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
        nameConflict={createNameConflict}
        busy={createBusy}
        error={createError}
        onSubmit={handleCreateSubmit}
        onCancel={resetCreateForm}
      />
      {confirmDialog}
    </div>
  );
}
