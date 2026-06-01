import { Outlet } from 'react-router-dom';
import { AppSidebar } from '../components/AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { SidebarInset } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from 'sonner';

export function AppLayout() {
  return (
    <TooltipProvider>
      <SidebarProvider className="flex h-dvh w-full flex-row overflow-hidden">
        <AppSidebar />
        <SidebarInset className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-[#f7f7f8] dark:bg-background">
          <Outlet />
        </SidebarInset>
        <Toaster position="bottom-center" />
      </SidebarProvider>
    </TooltipProvider>
  );
}
