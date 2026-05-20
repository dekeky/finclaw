import {
  IconChartAreaLine,
  IconChevronRight,
  IconMessageCircle,
  IconNews,
  IconPuzzle,
  IconRobot,
  IconStar,
} from '@tabler/icons-react';
import { Link, useLocation } from 'react-router-dom';
import * as React from 'react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuBadge,
  SidebarRail,
  SidebarFooter,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar';

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

interface NavGroup {
  label: string;
  defaultOpen: boolean;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: '开始',
    defaultOpen: true,
    items: [
      { title: '对话', url: '/chat', icon: IconMessageCircle },
    ],
  },
  {
    label: '能力与数据',
    defaultOpen: true,
    items: [
      { title: '金融资讯', url: '/news', icon: IconNews },
      { title: 'Agent', url: '/agents', icon: IconRobot },
      { title: '量化回测', url: '/backtest', icon: IconChartAreaLine, badge: 'Soon' },
      { title: 'SkillHub', url: '/skill', icon: IconPuzzle, badge: 'Soon' },
    ],
  },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation();
  const currentPath = location.pathname;
  const { isMobile, setOpenMobile } = useSidebar();

  const handleNavItemClick = React.useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, setOpenMobile]);

  return (
    <Sidebar
      {...props}
      className="bg-background border-r-border/20 border-r pt-3"
      collapsible="icon"
    >
      <SidebarContent className="bg-background">
        {NAV_GROUPS.map((group) => (
          <Collapsible
            key={group.label}
            defaultOpen={group.defaultOpen}
            className="group/collapsible mb-1"
          >
            <SidebarGroup className="px-2 py-0">
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60">
                  <span className="text-xs font-medium text-muted-foreground/70">
                    {group.label}
                  </span>
                  <IconChevronRight className="size-3.5 opacity-50 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent className="pt-1">
                  <SidebarMenu>
                    {group.items.map((item) => {
                      const isActive =
                        currentPath === item.url ||
                        (item.url !== '/' && currentPath.startsWith(`${item.url}/`));
                      return (
                        <SidebarMenuItem key={item.title}>
                          <SidebarMenuButton
                            asChild
                            isActive={isActive}
                            onClick={handleNavItemClick}
                            tooltip={item.title}
                            className={`h-9 px-3 ${isActive ? 'bg-accent/80 text-foreground font-medium' : 'text-muted-foreground hover:bg-muted/60'}`}
                          >
                            <Link to={item.url}>
                              <item.icon
                                className={`size-4 ${isActive ? 'opacity-100' : 'opacity-60'}`}
                              />
                              <span className={isActive ? 'opacity-100' : 'opacity-80'}>
                                {item.title}
                              </span>
                            </Link>
                          </SidebarMenuButton>
                          {item.badge && (
                            <SidebarMenuBadge className="h-auto min-w-0 rounded-full border border-border/60 bg-muted/40 px-1.5 py-0 text-[10px] font-normal text-muted-foreground">
                              {item.badge}
                            </SidebarMenuBadge>
                          )}
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        ))}
      </SidebarContent>

      <SidebarFooter className="px-2">
        <SidebarSeparator />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={currentPath === '/news'}
              tooltip="我的待读"
              className={`h-9 px-3 ${currentPath === '/news' ? 'bg-accent/80 text-foreground font-medium' : 'text-muted-foreground hover:bg-muted/60'}`}
            >
              <Link to="/news">
                <IconStar className={`size-4 ${currentPath === '/news' ? 'opacity-100' : 'opacity-60'}`} />
                <span>我的待读</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="px-2 py-1 text-[10px] font-mono tracking-widest text-muted-foreground/50">
          Finclaw v0.1
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
