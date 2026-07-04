import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconLoader2 } from '@tabler/icons-react';
import {
  getAgentSkills,
  listAgentSkillDir,
  type AgentSkillItem,
  type SkillDirEntry,
} from '../api/agents';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { rowPaddingLeft, TreeChevronSlot } from '@/components/asset-tree-layout';
import {
  AssetTreeDirButton,
  AssetTreeDirRow,
  AssetTreeFileRow,
} from '@/components/asset-tree-rows';
import { cn } from '@/lib/cn';

const SOURCE_ORDER = ['workspace', 'global', 'builtin'] as const;

/** 被点击打开的 skill 文件定位信息。 */
export interface SkillFileTarget {
  source: string;
  skill: string;
  file: string;
  title: string;
}

export function skillFileKey(source: string, skill: string, file: string): string {
  return `${source}::${skill}::${file}`;
}

const SOURCE_LABELS: Record<string, string> = {
  global: '全局',
  builtin: '内置',
};

const SOURCE_PATHS: Record<string, string> = {
  global: '~/.picoclaw/skills/',
  builtin: 'builtin/skills/',
};

interface GroupedSkills {
  source: string;
  items: AgentSkillItem[];
}

function groupSkillsBySource(skills: AgentSkillItem[]): GroupedSkills[] {
  const map = new Map<string, AgentSkillItem[]>();
  for (const s of skills) {
    const key = s.source || 'unknown';
    const arr = map.get(key) ?? [];
    arr.push(s);
    map.set(key, arr);
  }
  for (const items of map.values()) {
    items.sort((a, b) => a.name.localeCompare(b.name));
  }
  const result: GroupedSkills[] = SOURCE_ORDER.filter((k) => map.has(k)).map((k) => ({
    source: k,
    items: map.get(k)!,
  }));
  for (const [source, items] of map.entries()) {
    if (!SOURCE_ORDER.includes(source as (typeof SOURCE_ORDER)[number])) {
      result.push({ source, items });
    }
  }
  return result;
}

interface AgentSkillsPanelProps {
  agentName: string;
  className?: string;
  onOpenFile?: (target: SkillFileTarget) => void;
  activeFileKey?: string | null;
  onDeleteSkill?: (source: string, skill: string, name: string) => void;
  onDeleteSkillPath?: (
    source: string,
    skill: string,
    relPath: string,
    isDir: boolean,
    skillName: string,
  ) => void;
  onDownloadSkillPath?: (source: string, skill: string, relPath: string) => void;
  onShareSkillPath?: (source: string, skill: string, relPath: string, isDir?: boolean) => void;
  refreshRev?: number;
}

interface OpenCtx {
  agentName: string;
  onOpenFile?: (target: SkillFileTarget) => void;
  activeFileKey?: string | null;
  onDeleteSkill?: (source: string, skill: string, name: string) => void;
  onDeleteSkillPath?: (
    source: string,
    skill: string,
    relPath: string,
    isDir: boolean,
    skillName: string,
  ) => void;
  onDownloadSkillPath?: (source: string, skill: string, relPath: string) => void;
  onShareSkillPath?: (source: string, skill: string, relPath: string, isDir?: boolean) => void;
  refreshRev?: number;
}

function makeDeleteSkillHandler(
  ctx: OpenCtx,
  skill: AgentSkillItem,
  onAfterDelete?: () => void | Promise<void>,
): (() => void) | undefined {
  if (skill.source !== 'workspace' || !ctx.onDeleteSkill) return undefined;
  const dir = skill.dir || skill.name;
  return () => {
    void (async () => {
      await ctx.onDeleteSkill!(skill.source, dir, skill.name);
      await onAfterDelete?.();
    })();
  };
}

function makeDownloadPathHandler(
  ctx: OpenCtx,
  skill: AgentSkillItem,
  relPath: string,
): (() => void) | undefined {
  if (!ctx.onDownloadSkillPath) return undefined;
  const dir = skill.dir || skill.name;
  return () => ctx.onDownloadSkillPath!(skill.source, dir, relPath);
}

function makeSharePathHandler(
  ctx: OpenCtx,
  skill: AgentSkillItem,
  relPath: string,
): (() => void) | undefined {
  if (!ctx.onShareSkillPath) return undefined;
  const dir = skill.dir || skill.name;
  return () => ctx.onShareSkillPath!(skill.source, dir, relPath, false);
}

function makeDeletePathHandler(
  ctx: OpenCtx,
  skill: AgentSkillItem,
  relPath: string,
  isDir: boolean,
  onAfterDelete?: () => void | Promise<void>,
): (() => void) | undefined {
  if (skill.source !== 'workspace' || !ctx.onDeleteSkillPath) return undefined;
  const dir = skill.dir || skill.name;
  return () => {
    void (async () => {
      await ctx.onDeleteSkillPath!(skill.source, dir, relPath, isDir, skill.name);
      await onAfterDelete?.();
    })();
  };
}

function makeOpen(
  ctx: OpenCtx,
  skill: AgentSkillItem,
  file: string,
): (() => void) | undefined {
  if (!ctx.onOpenFile) return undefined;
  const dir = skill.dir || skill.name;
  if (!dir) return undefined;
  const title = `${skill.name}/${file}`;
  return () => ctx.onOpenFile!({ source: skill.source, skill: dir, file, title });
}

function isSelected(ctx: OpenCtx, skill: AgentSkillItem, file: string): boolean {
  if (!ctx.activeFileKey) return false;
  const dir = skill.dir || skill.name;
  return ctx.activeFileKey === skillFileKey(skill.source, dir, file);
}

function sortEntries(files: SkillDirEntry[]): SkillDirEntry[] {
  return [...files].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function SkillDirNode({
  skill,
  dirPath,
  entries,
  depth,
  ctx,
  treeCache,
  expandedDirs,
  loadingDirs,
  onSetDirExpanded,
  onRetryDir,
  onRefetchTree,
}: {
  skill: AgentSkillItem;
  dirPath: string;
  entries: SkillDirEntry[];
  depth: number;
  ctx: OpenCtx;
  treeCache: Map<string, SkillDirEntry[]>;
  expandedDirs: Set<string>;
  loadingDirs: Set<string>;
  onSetDirExpanded: (cacheKey: string, open: boolean) => void;
  onRetryDir: (cacheKey: string, subpath: string) => void;
  onRefetchTree: () => Promise<void>;
}) {
  const sorted = sortEntries(entries);
  const skillDir = skill.dir || skill.name;
  const cachePrefix = `${skill.source}::${skillDir}::`;

  return (
    <div className="w-full min-w-0">
      {sorted.map((f) => {
        const fullPath = dirPath ? `${dirPath}/${f.name}` : f.name;
        const cacheKey = `${cachePrefix}${fullPath}`;

        if (f.is_dir) {
          return (
            <SkillSubDirItem
              key={cacheKey}
              name={f.name}
              dirPath={fullPath}
              depth={depth}
              skill={skill}
              ctx={ctx}
              expanded={expandedDirs.has(cacheKey)}
              loading={loadingDirs.has(cacheKey)}
              childrenEntries={treeCache.get(cacheKey) ?? null}
              onOpenChange={(open) => onSetDirExpanded(cacheKey, open)}
              onRetry={() => onRetryDir(cacheKey, fullPath)}
              treeCache={treeCache}
              expandedDirs={expandedDirs}
              loadingDirs={loadingDirs}
              onSetDirExpanded={onSetDirExpanded}
              onRetryDir={onRetryDir}
              onRefetchTree={onRefetchTree}
            />
          );
        }

        return (
          <AssetTreeFileRow
            key={cacheKey}
            name={f.name}
            depth={depth}
            selected={isSelected(ctx, skill, fullPath)}
            title={`${skill.name}/${fullPath}`}
            onClick={makeOpen(ctx, skill, fullPath)}
            onShare={makeSharePathHandler(ctx, skill, fullPath)}
            onDownload={makeDownloadPathHandler(ctx, skill, fullPath)}
            onDelete={makeDeletePathHandler(ctx, skill, fullPath, false, onRefetchTree)}
          />
        );
      })}
    </div>
  );
}

function SkillSubDirItem({
  name,
  dirPath,
  depth,
  skill,
  ctx,
  expanded,
  loading,
  childrenEntries,
  onOpenChange,
  onRetry,
  treeCache,
  expandedDirs,
  loadingDirs,
  onSetDirExpanded,
  onRetryDir,
  onRefetchTree,
}: {
  name: string;
  dirPath: string;
  depth: number;
  skill: AgentSkillItem;
  ctx: OpenCtx;
  expanded: boolean;
  loading: boolean;
  childrenEntries: SkillDirEntry[] | null;
  onOpenChange: (open: boolean) => void;
  onRetry: () => void;
  treeCache: Map<string, SkillDirEntry[]>;
  expandedDirs: Set<string>;
  loadingDirs: Set<string>;
  onSetDirExpanded: (cacheKey: string, open: boolean) => void;
  onRetryDir: (cacheKey: string, subpath: string) => void;
  onRefetchTree: () => Promise<void>;
}) {
  const skillDir = skill.dir || skill.name;
  const cacheKey = `${skill.source}::${skillDir}::${dirPath}`;

  return (
    <Collapsible open={expanded} onOpenChange={onOpenChange}>
      <AssetTreeDirRow
        onDelete={makeDeletePathHandler(ctx, skill, dirPath, true, async () => {
          onSetDirExpanded(cacheKey, false);
          await onRefetchTree();
        })}
        onDownload={makeDownloadPathHandler(ctx, skill, dirPath)}
        deleteTitle="删除文件夹"
        downloadTitle="下载文件夹"
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
          <SkillDirNode
            skill={skill}
            dirPath={dirPath}
            entries={childrenEntries}
            depth={depth + 1}
            ctx={ctx}
            treeCache={treeCache}
            expandedDirs={expandedDirs}
            loadingDirs={loadingDirs}
            onSetDirExpanded={onSetDirExpanded}
            onRetryDir={onRetryDir}
            onRefetchTree={onRefetchTree}
          />
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Skill 包：与文档目录一致，可展开并懒加载全部文件与子目录。 */
function SkillFolderNode({
  depth,
  skill,
  ctx,
}: {
  depth: number;
  skill: AgentSkillItem;
  ctx: OpenCtx;
}) {
  const [open, setOpen] = useState(false);
  const [treeCache, setTreeCache] = useState<Map<string, SkillDirEntry[]>>(new Map());
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [rootError, setRootError] = useState<string | null>(null);
  const loadGenByKey = useRef<Map<string, number>>(new Map());
  const expandedDirsRef = useRef(expandedDirs);
  expandedDirsRef.current = expandedDirs;
  const openRef = useRef(open);
  const skipRefreshOnMount = useRef(true);
  expandedDirsRef.current = expandedDirs;
  openRef.current = open;

  const skillDir = skill.dir || skill.name;
  const rootCacheKey = `${skill.source}::${skillDir}::`;

  useEffect(() => {
    loadGenByKey.current = new Map();
    setTreeCache(new Map());
    setExpandedDirs(new Set());
    setLoadingDirs(new Set());
    setRootError(null);
    setOpen(false);
    skipRefreshOnMount.current = true;
  }, [ctx.agentName, skill.source, skillDir]);

  const fetchDir = useCallback(
    async (cacheKey: string, subpath: string) => {
      const nextGen = (loadGenByKey.current.get(cacheKey) ?? 0) + 1;
      loadGenByKey.current.set(cacheKey, nextGen);
      setLoadingDirs((prev) => new Set(prev).add(cacheKey));
      try {
        const body = await listAgentSkillDir(ctx.agentName, skill.source, skillDir, subpath || undefined);
        if (loadGenByKey.current.get(cacheKey) !== nextGen) return;
        setTreeCache((prev) => new Map(prev).set(cacheKey, body.files ?? []));
        if (cacheKey === rootCacheKey) setRootError(null);
      } catch (err: unknown) {
        if (loadGenByKey.current.get(cacheKey) !== nextGen) return;
        if (cacheKey === rootCacheKey) {
          setRootError(err instanceof Error ? err.message : '加载失败');
        }
      } finally {
        if (loadGenByKey.current.get(cacheKey) === nextGen) {
          setLoadingDirs((prev) => {
            const next = new Set(prev);
            next.delete(cacheKey);
            return next;
          });
        }
      }
    },
    [ctx.agentName, skill.source, skillDir, rootCacheKey],
  );

  const refetchVisibleDirs = useCallback(async () => {
    if (!openRef.current) return;
    const keys = [rootCacheKey, ...Array.from(expandedDirsRef.current)];
    await Promise.all(
      keys.map((cacheKey) => fetchDir(cacheKey, cacheKey.slice(rootCacheKey.length))),
    );
  }, [fetchDir, rootCacheKey]);

  useEffect(() => {
    if (skipRefreshOnMount.current) {
      skipRefreshOnMount.current = false;
      return;
    }
    void refetchVisibleDirs();
  }, [ctx.refreshRev, refetchVisibleDirs]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next && !treeCache.has(rootCacheKey)) {
        void fetchDir(rootCacheKey, '');
      }
    },
    [treeCache, rootCacheKey, fetchDir],
  );

  const setDirExpanded = useCallback(
    (cacheKey: string, open: boolean) => {
      setExpandedDirs((prev) => {
        const has = prev.has(cacheKey);
        if (open === has) return prev;
        const next = new Set(prev);
        if (open) next.add(cacheKey);
        else next.delete(cacheKey);
        return next;
      });
      if (open && !treeCache.has(cacheKey)) {
        const rel = cacheKey.slice(rootCacheKey.length);
        void fetchDir(cacheKey, rel);
      }
    },
    [treeCache, rootCacheKey, fetchDir],
  );

  const onDelete = makeDeleteSkillHandler(ctx, skill, refetchVisibleDirs);
  const onDownload = makeDownloadPathHandler(ctx, skill, '');

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange}>
      <AssetTreeDirRow
        onDelete={onDelete}
        onDownload={onDownload}
        deleteTitle="删除该 Skill 包"
        downloadTitle="下载 Skill 包"
        trigger={
          <CollapsibleTrigger asChild>
            <AssetTreeDirButton name={skill.name} depth={depth} expanded={open} />
          </CollapsibleTrigger>
        }
      />
      <CollapsibleContent>
        {rootError ? (
          <p className="px-3 py-2 text-[11px] text-destructive">{rootError}</p>
        ) : open && !treeCache.has(rootCacheKey) && loadingDirs.has(rootCacheKey) ? (
          <div className="flex items-center gap-1 py-1" style={{ paddingLeft: rowPaddingLeft(depth + 1) }}>
            <TreeChevronSlot />
            <IconLoader2 className="size-3 animate-spin text-muted-foreground/50" />
          </div>
        ) : treeCache.has(rootCacheKey) ? (
          <SkillDirNode
            skill={skill}
            dirPath=""
            entries={treeCache.get(rootCacheKey) ?? []}
            depth={depth + 1}
            ctx={ctx}
            treeCache={treeCache}
            expandedDirs={expandedDirs}
            loadingDirs={loadingDirs}
            onSetDirExpanded={setDirExpanded}
            onRetryDir={(cacheKey, subpath) => void fetchDir(cacheKey, subpath)}
            onRefetchTree={refetchVisibleDirs}
          />
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** 全局 / 内置来源分组：与文档目录行一致。 */
function SourceFolderNode({
  source,
  items,
  ctx,
}: {
  source: string;
  items: AgentSkillItem[];
  ctx: OpenCtx;
}) {
  const [open, setOpen] = useState(false);
  const label = SOURCE_LABELS[source] ?? source;
  const path = SOURCE_PATHS[source] ?? `${source}/`;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <AssetTreeDirRow
        trigger={
          <CollapsibleTrigger asChild>
            <AssetTreeDirButton
              name={label}
              depth={0}
              expanded={open}
              title={`${label} · ${path}`}
            />
          </CollapsibleTrigger>
        }
      />
      <CollapsibleContent>
        {items.map((skill) => (
          <SkillFolderNode key={skill.name} depth={1} skill={skill} ctx={ctx} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function SkillTree({ grouped, ctx }: { grouped: GroupedSkills[]; ctx: OpenCtx }) {
  return (
    <div className="w-full min-w-0">
      {grouped.map(({ source, items }) =>
        source === 'workspace' ? (
          items.map((skill) => (
            <SkillFolderNode key={`${source}-${skill.name}`} depth={0} skill={skill} ctx={ctx} />
          ))
        ) : (
          <SourceFolderNode key={source} source={source} items={items} ctx={ctx} />
        ),
      )}
    </div>
  );
}

export function AgentSkillsPanel({
  agentName,
  className,
  onOpenFile,
  activeFileKey,
  onDeleteSkill,
  onDeleteSkillPath,
  onDownloadSkillPath,
  onShareSkillPath,
  refreshRev,
}: AgentSkillsPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skills, setSkills] = useState<AgentSkillItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getAgentSkills(agentName)
      .then((body) => {
        if (cancelled) return;
        setSkills(body.skills ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setSkills([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentName, refreshRev]);

  const grouped = useMemo(() => groupSkillsBySource(skills), [skills]);
  const ctx = useMemo<OpenCtx>(
    () => ({
      agentName,
      onOpenFile,
      activeFileKey,
      onDeleteSkill,
      onDeleteSkillPath,
      onDownloadSkillPath,
      onShareSkillPath,
      refreshRev,
    }),
    [agentName, onOpenFile, activeFileKey, onDeleteSkill, onDeleteSkillPath, onDownloadSkillPath, onShareSkillPath, refreshRev],
  );

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <ScrollArea className="min-h-0 flex-1 overflow-x-hidden">
        {loading ? (
          <div className="px-3 py-6 text-center text-[11px] text-muted-foreground">
            <IconLoader2 className="mx-auto mb-1.5 size-4 animate-spin text-muted-foreground/50" />
            加载中...
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-1.5 px-3 py-6 text-center">
            <p className="text-[11px] text-destructive">{error}</p>
          </div>
        ) : skills.length === 0 ? (
          <p className="px-3 py-6 text-center text-[11px] leading-relaxed text-muted-foreground">
            暂无 Skill，可在工作区添加或请 Agent 协助安装
          </p>
        ) : (
          <div className="w-full min-w-0 overflow-x-hidden px-1 pb-2 pt-1">
            <SkillTree grouped={grouped} ctx={ctx} />
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
