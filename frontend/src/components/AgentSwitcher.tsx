import type { SyntheticEvent } from 'react';
import { IconExternalLink } from '@tabler/icons-react';
import { AgentAvatar } from '@/components/AgentAvatar';
import type { AgentSummary } from '@/api/agents';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
  /** default：表单式；sidebar：侧栏全宽；inline：顶栏文字+箭头；composer：输入框底部（Cursor 式） */
  variant?: 'default' | 'sidebar' | 'inline' | 'composer';
  showAvatar?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
  /** 下拉开合回调。 */
  onOpenChange?: (open: boolean) => void;
  /** 提供后，每个 Agent 行尾出现「详情」图标，点击跳转 Agent 管理。 */
  onShowDetail?: (name: string) => void;
}

/** 阻止下拉项把图标按钮上的指针事件当作「选中该项」。 */
function stopItemSelect(e: SyntheticEvent) {
  e.stopPropagation();
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
  onOpenChange,
  onShowDetail,
}: AgentSwitcherProps) {
  const isSidebar = variant === 'sidebar';
  const isInline = variant === 'inline';
  const isComposer = variant === 'composer';

  const showDetail = Boolean(onShowDetail);
  const selectedAgent = agents.find((a) => a.name === value);

  return (
    <div className={cn('min-w-0', isSidebar && 'w-full', className)}>
      <Select
        value={value ?? undefined}
        onValueChange={onChange}
        disabled={disabled}
        onOpenChange={onOpenChange}
      >
        <SelectTrigger
          size={isSidebar ? 'default' : isComposer ? 'sm' : size}
          aria-label={ariaLabel}
          className={cn(
            isInline &&
              'h-auto max-w-none gap-0.5 rounded-[min(var(--radius-md),10px)] border-0 bg-transparent px-2 py-1.5 text-[15px] font-medium shadow-none transition-all duration-150 hover:bg-violet-500/14 hover:text-violet-700 hover:shadow-[0_0_0_1px_rgba(139,92,246,0.22)] data-[state=open]:bg-violet-500/14 data-[state=open]:text-violet-700 data-[state=open]:shadow-[0_0_0_1px_rgba(139,92,246,0.22)] focus-visible:bg-violet-500/14 focus-visible:text-violet-700 focus-visible:ring-2 focus-visible:ring-violet-500/35 dark:hover:bg-violet-500/22 dark:hover:text-violet-300 dark:data-[state=open]:bg-violet-500/22 dark:data-[state=open]:text-violet-300 [&_svg]:size-4 [&_svg]:opacity-70',
            isComposer &&
              'h-7 max-w-[10rem] gap-1 rounded-md border-0 bg-transparent px-1.5 py-0 text-xs font-medium text-foreground/85 shadow-none transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground focus-visible:ring-2 focus-visible:ring-violet-500/35 dark:bg-transparent dark:hover:bg-muted/80 dark:data-[state=open]:bg-muted/80 [&_svg]:size-3 [&_svg]:opacity-50',
            isSidebar &&
              'h-10 w-full rounded-xl border-0 bg-muted/55 px-2.5 shadow-none transition-colors hover:bg-muted/80 data-[state=open]:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30 [&_svg]:opacity-60',
            !isInline &&
              !isSidebar &&
              !isComposer &&
              'min-w-[10rem] max-w-[min(100%,18rem)] flex-1 justify-between',
            triggerClassName,
          )}
        >
          <span
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2 text-left',
              (isSidebar || isInline || isComposer) && 'font-medium',
              (isInline || isComposer) && 'gap-1.5',
            )}
          >
            {showAvatar && selectedAgent && (
              <AgentAvatar
                name={selectedAgent.name}
                hasAvatar={selectedAgent.has_avatar}
                avatarRevision={avatarRevision}
                size="sm"
                className={cn(
                  '!shadow-none',
                  isComposer ? '!h-4 !w-4 !rounded-full !text-[8px]' : '!h-6 !w-6 !text-[10px]',
                )}
              />
            )}
            <SelectValue
              placeholder={placeholder}
              className={cn('truncate', (isSidebar || isInline) && 'text-[15px]', isComposer && 'text-xs')}
            />
          </span>
        </SelectTrigger>
        <SelectContent
          position="popper"
          align="start"
          side={isComposer ? 'top' : 'bottom'}
          className={cn(
            (isSidebar || isInline) && 'min-w-[12rem] rounded-xl border-border/60 shadow-lg',
            isComposer && 'min-w-[12rem] rounded-xl border-border/60 shadow-lg',
          )}
        >
          {agents.map((agent) => (
            <SelectItem
              key={agent.name}
              value={agent.name}
              textValue={agent.name}
              valueLabel={<span className="min-w-0 truncate">{agent.name}</span>}
              className={cn((isSidebar || isInline) && 'rounded-lg py-2', showDetail && 'pr-[3.25rem]')}
              trailing={
                showDetail ? (
                  <span className="pointer-events-auto absolute right-7 top-1/2 flex -translate-y-1/2 items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          tabIndex={-1}
                          aria-label="查看详情"
                          className="flex size-5 cursor-pointer items-center justify-center rounded-md bg-violet-500/15 text-violet-600 shadow-sm transition-colors hover:bg-violet-500/25 hover:text-violet-700 dark:bg-violet-400/20 dark:text-violet-300 dark:hover:bg-violet-400/30"
                          onPointerDown={stopItemSelect}
                          onPointerUp={stopItemSelect}
                          onClick={(e) => {
                            e.stopPropagation();
                            onShowDetail?.(agent.name);
                          }}
                        >
                          <IconExternalLink className="size-3" stroke={1.85} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="z-[1300]">
                        查看详情 · 前往 Agent 管理
                      </TooltipContent>
                    </Tooltip>
                  </span>
                ) : undefined
              }
            >
              {showAvatar ? (
                <AgentAvatar
                  name={agent.name}
                  hasAvatar={agent.has_avatar}
                  avatarRevision={avatarRevision}
                  size="sm"
                  className="!h-6 !w-6 !text-[10px]"
                />
              ) : null}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
