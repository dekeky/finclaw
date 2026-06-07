import { IconDownload, IconTrash } from '@tabler/icons-react';
import { cn } from '@/lib/cn';

/** 与文档/Skills 树行右侧操作区同宽，保证操作图标纵向对齐。 */
export const TREE_ACTION_COL_CLASS = 'w-16';

const actionBtnClass =
  'flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground';

const deleteBtnClass = cn(actionBtnClass, 'hover:bg-destructive/10 hover:text-destructive');

/** 文档 / Skills 资产树行右侧：元信息 + 下载 + 删除。 */
export function TreeRowActions({
  meta,
  onDownload,
  onDelete,
  deleteTitle,
  downloadTitle = '下载',
}: {
  /** 行尾元信息（如文件大小）。 */
  meta?: string;
  onDownload?: () => void;
  onDelete?: () => void;
  deleteTitle: string;
  downloadTitle?: string;
}) {
  if (!onDownload && !onDelete) {
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
      {onDownload && (
        <button
          type="button"
          className={actionBtnClass}
          onClick={(e) => {
            e.stopPropagation();
            onDownload();
          }}
          title={downloadTitle}
          aria-label={downloadTitle}
        >
          <IconDownload className="size-3.5" />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          className={deleteBtnClass}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title={deleteTitle}
          aria-label={deleteTitle}
        >
          <IconTrash className="size-3.5" />
        </button>
      )}
    </div>
  );
}
