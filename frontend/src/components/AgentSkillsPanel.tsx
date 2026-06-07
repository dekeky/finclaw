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
  refreshRev?: number;
}

function makeDeleteSkillHandler(ctx: OpenCtx, skill: AgentSkillItem): (() => void) | undefined {
  if (skill.source !== 'workspace' || !ctx.onDeleteSkill) return undefined;
  const dir = skill.dir || skill.name;
  return () => ctx.onDeleteSkill!(skill.source, dir, skill.name);
}

function makeDeletePathHandler(
  ctx: OpenCtx,
  skill: AgentSkillItem,
  relPath: string,
  isDir: boolean,
): (() => void) | undefined {
  if (skill.source !== 'workspace' || !ctx.onDeleteSkillPath) return undefined;
  const dir = skill.dir || skill.name;
  return () => ctx.onDeleteSkillPath!(skill.source, dir, relPath, isDir, skill.name);
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
  onToggleDir,
  onRetryDir,
}: {
  skill: AgentSkillItem;
  dirPath: string;
  entries: SkillDirEntry[];
  depth: number;
  ctx: OpenCtx;
  treeCache: Map<string, SkillDirEntry[]>;
  expandedDirs: Set<string>;
  loadingDirs: Set<string>;
  onToggleDir: (cacheKey: string) => void;
  onRetryDir: (cacheKey: string, subpath: string) => void;
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
              onToggle={() => onToggleDir(cacheKey)}
              onRetry={() => onRetryDir(cacheKey, fullPath)}
              treeCache={treeCache}
              expandedDirs={expandedDirs}
              loadingDirs={loadingDirs}
              onToggleDir={onToggleDir}
              onRetryDir={onRetryDir}
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
            onDelete={makeDeletePathHandler(ctx, skill, fullPath, false)}
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
  onToggle,
  onRetry,
  treeCache,
  expandedDirs,
  loadingDirs,
  onToggleDir,
  onRetryDir,
}: {
  name: string;
  dirPath: string;
  depth: number;
  skill: AgentSkillItem;
  ctx: OpenCtx;
  expanded: boolean;
  loading: boolean;
  childrenEntries: SkillDirEntry[] | null;
  onToggle: () => void;
  onRetry: () => void;
  treeCache: Map<string, SkillDirEntry[]>;
  expandedDirs: Set<string>;
  loadingDirs: Set<string>;
  onToggleDir: (cacheKey: string) => void;
  onRetryDir: (cacheKey: string, subpath: string) => void;
}) {
  return (
    <Collapsible open={expanded} onOpenChange={onToggle}>
      <AssetTreeDirRow
        onDelete={makeDeletePathHandler(ctx, skill, dirPath, true)}
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
          <SkillDirNode
            skill={skill}
            dirPath={dirPath}
            entries={childrenEntries}
            depth={depth + 1}
            ctx={ctx}
            treeCache={treeCache}
            expandedDirs={expandedDirs}
            loadingDirs={loadingDirs}
            onToggleDir={onToggleDir}
            onRetryDir={onRetryDir}
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
  const loadGen = useRef(0);

  const skillDir = skill.dir || skill.name;
  const rootCacheKey = `${skill.source}::${skillDir}::`;

  useEffect(() => {
    setTreeCache(new Map());
    setExpandedDirs(new Set());
    setLoadingDirs(new Set());
    setRootError(null);
    setOpen(false);
  }, [ctx.agentName, skill.source, skillDir, ctx.refreshRev]);

  const fetchDir = useCallback(
    async (cacheKey: string, subpath: string) => {
      const gen = ++loadGen.current;
      setLoadingDirs((prev) => new Set(prev).add(cacheKey));
      try {
        const body = await listAgentSkillDir(ctx.agentName, skill.source, skillDir, subpath || undefined);
        if (gen !== loadGen.current) return;
        setTreeCache((prev) => new Map(prev).set(cacheKey, body.files ?? []));
        if (cacheKey === rootCacheKey) setRootError(null);
      } catch (err: unknown) {
        if (gen !== loadGen.current) return;
        if (cacheKey === rootCacheKey) {
          setRootError(err instanceof Error ? err.message : '加载失败');
        }
      } finally {
        if (gen === loadGen.current) {
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

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next && !treeCache.has(rootCacheKey)) {
        void fetchDir(rootCacheKey, '');
      }
    },
    [treeCache, rootCacheKey, fetchDir],
  );

  const toggleDir = useCallback(
    (cacheKey: string) => {
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        if (next.has(cacheKey)) {
          next.delete(cacheKey);
        } else {
          next.add(cacheKey);
          if (!treeCache.has(cacheKey)) {
            const rel = cacheKey.slice(rootCacheKey.length);
            void fetchDir(cacheKey, rel);
          }
        }
        return next;
      });
    },
    [treeCache, rootCacheKey, fetchDir],
  );

  const onDelete = makeDeleteSkillHandler(ctx, skill);

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange}>
      <AssetTreeDirRow
        onDelete={onDelete}
        deleteTitle="删除该 Skill 包"
        trigger={
          <CollapsibleTrigger asChild>
            <AssetTreeDirButton name={skill.name} depth={depth} expanded={open} />
          </CollapsibleTrigger>
        }
      />
      <CollapsibleContent>
        {rootError ? (
          <p className="px-3 py-2 text-[11px] text-destructive">{rootError}</p>
        ) : open && !treeCache.has(rootCacheKey) ? (
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
            onToggleDir={toggleDir}
            onRetryDir={(cacheKey, subpath) => void fetchDir(cacheKey, subpath)}
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
      refreshRev,
    }),
    [agentName, onOpenFile, activeFileKey, onDeleteSkill, onDeleteSkillPath, refreshRev],
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
