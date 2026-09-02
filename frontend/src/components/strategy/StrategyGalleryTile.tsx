import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { StrategyPlatformBadge } from '@/components/StrategyPlatformField';
import { cn } from '@/lib/cn';
import type { StrategyPlatform } from '@/lib/strategyPlatforms';
import { PRIMARY_LIST_ITEM_SELECTED_CLASS } from '@/lib/primaryButton';
import { formatAbsoluteTime, formatGalleryTime, galleryShellClassName } from '@/components/strategy/strategyGallery';

type StrategyGalleryTileProps = {
  title: string;
  platform: StrategyPlatform | string;
  subtitle?: string;
  metaLeft?: string;
  metaRight?: string;
  updatedAt?: string;
  selected?: boolean;
  editing?: boolean;
  draftName?: string;
  onDraftNameChange?: (value: string) => void;
  onCommitRename?: () => void;
  onRenameKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  onOpen: () => void;
  onRename?: (event: MouseEvent) => void;
  onDelete?: () => void;
  actions?: ReactNode;
};

export function StrategyGalleryTile({
  title,
  platform,
  subtitle,
  metaLeft,
  metaRight,
  updatedAt,
  selected = false,
  editing = false,
  draftName = '',
  onDraftNameChange,
  onCommitRename,
  onRenameKeyDown,
  onOpen,
  onRename,
  onDelete,
  actions,
}: StrategyGalleryTileProps) {
  const timeLabel = updatedAt ? formatGalleryTime(updatedAt) : '';
  const absoluteHint = updatedAt ? formatAbsoluteTime(updatedAt) : '';
  const hasActions = Boolean(onRename || onDelete || actions);

  return (
    <div
      className={cn(
        galleryShellClassName(),
        selected && PRIMARY_LIST_ITEM_SELECTED_CLASS,
      )}
    >
      {editing ? (
        <div className="flex flex-1 flex-col p-4">
          <input
            className="h-8 w-full rounded-md border border-primary bg-background px-2 text-sm font-medium outline-none"
            value={draftName}
            autoFocus
            maxLength={64}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onDraftNameChange?.(event.target.value)}
            onBlur={() => onCommitRename?.()}
            onKeyDown={onRenameKeyDown}
            aria-label="策略名称"
          />
        </div>
      ) : (
        <button
          type="button"
          className="flex min-h-[120px] flex-1 flex-col p-4 text-left"
          onClick={onOpen}
        >
          <div className={cn('min-w-0 pr-[4.5rem]', hasActions && 'pr-[7.5rem]')}>
            <span
              className="line-clamp-2 text-sm font-medium leading-snug text-foreground"
              title={onRename ? '双击重命名' : title}
              onDoubleClick={onRename}
            >
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
      )}

      <div className="absolute right-2.5 top-2.5 flex items-center gap-0.5">
        {hasActions ? (
          <div
            className={cn(
              'flex items-center gap-0.5 opacity-0 transition-opacity',
              'group-hover:opacity-100 focus-within:opacity-100',
              editing && 'opacity-100',
            )}
          >
            {actions}
            {onRename ? (
              <button
                type="button"
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={onRename}
                title="重命名"
                aria-label={`重命名 ${title}`}
              >
                <IconPencil className="size-3.5" stroke={1.75} />
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onClick={onDelete}
                title="删除"
                aria-label={`删除策略 ${title}`}
              >
                <IconTrash className="size-3.5" stroke={1.75} />
              </button>
            ) : null}
          </div>
        ) : null}
        <StrategyPlatformBadge platform={platform} />
      </div>
    </div>
  );
}
