import type { MouseEvent, ReactNode } from 'react';
import { IconMessageCircle, IconTrash } from '@tabler/icons-react';
import { AgentAvatar } from '@/components/AgentAvatar';
import {
  formatAbsoluteTime,
  formatGalleryTime,
  galleryShellClassName,
} from '@/components/strategy/strategyGallery';
import { cn } from '@/lib/cn';
import { PRIMARY_LIST_ITEM_SELECTED_CLASS } from '@/lib/primaryButton';

type AgentGalleryTileProps = {
  title: string;
  subtitle?: string;
  metaLeft?: string;
  metaRight?: string;
  updatedAt?: string;
  selected?: boolean;
  onOpen: () => void;
  onChat?: () => void;
  onDelete?: () => void;
  deleting?: boolean;
  /** 右上角角标（与策略卡 platform badge 同槽位）。 */
  corner?: ReactNode;
  avatar?: {
    name: string;
    hasAvatar?: boolean;
    avatarRevision?: number;
  };
};

export function AgentGalleryTile({
  title,
  subtitle,
  metaLeft,
  metaRight,
  updatedAt,
  selected = false,
  onOpen,
  onChat,
  onDelete,
  deleting = false,
  corner,
  avatar,
}: AgentGalleryTileProps) {
  const timeLabel = updatedAt ? formatGalleryTime(updatedAt) : '';
  const absoluteHint = updatedAt ? formatAbsoluteTime(updatedAt) : '';
  const hasActions = Boolean(onChat || onDelete);
  const hasCorner = Boolean(corner || avatar);

  const stop = (event: MouseEvent) => {
    event.stopPropagation();
  };

  return (
    <div
      className={cn(
        galleryShellClassName(),
        selected && PRIMARY_LIST_ITEM_SELECTED_CLASS,
      )}
    >
      <button
        type="button"
        className="flex min-h-[120px] flex-1 flex-col p-4 text-left"
        onClick={onOpen}
      >
        <div
          className={cn(
            'min-w-0',
            hasActions && hasCorner && 'pr-[7.5rem]',
            hasActions && !hasCorner && 'pr-[4.5rem]',
            !hasActions && hasCorner && 'pr-[4.5rem]',
          )}
        >
          <span className="line-clamp-2 text-sm font-medium leading-snug text-foreground" title={title}>
            {title}
          </span>
        </div>
        {subtitle ? (
          <p className="mt-2 line-clamp-2 flex-1 text-xs leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        ) : (
          <div className="flex-1" />
        )}
        <div className="mt-3 flex items-end justify-between gap-2 text-[11px] text-muted-foreground">
          <div className="min-w-0 truncate">
            {metaLeft ? <span>{metaLeft}</span> : null}
            {metaLeft && metaRight ? <span className="mx-1.5 opacity-40">·</span> : null}
            {metaRight ? <span className="tabular-nums">{metaRight}</span> : null}
          </div>
          {timeLabel ? (
            <span className="shrink-0 tabular-nums" title={absoluteHint || undefined}>
              {timeLabel}
            </span>
          ) : null}
        </div>
      </button>

      <div className="absolute right-2.5 top-2.5 flex items-center gap-0.5">
        {hasActions ? (
          <div
            className={cn(
              'flex items-center gap-0.5 opacity-0 transition-opacity',
              'group-hover:opacity-100 focus-within:opacity-100',
            )}
          >
            {onChat ? (
              <button
                type="button"
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={(event) => {
                  stop(event);
                  onChat();
                }}
                title="去对话"
                aria-label={`与 ${title} 对话`}
              >
                <IconMessageCircle className="size-3.5" stroke={1.75} />
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                className={cn(
                  'flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive',
                  deleting && 'pointer-events-none opacity-50',
                )}
                onClick={(event) => {
                  stop(event);
                  onDelete();
                }}
                disabled={deleting}
                title="删除 Agent"
                aria-label={`删除 ${title}`}
              >
                <IconTrash className="size-3.5" stroke={1.75} />
              </button>
            ) : null}
          </div>
        ) : null}
        {corner}
        {avatar ? (
          <AgentAvatar
            name={avatar.name}
            hasAvatar={avatar.hasAvatar}
            avatarRevision={avatar.avatarRevision}
            size="sm"
            className="shrink-0"
          />
        ) : null}
      </div>
    </div>
  );
}
