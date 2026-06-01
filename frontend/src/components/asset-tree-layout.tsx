import { cn } from '@/lib/cn';
import { IconChevronRight } from '@tabler/icons-react';

/** 每级缩进（px），侧栏较窄时不宜过大 */
export const TREE_BASE_PAD = 4;
export const TREE_INDENT_STEP = 8;
export const TREE_CHEVRON_W = 'w-3';

export function rowPaddingLeft(depth: number): number {
  return TREE_BASE_PAD + depth * TREE_INDENT_STEP;
}

/** 文件行：图标与父级文件夹图标对齐 */
export function filePaddingLeft(depth: number): number {
  return rowPaddingLeft(Math.max(0, depth - 1));
}

export function TreeChevron({ open }: { open: boolean }) {
  return (
    <IconChevronRight
      className={cn(
        TREE_CHEVRON_W,
        'size-3 shrink-0 text-muted-foreground/50 transition-transform duration-150',
        open && 'rotate-90',
      )}
    />
  );
}

export function TreeChevronSlot() {
  return <span className={cn(TREE_CHEVRON_W, 'inline-flex shrink-0')} aria-hidden />;
}
