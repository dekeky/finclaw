import { useState } from 'react';
import { IconChevronsLeft, IconList } from '@tabler/icons-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/cn';
import type { TocHeading } from '@/hooks/useTocHeadings';

/* ─── 类型 ─── */

interface DocTocSidebarProps {
  headings: TocHeading[];
  activeId: string | null;
  onHeadingClick: (id: string) => void;
  /** 无本地记录时的默认折叠状态。 */
  defaultCollapsed?: boolean;
  /** 持久化折叠状态的 localStorage key。 */
  storageKey?: string;
}

const TOC_COLLAPSE_LS_KEY = 'finclaw.docDock.tocCollapsed';

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

/* ─── 组件 ─── */

export function DocTocSidebar({
  headings,
  activeId,
  onHeadingClick,
  defaultCollapsed = false,
  storageKey = TOC_COLLAPSE_LS_KEY,
}: DocTocSidebarProps) {
  const [collapsed, setCollapsed] = useState<boolean>(() => readCollapsed(storageKey, defaultCollapsed));

  const toggle = (next: boolean) => {
    setCollapsed(next);
    try {
      localStorage.setItem(storageKey, next ? '1' : '0');
    } catch {
      // ignore quota
    }
  };

  // 收起态：仅保留一条窄轨，带展开按钮
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
    <nav className="doc-dock-toc-sidebar" aria-label="目录">
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
          <div className="py-1">
            {headings.map((h) => (
              <button
                key={h.id}
                type="button"
                className={cn(
                  'doc-dock-toc-item',
                  activeId === h.id && 'doc-dock-toc-item--active',
                )}
                style={{ paddingLeft: (h.level - 1) * 12 + 12 }}
                onClick={() => onHeadingClick(h.id)}
                title={h.text}
              >
                {h.text}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>
    </nav>
  );
}
