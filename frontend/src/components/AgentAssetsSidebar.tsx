import type { ReactNode } from 'react';
import { IconX } from '@tabler/icons-react';
import { cn } from '@/lib/cn';

export type AgentAssetTab = 'docs' | 'skills';

interface AgentAssetsSidebarProps {
  assetTab: AgentAssetTab;
  onAssetTabChange: (tab: AgentAssetTab) => void;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

const ASSET_TABS: { id: AgentAssetTab; label: string }[] = [
  { id: 'docs', label: '文档' },
  { id: 'skills', label: 'Skills' },
];

export function AgentAssetsSidebar({
  assetTab,
  onAssetTabChange,
  onClose,
  children,
  className,
}: AgentAssetsSidebarProps) {
  return (
    <aside
      className={cn(
        'flex h-full min-h-0 w-48 shrink-0 flex-col border-r border-border/50 bg-muted/20 sm:w-56 lg:w-60',
        className,
      )}
      aria-label="Agent 资产"
    >
      <div className="shrink-0 border-b border-border/40 px-2 pt-2">
        <div className="flex items-center justify-between gap-1 px-1 pb-1.5">
          <span className="text-xs font-medium text-muted-foreground/80">Agent 资产</span>
          <button
            type="button"
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-violet-500/10 hover:text-violet-600 dark:hover:text-violet-300"
            onClick={onClose}
            title="收起 Agent 资产"
            aria-label="收起 Agent 资产"
          >
            <IconX className="size-3.5" stroke={1.75} />
          </button>
        </div>
        <div className="flex gap-1 pb-1.5">
          {ASSET_TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => onAssetTabChange(id)}
              className={cn(
                'flex-1 rounded-md px-2 py-1 text-xs transition-colors',
                assetTab === id
                  ? 'bg-violet-500/15 font-medium text-violet-600 dark:text-violet-300'
                  : 'text-muted-foreground hover:bg-muted/60',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </aside>
  );
}
