import { IconMessagePlus, IconX } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { TOOLBAR_ICON_BUTTON_CLASS } from '@/lib/toolbarButton';
import { cn } from '@/lib/cn';
import type { ChatTab } from '@/lib/chatTabs';

interface ConversationTabsProps {
  tabs: ChatTab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  /** 正在生成回复的标签 id（显示脉冲圆点） */
  busyIds?: Set<string>;
}

/**
 * Cursor 式对话标签条：可横向滚动的标签列表 +「新对话」按钮。
 * 自身不带边框与内边距，由所在的一行（与文档 / 历史按钮同行）统一提供。
 */
export function ConversationTabs({
  tabs,
  activeId,
  onSelect,
  onClose,
  onNew,
  busyIds,
}: ConversationTabsProps) {
  return (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          const busy = busyIds?.has(tab.id) ?? false;
          return (
            <div
              key={tab.id}
              className={cn(
                'group/tab flex h-8 w-[190px] shrink-0 items-center gap-2 rounded-lg border pl-3 pr-1.5 text-[12px] transition-colors',
                active
                  ? 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-200'
                  : 'border-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground',
              )}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                onClick={() => onSelect(tab.id)}
                title={tab.title || '新对话'}
              >
                {busy && (
                  <span className="inline-block size-1.5 shrink-0 animate-pulse rounded-full bg-violet-500" />
                )}
                <span className="truncate">{tab.title || '新对话'}</span>
              </button>
              <button
                type="button"
                aria-label="关闭对话"
                title="关闭"
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-foreground/10 hover:text-foreground',
                  active ? 'opacity-100' : 'opacity-0 group-hover/tab:opacity-100 focus-visible:opacity-100',
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.id);
                }}
              >
                <IconX className="size-3.5" stroke={2.2} />
              </button>
            </div>
          );
        })}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={cn(TOOLBAR_ICON_BUTTON_CLASS, 'shrink-0')}
        aria-label="新对话"
        title="新对话"
        onClick={onNew}
      >
        <IconMessagePlus className="size-[18px]" stroke={1.75} />
      </Button>
    </>
  );
}
