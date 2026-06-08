import {
  IconBuildingStore,
  IconChartAreaLine,
  IconNews,
  IconRobot,
  IconBrandWechat,
} from '@tabler/icons-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import * as React from 'react';
import { useNavigationGuard } from '../state/navigationGuard';

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
import { SidebarUserBlock } from '@/components/chrome/UserMenu';
import { cn } from '@/lib/cn';

const AGENT_NAV = [
  { title: 'Agent', url: '/agents', icon: IconRobot },
  { title: 'Agent 市场', url: '/agents/market', icon: IconBuildingStore },
] as const;

const MORE_NAV = [
  { title: '金融资讯', url: '/news', icon: IconNews },
  { title: '微信', url: '/weixin', icon: IconBrandWechat },
  { title: '量化回测', url: '/backtest', icon: IconChartAreaLine },
] as const;

function isNavActive(currentPath: string, url: string): boolean {
  if (url === '/chat') {
    return currentPath === '/chat' || currentPath.startsWith('/chat/');
  }
  if (url === '/agents') {
    return currentPath === '/agents';
  }
  return currentPath === url || currentPath.startsWith(`${url}/`);
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const { isMobile, setOpenMobile } = useSidebar();
  const { confirmNavigation } = useNavigationGuard();

  const closeMobile = React.useCallback(() => {
    if (isMobile) setOpenMobile(false);
  }, [isMobile, setOpenMobile]);

  const tryNavigate = React.useCallback(
    async (e: React.MouseEvent, url: string) => {
      if (isNavActive(currentPath, url)) {
        closeMobile();
        return;
      }
      e.preventDefault();
      if (await confirmNavigation()) {
        closeMobile();
        navigate(url);
      }
    },
    [closeMobile, confirmNavigation, currentPath, navigate],
  );

  const isChatRoute = isNavActive(currentPath, '/chat');

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
                <Link to="/chat" onClick={(e) => void tryNavigate(e, '/chat')}>
                  <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-500/15">
                    <FinclawMark variant="mark" size={18} decorative className="rounded-full" />
                  </span>
                  <span>Finclaw</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>

          {/* Agent */}
          <div className="mt-3 px-2 pb-1">
            <p className="text-[11px] font-medium text-muted-foreground/50">Agent</p>
          </div>
          <SidebarMenu className="gap-0.5">
            {AGENT_NAV.map((item) => {
              const active = isNavActive(currentPath, item.url);
              return (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    isActive={active}
                    onClick={closeMobile}
                    className={cnYuanbaoNav(active, true)}
                  >
                    <Link to={item.url} onClick={(e) => void tryNavigate(e, item.url)}>
                      <item.icon className="size-4 opacity-60" />
                      <span className="text-[13px]">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>

          {/* 更多能力 */}
          <div className="mt-3 px-2 pb-1">
            <p className="text-[11px] font-medium text-muted-foreground/50">更多</p>
          </div>
          <SidebarMenu className="gap-0.5">
            {MORE_NAV.map((item) => {
              const active = isNavActive(currentPath, item.url);
              return (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    isActive={active}
                    onClick={closeMobile}
                    className={cnYuanbaoNav(active, true)}
                  >
                    <Link to={item.url} onClick={(e) => void tryNavigate(e, item.url)}>
                      <item.icon className="size-4 opacity-60" />
                      <span className="text-[13px]">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter className="shrink-0 border-t border-sidebar-border/60 p-1">
          <SidebarUserBlock />
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
