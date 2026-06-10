import { Outlet } from 'react-router-dom';
import { AppSidebar } from '../components/AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { SidebarInset } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from 'sonner';
import { useHorizontalResize } from '@/hooks/useHorizontalResize';
import {
  PANEL_WIDTH_DEFAULTS,
  PANEL_WIDTH_KEYS,
  PANEL_WIDTH_LIMITS,
} from '@/lib/panelWidths';

export function AppLayout() {
  const sidebarResize = useHorizontalResize({
    storageKey: PANEL_WIDTH_KEYS.appSidebar,
    defaultWidth: PANEL_WIDTH_DEFAULTS.appSidebar,
    ...PANEL_WIDTH_LIMITS.appSidebar,
  });

  return (
    <TooltipProvider>
      <SidebarProvider
        className="flex h-dvh w-full flex-row overflow-hidden"
        style={{ '--sidebar-width': `${sidebarResize.width}px` } as React.CSSProperties}
        {...(sidebarResize.isDragging ? { 'data-sidebar-resizing': '' } : {})}
      >
        <AppSidebar panelResize={sidebarResize.handleProps} />
        <SidebarInset className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-[#f7f7f8] dark:bg-background">
          <Outlet />
        </SidebarInset>
        <Toaster position="bottom-center" />
      </SidebarProvider>
    </TooltipProvider>
  );
}
