import { cn } from '@/lib/cn';

export function agentInitial(name: string): string {
  const ch = name.trim().charAt(0);
  return ch ? ch.toUpperCase() : '?';
}

const SIZE_CLASSES = {
  sm: 'h-8 w-8 text-[11px] rounded-lg',
  md: 'h-9 w-9 text-xs rounded-xl',
  lg: 'h-11 w-11 text-sm rounded-xl',
  xl: 'h-14 w-14 text-base rounded-2xl',
} as const;

export type AgentAvatarSize = keyof typeof SIZE_CLASSES;

export interface AgentAvatarProps {
  name: string;
  size?: AgentAvatarSize;
  className?: string;
  title?: string;
}

/** Agent 列表 / 对话消息等处统一的字母头像。 */
export function AgentAvatar({ name, size = 'md', className, title }: AgentAvatarProps) {
  const label = title ?? name;
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center bg-gradient-to-br from-violet-500 to-violet-600 font-semibold text-white shadow-sm shadow-violet-500/25',
        SIZE_CLASSES[size],
        className,
      )}
      title={label}
      aria-label={label}
      role="img"
    >
      {agentInitial(name)}
    </div>
  );
}
