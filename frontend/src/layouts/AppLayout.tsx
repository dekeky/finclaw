import { Outlet } from 'react-router-dom';
import { AppHeader } from '../components/chrome/AppHeader';
import { AppSidebar } from '../components/AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { SidebarInset } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from 'sonner';

export function AppLayout() {
  return (
    <TooltipProvider>
      <SidebarProvider className="flex h-dvh flex-col overflow-hidden">
        <AppHeader />

        <div className="flex flex-1 overflow-hidden">
          <AppSidebar />
          <SidebarInset>
            <Outlet />
          </SidebarInset>
        </div>

        <Toaster position="bottom-center" />
      </SidebarProvider>
    </TooltipProvider>
  );
}
