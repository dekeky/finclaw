import { useState, useEffect, type ReactNode } from 'react';
import { IconChevronsLeft, IconFolder } from '@tabler/icons-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';

const ASSETS_COLLAPSE_LS_KEY = 'finclaw.chat.assetsCollapsed';

/** 展开侧栏宽度（仅桌面端展开时用于给聊天区留白）。 */
export const AGENT_ASSETS_EXPANDED_INSET = 'md:pl-56 lg:pl-60';
const DESKTOP_WIDTH = 'w-56 lg:w-60';
const RAIL_WIDTH = 'w-9';

function readCollapsed(storageKey: string, defaultCollapsed: boolean): boolean {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === '1') return true;
    if (stored === '0') return false;
  } catch {
    // ignore quota / private mode
  }
  return defaultCollapsed;
}

export type AgentAssetTab = 'docs' | 'skills';

interface AgentAssetsSidebarProps {
  assetTab: AgentAssetTab;
  onAssetTabChange: (tab: AgentAssetTab) => void;
  children: ReactNode;
  /** 桌面端折叠状态变化（移动端恒为 true，Sheet 不占主布局）。 */
  onCollapsedChange?: (collapsed: boolean) => void;
  /** 无本地记录时的默认折叠状态。 */
  defaultCollapsed?: boolean;
  /** 持久化折叠状态的 localStorage key。 */
  storageKey?: string;
}

const ASSET_TABS: { id: AgentAssetTab; label: string }[] = [
  { id: 'docs', label: '文档' },
  { id: 'skills', label: 'Skills' },
];

function AssetsHeader({
  assetTab,
  onAssetTabChange,
  onCollapse,
  showCollapse,
}: {
  assetTab: AgentAssetTab;
  onAssetTabChange: (tab: AgentAssetTab) => void;
  onCollapse?: () => void;
  showCollapse?: boolean;
}) {
  return (
    <div className="shrink-0 border-b border-border/40 px-2 pt-2">
      <div className="flex items-center justify-between gap-1 px-1 pb-1.5">
        <span className="text-xs font-medium text-muted-foreground/80">Agent 资产</span>
        {showCollapse && onCollapse && (
          <button
            type="button"
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-violet-500/10 hover:text-violet-600 dark:hover:text-violet-300"
            onClick={onCollapse}
            title="收起 Agent 资产"
            aria-label="收起 Agent 资产"
          >
            <IconChevronsLeft className="size-3.5" stroke={1.75} />
          </button>
        )}
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
  );
}

function CollapsedRail({ onExpand, className }: { onExpand: () => void; className?: string }) {
  return (
    <aside
      className={cn(
        'flex flex-col items-center gap-2 border-r border-border/50 bg-muted/20 pt-2',
        RAIL_WIDTH,
        className,
      )}
      aria-label="Agent 资产"
    >
      <button
        type="button"
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-violet-500/10 hover:text-violet-600 dark:hover:text-violet-300"
        onClick={onExpand}
        title="展开 Agent 资产"
        aria-label="展开 Agent 资产"
      >
        <IconFolder className="size-4" stroke={1.75} />
      </button>
      <span
        className="select-none text-[10px] tracking-widest text-muted-foreground/80 [writing-mode:vertical-rl]"
        aria-hidden
      >
        资产
      </span>
    </aside>
  );
}

export function AgentAssetsSidebar({
  assetTab,
  onAssetTabChange,
  children,
  onCollapsedChange,
  defaultCollapsed = true,
  storageKey = ASSETS_COLLAPSE_LS_KEY,
}: AgentAssetsSidebarProps) {
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState<boolean>(() => readCollapsed(storageKey, defaultCollapsed));
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    onCollapsedChange?.(isMobile ? true : collapsed);
  }, [collapsed, isMobile, onCollapsedChange]);

  const persistCollapsed = (next: boolean) => {
    setCollapsed(next);
    try {
      localStorage.setItem(storageKey, next ? '1' : '0');
    } catch {
      // ignore quota
    }
  };

  const expandDesktop = () => persistCollapsed(false);
  const collapseDesktop = () => persistCollapsed(true);

  const expandMobile = () => setMobileOpen(true);
  const collapseMobile = () => setMobileOpen(false);

  const panelBody = (
    <>
      <AssetsHeader
        assetTab={assetTab}
        onAssetTabChange={onAssetTabChange}
        onCollapse={isMobile ? collapseMobile : collapseDesktop}
        showCollapse
      />
      {children}
    </>
  );

  if (isMobile) {
    return (
      <>
        <CollapsedRail
          onExpand={expandMobile}
          className="absolute inset-y-0 left-0 z-20"
        />
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="flex w-[min(100vw-1rem,18rem)] flex-col gap-0 p-0 sm:max-w-xs">
            <SheetHeader className="sr-only">
              <SheetTitle>Agent 资产</SheetTitle>
              <SheetDescription>浏览 Agent 文档与 Skills</SheetDescription>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/20">{panelBody}</div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  if (collapsed) {
    return (
      <CollapsedRail
        onExpand={expandDesktop}
        className="absolute inset-y-0 left-0 z-20"
      />
    );
  }

  return (
    <aside
      className={cn(
        'absolute inset-y-0 left-0 z-20 flex flex-col border-r border-border/50 bg-muted/20',
        DESKTOP_WIDTH,
      )}
    >
      {panelBody}
    </aside>
  );
}
