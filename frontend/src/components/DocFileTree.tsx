import { useState, useEffect, useRef, useCallback } from 'react';
import { IconFileDescription, IconLoader2, IconRefresh } from '@tabler/icons-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { listAgentDocs, type DocFileEntry } from '@/api/agentDocs';
import { rowPaddingLeft, TreeChevronSlot } from '@/components/asset-tree-layout';
import {
  AssetTreeDirButton,
  AssetTreeDirRow,
  AssetTreeFileRow,
} from '@/components/asset-tree-rows';

interface DocFileTreeProps {
  agentName: string;
  refreshRev: number;
  onFileSelect: (fullPath: string) => void;
  selectedDocPath: string | null;
  /** 隐藏内部标题（在共享「Agent 资产」标题下使用时）。 */
  hideHeader?: boolean;
  /** 提供则在每行显示删除按钮。 */
  onDelete?: (fullPath: string, isDir: boolean) => void;
  /** 提供则在文件行显示下载按钮。 */
  onDownload?: (fullPath: string) => void;
}

function sortFiles(files: DocFileEntry[]): DocFileEntry[] {
  return [...files].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function DocFileTree({ agentName, refreshRev, onFileSelect, selectedDocPath, hideHeader, onDelete, onDownload }: DocFileTreeProps) {
  const [treeCache, setTreeCache] = useState<Map<string, DocFileEntry[]>>(new Map());
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [rootError, setRootError] = useState<string | null>(null);
  const loadGen = useRef(0);

  useEffect(() => {
    setTreeCache(new Map());
    setExpandedDirs(new Set());
    setLoadingDirs(new Set());
    setRootError(null);
  }, [agentName]);

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

  useEffect(() => {
    setTreeCache(new Map());
    setRootError(null);
    void fetchDir('');
  }, [fetchDir, refreshRev]);

  const toggleDir = useCallback(
    (dirPath: string) => {
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        if (next.has(dirPath)) {
          next.delete(dirPath);
        } else {
          next.add(dirPath);
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
      {!hideHeader && (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-border/40 px-3 py-2.5">
          <IconFileDescription className="size-3.5 text-muted-foreground/70" />
          <span className="text-xs font-medium text-muted-foreground/80">Agent 资产</span>
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1 overflow-x-hidden">
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
          <div className="w-full min-w-0 overflow-x-hidden px-1 pb-2 pt-1">
            <DirectoryNode
              dirPath=""
              entries={treeCache.get('') ?? []}
              depth={0}
              onFileSelect={onFileSelect}
              selectedDocPath={selectedDocPath}
              treeCache={treeCache}
              expandedDirs={expandedDirs}
              loadingDirs={loadingDirs}
              onToggleDir={toggleDir}
              onRetryDir={fetchDir}
              onDelete={onDelete}
              onDownload={onDownload}
            />
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

interface DirectoryNodeProps {
  dirPath: string;
  entries: DocFileEntry[];
  depth: number;
  onFileSelect: (fullPath: string) => void;
  selectedDocPath: string | null;
  treeCache: Map<string, DocFileEntry[]>;
  expandedDirs: Set<string>;
  loadingDirs: Set<string>;
  onToggleDir: (dirPath: string) => void;
  onRetryDir: (dirPath: string) => void;
  onDelete?: (fullPath: string, isDir: boolean) => void;
  onDownload?: (fullPath: string) => void;
}

function DirectoryNode({
  dirPath,
  entries,
  depth,
  onFileSelect,
  selectedDocPath,
  treeCache,
  expandedDirs,
  loadingDirs,
  onToggleDir,
  onRetryDir,
  onDelete,
  onDownload,
}: DirectoryNodeProps) {
  const sorted = sortFiles(entries);

  return (
    <div className="w-full min-w-0">
      {sorted.map((f) => {
        const fullPath = dirPath ? `${dirPath}/${f.name}` : f.name;

        if (f.is_dir) {
          return (
            <DirItem
              key={fullPath}
              name={f.name}
              dirPath={fullPath}
              depth={depth}
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
              onDownload={onDownload}
            />
          );
        }

        return (
          <AssetTreeFileRow
            key={fullPath}
            name={f.name}
            depth={depth}
            selected={selectedDocPath === fullPath}
            title={fullPath}
            onClick={() => onFileSelect(fullPath)}
            onDownload={onDownload ? () => onDownload(fullPath) : undefined}
            onDelete={onDelete ? () => onDelete(fullPath, false) : undefined}
          />
        );
      })}
    </div>
  );
}

interface DirItemProps {
  name: string;
  dirPath: string;
  depth: number;
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
  onDownload?: (fullPath: string) => void;
}

function DirItem({
  name,
  dirPath,
  depth,
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
  onDownload,
}: DirItemProps) {
  return (
    <Collapsible open={expanded} onOpenChange={onToggle}>
      <AssetTreeDirRow
        onDelete={onDelete ? () => onDelete(dirPath, true) : undefined}
        deleteTitle="删除文件夹"
        trigger={
          <CollapsibleTrigger asChild>
            <AssetTreeDirButton name={name} depth={depth} expanded={expanded} loading={loading} />
          </CollapsibleTrigger>
        }
      />
      <CollapsibleContent>
        {childrenEntries === null && !loading ? (
          <div
            className="flex items-center gap-1 py-1"
            style={{ paddingLeft: rowPaddingLeft(depth + 1) }}
          >
            <TreeChevronSlot />
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
            depth={depth + 1}
            onFileSelect={onFileSelect}
            selectedDocPath={selectedDocPath}
            treeCache={treeCache}
            expandedDirs={expandedDirs}
            loadingDirs={loadingDirs}
            onToggleDir={onToggleDir}
            onRetryDir={onRetryDir}
            onDelete={onDelete}
            onDownload={onDownload}
          />
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}
