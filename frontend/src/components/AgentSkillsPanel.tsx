import { useEffect, useMemo, useState } from 'react';
import {
  IconChevronRight,
  IconFile,
  IconFileDescription,
  IconFolder,
  IconFolderOpen,
  IconTrash,
} from '@tabler/icons-react';
import { getAgentSkills, type AgentSkillItem } from '../api/agents';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/cn';

const SOURCE_ORDER = ['workspace', 'global', 'builtin'] as const;

/** 被点击打开的 skill 文件定位信息。 */
export interface SkillFileTarget {
  source: string;
  /** 磁盘文件夹名 */
  skill: string;
  /** 相对该 skill 目录的文件名，如 SKILL.md */
  file: string;
  /** 阅读面板标题（含相对路径） */
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
  /** 点击某个 skill 文件时触发，用于在阅读面板中打开。 */
  onOpenFile?: (target: SkillFileTarget) => void;
  /** 当前已打开文件的 key（高亮选中行）。 */
  activeFileKey?: string | null;
  /** 提供则在每个 skill 包上显示删除按钮。 */
  onDeleteSkill?: (source: string, skill: string, name: string) => void;
  /** 外部触发刷新（如删除后）。 */
  refreshRev?: number;
}

function TreeIndent({ depth }: { depth: number }) {
  if (depth <= 0) return null;
  return (
    <span className="flex shrink-0" aria-hidden>
      {Array.from({ length: depth }, (_, i) => (
        <span
          key={i}
          className="inline-block w-4 border-l border-border/30"
          style={{ marginLeft: i === 0 ? 0 : undefined }}
        />
      ))}
    </span>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <IconChevronRight
      className={cn(
        'size-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-150',
        open && 'rotate-90',
      )}
      stroke={2}
    />
  );
}

function SkillFileRow({
  depth,
  fileName,
  label,
  isPrimary,
  onOpen,
  selected,
}: {
  depth: number;
  fileName: string;
  label?: string;
  isPrimary?: boolean;
  onOpen?: () => void;
  selected?: boolean;
}) {
  const Icon = isPrimary ? IconFileDescription : IconFile;
  const clickable = !!onOpen;
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={onOpen}
      title={clickable ? '点击查看文件内容' : undefined}
      className={cn(
        'group flex w-full min-w-0 items-center gap-1.5 rounded-md px-1 py-1 text-left',
        clickable ? 'cursor-pointer hover:bg-muted/60' : 'cursor-default',
        selected && 'bg-accent/80',
      )}
    >
      <TreeIndent depth={depth} />
      <span className="inline-flex w-3.5 shrink-0" aria-hidden />
      <Icon
        className={cn(
          'size-3.5 shrink-0',
          isPrimary ? 'text-violet-500/80' : 'text-muted-foreground/70',
        )}
        stroke={1.75}
      />
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">{fileName}</span>
      {label && label !== fileName && (
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">{label}</span>
      )}
    </button>
  );
}

interface OpenCtx {
  onOpenFile?: (target: SkillFileTarget) => void;
  activeFileKey?: string | null;
  onDeleteSkill?: (source: string, skill: string, name: string) => void;
}

function SkillDeleteButton({ ctx, skill }: { ctx: OpenCtx; skill: AgentSkillItem }) {
  if (!ctx.onDeleteSkill) return null;
  const dir = skill.dir || skill.name;
  return (
    <button
      type="button"
      className="absolute right-1 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover/skill:opacity-100"
      onClick={(e) => {
        e.stopPropagation();
        ctx.onDeleteSkill!(skill.source, dir, skill.name);
      }}
      title="删除该 Skill 包"
      aria-label="删除该 Skill 包"
    >
      <IconTrash className="size-3.5" />
    </button>
  );
}

/** 构造一个打开文件的回调（dir 缺失时退回 skill 名）。 */
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

function SkillFolderNode({
  depth,
  skill,
  defaultOpen,
  ctx,
}: {
  depth: number;
  skill: AgentSkillItem;
  defaultOpen: boolean;
  ctx: OpenCtx;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const subSkills = skill.sub_skills ?? [];
  const hasChildren = subSkills.length > 0;

  if (!hasChildren) {
    return (
      <div className="group/skill relative flex items-center">
        <SkillFileRow
          depth={depth}
          fileName={`${skill.name}/`}
          label="SKILL.md"
          isPrimary
          onOpen={makeOpen(ctx, skill, 'SKILL.md')}
          selected={isSelected(ctx, skill, 'SKILL.md')}
        />
        <SkillDeleteButton ctx={ctx} skill={skill} />
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="group/skill relative flex items-center">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full min-w-0 items-center gap-1.5 rounded-md px-1 py-1 text-left hover:bg-muted/40"
          >
            <TreeIndent depth={depth} />
            <Chevron open={open} />
            {open ? (
              <IconFolderOpen className="size-3.5 shrink-0 text-amber-500/80" stroke={1.75} />
            ) : (
              <IconFolder className="size-3.5 shrink-0 text-amber-500/80" stroke={1.75} />
            )}
            <span className="font-mono text-[11px] text-foreground">{skill.name}/</span>
          </button>
        </CollapsibleTrigger>
        <SkillDeleteButton ctx={ctx} skill={skill} />
      </div>
      <CollapsibleContent>
        <SkillFileRow
          depth={depth + 1}
          fileName="SKILL.md"
          isPrimary
          onOpen={makeOpen(ctx, skill, 'SKILL.md')}
          selected={isSelected(ctx, skill, 'SKILL.md')}
        />
        {subSkills.map((sub) => {
          const file = sub.file || `${sub.name}.md`;
          return (
            <SkillFileRow
              key={sub.name}
              depth={depth + 1}
              fileName={file}
              onOpen={makeOpen(ctx, skill, file)}
              selected={isSelected(ctx, skill, file)}
            />
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}

function SourceFolderNode({
  source,
  items,
  ctx,
}: {
  source: string;
  items: AgentSkillItem[];
  ctx: OpenCtx;
}) {
  const [open, setOpen] = useState(true);
  const label = SOURCE_LABELS[source] ?? source;
  const path = SOURCE_PATHS[source] ?? `${source}/`;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full min-w-0 items-center gap-1.5 rounded-md px-1 py-1.5 text-left hover:bg-muted/50"
        >
          <Chevron open={open} />
          {open ? (
            <IconFolderOpen className="size-4 shrink-0 text-sky-500/80" stroke={1.75} />
          ) : (
            <IconFolder className="size-4 shrink-0 text-sky-500/80" stroke={1.75} />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-foreground">{label}</span>
              <span className="font-mono text-[10px] text-muted-foreground">{path}</span>
            </div>
          </div>
          <Badge variant="secondary" className="h-4 shrink-0 px-1.5 text-[9px]">
            {items.length} 包
          </Badge>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-1">
        {items.map((skill) => (
          <SkillFolderNode
            key={skill.name}
            depth={1}
            skill={skill}
            defaultOpen={skill.active || (skill.sub_skills?.length ?? 0) > 0}
            ctx={ctx}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function SkillTree({ grouped, ctx }: { grouped: GroupedSkills[]; ctx: OpenCtx }) {
  return (
    <>
      {grouped.map(({ source, items }) =>
        source === 'workspace' ? (
          items.map((skill) => (
            <SkillFolderNode
              key={`${source}-${skill.name}`}
              depth={0}
              skill={skill}
              defaultOpen={skill.active || (skill.sub_skills?.length ?? 0) > 0}
              ctx={ctx}
            />
          ))
        ) : (
          <SourceFolderNode key={source} source={source} items={items} ctx={ctx} />
        ),
      )}
    </>
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
  const [configuredSkills, setConfiguredSkills] = useState<string[]>([]);
  const [skills, setSkills] = useState<AgentSkillItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getAgentSkills(agentName)
      .then((body) => {
        if (cancelled) return;
        setConfiguredSkills(body.configured_skills ?? []);
        setSkills(body.skills ?? []);
        setTotalCount(body.total_count ?? body.skills?.length ?? 0);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setSkills([]);
        setTotalCount(0);
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
    <div className={cn('flex h-full min-h-0 flex-1 flex-col overflow-hidden', className)}>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading ? (
          <p className="text-xs text-muted-foreground">加载 Skill 列表…</p>
        ) : error ? (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-destructive">
            ⚠️ {error}
          </div>
        ) : skills.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <div className="text-2xl" aria-hidden>
              🧩
            </div>
            <p className="text-sm text-muted-foreground">暂无 Skill</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              可在 Agent 工作区添加 Skill，或在对话中请 Agent 协助安装。
            </p>
          </div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">
                共 {totalCount} 项
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {skills.length} 个 Skill 包
              </Badge>
              {configuredSkills.length > 0 && (
                <Badge variant="outline" className="text-[10px] font-normal">
                  AGENT.md 限定 {configuredSkills.length} 项
                </Badge>
              )}
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/10 p-2 font-mono text-xs">
              <SkillTree grouped={grouped} ctx={ctx} />
            </div>

            {configuredSkills.length > 0 && (
              <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
                AGENT.md 已配置：{configuredSkills.join('、')}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
