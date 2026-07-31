import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  IconArrowLeft,
  IconBuildingWarehouse,
  IconDownload,
  IconRefresh,
  IconTrash,
} from '@tabler/icons-react';
import {
  deleteStrategyLibraryEntry,
  getStrategyLibraryEntry,
  installStrategyFromLibrary,
  listStrategyLibrary,
  type StrategyLibraryDetail,
  type StrategyLibrarySummary,
} from '@/api/strategyLibrary';
import { StrategyCodeEditor } from '@/components/StrategyCodeEditor';
import { StrategyPlatformBadge } from '@/components/StrategyPlatformField';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useAuth } from '@/state/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/cn';
import { normalizeStrategyPlatform } from '@/lib/strategyPlatforms';
import { PRIMARY_BUTTON_CLASS } from '@/lib/primaryButton';
import { Dialog } from 'radix-ui';
import { toast } from 'sonner';

function suggestStrategyName(title: string, existingNames: string[]): string {
  const base = title.trim() || 'library-strategy';
  if (!existingNames.includes(base)) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = `${base}-${i}`;
    if (!existingNames.includes(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

interface StrategyLibraryInstallDialogProps {
  entry: StrategyLibrarySummary | null;
  existingStrategyNames: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstalled: (name: string) => void;
}

function StrategyLibraryInstallDialog({
  entry,
  existingStrategyNames,
  open,
  onOpenChange,
  onInstalled,
}: StrategyLibraryInstallDialogProps) {
  const { requireAuth } = useRequireAuth();
  const [installName, setInstallName] = useState('');
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  useEffect(() => {
    if (open && entry) {
      setInstallName(suggestStrategyName(entry.title, existingStrategyNames));
      setInstallError(null);
    }
  }, [open, entry, existingStrategyNames]);

  const nameConflict = useMemo(
    () => installName.trim().length > 0 && existingStrategyNames.includes(installName.trim()),
    [installName, existingStrategyNames],
  );

  const onInstall = async (e: FormEvent) => {
    e.preventDefault();
    if (!requireAuth() || !entry || installing || nameConflict || !installName.trim()) return;
    setInstalling(true);
    setInstallError(null);
    try {
      const created = await installStrategyFromLibrary(entry.id, { name: installName.trim() });
      onOpenChange(false);
      toast.success(`策略「${created.name}」已创建`);
      onInstalled(created.name);
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : String(err));
    } finally {
      setInstalling(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !installing && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1200] bg-black/45" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[1201] w-[min(92vw,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background p-5 shadow-2xl">
          <Dialog.Title className="text-lg font-semibold">创建到我的策略</Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-muted-foreground">
            从策略库「{entry?.title}」创建本地副本，之后可在量化回测中编辑。
          </Dialog.Description>
          <form onSubmit={onInstall} className="mt-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium">策略名称</label>
              <Input
                value={installName}
                onChange={(e) => setInstallName(e.target.value)}
                placeholder="本地策略名称"
                className="h-10 text-sm"
                disabled={installing}
                autoFocus
              />
              {nameConflict && (
                <p className="mt-1.5 text-[11px] text-destructive">已存在同名策略，请换一个名称。</p>
              )}
            </div>
            {installError && <p className="text-xs text-destructive">{installError}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" disabled={installing} onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button
                type="submit"
                size="sm"
                className={PRIMARY_BUTTON_CLASS}
                disabled={installing || !installName.trim() || nameConflict}
              >
                {installing ? '创建中…' : '确认创建'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface StrategyLibraryDetailViewProps {
  entry: StrategyLibrarySummary;
  existingStrategyNames: string[];
  onInstalled: (name: string) => void;
  onBack: () => void;
}

export function StrategyLibraryDetailView({
  entry,
  existingStrategyNames,
  onInstalled,
  onBack,
}: StrategyLibraryDetailViewProps) {
  const { user } = useAuth();
  const { requireAuth } = useRequireAuth();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [detail, setDetail] = useState<StrategyLibraryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [installOpen, setInstallOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setLoadError(null);
    setDetailLoading(true);
    void getStrategyLibraryEntry(entry.id)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entry.id]);

  const handleDelete = async () => {
    if (!requireAuth()) return;
    const ok = await confirm({
      title: `下架策略「${entry.title}」`,
      description: '将从策略库中移除该策略，已安装的用户副本不受影响。',
      confirmText: '下架',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteStrategyLibraryEntry(entry.id);
      toast.success('已从策略库下架');
      onBack();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '下架失败');
    }
  };

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/50 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={onBack}
            aria-label="返回"
          >
            <IconArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="truncate text-sm font-semibold text-foreground">{entry.title}</span>
              <StrategyPlatformBadge platform={normalizeStrategyPlatform(entry.platform)} />
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {entry.author_name || '匿名'} · {entry.install_count} 次使用 · {formatDate(entry.created_at)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {detail && user?.id === detail.user_id && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => void handleDelete()}
                aria-label="下架策略"
              >
                <IconTrash className="size-4" stroke={1.75} />
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              className={cn('h-8 text-xs', PRIMARY_BUTTON_CLASS)}
              disabled={detailLoading}
              onClick={() => {
                if (requireAuth()) setInstallOpen(true);
              }}
            >
              <IconDownload className="mr-1 size-3.5" />
              创建到我的策略
            </Button>
          </div>
        </div>

        {entry.summary && (
          <p className="shrink-0 border-b border-border/40 px-4 py-2 text-xs leading-relaxed text-muted-foreground">
            {entry.summary}
          </p>
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {detailLoading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">加载策略代码…</div>
          ) : detail ? (
            <StrategyCodeEditor value={detail.script} readOnly className="h-full" />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-destructive">{loadError || '加载失败'}</div>
          )}
        </div>
      </div>

      <StrategyLibraryInstallDialog
        entry={entry}
        existingStrategyNames={existingStrategyNames}
        open={installOpen}
        onOpenChange={setInstallOpen}
        onInstalled={onInstalled}
      />
      {confirmDialog}
    </>
  );
}

interface StrategyLibraryPanelProps {
  existingStrategyNames: string[];
  onInstalled: (name: string) => void;
  hideTitle?: boolean;
  search?: string;
  onSearchChange?: (value: string) => void;
  variant?: 'page' | 'cards';
  selectedEntryId?: string | null;
  onSelectEntry?: (entry: StrategyLibrarySummary | null) => void;
  refreshKey?: number;
}

export function StrategyLibraryPanel({
  existingStrategyNames,
  onInstalled,
  hideTitle = false,
  search: searchProp,
  onSearchChange,
  variant = 'page',
  selectedEntryId,
  onSelectEntry,
  refreshKey = 0,
}: StrategyLibraryPanelProps) {
  const { user } = useAuth();
  const { requireAuth } = useRequireAuth();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const isCards = variant === 'cards';

  const [entries, setEntries] = useState<StrategyLibrarySummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [internalSearch, setInternalSearch] = useState('');
  const search = searchProp ?? internalSearch;
  const setSearch = onSearchChange ?? setInternalSearch;
  const searchInHeader = searchProp !== undefined && !isCards;

  const [selected, setSelected] = useState<StrategyLibrarySummary | null>(null);
  const [detail, setDetail] = useState<StrategyLibraryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [installOpen, setInstallOpen] = useState(false);
  const [installName, setInstallName] = useState('');
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listStrategyLibrary(search.trim() || undefined);
      setEntries(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries, refreshKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        (e.summary ?? '').toLowerCase().includes(q) ||
        (e.author_name ?? '').toLowerCase().includes(q),
    );
  }, [entries, search]);

  const openEntry = useCallback(
    async (entry: StrategyLibrarySummary) => {
      if (isCards) {
        onSelectEntry?.(entry);
        return;
      }
      setSelected(entry);
      setDetail(null);
      setInstallOpen(false);
      setInstallError(null);
      setInstallName(suggestStrategyName(entry.title, existingStrategyNames));
      setDetailLoading(true);
      try {
        const d = await getStrategyLibraryEntry(entry.id);
        setDetail(d);
      } catch (err) {
        setInstallError(err instanceof Error ? err.message : String(err));
      } finally {
        setDetailLoading(false);
      }
    },
    [existingStrategyNames, isCards, onSelectEntry],
  );

  const nameConflict = useMemo(
    () => installName.trim().length > 0 && existingStrategyNames.includes(installName.trim()),
    [installName, existingStrategyNames],
  );

  const onInstall = async (e: FormEvent) => {
    e.preventDefault();
    if (!requireAuth() || !selected || installing || nameConflict || !installName.trim()) return;
    setInstalling(true);
    setInstallError(null);
    try {
      const created = await installStrategyFromLibrary(selected.id, { name: installName.trim() });
      setInstallOpen(false);
      toast.success(`策略「${created.name}」已创建`);
      onInstalled(created.name);
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : String(err));
    } finally {
      setInstalling(false);
    }
  };

  const handleDelete = async (entry: StrategyLibrarySummary) => {
    if (!requireAuth()) return;
    const ok = await confirm({
      title: `下架策略「${entry.title}」`,
      description: '将从策略库中移除该策略，已安装的用户副本不受影响。',
      confirmText: '下架',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteStrategyLibraryEntry(entry.id);
      toast.success('已从策略库下架');
      if (selected?.id === entry.id) {
        setSelected(null);
        setDetail(null);
      }
      await loadEntries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '下架失败');
    }
  };

  const searchQuery = search.trim();

  const cardGrid = (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {filtered.map((entry) => (
        <button
          key={entry.id}
          type="button"
          onClick={() => void openEntry(entry)}
          className={cn(
            'flex flex-col rounded-xl border border-border bg-card p-4 text-left transition-colors',
            'hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm',
            selectedEntryId === entry.id && 'border-primary/50 bg-primary/5 ring-1 ring-primary/20',
          )}
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <span className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
              {entry.title}
            </span>
            <StrategyPlatformBadge platform={normalizeStrategyPlatform(entry.platform)} />
          </div>
          <p className="line-clamp-3 flex-1 text-xs leading-relaxed text-muted-foreground">
            {entry.summary || '暂无描述'}
          </p>
          <div className="mt-3 flex items-center justify-between gap-2 text-[10px] text-muted-foreground/70">
            <span>{entry.author_name || '匿名'}</span>
            <span>{entry.install_count} 次使用 · {formatDate(entry.created_at)}</span>
          </div>
        </button>
      ))}
    </div>
  );

  const listContent = (
    <>
      {error && (
        <div className={cn('rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-destructive', !isCards && 'mb-4')}>
          加载策略库失败：{error}
        </div>
      )}

      {loading ? (
        <p className={cn('text-muted-foreground', isCards ? 'py-8 text-center text-sm' : 'text-sm')}>加载中…</p>
      ) : filtered.length === 0 ? (
        <div className={cn(
          isCards ? 'px-4 py-12 text-center' : 'rounded-xl border border-dashed border-border px-6 py-14 text-center',
        )}>
          {searchQuery ? (
            <>
              <p className={cn('text-muted-foreground', isCards ? 'text-sm' : 'text-sm text-foreground')}>
                {isCards ? (
                  <>未找到与「<span className="font-medium text-foreground">{searchQuery}</span>」相关的策略</>
                ) : (
                  <>
                    没有找到与「<span className="font-medium text-violet-600 dark:text-violet-300">{searchQuery}</span>」相关的策略
                  </>
                )}
              </p>
              <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => setSearch('')}>
                清除搜索
              </Button>
            </>
          ) : (
            <p className={cn('text-muted-foreground', isCards ? 'text-sm' : 'text-sm')}>
              策略库暂无内容，选择策略后点击「分享」即可发布到这里。
            </p>
          )}
        </div>
      ) : (
        cardGrid
      )}
    </>
  );

  if (isCards) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-border/40 bg-card/90 px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <IconBuildingWarehouse className="size-4 shrink-0 text-violet-500" stroke={1.75} />
            <h2 className="min-w-0 flex-1 text-sm font-semibold text-foreground">策略库</h2>
            {!loading && !error && (
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {searchQuery ? `找到 ${filtered.length} 个` : `共 ${filtered.length} 个`}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              onClick={() => void loadEntries()}
              aria-label="刷新策略库"
            >
              <IconRefresh className="size-4" stroke={1.75} />
            </Button>
          </div>
          <div className="relative mt-3">
            <Input
              placeholder="搜索策略名称或描述…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full text-sm"
            />
          </div>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="p-4 sm:p-6">{listContent}</div>
        </ScrollArea>
        {confirmDialog}
      </div>
    );
  }

  return (
    <>
      {!selected ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {!hideTitle && (
            <div className="shrink-0 px-6 pt-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <IconBuildingWarehouse className="size-5 text-violet-500" stroke={1.75} />
                策略库
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">浏览社区分享的量化策略，一键创建到本地。</p>
            </div>
          )}

          <div className="shrink-0 border-b border-border/40 bg-card/90 px-4 py-3 backdrop-blur-sm sm:px-6">
            {!searchInHeader && (
              <div className="relative mb-3">
                <Input
                  placeholder="搜索策略名称或描述…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 w-full text-sm"
                />
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              {!loading && !error && (
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {searchQuery ? `找到 ${filtered.length} 个` : `共 ${filtered.length} 个`}
                </span>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                onClick={() => void loadEntries()}
                aria-label="刷新策略库"
              >
                <IconRefresh className="size-4" stroke={1.75} />
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4 sm:p-6">{listContent}</div>
          </ScrollArea>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-border/50 px-4 py-2.5 sm:px-5">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                onClick={() => setSelected(null)}
                aria-label="返回策略列表"
              >
                <IconArrowLeft className="size-4" />
              </Button>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">{selected.title}</span>
                  <StrategyPlatformBadge platform={normalizeStrategyPlatform(selected.platform)} />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {selected.author_name || '匿名'} · {selected.install_count} 次使用 · {formatDate(selected.created_at)}
                </p>
                {selected.summary && (
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{selected.summary}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {detail && user?.id === detail.user_id && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => void handleDelete(selected)}
                    aria-label="下架策略"
                  >
                    <IconTrash className="size-4" stroke={1.75} />
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  className={cn('h-8 text-xs', PRIMARY_BUTTON_CLASS)}
                  disabled={detailLoading}
                  onClick={() => {
                    if (!requireAuth()) return;
                    setInstallError(null);
                    setInstallOpen(true);
                  }}
                >
                  <IconDownload className="mr-1 size-3.5" />
                  <span className="hidden sm:inline">创建到我的策略</span>
                  <span className="sm:hidden">创建</span>
                </Button>
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {detailLoading ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">加载策略代码…</div>
            ) : detail ? (
              <StrategyCodeEditor value={detail.script} readOnly className="h-full" />
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-destructive">{installError || '加载失败'}</div>
            )}
          </div>
        </div>
      )}

      <Dialog.Root open={installOpen} onOpenChange={(open) => !installing && setInstallOpen(open)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[1200] bg-black/45" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[1201] w-[min(92vw,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background p-5 shadow-2xl">
            <Dialog.Title className="text-lg font-semibold">创建到我的策略</Dialog.Title>
            <Dialog.Description className="mt-1 text-xs text-muted-foreground">
              从策略库「{selected?.title}」创建本地副本，之后可在量化回测中编辑。
            </Dialog.Description>
            <form onSubmit={onInstall} className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium">策略名称</label>
                <Input
                  value={installName}
                  onChange={(e) => setInstallName(e.target.value)}
                  placeholder="本地策略名称"
                  className="h-10 text-sm"
                  disabled={installing}
                  autoFocus
                />
                {nameConflict && (
                  <p className="mt-1.5 text-[11px] text-destructive">已存在同名策略，请换一个名称。</p>
                )}
              </div>
              {installError && <p className="text-xs text-destructive">{installError}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" disabled={installing} onClick={() => setInstallOpen(false)}>
                  取消
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className={PRIMARY_BUTTON_CLASS}
                  disabled={installing || !installName.trim() || nameConflict}
                >
                  {installing ? '创建中…' : '确认创建'}
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {confirmDialog}
    </>
  );
}
