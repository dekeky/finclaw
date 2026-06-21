import type { HorizontalResizeHandleProps } from '@/hooks/useHorizontalResize';
import { cn } from '@/lib/cn';

interface PanelResizeHandleProps extends HorizontalResizeHandleProps {
  className?: string;
  /** Handle sits on the right edge of a left panel by default. */
  side?: 'left' | 'right';
  /** When false, handle occupies layout space instead of overlaying panel content. */
  overlay?: boolean;
}

export function PanelResizeHandle({
  className,
  side = 'right',
  overlay = true,
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
        'w-2 shrink-0 touch-none select-none cursor-col-resize',
        overlay
          ? cn('absolute top-0 z-30 h-full', side === 'right' ? 'right-0' : 'left-0')
          : 'relative self-stretch',
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
