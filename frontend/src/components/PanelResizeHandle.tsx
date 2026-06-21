import type { HorizontalResizeHandleProps } from '@/hooks/useHorizontalResize';
import { cn } from '@/lib/cn';

interface PanelResizeHandleProps extends HorizontalResizeHandleProps {
  className?: string;
  /** Handle sits on the right edge of a left panel by default. */
  side?: 'left' | 'right';
}

export function PanelResizeHandle({
  className,
  side = 'right',
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: PanelResizeHandleProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="调整面板宽度"
      className={cn(
        'absolute top-0 z-30 h-full w-2 touch-none select-none',
        side === 'right' ? 'right-0 cursor-col-resize' : 'left-0 cursor-col-resize',
        'after:absolute after:inset-y-0 after:w-px after:bg-transparent after:transition-colors',
        side === 'right' ? 'after:right-1/2' : 'after:left-1/2',
        'hover:after:bg-border/80 active:after:bg-violet-500/50',
        className,
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    />
  );
}
