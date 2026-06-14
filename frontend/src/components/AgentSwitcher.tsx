import { AgentAvatar } from '@/components/AgentAvatar';
import type { AgentSummary } from '@/api/agents';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/cn';

export interface AgentSwitcherProps {
  agents: AgentSummary[];
  value: string | null;
  onChange: (name: string) => void;
  avatarRevision?: number;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  size?: 'sm' | 'default';
  /** default：表单式；sidebar：侧栏全宽；inline：元宝主区左上角文字+箭头 */
  variant?: 'default' | 'sidebar' | 'inline';
  showAvatar?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
}

/** Agent 切换下拉，基于 shadcn/ui Select（Radix UI）。 */
export function AgentSwitcher({
  agents,
  value,
  onChange,
  avatarRevision = 0,
  placeholder = '选择 Agent…',
  className,
  triggerClassName,
  size = 'sm',
  variant = 'default',
  showAvatar = true,
  disabled,
  'aria-label': ariaLabel = '选择 Agent',
}: AgentSwitcherProps) {
  const isSidebar = variant === 'sidebar';
  const isInline = variant === 'inline';
  const selected = agents.find((a) => a.name === value);

  return (
    <div className={cn('min-w-0', isSidebar && 'w-full', className)}>
      <Select value={value ?? undefined} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger
          size={isSidebar ? 'default' : size}
          aria-label={ariaLabel}
          className={cn(
            isInline &&
              'h-auto max-w-none gap-0.5 rounded-[min(var(--radius-md),10px)] border-0 bg-transparent px-2 py-1.5 text-[15px] font-medium shadow-none transition-all duration-150 hover:bg-violet-500/14 hover:text-violet-700 hover:shadow-[0_0_0_1px_rgba(139,92,246,0.22)] data-[state=open]:bg-violet-500/14 data-[state=open]:text-violet-700 data-[state=open]:shadow-[0_0_0_1px_rgba(139,92,246,0.22)] focus-visible:bg-violet-500/14 focus-visible:text-violet-700 focus-visible:ring-2 focus-visible:ring-violet-500/35 dark:hover:bg-violet-500/22 dark:hover:text-violet-300 dark:data-[state=open]:bg-violet-500/22 dark:data-[state=open]:text-violet-300 [&_svg]:size-4 [&_svg]:opacity-70',
            isSidebar &&
              'h-10 w-full rounded-xl border-0 bg-muted/55 px-2.5 shadow-none transition-colors hover:bg-muted/80 data-[state=open]:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30 [&_svg]:opacity-60',
            !isInline &&
              !isSidebar &&
              'min-w-[10rem] max-w-[min(100%,18rem)] flex-1 justify-between',
            triggerClassName,
          )}
        >
          <span
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2.5 text-left',
              (isSidebar || isInline) && 'font-medium',
              isInline && 'gap-1',
            )}
          >
            {/* {showAvatar && selected && !isInline && (
              <AgentAvatar
                name={selected.name}
                hasAvatar={selected.has_avatar}
                avatarRevision={avatarRevision}
                size="sm"
                className={cn(
                  'shrink-0',
                  isSidebar ? '!h-7 !w-7 !text-[11px]' : '!h-6 !w-6 !text-[10px]',
                )}
              />
            )} */}
            <SelectValue
              placeholder={placeholder}
              className={cn('truncate', (isSidebar || isInline) && 'text-[15px]')}
            />
          </span>
        </SelectTrigger>
        <SelectContent
          position="popper"
          align="start"
          className={cn(
            (isSidebar || isInline) && 'min-w-[12rem] rounded-xl border-border/60 shadow-lg',
          )}
        >
          {agents.map((agent) => (
            <SelectItem
              key={agent.name}
              value={agent.name}
              className={cn((isSidebar || isInline) && 'rounded-lg py-2')}
            >
              <span className="flex items-center gap-2.5">
                {showAvatar && (
                  <AgentAvatar
                    name={agent.name}
                    hasAvatar={agent.has_avatar}
                    avatarRevision={avatarRevision}
                    size="sm"
                    className="!h-6 !w-6 !text-[10px]"
                  />
                )}
                <span className="truncate">{agent.name}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
