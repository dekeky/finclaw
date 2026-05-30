import { useState, useEffect, useRef, useCallback } from 'react';
import {
  IconFileDescription,
  IconFolder,
  IconChevronRight,
  IconLoader2,
  IconRefresh,
  IconTrash,
} from '@tabler/icons-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { listAgentDocs, type DocFileEntry } from '@/api/agentDocs';
import { cn } from '@/lib/cn';

interface DocFileTreeProps {
  agentName: string;
  refreshRev: number;
  onFileSelect: (fullPath: string) => void;
  selectedDocPath: string | null;
  /** 隐藏内部标题（在共享「Agent 资产」标题下使用时）。 */
  hideHeader?: boolean;
  /** 提供则在每行显示删除按钮。 */
  onDelete?: (fullPath: string, isDir: boolean) => void;
}

function sortFiles(files: DocFileEntry[]): DocFileEntry[] {
  return [...files].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isMarkdown(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown');
}

/** 文件图标颜色：markdown 文件用 violet，其他用 muted */
function fileIconClass(name: string): string {
  return isMarkdown(name) ? 'text-violet-500/70' : 'text-muted-foreground';
}

export function DocFileTree({ agentName, refreshRev, onFileSelect, selectedDocPath, hideHeader, onDelete }: DocFileTreeProps) {
  /** 缓存：subpath → 该目录下的文件列表 */
  const [treeCache, setTreeCache] = useState<Map<string, DocFileEntry[]>>(new Map());
  /** 展开的目录集合 */
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  /** 正在加载的目录集合 */
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [rootError, setRootError] = useState<string | null>(null);
  const loadGen = useRef(0);

  // agent 变化时重置所有状态
  useEffect(() => {
    setTreeCache(new Map());
    setExpandedDirs(new Set());
    setLoadingDirs(new Set());
    setRootError(null);
  }, [agentName]);

  // 加载指定目录的文件列表
  const fetchDir = useCallback(
    async (subpath: string) => {
      if (!agentName) return;
      const gen = ++loadGen.current;
      setLoadingDirs((prev) => new Set(prev).add(subpath));
      try {
        const body = await listAgentDocs(agentName, subpath || undefined);
        if (gen !== loadGen.current) return;
        setTreeCache((prev) => new Map(prev).set(subpath, body.files ?? []));
        if (subpath === '') setRootError(null);
      } catch (err: any) {
        if (gen !== loadGen.current) return;
        if (subpath === '') setRootError(err.message || '加载失败');
      } finally {
        if (gen === loadGen.current) {
          setLoadingDirs((prev) => {
            const next = new Set(prev);
            next.delete(subpath);
            return next;
          });
        }
      }
    },
    [agentName],
  );

  // 初始加载根目录 & refreshRev 变化时重新加载
  useEffect(() => {
    setTreeCache(new Map());
    setRootError(null);
    void fetchDir('');
  }, [fetchDir, refreshRev]);

  // 切换目录展开/折叠
  const toggleDir = useCallback(
    (dirPath: string) => {
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        if (next.has(dirPath)) {
          next.delete(dirPath);
        } else {
          next.add(dirPath);
          // 如果尚未缓存，则加载
          if (!treeCache.has(dirPath)) {
            void fetchDir(dirPath);
          }
        }
        return next;
      });
    },
    [treeCache, fetchDir],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      {!hideHeader && (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-border/40 px-3 py-2.5">
          <IconFileDescription className="size-3.5 text-muted-foreground/70" />
          <span className="text-xs font-medium text-muted-foreground/80">Agent 资产</span>
        </div>
      )}

      {/* Tree */}
      <ScrollArea className="min-h-0 flex-1">
        {rootError ? (
          <div className="flex flex-col items-center gap-1.5 px-3 py-6 text-center">
            <p className="text-[11px] text-destructive">{rootError}</p>
            <button
              type="button"
              className="flex items-center gap-1 text-[11px] text-violet-500 hover:underline"
              onClick={() => void fetchDir('')}
            >
              <IconRefresh className="size-3" />
              重试
            </button>
          </div>
        ) : !treeCache.has('') ? (
          <div className="px-3 py-6 text-center text-[11px] text-muted-foreground">
            <IconLoader2 className="mx-auto mb-1.5 size-4 animate-spin text-muted-foreground/50" />
            加载中...
          </div>
        ) : (treeCache.get('') ?? []).length === 0 ? (
          <p className="px-3 py-6 text-center text-[11px] leading-relaxed text-muted-foreground">
            暂无文档，让 AI 生成一份文档吧
          </p>
        ) : (
          <div className="pb-2">
            <DirectoryNode
              dirPath=""
              entries={treeCache.get('') ?? []}
              level={0}
              onFileSelect={onFileSelect}
              selectedDocPath={selectedDocPath}
              treeCache={treeCache}
              expandedDirs={expandedDirs}
              loadingDirs={loadingDirs}
              onToggleDir={toggleDir}
              onRetryDir={fetchDir}
              onDelete={onDelete}
            />
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

// ─── 递归目录节点 ───

interface DirectoryNodeProps {
  dirPath: string;
  entries: DocFileEntry[];
  level: number;
  onFileSelect: (fullPath: string) => void;
  selectedDocPath: string | null;
  treeCache: Map<string, DocFileEntry[]>;
  expandedDirs: Set<string>;
  loadingDirs: Set<string>;
  onToggleDir: (dirPath: string) => void;
  onRetryDir: (dirPath: string) => void;
  onDelete?: (fullPath: string, isDir: boolean) => void;
}

function DirectoryNode({
  dirPath,
  entries,
  level,
  onFileSelect,
  selectedDocPath,
  treeCache,
  expandedDirs,
  loadingDirs,
  onToggleDir,
  onRetryDir,
  onDelete,
}: DirectoryNodeProps) {
  const sorted = sortFiles(entries);
  const paddingLeft = 8 + level * 12;

  return (
    <div>
      {sorted.map((f) => {
        const fullPath = dirPath ? `${dirPath}/${f.name}` : f.name;

        if (f.is_dir) {
          return (
            <DirItem
              key={fullPath}
              name={f.name}
              dirPath={fullPath}
              level={level}
              paddingLeft={paddingLeft}
              expanded={expandedDirs.has(fullPath)}
              loading={loadingDirs.has(fullPath)}
              childrenEntries={treeCache.get(fullPath) ?? null}
              onToggle={() => onToggleDir(fullPath)}
              onRetry={() => onRetryDir(fullPath)}
              onFileSelect={onFileSelect}
              selectedDocPath={selectedDocPath}
              treeCache={treeCache}
              expandedDirs={expandedDirs}
              loadingDirs={loadingDirs}
              onToggleDir={onToggleDir}
              onRetryDir={onRetryDir}
              onDelete={onDelete}
            />
          );
        }

        return (
          <FileItem
            key={fullPath}
            name={f.name}
            fullPath={fullPath}
            size={f.size}
            paddingLeft={paddingLeft}
            selected={selectedDocPath === fullPath}
            onClick={() => onFileSelect(fullPath)}
            onDelete={onDelete ? () => onDelete(fullPath, false) : undefined}
          />
        );
      })}
    </div>
  );
}

// ─── 目录行 ───

interface DirItemProps {
  name: string;
  dirPath: string;
  level: number;
  paddingLeft: number;
  expanded: boolean;
  loading: boolean;
  childrenEntries: DocFileEntry[] | null;
  onToggle: () => void;
  onRetry: () => void;
  onFileSelect: (fullPath: string) => void;
  selectedDocPath: string | null;
  treeCache: Map<string, DocFileEntry[]>;
  expandedDirs: Set<string>;
  loadingDirs: Set<string>;
  onToggleDir: (dirPath: string) => void;
  onRetryDir: (dirPath: string) => void;
  onDelete?: (fullPath: string, isDir: boolean) => void;
}

function DirItem({
  name,
  dirPath,
  level,
  paddingLeft,
  expanded,
  loading,
  childrenEntries,
  onToggle,
  onRetry,
  onFileSelect,
  selectedDocPath,
  treeCache,
  expandedDirs,
  loadingDirs,
  onToggleDir,
  onRetryDir,
  onDelete,
}: DirItemProps) {
  return (
    <Collapsible open={expanded} onOpenChange={onToggle}>
      <div className="group/row relative flex items-center">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-1 rounded-md py-1.5 pr-2 text-left transition-colors hover:bg-muted/80"
            style={{ paddingLeft }}
          >
            <IconChevronRight
              className={cn(
                'size-3 shrink-0 text-muted-foreground/50 transition-transform duration-150',
                expanded && 'rotate-90',
              )}
            />
            <IconFolder className="size-3.5 shrink-0 text-amber-500/70" />
            <span className="min-w-0 flex-1 truncate text-xs text-foreground/90">{name}</span>
            {loading && <IconLoader2 className="size-3 shrink-0 animate-spin text-muted-foreground/50" />}
          </button>
        </CollapsibleTrigger>
        {onDelete && (
          <button
            type="button"
            className="absolute right-1 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover/row:opacity-100"
            onClick={(e) => { e.stopPropagation(); onDelete(dirPath, true); }}
            title="删除文件夹"
            aria-label="删除文件夹"
          >
            <IconTrash className="size-3.5" />
          </button>
        )}
      </div>
      <CollapsibleContent>
        {childrenEntries === null && !loading ? (
          // 目录列表未加载且未在加载中（理论上不应发生）
          <div className="py-1" style={{ paddingLeft: paddingLeft + 12 }}>
            <button
              type="button"
              className="text-[11px] text-violet-500 hover:underline"
              onClick={onRetry}
            >
              加载
            </button>
          </div>
        ) : childrenEntries !== null ? (
          <DirectoryNode
            dirPath={dirPath}
            entries={childrenEntries}
            level={level + 1}
            onFileSelect={onFileSelect}
            selectedDocPath={selectedDocPath}
            treeCache={treeCache}
            expandedDirs={expandedDirs}
            loadingDirs={loadingDirs}
            onToggleDir={onToggleDir}
            onRetryDir={onRetryDir}
            onDelete={onDelete}
          />
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── 文件行 ───

interface FileItemProps {
  name: string;
  fullPath: string;
  size: number;
  paddingLeft: number;
  selected: boolean;
  onClick: () => void;
  onDelete?: () => void;
}

function FileItem({ name, fullPath, size, paddingLeft, selected, onClick, onDelete }: FileItemProps) {
  return (
    <div className="group/row relative flex items-center">
      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left transition-colors hover:bg-muted/80',
          selected && 'bg-accent/80',
        )}
        style={{ paddingLeft }}
        onClick={onClick}
        title={fullPath}
      >
        <IconFileDescription className={cn('size-3.5 shrink-0', fileIconClass(name))} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs text-foreground/90">{name}</span>
        </span>
        <span className={cn('shrink-0 text-[10px] text-muted-foreground', onDelete && 'group-hover/row:invisible')}>
          {formatSize(size)}
        </span>
      </button>
      {onDelete && (
        <button
          type="button"
          className="absolute right-1 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover/row:opacity-100"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="删除文件"
          aria-label="删除文件"
        >
          <IconTrash className="size-3.5" />
        </button>
      )}
    </div>
  );
}
