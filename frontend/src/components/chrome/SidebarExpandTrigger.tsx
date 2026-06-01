import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { cn } from '@/lib/cn';

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
      className={cn('size-8 shrink-0 text-muted-foreground', className)}
      title="打开侧栏"
    />
  );
}
