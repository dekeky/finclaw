import type { ReactNode } from 'react';
import { IconInfoCircle, IconX } from '@tabler/icons-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PanelResizeHandle } from '@/components/PanelResizeHandle';
import { useHorizontalResize } from '@/hooks/useHorizontalResize';
import { cn } from '@/lib/cn';
import {
  PANEL_WIDTH_DEFAULTS,
  PANEL_WIDTH_KEYS,
  PANEL_WIDTH_LIMITS,
} from '@/lib/panelWidths';

interface AccountDocsSidebarProps {
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

/** 账户级共享「文档」侧栏：显示账户 docs 目录，所有 Agent 可见、可编辑。 */
export function AccountDocsSidebar({
  onClose,
  children,
  className,
}: AccountDocsSidebarProps) {
  const { width, handleProps } = useHorizontalResize({
    storageKey: PANEL_WIDTH_KEYS.agentAssets,
    defaultWidth: PANEL_WIDTH_DEFAULTS.agentAssets,
    ...PANEL_WIDTH_LIMITS.agentAssets,
  });

  return (
    <aside
      className={cn(
        'relative flex h-full min-h-0 shrink-0 flex-col border-r border-border/50 bg-muted/20',
        className,
      )}
      style={{ width }}
      aria-label="文档"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/40 px-3 py-2">
        <div className="flex min-w-0 items-center gap-1">
          <span className="text-xs font-semibold text-foreground/80">文档</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/80 transition-colors hover:text-foreground"
                aria-label="文档说明"
              >
                <IconInfoCircle className="size-3" stroke={2} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">账户内 Agent 共享</TooltipContent>
          </Tooltip>
        </div>
        <button
          type="button"
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-violet-500/10 hover:text-violet-600 dark:hover:text-violet-300"
          onClick={onClose}
          title="收起文档"
          aria-label="收起文档"
        >
          <IconX className="size-3.5" stroke={1.75} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      <PanelResizeHandle {...handleProps} />
    </aside>
  );
}
