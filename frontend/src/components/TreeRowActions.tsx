import type { ReactNode } from 'react';
import { IconDownload, IconLink, IconTrash } from '@tabler/icons-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';

/** 与文档/Skills 树行右侧操作区同宽，保证操作图标纵向对齐。 */
export const TREE_ACTION_COL_CLASS = 'w-[5.25rem]';
/** RowShell 网格第二列宽度，须与 TREE_ACTION_COL_CLASS 一致。 */
export const TREE_ACTION_GRID_COL_CLASS = 'grid-cols-[minmax(0,1fr)_5.25rem]';

const actionBtnClass =
  'flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground';

const deleteBtnClass = cn(actionBtnClass, 'hover:bg-destructive/10 hover:text-destructive');

function TreeRowActionButton({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(actionBtnClass, className)}
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          aria-label={label}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/** 文档 / Skills 资产树行右侧：元信息 + 分享 + 下载 + 删除。 */
export function TreeRowActions({
  meta,
  onShare,
  onDownload,
  onDelete,
  deleteTitle,
  downloadTitle = '下载',
  shareTitle = '复制分享链接',
}: {
  /** 行尾元信息（如文件大小）。 */
  meta?: string;
  onShare?: () => void;
  onDownload?: () => void;
  onDelete?: () => void;
  deleteTitle: string;
  downloadTitle?: string;
  shareTitle?: string;
}) {
  if (!onShare && !onDownload && !onDelete) {
    if (!meta) return <span className={cn(TREE_ACTION_COL_CLASS, 'shrink-0')} aria-hidden />;
    return (
      <span
        className={cn(
          TREE_ACTION_COL_CLASS,
          'shrink-0 truncate text-right text-[10px] tabular-nums text-muted-foreground',
        )}
      >
        {meta}
      </span>
    );
  }

  return (
    <div
      className={cn(
        TREE_ACTION_COL_CLASS,
        'flex h-5 shrink-0 items-center justify-end gap-0.5',
      )}
    >
      {meta && (
        <span className="min-w-0 flex-1 truncate text-right text-[10px] tabular-nums text-muted-foreground">
          {meta}
        </span>
      )}
      {onShare && (
        <TreeRowActionButton label={shareTitle} onClick={onShare}>
          <IconLink className="size-3.5" stroke={1.75} />
        </TreeRowActionButton>
      )}
      {onDownload && (
        <TreeRowActionButton label={downloadTitle} onClick={onDownload}>
          <IconDownload className="size-3.5" stroke={1.75} />
        </TreeRowActionButton>
      )}
      {onDelete && (
        <TreeRowActionButton label={deleteTitle} onClick={onDelete} className={deleteBtnClass}>
          <IconTrash className="size-3.5" stroke={1.75} />
        </TreeRowActionButton>
      )}
    </div>
  );
}
