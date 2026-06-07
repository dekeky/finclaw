import { IconFileDescription, IconFolder, IconLoader2 } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { filePaddingLeft, rowPaddingLeft, TreeChevron, TreeChevronSlot } from '@/components/asset-tree-layout';
import { TreeRowActions, TREE_ACTION_COL_CLASS } from '@/components/TreeRowActions';

export function isMarkdownFile(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown');
}

export function fileIconClass(name: string): string {
  return isMarkdownFile(name) ? 'text-violet-500/70' : 'text-muted-foreground';
}

function RowShell({
  actions,
  children,
}: {
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="group/row grid w-full min-w-0 grid-cols-[minmax(0,1fr)_2.75rem] items-center">
      {children}
      {actions ?? <span className={cn(TREE_ACTION_COL_CLASS, 'shrink-0')} aria-hidden />}
    </div>
  );
}

/** 目录行触发按钮（与 DocFileTree 一致）。 */
export function AssetTreeDirButton({
  name,
  depth,
  expanded,
  loading,
  className,
  ...props
}: {
  name: string;
  depth: number;
  expanded: boolean;
  loading?: boolean;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'flex min-w-0 items-center gap-1 overflow-hidden rounded-md py-1.5 pr-1 text-left transition-colors hover:bg-muted/80',
        className,
      )}
      style={{ paddingLeft: rowPaddingLeft(depth) }}
      {...props}
    >
      <TreeChevron open={expanded} />
      <IconFolder className="size-3.5 shrink-0 text-amber-500/70" />
      <span className="min-w-0 flex-1 truncate text-xs text-foreground/90">{name}</span>
      {loading && <IconLoader2 className="size-3 shrink-0 animate-spin text-muted-foreground/50" />}
    </button>
  );
}

/** 文件行（与 DocFileTree 一致）。 */
export function AssetTreeFileRow({
  name,
  depth,
  selected,
  title,
  meta,
  onClick,
  onDelete,
  deleteTitle = '删除文件',
}: {
  name: string;
  depth: number;
  selected?: boolean;
  title?: string;
  meta?: string;
  onClick?: () => void;
  onDelete?: () => void;
  deleteTitle?: string;
}) {
  return (
    <RowShell
      actions={<TreeRowActions meta={meta} onDelete={onDelete} deleteTitle={deleteTitle} />}
    >
      <button
        type="button"
        disabled={!onClick}
        className={cn(
          'flex min-w-0 items-center gap-1 overflow-hidden rounded-md py-1.5 pr-1 text-left transition-colors',
          onClick ? 'cursor-pointer hover:bg-muted/80' : 'cursor-default',
          selected && 'bg-accent/80',
        )}
        style={{ paddingLeft: filePaddingLeft(depth) }}
        onClick={onClick}
        title={title ?? name}
      >
        <TreeChevronSlot />
        <IconFileDescription className={cn('size-3.5 shrink-0', fileIconClass(name))} />
        <span className="min-w-0 flex-1 truncate text-xs text-foreground/90">{name}</span>
      </button>
    </RowShell>
  );
}

/** 目录行外壳：左侧 CollapsibleTrigger，右侧操作区。 */
export function AssetTreeDirRow({
  trigger,
  meta,
  onDelete,
  deleteTitle = '删除文件夹',
}: {
  trigger: React.ReactNode;
  meta?: string;
  onDelete?: () => void;
  deleteTitle?: string;
}) {
  return (
    <RowShell
      actions={
        <TreeRowActions meta={meta} onDelete={onDelete} deleteTitle={deleteTitle} />
      }
    >
      {trigger}
    </RowShell>
  );
}

export { RowShell as AssetTreeRowShell };
