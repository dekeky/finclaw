import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { cn } from '@/lib/cn';
import { TOOLBAR_ICON_BUTTON_CLASS } from '@/lib/toolbarButton';

type SidebarExpandTriggerProps = {
  className?: string;
};

/** 侧栏收起（或移动端）时在主内容区显示，用于重新打开导航侧栏 */
export function SidebarExpandTrigger({ className }: SidebarExpandTriggerProps) {
  const { state, isMobile } = useSidebar();

  if (!isMobile && state === 'expanded') {
    return null;
  }

  return (
    <SidebarTrigger
      className={cn(TOOLBAR_ICON_BUTTON_CLASS, className)}
      title="打开侧栏"
    />
  );
}
