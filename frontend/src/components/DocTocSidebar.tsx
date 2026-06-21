import { useState } from 'react';
import { IconChevronsLeft, IconList, IconX } from '@tabler/icons-react';
import { PanelResizeHandle } from '@/components/PanelResizeHandle';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useHorizontalResize } from '@/hooks/useHorizontalResize';
import { cn } from '@/lib/cn';
import {
  PANEL_WIDTH_DEFAULTS,
  PANEL_WIDTH_KEYS,
  PANEL_WIDTH_LIMITS,
} from '@/lib/panelWidths';
import type { TocHeading } from '@/hooks/useTocHeadings';

/* ─── 类型 ─── */

interface DocTocListProps {
  headings: TocHeading[];
  activeId: string | null;
  onHeadingClick: (id: string) => void;
  /** 选中条目后的额外回调（如关闭浮层目录） */
  onAfterNavigate?: () => void;
  className?: string;
}

interface DocTocSidebarProps {
  headings: TocHeading[];
  activeId: string | null;
  onHeadingClick: (id: string) => void;
  /** 无本地记录时的默认折叠状态。 */
  defaultCollapsed?: boolean;
  /** 持久化折叠状态的 localStorage key。 */
  storageKey?: string;
}

interface DocTocOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  headings: TocHeading[];
  activeId: string | null;
  onHeadingClick: (id: string) => void;
}

const TOC_COLLAPSE_LS_KEY = 'finclaw.docDock.tocCollapsed';

function useDocTocWidth() {
  return useHorizontalResize({
    storageKey: PANEL_WIDTH_KEYS.docToc,
    defaultWidth: PANEL_WIDTH_DEFAULTS.docToc,
    ...PANEL_WIDTH_LIMITS.docToc,
  });
}

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

/* ─── 目录列表（侧边栏 / 浮层共用） ─── */

export function DocTocList({
  headings,
  activeId,
  onHeadingClick,
  onAfterNavigate,
  className,
}: DocTocListProps) {
  return (
    <div className={cn('py-1', className)}>
      {headings.map((h) => (
        <button
          key={h.id}
          type="button"
          className={cn(
            'doc-dock-toc-item',
            activeId === h.id && 'doc-dock-toc-item--active',
          )}
          style={{ paddingLeft: (h.level - 1) * 12 + 12 }}
          onClick={() => {
            onHeadingClick(h.id);
            onAfterNavigate?.();
          }}
          title={h.text}
        >
          {h.text}
        </button>
      ))}
    </div>
  );
}

/* ─── 浮层目录：不占正文宽度 ─── */

export function DocTocOverlay({
  open,
  onOpenChange,
  headings,
  activeId,
  onHeadingClick,
}: DocTocOverlayProps) {
  const { width, handleProps } = useDocTocWidth();

  return (
    <div
      className={cn('doc-dock-toc-overlay', open && 'doc-dock-toc-overlay--open')}
      aria-hidden={!open}
    >
      <button
        type="button"
        className="doc-dock-toc-overlay-backdrop"
        aria-label="关闭目录"
        onClick={() => onOpenChange(false)}
      />
      <nav className="doc-dock-toc-overlay-panel" aria-label="目录" style={{ width }}>
        <div className="doc-dock-toc-header">
          <span>目录</span>
          <button
            type="button"
            className="doc-dock-toc-collapse"
            onClick={() => onOpenChange(false)}
            title="关闭目录"
            aria-label="关闭目录"
          >
            <IconX className="size-3.5" />
          </button>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <DocTocList
            headings={headings}
            activeId={activeId}
            onHeadingClick={onHeadingClick}
            onAfterNavigate={() => onOpenChange(false)}
          />
        </ScrollArea>
        <PanelResizeHandle {...handleProps} />
      </nav>
    </div>
  );
}

/* ─── 桌面侧边栏目录 ─── */

export function DocTocSidebar({
  headings,
  activeId,
  onHeadingClick,
  defaultCollapsed = false,
  storageKey = TOC_COLLAPSE_LS_KEY,
}: DocTocSidebarProps) {
  const [collapsed, setCollapsed] = useState<boolean>(() => readCollapsed(storageKey, defaultCollapsed));
  const { width, handleProps } = useDocTocWidth();

  const toggle = (next: boolean) => {
    setCollapsed(next);
    try {
      localStorage.setItem(storageKey, next ? '1' : '0');
    } catch {
      // ignore quota
    }
  };

  if (collapsed) {
    return (
      <div className="doc-dock-toc-rail">
        <button
          type="button"
          className="doc-dock-toc-expand"
          onClick={() => toggle(false)}
          title="展开目录"
          aria-label="展开目录"
        >
          <IconList className="size-4" />
        </button>
        <span className="doc-dock-toc-rail-label">目录</span>
      </div>
    );
  }

  return (
    <nav className="doc-dock-toc-sidebar relative" aria-label="目录" style={{ width }}>
      <div className="doc-dock-toc-inner">
        <div className="doc-dock-toc-header">
          <span>目录</span>
          <button
            type="button"
            className="doc-dock-toc-collapse"
            onClick={() => toggle(true)}
            title="收起目录"
            aria-label="收起目录"
          >
            <IconChevronsLeft className="size-3.5" />
          </button>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <DocTocList headings={headings} activeId={activeId} onHeadingClick={onHeadingClick} />
        </ScrollArea>
      </div>
      <PanelResizeHandle {...handleProps} />
    </nav>
  );
}
