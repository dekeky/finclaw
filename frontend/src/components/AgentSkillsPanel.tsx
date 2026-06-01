import { useEffect, useMemo, useState } from 'react';
import { IconLoader2 } from '@tabler/icons-react';
import { getAgentSkills, type AgentSkillItem } from '../api/agents';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  refreshRev?: number;
}

interface OpenCtx {
  onOpenFile?: (target: SkillFileTarget) => void;
  activeFileKey?: string | null;
  onDeleteSkill?: (source: string, skill: string, name: string) => void;
}

function canDeleteSkill(skill: AgentSkillItem, ctx: OpenCtx): boolean {
  return skill.source === 'workspace' && !!ctx.onDeleteSkill;
}

function makeDeleteHandler(ctx: OpenCtx, skill: AgentSkillItem): (() => void) | undefined {
  if (!canDeleteSkill(skill, ctx)) return undefined;
  const dir = skill.dir || skill.name;
  return () => ctx.onDeleteSkill!(skill.source, dir, skill.name);
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

function skillFiles(skill: AgentSkillItem): string[] {
  const files = ['SKILL.md'];
  for (const sub of skill.sub_skills ?? []) {
    files.push(sub.file || `${sub.name}.md`);
  }
  return files;
}

/** Skill 包：与文档目录一致，始终为可展开文件夹 + 子文件列表。 */
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
  const files = skillFiles(skill);
  const onDelete = makeDeleteHandler(ctx, skill);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
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
        {files.map((fileName) => (
          <AssetTreeFileRow
            key={fileName}
            name={fileName}
            depth={depth + 1}
            selected={isSelected(ctx, skill, fileName)}
            title={`${skill.name}/${fileName}`}
            onClick={makeOpen(ctx, skill, fileName)}
          />
        ))}
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
    () => ({ onOpenFile, activeFileKey, onDeleteSkill }),
    [onOpenFile, activeFileKey, onDeleteSkill],
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
