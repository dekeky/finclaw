import { useEffect, useMemo, useState } from 'react';
import {
  IconChevronRight,
  IconFile,
  IconFileDescription,
  IconFolder,
  IconFolderOpen,
} from '@tabler/icons-react';
import { getAgentSkills, type AgentSkillItem, type AgentSubSkillItem } from '../api/agents';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/cn';

const SOURCE_ORDER = ['workspace', 'global', 'builtin'] as const;

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
  description,
  active,
  isPrimary,
}: {
  depth: number;
  fileName: string;
  label?: string;
  description?: string;
  active?: boolean;
  isPrimary?: boolean;
}) {
  const Icon = isPrimary ? IconFileDescription : IconFile;
  return (
    <div
      className={cn(
        'group flex min-w-0 items-start gap-1.5 rounded-md px-1 py-1 hover:bg-muted/40',
        !active && isPrimary && 'opacity-60',
      )}
    >
      <TreeIndent depth={depth} />
      <span className="inline-flex w-3.5 shrink-0" aria-hidden />
      <Icon
        className={cn(
          'mt-0.5 size-3.5 shrink-0',
          isPrimary ? 'text-violet-500/80' : 'text-muted-foreground/70',
        )}
        stroke={1.75}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[11px] text-foreground">{fileName}</span>
          {label && label !== fileName && (
            <span className="font-mono text-[10px] text-muted-foreground/70">{label}</span>
          )}
          {isPrimary &&
            (active ? (
              <Badge variant="default" className="h-4 px-1 text-[9px]">
                已启用
              </Badge>
            ) : (
              <Badge variant="outline" className="h-4 px-1 text-[9px]">
                未启用
              </Badge>
            ))}
        </div>
        {description && (
          <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  );
}

function SkillFolderNode({
  depth,
  skill,
  defaultOpen,
}: {
  depth: number;
  skill: AgentSkillItem;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const subSkills = skill.sub_skills ?? [];
  const hasChildren = subSkills.length > 0;

  if (!hasChildren) {
    return (
      <SkillFileRow
        depth={depth}
        fileName={`${skill.name}/`}
        label="SKILL.md"
        description={skill.description}
        active={skill.active}
        isPrimary
      />
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full min-w-0 items-center gap-1.5 rounded-md px-1 py-1 text-left hover:bg-muted/40',
            !skill.active && 'opacity-60',
          )}
        >
          <TreeIndent depth={depth} />
          <Chevron open={open} />
          {open ? (
            <IconFolderOpen className="size-3.5 shrink-0 text-amber-500/80" stroke={1.75} />
          ) : (
            <IconFolder className="size-3.5 shrink-0 text-amber-500/80" stroke={1.75} />
          )}
          <span className="font-mono text-[11px] text-foreground">{skill.name}/</span>
          {skill.active ? (
            <Badge variant="default" className="ml-auto h-4 shrink-0 px-1 text-[9px]">
              已启用
            </Badge>
          ) : (
            <Badge variant="outline" className="ml-auto h-4 shrink-0 px-1 text-[9px]">
              未启用
            </Badge>
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <SkillFileRow
          depth={depth + 1}
          fileName="SKILL.md"
          description={skill.description}
          active={skill.active}
          isPrimary
        />
        {subSkills.map((sub) => (
          <SubSkillFileRow key={sub.name} depth={depth + 1} sub={sub} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function SubSkillFileRow({ depth, sub }: { depth: number; sub: AgentSubSkillItem }) {
  return (
    <SkillFileRow
      depth={depth}
      fileName={sub.file || `${sub.name}.md`}
      description={sub.description}
    />
  );
}

function SourceFolderNode({
  source,
  items,
}: {
  source: string;
  items: AgentSkillItem[];
}) {
  const [open, setOpen] = useState(true);
  const activeCount = items.filter((s) => s.active).length;
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
            {items.length} 包 · {activeCount} 启用
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
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function SkillTree({ grouped }: { grouped: GroupedSkills[] }) {
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
            />
          ))
        ) : (
          <SourceFolderNode key={source} source={source} items={items} />
        ),
      )}
    </>
  );
}

export function AgentSkillsPanel({ agentName, className }: AgentSkillsPanelProps) {
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
  }, [agentName]);

  const grouped = useMemo(() => groupSkillsBySource(skills), [skills]);
  const activeCount = skills.filter((s) => s.active).length;

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
                {skills.length} 个 Skill 包 · {activeCount} 已启用
              </Badge>
              {configuredSkills.length > 0 && (
                <Badge variant="outline" className="text-[10px] font-normal">
                  AGENT.md 限定 {configuredSkills.length} 项
                </Badge>
              )}
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/10 p-2 font-mono text-xs">
              <SkillTree grouped={grouped} />
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
