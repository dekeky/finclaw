import { cn } from '@/lib/cn';
import { agentAvatarUrl } from '@/api/agents';

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
  hasAvatar?: boolean;
  /** 头像变更后递增，用于缓存失效。 */
  avatarRevision?: number;
  size?: AgentAvatarSize;
  className?: string;
  title?: string;
}

/** Agent 列表 / 对话消息等处统一头像：有自定义图则显示图片，否则字母头像。 */
export function AgentAvatar({
  name,
  hasAvatar = false,
  avatarRevision = 0,
  size = 'md',
  className,
  title,
}: AgentAvatarProps) {
  const label = title ?? name;
  const src = hasAvatar ? agentAvatarUrl(name, avatarRevision) : null;

  if (src) {
    return (
      <img
        src={src}
        alt={label}
        title={label}
        className={cn('shrink-0 object-cover shadow-sm shadow-violet-500/20', SIZE_CLASSES[size], className)}
      />
    );
  }

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
