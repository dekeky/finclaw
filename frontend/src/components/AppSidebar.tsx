import {
  IconChartAreaLine,
  IconNews,
  IconPuzzle,
  IconRobot,
} from '@tabler/icons-react';
import { Link, useLocation } from 'react-router-dom';
import * as React from 'react';

import { FinclawMark } from '@/components/FinclawMark';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { SidebarLogoutButton, UserMenu } from '@/components/chrome/UserMenu';
import { cn } from '@/lib/cn';

const MORE_NAV = [
  { title: 'Agent', url: '/agents', icon: IconRobot },
  { title: '金融资讯', url: '/news', icon: IconNews },
  { title: '量化回测', url: '/backtest', icon: IconChartAreaLine },
  { title: 'SkillHub', url: '/skill', icon: IconPuzzle },
] as const;

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation();
  const currentPath = location.pathname;
  const { isMobile, setOpenMobile } = useSidebar();

  const closeMobile = React.useCallback(() => {
    if (isMobile) setOpenMobile(false);
  }, [isMobile, setOpenMobile]);

  const isChatRoute = currentPath === '/chat' || currentPath.startsWith('/chat/');

  return (
    <Sidebar
      {...props}
      className="border-r border-sidebar-border/70 bg-sidebar"
      collapsible="offcanvas"
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center px-2 pt-3 pb-2">
          <SidebarTrigger className="size-8 text-muted-foreground" />
        </div>

        <SidebarContent className="min-h-0 flex-1 gap-0 overflow-auto px-2">
          {/* 主导航 */}
          <SidebarMenu className="gap-0.5">
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={isChatRoute}
                onClick={closeMobile}
                className={cnYuanbaoNav(isChatRoute)}
              >
                <Link to="/chat">
                  <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-500/15">
                    <FinclawMark variant="mark" size={18} decorative className="rounded-full" />
                  </span>
                  <span>Finclaw</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>

          {/* 更多能力 */}
          <div className="mt-3 px-2 pb-1">
            <p className="text-[11px] font-medium text-muted-foreground/50">更多</p>
          </div>
          <SidebarMenu className="gap-0.5">
            {MORE_NAV.map((item) => {
              const active =
                currentPath === item.url || currentPath.startsWith(`${item.url}/`);
              return (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    isActive={active}
                    onClick={closeMobile}
                    className={cnYuanbaoNav(active, true)}
                  >
                    <Link to={item.url}>
                      <item.icon className="size-4 opacity-60" />
                      <span className="text-[13px]">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter className="shrink-0 gap-1 border-t border-sidebar-border/60 px-3 py-3">
          <div className="flex items-center justify-end">
            <UserMenu />
          </div>
          <SidebarLogoutButton />
        </SidebarFooter>
      </div>
      <SidebarRail />
    </Sidebar>
  );
}

function cnYuanbaoNav(isActive: boolean, compact?: boolean) {
  return cn(
    'h-9 rounded-xl text-[14px] transition-colors',
    compact && 'h-8 text-muted-foreground',
    isActive
      ? 'bg-background font-medium text-foreground shadow-none ring-0'
      : 'text-foreground/80 hover:bg-background/60',
  );
}
